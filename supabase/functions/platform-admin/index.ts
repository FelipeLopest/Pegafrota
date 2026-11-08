import { createClient as criarCliente } from '@supabase/supabase-js';

const ENDERECO_SUPABASE = Deno.env.get('SUPABASE_URL')!;
const CHAVE_PUBLICA = Deno.env.get('SUPABASE_ANON_KEY')!;
const CHAVE_PRIVILEGIADA = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const VALIDADE_CONVITE_HORAS = Number(Deno.env.get('INVITE_TTL_HOURS') ?? '72');
const INTERVALO_REENVIO_SEGUNDOS = Number(Deno.env.get('RESEND_COOLDOWN_SECONDS') ?? '300');

const MODO_ENTREGA_CONVITE = Deno.env.get('INVITE_DELIVERY') ?? 'smtp';
const ENDERECO_BASE_CONVITE = Deno.env.get('INVITE_BASE_URL') ?? '';
const ENDERECO_SMTP = Deno.env.get('SMTP_RELAY_URL') ?? '';
const TOKEN_SMTP = Deno.env.get('SMTP_RELAY_TOKEN') ?? '';
const REMETENTE_CONVITE = Deno.env.get('INVITE_FROM') ?? 'nao-responda@peganafrota.app';
const TAMANHO_MINIMO_SENHA = 12;
const TAMANHO_MAXIMO_SENHA = 72;

const ORIGENS_PERMITIDAS = (Deno.env.get('ADMIN_WEB_ORIGINS') ?? 'http://localhost:5174')
  .split(',')
  .map((objetoItem) => objetoItem.trim())
  .filter(Boolean);

function cabecalhosCors(origem: string | null): Record<string, string> {
  const permitido = origem && ORIGENS_PERMITIDAS.includes(origem) ? origem : ORIGENS_PERMITIDAS[0];
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function respostaJson(
  corpo: unknown,
  situacao: number,
  origem: string | null,
  extra: Record<string, string> = {},
) {
  return new Response(JSON.stringify(corpo), {
    status: situacao,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...cabecalhosCors(origem),
      ...extra,
    },
  });
}

const SITUACAO_HTTP_POR_DICA: Record<string, number> = {
  NOT_PLATFORM_ADMIN: 403,
  PERMISSION_DENIED: 403,
  BOOTSTRAP_INVALID_TOKEN: 403,
  INVITE_INVALID: 403,
  PROFILE_GLOBALLY_INACTIVE: 403,
  NOT_FOUND: 404,
  INVALID_INPUT: 422,
  invalid_cnpj: 422,
  invalid_email: 422,
  REASON_REQUIRED: 422,
  CONFIRMATION_MISMATCH: 422,
  IDEMPOTENCY_REUSE: 409,
  cnpj_already_exists: 409,
  auth_email_conflict: 409,
  USER_ALREADY_LINKED: 409,
  LAST_ADMIN_PROTECTED: 409,
  LAST_PLATFORM_ADMIN_PROTECTED: 409,
  USER_NOT_ACTIVE: 409,
  AUTH_UPDATE_FAILED: 502,
  AUTH_DELETE_FAILED: 502,
  CANNOT_BLOCK_SELF: 409,
  CONFLICT_STALE: 409,
  CONFLICT_STATE: 409,
  CONFLICT_ARCHIVED: 409,
  BOOTSTRAP_NOT_AVAILABLE: 409,
  BOOTSTRAP_TOKEN_CONSUMED: 409,
  BOOTSTRAP_TOKEN_EXPIRED: 409,
  INVITE_EXPIRED: 409,
  INVITE_REVOKED: 409,
  INVITE_ALREADY_ACCEPTED: 409,
  NOT_RETRYABLE: 409,
  invite_delivery_failed: 502,
  RESEND_TOO_SOON: 429,
};

interface ErroPostgres {
  message?: string;
  hint?: string;
  details?: string;
  code?: string;
}

function mapearErro(erro: ErroPostgres): { status: number; body: { error: Record<string, unknown> } } {
  const dica = erro.hint ?? undefined;
  if (!dica) {
    console.error('erro sem hint', { message: erro.message, code: erro.code, details: erro.details });
  }
  const situacao: number = (dica ? SITUACAO_HTTP_POR_DICA[dica] : undefined) ?? 500;
  return {
    status: situacao,
    body: {
      error: {
        hint: dica ?? 'INTERNAL_ERROR',
        message: situacao === 500 ? 'Erro interno. Tente novamente.' : (erro.message ?? ''),
        ...(situacao === 500 ? {} : {}),
        detail: situacao === 500 ? null : (erro.details ?? null),
      },
    },
  };
}

const administrador = criarCliente(ENDERECO_SUPABASE, CHAVE_PRIVILEGIADA, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface ator2 {
  userId: string;
  email: string | null;
}

async function autenticar(requisicao: Request): Promise<{ actor: ator2 } | { error: Response }> {
  const origem = requisicao.headers.get('origin');
  const cabecalhoAutorizacao = requisicao.headers.get('Authorization') ?? '';
  const token = cabecalhoAutorizacao.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return {
      error: respostaJson({ error: { hint: 'UNAUTHENTICATED', message: 'Token ausente.' } }, 401, origem),
    };
  }

  const publica = criarCliente(ENDERECO_SUPABASE, CHAVE_PUBLICA, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: usuarioDados, error: usuarioErro } = await publica.auth.getUser();
  if (usuarioErro || !usuarioDados?.user) {
    return {
      error: respostaJson({ error: { hint: 'UNAUTHENTICATED', message: 'Sessão inválida.' } }, 401, origem),
    };
  }

  const usuarioIdentificador = usuarioDados.user.id;

  const { data: ehAdministrador, error: papelErro } = await administrador
    .schema('platform')
    .rpc('is_platform_admin', { p_user_id: usuarioIdentificador });

  if (papelErro) {
    return { error: respostaJson(mapearErro(papelErro).body, 500, origem) };
  }

  if (ehAdministrador !== true) {
    await registrarNegacao(usuarioIdentificador, 'platform.access', 'not_platform_admin', requisicao);
    return {
      error: respostaJson(
        { error: { hint: 'NOT_PLATFORM_ADMIN', message: 'Conta sem acesso ao painel da plataforma.' } },
        403,
        origem,
      ),
    };
  }

  return { actor: { userId: usuarioIdentificador, email: usuarioDados.user.email ?? null } };
}

async function registrarNegacao(
  usuarioIdentificador: string | null,
  acao: string,
  motivo: string,
  requisicao: Request,
  extra: Record<string, unknown> = {},
) {
  try {
    await administrador.schema('platform').rpc('log_denial', {
      p_actor_user_id: usuarioIdentificador,
      p_action: acao,
      p_reason: motivo,
      p_request_id: requisicao.headers.get('x-request-id'),
      p_ip: requisicao.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      p_user_agent: requisicao.headers.get('user-agent'),
      p_metadata: extra,
      ...(extra.targetId ? { p_target_id: extra.targetId } : {}),
      ...(extra.companyId ? { p_company_id: extra.companyId } : {}),
    });
  } catch {
    console.error('falha ao registrar negação', { action: acao, reason: motivo });
  }
}

function gerarTokenAleatorio(bytes = 32): string {
  const trechoAcumulado = new Uint8Array(bytes);
  crypto.getRandomValues(trechoAcumulado);
  return Array.from(trechoAcumulado, (segundoItem) => segundoItem.toString(16).padStart(2, '0')).join('');
}

const LIMITE_PAGINAS_USUARIOS = 50;
const TAMANHO_PAGINA_USUARIOS = 200;

async function buscarUsuarioIdentificadorPorEmail(email: string): Promise<string | null> {
  const termoBusca = email.trim().toLowerCase();
  for (let pagina = 1; pagina <= LIMITE_PAGINAS_USUARIOS; pagina += 1) {
    const { data: dados, error: erro } = await administrador.auth.admin.listUsers({
      page: pagina,
      perPage: TAMANHO_PAGINA_USUARIOS,
    });
    if (erro) {
      console.error('listUsers falhou', { page: pagina, message: erro.message });
      return null;
    }
    const usuarios = dados?.users ?? [];
    const ocorrencia = usuarios.find(
      (usuarioItem: { id: string; email?: string }) => usuarioItem.email?.toLowerCase() === termoBusca,
    );
    if (ocorrencia) return ocorrencia.id;
    if (usuarios.length < TAMANHO_PAGINA_USUARIOS) return null;
  }
  console.error('findUserIdByEmail: limite de páginas atingido');
  return null;
}

type identityEstado = 'absent' | 'unconfirmed' | 'confirmed';

interface Identidade {
  state: identityEstado;
  userId: string | null;
}

async function resolverIdentidade(email: string): Promise<Identidade> {
  const usuarioIdentificador = await buscarUsuarioIdentificadorPorEmail(email);
  if (!usuarioIdentificador) return { state: 'absent', userId: null };

  const { data: dados, error: erro } = await administrador.auth.admin.getUserById(usuarioIdentificador);
  if (erro || !dados?.user) return { state: 'absent', userId: null };

  const confirmado = Boolean(dados.user.email_confirmed_at ?? dados.user.confirmed_at);
  return { state: confirmado ? 'confirmed' : 'unconfirmed', userId: usuarioIdentificador };
}

interface autenticacaoLinkResultado {
  ok: boolean;
  userId?: string;
  actionLink?: string;
  linkType?: string;
  error?: string;
  code?: string;
}

async function emitirLinkAutenticacao(argumentos: {
  email: string;
  identity: Identidade;
  inviteToken: string;
  companyId: string;
  fullName: string;
}): Promise<autenticacaoLinkResultado> {
  const {
    email,
    identity: identidade,
    inviteToken: tokenConvite,
    companyId: empresaIdentificador,
    fullName: nomeCompleto,
  } = argumentos;

  if (!ENDERECO_BASE_CONVITE) {
    return {
      ok: false,
      code: 'config_missing',
      error: 'INVITE_BASE_URL não configurada; o link de convite não pode ser montado.',
    };
  }

  const redirecionarPara = `${ENDERECO_BASE_CONVITE.replace(/\/$/, '')}/?token=${encodeURIComponent(tokenConvite)}#/convite`;

  const tipoLink: 'invite' | 'recovery' = identidade.state === 'confirmed' ? 'recovery' : 'invite';

  const opcoesLink = {
    redirectTo: redirecionarPara,
    data: { invite_token: tokenConvite, company_id: empresaIdentificador, full_name: nomeCompleto },
  };

  const { data: dados, error: erro } =
    tipoLink === 'invite'
      ? await administrador.auth.admin.generateLink({ type: 'invite', email, options: opcoesLink })
      : await administrador.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: redirecionarPara },
        });

  if (erro) {
    if (tipoLink === 'invite' && /already (registered|exists)/i.test(erro.message ?? '')) {
      return emitirLinkAutenticacao({
        ...argumentos,
        identity: { state: 'confirmed', userId: identidade.userId },
      });
    }
    return { ok: false, code: 'auth_email_conflict', error: `generateLink(${tipoLink}): ${erro.message}` };
  }

  const propriedades = (dados?.properties ?? {}) as Record<string, string>;
  const linkAcao = propriedades.action_link ?? propriedades.actionLink;
  const usuarioIdentificador = dados?.user?.id ?? identidade.userId;

  if (!linkAcao) {
    return { ok: false, code: 'auth_link_failed', error: 'generateLink não devolveu action_link' };
  }
  if (!usuarioIdentificador) {
    return { ok: false, code: 'auth_link_failed', error: 'generateLink não devolveu o id do usuário' };
  }

  return { ok: true, userId: usuarioIdentificador, actionLink: linkAcao, linkType: tipoLink };
}

async function entregarConvite(
  email: string,
  linkAcao: string,
  nomeCompleto: string,
): Promise<{ ok: boolean; error?: string }> {
  const assunto = 'Seu acesso ao PegaNaFrota';
  const corpo = [
    `Olá, ${nomeCompleto}.`,
    '',
    'Você foi cadastrado como administrador de uma empresa no PegaNaFrota.',
    'Use o link abaixo para definir sua senha e ativar seu acesso:',
    '',
    linkAcao,
    '',
    'O link é de uso único e expira. Se você não esperava este convite, ignore esta mensagem.',
  ].join('\n');

  if (MODO_ENTREGA_CONVITE === 'log') {
    console.log('[INVITE_DELIVERY=log] convite NÃO enviado; link registrado', {
      email,
      actionLink: linkAcao,
    });
    return { ok: true };
  }

  if (!ENDERECO_SMTP) {
    return { ok: false, error: 'SMTP_RELAY_URL não configurada; o convite não pode ser entregue.' };
  }

  try {
    const resposta = await fetch(ENDERECO_SMTP, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN_SMTP ? { Authorization: `Bearer ${TOKEN_SMTP}` } : {}),
      },
      body: JSON.stringify({ from: REMETENTE_CONVITE, to: email, subject: assunto, text: corpo }),
    });
    if (!resposta.ok) {
      return {
        ok: false,
        error: `relay respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (erro) {
    return { ok: false, error: `falha de rede ao enviar convite: ${(erro as Error).message}` };
  }
}

type Manipulador = (ator: ator2, dadosEnvio: any, requisicao: Request) => Promise<unknown>;

async function chamarPlataforma(funcao: string, argumentos: Record<string, unknown>) {
  const { data: dados, error: erro } = await administrador.schema('platform').rpc(funcao, argumentos);
  if (erro) throw erro;
  return dados;
}

const provisionarEmpresa: Manipulador = async (ator, dadosEnvio, requisicao) => {
  const {
    company: empresa,
    firstAdmin: primeiroAdministrador,
    idempotencyKey: chaveIdempotencia,
  } = dadosEnvio;
  const senha = typeof primeiroAdministrador?.password === 'string' ? primeiroAdministrador.password : '';

  if (senha.length < TAMANHO_MINIMO_SENHA || senha.length > TAMANHO_MAXIMO_SENHA) {
    throw {
      hint: 'INVALID_INPUT',
      message: `A senha do primeiro administrador deve ter entre ${TAMANHO_MINIMO_SENHA} e ${TAMANHO_MAXIMO_SENHA} caracteres.`,
    };
  }
  if (/^\s+$/.test(senha) || /^(.)\1+$/.test(senha)) {
    throw { hint: 'INVALID_INPUT', message: 'Escolha uma senha mais segura para o primeiro administrador.' };
  }

  // A senha NUNCA entra no request_payload da operação. Ela existe apenas na
  // requisição autenticada e é entregue diretamente ao Supabase Auth.
  const primeiroAdministradorAuditavel = {
    fullName: primeiroAdministrador?.fullName,
    email: primeiroAdministrador?.email,
    phone: primeiroAdministrador?.phone ?? null,
    accessMode: 'password',
  };

  const aberto = await chamarPlataforma('open_operation', {
    p_kind: 'provision_company',
    p_actor_user_id: ator.userId,
    p_idempotency_key: chaveIdempotencia,
    p_payload: { company: empresa, firstAdmin: primeiroAdministradorAuditavel },
    p_steps: ['create_company', 'create_auth_user', 'link_company_admin', 'send_invite'],
  });

  const linha = Array.isArray(aberto) ? aberto[0] : aberto;
  const operacaoIdentificador = linha.operation_id ?? linha.operationId;

  if (linha.is_replay && ['succeeded', 'running'].includes(linha.current_status)) {
    return await chamarPlataforma('get_operation', {
      p_actor_user_id: ator.userId,
      p_operation_id: operacaoIdentificador,
    });
  }

  let empresaIdentificador: string | null = null;
  let usuarioAutenticacaoCriadoIdentificador: string | null = null;

  try {
    const criado: any = await chamarPlataforma('provision_company_record', {
      p_operation_id: operacaoIdentificador,
      p_actor_user_id: ator.userId,
      p_company: empresa,
    });
    empresaIdentificador = criado.companyId;

    await chamarPlataforma('mark_step', {
      p_operation_id: operacaoIdentificador,
      p_step_code: 'create_auth_user',
      p_status: 'running',
    });

    const email = String(primeiroAdministrador.email).trim().toLowerCase();
    const identidade = await resolverIdentidade(email);

    // Não sobrescrevemos senha de uma conta já existente. Isso evita que o
    // administrador da plataforma redefina, sem perceber, credenciais usadas
    // por outra pessoa/empresa.
    if (identidade.state !== 'absent') {
      await chamarPlataforma('mark_step', {
        p_operation_id: operacaoIdentificador,
        p_step_code: 'create_auth_user',
        p_status: 'failed',
        p_detail: 'O e-mail já possui uma conta no Supabase Auth.',
        p_error_code: 'auth_email_conflict',
      });
      throw {
        hint: 'auth_email_conflict',
        message:
          'Este e-mail já possui uma conta. Use outro e-mail para o primeiro administrador ou trate a conta existente separadamente.',
      };
    }

    const { data: dadosAutenticacao, error: erroAutenticacao } = await administrador.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { full_name: primeiroAdministrador.fullName },
    });

    if (erroAutenticacao || !dadosAutenticacao?.user?.id) {
      await chamarPlataforma('mark_step', {
        p_operation_id: operacaoIdentificador,
        p_step_code: 'create_auth_user',
        p_status: 'failed',
        p_detail: erroAutenticacao?.message ?? 'Supabase Auth não devolveu o usuário.',
        p_error_code: 'auth_email_conflict',
      });
      throw {
        hint: 'auth_email_conflict',
        message: erroAutenticacao?.message ?? 'Não foi possível criar a conta de acesso.',
      };
    }

    usuarioAutenticacaoCriadoIdentificador = dadosAutenticacao.user.id;

    await chamarPlataforma('mark_step', {
      p_operation_id: operacaoIdentificador,
      p_step_code: 'create_auth_user',
      p_status: 'succeeded',
      p_detail: 'Conta criada com e-mail confirmado e login por senha habilitado.',
    });

    // Esta RPC vincula o company_admin ATIVO, marca a antiga etapa de convite
    // como "skipped" e conclui a operação na mesma transação do banco.
    const concluida = await chamarPlataforma('provision_first_admin_password', {
      p_operation_id: operacaoIdentificador,
      p_actor_user_id: ator.userId,
      p_company_id: empresaIdentificador,
      p_user_id: usuarioAutenticacaoCriadoIdentificador,
      p_email: email,
      p_full_name: primeiroAdministrador.fullName,
      p_phone: primeiroAdministrador.phone ?? null,
    });

    return concluida;
  } catch (erro: any) {
    // Se a conta Auth nasceu nesta tentativa mas o vínculo transacional falhou,
    // removemos a identidade para não deixar uma conta órfã.
    if (usuarioAutenticacaoCriadoIdentificador) {
      const { error: erroExclusao } = await administrador.auth.admin.deleteUser(
        usuarioAutenticacaoCriadoIdentificador,
      );
      if (erroExclusao) {
        console.error('platform-admin: falha ao compensar usuário Auth', {
          userId: usuarioAutenticacaoCriadoIdentificador,
          message: erroExclusao.message,
        });
      }
    }

    const dica = erro?.hint ?? 'partial_failure';
    const podeRepetir = ![
      'invalid_cnpj',
      'cnpj_already_exists',
      'INVALID_INPUT',
      'auth_email_conflict',
    ].includes(dica);

    await chamarPlataforma('fail_provisioning', {
      p_operation_id: operacaoIdentificador,
      p_actor_user_id: ator.userId,
      p_error_code: dica,
      p_error_detail: erro?.message ?? null,
      p_retryable: podeRepetir,
    }).catch(() => {});

    await registrarNegacao(ator.userId, 'company.provision', dica, requisicao, {
      operationId: operacaoIdentificador,
      companyId: empresaIdentificador,
    });
    throw erro;
  }
};

function validarSenhaGestao(senha: unknown): string {
  if (
    typeof senha !== 'string' ||
    senha.length < TAMANHO_MINIMO_SENHA ||
    senha.length > TAMANHO_MAXIMO_SENHA
  ) {
    throw {
      hint: 'INVALID_INPUT',
      message: `A senha deve ter entre ${TAMANHO_MINIMO_SENHA} e ${TAMANHO_MAXIMO_SENHA} caracteres.`,
    };
  }
  if (/^\s+$/.test(senha) || /^(.)\1+$/.test(senha)) {
    throw { hint: 'INVALID_INPUT', message: 'Escolha uma senha mais segura.' };
  }
  return senha;
}

async function registrarEventoPlataforma(
  ator: ator2,
  requisicao: Request,
  acao: string,
  resultado: 'success' | 'failure',
  alvoTipo: string,
  alvoIdentificador: string | null,
  empresaIdentificador: string | null,
  metadados: Record<string, unknown> = {},
) {
  await chamarPlataforma('log_event', {
    p_actor_user_id: ator.userId,
    p_action: acao,
    p_result: resultado,
    p_target_type: alvoTipo,
    p_target_id: alvoIdentificador,
    p_company_id: empresaIdentificador,
    p_metadata: metadados,
    p_request_id: requisicao.headers.get('x-request-id'),
    p_ip: requisicao.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    p_user_agent: requisicao.headers.get('user-agent'),
  }).catch(() => {});
}

const ACOES_ATENDIDAS: Record<string, Manipulador> = {
  'dashboard.get': (primeiroItem, parametroItem) =>
    chamarPlataforma('get_dashboard', {
      p_actor_user_id: primeiroItem.userId,
      p_from: parametroItem?.from,
      p_to: parametroItem?.to,
    }),

  'companies.list': (primeiroItem, parametroItem) =>
    chamarPlataforma('list_companies', {
      p_actor_user_id: primeiroItem.userId,
      p_search: parametroItem?.search ?? null,
      p_status: parametroItem?.status ?? null,
      p_state: parametroItem?.state ?? null,
      p_page: parametroItem?.page ?? 1,
      p_page_size: parametroItem?.pageSize ?? 25,
    }),

  'company.get': async (primeiroItem, parametroItem) => {
    const resultado = await chamarPlataforma('get_company', {
      p_actor_user_id: primeiroItem.userId,
      p_company_id: parametroItem.companyId,
    });
    const { data: linha } = await administrador
      .from('companies')
      .select('updated_at')
      .eq('id', parametroItem.companyId)
      .maybeSingle();
    return { ...(resultado ?? {}), updatedAt: linha?.updated_at ?? null };
  },

  'company.update': (primeiroItem, parametroItem) =>
    chamarPlataforma('update_company', {
      p_actor_user_id: primeiroItem.userId,
      p_company_id: parametroItem.companyId,
      p_patch: parametroItem.patch,
      p_expected_updated_at: parametroItem.expectedUpdatedAt ?? null,
    }),

  'company.setStatus': (primeiroItem, parametroItem) =>
    chamarPlataforma('set_company_status', {
      p_actor_user_id: primeiroItem.userId,
      p_company_id: parametroItem.companyId,
      p_status: parametroItem.status,
      p_reason_code: parametroItem.reasonCode ?? null,
      p_confirmed_name: parametroItem.confirmedName ?? null,
      p_idempotency_key: parametroItem.idempotencyKey ?? null,
    }),

  'company.delete': async (primeiroItem, parametroItem, requisicao) => {
    if (typeof parametroItem?.companyId !== 'string' || typeof parametroItem?.confirmedName !== 'string') {
      throw { hint: 'INVALID_INPUT', message: 'Empresa e confirmação são obrigatórias.' };
    }

    const resultado: any = await chamarPlataforma('hard_delete_company', {
      p_actor_user_id: primeiroItem.userId,
      p_company_id: parametroItem.companyId,
      p_confirmed_name: parametroItem.confirmedName,
    });

    const membros = Array.isArray(resultado?.members) ? resultado.members : [];
    const excluidos: string[] = [];
    const mantidos: Array<{ userId: string; reason: string }> = [];
    const falhas: Array<{ userId: string; message: string }> = [];

    for (const membro of membros) {
      const usuarioIdentificador = typeof membro?.userId === 'string' ? membro.userId : null;
      if (!usuarioIdentificador) continue;
      if (membro?.deleteAuthUser !== true) {
        mantidos.push({ userId: usuarioIdentificador, reason: 'Conta usada fora da empresa excluída.' });
        continue;
      }

      const { error: erroExclusao } = await administrador.auth.admin.deleteUser(usuarioIdentificador, false);
      if (erroExclusao) {
        falhas.push({ userId: usuarioIdentificador, message: erroExclusao.message });
        await registrarEventoPlataforma(
          primeiroItem,
          requisicao,
          'company.auth_cleanup_failed',
          'failure',
          'auth.users',
          usuarioIdentificador,
          null,
          { deletedCompanyId: parametroItem.companyId },
        );
      } else {
        excluidos.push(usuarioIdentificador);
      }
    }

    return {
      ...resultado,
      authCleanup: {
        deleted: excluidos.length,
        retained: mantidos.length,
        failed: falhas.length,
        failures: falhas,
      },
    };
  },

  'company.provision': provisionarEmpresa,

  'members.list': (primeiroItem, parametroItem) =>
    chamarPlataforma('list_company_members', {
      p_actor_user_id: primeiroItem.userId,
      p_company_id: parametroItem.companyId,
      p_search: parametroItem?.search ?? null,
      p_page: parametroItem?.page ?? 1,
      p_page_size: parametroItem?.pageSize ?? 50,
    }),

  'member.passwordReset': async (primeiroItem, parametroItem, requisicao) => {
    const senha = validarSenhaGestao(parametroItem?.password);
    const membro: any = await chamarPlataforma('get_company_member_for_password_reset', {
      p_actor_user_id: primeiroItem.userId,
      p_company_id: parametroItem.companyId,
      p_user_id: parametroItem.userId,
    });

    const { error: erroAtualizacao } = await administrador.auth.admin.updateUserById(parametroItem.userId, {
      password: senha,
    });
    if (erroAtualizacao) {
      await registrarEventoPlataforma(
        primeiroItem,
        requisicao,
        'company.member.password_reset',
        'failure',
        'auth.users',
        parametroItem.userId,
        parametroItem.companyId,
        { reason: 'auth_update_failed' },
      );
      throw { hint: 'AUTH_UPDATE_FAILED', message: 'Não foi possível alterar a senha deste usuário.' };
    }

    await registrarEventoPlataforma(
      primeiroItem,
      requisicao,
      'company.member.password_reset',
      'success',
      'auth.users',
      parametroItem.userId,
      parametroItem.companyId,
      { role: membro?.role ?? null },
    );

    return { userId: parametroItem.userId, fullName: membro?.fullName ?? null, passwordUpdated: true };
  },

  'member.delete': async (primeiroItem, parametroItem, requisicao) => {
    const preparado: any = await chamarPlataforma('prepare_delete_company_member', {
      p_actor_user_id: primeiroItem.userId,
      p_company_id: parametroItem.companyId,
      p_user_id: parametroItem.userId,
      p_confirmed_identity: parametroItem.confirmedIdentity,
    });

    if (preparado?.deleteAuthUser === true) {
      const { error: erroExclusao } = await administrador.auth.admin.deleteUser(parametroItem.userId, false);
      if (erroExclusao) {
        await registrarEventoPlataforma(
          primeiroItem,
          requisicao,
          'company.member.deleted',
          'failure',
          'auth.users',
          parametroItem.userId,
          parametroItem.companyId,
          { reason: 'auth_delete_failed' },
        );
        throw {
          hint: 'AUTH_DELETE_FAILED',
          message: 'Não foi possível excluir a conta de autenticação. Nenhum vínculo foi removido.',
        };
      }

      await registrarEventoPlataforma(
        primeiroItem,
        requisicao,
        'company.member.deleted',
        'success',
        'auth.users',
        parametroItem.userId,
        parametroItem.companyId,
        { authUserDeleted: true, role: preparado?.role ?? null },
      );

      return {
        userId: parametroItem.userId,
        fullName: preparado?.fullName ?? null,
        membershipDeleted: true,
        authUserDeleted: true,
      };
    }

    const resultado: any = await chamarPlataforma('unlink_company_member', {
      p_actor_user_id: primeiroItem.userId,
      p_company_id: parametroItem.companyId,
      p_user_id: parametroItem.userId,
    });

    return {
      ...resultado,
      accountRetainedReason: preparado?.isPlatformAdmin
        ? 'A conta é administradora da plataforma.'
        : 'A conta possui outro vínculo com empresa.',
    };
  },

  'operation.get': (primeiroItem, parametroItem) =>
    chamarPlataforma('get_operation', {
      p_actor_user_id: primeiroItem.userId,
      p_operation_id: parametroItem.operationId,
    }),

  'operations.list': (primeiroItem, parametroItem) =>
    chamarPlataforma('list_operations', {
      p_actor_user_id: primeiroItem.userId,
      p_status: parametroItem?.status ?? null,
      p_page: parametroItem?.page ?? 1,
      p_page_size: parametroItem?.pageSize ?? 25,
    }),

  'operation.retry': (primeiroItem, parametroItem) =>
    chamarPlataforma('retry_provisioning', {
      p_operation_id: parametroItem.operationId,
      p_actor_user_id: primeiroItem.userId,
    }),

  'operation.compensate': (primeiroItem, parametroItem) =>
    chamarPlataforma('compensate_provisioning', {
      p_operation_id: parametroItem.operationId,
      p_actor_user_id: primeiroItem.userId,
      p_reason: parametroItem.reason ?? null,
    }),

  'admins.list': (primeiroItem, parametroItem) =>
    chamarPlataforma('list_company_admins', {
      p_actor_user_id: primeiroItem.userId,
      p_company_id: parametroItem?.companyId ?? null,
      p_search: parametroItem?.search ?? null,
      p_page: parametroItem?.page ?? 1,
      p_page_size: parametroItem?.pageSize ?? 25,
    }),

  'companyAccess.suspend': (primeiroItem, parametroItem) =>
    chamarPlataforma('suspend_company_access', {
      p_actor_user_id: primeiroItem.userId,
      p_company_id: parametroItem.companyId,
      p_admin_user_id: parametroItem.userId,
    }),
  'companyAccess.restore': (primeiroItem, parametroItem) =>
    chamarPlataforma('restore_company_access', {
      p_actor_user_id: primeiroItem.userId,
      p_company_id: parametroItem.companyId,
      p_admin_user_id: parametroItem.userId,
    }),
  'admin.blockAccount': (primeiroItem, parametroItem) =>
    chamarPlataforma('block_admin_account', {
      p_actor_user_id: primeiroItem.userId,
      p_target_user_id: parametroItem.userId,
      p_reason: parametroItem.reason ?? null,
    }),
  'admin.unblockAccount': (primeiroItem, parametroItem) =>
    chamarPlataforma('unblock_admin_account', {
      p_actor_user_id: primeiroItem.userId,
      p_target_user_id: parametroItem.userId,
    }),

  'admin.replace': async (primeiroItem, parametroItem) => {
    const alvoIdentificador =
      parametroItem?.userId ??
      (parametroItem?.email ? await buscarUsuarioIdentificadorPorEmail(String(parametroItem.email)) : null);
    if (!alvoIdentificador) {
      throw Object.assign(new Error('Conta de destino não encontrada.'), {
        hint: 'NOT_FOUND',
        code: 'P0002',
      });
    }
    return chamarPlataforma('replace_platform_admin', {
      p_actor_user_id: primeiroItem.userId,
      p_new_user_id: alvoIdentificador,
      p_reason: parametroItem.reason ?? null,
    });
  },

  'invite.resend': async (primeiroItem, parametroItem) => {
    const token = gerarTokenAleatorio(32);

    const emitido = await chamarPlataforma('issue_invite', {
      p_company_id: parametroItem.companyId,
      p_user_id: parametroItem.userId,
      p_email: parametroItem.email,
      p_token_plain: token,
      p_actor_user_id: primeiroItem.userId,
      p_ttl_hours: VALIDADE_CONVITE_HORAS,
      p_resend_cooldown_seconds: INTERVALO_REENVIO_SEGUNDOS,
    });

    const identidade = await resolverIdentidade(parametroItem.email);
    const link = await emitirLinkAutenticacao({
      email: parametroItem.email,
      identity: identidade,
      inviteToken: token,
      companyId: parametroItem.companyId,
      fullName: parametroItem.fullName ?? '',
    });
    if (!link.ok) throw { hint: link.code, message: link.error };

    const enviado = await entregarConvite(
      parametroItem.email,
      link.actionLink!,
      parametroItem.fullName ?? '',
    );
    if (!enviado.ok) throw { hint: 'invite_delivery_failed', message: enviado.error };

    return { ...emitido, linkType: link.linkType };
  },

  'audit.list': (primeiroItem, parametroItem) =>
    chamarPlataforma('list_audit_events', {
      p_actor_user_id: primeiroItem.userId,
      p_action: parametroItem?.action ?? null,
      p_result: parametroItem?.result ?? null,
      p_from: parametroItem?.from ?? null,
      p_to: parametroItem?.to ?? null,
      p_page: parametroItem?.page ?? 1,
      p_page_size: parametroItem?.pageSize ?? 50,
    }),

  'audit.get': (primeiroItem, parametroItem) =>
    chamarPlataforma('get_audit_event', {
      p_actor_user_id: primeiroItem.userId,
      p_event_id: parametroItem.eventId,
    }),
};

async function tratarAceiteConvite(
  requisicao: Request,
  dadosEnvio: { token?: string } | undefined,
  origem: string | null,
) {
  const token = (requisicao.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return respostaJson({ error: { hint: 'UNAUTHENTICATED', message: 'Sessão ausente.' } }, 401, origem);
  }

  const publica = criarCliente(ENDERECO_SUPABASE, CHAVE_PUBLICA, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: usuarioDados, error: usuarioErro } = await publica.auth.getUser();
  if (usuarioErro || !usuarioDados?.user) {
    return respostaJson({ error: { hint: 'UNAUTHENTICATED', message: 'Sessão inválida.' } }, 401, origem);
  }

  if (!dadosEnvio?.token) {
    return respostaJson({ error: { hint: 'INVITE_INVALID', message: 'Convite ausente.' } }, 403, origem);
  }

  try {
    const dados = await chamarPlataforma('accept_invite', {
      p_token_plain: dadosEnvio.token,
      p_user_id: usuarioDados.user.id,
    });
    return respostaJson({ data: dados }, 200, origem);
  } catch (erro) {
    const mapeados = mapearErro(erro as ErroPostgres);
    await registrarNegacao(
      usuarioDados.user.id,
      'invite.accept',
      (erro as ErroPostgres).hint ?? 'denied',
      requisicao,
    );
    return respostaJson(mapeados.body, mapeados.status, origem);
  }
}

const PORTA_FUNCAO = Number(Deno.env.get('PNF_FN_PORT') ?? '0') || undefined;

Deno.serve({ port: PORTA_FUNCAO }, async (requisicao: Request) => {
  const origem = requisicao.headers.get('origin');

  if (requisicao.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cabecalhosCors(origem) });
  }
  if (requisicao.method !== 'POST') {
    return respostaJson({ error: { hint: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } }, 405, origem);
  }

  let corpo: { action?: string; payload?: unknown };
  try {
    corpo = await requisicao.json();
  } catch {
    return respostaJson({ error: { hint: 'INVALID_INPUT', message: 'Corpo inválido.' } }, 422, origem);
  }

  const acao = corpo.action ?? '';

  if (acao === 'invite.accept') {
    return tratarAceiteConvite(requisicao, corpo.payload as { token?: string }, origem);
  }

  const autenticacao = await autenticar(requisicao);
  if ('error' in autenticacao) return autenticacao.error;
  const { actor: ator } = autenticacao;

  const manipulador = ACOES_ATENDIDAS[acao];
  if (!manipulador) {
    return respostaJson(
      { error: { hint: 'UNKNOWN_ACTION', message: `Ação desconhecida: ${acao}` } },
      400,
      origem,
    );
  }

  try {
    const dados = await manipulador(ator, corpo.payload ?? {}, requisicao);
    return respostaJson({ data: dados }, 200, origem);
  } catch (erro: any) {
    const mapeados = mapearErro(erro);

    if (mapeados.status === 403 || mapeados.status === 409) {
      await registrarNegacao(ator.userId, acao, erro?.hint ?? 'denied', requisicao);
    }

    const extra: Record<string, string> =
      mapeados.status === 429 && erro?.details ? { 'Retry-After': String(erro.details) } : {};

    return respostaJson(mapeados.body, mapeados.status, origem, extra);
  }
});
