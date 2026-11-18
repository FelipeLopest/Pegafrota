import {
  el as criarElemento,
  botao,
  campo,
  tabelaEsqueleto,
  estadoVazio,
  estadoErro,
  cabecalhoPagina,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';
import { dados, REPORTS as RELATORIOS } from '../dados/dados-do-programa.mjs';
import { sessao } from '../acesso/sessao-e-permissoes.mjs';
import { PERMISSAO } from '@peganafrota/contracts';
import {
  tela,
  tabela,
  humanizarColuna,
  formatarCelula,
} from '../componentes/indicadores-e-relatorios.mjs';
import { exportarCsv } from '../dados/exportar-relatorios.mjs';

const COLUNAS = {
  monthlyCosts: ['month_start', 'fuel_cost', 'maintenance_cost', 'total_cost', 'distance_km'],
  vehicleCosts: [
    'plate',
    'brand',
    'model',
    'fuel_cost',
    'maintenance_cost',
    'total_cost',
    'distance_km',
    'cost_per_km',
  ],
  maintenanceDue: [
    'plate',
    'description',
    'scheduled_for',
    'scheduled_odometer_km',
    'km_remaining',
    'overdue_by_date',
    'overdue_by_odometer',
  ],
  recentMovements: ['occurred_at', 'plate', 'movement_type', 'location_name', 'source', 'notes'],
  fuelEfficiency: [
    'plate',
    'unit',
    'total_distance_km',
    'total_quantity',
    'km_per_unit',
    'cost_per_km',
    'measured_segments',
  ],
};
const dataBr = (valor) =>
  String(valor || '')
    .slice(0, 10)
    .split('-')
    .reverse()
    .join('/');

export function telaRelatorios({ outlet: conteudoTela, setTitle: definirTitulo, query: consulta }) {
  definirTitulo('Relatórios');
  return tela(
    conteudoTela,
    PERMISSAO.REPORTS_READ,
    async () => ({}),
    () => {
      const tipoInicial = consulta?.get('tipo');
      let tipo = Object.hasOwn(COLUNAS, tipoInicial) ? tipoInicial : RELATORIOS[0].id;
      let geracao = 0;
      let exportando = false;
      const resultado = criarElemento('div', { 'aria-live': 'polite' });
      const de = criarElemento('input', {
        class: 'input',
        type: 'date',
        value: consulta?.get('de') || '',
      });
      const ate = criarElemento('input', {
        class: 'input',
        type: 'date',
        value: consulta?.get('ate') || '',
      });
      const periodo = criarElemento('div', { class: 'toolbar' }, [
        campo({ id: 'r-from', label: 'De', control: de }),
        campo({ id: 'r-to', label: 'Até', control: ate }),
      ]);
      const seletor = criarElemento(
        'select',
        {
          class: 'select',
          onChange: (evento) => {
            tipo = evento.target.value;
            periodo.hidden = !RELATORIOS.find((item) => item.id === tipo)?.period;
            geracao++;
            resultado.replaceChildren();
          },
        },
        RELATORIOS.map((item) =>
          criarElemento('option', {
            value: item.id,
            text: item.label,
            selected: tipo === item.id,
          }),
        ),
      );
      periodo.hidden = !RELATORIOS.find((item) => item.id === tipo)?.period;

      async function exportar(recorte, total, progresso) {
        if (exportando) return;
        exportando = true;
        const sessaoInicial = sessao.geracao;
        try {
          if (total > 50000)
            throw new Error(
              'Há mais de 50.000 linhas. Escolha um período menor para exportar sem cortes.',
            );
          const linhas = [];
          for (let pagina = 1; ; pagina++) {
            if (sessao.geracao !== sessaoInicial)
              throw new Error('A sessão mudou. Gere o relatório novamente.');
            const resposta = await dados.reports[recorte.tipo]({
              ...recorte,
              page: pagina,
              pageSize: 1000,
            });
            if (sessao.geracao !== sessaoInicial)
              throw new Error('A sessão mudou. Gere o relatório novamente.');
            if (Number(resposta.total) !== total)
              throw new Error('Os dados mudaram. Gere o relatório novamente antes de exportar.');
            linhas.push(...(resposta.items || []));
            progresso.textContent = 'Preparando ' + linhas.length + ' de ' + total + ' linha(s)…';
            if (!resposta.hasNext) break;
            if (!resposta.items?.length || linhas.length >= total)
              throw new Error('O servidor não entregou todas as páginas.');
          }
          if (linhas.length !== total)
            throw new Error('O resultado ficou incompleto. Gere o relatório novamente.');
          await exportarCsv(recorte.tipo, COLUNAS[recorte.tipo], linhas);
        } catch (erro) {
          notificacao(erro.message, { tone: 'danger' });
        } finally {
          exportando = false;
          progresso.textContent = '';
        }
      }

      async function executar(pagina = 1, recorte = null) {
        const pedido = recorte || {
          tipo,
          from: periodo.hidden ? null : de.value,
          to: periodo.hidden ? null : ate.value,
          vehicleId: consulta?.get('veiculo') || null,
        };
        const atual = ++geracao;
        const sessaoInicial = sessao.geracao;
        resultado.replaceChildren(tabelaEsqueleto(5, 4));
        try {
          if (pedido.from && pedido.to && pedido.from > pedido.to)
            throw new Error('A data inicial precisa ser anterior à data final.');
          const resposta = await dados.reports[pedido.tipo]({
            ...pedido,
            page: pagina,
          });
          if (atual !== geracao || sessaoInicial !== sessao.geracao || !resultado.isConnected)
            return;
          const lista = resposta?.items || [];
          if (!lista.length) {
            resultado.replaceChildren(
              estadoVazio({
                title: 'Sem dados para o recorte',
                description:
                  pedido.tipo === 'fuelEfficiency'
                    ? 'O consumo aparece quando há ciclos válidos entre tanques cheios.'
                    : 'Confira os filtros e o período.',
              }),
            );
            return;
          }
          const colunas = COLUNAS[pedido.tipo];
          const total = Number(resposta.total) || lista.length;
          const recorteConfirmado = resposta.period
            ? { ...pedido, from: resposta.period.from, to: resposta.period.to }
            : pedido;
          const progresso = criarElemento('span', {
            class: 'muted',
            role: 'status',
          });
          const textoPeriodo =
            resposta.period && !['maintenanceDue', 'fuelEfficiency'].includes(pedido.tipo)
              ? dataBr(resposta.period.from) +
                ' a ' +
                dataBr(resposta.period.to) +
                ' · ' +
                resposta.period.timezone
              : '';
          resultado.replaceChildren(
            criarElemento('p', {
              class: 'muted',
              text: [textoPeriodo, resposta.coverage].filter(Boolean).join(' — '),
            }),
            criarElemento('div', { class: 'toolbar' }, [
              criarElemento('strong', { text: total + ' registro(s)' }),
              botao({
                label: 'Exportar todos em CSV',
                icon: 'download',
                permission: PERMISSAO.REPORTS_EXPORT,
                onClick: () => exportar(recorteConfirmado, total, progresso),
              }),
              progresso,
            ]),
            tabela(
              colunas.map(humanizarColuna),
              lista.map((linha) =>
                criarElemento(
                  'tr',
                  {},
                  colunas.map((coluna) =>
                    criarElemento('td', {
                      text: formatarCelula(linha[coluna], coluna),
                    }),
                  ),
                ),
              ),
            ),
            criarElemento('div', { class: 'pager' }, [
              botao({
                label: 'Anterior',
                disabled: pagina <= 1,
                onClick: () => executar(pagina - 1, recorteConfirmado),
              }),
              criarElemento('span', {
                text:
                  'Página ' +
                  pagina +
                  ' de ' +
                  Math.max(1, Math.ceil(total / Number(resposta.pageSize || 50))),
              }),
              botao({
                label: 'Próxima',
                disabled: !resposta.hasNext,
                onClick: () => executar(pagina + 1, recorteConfirmado),
              }),
            ]),
          );
        } catch (erro) {
          if (atual === geracao && sessaoInicial === sessao.geracao)
            resultado.replaceChildren(
              estadoErro({
                description: erro.message,
                onRetry: () => executar(pagina, pedido),
              }),
            );
        }
      }
      if (tipoInicial && Object.hasOwn(COLUNAS, tipoInicial)) queueMicrotask(() => executar());
      return criarElemento('div', {}, [
        cabecalhoPagina({
          title: 'Relatórios',
        }),
        criarElemento('div', { class: 'toolbar report-toolbar' }, [
          campo({ id: 'r-kind', label: 'Relatório', control: seletor }),
          botao({
            label: 'Gerar',
            variant: 'primary',
            icon: 'chart',
            onClick: () => executar(),
          }),
        ]),
        periodo,
        resultado,
      ]);
    },
  );
}
