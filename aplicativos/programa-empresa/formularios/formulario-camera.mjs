import {
  el as criarElemento,
  botao,
  campo,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';
import { dadosCameras } from '../dados/dados-cameras.mjs';
import { dadosLocais } from '../dados/dados-locais.mjs';

export async function abrirFormularioCamera(camera = null, { executar } = {}) {
  try {
    const locais = await dadosLocais.eligible();
    const campos = {};
    function entrada(nome, rotulo, valor, tipo = 'text') {
      const controle = criarElemento('input', { class: 'input', type: tipo, value: valor ?? '' });
      campos[nome] = controle;
      return campo({ id: `cam-${nome}`, label: rotulo, control: controle });
    }
    const local = criarElemento(
      'select',
      { class: 'select' },
      locais
        .filter((l) => l.active && !l.archived_at)
        .map((l) => criarElemento('option', { value: l.id, text: l.name })),
    );
    local.value = camera?.location_id || locais[0]?.id || '';
    const direcao = criarElemento(
      'select',
      { class: 'select' },
      [
        ['entry', 'Somente entrada'],
        ['exit', 'Somente saída'],
        ['both', 'Ambas: somente revisão manual'],
      ].map(([valor, rotulo]) => criarElemento('option', { value: valor, text: rotulo })),
    );
    direcao.value = camera?.direction || 'entry';
    const ativa = criarElemento('input', { type: 'checkbox' });
    ativa.checked = camera?.active ?? true;
    const automatica = criarElemento('input', { type: 'checkbox' });
    automatica.checked = camera?.automatic_enabled ?? false;
    const corpo = criarElemento('div', {}, [
      entrada('nome', 'Nome da câmera', camera?.name || ''),
      campo({ id: 'cam-local', label: 'Local', control: local }),
      campo({ id: 'cam-direcao', label: 'Sentido observado pela câmera', control: direcao }),
      entrada('confianca', 'Confiança mínima (0,80 a 1)', camera?.min_confidence ?? 0.9, 'number'),
      entrada('limite', 'Limite de fotos por 24 horas (1 a 10000)', camera?.settings?.dailyCaptureLimit ?? 1000, 'number'),
      criarElemento('p', { class: 'muted', text: 'Cada passagem gera até três fotos. O limite ajuda a controlar armazenamento e transferência.' }),
      entrada(
        'roi',
        'Área da placa: esquerda, topo, direita, base (0 a 1)',
        (camera?.settings?.roi || [0, 0, 1, 1]).join(','),
      ),
      criarElemento('label', {}, [ativa, ' Câmera ativa']),
      criarElemento('br'),
      criarElemento('label', {}, [
        automatica,
        ' Ativar movimentação automática após calibrar e testar a câmera',
      ]),
      criarElemento('p', {
        text: 'Comece com a automação desativada. Posicione a câmera, confira as fotos e ajuste a área da placa. A automação exige duas capturas concordantes; câmeras bidirecionais ficam em revisão manual.',
      }),
    ]);
    let janela;
    janela = modal({
      title: camera ? 'Editar câmera' : 'Cadastrar câmera',
      body: corpo,
      footer: botao({
        label: 'Salvar câmera',
        variant: 'primary',
        onClick: () =>
          executar(async () => {
            await dadosCameras.salvar({
              p_camera_id: camera?.id || null,
              p_name: campos.nome.value,
              p_location_id: local.value,
              p_direction: direcao.value,
              p_active: ativa.checked,
              p_automatic: automatica.checked,
              p_min_confidence: Number(campos.confianca.value),
              p_roi: campos.roi.value.split(',').map(Number),
              p_daily_limit: Number(campos.limite.value),
            });
            janela.close();
          }),
      }),
    });
  } catch (erro) {
    notificacao(erro.message, { tone: 'danger' });
  }
}
