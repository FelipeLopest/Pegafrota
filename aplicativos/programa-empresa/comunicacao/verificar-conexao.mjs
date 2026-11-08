import { carregarConfiguracao } from '../sistema/carregar-configuracao-da-interface.mjs';

export const EVENTO_CONECTIVIDADE_SERVIDOR = 'pnf:conectividade-servidor';

export let servidorDisponivel = null;

export let falhasSaudeConsecutivas = 0;

export let verificacaoSaudeEmCurso = null;

export let ultimaFalhaConfirmadaEm = 0;

export function estadoConectividadeServidor() {
  return servidorDisponivel;
}

export function emitirConectividade(disponivel) {
  servidorDisponivel = disponivel;
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENTO_CONECTIVIDADE_SERVIDOR, { detail: { disponivel } }));
}

export function registrarSucessoServidor() {
  falhasSaudeConsecutivas = 0;
  ultimaFalhaConfirmadaEm = 0;
  if (servidorDisponivel !== true) emitirConectividade(true);
}

export async function sondarSaude(enderecoBase, chaveAnonima) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 4500);
  try {
    const resposta = await fetch(`${enderecoBase}/auth/v1/health`, {
      method: 'GET',
      headers: chaveAnonima ? { apikey: chaveAnonima } : {},
      signal: controlador.signal,
      cache: 'no-store',
    });
    // Qualquer resposta HTTP confirma conectividade com o projeto. O status da
    // operação em si não é usado como diagnóstico de rede.
    registrarSucessoServidor();
    return resposta.ok;
  } catch {
    const agora = Date.now();
    // Duas sondagens de saúde falhando em uma janela curta evitam alertas por
    // uma oscilação isolada, CORS de uma rota específica ou wake do Windows.
    if (!ultimaFalhaConfirmadaEm || agora - ultimaFalhaConfirmadaEm > 15000) {
      falhasSaudeConsecutivas = 0;
    }
    ultimaFalhaConfirmadaEm = agora;
    falhasSaudeConsecutivas += 1;
    if (falhasSaudeConsecutivas >= 2 && servidorDisponivel !== false) emitirConectividade(false);
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

export async function verificarConectividadeServidor() {
  try {
    const configuracaoLida = await carregarConfiguracao();
    if (!verificacaoSaudeEmCurso) {
      verificacaoSaudeEmCurso = sondarSaude(configuracaoLida.supabaseUrl, configuracaoLida.anonKey).finally(
        () => {
          verificacaoSaudeEmCurso = null;
        },
      );
    }
    return await verificacaoSaudeEmCurso;
  } catch {
    return false;
  }
}

export async function confirmarFalhaTransporte(endereco, opcoes = {}) {
  let origem;
  try {
    origem = new URL(endereco).origin;
  } catch {
    return;
  }
  const cabecalhos = opcoes.headers || {};
  const chaveAnonima = cabecalhos.apikey || cabecalhos.Apikey || cabecalhos.APIKEY || null;
  if (!verificacaoSaudeEmCurso) {
    verificacaoSaudeEmCurso = sondarSaude(origem, chaveAnonima).finally(() => {
      verificacaoSaudeEmCurso = null;
    });
  }
  await verificacaoSaudeEmCurso;
}

export async function requisicaoServidor(endereco, opcoes) {
  try {
    const resposta = await fetch(endereco, opcoes);
    registrarSucessoServidor();
    return resposta;
  } catch (erro) {
    if (erro?.name !== 'AbortError') void confirmarFalhaTransporte(endereco, opcoes);
    throw erro;
  }
}
