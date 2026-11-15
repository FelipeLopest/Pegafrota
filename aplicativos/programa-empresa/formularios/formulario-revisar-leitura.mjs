import {
  el as criarElemento,
  botao,
  campo,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';
import { dadosCameras } from '../dados/dados-cameras.mjs';
import { dadosVeiculos } from '../dados/dados-veiculos.mjs';

export async function abrirFormularioRevisao(captura, { executar, mostrarImagem }) {
  try {
    const veiculos = await dadosVeiculos.list({ filters: { archived_at: 'is.null' } });
    const selecao = criarElemento(
      'select',
      { class: 'select' },
      veiculos.map((v) =>
        criarElemento('option', {
          value: v.id,
          text: `${v.plate} · ${v.brand || ''} ${v.model || ''}`,
        }),
      ),
    );
    const motivo = criarElemento('textarea', { class: 'textarea', rows: 3 });
    let janela;
    janela = modal({
      title: 'Revisar leitura de placa',
      body: criarElemento('div', {}, [
        criarElemento('p', {
          text: `Sugestão: ${captura.suggested_plate || 'sem placa'}. Confira a imagem e a presença no pátio antes de registrar. A confirmação produz uma entrada ou saída.`,
        }),
        botao({ label: 'Conferir imagem', onClick: () => mostrarImagem(captura) }),
        campo({ id: 'rev-veiculo', label: 'Veículo confirmado', control: selecao }),
        campo({
          id: 'rev-motivo',
          label: 'Motivo e conferência (mínimo 10 caracteres)',
          control: motivo,
        }),
      ]),
      footer: botao({
        label: 'Confirmar e registrar movimentação',
        variant: 'primary',
        onClick: () =>
          executar(async () => {
            await dadosCameras.revisar(captura.id, selecao.value, motivo.value);
            window.dispatchEvent(new CustomEvent('pnf:captura-processada'));
            janela.close();
          }),
      }),
    });
  } catch (erro) {
    notificacao(erro.message, { tone: 'danger' });
  }
}
