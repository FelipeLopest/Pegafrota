import { estadoErro } from '../componentes/carregamento-e-erros.mjs';

export const rotas = [];

export let referenciaConteudoTela = null;

export let referenciaEstrutura = null;

export let limpeza = null;

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

export function navegar(caminho) {
  const itemAtual = `#${caminho}`;
  if (location.hash === itemAtual) return renderizarRota();
  location.hash = itemAtual;
}

export function caminhoAtual() {
  return location.hash.replace(/^#/, '') || '/';
}

export async function renderizarRota() {
  const [limpo, buscaAtual = ''] = caminhoAtual().split('?');
  const encontrado = rotas.find((resultadoItem) => resultadoItem.rx.test(limpo));
  if (!encontrado) {
    navegar('/');
    return;
  }

  if (limpeza) {
    try {
      limpeza();
    } catch {
      /* limpeza não derruba navegação */
    }
    limpeza = null;
  }

  const correspondenciaItem = encontrado.rx.exec(limpo);
  const parametros = {};
  encontrado.names.forEach((quantidadeItem, indiceItem) => {
    parametros[quantidadeItem] = decodeURIComponent(correspondenciaItem[indiceItem + 1]);
  });

  referenciaEstrutura?.setActive(encontrado.pattern);
  referenciaConteudoTela.__pnfLoadToken = Symbol('rota');
  referenciaConteudoTela.replaceChildren();
  referenciaConteudoTela.setAttribute('aria-busy', 'true');

  try {
    const registro = await encontrado.handler({
      params: parametros,
      query: new URLSearchParams(buscaAtual),
      outlet: referenciaConteudoTela,
      setTitle: (itemAtual) => referenciaEstrutura?.setTitle(itemAtual),
    });
    if (typeof registro === 'function') limpeza = registro;
    referenciaConteudoTela.dataset.routeEnter = 'true';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        delete referenciaConteudoTela.dataset.routeEnter;
      }),
    );
  } catch (erro) {
    referenciaConteudoTela.replaceChildren(
      estadoErro({
        title: 'Não foi possível abrir esta tela',
        description: erro?.message || String(erro),
      }),
    );
  } finally {
    referenciaConteudoTela.removeAttribute('aria-busy');
  }
}

export function iniciarRoteador({ outlet: conteudoTela, shell: estrutura }) {
  referenciaConteudoTela = conteudoTela;
  referenciaEstrutura = estrutura;
  addEventListener('hashchange', renderizarRota);
  renderizarRota();
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { referenciaConteudoTela as outletRef };
export { renderizarRota as renderRoute };
