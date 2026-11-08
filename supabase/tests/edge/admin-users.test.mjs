#!/usr/bin/env node
/**
 * =============================================================================
 * PegaNaFrota — testes unitários da Edge Function admin-users
 * =============================================================================
 * Cobertura desta suíte: contrato de entrada e saída, autorização por ação,
 * CORS, paginação da Admin API, impressão digital de idempotência e tradução de
 * erro do banco. Tudo com clientes falsos, sem banco.
 *
 * O que NÃO se prova aqui: que as RPCs existem, que rodam com a identidade
 * certa e que a transação desfaz o que deve. Isso é responsabilidade de
 * supabase/tests/integration/admin-users.integration.test.mjs, contra o banco
 * real — foi justamente a ausência dessa camada que deixou o achado DB-AUD2-001
 * passar na primeira rodada, porque o mock devolvia sucesso artificial.
 *
 * Uso:
 *   node --experimental-strip-types supabase/tests/edge/admin-users.test.mjs
 * =============================================================================
 */

import {
  tratarRequisicao,
  interpretarCorpo,
  interpretarContexto,
  cabecalhosCors,
  impressaoDigitalAcao,
  mapearErroBanco,
  PERMISSAO_OBRIGATORIA,
} from '../../functions/admin-users/gerenciar-equipe.ts';

const ORIGEM = 'app://peganafrota';
const PERMITIDOS = [ORIGEM, 'http://localhost:5173'];

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const IDENTIFICADOR_ADMINISTRADOR = '22222222-2222-4222-8222-222222222222';
const IDENTIFICADOR_ALVO = '33333333-3333-4333-8333-333333333333';

let aprovados = 0;
let falhou = 0;
function verificar(nome, condicao, detalhe = '') {
  if (condicao) {
    aprovados += 1;
    console.log(`ok   ${aprovados + falhou} - ${nome}`);
  } else {
    falhou += 1;
    console.log(`NOT OK ${aprovados + falhou} - ${nome}${detalhe ? ` (${detalhe})` : ''}`);
  }
}

// -----------------------------------------------------------------------------
// Duplos de teste
// -----------------------------------------------------------------------------
function criarUsuarioCliente({
  context: contexto,
  userId: usuarioIdentificador = IDENTIFICADOR_ADMINISTRADOR,
  membersResult: integrantesResultado = { companyId: EMPRESA, members: [] },
  membersError: integrantesErro = null,
}) {
  const historicoOperacoes = [];
  return {
    journal: historicoOperacoes,
    auth: { getUser: async () => ({ data: { user: { id: usuarioIdentificador } }, error: null }) },
    rpc: async (nome, parametros) => {
      historicoOperacoes.push({ rpc: nome, params: parametros });
      if (nome === 'my_context') return { data: contexto, error: null };
      if (nome === 'company_members') {
        return integrantesErro
          ? { data: null, error: integrantesErro }
          : { data: integrantesResultado, error: null };
      }
      return { data: null, error: { message: 'rpc desconhecida' } };
    },
  };
}

function criarAdministradorCliente({
  authUsers: usuariosAutenticacao = [],
  previousAction: anteriorAcao = null,
  findError: buscarErro = null,
  rpcErrors: funcaoBancoErros = {},
  rpcResults: funcaoBancoResultados = {},
} = {}) {
  const historicoOperacoes = [];
  const proximoUsuarioIdentificador = IDENTIFICADOR_ALVO;
  return {
    journal: historicoOperacoes,
    rpc: async (nome, parametros) => {
      historicoOperacoes.push({ rpc: nome, params: parametros });
      if (nome === 'admin_find_action') {
        if (buscarErro) return { data: null, error: buscarErro };
        return { data: anteriorAcao, error: null };
      }
      if (funcaoBancoErros[nome]) return { data: null, error: funcaoBancoErros[nome] };
      return { data: funcaoBancoResultados[nome] ?? { ok: true, rpc: nome }, error: null };
    },
    auth: {
      admin: {
        listUsers: async ({ page: pagina, perPage: porPagina }) => {
          historicoOperacoes.push({ listUsers: { page: pagina, perPage: porPagina } });
          const inicio = (pagina - 1) * porPagina;
          return { data: { users: usuariosAutenticacao.slice(inicio, inicio + porPagina) }, error: null };
        },
        createUser: async (dadosEnvio) => {
          historicoOperacoes.push({ createUser: dadosEnvio.email });
          return { data: { user: { id: proximoUsuarioIdentificador } }, error: null };
        },
        inviteUserByEmail: async (email, opcoes) => {
          historicoOperacoes.push({ invite: email, options: opcoes });
          return { data: { user: { id: proximoUsuarioIdentificador } }, error: null };
        },
        deleteUser: async (identificador) => {
          historicoOperacoes.push({ deleteUser: identificador });
          return { error: null };
        },
      },
    },
  };
}

const CONTEXTO_ADMINISTRADOR = {
  authenticated: true,
  sessionState: 'ACTIVE',
  userId: IDENTIFICADOR_ADMINISTRADOR,
  companyId: EMPRESA,
  role: 'company_admin',
  permissions: ['users.manage', 'users.read'],
};

const CONTEXTO_GESTOR = { ...CONTEXTO_ADMINISTRADOR, role: 'fleet_manager', permissions: ['users.read'] };
const CONTEXTO_VISUALIZADOR = { ...CONTEXTO_ADMINISTRADOR, role: 'viewer', permissions: [] };

function requisitar(
  corpo,
  {
    origin: origem = ORIGEM,
    method: metodo = 'POST',
    auth: autenticacao = 'Bearer token',
    headers: cabecalhos = {},
  } = {},
) {
  return new Request('https://example.test/admin-users', {
    method: metodo,
    headers: {
      ...(origem ? { Origin: origem } : {}),
      ...(autenticacao ? { Authorization: autenticacao } : {}),
      'Content-Type': 'application/json',
      ...cabecalhos,
    },
    ...(metodo === 'POST' ? { body: JSON.stringify(corpo ?? {}) } : {}),
  });
}

function dependencias(usuarioCliente, administradorCliente) {
  return {
    createUserClient: () => usuarioCliente,
    createAdminClient: () => administradorCliente,
    allowedOrigins: PERMITIDOS,
    inviteRedirectTo: 'https://admin.example.test/?flow=team-invite',
    logger: { error: () => {} },
  };
}

// =============================================================================
async function principal() {
  console.log('PegaNaFrota — Edge Function admin-users (unitário)\n');

  // ---------------------------------------------------------------------------
  // DB-AUD-001 — contrato de my_context
  // ---------------------------------------------------------------------------
  {
    const contextoLocal = interpretarContexto(CONTEXTO_ADMINISTRADOR);
    verificar(
      'DB-AUD-001 interpretarContexto lê role no nível principal',
      !('error' in contextoLocal) && contextoLocal.caller.role === 'company_admin',
    );

    const antigo = interpretarContexto({
      authenticated: true,
      sessionState: 'ACTIVE',
      companyId: EMPRESA,
      membership: { role: 'company_admin' },
      permissions: [],
    });
    verificar(
      'DB-AUD-001 formato antigo (membership.role) é recusado com erro tratado',
      'error' in antigo && antigo.error === 'CONTEXT_INVALID',
    );
  }

  {
    const usuarioCliente = criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR });
    const administrador = criarAdministradorCliente();
    const resposta = await tratarRequisicao(
      requisitar({ action: 'list' }),
      dependencias(usuarioCliente, administrador),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      'DB-AUD-001 admin ativo lista usuários (200)',
      resposta.status === 200,
      `status ${resposta.status}`,
    );
    verificar('DB-AUD-001 resposta usa envelope data', dadosEnvio.data !== undefined);

    // DB-AUD2-001: a listagem PRECISA sair pelo cliente do usuário.
    verificar(
      'DB-AUD2-001 company_members é chamada no cliente do USUÁRIO',
      usuarioCliente.journal.some((evento) => evento.rpc === 'company_members'),
    );
    verificar(
      'DB-AUD2-001 company_members NUNCA é chamada no cliente service role',
      !administrador.journal.some((evento) => evento.rpc === 'company_members'),
    );
    verificar(
      'DB-AUD2-001 list sequer cria o cliente service role',
      administrador.journal.length === 0,
      `${administrador.journal.length} chamada(s)`,
    );
  }

  {
    const resposta = await tratarRequisicao(
      requisitar({ action: 'list' }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_VISUALIZADOR }), criarAdministradorCliente()),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      'DB-AUD2-001 viewer sem users.read recebe 403',
      resposta.status === 403 && dadosEnvio.error.code === 'PERMISSION_DENIED',
    );
  }

  {
    const resposta = await tratarRequisicao(
      requisitar({ action: 'list' }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_GESTOR }), criarAdministradorCliente()),
    );
    verificar('DB-AUD2-001 gestor de frota (users.read) pode listar', resposta.status === 200);

    const alterarRegistro = await tratarRequisicao(
      requisitar({ action: 'deactivate', userId: IDENTIFICADOR_ALVO }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_GESTOR }), criarAdministradorCliente()),
    );
    const dadosEnvio = await alterarRegistro.json();
    verificar(
      'DB-AUD2-001 gestor de frota sem users.manage não muta',
      alterarRegistro.status === 403 && dadosEnvio.error.code === 'PERMISSION_DENIED',
    );
  }

  verificar(
    'DB-AUD2-001 list exige users.read e mutações exigem users.manage',
    PERMISSAO_OBRIGATORIA.list === 'users.read' &&
      ['create', 'invite', 'deactivate', 'reactivate', 'change_role'].every(
        (primeiroItem) => PERMISSAO_OBRIGATORIA[primeiroItem] === 'users.manage',
      ),
  );

  {
    const resposta = await tratarRequisicao(
      requisitar({ action: 'list' }),
      dependencias(
        criarUsuarioCliente({ context: { authenticated: true, sessionState: 'NO_ACTIVE_MEMBERSHIP' } }),
        criarAdministradorCliente(),
      ),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      'DB-AUD-001 usuário inativo recebe 403 NO_ACTIVE_MEMBERSHIP',
      resposta.status === 403 && dadosEnvio.error.code === 'NO_ACTIVE_MEMBERSHIP',
    );
  }

  {
    const resposta = await tratarRequisicao(
      requisitar({ action: 'list' }, { auth: null }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), criarAdministradorCliente()),
    );
    verificar('DB-AUD-001 requisição sem token recebe 401', resposta.status === 401);
  }

  // ---------------------------------------------------------------------------
  // Schema do request
  // ---------------------------------------------------------------------------
  {
    verificar('schema recusa ação desconhecida', 'error' in interpretarCorpo({ action: 'drop_database' }));
    verificar(
      'schema recusa e-mail inválido',
      'error' in
        interpretarCorpo({
          action: 'create',
          email: 'x',
          fullName: 'Ana',
          role: 'viewer',
          password: 'a'.repeat(12),
        }),
    );
    verificar(
      'schema recusa senha curta',
      'error' in
        interpretarCorpo({
          action: 'create',
          email: 'a@b.com',
          fullName: 'Ana',
          role: 'viewer',
          password: 'curta',
        }),
    );
    verificar(
      'schema recusa userId que não é uuid',
      'error' in interpretarCorpo({ action: 'deactivate', userId: 'nao-uuid' }),
    );
    verificar(
      'schema aceita create válido',
      !(
        'error' in
        interpretarCorpo({
          action: 'create',
          email: 'a@b.com',
          fullName: 'Ana',
          role: 'viewer',
          password: 'a'.repeat(12),
        })
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Convite de integrante da equipe — ativação de senha no fluxo público
  // ---------------------------------------------------------------------------
  {
    const administrador = criarAdministradorCliente();
    const resposta = await tratarRequisicao(
      requisitar({
        action: 'invite',
        email: 'nova.pessoa@empresa.example.com',
        fullName: 'Nova Pessoa',
        role: 'operator',
      }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), administrador),
    );
    const dadosEnvio = await resposta.json();
    const convite = administrador.journal.find((evento) => evento.invite);
    verificar(
      'convite novo usa redirect público de ativação',
      convite?.options?.redirectTo === 'https://admin.example.test/?flow=team-invite',
    );
    verificar(
      'convite novo informa inviteSent=true',
      resposta.status === 201 &&
        dadosEnvio.data.inviteSent === true &&
        dadosEnvio.data.authUserExisted === false,
    );
  }

  {
    const existenteIdentificador = '44444444-4444-4444-8444-444444444444';
    const administrador = criarAdministradorCliente({
      authUsers: [{ id: existenteIdentificador, email: 'ja.existe@empresa.example.com' }],
    });
    const resposta = await tratarRequisicao(
      requisitar({
        action: 'invite',
        email: 'ja.existe@empresa.example.com',
        fullName: 'Já Existe',
        role: 'viewer',
      }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), administrador),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      'conta Auth existente não recebe segundo convite',
      !administrador.journal.some((evento) => evento.invite),
    );
    verificar(
      'conta Auth existente informa authUserExisted=true',
      resposta.status === 200 &&
        dadosEnvio.data.authUserExisted === true &&
        dadosEnvio.data.inviteSent === false,
    );
  }

  {
    const dadosRegistro = dependencias(
      criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }),
      criarAdministradorCliente(),
    );
    dadosRegistro.inviteRedirectTo = '';
    const resposta = await tratarRequisicao(
      requisitar({
        action: 'invite',
        email: 'sem.redirect@empresa.example.com',
        fullName: 'Sem Redirect',
        role: 'viewer',
      }),
      dadosRegistro,
    );
    const dadosEnvio = await resposta.json();
    verificar(
      'convite novo falha de forma explícita sem URL de ativação',
      resposta.status === 500 && dadosEnvio.error.code === 'INVITE_REDIRECT_NOT_CONFIGURED',
    );
  }

  // ---------------------------------------------------------------------------
  // DB-AUD-016 — paginação da busca no Auth
  // ---------------------------------------------------------------------------
  {
    const usuariosAutenticacao = Array.from({ length: 450 }, (ignorado, indiceItem) => ({
      id: `user-${indiceItem}`,
      email: `pessoa${indiceItem}@empresa.example.com`,
    }));
    const administrador = criarAdministradorCliente({ authUsers: usuariosAutenticacao });
    const resposta = await tratarRequisicao(
      requisitar({
        action: 'create',
        email: 'pessoa430@empresa.example.com',
        fullName: 'Pessoa 430',
        role: 'viewer',
        password: 'senha-bem-longa-1',
      }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), administrador),
    );
    const paginas = administrador.journal
      .filter((evento) => evento.listUsers)
      .map((evento) => evento.listUsers.page);
    verificar(
      'DB-AUD-016 busca percorre mais de uma página',
      paginas.length >= 3,
      `páginas: ${paginas.join(',')}`,
    );
    verificar(
      'DB-AUD-016 usuário fora da primeira página é reaproveitado, não recriado',
      !administrador.journal.some((evento) => evento.createUser) && resposta.status === 200,
      `status ${resposta.status}`,
    );
    const cadastroEmpresa = administrador.journal.find((evento) => evento.rpc === 'admin_provision_member');
    verificar(
      'DB-AUD-016 provisionamento recebe o UUID da conta encontrada',
      cadastroEmpresa?.params?.p_user_id === 'user-430',
      cadastroEmpresa?.params?.p_user_id,
    );
  }

  // ---------------------------------------------------------------------------
  // DB-AUD2-003 — a mutação é uma RPC transacional, não uma sequência
  // ---------------------------------------------------------------------------
  {
    const administrador = criarAdministradorCliente();
    await tratarRequisicao(
      requisitar({
        action: 'create',
        email: 'nova@empresa.example.com',
        fullName: 'Conta Nova',
        role: 'operator',
        password: 'senha-bem-longa-1',
      }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), administrador),
    );
    verificar(
      'DB-AUD2-003 provisionamento usa uma única RPC transacional',
      administrador.journal.filter((evento) => evento.rpc === 'admin_provision_member').length === 1,
    );
    verificar(
      'DB-AUD2-003 a Edge Function não escreve mais em profiles nem memberships',
      !administrador.journal.some((evento) => evento.table),
    );
  }

  {
    // Falha na RPC + conta criada nesta requisição -> compensa o GoTrue.
    const administrador = criarAdministradorCliente({
      rpcErrors: { admin_provision_member: { message: 'boom', hint: null } },
    });
    const resposta = await tratarRequisicao(
      requisitar({
        action: 'create',
        email: 'nova2@empresa.example.com',
        fullName: 'Conta Nova 2',
        role: 'operator',
        password: 'senha-bem-longa-1',
      }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), administrador),
    );
    verificar('DB-AUD2-003 falha da RPC devolve erro', resposta.status === 500);
    verificar(
      'DB-AUD2-003 conta criada nesta requisição é removida',
      administrador.journal.some((evento) => evento.deleteUser === IDENTIFICADOR_ALVO),
    );
  }

  {
    // Conta que JÁ EXISTIA não pode ser apagada na compensação.
    const administrador = criarAdministradorCliente({
      authUsers: [{ id: 'existente-1', email: 'existente@empresa.example.com' }],
      rpcErrors: { admin_provision_member: { message: 'boom', hint: null } },
    });
    await tratarRequisicao(
      requisitar({
        action: 'create',
        email: 'existente@empresa.example.com',
        fullName: 'Existente',
        role: 'operator',
        password: 'senha-bem-longa-1',
      }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), administrador),
    );
    verificar(
      'DB-AUD2-003 conta preexistente NUNCA é apagada na compensação',
      !administrador.journal.some((evento) => evento.deleteUser),
    );
  }

  // ---------------------------------------------------------------------------
  // DB-AUD2-002 — tradução do erro de profile suspenso
  // ---------------------------------------------------------------------------
  {
    const administrador = criarAdministradorCliente({
      rpcErrors: {
        admin_provision_member: {
          message: 'PROFILE_GLOBALLY_INACTIVE: o usuário está suspenso globalmente',
          hint: 'PROFILE_GLOBALLY_INACTIVE',
        },
      },
    });
    const resposta = await tratarRequisicao(
      requisitar({
        action: 'create',
        email: 'suspenso@empresa.example.com',
        fullName: 'Suspenso',
        role: 'operator',
        password: 'senha-bem-longa-1',
      }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), administrador),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      'DB-AUD2-002 profile suspenso vira 409 PROFILE_GLOBALLY_INACTIVE',
      resposta.status === 409 && dadosEnvio.error.code === 'PROFILE_GLOBALLY_INACTIVE',
      `status ${resposta.status}`,
    );
  }

  // ---------------------------------------------------------------------------
  // Tradução de erro do banco
  // ---------------------------------------------------------------------------
  {
    verificar(
      'DB-AUD-015 LAST_ADMIN_PROTECTED vira 409 LAST_COMPANY_ADMIN',
      mapearErroBanco({ hint: 'LAST_ADMIN_PROTECTED' })?.code === 'LAST_COMPANY_ADMIN',
    );
    verificar(
      'DB-AUD-015 contrato antigo LAST_COMPANY_ADMIN continua reconhecido',
      mapearErroBanco({ message: 'LAST_COMPANY_ADMIN' })?.status === 409,
    );
    verificar('NOT_FOUND vira 404', mapearErroBanco({ hint: 'NOT_FOUND' })?.status === 404);
    verificar(
      'CANNOT_DEACTIVATE_SELF vira 409',
      mapearErroBanco({ hint: 'CANNOT_DEACTIVATE_SELF' })?.status === 409,
    );
    verificar('PERMISSION_DENIED vira 403', mapearErroBanco({ hint: 'PERMISSION_DENIED' })?.status === 403);
    verificar(
      'erro sem contrato conhecido não é traduzido',
      mapearErroBanco({ message: 'algo inesperado' }) === null,
    );
  }

  {
    const administrador = criarAdministradorCliente({
      rpcErrors: {
        admin_set_membership_active: {
          message: 'LAST_ADMIN_PROTECTED: a empresa precisa manter ao menos um company_admin ativo',
          hint: 'LAST_ADMIN_PROTECTED',
        },
      },
    });
    const resposta = await tratarRequisicao(
      requisitar({ action: 'deactivate', userId: IDENTIFICADOR_ALVO }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), administrador),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      'DB-AUD-015 último admin vira 409 e não 500',
      resposta.status === 409 && dadosEnvio.error.code === 'LAST_COMPANY_ADMIN',
    );
  }

  {
    const administrador = criarAdministradorCliente({
      rpcErrors: {
        admin_set_membership_active: {
          message: 'CANNOT_DEACTIVATE_SELF',
          hint: 'CANNOT_DEACTIVATE_SELF',
        },
      },
    });
    const resposta = await tratarRequisicao(
      requisitar({ action: 'deactivate', userId: IDENTIFICADOR_ADMINISTRADOR }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), administrador),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      'autodesativação vira 409 CANNOT_DEACTIVATE_SELF',
      resposta.status === 409 && dadosEnvio.error.code === 'CANNOT_DEACTIVATE_SELF',
    );
  }

  // ---------------------------------------------------------------------------
  // DB-AUD2-005 — impressão digital da idempotência
  // ---------------------------------------------------------------------------
  {
    const base = { action: 'change_role', userId: IDENTIFICADOR_ALVO, role: 'viewer' };
    const primeiroFiltro = await impressaoDigitalAcao(EMPRESA, base);
    const segundoFiltro = await impressaoDigitalAcao(EMPRESA, { ...base });
    const terceiroFiltro = await impressaoDigitalAcao(EMPRESA, { ...base, role: 'operator' });
    const quartoFiltro = await impressaoDigitalAcao(EMPRESA, { ...base, action: 'deactivate' });
    const quintoFiltro = await impressaoDigitalAcao('99999999-9999-4999-8999-999999999999', base);

    verificar('DB-AUD2-005 mesmo payload gera a mesma impressão digital', primeiroFiltro === segundoFiltro);
    verificar('DB-AUD2-005 payload diferente gera impressão diferente', primeiroFiltro !== terceiroFiltro);
    verificar('DB-AUD2-005 ação diferente gera impressão diferente', primeiroFiltro !== quartoFiltro);
    verificar('DB-AUD2-005 empresa diferente gera impressão diferente', primeiroFiltro !== quintoFiltro);

    const comSenha = await impressaoDigitalAcao(EMPRESA, {
      action: 'create',
      email: 'a@b.com',
      fullName: 'A',
      role: 'viewer',
      password: 'segredo-longo',
    });
    const comOutroSenha = await impressaoDigitalAcao(EMPRESA, {
      action: 'create',
      email: 'a@b.com',
      fullName: 'A',
      role: 'viewer',
      password: 'outro-segredo',
    });
    verificar('DB-AUD2-005 a senha não entra na impressão digital', comSenha === comOutroSenha);
  }

  {
    const administrador = criarAdministradorCliente();
    await tratarRequisicao(
      requisitar({
        action: 'change_role',
        userId: IDENTIFICADOR_ALVO,
        role: 'viewer',
        idempotencyKey: 'chave-de-teste-0001',
      }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), administrador),
    );
    const buscar = administrador.journal.find((evento) => evento.rpc === 'admin_find_action');
    const alterarRegistro = administrador.journal.find((evento) => evento.rpc === 'admin_change_member_role');
    verificar(
      'DB-AUD2-005 a consulta de idempotência envia a impressão digital',
      typeof buscar?.params?.p_fingerprint === 'string' && buscar.params.p_fingerprint.length === 64,
    );
    verificar(
      'DB-AUD2-005 a gravação envia a MESMA impressão digital',
      alterarRegistro?.params?.p_fingerprint === buscar?.params?.p_fingerprint,
    );
  }

  {
    const administrador = criarAdministradorCliente({
      findError: { message: 'IDEMPOTENCY_KEY_REUSED', hint: 'IDEMPOTENCY_KEY_REUSED' },
    });
    const resposta = await tratarRequisicao(
      requisitar({ action: 'deactivate', userId: IDENTIFICADOR_ALVO, idempotencyKey: 'chave-de-teste-0001' }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), administrador),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      'DB-AUD2-005 chave reutilizada em outra operação vira 409',
      resposta.status === 409 && dadosEnvio.error.code === 'IDEMPOTENCY_KEY_REUSED',
    );
  }

  {
    const administrador = criarAdministradorCliente({
      previousAction: {
        eventId: 7,
        action: 'user_provisioned',
        entityId: IDENTIFICADOR_ALVO,
        result: { userId: IDENTIFICADOR_ALVO, status: 'provisioned' },
      },
    });
    const resposta = await tratarRequisicao(
      requisitar({
        action: 'create',
        email: 'nova@empresa.example.com',
        fullName: 'Conta Nova',
        role: 'operator',
        password: 'senha-bem-longa-1',
        idempotencyKey: 'chave-de-teste-0002',
      }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), administrador),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      'DB-AUD-011 reenvio com a mesma chave devolve o resultado anterior',
      resposta.status === 200 && dadosEnvio.data.replayed === true,
    );
    verificar(
      'DB-AUD-011 reenvio não cria nada',
      !administrador.journal.some((evento) => evento.createUser || evento.invite),
    );
  }

  // ---------------------------------------------------------------------------
  // DB-AUD-017 — CORS
  // ---------------------------------------------------------------------------
  {
    const cabecalhos = cabecalhosCors(ORIGEM, PERMITIDOS);
    verificar(
      'DB-AUD-017 origem permitida recebe eco da própria origem',
      cabecalhos['Access-Control-Allow-Origin'] === ORIGEM,
    );
    verificar(
      'DB-AUD-017 nenhuma resposta usa curinga',
      Object.values(cabecalhosCors('https://site-malicioso.example', PERMITIDOS)).every(
        (veiculoItem) => veiculoItem !== '*',
      ),
    );
    verificar('DB-AUD-017 cabeçalho Vary: Origin presente', cabecalhos.Vary === 'Origin');
  }

  {
    const resposta = await tratarRequisicao(
      requisitar({ action: 'list' }, { origin: 'https://site-malicioso.example' }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), criarAdministradorCliente()),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      'DB-AUD-017 origem fora da allowlist recebe 403',
      resposta.status === 403 && dadosEnvio.error.code === 'ORIGIN_NOT_ALLOWED',
    );
  }

  {
    const resposta = await tratarRequisicao(
      requisitar(null, { method: 'OPTIONS' }),
      dependencias(criarUsuarioCliente({ context: CONTEXTO_ADMINISTRADOR }), criarAdministradorCliente()),
    );
    verificar('DB-AUD-017 preflight de origem permitida responde 204', resposta.status === 204);
  }

  // ---------------------------------------------------------------------------
  console.log(`\n${aprovados} passaram, ${falhou} falharam`);
  if (falhou > 0) process.exit(1);
}

principal().catch((erro) => {
  console.error('Falha inesperada:', erro);
  process.exit(1);
});
