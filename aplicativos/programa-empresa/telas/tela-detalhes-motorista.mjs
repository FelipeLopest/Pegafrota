import {
  el as criarElemento,
  fmt as formatar,
  botao,
  notificacao,
  estadoVazio,
  cabecalhoPagina,
  cartao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { PERMISSAO, ROTULO_STATUS_VIAGEM as ROTULO_SITUACAO_VIAGEM } from '@peganafrota/contracts';
import {
  tela,
  indice,
  solicitarTexto,
  detalhe,
  rotuloSituacaoMotorista,
  tabela,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirEditorMotorista } from '../formularios/formulario-motorista.mjs';

export function telaDetalheMotorista({ outlet: conteudoTela, setTitle: definirTitulo, params: parametros }) {
  definirTitulo('Motorista');
  const recarregar = () =>
    telaDetalheMotorista({ outlet: conteudoTela, setTitle: definirTitulo, params: parametros });
  return tela(
    conteudoTela,
    PERMISSAO.DRIVERS_READ,
    async () => {
      const motorista = await dados.drivers.get(parametros.id);
      if (!motorista) throw new Error('Motorista não encontrado.');
      const filtros = { driver_id: `eq.${motorista.id}` };
      const [viagens, totalViagens, veiculos] = await Promise.all([
        dados.trips.recent(filtros, 12),
        dados.trips.count(filtros),
        dados.vehicles.list(),
      ]);
      return { driver: motorista, trips: viagens, totalTrips: totalViagens, vehicles: veiculos };
    },
    ({ driver: motorista, trips: viagens, totalTrips: totalViagens, vehicles: veiculos }) => {
      const indiceVeiculo = indice(veiculos);
      const acoes = [
        botao({
          label: 'Editar',
          icon: 'edit',
          permission: PERMISSAO.DRIVERS_WRITE,
          onClick: () => abrirEditorMotorista({ driver: motorista, onDone: recarregar }),
        }),
      ];
      if (motorista.archived_at) {
        acoes.push(
          botao({
            label: 'Desarquivar',
            permission: PERMISSAO.DRIVERS_ARCHIVE,
            onClick: async () => {
              try {
                await dados.drivers.unarchive(motorista.id);
                notificacao('Motorista desarquivado.', { tone: 'success' });
                recarregar();
              } catch (erroCapturado) {
                notificacao(erroCapturado.message, { tone: 'danger' });
              }
            },
          }),
        );
      } else {
        acoes.push(
          botao({
            label: motorista.active ? 'Desativar' : 'Ativar',
            variant: 'ghost',
            permission: PERMISSAO.DRIVERS_WRITE,
            onClick: async () => {
              try {
                await dados.drivers.setActive(motorista.id, !motorista.active);
                notificacao(motorista.active ? 'Motorista desativado.' : 'Motorista ativado.', {
                  tone: 'success',
                });
                recarregar();
              } catch (erroCapturado) {
                notificacao(erroCapturado.message, { tone: 'danger' });
              }
            },
          }),
        );
        acoes.push(
          botao({
            label: 'Arquivar',
            variant: 'danger',
            permission: PERMISSAO.DRIVERS_ARCHIVE,
            onClick: async () => {
              const motivo = await solicitarTexto({
                title: 'Arquivar motorista',
                label: 'Motivo do arquivamento',
                hint: 'O motorista sairá das novas viagens, mas seu histórico continuará disponível.',
                confirmLabel: 'Arquivar motorista',
                danger: true,
              });
              if (!motivo) return;
              try {
                await dados.drivers.archive(motorista.id, motivo);
                notificacao('Motorista arquivado.', { tone: 'success' });
                recarregar();
              } catch (erroCapturado) {
                notificacao(erroCapturado.message, { tone: 'danger' });
              }
            },
          }),
        );
      }
      const recentes = viagens.slice(0, 12).map((itemAtual) =>
        criarElemento('tr', {}, [
          criarElemento('td', {
            text: formatar.dateTime(itemAtual.actual_departure_at || itemAtual.planned_departure_at),
          }),
          criarElemento('td', {
            class: 'mono',
            text: formatar.plate(indiceVeiculo.get(itemAtual.vehicle_id)?.plate),
          }),
          criarElemento('td', { text: `${itemAtual.origin_label} → ${itemAtual.destination_label}` }),
          criarElemento('td', {}, [
            criarElemento('status-pill', {
              status: itemAtual.status,
              label: ROTULO_SITUACAO_VIAGEM[itemAtual.status],
            }),
          ]),
        ]),
      );
      return criarElemento('div', {}, [
        cabecalhoPagina({
          title: motorista.full_name,
          subtitle: motorista.internal_document || 'Motorista da empresa',
          actions: acoes,
        }),
        cartao({
          title: 'Cadastro',
          children: [
            criarElemento('div', { class: 'detail-grid' }, [
              detalhe('Telefone', motorista.phone),
              detalhe('Documento interno', motorista.internal_document),
              detalhe('Categoria CNH', motorista.license_category),
              detalhe('Validade da CNH', formatar.date(motorista.license_expires_on)),
              detalhe('Situação', rotuloSituacaoMotorista(motorista)),
              detalhe('Observações', motorista.notes),
            ]),
          ],
        }),
        cartao({
          title: `Viagens · ${totalViagens}`,
          children: [
            recentes.length
              ? tabela(['Quando', 'Veículo', 'Rota', 'Estado'], recentes)
              : estadoVazio({
                  title: 'Sem viagens',
                  description: 'Este motorista ainda não possui viagens registradas.',
                }),
          ],
        }),
      ]);
    },
  );
}
