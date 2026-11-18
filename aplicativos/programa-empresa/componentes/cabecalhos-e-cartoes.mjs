import { icone } from './icones.mjs';
import { el as criarElemento } from './criar-elemento.mjs';

export const METADADOS_PAGINAS = {
  'Visão geral': ['dashboard', 'PAINEL'],
  Pátio: ['yard', 'OPERAÇÃO'],
  Viagens: ['route', 'OPERAÇÃO'],
  Abastecimentos: ['fuel', 'OPERAÇÃO'],
  Manutenções: ['tool', 'OPERAÇÃO'],
  Veículos: ['truck', 'FROTA'],
  Motoristas: ['users', 'FROTA'],
  Locais: ['pin', 'GESTÃO'],
  'Locais e pátios': ['pin', 'GESTÃO'],
  Empresa: ['building', 'GESTÃO'],
  Equipe: ['shield', 'GESTÃO'],
  'Histórico de movimentações': ['movements', 'AVANÇADO'],
  'Entradas e saídas': ['movements', 'AVANÇADO'],
  'Histórico de alterações': ['audit', 'AVANÇADO'],
  Odômetro: ['gauge', 'AVANÇADO'],
  Quilometragem: ['gauge', 'AVANÇADO'],
  Relatórios: ['chart', 'ANÁLISE'],
  'Meu perfil': ['user', 'CONTA'],
};

export function cabecalhoPagina({
  title: titulo,
  subtitle: subtitulo,
  actions: acoes = [],
  iconName: nomeIcone,
}) {
  const acoesVisiveis = acoes.filter(Boolean);
  return criarElemento('div', { class: 'page-head' }, [
    criarElemento('div', { class: 'page-head-main' }, [
      nomeIcone
        ? criarElemento('div', { class: 'page-head-mark', 'aria-hidden': 'true' }, [icone(nomeIcone)])
        : null,
      criarElemento('div', { class: 'page-head-copy' }, [
        criarElemento('h1', { class: 'page-title', text: titulo }),
        subtitulo ? criarElemento('p', { class: 'page-subtitle', text: subtitulo }) : null,
      ]),
    ]),
    acoesVisiveis.length ? criarElemento('div', { class: 'page-actions' }, acoesVisiveis) : null,
  ]);
}

export function cartao({
  title: titulo,
  actions: acoes = [],
  children: filhos,
  flush: concluirPendencias = false,
}) {
  const cabecalho =
    titulo || acoes.length
      ? criarElemento('div', { class: 'card-head' }, [
          titulo
            ? criarElemento('h2', { class: 'card-title', text: titulo })
            : criarElemento('span', {}),
          acoes.length
            ? criarElemento('div', { class: 'page-actions' }, acoes.filter(Boolean))
            : null,
        ])
      : null;
  return criarElemento('section', { class: `card${concluirPendencias ? ' card-flush' : ''}` }, [
    cabecalho,
    ...[].concat(filhos || []),
  ]);
}

export function rotuloCartao(texto, nomeIcone) {
  return criarElemento('p', { class: 'card-label' }, [
    nomeIcone ? icone(nomeIcone, { size: 'sm' }) : null,
    criarElemento('span', { text: texto }),
  ]);
}

export function barraProporcao(segmentos, { thin: fino = false } = {}) {
  const total = segmentos.reduce((soma, textoItem) => soma + (Number(textoItem.value) || 0), 0);
  return criarElemento(
    'div',
    { class: `bar${fino ? ' bar-thin' : ''}`, 'aria-hidden': 'true' },
    segmentos
      .filter((textoItem) => Number(textoItem.value) > 0)
      .map((textoItem) => {
        const trecho = criarElemento('span');
        trecho.style.width = `${(Number(textoItem.value) / total) * 100}%`;
        trecho.style.background = textoItem.color;
        return trecho;
      }),
  );
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { METADADOS_PAGINAS as PAGE_META };
