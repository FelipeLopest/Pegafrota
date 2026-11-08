import { randomBytes as gerarBytesAleatorios } from 'node:crypto';

export function exigirAmbiente(nomes) {
  const ausentes = nomes.filter((nome) => !process.env[nome]);
  if (ausentes.length) {
    throw new Error(`Faltam variáveis de ambiente: ${ausentes.join(', ')}`);
  }
}

export function configuracaoAdministrador() {
  exigirAmbiente(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  return {
    url: process.env.SUPABASE_URL.replace(/\/$/, ''),
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function lerCorpo(resposta) {
  const texto = await resposta.text();
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

export async function buscarJson(endereco, opcoes = {}) {
  const resposta = await fetch(endereco, opcoes);
  const corpo = await lerCorpo(resposta);
  if (!resposta.ok) {
    const detalhe = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
    const erro = new Error(`${opcoes.method ?? 'GET'} ${endereco} -> ${resposta.status}: ${detalhe}`);
    erro.status = resposta.status;
    erro.body = corpo;
    throw erro;
  }
  return corpo;
}

function servicoCabecalhos(extra = {}) {
  const { serviceKey: servicoChave } = configuracaoAdministrador();
  return {
    apikey: servicoChave,
    Authorization: `Bearer ${servicoChave}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function administradorAutenticacao(caminho, opcoes = {}) {
  const { url: endereco } = configuracaoAdministrador();
  return buscarJson(`${endereco}/auth/v1${caminho}`, {
    ...opcoes,
    headers: servicoCabecalhos(opcoes.headers ?? {}),
  });
}

export async function buscarUsuarioAutenticacaoPorEmail(email) {
  const termoBusca = email.trim().toLowerCase();
  for (let pagina = 1; pagina <= 200; pagina += 1) {
    const corpo = await administradorAutenticacao(`/admin/users?page=${pagina}&per_page=200`);
    const usuarios = corpo?.users ?? [];
    const encontrado = usuarios.find((usuario) => usuario.email?.toLowerCase() === termoBusca);
    if (encontrado) return encontrado;
    if (usuarios.length < 200) return null;
  }
  throw new Error('Limite de paginação do Auth atingido ao procurar usuário.');
}

export async function garantirUsuarioAutenticacao({
  email,
  password: senha,
  fullName: nomeCompleto,
  resetPassword: redefinirSenha = false,
}) {
  const emailNormalizado = email.trim().toLowerCase();
  let usuario = await buscarUsuarioAutenticacaoPorEmail(emailNormalizado);
  let criado = false;

  if (!usuario) {
    if (!senha || senha.length < 12) {
      throw new Error('PLATFORM_ADMIN_PASSWORD precisa ter pelo menos 12 caracteres para criar a conta.');
    }
    const corpo = await administradorAutenticacao('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: emailNormalizado,
        password: senha,
        email_confirm: true,
        user_metadata: { full_name: nomeCompleto },
      }),
    });
    usuario = corpo?.user ?? corpo;
    criado = true;
  } else {
    const correcao = {
      email_confirm: true,
      user_metadata: {
        ...(usuario.user_metadata ?? {}),
        full_name: nomeCompleto,
      },
    };
    if (redefinirSenha) {
      if (!senha || senha.length < 12) {
        throw new Error('Senha com pelo menos 12 caracteres é obrigatória para --reset-password.');
      }
      correcao.password = senha;
    }
    const corpo = await administradorAutenticacao(`/admin/users/${usuario.id}`, {
      method: 'PUT',
      body: JSON.stringify(correcao),
    });
    usuario = corpo?.user ?? corpo ?? usuario;
  }

  const usuarioIdentificador = usuario?.id;
  if (!usuarioIdentificador) throw new Error('A Admin API do Auth não devolveu o UUID do usuário.');
  return { user: { ...usuario, id: usuarioIdentificador }, created: criado };
}

export async function criarOuAtualizarPerfil({
  userId: usuarioIdentificador,
  fullName: nomeCompleto,
  phone: telefone = null,
}) {
  const { url: endereco } = configuracaoAdministrador();
  const corpo = await buscarJson(`${endereco}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: servicoCabecalhos({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({
      id: usuarioIdentificador,
      full_name: nomeCompleto,
      phone: telefone || null,
      active: true,
    }),
  });
  return Array.isArray(corpo) ? corpo[0] : corpo;
}

export async function funcaoBancoPlataforma(nomeFuncao, argumentos = {}) {
  const { url: endereco } = configuracaoAdministrador();
  return buscarJson(`${endereco}/rest/v1/rpc/${nomeFuncao}`, {
    method: 'POST',
    headers: servicoCabecalhos({
      'Content-Profile': 'platform',
      'Accept-Profile': 'platform',
    }),
    body: JSON.stringify(argumentos),
  });
}

export async function excluirUsuarioAutenticacao(usuarioIdentificador) {
  return administradorAutenticacao(`/admin/users/${usuarioIdentificador}`, { method: 'DELETE' });
}

export function seguroToken(bytes = 32) {
  return gerarBytesAleatorios(bytes).toString('hex');
}

export function sinalizadorAmbiente(nome, alternativa = false) {
  const bruto = process.env[nome];
  if (bruto == null || bruto === '') return alternativa;
  return /^(1|true|yes|sim)$/i.test(bruto);
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { administradorAutenticacao as adminAuth };
export { buscarUsuarioAutenticacaoPorEmail as buscarUsuarioAuthPorEmail };
export { garantirUsuarioAutenticacao as garantirUsuarioAuth };
export { criarOuAtualizarPerfil as upsertProfile };
export { funcaoBancoPlataforma as rpcPlataforma };
export { excluirUsuarioAutenticacao as excluirUsuarioAuth };
export { seguroToken as secureToken };
export { sinalizadorAmbiente as flagAmbiente };
