#!/usr/bin/env node
import { createServer as criarServidor } from 'node:http';
import { execFileSync as executarArquivoSincrono } from 'node:child_process';
import { emitirToken } from './token-local.mjs';

const PORTA = Number(process.env.PNF_GATEWAY_PORT || 54321);
const POSTGREST = process.env.PNF_PGRST_URL || 'http://127.0.0.1:3001';
const BANCO = process.env.PNF_DEV_DB || 'pnf_dev';
const PORTAS_FUNCOES = { 'platform-admin': Number(process.env.PNF_FN_PORT || 3002) };

const DESTINOS_REDIRECIONAMENTO_PERMITIDOS = (
  process.env.PNF_ALLOWED_REDIRECTS ||
  'http://127.0.0.1:5174,http://localhost:5174,peganafrota://auth-callback'
)
  .split(',')
  .map((itemComparado) => itemComparado.trim())
  .filter(Boolean);

function codigoSql(consulta) {
  try {
    return executarSqlOuFalhar(consulta);
  } catch (erro) {
    console.error('[gateway] psql falhou:', String(erro.stderr || erro.message).slice(0, 300));
    return '';
  }
}

function executarSqlOuFalhar(consulta) {
  return executarArquivoSincrono(
    'psql',
    ['-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', '-d', BANCO, '-t', '-A', '-c', consulta],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${process.env.PATH}:/usr/lib/postgresql/16/bin` },
    },
  )
    .trim()
    .split('\n')[0]
    .trim();
}

const respostaJson = (resposta, situacao, corpo, extra = {}) => {
  resposta.writeHead(situacao, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer, x-request-id',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    ...extra,
  });
  resposta.end(JSON.stringify(corpo));
};

function lerCorpo(requisicao) {
  return new Promise((resolver) => {
    let trechoAcumulado = '';
    requisicao.on('data', (registro) => {
      trechoAcumulado += registro;
    });
    requisicao.on('end', () => {
      try {
        resolver(trechoAcumulado ? JSON.parse(trechoAcumulado) : {});
      } catch {
        resolver({});
      }
    });
  });
}

function sessaoParaUsuario(usuarioIdentificador, nivelAutenticacao = 'aal1') {
  const acesso = emitirToken(usuarioIdentificador, 'authenticated', nivelAutenticacao, 3600);
  return {
    access_token: acesso,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `dev-refresh-${usuarioIdentificador}`,
    user: { id: usuarioIdentificador, aud: 'authenticated', role: 'authenticated' },
  };
}

const escaparTexto = (textoItem) => String(textoItem ?? '').replace(/'/g, "''");

const SENHA_MINIMA = Number(process.env.PNF_MIN_PASSWORD || 12);

const ENDERECO_SITE = process.env.PNF_SITE_URL || 'http://127.0.0.1:5174';
const DESTINOS_PERMITIDOS = (process.env.PNF_REDIRECT_ALLOW || 'http://127.0.0.1:5174,http://localhost:5174')
  .split(',')
  .map((itemComparado) => itemComparado.trim());

function redirecionamentoAllowed(alvo) {
  if (!alvo) return false;
  try {
    const origem = new URL(alvo).origin;
    return DESTINOS_PERMITIDOS.some((primeiroItem) => primeiroItem.replace(/\/$/, '') === origem);
  } catch {
    return false;
  }
}

function montarLinkAcao(redirecionarPara, usuarioIdentificador, tipo) {
  const alvo = redirecionamentoAllowed(redirecionarPara) ? redirecionarPara : ENDERECO_SITE;
  const acesso = emitirToken(usuarioIdentificador, 'authenticated', 'aal1', 3600);
  const separadorAtual = alvo.includes('#') ? '&' : '#';
  return (
    `${alvo}${separadorAtual}access_token=${acesso}&refresh_token=dev-refresh-${usuarioIdentificador}` +
    `&expires_in=3600&token_type=bearer&type=${tipo}`
  );
}

async function tratarAutenticacao(requisicao, resposta, endereco) {
  const caminho = endereco.pathname.replace(/^\/auth\/v1/, '');

  if (caminho === '/token' && requisicao.method === 'POST') {
    const concessao = endereco.searchParams.get('grant_type');
    const corpo = await lerCorpo(requisicao);

    if (concessao === 'password') {
      const email = String(corpo.email ?? '')
        .trim()
        .toLowerCase();
      const linha = codigoSql(`select u.id from auth.users u
        where lower(u.email) = '${escaparTexto(email)}'
          and u.encrypted_password = extensions.crypt('${escaparTexto(corpo.password)}', u.encrypted_password)
        limit 1`);
      if (!linha) {
        return respostaJson(resposta, 400, {
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        });
      }
      return respostaJson(resposta, 200, sessaoParaUsuario(linha));
    }

    if (concessao === 'refresh_token') {
      const resultadoOperacao = String(corpo.refresh_token ?? '');
      const correspondenciaItem = /^dev-refresh-(.+)$/.exec(resultadoOperacao);
      if (!correspondenciaItem) return respostaJson(resposta, 400, { error: 'invalid_grant' });
      const existe = codigoSql(
        `select id from auth.users where id = '${escaparTexto(correspondenciaItem[1])}'::uuid limit 1`,
      );
      if (!existe) return respostaJson(resposta, 400, { error: 'invalid_grant' });
      return respostaJson(resposta, 200, sessaoParaUsuario(existe));
    }

    return respostaJson(resposta, 400, { error: 'unsupported_grant_type' });
  }

  if (caminho === '/user' && requisicao.method === 'GET') {
    const token = (requisicao.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    try {
      const dadosEnvio = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      const email = codigoSql(
        `select email from auth.users where id = '${escaparTexto(dadosEnvio.sub)}'::uuid`,
      );
      return respostaJson(resposta, 200, {
        id: dadosEnvio.sub,
        email,
        aud: 'authenticated',
        role: 'authenticated',
      });
    } catch {
      return respostaJson(resposta, 401, { error: 'invalid_token' });
    }
  }

  if (caminho === '/logout') return respostaJson(resposta, 204, {});

  if (caminho === '/admin/users' && requisicao.method === 'GET') {
    const pagina = Number(endereco.searchParams.get('page') || 1);
    const porPagina = Number(endereco.searchParams.get('per_page') || 50);
    const bruto = codigoSql(
      `select coalesce(json_agg(json_build_object('id', id, 'email', email, ` +
        `'email_confirmed_at', email_confirmed_at) order by created_at), '[]'::json)::text ` +
        `from (select id, email, email_confirmed_at, created_at from auth.users ` +
        `order by created_at limit ${porPagina} offset ${(pagina - 1) * porPagina}) u`,
    );
    let usuarios = [];
    try {
      usuarios = JSON.parse(bruto || '[]');
    } catch {
      usuarios = [];
    }
    return respostaJson(resposta, 200, { users: usuarios, aud: 'authenticated' });
  }

  if (caminho.startsWith('/admin/users/') && requisicao.method === 'GET') {
    const identificador = caminho.split('/').pop();
    const linha = codigoSql(`select id || '|' || coalesce(email,'') || '|' ||
      coalesce(email_confirmed_at::text,'') from auth.users where id = '${escaparTexto(identificador)}'::uuid`);
    if (!linha) return respostaJson(resposta, 404, { error: 'user_not_found' });
    const [identificadorUsuario, mensagemEmail, confirmado] = linha.split('|');
    return respostaJson(resposta, 200, {
      user: { id: identificadorUsuario, email: mensagemEmail, email_confirmed_at: confirmado || null },
    });
  }

  if (caminho === '/admin/generate_link' && requisicao.method === 'POST') {
    const corpo = await lerCorpo(requisicao);
    const tipo = String(corpo.type ?? '');
    const mensagemEmail = String(corpo.email ?? '')
      .trim()
      .toLowerCase();
    const redirecionarPara = String(
      endereco.searchParams.get('redirect_to') ?? corpo.redirect_to ?? corpo.options?.redirectTo ?? '',
    );

    const linha = codigoSql(`select id || '|' || coalesce(email_confirmed_at::text,'')
      from auth.users where lower(email) = '${escaparTexto(mensagemEmail)}'`);
    const [existenteIdentificador, confirmadoEm] = linha ? linha.split('|') : [null, null];

    if (tipo === 'invite') {
      if (existenteIdentificador && confirmadoEm) {
        return respostaJson(resposta, 422, { code: 422, msg: 'User already registered' });
      }
      let usuarioIdentificador = existenteIdentificador;
      if (!usuarioIdentificador) {
        usuarioIdentificador = codigoSql(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
          values (gen_random_uuid(), '${escaparTexto(mensagemEmail)}', 'authenticated', 'authenticated',
                  '${escaparTexto(JSON.stringify(corpo.data ?? corpo.options?.data ?? {}))}'::jsonb)
          returning id`);
      }
      return respostaJson(resposta, 200, {
        action_link: montarLinkAcao(redirecionarPara, usuarioIdentificador, 'invite'),
        email_otp: '000000',
        hashed_token: `hashed-${usuarioIdentificador}`,
        redirect_to: redirecionamentoAllowed(redirecionarPara) ? redirecionarPara : ENDERECO_SITE,
        verification_type: 'invite',
        id: usuarioIdentificador,
        email: mensagemEmail,
        email_confirmed_at: confirmadoEm || null,
        aud: 'authenticated',
        role: 'authenticated',
      });
    }

    if (tipo === 'recovery' || tipo === 'magiclink') {
      if (!existenteIdentificador) return respostaJson(resposta, 404, { code: 404, msg: 'User not found' });
      return respostaJson(resposta, 200, {
        action_link: montarLinkAcao(redirecionarPara, existenteIdentificador, tipo),
        email_otp: '000000',
        hashed_token: `hashed-${existenteIdentificador}`,
        redirect_to: redirecionamentoAllowed(redirecionarPara) ? redirecionarPara : ENDERECO_SITE,
        verification_type: tipo,
        id: existenteIdentificador,
        email: mensagemEmail,
        email_confirmed_at: confirmadoEm || null,
        aud: 'authenticated',
        role: 'authenticated',
      });
    }

    return respostaJson(resposta, 400, { code: 400, msg: `unsupported link type: ${tipo}` });
  }

  if (caminho === '/user' && requisicao.method === 'PUT') {
    const token = (requisicao.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    let subparte = null;
    try {
      subparte = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
    } catch {
      return respostaJson(resposta, 401, { error: 'invalid_token' });
    }

    const corpo = await lerCorpo(requisicao);
    if (corpo.password) {
      if (String(corpo.password).length < SENHA_MINIMA) {
        return respostaJson(resposta, 422, {
          code: 422,
          msg: `Password should be at least ${SENHA_MINIMA} characters`,
          error_code: 'weak_password',
        });
      }
      codigoSql(`update auth.users
             set encrypted_password = extensions.crypt('${escaparTexto(corpo.password)}', extensions.gen_salt('bf')),
                 email_confirmed_at = coalesce(email_confirmed_at, now())
           where id = '${escaparTexto(subparte)}'::uuid`);
    }
    return respostaJson(resposta, 200, { id: subparte });
  }

  if (caminho === '/user' && requisicao.method === 'PUT') {
    const token = (requisicao.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    let subparte;
    try {
      subparte = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
    } catch {
      return respostaJson(resposta, 401, { error: 'invalid_token' });
    }

    const corpo = await lerCorpo(requisicao);
    if (corpo.password) {
      if (String(corpo.password).length < SENHA_MINIMA) {
        return respostaJson(resposta, 422, {
          error: 'weak_password',
          error_code: 'weak_password',
          msg: `Password should be at least ${SENHA_MINIMA} characters.`,
        });
      }
      codigoSql(`update auth.users
             set encrypted_password = extensions.crypt('${escaparTexto(corpo.password)}', extensions.gen_salt('bf')),
                 email_confirmed_at = coalesce(email_confirmed_at, now()),
                 updated_at = now()
           where id = '${escaparTexto(subparte)}'::uuid`);
    }
    return respostaJson(resposta, 200, { id: subparte });
  }

  if (caminho.startsWith('/admin/')) return tratarAdministrador(requisicao, resposta, endereco, caminho);

  if (caminho.startsWith('/factors')) return tratarFatores(requisicao, resposta, endereco, caminho);

  return respostaJson(resposta, 404, { error: 'not_found', path: caminho });
}

async function tratarFuncoes(requisicao, resposta, endereco) {
  const nome = endereco.pathname.replace(/^\/functions\/v1\//, '').split('/')[0];
  const porta = PORTAS_FUNCOES[nome];
  if (!porta) return respostaJson(resposta, 404, { error: 'function_not_found', name: nome });

  if (!requisicao.headers.authorization) {
    return respostaJson(resposta, 401, {
      error: { hint: 'UNAUTHENTICATED', message: 'Missing authorization header' },
    });
  }

  const cabecalhos = {};
  for (const [chaveItem, veiculoItem] of Object.entries(requisicao.headers)) {
    if (['host', 'connection', 'content-length', 'content-type'].includes(chaveItem)) continue;
    cabecalhos[chaveItem] = veiculoItem;
  }
  const corpo = ['GET', 'HEAD'].includes(requisicao.method) ? undefined : await lerCorpo(requisicao);

  try {
    const servidorDestino = await fetch(
      `http://127.0.0.1:${porta}${endereco.pathname.replace(/^\/functions\/v1\/[^/]+/, '') || '/'}`,
      {
        method: requisicao.method,
        headers: { ...cabecalhos, 'Content-Type': 'application/json' },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      },
    );
    const texto = await servidorDestino.text();
    resposta.writeHead(servidorDestino.status, {
      'Content-Type': servidorDestino.headers.get('content-type') ?? 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    resposta.end(texto);
  } catch (erro) {
    respostaJson(resposta, 502, { error: 'function_unreachable', message: erro.message });
  }
}

async function tratarRest(requisicao, resposta, endereco) {
  const alvo = POSTGREST + endereco.pathname.replace(/^\/rest\/v1/, '') + endereco.search;

  const cabecalhos = {};
  for (const [chaveItem, veiculoItem] of Object.entries(requisicao.headers)) {
    if (['host', 'apikey', 'connection', 'content-length', 'content-type'].includes(chaveItem)) continue;
    cabecalhos[chaveItem] = veiculoItem;
  }

  const corpo = ['GET', 'HEAD'].includes(requisicao.method) ? undefined : await lerCorpo(requisicao);

  try {
    const servidorDestino = await fetch(alvo, {
      method: requisicao.method,
      headers: { ...cabecalhos, 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await servidorDestino.text();
    resposta.writeHead(servidorDestino.status, {
      'Content-Type': servidorDestino.headers.get('content-type') ?? 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Content-Range': servidorDestino.headers.get('content-range') ?? '',
    });
    resposta.end(texto);
  } catch (erro) {
    respostaJson(resposta, 502, { error: 'bad_gateway', message: erro.message });
  }
}

import { createHmac as _assinaturaIgnorada, randomBytes as gerarBytesAleatorios } from 'node:crypto';

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function codificarBase32(trechoAcumulado) {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const byte of trechoAcumulado) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

function decodificarBase32(texto2) {
  let bits = 0;
  let valor = 0;
  const saida = [];
  for (const registro of texto2.replace(/=+$/, '').toUpperCase()) {
    const indice = ALFABETO_BASE32.indexOf(registro);
    if (indice < 0) continue;
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      saida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(saida);
}

export function codigoTemporarioPorTempo(segredoBase32, emMilissegundos = Date.now()) {
  const chave = decodificarBase32(segredoBase32);
  const contador = Math.floor(emMilissegundos / 1000 / 30);
  const trechoAcumulado = Buffer.alloc(8);
  trechoAcumulado.writeUInt32BE(Math.floor(contador / 2 ** 32), 0);
  trechoAcumulado.writeUInt32BE(contador >>> 0, 4);
  const resumoCriptografico = _assinaturaIgnorada('sha1', chave).update(trechoAcumulado).digest();
  const deslocamento = resumoCriptografico[resumoCriptografico.length - 1] & 0x0f;
  const binario =
    ((resumoCriptografico[deslocamento] & 0x7f) << 24) |
    (resumoCriptografico[deslocamento + 1] << 16) |
    (resumoCriptografico[deslocamento + 2] << 8) |
    resumoCriptografico[deslocamento + 3];
  return String(binario % 1e6).padStart(6, '0');
}

const fatores = new Map(); // factorId -> { userId, secret, status, friendlyName }
const desafios = new Map(); // challengeId -> factorId

function subparteOrigem(requisicao) {
  const token = (requisicao.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
  } catch {
    return null;
  }
}

async function tratarFatores(requisicao, resposta, endereco, caminho) {
  const subparte = subparteOrigem(requisicao);
  if (!subparte) return respostaJson(resposta, 401, { error: 'invalid_token' });

  if (caminho === '/factors' && requisicao.method === 'GET') {
    const proprio = [...fatores.entries()]
      .filter(([, formulario]) => formulario.userId === subparte)
      .map(([identificador, formulario]) => ({
        id: identificador,
        factor_type: 'totp',
        status: formulario.status,
        friendly_name: formulario.friendlyName,
      }));
    return respostaJson(resposta, 200, {
      all: proprio,
      totp: proprio.filter((formulario) => formulario.status === 'verified'),
    });
  }

  if (caminho === '/factors' && requisicao.method === 'POST') {
    const corpo = await lerCorpo(requisicao);
    const segredo = codificarBase32(gerarBytesAleatorios(20));
    const identificador = `fct_${gerarBytesAleatorios(8).toString('hex')}`;
    fatores.set(identificador, {
      userId: subparte,
      secret: segredo,
      status: 'unverified',
      friendlyName: corpo.friendly_name ?? 'TOTP',
    });
    const email = codigoSql(`select email from auth.users where id = '${escaparTexto(subparte)}'::uuid`);
    const enderecoRecurso = `otpauth://totp/PegaNaFrota:${encodeURIComponent(email)}?secret=${segredo}&issuer=PegaNaFrota`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">` +
      `<rect width="200" height="200" fill="#fff"/>` +
      `<text x="100" y="100" font-size="9" text-anchor="middle">${segredo}</text></svg>`;
    return respostaJson(resposta, 200, {
      id: identificador,
      type: 'totp',
      totp: {
        qr_code: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
        secret: segredo,
        uri: enderecoRecurso,
      },
    });
  }

  let correspondenciaItem = /^\/factors\/([^/]+)\/challenge$/.exec(caminho);
  if (correspondenciaItem && requisicao.method === 'POST') {
    if (!fatores.has(correspondenciaItem[1]))
      return respostaJson(resposta, 404, { error: 'factor_not_found' });
    const identificadorEmpresa = `chl_${gerarBytesAleatorios(8).toString('hex')}`;
    desafios.set(identificadorEmpresa, correspondenciaItem[1]);
    return respostaJson(resposta, 200, {
      id: identificadorEmpresa,
      expires_at: Math.floor(Date.now() / 1000) + 300,
    });
  }

  correspondenciaItem = /^\/factors\/([^/]+)\/verify$/.exec(caminho);
  if (correspondenciaItem && requisicao.method === 'POST') {
    const corpo = await lerCorpo(requisicao);
    const formulario = fatores.get(correspondenciaItem[1]);
    if (!formulario) return respostaJson(resposta, 404, { error: 'factor_not_found' });
    if (desafios.get(corpo.challenge_id) !== correspondenciaItem[1]) {
      return respostaJson(resposta, 400, { error: 'invalid_challenge' });
    }
    const agora = Date.now();
    const valido = [-30000, 0, 30000].some(
      (dadosRegistro) =>
        codigoTemporarioPorTempo(formulario.secret, agora + dadosRegistro) === String(corpo.code),
    );
    if (!valido) return respostaJson(resposta, 400, { error: 'invalid_code', msg: 'Invalid TOTP code' });

    formulario.status = 'verified';
    desafios.delete(corpo.challenge_id);
    return respostaJson(resposta, 200, sessaoParaUsuario(formulario.userId, 'aal2'));
  }

  correspondenciaItem = /^\/factors\/([^/]+)$/.exec(caminho);
  if (correspondenciaItem && requisicao.method === 'DELETE') {
    fatores.delete(correspondenciaItem[1]);
    return respostaJson(resposta, 200, { id: correspondenciaItem[1] });
  }

  return respostaJson(resposta, 404, { error: 'not_found', path: caminho });
}

async function tratarAdministrador(requisicao, resposta, endereco, caminho) {
  if (caminho === '/admin/users' && requisicao.method === 'GET') {
    const pagina = Number(endereco.searchParams.get('page') || 1);
    const porPagina = Number(endereco.searchParams.get('per_page') || 50);
    const linhas = codigoSql(`select coalesce(json_agg(row_to_json(u)), '[]'::json)::text from (
        select id::text as id, email,
               email_confirmed_at::text as email_confirmed_at,
               created_at::text as created_at
        from auth.users order by created_at
        offset ${(pagina - 1) * porPagina} limit ${porPagina}) u`);
    let usuarios = [];
    try {
      usuarios = JSON.parse(linhas || '[]');
    } catch {
      usuarios = [];
    }
    return respostaJson(resposta, 200, { users: usuarios, aud: 'authenticated' });
  }

  let correspondenciaItem = /^\/admin\/users\/([0-9a-f-]{36})$/.exec(caminho);
  if (correspondenciaItem && requisicao.method === 'GET') {
    const linha = codigoSql(`select coalesce(row_to_json(u)::text, 'null') from (
        select id::text as id, email,
               email_confirmed_at::text as email_confirmed_at,
               created_at::text as created_at
        from auth.users where id = '${escaparTexto(correspondenciaItem[1])}'::uuid) u`);
    let usuario = null;
    try {
      usuario = JSON.parse(linha || 'null');
    } catch {
      usuario = null;
    }
    if (!usuario) return respostaJson(resposta, 404, { error: 'user_not_found' });
    return respostaJson(resposta, 200, { user: usuario });
  }

  if (caminho === '/admin/generate_link' && requisicao.method === 'POST') {
    const corpo = await lerCorpo(requisicao);
    const email = String(corpo.email ?? '')
      .trim()
      .toLowerCase();
    const tipo = String(corpo.type ?? 'invite');
    const redirecionarPara = corpo.redirect_to ?? corpo.options?.redirectTo ?? '';

    if (
      redirecionarPara &&
      !DESTINOS_REDIRECIONAMENTO_PERMITIDOS.some((primeiroItem) => redirecionarPara.startsWith(primeiroItem))
    ) {
      return respostaJson(resposta, 400, {
        error: 'validation_failed',
        error_code: 'validation_failed',
        msg: `Redirect URL not allowed: ${redirecionarPara}`,
      });
    }

    let usuarioIdentificador = codigoSql(
      `select id from auth.users where lower(email) = '${escaparTexto(email)}' limit 1`,
    );

    if (tipo === 'invite') {
      if (usuarioIdentificador) {
        const confirmado = codigoSql(`select case when email_confirmed_at is null then '' else 'y' end
                               from auth.users where id = '${escaparTexto(usuarioIdentificador)}'::uuid`);
        if (confirmado === 'y') {
          return respostaJson(resposta, 422, {
            error: 'email_exists',
            error_code: 'email_exists',
            msg: 'A user with this email address has already been registered',
          });
        }
      } else {
        usuarioIdentificador = codigoSql(`insert into auth.users (id, email, aud, role)
                      values (gen_random_uuid(), '${escaparTexto(email)}', 'authenticated', 'authenticated')
                      returning id`);
      }
    } else if (!usuarioIdentificador) {
      return respostaJson(resposta, 404, { error: 'user_not_found', msg: 'User not found' });
    }

    const codigoTemporario = gerarBytesAleatorios(16).toString('hex');
    const sessao = sessaoParaUsuario(usuarioIdentificador);
    const separadorAtual = redirecionarPara.includes('#') ? '&' : '#';
    const linkAcao =
      `${redirecionarPara}${separadorAtual}access_token=${sessao.access_token}` +
      `&refresh_token=${sessao.refresh_token}&type=${tipo}&expires_in=3600`;

    return respostaJson(resposta, 200, {
      properties: {
        action_link: linkAcao,
        email_otp: codigoTemporario,
        hashed_token: codigoTemporario,
        redirect_to: redirecionarPara,
        verification_type: tipo,
      },
      user: { id: usuarioIdentificador, email },
    });
  }

  return respostaJson(resposta, 404, { error: 'not_found', path: caminho });
}

criarServidor(async (requisicao, resposta) => {
  const endereco = new URL(requisicao.url, `http://127.0.0.1:${PORTA}`);

  try {
    if (requisicao.method === 'OPTIONS') return respostaJson(resposta, 204, {});

    if (endereco.pathname.startsWith('/auth/v1'))
      return await tratarAutenticacao(requisicao, resposta, endereco);
    if (endereco.pathname.startsWith('/rest/v1')) return await tratarRest(requisicao, resposta, endereco);
    if (endereco.pathname.startsWith('/functions/v1'))
      return await tratarFuncoes(requisicao, resposta, endereco);
    if (endereco.pathname === '/')
      return respostaJson(resposta, 200, { gateway: 'pnf-dev', pgrst: POSTGREST });

    return respostaJson(resposta, 404, { error: 'not_found', path: endereco.pathname });
  } catch (erro) {
    console.error('[gateway] erro não tratado', endereco.pathname, erro);
    if (!resposta.headersSent)
      return respostaJson(resposta, 500, { error: 'gateway_error', message: erro.message });
    return resposta.end();
  }
}).listen(PORTA, '127.0.0.1', () => {
  process.stdout.write(`gateway de desenvolvimento em http://127.0.0.1:${PORTA}\n`);
});

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { codigoTemporarioPorTempo as totp };
