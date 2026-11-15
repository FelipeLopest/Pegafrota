import {
  el as criarElemento,
  fmt as formatar,
  botao,
  estadoVazio,
  navegar,
  cabecalhoPagina,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { PERMISSAO } from '@peganafrota/contracts';
import {
  tela,
  estatisticaRapida,
  tabela,
  ODOMETER_SOURCE as ORIGENS_ODOMETRO,
} from '../componentes/indicadores-e-relatorios.mjs';
import { abrirAjusteOdometro } from '../formularios/formulario-ajuste-odometro.mjs';

export function telaOdometro({
  outlet: conteudoTela,
  setTitle: definirTitulo,
  params: parametros,
  query: consulta,
}) {
  definirTitulo('Histórico de quilometragem');
  const recarregar = () =>
    telaOdometro({
      outlet: conteudoTela,
      setTitle: definirTitulo,
      params: parametros,
      query: consulta,
    });

  return tela(
    conteudoTela,
    PERMISSAO.ODOMETER_READ,
    async () => ({
      vehicles: await dados.vehicles.list({
        filters: { status: 'neq.archived' },
      }),
      ledger: parametros?.id
        ? await dados.odometer.ledger(parametros.id, Number(consulta?.get('pagina')) || 1)
        : null,
    }),
    ({ vehicles: veiculos, ledger: resposta }) => {
      const livro = resposta?.items || [];
      const selecionado = parametros?.id;
      const atual =
        veiculos.find((veiculoItem) => veiculoItem.id === selecionado)?.current_odometer_km ?? 0;
      const seletor = criarElemento(
        'select',
        {
          class: 'select',
          onChange: (evento) => navegar(`/odometro/${evento.target.value}`),
        },
        [
          criarElemento('option', { value: '', text: 'Selecione o veículo' }),
          ...veiculos.map((veiculoItem) =>
            criarElemento('option', {
              value: veiculoItem.id,
              text: veiculoItem.plate,
              selected: veiculoItem.id === selecionado,
            }),
          ),
        ],
      );

      const cabecalho = cabecalhoPagina({
        title: 'Histórico de quilometragem',
        subtitle:
          'Histórico de leituras por veículo. Cada registro guarda a origem — viagem, ' +
          'abastecimento ou ajuste manual — para a quilometragem ser auditável.',
      });

      const barraFerramentas = criarElemento('div', { class: 'toolbar' }, [
        criarElemento('div', { class: 'field toolbar-grow' }, [
          criarElemento('label', {
            class: 'field-label',
            for: 'odo-veh',
            text: 'Veículo',
          }),
          seletor,
        ]),
        selecionado
          ? botao({
              label: 'Ajuste manual',
              icon: 'edit',
              permission: PERMISSAO.ODOMETER_ADJUST,
              onClick: () =>
                abrirAjusteOdometro({
                  vehicleId: selecionado,
                  ledger: livro,
                  leituraAtual: atual,
                  onDone: recarregar,
                }),
            })
          : null,
      ]);
      seletor.id = 'odo-veh';

      if (!selecionado) {
        return criarElemento('div', {}, [
          cabecalho,
          barraFerramentas,
          estadoVazio({
            icon: 'gauge',
            title: 'Selecione um veículo',
            description: 'Escolha um veículo para ver as leituras e correções preservadas.',
          }),
        ]);
      }

      return criarElemento('div', {}, [
        cabecalho,
        barraFerramentas,
        resposta
          ? criarElemento('div', { class: 'pager' }, [
              botao({
                label: 'Anterior',
                disabled: resposta.page <= 1,
                onClick: () =>
                  navegar('/odometro/' + selecionado + '?pagina=' + (resposta.page - 1)),
              }),
              criarElemento('span', {
                text: 'Página ' + resposta.page + ' · ' + resposta.total + ' leituras',
              }),
              botao({
                label: 'Próxima',
                disabled: !resposta.hasNext,
                onClick: () =>
                  navegar('/odometro/' + selecionado + '?pagina=' + (resposta.page + 1)),
              }),
            ])
          : null,
        criarElemento('div', { class: 'summary-rail' }, [
          estatisticaRapida('Leitura atual', formatar.km(atual), 'gauge'),
          estatisticaRapida('Registros', resposta?.total ?? livro.length, 'audit'),
          estatisticaRapida(
            'Ajustes nesta página',
            livro.filter((evento) => evento.source_type === 'manual_adjustment').length,
            'edit',
          ),
          estatisticaRapida(
            'Correções nesta página',
            livro.filter((evento) => evento.correction_marker).length,
            'warning',
          ),
        ]),
        tabela(
          ['Quando', 'Leitura', 'Anterior', 'Origem', 'Natureza', 'Justificativa'],
          livro.map((evento) =>
            criarElemento('tr', {}, [
              criarElemento('td', {
                text: formatar.dateTime(evento.occurred_at),
              }),
              criarElemento('td', {
                class: 'num',
                text: formatar.km(evento.effective_km ?? evento.odometer_km),
              }),
              criarElemento('td', {
                class: 'num',
                text: formatar.km(evento.previous_km),
              }),
              criarElemento('td', {
                text: ORIGENS_ODOMETRO[evento.source_type] || evento.source_type,
              }),
              criarElemento('td', {
                text: evento.voided
                  ? 'Estornada'
                  : evento.correction_marker
                    ? 'Correção'
                    : evento.revised
                      ? 'Leitura corrigida'
                      : 'Leitura',
              }),
              criarElemento('td', { text: evento.reason || '—' }),
            ]),
          ),
        ),
      ]);
    },
  );
}
