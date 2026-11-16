const verificar = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const arquivos = require('node:fs');
const caminhos = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

const raiz = caminhos.resolve(__dirname, '../../..');
const pastaMigracoes = caminhos.join(raiz, 'supabase/migrations');
const migracoes = arquivos.readdirSync(pastaMigracoes).filter(nome => nome.endsWith('.sql')).sort();
const banco = new PGlite({ extensions: { pgcrypto } });

async function rpc(funcao, valores = [], papel = 'service_role') {
  return banco.transaction(async transacao => {
    await transacao.exec(`set local role ${papel}`);
    const argumentos = valores.map((_, indice) => '$' + (indice + 1)).join(', ');
    return (await transacao.query(`select platform.${funcao}(${argumentos}) resultado`, valores)).rows[0].resultado;
  });
}

async function conta(email, operacao = null) {
  const id = randomUUID();
  await banco.query(
    'insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values($1,$2,now(),$3)',
    [id, email, operacao ? { pnf_provisioning_operation: operacao } : {}],
  );
  return id;
}

async function administrador(email) {
  const id = await conta(email);
  await banco.query("insert into public.profiles(id,full_name) values($1,'Administrador da plataforma')", [id]);
  await banco.query('insert into platform.admins(user_id) values($1)', [id]);
  return id;
}

function empresa(cnpj) {
  return { cnpj, legalName: 'Transportadora QA', tradeName: 'Frota QA', timezone: 'America/Sao_Paulo' };
}

function primeiroAdmin(email) {
  return { email, fullName: 'Primeira Administradora', phone: null };
}

async function empresaPorCnpj(cnpj) {
  return (await banco.query('select id, status from public.companies where cnpj = $1', [cnpj])).rows[0];
}

const erroComDica = dica => erro => erro.hint === dica;

(async () => {
  try {
    await banco.exec(arquivos.readFileSync(
      caminhos.join(raiz, 'ferramentas/testes/cameras/ambiente-descartavel.sql'), 'utf8',
    ));
    for (const nome of migracoes) {
      await banco.exec(arquivos.readFileSync(caminhos.join(pastaMigracoes, nome), 'utf8'));
    }
    const ator = await administrador('plataforma@example.test');
    const outroAtor = await administrador('outra.plataforma@example.test');
    const existente = await conta('ja.existe@example.test');
    const provisao = 'prov-' + randomUUID();
    const dadosEmpresa = empresa('11444777000161');
    const preparar = (...argumentos) => rpc('prepare_company_provisioning', argumentos);
    const concluir = (...argumentos) => rpc('complete_company_provisioning', argumentos);
    const falhar = (...argumentos) => rpc('fail_company_provisioning_attempt', argumentos);

    await verificar.rejects(
      preparar(ator, provisao, dadosEmpresa, primeiroAdmin('JA.EXISTE@example.test')),
      erroComDica('auth_email_conflict'),
    );
    verificar.equal(await empresaPorCnpj(dadosEmpresa.cnpj), undefined);
    const email = 'conta.nova@example.test';
    const primeiro = primeiroAdmin(email);
    const entrada = { ...dadosEmpresa, password: 'nao-persistir' };
    const pessoa = { ...primeiro, password: 'nao-persistir' };
    const preparada = await preparar(ator, provisao, entrada, pessoa);
    verificar.equal(preparada.execute, true);
    verificar.equal(preparada.attempt, 1);
    verificar.equal(preparada.authUserId, null);
    verificar.equal(await empresaPorCnpj(dadosEmpresa.cnpj), undefined);
    verificar.equal((await preparar(ator, provisao, dadosEmpresa, primeiro)).execute, false);
    await verificar.rejects(preparar(outroAtor, provisao, dadosEmpresa, primeiro), erroComDica('PERMISSION_DENIED'));
    await verificar.rejects(concluir(ator, preparada.operationId, 1, existente), erroComDica('auth_email_conflict'));
    await verificar.rejects(
      rpc('prepare_company_provisioning', [ator, provisao, dadosEmpresa, primeiro], 'authenticated'),
      /permission denied/i,
    );
    const novoUsuario = await conta(email, preparada.operationId);
    const concluida = await concluir(ator, preparada.operationId, 1, novoUsuario);
    verificar.equal(concluida.status, 'succeeded');
    verificar.equal((await empresaPorCnpj(dadosEmpresa.cnpj)).status, 'active');
    const membro = await banco.query('select active,role from public.company_memberships where user_id = $1', [novoUsuario]);
    verificar.deepEqual(membro.rows, [{ active: true, role: 'company_admin' }]);
    const repetida = await preparar(ator, provisao, dadosEmpresa, primeiro);
    verificar.deepEqual(repetida, { operationId: preparada.operationId, execute: false });
    const perdaResposta = await falhar(ator, preparada.operationId, 1, 'partial_failure', 'Timeout', false, novoUsuario);
    verificar.equal(perdaResposta.status, 'succeeded');
    verificar.equal(perdaResposta.deleteAuthUser, undefined);
    verificar.equal(perdaResposta.attemptCount, 1);
    verificar.equal(JSON.stringify(perdaResposta.requestPayload).includes('nao-persistir'), false);
    console.log('E-mail existente deixa zero empresa, revisão permite prosseguir e replay preserva um vínculo.');

    const dadosSegunda = empresa('19131243000197');
    const chave = 'prov-' + randomUUID();
    const emailSegunda = 'nova.tentativa@example.test';
    const inicio = await preparar(ator, chave, dadosSegunda, primeiroAdmin(emailSegunda));
    const identidade = await conta(emailSegunda, inicio.operationId);
    await banco.exec(`
      create function public.falhar_vinculo_qa() returns trigger language plpgsql as $$
      begin raise exception 'Falha após preparar a empresa'; end; $$;
      create trigger falhar_vinculo_qa before insert on public.company_memberships
      for each row execute function public.falhar_vinculo_qa();
    `);
    await verificar.rejects(concluir(ator, inicio.operationId, 1, identidade), /Falha após preparar a empresa/);
    verificar.equal(await empresaPorCnpj(dadosSegunda.cnpj), undefined);
    const falha = await falhar(ator, inicio.operationId, 1, 'partial_failure', 'Falha simulada', true, identidade);
    verificar.equal(falha.deleteAuthUser, false);
    await banco.exec('drop trigger falhar_vinculo_qa on public.company_memberships');
    await verificar.rejects(
      rpc('get_company_provisioning_retry_request', [outroAtor, inicio.operationId]),
      erroComDica('PERMISSION_DENIED'),
    );
    const pedidoOriginal = await rpc('get_company_provisioning_retry_request', [ator, inicio.operationId]);
    verificar.equal(pedidoOriginal.idempotencyKey, chave);
    verificar.equal(pedidoOriginal.firstAdmin.email, emailSegunda);
    verificar.equal(Object.hasOwn(pedidoOriginal.firstAdmin, 'password'), false);
    const retomar = await preparar(ator, pedidoOriginal.idempotencyKey, pedidoOriginal.company, pedidoOriginal.firstAdmin);
    verificar.equal(retomar.authUserId, identidade);
    verificar.equal(retomar.attempt, 2);
    await verificar.rejects(concluir(ator, retomar.operationId, 1, identidade), erroComDica('CONFLICT_STATE'));
    verificar.equal((await concluir(ator, retomar.operationId, 2, identidade)).status, 'succeeded');
    console.log('Falha no vínculo reverte a empresa e a retentativa usa a identidade da operação.');

    const mesmaEmpresa = empresa('11222333000181');
    const primeiroEmail = 'corrida.primeiro@example.test';
    const segundoEmail = 'corrida.segundo@example.test';
    const primeiroPedido = await preparar(ator, 'prov-' + randomUUID(), mesmaEmpresa, primeiroAdmin(primeiroEmail));
    const segundoPedido = await preparar(ator, 'prov-' + randomUUID(), mesmaEmpresa, primeiroAdmin(segundoEmail));
    const primeiroUsuario = await conta(primeiroEmail, primeiroPedido.operationId);
    const segundoUsuario = await conta(segundoEmail, segundoPedido.operationId);
    const terminou = await concluir(ator, primeiroPedido.operationId, 1, primeiroUsuario);
    await verificar.rejects(
      concluir(ator, segundoPedido.operationId, 1, segundoUsuario),
      erro => erro.hint === 'cnpj_already_exists' && erro.detail === terminou.companyId,
    );
    const descartada = await falhar(
      ator, segundoPedido.operationId, 1, 'cnpj_already_exists',
      'Duplicidade', false, segundoUsuario,
    );
    verificar.equal(descartada.deleteAuthUser, true);
    verificar.equal((await empresaPorCnpj(mesmaEmpresa.cnpj)).id, terminou.companyId);
    console.log('Dois pedidos concorrentes para o CNPJ mantêm uma empresa, sem expor o primeiro usuário à exclusão.');
    console.log(`Provisionamento aprovado com ${migracoes.length} migrations em PostgreSQL descartável.`);
  } finally {
    await banco.close();
  }
})().catch(erro => {
  console.error(erro);
  process.exitCode = 1;
});
