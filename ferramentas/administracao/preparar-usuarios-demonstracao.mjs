#!/usr/bin/env node
/**
 * =============================================================================
 * PegaNaFrota — provisionamento idempotente dos usuários de demonstração
 * =============================================================================
 * O `supabase/seed.sql` insere direto em auth.users, o que funciona no ambiente
 * LOCAL (onde o seed roda como superusuário). Em um projeto Supabase REMOTO
 * isso não é possível nem desejável: contas precisam nascer pela Admin API,
 * para que hash de senha, identidade e metadados sigam o padrão do GoTrue.
 *
 * Este script é o caminho para ambientes remotos. Ele é idempotente: rodar
 * duas vezes não cria duplicata nem altera contas existentes, salvo se
 * --reset-passwords for passado.
 *
 * A SERVICE ROLE KEY é lida de variável de ambiente e nunca é gravada em disco,
 * nunca é impressa e NUNCA vai para o pacote do Electron (ADR-003).
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node ferramentas/administracao/preparar-usuarios-demonstracao.mjs
 *   ... node ferramentas/administracao/preparar-usuarios-demonstracao.mjs --reset-passwords
 *   ... node ferramentas/administracao/preparar-usuarios-demonstracao.mjs --dry-run
 * =============================================================================
 */

const ENDERECO_SUPABASE = process.env.SUPABASE_URL;
const CHAVE_PRIVILEGIADA_SERVIDOR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SENHA_DEMONSTRACAO = process.env.SEED_DEMO_PASSWORD || 'PegaNaFrota#2026';

const argumentos = new Set(process.argv.slice(2));
const SOMENTE_SIMULAR = argumentos.has('--dry-run');
const REDEFINIR_SENHAS = argumentos.has('--reset-passwords');

if (!ENDERECO_SUPABASE || (!CHAVE_PRIVILEGIADA_SERVIDOR && !SOMENTE_SIMULAR)) {
  console.error(
    'Faltam variáveis de ambiente.\n' +
      '  SUPABASE_URL              (ex.: http://127.0.0.1:54321)\n' +
      '  SUPABASE_SERVICE_ROLE_KEY (obtida com `supabase status`)\n\n' +
      'Nunca coloque a service role key em arquivo versionado.',
  );
  process.exit(1);
}

/**
 * Mesma lista do seed.sql. Mantida aqui de forma explícita porque este script
 * roda em ambientes onde o seed SQL não é aplicado.
 */
const EMPRESAS = [
  { slug: 'auroraverde', users: ['admin', 'gestor', 'operador', 'consulta', 'desligado'] },
  { slug: 'pedraalta', users: ['admin', 'gestor', 'operador', 'operador2', 'consulta', 'suspenso'] },
  { slug: 'riosereno', users: ['admin', 'gestor', 'gestor2', 'operador', 'operador2', 'consulta'] },
  {
    slug: 'camponovo',
    users: ['admin', 'admin2', 'gestor', 'gestor2', 'operador', 'operador2', 'operador3', 'consulta'],
  },
];

const NOMES_COMPLETOS = {
  'auroraverde:admin': 'Ana R.',
  'auroraverde:gestor': 'Bruno M.',
  'auroraverde:operador': 'Camila S.',
  'auroraverde:consulta': 'Diego L.',
  'auroraverde:desligado': 'Eduarda P.',
  'pedraalta:admin': 'Fabio T.',
  'pedraalta:gestor': 'Gisele A.',
  'pedraalta:operador': 'Henrique B.',
  'pedraalta:operador2': 'Isabela C.',
  'pedraalta:consulta': 'Joao V.',
  'pedraalta:suspenso': 'Karina D.',
  'riosereno:admin': 'Lucas E.',
  'riosereno:gestor': 'Marina F.',
  'riosereno:gestor2': 'Nelson G.',
  'riosereno:operador': 'Olivia H.',
  'riosereno:operador2': 'Paulo I.',
  'riosereno:consulta': 'Renata J.',
  'camponovo:admin': 'Sergio K.',
  'camponovo:admin2': 'Tatiana L.',
  'camponovo:gestor': 'Ulisses M.',
  'camponovo:gestor2': 'Vanessa N.',
  'camponovo:operador': 'Wagner O.',
  'camponovo:operador2': 'Xenia P.',
  'camponovo:operador3': 'Yuri Q.',
  'camponovo:consulta': 'Zilda R.',
};

const esperado = EMPRESAS.flatMap((empresa) =>
  empresa.users.map((parteLocal) => ({
    email: `${parteLocal}@${empresa.slug}.example.com`,
    fullName: NOMES_COMPLETOS[`${empresa.slug}:${parteLocal}`],
  })),
);

async function servicos(caminho, opcoes = {}) {
  const resposta = await fetch(`${ENDERECO_SUPABASE}/auth/v1${caminho}`, {
    ...opcoes,
    headers: {
      apikey: CHAVE_PRIVILEGIADA_SERVIDOR,
      Authorization: `Bearer ${CHAVE_PRIVILEGIADA_SERVIDOR}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {}),
    },
  });
  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) {
    throw new Error(`${opcoes.method || 'GET'} ${caminho} -> ${resposta.status}: ${texto}`);
  }
  return corpo;
}

/** Percorre a paginação da Admin API e devolve um mapa email -> usuário. */
async function listarUsuariosExistentes() {
  const porEmail = new Map();
  for (let pagina = 1; pagina <= 50; pagina += 1) {
    const corpo = await servicos(`/admin/users?page=${pagina}&per_page=200`);
    const usuarios = corpo?.users ?? [];
    for (const usuario of usuarios) porEmail.set(usuario.email?.toLowerCase(), usuario);
    if (usuarios.length < 200) break;
  }
  return porEmail;
}

async function principal() {
  console.log(`PegaNaFrota — provisionamento de ${esperado.length} contas de demonstração`);
  console.log(`Destino: ${ENDERECO_SUPABASE}`);
  if (SOMENTE_SIMULAR) {
    for (const usuario of esperado) console.log(`  [dry-run] ${usuario.email}  (${usuario.fullName})`);
    console.log(`\n${esperado.length} contas seriam verificadas. Nenhuma alteração feita.`);
    return;
  }

  const existente = await listarUsuariosExistentes();
  let criado = 0;
  let atualizado = 0;
  let inalterado = 0;

  for (const usuario of esperado) {
    const encontrado = existente.get(usuario.email.toLowerCase());

    if (!encontrado) {
      await servicos('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: usuario.email,
          password: SENHA_DEMONSTRACAO,
          email_confirm: true,
          user_metadata: { full_name: usuario.fullName },
        }),
      });
      criado += 1;
      console.log(`  criado    ${usuario.email}`);
      continue;
    }

    if (REDEFINIR_SENHAS) {
      await servicos(`/admin/users/${encontrado.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          password: SENHA_DEMONSTRACAO,
          user_metadata: { full_name: usuario.fullName },
        }),
      });
      atualizado += 1;
      console.log(`  senha ok  ${usuario.email}`);
      continue;
    }

    inalterado += 1;
  }

  console.log(`\nResumo: ${criado} criada(s), ${atualizado} atualizada(s), ${inalterado} já existente(s).`);
  console.log(
    'Lembrete: as contas ainda precisam de profile e company_membership.\n' +
      'Em ambiente local isso vem do seed.sql. Em remoto, aplique o mesmo seed\n' +
      'apontando os IDs devolvidos aqui, ou use a Edge Function admin-users.',
  );
}

principal().catch((erro) => {
  // Nunca imprime a chave; apenas a mensagem do erro.
  console.error('Falha no provisionamento:', erro.message);
  process.exit(1);
});
