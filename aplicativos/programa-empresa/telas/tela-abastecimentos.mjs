import {
  el as criarElemento,
  fmt as formatar,
  botao,
  navegar,
  cabecalhoPagina,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { PERMISSAO, TIPOS_COMBUSTIVEL_BOMBA } from '@peganafrota/contracts';
import {
  tela,
  indice,
  veiculosAtivos,
  exploradorColecao,
  correspondenciaPeriodo,
  tabela,
  contarOnde,
  diasAtras,
  faixaResumo,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirModalAbastecimentoV8 as abrirFormularioAbastecimento } from '../formularios/formulario-abastecimento.mjs';

export function telaAbastecimentos({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Abastecimentos');
  const recarregar = () => telaAbastecimentos({ outlet: conteudoTela, setTitle: definirTitulo });
  return tela(
    conteudoTela,
    PERMISSAO.FUELINGS_READ,
    async () => {
      const [abastecimentos, veiculos] = await Promise.all([dados.fuelings.list(), dados.vehicles.list()]);
      return { fuelings: abastecimentos, vehicles: veiculos };
    },
    ({ fuelings: abastecimentos, vehicles: veiculos }) => {
      const indiceVeiculo = indice(veiculos);
      const cabecalho = cabecalhoPagina({
        title: 'Abastecimentos',
        subtitle: 'Localize lançamentos por placa, posto ou produto e restrinja o histórico por período.',
        actions: [
          botao({
            label: 'Importar planilha',
            variant: 'automation',
            icon: 'upload',
            permission: PERMISSAO.FUELINGS_WRITE,
            onClick: () => navegar('/importar?tipo=abastecimentos'),
          }),
          botao({
            label: 'Registrar abastecimento',
            variant: 'primary',
            icon: 'plus',
            permission: PERMISSAO.FUELINGS_WRITE,
            onClick: () =>
              abrirFormularioAbastecimento({ vehicles: veiculosAtivos(veiculos), onDone: recarregar }),
          }),
        ],
      });
      const explorador = exploradorColecao(abastecimentos, {
        key: 'fuelings',
        placeholder: 'Buscar placa, posto ou tipo de combustível',
        getText: (formulario) =>
          `${indiceVeiculo.get(formulario.vehicle_id)?.plate || ''} ${formulario.station_name || ''} ${TIPOS_COMBUSTIVEL_BOMBA.find((itemComparado) => itemComparado.value === formulario.fuel_type)?.label || formulario.fuel_type}`,
        filters: [
          {
            key: 'period',
            label: 'Período',
            options: [
              ['', 'Todo o histórico'],
              ['today', 'Hoje'],
              ['7d', 'Últimos 7 dias'],
              ['30d', 'Últimos 30 dias'],
              ['90d', 'Últimos 90 dias'],
              ['older', 'Mais de 90 dias'],
            ],
            match: (formulario, veiculoItem) => correspondenciaPeriodo(formulario.fueled_at, veiculoItem),
          },
          {
            key: 'fuel',
            label: 'Produto',
            options: [
              ['', 'Todos'],
              ...TIPOS_COMBUSTIVEL_BOMBA.map((itemComparado) => [itemComparado.value, itemComparado.label]),
            ],
            get: (formulario) => formulario.fuel_type,
          },
          {
            key: 'vehicle',
            label: 'Veículo',
            options: [
              ['', 'Todos'],
              ...veiculos.map((veiculoItem) => [veiculoItem.id, formatar.plate(veiculoItem.plate)]),
            ],
            get: (formulario) => formulario.vehicle_id,
          },
        ],
        render: (itens) =>
          tabela(
            ['Data', 'Veículo', 'Produto', 'Posto', 'Litros', 'R$/L', 'Total', 'Odômetro'],
            itens.map((formulario) =>
              criarElemento('tr', {}, [
                criarElemento('td', { text: formatar.dateTime(formulario.fueled_at) }),
                criarElemento('td', {
                  class: 'mono',
                  text: formatar.plate(indiceVeiculo.get(formulario.vehicle_id)?.plate),
                }),
                criarElemento('td', {
                  text:
                    TIPOS_COMBUSTIVEL_BOMBA.find(
                      (itemComparado) => itemComparado.value === formulario.fuel_type,
                    )?.label || formulario.fuel_type,
                }),
                criarElemento('td', { text: formulario.station_name || '—' }),
                criarElemento('td', {
                  class: 'num',
                  text: `${Number(formulario.liters || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} L`,
                }),
                criarElemento('td', { class: 'num', text: formatar.money(formulario.price_per_liter) }),
                criarElemento('td', { class: 'num', text: formatar.money(formulario.total_amount) }),
                criarElemento('td', { class: 'num', text: formatar.km(formulario.odometer_km) }),
              ]),
            ),
          ),
        pageSize: 50,
      });
      const totalLitros = abastecimentos.reduce(
        (soma, formulario) => soma + (Number(formulario.liters) || 0),
        0,
      );
      const custoTotal = abastecimentos.reduce(
        (soma, formulario) => soma + (Number(formulario.total_amount) || 0),
        0,
      );
      const ultimos30 = contarOnde(
        abastecimentos,
        (formulario) => diasAtras(formulario.fueled_at) >= 0 && diasAtras(formulario.fueled_at) <= 30,
      );
      const estatisticas = faixaResumo([
        { label: 'Lançamentos', value: abastecimentos.length, icon: 'fuel' },
        { label: 'Últimos 30 dias', value: ultimos30, icon: 'clock', tone: 'info' },
        {
          label: 'Volume acumulado',
          value: `${totalLitros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L`,
          icon: 'gauge',
        },
        { label: 'Custo acumulado', value: formatar.money(custoTotal), icon: 'chart', tone: 'warning' },
      ]);
      return criarElemento('div', {}, [cabecalho, estatisticas, explorador]);
    },
  );
}
