import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import { resolve as resolverCaminho } from 'node:path';

const raiz = resolverCaminho(import.meta.dirname, '..');
const principal = lerArquivoSincrono(resolverCaminho(raiz, 'iniciar-aplicativo.mjs'), 'utf8');
const sessao = lerArquivoSincrono(resolverCaminho(raiz, 'acesso/sessao-e-permissoes.mjs'), 'utf8');

testar('Desktop não usa navigator.onLine nem eventos online/offline', () => {
  verificarCondicao.doesNotMatch(principal, /navigator\.onLine\s*(?:===|!==|==|!=)/);
  verificarCondicao.doesNotMatch(principal, /addEventListener\(['"](?:online|offline)['"]/);
});

testar('Desktop confirma indisponibilidade pelo health real do Supabase', () => {
  verificarCondicao.match(sessao, /\/auth\/v1\/health/);
  verificarCondicao.match(sessao, /verificarConectividadeServidor/);
  verificarCondicao.match(sessao, /confirmarFalhaTransporte/);
  verificarCondicao.match(sessao, /falhasSaudeConsecutivas >= 2/);
});

testar('falha de rota específica não declara servidor offline antes da sondagem', () => {
  verificarCondicao.match(sessao, /void confirmarFalhaTransporte\(endereco, opcoes\)/);
  verificarCondicao.match(sessao, /registrarSucessoServidor\(\)/);
});
