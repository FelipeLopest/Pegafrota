export const PAPEIS_VALIDOS = ['company_admin', 'fleet_manager', 'operator', 'viewer'] as const;
export type Papel = (typeof PAPEIS_VALIDOS)[number];

export const ACOES_VALIDAS = ['list', 'create', 'invite', 'deactivate', 'reactivate', 'change_role'] as const;
export type Acao = (typeof ACOES_VALIDAS)[number];

export const PERMISSAO_OBRIGATORIA: Record<Acao, string> = {
  list: 'users.read',
  create: 'users.manage',
  invite: 'users.manage',
  deactivate: 'users.manage',
  reactivate: 'users.manage',
  change_role: 'users.manage',
};

export interface CorpoRequisicao {
  action?: unknown;
  email?: unknown;
  fullName?: unknown;
  phone?: unknown;
  role?: unknown;
  userId?: unknown;
  password?: unknown;
  idempotencyKey?: unknown;
}

export interface CorpoInterpretado {
  action: Acao;
  email?: string;
  fullName?: string;
  phone?: string | null;
  role?: Papel;
  userId?: string;
  password?: string;
  idempotencyKey?: string;
}

export interface Chamador {
  userId: string;
  companyId: string;
  role: Papel;
  permissions: string[];
}

export interface Dependencias {
  createUserClient: (cabecalhoAutorizacao: string) => any;
  createAdminClient: () => any;
  allowedOrigins: string[];
  inviteRedirectTo?: string;
  logger?: { error: (...argumentos: unknown[]) => void };
}

const EXPRESSAO_IDENTIFICADOR = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPRESSAO_EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const TAMANHO_MINIMO_SENHA = 12;
const TAMANHO_PAGINA_USUARIOS_AUTENTICACAO = 200;
const LIMITE_PAGINAS_USUARIOS_AUTENTICACAO = 100;

export function cabecalhosCors(origem: string | null, permitido: string[]): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (origem && permitido.includes(origem)) {
    base['Access-Control-Allow-Origin'] = origem;
  }
  return base;
}

export function origemPermitida(origem: string | null, permitido: string[]): boolean {
  return origem === null || permitido.includes(origem);
}

function falhar(
  codigo: string,
  mensagem: string,
  situacao: number,
  cabecalhos: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error: { code: codigo, message: mensagem } }), {
    status: situacao,
    headers: { ...cabecalhos, 'Content-Type': 'application/json' },
  });
}

function sucesso(dadosEnvio: unknown, situacao: number, cabecalhos: Record<string, string>): Response {
  return new Response(JSON.stringify({ data: dadosEnvio }), {
    status: situacao,
    headers: { ...cabecalhos, 'Content-Type': 'application/json' },
  });
}

interface ErroMapeado {
  status: number;
  code: string;
  message: string;
}

const ERROS_POR_DICA: Record<string, ErroMapeado> = {
  PROFILE_GLOBALLY_INACTIVE: {
    status: 409,
    code: 'PROFILE_GLOBALLY_INACTIVE',
    message: 'Este usuário está suspenso na plataforma. A reativação não é feita pela empresa.',
  },
  USER_ALREADY_LINKED: {
    status: 409,
    code: 'USER_ALREADY_LINKED',
    message: 'Este e-mail já possui vínculo ativo com uma empresa.',
  },
  LAST_ADMIN_PROTECTED: {
    status: 409,
    code: 'LAST_COMPANY_ADMIN',
    message: 'A empresa precisa manter ao menos um administrador ativo.',
  },
  CANNOT_DEACTIVATE_SELF: {
    status: 409,
    code: 'CANNOT_DEACTIVATE_SELF',
    message: 'Você não pode desativar a si mesmo.',
  },
  IDEMPOTENCY_KEY_REUSED: {
    status: 409,
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Esta chave de idempotência já foi usada para outra operação.',
  },
  NOT_FOUND: {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Usuário não encontrado nesta empresa.',
  },
  PERMISSION_DENIED: {
    status: 403,
    code: 'PERMISSION_DENIED',
    message: 'Permissão insuficiente para esta operação.',
  },
  INVALID_INPUT: {
    status: 400,
    code: 'INVALID_INPUT',
    message: 'Dados inválidos.',
  },
};

export function mapearErroBanco(erro: any): ErroMapeado | null {
  if (!erro) return null;
  const dica = typeof erro.hint === 'string' ? erro.hint.trim() : '';
  if (dica && ERROS_POR_DICA[dica]) return ERROS_POR_DICA[dica];

  const conteudoBusca = `${erro.message ?? ''} ${erro.details ?? ''} ${dica}`;
  for (const chave of Object.keys(ERROS_POR_DICA)) {
    if (conteudoBusca.includes(chave)) return ERROS_POR_DICA[chave];
  }
  if (conteudoBusca.includes('LAST_COMPANY_ADMIN')) return ERROS_POR_DICA.LAST_ADMIN_PROTECTED;
  return null;
}

export function interpretarCorpo(bruto: CorpoRequisicao): { body: CorpoInterpretado } | { error: string } {
  if (typeof bruto !== 'object' || bruto === null) return { error: 'Corpo deve ser um objeto JSON.' };

  const acao = bruto.action;
  if (typeof acao !== 'string' || !ACOES_VALIDAS.includes(acao as Acao)) {
    return { error: 'Ação desconhecida.' };
  }

  const interpretado: CorpoInterpretado = { action: acao as Acao };

  if (bruto.idempotencyKey !== undefined) {
    if (typeof bruto.idempotencyKey !== 'string' || bruto.idempotencyKey.trim().length < 8) {
      return { error: 'idempotencyKey deve ter ao menos 8 caracteres.' };
    }
    interpretado.idempotencyKey = bruto.idempotencyKey.trim();
  }

  if (acao === 'create' || acao === 'invite') {
    if (typeof bruto.email !== 'string' || !EXPRESSAO_EMAIL.test(bruto.email.trim())) {
      return { error: 'E-mail inválido.' };
    }
    if (typeof bruto.fullName !== 'string' || bruto.fullName.trim().length < 2) {
      return { error: 'Nome completo obrigatório.' };
    }
    if (typeof bruto.role !== 'string' || !PAPEIS_VALIDOS.includes(bruto.role as Papel)) {
      return { error: 'Papel inválido.' };
    }
    if (bruto.phone !== undefined && bruto.phone !== null && typeof bruto.phone !== 'string') {
      return { error: 'Telefone inválido.' };
    }
    interpretado.email = bruto.email.trim().toLowerCase();
    interpretado.fullName = bruto.fullName.trim();
    interpretado.role = bruto.role as Papel;
    interpretado.phone = typeof bruto.phone === 'string' ? bruto.phone.trim() : null;

    if (acao === 'create') {
      if (typeof bruto.password !== 'string' || bruto.password.length < TAMANHO_MINIMO_SENHA) {
        return { error: `A senha precisa de ao menos ${TAMANHO_MINIMO_SENHA} caracteres.` };
      }
      interpretado.password = bruto.password;
    }
  }

  if (acao === 'deactivate' || acao === 'reactivate' || acao === 'change_role') {
    if (typeof bruto.userId !== 'string' || !EXPRESSAO_IDENTIFICADOR.test(bruto.userId)) {
      return { error: 'userId obrigatório.' };
    }
    interpretado.userId = bruto.userId;

    if (acao === 'change_role') {
      if (typeof bruto.role !== 'string' || !PAPEIS_VALIDOS.includes(bruto.role as Papel)) {
        return { error: 'Papel inválido.' };
      }
      interpretado.role = bruto.role as Papel;
    }
  }

  return { body: interpretado };
}

export function interpretarContexto(
  contexto: unknown,
): { caller: Omit<Chamador, 'userId'> } | { error: string } {
  if (typeof contexto !== 'object' || contexto === null) return { error: 'CONTEXT_INVALID' };
  const registro = contexto as Record<string, unknown>;

  if (registro.authenticated !== true) return { error: 'UNAUTHENTICATED' };
  if (registro.sessionState !== 'ACTIVE') return { error: 'NO_ACTIVE_MEMBERSHIP' };

  const empresaIdentificador = typeof registro.companyId === 'string' ? registro.companyId : null;
  const papel = typeof registro.role === 'string' ? registro.role : null;

  if (!empresaIdentificador || !EXPRESSAO_IDENTIFICADOR.test(empresaIdentificador))
    return { error: 'CONTEXT_INVALID' };
  if (!papel || !PAPEIS_VALIDOS.includes(papel as Papel)) return { error: 'CONTEXT_INVALID' };
  if (!Array.isArray(registro.permissions)) return { error: 'CONTEXT_INVALID' };

  const permissoes = registro.permissions.filter(
    (parametroItem): parametroItem is string => typeof parametroItem === 'string',
  );

  return { caller: { companyId: empresaIdentificador, role: papel as Papel, permissions: permissoes } };
}

export async function impressaoDigitalAcao(
  empresaIdentificador: string,
  corpo: CorpoInterpretado,
): Promise<string> {
  const canonico = JSON.stringify([
    corpo.action,
    empresaIdentificador,
    corpo.userId ?? null,
    corpo.email ?? null,
    corpo.role ?? null,
    corpo.fullName ?? null,
    corpo.phone ?? null,
  ]);
  const bytes = new TextEncoder().encode(canonico);
  const resumoCriptografico = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(resumoCriptografico))
    .map((segundoItem) => segundoItem.toString(16).padStart(2, '0'))
    .join('');
}

export async function buscarUsuarioAutenticacaoPorEmail(
  administrador: any,
  email: string,
): Promise<any | null> {
  const alvo = email.toLowerCase();
  for (let pagina = 1; pagina <= LIMITE_PAGINAS_USUARIOS_AUTENTICACAO; pagina += 1) {
    const { data: dados, error: erro } = await administrador.auth.admin.listUsers({
      page: pagina,
      perPage: TAMANHO_PAGINA_USUARIOS_AUTENTICACAO,
    });
    if (erro) throw erro;
    const usuarios = dados?.users ?? [];
    const ocorrencia = usuarios.find((usuarioItem: any) => usuarioItem.email?.toLowerCase() === alvo);
    if (ocorrencia) return ocorrencia;
    if (usuarios.length < TAMANHO_PAGINA_USUARIOS_AUTENTICACAO) return null;
  }
  throw new Error('AUTH_USER_SCAN_EXHAUSTED');
}

export async function tratarRequisicao(requisitar: Request, dependencias: Dependencias): Promise<Response> {
  const origem = requisitar.headers.get('Origin');
  const cabecalhos = cabecalhosCors(origem, dependencias.allowedOrigins);
  const registro = dependencias.logger ?? console;

  if (requisitar.method === 'OPTIONS') {
    return origemPermitida(origem, dependencias.allowedOrigins)
      ? new Response(null, { status: 204, headers: cabecalhos })
      : falhar('ORIGIN_NOT_ALLOWED', 'Origem não autorizada.', 403, cabecalhos);
  }

  if (!origemPermitida(origem, dependencias.allowedOrigins)) {
    return falhar('ORIGIN_NOT_ALLOWED', 'Origem não autorizada.', 403, cabecalhos);
  }

  if (requisitar.method !== 'POST') {
    return falhar('METHOD_NOT_ALLOWED', 'Use POST.', 405, cabecalhos);
  }

  const cabecalhoAutorizacao = requisitar.headers.get('Authorization');
  if (!cabecalhoAutorizacao?.startsWith('Bearer ')) {
    return falhar('UNAUTHENTICATED', 'Token de acesso ausente.', 401, cabecalhos);
  }

  const usuarioCliente = dependencias.createUserClient(cabecalhoAutorizacao);

  const { data: usuarioDados, error: usuarioErro } = await usuarioCliente.auth.getUser();
  if (usuarioErro || !usuarioDados?.user) {
    return falhar('UNAUTHENTICATED', 'Sessão inválida.', 401, cabecalhos);
  }

  const { data: contexto, error: contextoErro } = await usuarioCliente.rpc('my_context');
  if (contextoErro) {
    return falhar('UNAUTHENTICATED', 'Sessão inválida.', 401, cabecalhos);
  }

  const contextoInterpretado = interpretarContexto(contexto);
  if ('error' in contextoInterpretado) {
    if (contextoInterpretado.error === 'NO_ACTIVE_MEMBERSHIP') {
      return falhar('NO_ACTIVE_MEMBERSHIP', 'Seu acesso está inativo.', 403, cabecalhos);
    }
    if (contextoInterpretado.error === 'UNAUTHENTICATED') {
      return falhar('UNAUTHENTICATED', 'Sessão inválida.', 401, cabecalhos);
    }
    registro.error('admin-users: my_context fora do contrato');
    return falhar('INTERNAL_ERROR', 'Não foi possível concluir a operação.', 500, cabecalhos);
  }

  const chamador: Chamador = { userId: usuarioDados.user.id as string, ...contextoInterpretado.caller };

  let bruto: CorpoRequisicao;
  try {
    bruto = await requisitar.json();
  } catch {
    return falhar('INVALID_INPUT', 'Corpo da requisição não é JSON válido.', 400, cabecalhos);
  }

  const corpoInterpretado = interpretarCorpo(bruto);
  if ('error' in corpoInterpretado) {
    return falhar('INVALID_INPUT', corpoInterpretado.error, 400, cabecalhos);
  }
  const corpo = corpoInterpretado.body;

  const obrigatorio = PERMISSAO_OBRIGATORIA[corpo.action];
  if (!chamador.permissions.includes(obrigatorio)) {
    return falhar('PERMISSION_DENIED', `Sua função não possui a permissão ${obrigatorio}.`, 403, cabecalhos);
  }

  if (corpo.action === 'list') {
    const { data: dados, error: erro } = await usuarioCliente.rpc('company_members');
    if (erro) {
      const mapeados = mapearErroBanco(erro);
      if (mapeados) return falhar(mapeados.code, mapeados.message, mapeados.status, cabecalhos);
      registro.error('admin-users: company_members', erro);
      return falhar('INTERNAL_ERROR', 'Não foi possível concluir a operação.', 500, cabecalhos);
    }
    return sucesso(dados, 200, cabecalhos);
  }

  const administrador = dependencias.createAdminClient();

  const chaveCabecalho = requisitar.headers.get('Idempotency-Key');
  const chaveIdempotencia =
    corpo.idempotencyKey ??
    (chaveCabecalho && chaveCabecalho.trim().length >= 8 ? chaveCabecalho.trim() : undefined);

  const impressaoDigital = chaveIdempotencia ? await impressaoDigitalAcao(chamador.companyId, corpo) : null;

  if (chaveIdempotencia) {
    const { data: anterior, error: buscarErro } = await administrador.rpc('admin_find_action', {
      p_company_id: chamador.companyId,
      p_idempotency_key: chaveIdempotencia,
      p_fingerprint: impressaoDigital,
    });
    if (buscarErro) {
      const mapeados = mapearErroBanco(buscarErro);
      if (mapeados) return falhar(mapeados.code, mapeados.message, mapeados.status, cabecalhos);
      registro.error('admin-users: admin_find_action', buscarErro);
      return falhar('INTERNAL_ERROR', 'Não foi possível concluir a operação.', 500, cabecalhos);
    }
    if (anterior) {
      return sucesso({ ...(anterior.result ?? {}), replayed: true }, 200, cabecalhos);
    }
  }

  try {
    switch (corpo.action) {
      case 'create':
      case 'invite': {
        const email = corpo.email!;
        const existente = await buscarUsuarioAutenticacaoPorEmail(administrador, email);

        let usuarioIdentificador: string;
        let usuarioAutenticacaoCriadoIdentificador: string | null = null;

        if (existente) {
          usuarioIdentificador = existente.id;
        } else if (corpo.action === 'invite') {
          if (!dependencias.inviteRedirectTo) {
            return falhar(
              'INVITE_REDIRECT_NOT_CONFIGURED',
              'O endereço de ativação de conta não está configurado no servidor.',
              500,
              cabecalhos,
            );
          }
          const { data: dados, error: erro } = await administrador.auth.admin.inviteUserByEmail(email, {
            data: { full_name: corpo.fullName },
            redirectTo: dependencias.inviteRedirectTo,
          });
          if (erro) throw erro;
          usuarioIdentificador = dados.user.id;
          usuarioAutenticacaoCriadoIdentificador = usuarioIdentificador;
        } else {
          const { data: dados, error: erro } = await administrador.auth.admin.createUser({
            email,
            password: corpo.password,
            email_confirm: true,
            user_metadata: { full_name: corpo.fullName },
          });
          if (erro) throw erro;
          usuarioIdentificador = dados.user.id;
          usuarioAutenticacaoCriadoIdentificador = usuarioIdentificador;
        }

        const { data: dados, error: erro } = await administrador.rpc('admin_provision_member', {
          p_company_id: chamador.companyId,
          p_actor_user_id: chamador.userId,
          p_user_id: usuarioIdentificador,
          p_email: email,
          p_full_name: corpo.fullName,
          p_phone: corpo.phone ?? null,
          p_role: corpo.role,
          p_idempotency_key: chaveIdempotencia ?? null,
          p_fingerprint: impressaoDigital,
        });

        if (erro) {
          if (usuarioAutenticacaoCriadoIdentificador) {
            const { error: excluirErro } = await administrador.auth.admin.deleteUser(
              usuarioAutenticacaoCriadoIdentificador,
            );
            if (excluirErro) {
              registro.error(
                'admin-users: COMPENSAÇÃO FALHOU para',
                usuarioAutenticacaoCriadoIdentificador,
                excluirErro,
              );
            }
          }
          const mapeados = mapearErroBanco(erro);
          if (mapeados) return falhar(mapeados.code, mapeados.message, mapeados.status, cabecalhos);
          throw erro;
        }

        return sucesso(
          {
            ...(dados ?? {}),
            authUserExisted: Boolean(existente),
            inviteSent: corpo.action === 'invite' && !existente,
          },
          existente ? 200 : 201,
          cabecalhos,
        );
      }

      case 'deactivate':
      case 'reactivate': {
        const { data: dados, error: erro } = await administrador.rpc('admin_set_membership_active', {
          p_company_id: chamador.companyId,
          p_actor_user_id: chamador.userId,
          p_user_id: corpo.userId,
          p_active: corpo.action === 'reactivate',
          p_idempotency_key: chaveIdempotencia ?? null,
          p_fingerprint: impressaoDigital,
        });

        if (erro) {
          const mapeados = mapearErroBanco(erro);
          if (mapeados) return falhar(mapeados.code, mapeados.message, mapeados.status, cabecalhos);
          throw erro;
        }
        return sucesso(dados, 200, cabecalhos);
      }

      case 'change_role': {
        const { data: dados, error: erro } = await administrador.rpc('admin_change_member_role', {
          p_company_id: chamador.companyId,
          p_actor_user_id: chamador.userId,
          p_user_id: corpo.userId,
          p_role: corpo.role,
          p_idempotency_key: chaveIdempotencia ?? null,
          p_fingerprint: impressaoDigital,
        });

        if (erro) {
          const mapeados = mapearErroBanco(erro);
          if (mapeados) return falhar(mapeados.code, mapeados.message, mapeados.status, cabecalhos);
          throw erro;
        }
        return sucesso(dados, 200, cabecalhos);
      }

      default:
        return falhar('INVALID_INPUT', 'Ação desconhecida.', 400, cabecalhos);
    }
  } catch (erro) {
    const mapeados = mapearErroBanco(erro);
    if (mapeados) return falhar(mapeados.code, mapeados.message, mapeados.status, cabecalhos);
    registro.error('admin-users:', erro);
    return falhar('INTERNAL_ERROR', 'Não foi possível concluir a operação.', 500, cabecalhos);
  }
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export type { Papel as Role };
export type { Acao as Action };
export type { CorpoRequisicao as RequestBody };
export type { CorpoInterpretado as ParsedBody };
export type { Chamador as Caller };
export type { Dependencias as Deps };
export { buscarUsuarioAutenticacaoPorEmail as buscarUsuarioAuthPorEmail };
