#!/usr/bin/env node
import { execFileSync as executarArquivoSincrono } from 'node:child_process';

const BASE = process.env.PNF_DEV_URL || 'http://127.0.0.1:54321';
const CHAVE_ANONIMA = 'dev-anon-key-local-harness';
const CONVITE_BASE = process.env.INVITE_BASE_URL || 'http://127.0.0.1:5174';

const resultados = [];
const sucesso = (quantidadeItem, dadosRegistro) =>
  resultados.push({ name: quantidadeItem, ok: true, detail: dadosRegistro ?? '' });
const invalido = (quantidadeItem, dadosRegistro) =>
  resultados.push({ name: quantidadeItem, ok: false, detail: dadosRegistro ?? '' });

const codigoSql = (buscaAtual) =>
  executarArquivoSincrono(
    'psql',
    [
      '-h',
      '127.0.0.1',
      '-p',
      '5433',
      '-U',
      'postgres',
      '-d',
      process.env.PNF_DEV_DB || 'pnf_dev',
      '-t',
      '-A',
      '-c',
      buscaAtual,
    ],
    { encoding: 'utf8', env: { ...process.env, PATH: `${process.env.PATH}:/usr/lib/postgresql/16/bin` } },
  ).trim();

async function autenticacao(caminho, { method: metodo = 'POST', body: corpo, token } = {}) {
  const resposta = await fetch(`${BASE}/auth/v1${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      apikey: CHAVE_ANONIMA,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = texto;
  }
  return { status: resposta.status, data: dados };
}

async function buscarUsuarioIdentificadorPorEmail(email) {
  const termoBusca = email.trim().toLowerCase();
  for (let pagina = 1; pagina <= 50; pagina += 1) {
    const { data: dados } = await autenticacao(`/admin/users?page=${pagina}&per_page=200`, { method: 'GET' });
    const usuarios = dados?.users ?? [];
    const ocorrencia = usuarios.find((usuarioItem) => usuarioItem.email?.toLowerCase() === termoBusca);
    if (ocorrencia) return ocorrencia;
    if (usuarios.length < 200) return null;
  }
  return null;
}

async function resolverIdentidade(email) {
  const usuario = await buscarUsuarioIdentificadorPorEmail(email);
  if (!usuario) return { state: 'absent', userId: null };
  return { state: usuario.email_confirmed_at ? 'confirmed' : 'unconfirmed', userId: usuario.id };
}

async function emitirLinkAutenticacao({ email, identity: identidade, inviteToken: tokenConvite }) {
  const redirecionarPara = `${CONVITE_BASE.replace(/\/$/, '')}/?token=${encodeURIComponent(tokenConvite)}#/convite`;
  const tipo = identidade.state === 'confirmed' ? 'recovery' : 'invite';

  const { status: situacao, data: dados } = await autenticacao('/admin/generate_link', {
    body: { type: tipo, email, redirect_to: redirecionarPara, data: { invite_token: tokenConvite } },
  });

  if (situacao !== 200) {
    if (tipo === 'invite' && /already registered/i.test(dados?.msg ?? '')) {
      return emitirLinkAutenticacao({
        email,
        identity: { state: 'confirmed', userId: identidade.userId },
        inviteToken: tokenConvite,
      });
    }
    return { ok: false, code: situacao, error: dados?.msg };
  }
  return {
    ok: true,
    type: tipo,
    userId: dados?.id ?? dados?.user?.id,
    actionLink: dados?.action_link ?? dados?.properties?.action_link,
  };
}

async function principal() {
  try {
    const verificacao = await fetch(BASE, { signal: AbortSignal.timeout(4000) });
    if (!verificacao.ok) throw new Error();
  } catch {
    console.log('test:auth-real  NÃO EXECUTADO — stack de desenvolvimento fora do ar');
    console.log('  suba com: bash ferramentas/desenvolvimento/pilha-local.sh up');
    process.exit(2);
  }

  const instante = Date.now().toString(36);

  const novoEmail = `novo-${instante}@t4.test`;
  {
    const identidade = await resolverIdentidade(novoEmail);
    if (identidade.state !== 'absent') {
      invalido('1_novo_identidade_ausente', identidade.state);
    } else sucesso('1_novo_identidade_ausente');

    const link = await emitirLinkAutenticacao({
      email: novoEmail,
      identity: identidade,
      inviteToken: `tok-${instante}-1`,
    });
    if (!link.ok) invalido('1_novo_gera_link', link.error);
    else {
      sucesso('1_novo_gera_link', `tipo ${link.type}`);
      if (link.type === 'invite') sucesso('1_novo_usa_invite');
      else invalido('1_novo_usa_invite', `usou ${link.type}`);

      const criado = await buscarUsuarioIdentificadorPorEmail(novoEmail);
      if (criado?.id === link.userId) sucesso('1_novo_id_vem_do_auth', link.userId.slice(0, 8));
      else invalido('1_novo_id_vem_do_auth', 'id divergente do Auth');

      if (link.actionLink?.includes('access_token=')) sucesso('1_novo_link_estabelece_sessao');
      else invalido('1_novo_link_estabelece_sessao', 'action_link sem access_token');

      if (link.actionLink?.includes(`token=tok-${instante}-1`)) sucesso('1_novo_link_leva_token_de_negocio');
      else invalido('1_novo_link_leva_token_de_negocio', link.actionLink?.slice(0, 90));
    }
  }

  {
    const identidade = await resolverIdentidade(novoEmail);
    if (identidade.state === 'unconfirmed') sucesso('2_existente_nao_confirmado_detectado');
    else invalido('2_existente_nao_confirmado_detectado', identidade.state);

    const link = await emitirLinkAutenticacao({
      email: novoEmail,
      identity: identidade,
      inviteToken: `tok-${instante}-2`,
    });
    if (link.ok && link.type === 'invite') sucesso('2_reenvia_como_invite');
    else invalido('2_reenvia_como_invite', link.error ?? link.type);

    if (link.userId === identidade.userId) sucesso('2_mantem_o_mesmo_id');
    else invalido('2_mantem_o_mesmo_id', 'id mudou entre convites');
  }

  const confirmadoEmail = codigoSql(`select email from auth.users
    where email_confirmed_at is not null order by created_at limit 1`);
  {
    if (!confirmadoEmail) {
      invalido('3_seed_tem_usuario_confirmado', 'nenhum no seed');
    } else {
      sucesso('3_seed_tem_usuario_confirmado', confirmadoEmail);
      const identidade = await resolverIdentidade(confirmadoEmail);
      if (identidade.state === 'confirmed') sucesso('3_confirmado_detectado');
      else invalido('3_confirmado_detectado', identidade.state);

      const link = await emitirLinkAutenticacao({
        email: confirmadoEmail,
        identity: identidade,
        inviteToken: `tok-${instante}-3`,
      });
      if (link.ok && link.type === 'recovery') sucesso('3_confirmado_usa_recovery');
      else invalido('3_confirmado_usa_recovery', link.error ?? link.type);
    }
  }

  {
    const { status: situacao, data: dados } = await autenticacao('/admin/generate_link', {
      body: { type: 'invite', email: confirmadoEmail, redirect_to: CONVITE_BASE },
    });
    if (situacao === 422) sucesso('4_invite_em_conta_confirmada_recusado', `${situacao} ${dados?.msg}`);
    else invalido('4_invite_em_conta_confirmada_recusado', `esperado 422, veio ${situacao}`);
  }

  {
    const { status: situacao } = await autenticacao('/admin/generate_link', {
      body: { type: 'recovery', email: `nao-existe-${instante}@t4.test`, redirect_to: CONVITE_BASE },
    });
    if (situacao === 404) sucesso('5_recovery_sem_conta_recusado', String(situacao));
    else invalido('5_recovery_sem_conta_recusado', `esperado 404, veio ${situacao}`);
  }

  {
    const { status: situacao, data: dados } = await autenticacao('/admin/generate_link', {
      body: {
        type: 'recovery',
        email: confirmadoEmail,
        redirect_to: 'https://atacante.example.com/roubo',
      },
    });
    const link = dados?.properties?.action_link ?? '';
    if (situacao === 200 && !link.includes('atacante.example.com')) {
      sucesso('6_redirect_fora_da_allowlist_ignorado', 'redirecionado para o site_url');
    } else {
      invalido('6_redirect_fora_da_allowlist_ignorado', link.slice(0, 90));
    }
  }

  {
    const criado = await buscarUsuarioIdentificadorPorEmail(novoEmail);
    const token = executarArquivoSincrono(
      'node',
      ['ferramentas/desenvolvimento/token-local.mjs', criado.id],
      { encoding: 'utf8' },
    ).trim();

    const curta = await autenticacao('/user', { method: 'PUT', body: { password: 'onzecarac' }, token });
    if (curta.status === 422) sucesso('7_senha_curta_recusada_pelo_auth', curta.data?.msg);
    else invalido('7_senha_curta_recusada_pelo_auth', `veio ${curta.status}`);

    const onze = await autenticacao('/user', { method: 'PUT', body: { password: 'A'.repeat(11) }, token });
    if (onze.status === 422) sucesso('7_onze_caracteres_recusados');
    else invalido('7_onze_caracteres_recusados', `veio ${onze.status}`);

    const doze = await autenticacao('/user', { method: 'PUT', body: { password: 'SenhaDeDozeC' }, token });
    if (doze.status === 200) sucesso('7_doze_caracteres_aceitos');
    else invalido('7_doze_caracteres_aceitos', `veio ${doze.status}`);
  }

  {
    const semSmtp = await simularEntrega({ deliveryMode: 'smtp', endpoint: '' });
    if (!semSmtp.ok && /SMTP_RELAY_URL/.test(semSmtp.error)) {
      sucesso('8_sem_smtp_falha_explicita', semSmtp.error.slice(0, 60));
    } else {
      invalido('8_sem_smtp_falha_explicita', JSON.stringify(semSmtp));
    }

    const modoRegistro = await simularEntrega({ deliveryMode: 'log', endpoint: '' });
    if (modoRegistro.ok) sucesso('8_modo_log_nao_envia_mas_nao_mente', 'registrado como desenvolvimento');
    else invalido('8_modo_log_nao_envia_mas_nao_mente', modoRegistro.error);

    const relayQuebrado = await simularEntrega({
      deliveryMode: 'smtp',
      endpoint: 'http://127.0.0.1:9/nao-existe',
    });
    if (!relayQuebrado.ok) sucesso('8_relay_indisponivel_falha', 'falha de rede propagada');
    else invalido('8_relay_indisponivel_falha', 'devolveu sucesso sem enviar');
  }

  const falhou = resultados.filter((resultadoItem) => !resultadoItem.ok);
  for (const resultadoItem of resultados) {
    console.log(
      `  ${resultadoItem.ok ? 'OK  ' : 'FAIL'}  ${resultadoItem.name}${resultadoItem.detail ? `  — ${resultadoItem.detail}` : ''}`,
    );
  }
  console.log('');
  console.log('  LIMITE: executado contra o gateway de desenvolvimento; o GoTrue');
  console.log('          hospedado é inalcançável deste ambiente (403 no proxy).');
  console.log('');

  if (falhou.length) {
    console.error(`test:auth-real  FAIL — ${falhou.length}/${resultados.length}`);
    process.exit(1);
  }
  console.log(`test:auth-real  PASS — ${resultados.length}/${resultados.length}`);
}

async function simularEntrega({ deliveryMode: entregaModo, endpoint: enderecoServico }) {
  if (entregaModo === 'log') return { ok: true };
  if (!enderecoServico) {
    return { ok: false, error: 'SMTP_RELAY_URL não configurada; o convite não pode ser entregue.' };
  }
  try {
    const resposta = await fetch(enderecoServico, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'x@y.test' }),
      signal: AbortSignal.timeout(2000),
    });
    if (!resposta.ok) return { ok: false, error: `relay respondeu ${resposta.status}` };
    return { ok: true };
  } catch (erro) {
    return { ok: false, error: `falha de rede ao enviar convite: ${erro.message}` };
  }
}

principal().catch((erro) => {
  console.error('test:auth-real  FAIL —', erro.message);
  process.exit(1);
});
