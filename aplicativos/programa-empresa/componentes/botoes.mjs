import { aplicarPermissao } from '../acesso/sessao-e-permissoes.mjs';

import { icone } from './icones.mjs';
import { el as criarElemento } from './criar-elemento.mjs';

export const ICONES_AUTOMATICOS_BOTOES = new Map([
  ['novo', 'plus'],
  ['criar', 'plus'],
  ['adicionar', 'plus'],
  ['convidar', 'plus'],
  ['registrar', 'plus'],
  ['editar', 'edit'],
  ['salvar', 'check'],
  ['confirmar', 'check'],
  ['concluir', 'check'],
  ['iniciar', 'right'],
  ['abrir', 'right'],
  ['continuar', 'right'],
  ['cancelar', 'close'],
  ['fechar', 'close'],
  ['sair', 'logout'],
  ['arquivar', 'archive'],
  ['restaurar', 'refresh'],
  ['reativar', 'refresh'],
  ['atualizar', 'refresh'],
  ['recarregar', 'refresh'],
  ['buscar', 'search'],
  ['filtrar', 'filter'],
  ['exportar', 'download'],
  ['baixar', 'download'],
]);

export function inferirIconeBotao(rotulo, explicito) {
  if (explicito) return explicito;
  const normalizado = String(rotulo || '')
    .trim()
    .toLowerCase();
  if (!normalizado) return null;
  for (const [chave, nomeIcone] of ICONES_AUTOMATICOS_BOTOES.entries()) {
    if (normalizado.startsWith(chave)) return nomeIcone;
  }
  return null;
}

export function botao({
  label: rotulo,
  variant: variacao = 'secondary',
  onClick: aoClicar,
  disabled: desabilitado,
  busy: ocupado,
  title: titulo,
  permission: permissao,
  icon: nomeIcone,
  size: tamanho,
}) {
  const botao = criarElemento(
    'button',
    {
      class: `btn btn-${variacao}${tamanho === 'sm' ? ' btn-sm' : ''}${tamanho === 'block' ? ' btn-block' : ''}`,
      type: 'button',
      disabled: desabilitado || ocupado,
      'aria-busy': ocupado ? 'true' : null,
      title: titulo || null,
      onClick: aoClicar,
    },
    [
      ocupado
        ? criarElemento('span', { class: 'btn-spinner', 'aria-hidden': 'true' })
        : inferirIconeBotao(rotulo, nomeIcone)
          ? icone(inferirIconeBotao(rotulo, nomeIcone), { size: 'sm' })
          : null,
      criarElemento('span', { text: rotulo }),
    ],
  );

  if (permissao) aplicarPermissao(botao, permissao);
  return botao;
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { ICONES_AUTOMATICOS_BOTOES as AUTO_BUTTON_ICONS };
