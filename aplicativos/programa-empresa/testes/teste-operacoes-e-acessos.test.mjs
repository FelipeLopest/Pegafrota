import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import {
  readFileSync as lerArquivoSincrono,
  existsSync as arquivoExiste,
} from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import { resolve as resolverCaminho } from 'node:path';

const raiz = resolverCaminho(import.meta.dirname, '..');
const repositorio = resolverCaminho(raiz, '../..');
const ler = (caminho) => lerArquivoSincrono(resolverCaminho(raiz, caminho), 'utf8');

testar('confirmAction entrega o resultado pelo close do modal', () => {
  const textoItem = ler('componentes/componentes-do-programa.mjs');
  verificarCondicao.match(textoItem, /correspondenciaItem\.close\(true\)/);
  verificarCondicao.match(textoItem, /correspondenciaItem\.close\(false\)/);
  verificarCondicao.doesNotMatch(textoItem, /correspondenciaItem\.close\(\);\s*resolve\(true\)/);
});

testar('v8 possui detalhes e gestão das principais entidades', () => {
  const textoItem = ler('telas/exportar-telas.mjs');
  for (const chaveItem of [
    'telaDetalheVeiculo',
    'telaDetalheMotorista',
    'abrirEditorVeiculo',
    'abrirEditorMotorista',
    'abrirEditorLocal',
    'telaUsuarios',
    'telaManutencao',
    'telaPatio',
  ])
    verificarCondicao.ok(textoItem.includes(chaveItem), chaveItem);
});

testar('rotas de veículo e motorista apontam para detalhes reais', () => {
  const textoItem = ler('iniciar-aplicativo.mjs');
  verificarCondicao.match(textoItem, /\/veiculos\/:id/);
  verificarCondicao.match(textoItem, /telaDetalheVeiculo/);
  verificarCondicao.match(textoItem, /\/motoristas\/:id/);
  verificarCondicao.match(textoItem, /telaDetalheMotorista/);
});

testar('ações destrutivas pedem motivo sem browser prompt', () => {
  const textoItem = ler('telas/exportar-telas.mjs');
  verificarCondicao.doesNotMatch(textoItem, /\bprompt\s*\(/);
  for (const rotulo of [
    'Arquivar veículo',
    'Arquivar motorista',
    'Cancelar viagem',
    'Cancelar manutenção',
    'Arquivar local',
  ]) {
    verificarCondicao.ok(textoItem.includes(rotulo), rotulo);
  }
});

testar('equipe usa admin-users e protege o próprio acesso na interface', () => {
  const interfaceVisual = ler('telas/exportar-telas.mjs');
  const dados = ler('dados/dados-do-programa.mjs');
  verificarCondicao.match(dados, /chamarFuncaoDoServidor\('admin-users'/);
  verificarCondicao.match(interfaceVisual, /usuarioItem\.user_id\s*===\s*contexto\.userId/);
  verificarCondicao.match(interfaceVisual, /Seu próprio acesso é protegido/);
});

testar('pátio usa snapshot server-side e linguagem operacional clara', () => {
  const interfaceVisual = ler('telas/exportar-telas.mjs');
  const dados = ler('dados/dados-do-programa.mjs');
  verificarCondicao.match(dados, /yard_snapshot/);
  verificarCondicao.ok(interfaceVisual.includes('No pátio'));
  verificarCondicao.ok(interfaceVisual.includes('Fora do pátio'));
  verificarCondicao.ok(interfaceVisual.includes('Registrar entrada'));
  verificarCondicao.ok(interfaceVisual.includes('Registrar saída'));
});

testar('listas não possuem o antigo limite silencioso de 200', () => {
  const dados = ler('dados/dados-do-programa.mjs');
  verificarCondicao.match(dados, /async function selecionarTodos/);
  verificarCondicao.doesNotMatch(dados, /limit\s*=\s*200/);
  const interfaceVisual = ler('telas/exportar-telas.mjs');
  verificarCondicao.match(interfaceVisual, /function paginador/);
});

testar('builds exigem configuração remota e não usam fallback localhost', () => {
  for (const compilar of ['../painel-administracao/compilar-aplicativo.mjs', 'compilar-aplicativo.mjs']) {
    const textoItem = ler(compilar);
    verificarCondicao.match(textoItem, /PNF_SUPABASE_URL/);
    verificarCondicao.match(textoItem, /PNF_SUPABASE_ANON_KEY/);
    verificarCondicao.doesNotMatch(textoItem, /localhost:54321/);
  }
});

testar('repositório protege .env e inclui migration de completude', () => {
  const indiceGrupo = lerArquivoSincrono(resolverCaminho(repositorio, '.gitignore'), 'utf8');
  verificarCondicao.match(indiceGrupo, /^\.env$/m);
  verificarCondicao.match(indiceGrupo, /^\.env\.\*$/m);
  verificarCondicao.ok(
    arquivoExiste(
      resolverCaminho(repositorio, 'supabase/migrations/20260808000200_product_completeness.sql'),
    ),
  );
});

testar('convite de equipe tem ativação pública de senha sem MFA', () => {
  const programaEmpresaUi = ler('telas/exportar-telas.mjs');
  const principalAdministrador = ler('../painel-administracao/iniciar-aplicativo.mjs');
  const conviteAdministrador = ler('../painel-administracao/telas/exportar-telas-convite.mjs');
  const servicosAdministrador = ler('../painel-administracao/comunicacao/comunicacao-com-servidor.mjs');
  const funcaoServidor = lerArquivoSincrono(
    resolverCaminho(repositorio, 'supabase/functions/admin-users/index.ts'),
    'utf8',
  );
  verificarCondicao.match(programaEmpresaUi, /inviteSent/);
  verificarCondicao.match(funcaoServidor, /flow=team-invite/);
  verificarCondicao.match(principalAdministrador, /renderizarAceiteConviteEquipe/);
  verificarCondicao.match(conviteAdministrador, /export function renderizarAceiteConviteEquipe/);
  verificarCondicao.match(servicosAdministrador, /export async function definirSenha/);
  verificarCondicao.doesNotMatch(
    servicosAdministrador,
    /MFA_NOT_ENROLLED|STEP_UP_REQUIRED|auth\/v1\/factors/,
  );
});

testar('v10 detecta backend remoto desatualizado e força refresh do PostgREST', () => {
  const pacote = JSON.parse(lerArquivoSincrono(resolverCaminho(repositorio, 'package.json'), 'utf8'));
  verificarCondicao.equal(
    pacote.scripts['backend:verify'],
    'node ferramentas/administracao/verificar-backend.mjs',
  );
  const verificar = lerArquivoSincrono(
    resolverCaminho(repositorio, 'ferramentas/administracao/verificar-backend.mjs'),
    'utf8',
  );
  verificarCondicao.match(verificar, /20260808000200/);
  verificarCondicao.match(verificar, /yard_snapshot/);
  const migracao = lerArquivoSincrono(
    resolverCaminho(repositorio, 'supabase/migrations/20260808000300_postgrest_contract_refresh.sql'),
    'utf8',
  );
  verificarCondicao.match(migracao, /notify pgrst, 'reload schema'/i);
  const sessao = ler('acesso/sessao-e-permissoes.mjs');
  verificarCondicao.match(sessao, /BACKEND_SCHEMA_OUTDATED/);
});
