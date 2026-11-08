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

export function telaOdometro({ outlet: conteudoTela, setTitle: definirTitulo, params: parametros }) {
  definirTitulo('Odômetro');
  const recarregar = () =>
    telaOdometro({ outlet: conteudoTela, setTitle: definirTitulo, params: parametros });

  return tela(
    conteudoTela,
    PERMISSAO.ODOMETER_READ,
    async () => ({
      vehicles: await dados.vehicles.list({ filters: { status: 'neq.archived' } }),
      ledger: parametros?.id ? await dados.odometer.ledger(parametros.id) : [],
    }),
    ({ vehicles: veiculos, ledger: livro }) => {
      const selecionado = parametros?.id;
      const seletor = criarElemento(
        'select',
        { class: 'select', onChange: (evento) => navegar(`/odometro/${evento.target.value}`) },
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
        title: 'Odômetro',
        subtitle:
          'Histórico de leituras por veículo. Cada registro guarda a origem — viagem, ' +
          'abastecimento ou ajuste manual — para a quilometragem ser auditável.',
      });

      const barraFerramentas = criarElemento('div', { class: 'toolbar' }, [
        criarElemento('div', { class: 'field toolbar-grow' }, [
          criarElemento('label', { class: 'field-label', for: 'odo-veh', text: 'Veículo' }),
          seletor,
        ]),
        selecionado
          ? botao({
              label: 'Ajuste manual',
              icon: 'edit',
              permission: PERMISSAO.ODOMETER_ADJUST,
              onClick: () =>
                abrirAjusteOdometro({ vehicleId: selecionado, ledger: livro, onDone: recarregar }),
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
            description: 'O ledger de odômetro é por veículo e só cresce.',
          }),
        ]);
      }

      const atual =
        livro?.[0]?.odometer_km ??
        veiculos.find((veiculoItem) => veiculoItem.id === selecionado)?.current_odometer_km ??
        0;
      return criarElemento('div', {}, [
        cabecalho,
        barraFerramentas,
        criarElemento('div', { class: 'summary-rail' }, [
          estatisticaRapida('Leitura atual', formatar.km(atual), 'gauge'),
          estatisticaRapida('Registros', livro.length, 'audit'),
          estatisticaRapida(
            'Ajustes manuais',
            livro.filter((evento) => evento.source_type === 'manual_adjustment').length,
            'edit',
          ),
          estatisticaRapida(
            'Correções',
            livro.filter((evento) => !!evento.correction_of_id).length,
            'warning',
          ),
        ]),
        tabela(
          ['Quando', 'Leitura', 'Anterior', 'Origem', 'Natureza', 'Justificativa'],
          livro.map((evento) =>
            criarElemento('tr', {}, [
              criarElemento('td', { text: formatar.dateTime(evento.occurred_at) }),
              criarElemento('td', { class: 'num', text: formatar.km(evento.odometer_km) }),
              criarElemento('td', { class: 'num', text: formatar.km(evento.previous_km) }),
              criarElemento('td', { text: ORIGENS_ODOMETRO[evento.source_type] || evento.source_type }),
              criarElemento('td', { text: evento.correction_of_id ? 'Correção' : 'Leitura' }),
              criarElemento('td', { text: evento.reason || '—' }),
            ]),
          ),
        ),
      ]);
    },
  );
}
