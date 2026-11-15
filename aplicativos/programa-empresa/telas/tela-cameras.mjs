import { abrirFormularioCamera } from '../formularios/formulario-camera.mjs';
import { abrirFormularioPareamento } from '../formularios/formulario-parear-camera.mjs';
import { abrirFormularioRevisao } from '../formularios/formulario-revisar-leitura.mjs';
import {
  el as criarElemento,
  botao,
  campo,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';
import { dadosCameras, baixarImagemCamera } from '../dados/dados-cameras.mjs';
import { contexto } from '../acesso/empresa-e-permissoes-do-usuario.mjs';
import { monitorCameras } from '../comunicacao/monitorar-cameras.mjs';

const rotulos = {
  uploading: 'Recebendo imagem',
  queued: 'Na fila',
  processing: 'Reconhecendo',
  waiting_consensus: 'Aguardando outra captura',
  review: 'Revisão necessária',
  done: 'Processada',
  ignored: 'Sem movimentação',
  error: 'Falha',
};
export async function telaCameras({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Câmeras e leituras');
  if (!contexto.can('cameras.read')) {
    conteudoTela.textContent = 'Sem permissão para consultar câmeras.';
    return;
  }
  let encerrada = false;
  let acaoEmAndamento = false;
  let versao = 0;
  let temporizador;
  const urls = new Set();
  const mensagem = criarElemento('p', { role: 'status', 'aria-live': 'polite' });
  const painel = criarElemento('div');
  const erros = criarElemento('p', { role: 'alert' });
  const acoes = criarElemento('div', { class: 'form-row' });
  const pararOuIniciar = botao({
    label: 'Ativar monitoramento',
    permission: 'ocr.operate',
    onClick: async () => {
      try {
        if (monitorCameras.estado().executando) await monitorCameras.parar();
        else await monitorCameras.iniciar();
      } catch (erro) {
        notificacao(erro.message, { tone: 'danger' });
      }
    },
  });
  acoes.append(pararOuIniciar, botao({ label: 'Atualizar', onClick: () => atualizar() }));
  if (contexto.can('cameras.write'))
    acoes.append(
      botao({ label: 'Cadastrar câmera', variant: 'primary', onClick: () => editarCamera() }),
    );
  conteudoTela.replaceChildren(
    criarElemento('h1', { text: 'Câmeras e leituras' }),
    criarElemento('p', {
      text: 'A câmera envia fotos por Wi-Fi. Mantenha este aplicativo aberto e o monitoramento ativo para reconhecer as placas. O registro manual do pátio continua disponível.',
    }),
    acoes,
    mensagem,
    erros,
    painel,
  );
  const removerOuvinte = monitorCameras.acompanhar((estado) => {
    mensagem.textContent = estado.mensagem;
    pararOuIniciar.textContent = estado.executando
      ? 'Desligar monitoramento'
      : 'Ativar monitoramento';
  });

  async function executar(acao) {
    if (acaoEmAndamento) return;
    acaoEmAndamento = true;
    try {
      await acao();
      await atualizar();
    } catch (erro) {
      notificacao(erro.message, { tone: 'danger' });
    } finally {
      acaoEmAndamento = false;
    }
  }
  const editarCamera = (camera = null) => abrirFormularioCamera(camera, { executar });

  const gerarChave = (camera) => abrirFormularioPareamento(camera, { executar });

  async function mostrarImagem(captura) {
    try {
      const imagem = await baixarImagemCamera(captura.object_path);
      if (encerrada) return;
      const endereco = URL.createObjectURL(imagem);
      urls.add(endereco);
      const fotografia = criarElemento('img', {
        src: endereco,
        alt: 'Captura da câmera para conferência',
        style: 'max-width:100%;max-height:65vh;object-fit:contain',
      });
      modal({ title: 'Conferir captura', body: fotografia });
    } catch (erro) {
      notificacao(erro.message, { tone: 'danger' });
    }
  }

  const revisar = (captura) => abrirFormularioRevisao(captura, { executar, mostrarImagem });

  async function atualizar() {
    const atual = ++versao;
    try {
      const [cameras, capturas] = await Promise.all([
        dadosCameras.listar(),
        contexto.can('ocr.read') ? dadosCameras.capturas() : [],
      ]);
      if (encerrada || atual !== versao) return;
      erros.textContent = '';
      const lista = cameras.map((camera) => {
        const online = camera.last_seen_at && Date.now() - Date.parse(camera.last_seen_at) < 90000;
        const acoesCamera = criarElemento('div', { class: 'form-row' });
        if (contexto.can('cameras.write'))
          acoesCamera.append(
            botao({ label: 'Editar', onClick: () => editarCamera(camera) }),
            botao({ label: 'Parear câmera', onClick: () => gerarChave(camera) }),
            botao({
              label: 'Revogar chave',
              onClick: () => {
                const janela = modal({
                  title: 'Desconectar câmera?',
                  body: criarElemento('p', {
                    text: 'A câmera deixará de enviar capturas até receber uma nova chave.',
                  }),
                  footer: botao({
                    label: 'Revogar e desconectar',
                    onClick: () =>
                      executar(async () => {
                        await dadosCameras.chave(camera.id, true);
                        janela.close();
                      }),
                  }),
                });
              },
            }),
          );
        return criarElemento('article', { class: 'card' }, [
          criarElemento('h2', { text: camera.name }),
          criarElemento('p', {
            text: `${camera.active ? (online ? (camera.device_status === 'ready' ? 'Online' : 'Dispositivo conectado com erro: ' + (camera.device_status || 'desconhecido')) : 'Sem comunicação recente') : 'Desativada'} · ${camera.automatic_enabled ? 'Automação ligada' : 'Somente revisão'} · ${camera.direction === 'entry' ? 'Entrada' : camera.direction === 'exit' ? 'Saída' : 'Ambos os sentidos'}`,
          }),
          acoesCamera,
        ]);
      });
      const linhas = capturas.map((captura) => {
        const acoesCaptura = criarElemento('div', { class: 'form-row' });
        if (!captura.image_deleted_at && Date.now() - Date.parse(captura.received_at) < 86400000)
          acoesCaptura.append(
            botao({ label: 'Ver imagem', onClick: () => mostrarImagem(captura) }),
          );
        if (
          ['review', 'waiting_consensus'].includes(captura.status) &&
          !captura.image_deleted_at &&
          Date.now() - Date.parse(captura.captured_at) < 86400000 &&
          contexto.can('ocr.operate') &&
          contexto.can('movements.write')
        )
          acoesCaptura.append(botao({ label: 'Revisar', onClick: () => revisar(captura) }));
        return criarElemento('tr', {}, [
          criarElemento('td', { text: new Date(captura.captured_at).toLocaleString('pt-BR') }),
          criarElemento('td', {
            text: cameras.find((c) => c.id === captura.camera_id)?.name || 'Câmera',
          }),
          criarElemento('td', { text: captura.suggested_plate || '—' }),
          criarElemento('td', {
            text: `${rotulos[captura.status] || captura.status}${captura.result?.rejectionReason || captura.result?.reason || captura.error_message ? ' · ' + (captura.result?.rejectionReason || captura.result?.reason || captura.error_message) : ''}`,
          }),
          criarElemento('td', {}, [acoesCaptura]),
        ]);
      });
      painel.replaceChildren(
        ...lista,
        cameras.length
          ? criarElemento('h2', { text: 'Últimas capturas' })
          : criarElemento('p', {
              text: 'Nenhuma câmera cadastrada. A operação manual continua disponível no Pátio.',
            }),
        criarElemento('table', { class: 'table' }, [
          criarElemento('thead', {}, [
            criarElemento(
              'tr',
              {},
              ['Quando', 'Câmera', 'Placa', 'Resultado', 'Ações'].map((text) =>
                criarElemento('th', { text }),
              ),
            ),
          ]),
          criarElemento('tbody', {}, linhas),
        ]),
      );
    } catch (erro) {
      if (!encerrada && atual === versao) erros.textContent = erro.message;
    }
  }
  const aoProcessar = () => atualizar();
  addEventListener('pnf:captura-processada', aoProcessar);
  atualizar();
  temporizador = setInterval(atualizar, 10000);
  return () => {
    encerrada = true;
    clearInterval(temporizador);
    removerOuvinte();
    removeEventListener('pnf:captura-processada', aoProcessar);
    for (const url of urls) URL.revokeObjectURL(url);
  };
}
