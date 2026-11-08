import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import {
  readFileSync as lerArquivoSincrono,
  existsSync as arquivoExiste,
} from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import { resolve as resolverCaminho } from 'node:path';

const raiz = resolverCaminho(import.meta.dirname, '..');
const dadosRecebidos = lerArquivoSincrono(resolverCaminho(raiz, 'dados/dados-do-programa.mjs'), 'utf8');
const telas = lerArquivoSincrono(resolverCaminho(raiz, 'telas/exportar-telas.mjs'), 'utf8');
const compilacao = lerArquivoSincrono(resolverCaminho(raiz, 'compilar-aplicativo.mjs'), 'utf8');

testar('listas de referência usam cache curto e deduplicam requisições em andamento', () => {
  verificarCondicao.match(dadosRecebidos, /const cacheLeituras = new Map\(\)/);
  verificarCondicao.match(dadosRecebidos, /if \(atual\?\.promessa\) return atual\.promessa/);
  verificarCondicao.match(dadosRecebidos, /vehicles:\$\{chaveFiltros/);
  verificarCondicao.match(dadosRecebidos, /comCache\(\s*'drivers'/);
  verificarCondicao.match(dadosRecebidos, /comCache\(\s*'locations'/);
});

testar('paginação de históricos grandes busca lotes em paralelo', () => {
  verificarCondicao.match(dadosRecebidos, /const concorrencia = 4/);
  verificarCondicao.match(dadosRecebidos, /Promise\.all\(\s*Array\.from/);
});

testar('telas com múltiplas dependências usam Promise.all', () => {
  const ocorrencias = (telas.match(/Promise\.all\(/g) || []).length;
  verificarCondicao.ok(ocorrencias >= 6, `esperado >= 6 Promise.all, encontrado ${ocorrencias}`);
});

testar('Pátio não baixa o histórico inteiro só para mostrar movimentos recentes', () => {
  verificarCondicao.match(telas, /dados\.movements\.recent\(60\)/);
});

testar('não existe cópia paralela das telas no repositório', () => {
  // Antes havia `screens/v8.mjs`, cópia inteira de `screens/index.mjs` que
  // ninguém importava e que o build precisava apagar do artefato.
  //
  // A cópia foi REMOVIDA do repositório: foi dela que veio o bug "atividade is
  // not defined" — a função existia lá, o arquivo vivo a chamava sem definir, e
  // a busca no projeto encontrava a definição, dando a impressão de que estava
  // tudo certo. Este teste impede que a duplicata volte.
  verificarCondicao.equal(
    arquivoExiste(resolverCaminho(raiz, 'telas/tela-antiga-v8.mjs')),
    false,
    'screens/v8.mjs voltou a existir: é cópia morta e origem de bug',
  );
  verificarCondicao.match(compilacao, /rmSync/);
});
