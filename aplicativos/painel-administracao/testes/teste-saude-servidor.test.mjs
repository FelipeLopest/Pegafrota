import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import { resolve as resolverCaminho } from 'node:path';

const raiz = resolverCaminho(import.meta.dirname, '..');
const servicos = lerArquivoSincrono(
  resolverCaminho(raiz, 'comunicacao/comunicacao-com-servidor.mjs'),
  'utf8',
);
const roteador = lerArquivoSincrono(resolverCaminho(raiz, 'navegacao/trocar-tela.mjs'), 'utf8');

testar('Admin não depende de navigator.onLine', () => {
  verificarCondicao.doesNotMatch(roteador, /navigator\.onLine/);
  verificarCondicao.doesNotMatch(roteador, /addEventListener\(['"](?:online|offline)['"]/);
});

testar('Admin confirma indisponibilidade pelo endpoint de saúde', () => {
  verificarCondicao.match(servicos, /\/auth\/v1\/health/);
  verificarCondicao.match(servicos, /verificarConectividadeServidor/);
  verificarCondicao.match(servicos, /falhasSaudeConsecutivas >= 2/);
});

testar('qualquer resposta HTTP restaura estado disponível', () => {
  const sucessoPosFetch =
    /const resposta = await fetch\(endereco, opcoes\);[\s\S]{0,180}registrarSucessoServidor\(\)/;
  verificarCondicao.match(servicos, sucessoPosFetch);
});
