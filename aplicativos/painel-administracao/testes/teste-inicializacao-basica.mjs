import verificar from 'node:assert/strict';
import { existsSync as existe, readFileSync as lerArquivo } from 'node:fs';
import { join as juntar, resolve as resolver } from 'node:path';
import { validarImportsLocais } from '../../../ferramentas/apoio/compilar-aplicativo.mjs';

const pasta = resolver(import.meta.dirname, '../dist');
verificar.ok(existe(pasta), 'Compile o painel antes de executar esta verificação.');
for (const arquivo of [
  'index.html',
  'iniciar-aplicativo.mjs',
  'aplicar-tema.js',
  'mostrar-erro-ao-iniciar.js',
  'navegacao/trocar-tela.mjs',
  'telas/tela-login.mjs',
  'telas/tela-inicial.mjs',
  'telas/tela-empresas.mjs',
  'telas/tela-aceitar-convite-equipe.mjs',
  'estilos/cores-e-espacamentos.css',
  'estilos/estilo-principal.css',
  'compartilhado/validacoes/validar-senha.mjs',
])
  verificar.ok(existe(juntar(pasta, arquivo)), arquivo);
validarImportsLocais(pasta);
const documento = lerArquivo(juntar(pasta, 'index.html'), 'utf8');
verificar.doesNotMatch(documento, /__CSP__|__CONFIG__/);
verificar.match(documento, /script-src 'self'/);
verificar.doesNotMatch(documento, /script-src[^;]*'unsafe-inline'/);
const configuracao = JSON.parse(/id="pnf-admin-config">([^<]+)<\/script>/.exec(documento)[1]);
verificar.ok(configuracao.supabaseUrl);
verificar.ok(configuracao.anonKey);
console.log('Inicialização básica do painel, arquivos e imports: PASS');
console.log('Interação visual e serviços reais são verificados separadamente.');
