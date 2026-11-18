import { contexto } from '../acesso/sessao-e-permissoes.mjs';
import { consumirAtalho } from '../formularios/apoio-operacoes.mjs';
import {
  el as criarElemento,
  fmt as formatar,
  botao,
  estadoVazio,
  cabecalhoPagina,
  cartao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { icone } from '../componentes/icones.mjs';

import { PERMISSAO } from '@peganafrota/contracts';
import {
  tela,
  indice,
  indicadorSimples,
  exploradorColecao,
  tabela,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirModalMovimentacaoV8 as abrirFormularioMovimentacao } from '../formularios/formulario-movimentacao.mjs';
import { abrirEditorLocal } from '../formularios/formulario-local.mjs';
import { abrirEditorVeiculo } from '../formularios/formulario-veiculo.mjs';

export function telaPatio({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Pátio');
  let encerrada = false;
  let temporizador;
  const recarregar = () => {
    if (encerrada) return;
    return tela(
      conteudoTela,
      PERMISSAO.MOVEMENTS_READ,
      async () => {
        const [captura, movimentacoes, locais] = await Promise.all([
          dados.yard(),
          dados.movements.recent(60),
          dados.locations.eligible(),
        ]);
        return { snap: captura, moves: movimentacoes, locations: locais };
      },
      ({ snap: captura, moves: movimentacoes, locations: locais }) => {
        const linhaItem = indice(locais);
        const listaVeiculos = captura?.vehicles || [];
        const faltaVeiculo = listaVeiculos.length === 0;
        const faltaPatio = locais.length === 0;
        const faltaCadastro = faltaVeiculo || faltaPatio;
        const permissaoCadastro = faltaVeiculo ? PERMISSAO.VEHICLES_WRITE : PERMISSAO.LOCATIONS_WRITE;
        const registrar = (id = '', inicial = false) =>
          !faltaCadastro && abrirFormularioMovimentacao({
            vehicle: listaVeiculos.find((item) => item.id === id),
            vehicles: inicial
              ? listaVeiculos.filter((item) => item.presence === 'unknown')
              : listaVeiculos,
            locations: locais,
            initial: inicial,
            onDone: recarregar,
          });
        if (contexto.can(PERMISSAO.MOVEMENTS_WRITE)) consumirAtalho(registrar);
        const cabecalho = cabecalhoPagina({
          title: 'Pátio',
          actions: [
            !faltaCadastro && captura?.neverMoved
              ? botao({
                  label: 'Conferir presença inicial',
                  icon: 'yard',
                  permission: PERMISSAO.MOVEMENTS_WRITE,
                  onClick: () => registrar('', true),
                })
              : null,
            botao({
              label: 'Registrar entrada ou saída',
              variant: 'primary',
              icon: 'plus',
              permission: PERMISSAO.MOVEMENTS_WRITE,
              disabled: faltaCadastro,
              onClick: () => registrar(),
            }),
          ],
        });
        const indicadores = criarElemento('div', { class: 'kpi-grid patio-indicadores' }, [
          indicadorSimples('No pátio', captura?.inside ?? 0),
          indicadorSimples('Fora do pátio', captura?.outside ?? 0),
          indicadorSimples(
            'Entradas hoje',
            captura?.entriesToday ?? 0,
            captura?.timezone || '',
          ),
          indicadorSimples('Saídas hoje', captura?.exitsToday ?? 0, captura?.timezone || ''),
        ]);
        const presenca = exploradorColecao(listaVeiculos, {
          key: 'yard',
          placeholder: 'Buscar placa, marca ou modelo',
          getText: (veiculoItem) =>
            `${veiculoItem.plate} ${veiculoItem.brand || ''} ${veiculoItem.model || ''}`,
          filters: [
            {
              key: 'local',
              label: 'Base',
              options: [['', 'Todas'], ...locais.map((item) => [item.id, item.name])],
              get: (item) => item.locationId,
            },
            {
              key: 'presence',
              label: 'Presença',
              default: '',
              options: [
                ['', 'Todos'],
                ['inside', 'No pátio'],
                ['outside', 'Fora do pátio'],
                ['unknown', 'Sem histórico'],
              ],
              get: (veiculoItem) => veiculoItem.presence || 'unknown',
            },
          ],
          render: (itens) =>
            tabela(
              ['Veículo', 'Modelo', 'Situação', 'Base', 'Última mudança', 'Ação'],
              itens.map((veiculoItem) =>
                criarElemento('tr', {}, [
                  criarElemento('td', {
                    class: 'mono',
                    text: formatar.plate(veiculoItem.plate),
                  }),
                  criarElemento('td', {
                    text: `${veiculoItem.brand || ''} ${veiculoItem.model || ''}`.trim(),
                  }),
                  criarElemento('td', {}, [
                    criarElemento('status-pill', {
                      status:
                        veiculoItem.presence === 'inside'
                          ? 'active'
                          : veiculoItem.presence === 'outside'
                            ? 'inactive'
                            : 'planned',
                      label:
                        veiculoItem.presence === 'inside'
                          ? 'No pátio'
                          : veiculoItem.presence === 'outside'
                            ? 'Fora do pátio'
                            : 'Sem histórico',
                    }),
                  ]),
                  criarElemento('td', {
                    text: linhaItem.get(veiculoItem.locationId)?.name || '—',
                  }),
                  criarElemento('td', {
                    text: veiculoItem.occurredAt ? formatar.dateTime(veiculoItem.occurredAt) : '—',
                  }),
                  criarElemento('td', {}, [
                    veiculoItem.presence === 'unknown'
                      ? botao({
                          label: 'Conferir presença',
                          variant: 'ghost',
                          permission: PERMISSAO.MOVEMENTS_WRITE,
                          disabled: faltaPatio,
                          onClick: () => registrar(veiculoItem.id, true),
                        })
                      : null,
                    botao({
                      label:
                        veiculoItem.presence === 'inside' ? 'Registrar saída' : 'Registrar entrada',
                      variant: 'ghost',
                      permission: PERMISSAO.MOVEMENTS_WRITE,
                      disabled: faltaPatio,
                      onClick: () =>
                        abrirFormularioMovimentacao({
                          vehicle: veiculoItem,
                          vehicles: listaVeiculos,
                          locations: locais,
                          onDone: recarregar,
                        }),
                    }),
                  ]),
                ]),
              ),
            ),
          pageSize: 40,
        });
        const recentes = movimentacoes.slice(0, 60).map((correspondenciaItem) =>
          criarElemento('tr', {}, [
            criarElemento('td', {
              text: formatar.dateTime(correspondenciaItem.occurred_at),
            }),
            criarElemento('td', {
              class: 'mono',
              text: formatar.plate(
                listaVeiculos.find(
                  (veiculoItem) => veiculoItem.id === correspondenciaItem.vehicle_id,
                )?.plate,
              ),
            }),
            criarElemento('td', {
              text: correspondenciaItem.movement_type === 'entry' ? 'Entrada' : 'Saída',
            }),
            criarElemento('td', {
              text: linhaItem.get(correspondenciaItem.location_id)?.name || '—',
            }),
            criarElemento('td', { text: correspondenciaItem.notes || '—' }),
          ]),
        );
        return criarElemento('div', {}, [
          cabecalho,
          faltaCadastro && contexto.can(PERMISSAO.MOVEMENTS_WRITE)
            ? criarElemento('section', { class: 'card primeiros-passos' }, [
                criarElemento('div', { class: 'primeiros-passos-cabecalho' }, [
                  criarElemento('div', {}, [
                    criarElemento('h2', {
                      class: 'card-title',
                      text: faltaVeiculo ? 'Adicione o primeiro veículo' : 'Adicione um pátio',
                    }),
                    criarElemento('p', {
                      class: 'muted',
                      text: contexto.can(permissaoCadastro)
                        ? 'Depois do cadastro você poderá registrar entradas e saídas aqui.'
                        : 'Peça ao administrador da empresa para concluir esse cadastro.',
                    }),
                  ]),
                  botao({
                    label: faltaVeiculo ? 'Cadastrar veículo' : 'Cadastrar pátio',
                    variant: 'primary',
                    permission: permissaoCadastro,
                    onClick: () => faltaVeiculo
                      ? abrirEditorVeiculo({ onDone: recarregar })
                      : abrirEditorLocal({ onDone: recarregar }),
                  }),
                ]),
              ])
            : null,
          indicadores,
          cartao({ title: 'Onde estão os veículos', children: [presenca] }),
          criarElemento('details', { class: 'collapsible-section' }, [
            criarElemento('summary', {}, [
              icone('clock', { size: 'sm' }),
              criarElemento('span', {
                text: `Entradas e saídas recentes · ${Math.min(movimentacoes.length, 60)}`,
              }),
            ]),
            recentes.length
              ? tabela(['Quando', 'Veículo', 'Tipo', 'Local', 'Observação'], recentes)
              : estadoVazio({
                  title: 'Sem movimentações',
                  description: 'Registre a primeira entrada.',
                }),
          ]),
        ]);
      },
    );
  };
  const aoProcessar = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(recarregar, 300);
  };
  addEventListener('pnf:captura-processada', aoProcessar);
  recarregar();
  return () => {
    encerrada = true;
    clearTimeout(temporizador);
    removeEventListener('pnf:captura-processada', aoProcessar);
    conteudoTela.__pnfLoadToken = Symbol('patio-encerrado');
  };
}
