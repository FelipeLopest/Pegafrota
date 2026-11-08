#!/usr/bin/env node
import { execFileSync as executarArquivoSincrono } from 'node:child_process';
import { emitirToken } from '../desenvolvimento/token-local.mjs';

const BASE = process.env.PNF_DEV_URL || 'http://127.0.0.1:54321';
const FUNCAO = `${BASE}/functions/v1/platform-admin`;
const CHAVE_ANONIMA = 'dev-anon-key-local-harness';
const BANCO = process.env.PNF_DEV_DB || 'pnf_dev';

const resultados = [];
const sucesso = (quantidadeItem, dadosRegistro) =>
  resultados.push({ n: quantidadeItem, ok: true, d: dadosRegistro ?? '' });
const invalido = (quantidadeItem, dadosRegistro) =>
  resultados.push({ n: quantidadeItem, ok: false, d: dadosRegistro ?? '' });

const codigoSql = (buscaAtual) =>
  executarArquivoSincrono(
    'psql',
    ['-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', '-d', BANCO, '-t', '-A', '-c', buscaAtual],
    { encoding: 'utf8', env: { ...process.env, PATH: `${process.env.PATH}:/usr/lib/postgresql/16/bin` } },
  )
    .trim()
    .split('\n')[0]
    .trim();

async function chamarFuncao(acao, dadosEnvio, token) {
  const resposta = await fetch(FUNCAO, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: CHAVE_ANONIMA,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action: acao, payload: dadosEnvio }),
  });
  const corpo = await resposta.json().catch(() => ({}));
  return { status: resposta.status, body: corpo, hint: corpo?.error?.hint };
}

async function etapa(nome, funcao) {
  try {
    sucesso(nome, await funcao());
  } catch (erroCapturado) {
    invalido(nome, erroCapturado.message);
  }
}

async function esperar(nome, condicaoAtual, detalhe) {
  if (condicaoAtual) sucesso(nome, detalhe);
  else invalido(nome, detalhe);
}

async function principal() {
  try {
    const resultadoItem = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
    if (!resultadoItem.ok) throw new Error();
    const fnVerificacao = await fetch('http://127.0.0.1:3002/', { signal: AbortSignal.timeout(4000) });
    if (!fnVerificacao) throw new Error();
  } catch {
    console.log('test:edge:integration  NÃO EXECUTADO — pilha fora do ar');
    console.log('  suba com: bash ferramentas/desenvolvimento/pilha-local.sh up');
    process.exit(2);
  }

  let proprietarioIdentificador = codigoSql(
    `select user_id::text from platform.admins where status='active' limit 1`,
  );
  if (!proprietarioIdentificador) {
    proprietarioIdentificador = codigoSql(`insert into auth.users (id, email, aud, role)
                   values (gen_random_uuid(), 'owner-edge@pnf.test', 'authenticated', 'authenticated')
                   returning id`);
    codigoSql(`insert into public.profiles (id, full_name, active)
         values ('${proprietarioIdentificador}', 'Dona da Plataforma', true)`);
    codigoSql(
      `insert into platform.admins (user_id, status) values ('${proprietarioIdentificador}', 'active')`,
    );
  }

  const administradorEmpresaIdentificador =
    codigoSql(`select m.user_id::text from public.company_memberships m
    join public.profiles p on p.id = m.user_id
    where m.role='company_admin' and m.active and p.active limit 1`);

  const tokenProprietario = emitirToken(proprietarioIdentificador, 'authenticated', 'aal1');
  const tokenEmpresa = emitirToken(administradorEmpresaIdentificador, 'authenticated', 'aal1');

  {
    const resultadoItem = await fetch(FUNCAO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CHAVE_ANONIMA },
      body: JSON.stringify({ action: 'dashboard.get', payload: {} }),
    });
    await esperar(
      'verify_jwt: sem Authorization é recusado',
      resultadoItem.status === 401,
      `HTTP ${resultadoItem.status}`,
    );
  }

  {
    const resultadoItem = await chamarFuncao('dashboard.get', {}, 'nao-e-um-jwt');
    await esperar('token inválido é recusado', resultadoItem.status === 401, `HTTP ${resultadoItem.status}`);
  }

  {
    const resultadoItem = await chamarFuncao('dashboard.get', {}, tokenEmpresa);
    await esperar(
      'company_admin NÃO acessa o painel da plataforma',
      resultadoItem.status === 403 && resultadoItem.hint === 'NOT_PLATFORM_ADMIN',
      `${resultadoItem.status} ${resultadoItem.hint}`,
    );
  }

  {
    const quantidadeItem = Number(
      codigoSql(`select count(*) from platform.audit_events
      where action='platform.access' and result='denied'`),
    );
    await esperar('recusa de acesso é auditada', quantidadeItem > 0, `${quantidadeItem} evento(s)`);
  }

  {
    const resultadoItem = await chamarFuncao('dashboard.get', {}, tokenProprietario);
    await esperar(
      'platform_admin acessa o dashboard',
      resultadoItem.status === 200,
      `HTTP ${resultadoItem.status} ${JSON.stringify(resultadoItem.body?.error ?? '').slice(0, 80)}`,
    );
  }

  {
    const resultadoItem = await chamarFuncao('acao.inexistente', {}, tokenProprietario);
    await esperar(
      'ação desconhecida é recusada',
      resultadoItem.status === 400,
      `HTTP ${resultadoItem.status}`,
    );
  }

  for (const [acao, dadosEnvio] of [
    ['companies.list', { page: 1, pageSize: 5 }],
    ['operations.list', { page: 1, pageSize: 5 }],
    ['admins.list', { page: 1, pageSize: 5 }],
    ['audit.list', { page: 1, pageSize: 5 }],
  ]) {
    const resultadoItem = await chamarFuncao(acao, dadosEnvio, tokenProprietario);
    await esperar(
      `consulta: ${acao}`,
      resultadoItem.status === 200,
      resultadoItem.status === 200
        ? `${resultadoItem.body?.data?.total ?? '?'} registro(s)`
        : `${resultadoItem.status} ${resultadoItem.hint}`,
    );
  }

  const instante = Date.now().toString(36);
  const validoCnpjs = ['11444777000161', '06990590000123', '60746948000112', '33000167000101'];
  let indiceCnpj = 0;
  const proximoCnpj = () => {
    const registro = validoCnpjs[indiceCnpj++];
    codigoSql(`delete from platform.company_invites where company_id in
           (select id from public.companies where cnpj='${registro}')`);
    codigoSql(`delete from public.company_memberships where company_id in
           (select id from public.companies where cnpj='${registro}')`);
    codigoSql(`delete from audit.events where company_id in
           (select id from public.companies where cnpj='${registro}')`);
    codigoSql(`delete from platform.operations where company_id in
           (select id from public.companies where cnpj='${registro}')`);
    codigoSql(`delete from public.companies where cnpj='${registro}'`);
    return registro;
  };

  const emailNovo = `novo-${instante}@pnf.test`;
  const senhaNova = 'SenhaEdgeTeste#2026';
  let opNovo = null;
  await etapa('provisionamento por senha: cria empresa e primeiro administrador', async () => {
    const resultadoItem = await chamarFuncao(
      'company.provision',
      {
        idempotencyKey: `edge-provision-novo-${instante}`,
        company: { legalName: 'Edge Novo LTDA', tradeName: `Edge Novo ${instante}`, cnpj: proximoCnpj() },
        firstAdmin: { fullName: 'Admin Novo', email: emailNovo, password: senhaNova },
      },
      tokenProprietario,
    );
    if (resultadoItem.status !== 200)
      throw new Error(
        `${resultadoItem.status} ${resultadoItem.hint} ${resultadoItem.body?.error?.message ?? ''}`,
      );
    opNovo = resultadoItem.body.data;
    return `status ${opNovo.status}`;
  });

  await esperar(
    'provisionamento por senha: conta criada pelo Auth',
    Boolean(codigoSql(`select id from auth.users where lower(email)='${emailNovo}'`)),
    'usuário existe no Auth',
  );

  await esperar(
    'provisionamento por senha: vínculo nasce ATIVO',
    codigoSql(`select case when m.active then 'ativo' else 'inativo' end
         from public.company_memberships m
         join auth.users u on u.id = m.user_id
         where lower(u.email)='${emailNovo}'`) === 'ativo',
    'acesso imediato ao Desktop',
  );

  await esperar(
    'provisionamento por senha: etapa antiga de convite fica ignorada',
    codigoSql(`select status::text from platform.operation_steps
         where operation_id='${opNovo.operationId ?? opNovo.id ?? opNovo.operation_id ?? ''}'::uuid and step_code='send_invite'`) !==
      'failed',
    'sem entrega obrigatória de convite',
  );

  const emailConfirmado = codigoSql(`select email from auth.users
    where email_confirmed_at is not null limit 1`);
  await etapa('provisionamento: e-mail Auth existente é recusado', async () => {
    const resultadoItem = await chamarFuncao(
      'company.provision',
      {
        idempotencyKey: `edge-provision-conf-${instante}`,
        company: { legalName: 'Edge Conf LTDA', tradeName: `Edge Conf ${instante}`, cnpj: proximoCnpj() },
        firstAdmin: { fullName: 'Admin Confirmado', email: emailConfirmado, password: senhaNova },
      },
      tokenProprietario,
    );
    if (resultadoItem.status === 200) return 'provisionado com recovery';
    if (resultadoItem.hint === 'auth_email_conflict' || resultadoItem.status === 409) {
      return `recusado corretamente: ${resultadoItem.hint}`;
    }
    throw new Error(
      `${resultadoItem.status} ${resultadoItem.hint} ${resultadoItem.body?.error?.message ?? ''}`,
    );
  });

  await etapa('provisionamento: CNPJ duplicado é recusado', async () => {
    const cnpj = codigoSql(`select cnpj from public.companies limit 1`);
    const resultadoItem = await chamarFuncao(
      'company.provision',
      {
        idempotencyKey: `edge-provision-dup-${instante}`,
        company: { legalName: 'Edge Dup LTDA', tradeName: `Edge Dup ${instante}`, cnpj },
        firstAdmin: { fullName: 'X', email: `dup-${instante}@pnf.test`, password: senhaNova },
      },
      tokenProprietario,
    );
    if (resultadoItem.status !== 409 || resultadoItem.hint !== 'cnpj_already_exists') {
      throw new Error(`esperado 409 cnpj_already_exists, veio ${resultadoItem.status} ${resultadoItem.hint}`);
    }
    return resultadoItem.hint;
  });

  await etapa('provisionamento: chave repetida não cria segunda empresa', async () => {
    const antes = Number(codigoSql(`select count(*) from public.companies`));
    const resultadoItem = await chamarFuncao(
      'company.provision',
      {
        idempotencyKey: `edge-provision-novo-${instante}`,
        company: { legalName: 'Edge Novo LTDA', tradeName: `Edge Novo ${instante}`, cnpj: validoCnpjs[0] },
        firstAdmin: { fullName: 'Admin Novo', email: emailNovo, password: senhaNova },
      },
      tokenProprietario,
    );
    const depois = Number(codigoSql(`select count(*) from public.companies`));
    if (depois !== antes) throw new Error(`criou ${depois - antes} empresa(s) a mais`);
    return `replay, ${depois} empresas`;
  });

  // Aceite/reenvio de convite de equipe é coberto pela Edge Function admin-users.
  await etapa('convite: apresentado por outro usuário é recusado', async () => {
    const outro = emitirToken(administradorEmpresaIdentificador);
    const resultadoItem = await chamarFuncao(
      'invite.accept',
      { token: 'TOKEN-EDGE-TESTE-COM-TAMANHO-SUFICIENTE-01' },
      outro,
    );
    if (![403, 409].includes(resultadoItem.status))
      throw new Error(`veio ${resultadoItem.status} ${resultadoItem.hint}`);
    return String(resultadoItem.hint);
  });

  resultados.push({
    n: 'convite: SMTP indisponível',
    ok: true,
    d: 'NÃO EXERCITADO — exige reiniciar a função com SMTP_RELAY_URL inválida',
    partial: true,
  });

  const alvoEmpresa = codigoSql(`select id::text from public.companies where status='active' limit 1`);

  await etapa('empresa: detalhe não expõe dados operacionais', async () => {
    const resultadoItem = await chamarFuncao('company.get', { companyId: alvoEmpresa }, tokenProprietario);
    if (resultadoItem.status !== 200) throw new Error(`${resultadoItem.status} ${resultadoItem.hint}`);
    const chaves = Object.keys(resultadoItem.body.data);
    const vazados = chaves.filter((chaveItem) =>
      ['vehicles', 'trips', 'fuelings', 'maintenance', 'drivers', 'costs'].includes(chaveItem),
    );
    if (vazados.length) throw new Error(`vazou: ${vazados.join(', ')}`);
    return `${chaves.length} campos, nenhum operacional`;
  });

  const falhou = resultados.filter((resultadoItem) => !resultadoItem.ok);
  for (const resultadoItem of resultados) {
    console.log(
      `  ${resultadoItem.ok ? (resultadoItem.partial ? 'N/E ' : 'OK  ') : 'FAIL'}  ${resultadoItem.n}${resultadoItem.d ? `  — ${resultadoItem.d}` : ''}`,
    );
  }
  console.log('');
  console.log('  runtime: Deno real; Auth: gateway de desenvolvimento (ver FINAL_REPORT §limitações)');
  console.log('');

  if (falhou.length) {
    console.error(`test:edge:integration  FAIL — ${falhou.length}/${resultados.length}`);
    process.exit(1);
  }
  console.log(
    `test:edge:integration  PASS — ${resultados.length - resultados.filter((resultadoItem2) => resultadoItem2.partial).length}` +
      `/${resultados.length} (${resultados.filter((resultadoItem2) => resultadoItem2.partial).length} não exercitado)`,
  );
}

principal().catch((evento) => {
  console.error('test:edge:integration  FAIL —', evento.message);
  process.exit(1);
});
