import {
  el as criarElemento,
  botao,
  campo,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';
import { dadosCameras } from '../dados/dados-cameras.mjs';
import { carregarConfiguracao } from '../sistema/carregar-configuracao-da-interface.mjs';

export async function abrirFormularioPareamento(camera, { executar }) {
  const aviso = criarElemento('p', {
    text: 'Gerar uma nova chave desconecta a configuração anterior desta câmera. Guarde a chave fora de repositórios públicos e não compartilhe o arquivo de pareamento.',
  });
  const resultado = criarElemento('div');
  const rede = criarElemento('input', { class: 'input', maxlength: 32, autocomplete: 'off' });
  const senha = criarElemento('input', {
    class: 'input',
    type: 'password',
    maxlength: 63,
    autocomplete: 'off',
  });
  const perfil = criarElemento('select', { class: 'select' }, [
    criarElemento('option', { value: '', text: 'Identifique o modelo exato antes de parear' }),
    criarElemento('option', { value: 'esp32s3-eye', text: 'Espressif ESP32-S3-EYE' }),
    criarElemento('option', { value: 'xiao-esp32s3-sense', text: 'Seeed XIAO ESP32S3 Sense' }),
  ]);
  let segredo = null;
  modal({
    title: 'Parear câmera ESP32-S3',
    body: criarElemento('div', {}, [
      aviso,
      campo({ id: 'par-modelo', label: 'Modelo da placa', control: perfil }),
      campo({ id: 'par-rede', label: 'Rede Wi-Fi de 2,4 GHz', control: rede }),
      campo({ id: 'par-senha', label: 'Senha da rede Wi-Fi', control: senha }),
      resultado,
    ]),
    footer: botao({
      label: 'Gerar nova chave e configuração',
      onClick: () =>
        executar(async () => {
          if (!perfil.value || !rede.value.trim())
            throw new Error(
              'Informe o modelo exato e a rede Wi-Fi. Não selecione um modelo por suposição.',
            );
          const retorno = await dadosCameras.chave(camera.id);
          const configuracao = await carregarConfiguracao();
          segredo = {
            schemaVersion: 1,
            endpoint: `${configuracao.supabaseUrl}/functions/v1/camera-intake`,
            deviceKey: retorno.deviceKey,
            boardProfile: perfil.value,
            wifiSsid: rede.value,
            wifiPassword: senha.value,
          };
          resultado.replaceChildren(
            criarElemento('p', {
              text: 'Chave exibida somente nesta operação. Use os valores no pareamento USB do firmware.',
            }),
            criarElemento('textarea', { class: 'textarea', readonly: true, rows: 7, value: '' }),
          );
          resultado.querySelector('textarea').value = 'CONFIG ' + JSON.stringify(segredo);
          resultado.append(
            botao({
              label: 'Salvar configuração de pareamento',
              onClick: () =>
                executar(() =>
                  window.pnf.exportFile({
                    suggestedName: 'pareamento-camera',
                    format: 'json',
                    content: JSON.stringify(segredo, null, 2),
                  }),
                ),
            }),
          );
        }),
    }),
  });
}
