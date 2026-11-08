import { el as criarElemento } from '../componentes/componentes-do-painel.mjs';

export const rotas = [];

export let limpezaAtual = null;

export let referenciaConteudoTela = null;

export let referenciaEstrutura = null;

export function rota(padrao, manipulador, metadados = {}) {
  const nomes = [];
  const expressaoBusca = new RegExp(
    '^' +
      padrao.replace(/:([A-Za-z0-9_]+)/g, (_correspondenciaIgnorada, quantidadeItem) => {
        nomes.push(quantidadeItem);
        return '([^/]+)';
      }) +
      '$',
  );
  rotas.push({ pattern: padrao, rx: expressaoBusca, names: nomes, handler: manipulador, meta: metadados });
}

export function navegar(caminho, { replace: substituir = false } = {}) {
  const alvo = `#${caminho}`;
  if (location.hash === alvo) return renderizar();
  if (substituir) location.replace(alvo);
  else location.hash = alvo;
}

export function caminhoAtual() {
  return location.hash.replace(/^#/, '') || '/';
}

export function correspondencia(caminho) {
  const [limpo, consulta = ''] = caminho.split('?');
  for (const resultadoItem of rotas) {
    const correspondenciaItem = resultadoItem.rx.exec(limpo);
    if (!correspondenciaItem) continue;
    const parametros = {};
    resultadoItem.names.forEach((quantidadeItem, indiceItem) => {
      parametros[quantidadeItem] = decodeURIComponent(correspondenciaItem[indiceItem + 1]);
    });
    return { ...resultadoItem, params: parametros, query: new URLSearchParams(consulta) };
  }
  return null;
}

export async function renderizar() {
  const caminho = caminhoAtual();
  const encontrado = correspondencia(caminho);

  if (limpezaAtual) {
    try {
      limpezaAtual();
    } catch {
      /* limpeza não deve derrubar navegação */
    }
    limpezaAtual = null;
  }

  if (!encontrado) {
    navegar('/', { replace: true });
    return;
  }

  referenciaEstrutura?.setActive(encontrado.pattern);
  if (!referenciaConteudoTela) return;

  referenciaConteudoTela.__pnfLoadToken = Symbol('rota-admin');
  referenciaConteudoTela.replaceChildren();
  referenciaConteudoTela.setAttribute('aria-busy', 'true');

  try {
    const limpeza = await encontrado.handler({
      params: encontrado.params,
      query: encontrado.query,
      outlet: referenciaConteudoTela,
      setTitle: (itemAtual) => referenciaEstrutura?.setTitle(itemAtual),
    });
    if (typeof limpeza === 'function') limpezaAtual = limpeza;
    referenciaConteudoTela.dataset.routeEnter = 'true';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        delete referenciaConteudoTela.dataset.routeEnter;
      }),
    );
  } catch (erro) {
    referenciaConteudoTela.replaceChildren(
      criarElemento('div', { class: 'error-state', role: 'alert' }, [
        criarElemento('h3', { class: 'error-title', text: 'Não foi possível abrir esta tela' }),
        criarElemento('p', { class: 'error-description', text: erro?.message || String(erro) }),
      ]),
    );
  } finally {
    referenciaConteudoTela.removeAttribute('aria-busy');
  }
}

export function iniciarRoteador({ outlet: conteudoTela, shell: estrutura }) {
  referenciaConteudoTela = conteudoTela;
  referenciaEstrutura = estrutura;
  addEventListener('hashchange', renderizar);
  renderizar();
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { referenciaConteudoTela as outletRef };

export { montarEstrutura, rotuloAmbiente } from './estrutura-da-janela.mjs';
