import { dadosTelaInicial } from './dados-tela-inicial.mjs';
import { dadosVeiculos } from './dados-veiculos.mjs';
import { dadosMotoristas } from './dados-motoristas.mjs';
import { dadosLocais } from './dados-locais.mjs';
import { dadosViagens } from './dados-viagens.mjs';
import { dadosAbastecimentos } from './dados-abastecimentos.mjs';
import { dadosManutencoes } from './dados-manutencoes.mjs';
import { dadosPatio } from './dados-patio.mjs';
import { dadosMovimentacoes } from './dados-movimentacoes.mjs';
import { dadosOdometro } from './dados-odometro.mjs';
import { dadosEmpresa } from './dados-empresa.mjs';
import { dadosEquipe } from './dados-equipe.mjs';
import { dadosRelatorios } from './dados-relatorios.mjs';
import { dadosAuditoria } from './dados-auditoria.mjs';
import { registrarUltimoAcesso } from './dados-ultimo-acesso.mjs';
export const dados = {
  dashboard: dadosTelaInicial,
  vehicles: dadosVeiculos,
  drivers: dadosMotoristas,
  locations: dadosLocais,
  trips: dadosViagens,
  fuelings: dadosAbastecimentos,
  maintenance: dadosManutencoes,
  yard: dadosPatio,
  movements: dadosMovimentacoes,
  odometer: dadosOdometro,
  company: dadosEmpresa,
  users: dadosEquipe,
  reports: dadosRelatorios,
  audit: dadosAuditoria,
  touchLastSeen: registrarUltimoAcesso,
};

export const RELATORIOS = Object.freeze([
  { id: 'monthlyCosts', label: 'Custos mensais', period: true },
  { id: 'vehicleCosts', label: 'Custos por veículo', period: true },
  { id: 'maintenanceDue', label: 'Manutenções a vencer', period: false },
  { id: 'recentMovements', label: 'Movimentações recentes', period: true },
]);
export { RELATORIOS as REPORTS };
