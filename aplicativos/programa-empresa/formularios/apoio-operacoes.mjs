import { contexto } from '../acesso/sessao-e-permissoes.mjs';
import { empresaLocalParaIso } from '../componentes/listas-resumos-e-detalhes.mjs';
export function dataHoraEmpresa(iso = new Date().toISOString()) {
  if (!iso) return '';
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: contexto.data?.company?.timezone || 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((parte) => [parte.type, parte.value]),
  );
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}`;
}
export function instanteEmpresa(valor) {
  if (!valor) throw new Error('Informe a data e a hora reais.');
  const instante = empresaLocalParaIso(valor);
  if (!Number.isFinite(Date.parse(instante))) throw new Error('Data ou hora inválida.');
  return instante;
}
export function numeroInformado(valor, rotulo, minimo = 0) {
  if (
    String(valor ?? '').trim() === '' ||
    !Number.isFinite(Number(valor)) ||
    Number(valor) < minimo
  )
    throw new Error(`Informe ${rotulo} válido${minimo > 0 ? ' e maior que zero' : ''}.`);
  return Number(valor);
}
export function unidadeProduto(produto) {
  return produto === 'cng' ? 'm³' : 'L';
}

export function abrirModalComVolta(janela, abrirEditor, reabrir, aoSalvar) {
  janela.close();
  let voltou = false;
  const voltar = () => {
    if (voltou) return;
    voltou = true;
    reabrir();
  };
  abrirEditor({
    onCancel: voltar,
    onDone: (...resultado) => {
      try {
        aoSalvar(...resultado);
      } finally {
        voltar();
      }
    },
  });
}

export function consumirAtalho(acao) {
  const [rota, consulta = ''] = location.hash.slice(1).split('?');
  const parametros = new URLSearchParams(consulta);
  if (parametros.get('novo') !== '1') return;
  const veiculo = parametros.get('veiculo') || '';
  parametros.delete('novo');
  parametros.delete('veiculo');
  history.replaceState(
    null,
    '',
    `${location.pathname}${location.search}#${rota}${parametros.size ? '?' + parametros : ''}`,
  );
  queueMicrotask(() => acao(veiculo));
}
