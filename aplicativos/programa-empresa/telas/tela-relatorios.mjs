import {
  el as criarElemento,
  botao,
  tabelaEsqueleto,
  estadoVazio,
  estadoErro,
  cabecalhoPagina,
} from '../componentes/componentes-do-programa.mjs';

import { dados, REPORTS as RELATORIOS } from '../dados/dados-do-programa.mjs';

import { PERMISSAO } from '@peganafrota/contracts';
import {
  tela,
  tabela,
  humanizarColuna,
  formatarCelula,
  estatisticaRapida,
} from '../componentes/indicadores-e-relatorios.mjs';
import { exportarCsv } from '../dados/exportar-relatorios.mjs';

export function telaRelatorios({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Relatórios');

  return tela(
    conteudoTela,
    PERMISSAO.REPORTS_READ,
    async () => ({}),
    () => {
      const cabecalho = cabecalhoPagina({
        title: 'Relatórios',
        subtitle: 'Consultas prontas sobre o período escolhido, com exportação em CSV.',
      });
      let selecionado = RELATORIOS[0].id;
      let de = '';
      let destino = '';
      const resultado = criarElemento('div', {});

      const camposPeriodo = criarElemento('div', { class: 'toolbar' }, [
        criarElemento('div', { class: 'field' }, [
          criarElemento('label', { class: 'field-label', for: 'r-from', text: 'De' }),
          criarElemento('input', {
            class: 'input',
            id: 'r-from',
            type: 'date',
            onInput: (evento) => {
              de = evento.target.value;
            },
          }),
        ]),
        criarElemento('div', { class: 'field' }, [
          criarElemento('label', { class: 'field-label', for: 'r-to', text: 'Até' }),
          criarElemento('input', {
            class: 'input',
            id: 'r-to',
            type: 'date',
            onInput: (evento) => {
              destino = evento.target.value;
            },
          }),
        ]),
      ]);

      const sincronizarPeriodo = () => {
        camposPeriodo.hidden = !RELATORIOS.find((resultadoItem) => resultadoItem.id === selecionado)?.period;
      };
      sincronizarPeriodo();

      const executar = async () => {
        resultado.replaceChildren(tabelaEsqueleto(5, 4));
        try {
          const parametros = { from: de || null, to: destino || null };
          const linhas = await dados.reports[selecionado](parametros);
          const lista = Array.isArray(linhas) ? linhas : (linhas?.items ?? linhas?.rows ?? []);

          if (!lista.length) {
            resultado.replaceChildren(
              estadoVazio({
                title: 'Sem dados no período',
                description: 'Ajuste as datas para ampliar o intervalo.',
              }),
            );
            return;
          }

          const colunas = Object.keys(lista[0]);
          resultado.replaceChildren(
            criarElemento('div', {}, [
              criarElemento('div', { class: 'toolbar' }, [
                botao({
                  label: 'Exportar CSV',
                  icon: 'download',
                  permission: PERMISSAO.REPORTS_EXPORT,
                  onClick: () => exportarCsv(selecionado, colunas, lista),
                }),
              ]),
              tabela(
                colunas.map(humanizarColuna),
                lista.map((resultadoItem) =>
                  criarElemento(
                    'tr',
                    {},
                    colunas.map((registro) =>
                      criarElemento('td', {
                        class: typeof resultadoItem[registro] === 'number' ? 'num' : '',
                        text: formatarCelula(resultadoItem[registro], registro),
                      }),
                    ),
                  ),
                ),
              ),
            ]),
          );
        } catch (erro) {
          resultado.replaceChildren(
            estadoErro({ description: erro.message, hint: erro.hint, onRetry: executar }),
          );
        }
      };

      return criarElemento('div', {}, [
        cabecalho,
        criarElemento('div', { class: 'summary-rail report-summary' }, [
          estatisticaRapida('Relatórios prontos', RELATORIOS.length, 'chart'),
          estatisticaRapida('Exportação', 'CSV', 'download'),
          estatisticaRapida('Período', 'Configurável', 'clock'),
        ]),
        criarElemento('div', { class: 'toolbar report-toolbar' }, [
          criarElemento('div', { class: 'field toolbar-grow' }, [
            criarElemento('label', { class: 'field-label', for: 'r-kind', text: 'Relatório' }),
            criarElemento(
              'select',
              {
                class: 'select',
                id: 'r-kind',
                onChange: (evento) => {
                  selecionado = evento.target.value;
                  sincronizarPeriodo();
                  resultado.replaceChildren();
                },
              },
              RELATORIOS.map((resultadoItem) =>
                criarElemento('option', { value: resultadoItem.id, text: resultadoItem.label }),
              ),
            ),
          ]),
          botao({ label: 'Gerar', variant: 'primary', icon: 'chart', onClick: executar }),
        ]),
        camposPeriodo,
        resultado,
      ]);
    },
  );
}
