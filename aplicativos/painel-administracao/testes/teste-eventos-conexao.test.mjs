import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import arquivosSistema from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';

const roteador = arquivosSistema.readFileSync(
  new URL('../navegacao/trocar-tela.mjs', import.meta.url),
  'utf8',
);
const servicos = arquivosSistema.readFileSync(
  new URL('../comunicacao/comunicacao-com-servidor.mjs', import.meta.url),
  'utf8',
);

testar('painel não usa navigator.onLine como fonte de verdade', () => {
  verificarCondicao.doesNotMatch(roteador, /navigator\.onLine/);
  verificarCondicao.doesNotMatch(roteador, /addEventListener\(['"](?:online|offline)['"]/);
});

testar('banner responde ao estado de requisições reais', () => {
  verificarCondicao.match(roteador, /EVENTO_CONECTIVIDADE_SERVIDOR/);
  verificarCondicao.match(roteador, /estadoConectividadeServidor\(\) !== false/);
  verificarCondicao.match(servicos, /requisicaoServidor/);
  verificarCondicao.match(servicos, /registrarSucessoServidor\(\)/);
  verificarCondicao.match(servicos, /confirmarFalhaTransporte/);
});

testar('respostas HTTP contam como servidor acessível e abort não marca offline', () => {
  verificarCondicao.match(servicos, /const resposta = await fetch\(endereco, opcoes\)/);
  verificarCondicao.match(servicos, /erro\?\.name !== 'AbortError'/);
});

testar('mensagem não afirma que as ações foram bloqueadas', () => {
  verificarCondicao.doesNotMatch(roteador, /ações ficam indisponíveis/i);
  verificarCondicao.match(roteador, /tentará reconectar automaticamente/i);
});
