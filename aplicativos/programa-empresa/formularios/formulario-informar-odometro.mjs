import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

export function solicitarOdometro(titulo, rotulo, funcao) {
  let km = '';
  let correspondenciaItem;
  const corpo = campo({
    id: 'odo-action',
    label: rotulo,
    required: true,
    control: criarElemento('input', {
      class: 'input',
      type: 'number',
      onInput: (evento) => (km = evento.target.value),
    }),
  });
  correspondenciaItem = modal({
    title: titulo,
    body: corpo,
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({
        label: 'Confirmar',
        variant: 'primary',
        onClick: async () => {
          if (km === '') return;
          try {
            await funcao(Number(km));
            correspondenciaItem.close();
            notificacao(`${titulo} concluída.`, { tone: 'success' });
          } catch (erroCapturado) {
            notificacao(erroCapturado.message, { tone: 'danger' });
          }
        },
      }),
    ]),
  });
}
