import { icone } from './icones.mjs';
import { el as criarElemento } from './criar-elemento.mjs';
import { botao } from './botoes.mjs';

export function tabelaEsqueleto(linhas = 6, colunas = 5) {
  return criarElemento(
    'div',
    { class: 'skeleton-table', 'aria-hidden': 'true' },
    Array.from({ length: linhas }, () =>
      criarElemento(
        'div',
        { class: 'skeleton-row' },
        Array.from({ length: colunas }, () => criarElemento('div', { class: 'skeleton-cell' })),
      ),
    ),
  );
}

export function iconeEstado(nome, tom) {
  return criarElemento(
    'div',
    { class: 'state-icon', dataset: tom ? { tone: tom } : {}, 'aria-hidden': 'true' },
    [icone(nome, { size: 'lg' })],
  );
}

export function estadoVazio({
  title: titulo,
  description: descricao,
  action: acao,
  icon: nomeIcone = 'inbox',
}) {
  return criarElemento('div', { class: 'empty-state' }, [
    iconeEstado(nomeIcone),
    criarElemento('h3', { class: 'empty-title', text: titulo }),
    descricao ? criarElemento('p', { class: 'empty-description', text: descricao }) : null,
    acao || null,
  ]);
}

export function estadoErro({
  title: titulo,
  description: descricao,
  hint: dica,
  onRetry: aoTentarNovamente,
}) {
  return criarElemento('div', { class: 'error-state', role: 'alert' }, [
    iconeEstado('warning', 'danger'),
    criarElemento('h3', { class: 'error-title', text: titulo || 'Não foi possível carregar' }),
    descricao ? criarElemento('p', { class: 'error-description', text: descricao }) : null,
    aoTentarNovamente
      ? botao({ label: 'Tentar novamente', variant: 'primary', icon: 'refresh', onClick: aoTentarNovamente })
      : null,
    dica
      ? criarElemento('p', { class: 'error-meta' }, ['Código: ', criarElemento('code', { text: dica })])
      : null,
  ]);
}

export function estadoPermissaoNegada(rotulo) {
  return criarElemento('div', { class: 'empty-state' }, [
    iconeEstado('shield', 'warning'),
    criarElemento('h3', { class: 'empty-title', text: 'Você não tem acesso a esta área' }),
    criarElemento('p', {
      class: 'empty-description',
      text: `Esta tela exige a permissão "${rotulo}". Peça ao administrador da sua empresa para liberar.`,
    }),
  ]);
}

export function estadoSemEmpresa() {
  return criarElemento('div', { class: 'empty-state' }, [
    iconeEstado('building'),
    criarElemento('h3', { class: 'empty-title', text: 'Sem empresa vinculada' }),
    criarElemento('p', {
      class: 'empty-description',
      text: 'Sua conta está ativa, mas não há vínculo ativo com nenhuma empresa. Peça ao administrador para vincular seu acesso.',
    }),
  ]);
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { estadoSemEmpresa as noMembershipState };
