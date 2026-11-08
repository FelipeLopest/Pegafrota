import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

export function abrirAlteracaoPapel(usuarioItem, aoConcluir) {
  let papel = usuarioItem.role;
  let correspondenciaItem;
  const corpo = campo({
    id: 'role-u',
    label: 'Novo cargo',
    control: criarElemento(
      'select',
      { class: 'select', onChange: (evento) => (papel = evento.target.value) },
      [
        ['company_admin', 'Administrador'],
        ['fleet_manager', 'Gestor de frota'],
        ['operator', 'Operador'],
        ['viewer', 'Visualizador'],
      ].map(([veiculoItem, linhaItem]) =>
        criarElemento('option', { value: veiculoItem, text: linhaItem, selected: veiculoItem === papel }),
      ),
    ),
  });
  correspondenciaItem = modal({
    title: `Alterar cargo · ${usuarioItem.full_name || ''}`,
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({
        label: 'Salvar',
        variant: 'primary',
        onClick: async () => {
          try {
            await dados.users.changeRole(usuarioItem.user_id, papel);
            correspondenciaItem.close();
            aoConcluir();
          } catch (erroCapturado) {
            notificacao(erroCapturado.message, { tone: 'danger' });
          }
        },
      }),
    ]),
  });
}
