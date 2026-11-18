import { PERMISSAO } from '@peganafrota/contracts';

export const MENU = [
  {
    path: '/',
    pattern: '/',
    label: 'Visão geral',
    icon: 'dashboard',
    permission: PERMISSAO.DASHBOARD_READ,
  },

  { group: 'Dia a dia' },
  {
    path: '/patio',
    pattern: '/patio',
    label: 'Pátio',
    termos: ['portaria', 'entrada', 'saída'],
    icon: 'yard',
    permission: PERMISSAO.MOVEMENTS_READ,
    roles: ['company_admin', 'fleet_manager', 'operator'],
  },
  {
    path: '/viagens',
    pattern: '/viagens',
    label: 'Viagens',
    icon: 'route',
    permission: PERMISSAO.TRIPS_READ,
    roles: ['company_admin', 'fleet_manager', 'operator'],
  },
  {
    path: '/abastecimentos',
    pattern: '/abastecimentos',
    label: 'Abastecimentos',
    icon: 'fuel',
    permission: PERMISSAO.FUELINGS_READ,
    roles: ['company_admin', 'fleet_manager', 'operator'],
  },
  {
    path: '/manutencoes',
    pattern: '/manutencoes',
    label: 'Manutenções',
    icon: 'tool',
    permission: PERMISSAO.MAINTENANCE_READ,
    roles: ['company_admin', 'fleet_manager', 'operator'],
  },

  { group: 'Cadastros' },
  {
    path: '/veiculos',
    pattern: '/veiculos',
    label: 'Veículos',
    icon: 'truck',
    permission: PERMISSAO.VEHICLES_READ,
  },
  {
    path: '/motoristas',
    pattern: '/motoristas',
    label: 'Motoristas',
    icon: 'users',
    permission: PERMISSAO.DRIVERS_READ,
    roles: ['company_admin', 'fleet_manager'],
  },

  {
    path: '/locais',
    pattern: '/locais',
    label: 'Locais e pátios',
    termos: ['base', 'garagem', 'portaria'],
    icon: 'pin',
    permission: PERMISSAO.LOCATIONS_READ,
    roles: ['company_admin', 'fleet_manager'],
  },
  {
    path: '/importar',
    pattern: '/importar',
    label: 'Importar planilha',
    icon: 'upload',
    permission: null,
    roles: ['company_admin', 'fleet_manager', 'operator'],
  },
  {
    path: '/empresa',
    pattern: '/empresa',
    label: 'Empresa',
    icon: 'building',
    permission: PERMISSAO.COMPANY_READ,
    roles: ['company_admin'],
  },
  {
    path: '/usuarios',
    pattern: '/usuarios',
    label: 'Equipe',
    icon: 'shield',
    permission: PERMISSAO.USERS_READ,
    roles: ['company_admin'],
  },

  { group: 'Consultas' },
  {
    path: '/relatorios',
    pattern: '/relatorios',
    label: 'Relatórios',
    icon: 'chart',
    permission: PERMISSAO.REPORTS_READ,
    roles: ['company_admin', 'fleet_manager', 'viewer'],
  },

  {
    path: '/movimentacoes',
    pattern: '/movimentacoes',
    label: 'Entradas e saídas',
    termos: ['histórico de movimentações', 'portaria'],
    icon: 'movements',
    permission: PERMISSAO.MOVEMENTS_READ,
    roles: ['company_admin', 'fleet_manager'],
  },
  {
    path: '/odometro',
    pattern: '/odometro',
    label: 'Quilometragem',
    termos: ['odômetro', 'leitura', 'histórico de quilometragem'],
    icon: 'gauge',
    permission: PERMISSAO.ODOMETER_READ,
    roles: ['company_admin', 'fleet_manager'],
  },

  { group: 'Conta' },
  { path: '/perfil', pattern: '/perfil', label: 'Meu perfil', icon: 'user', permission: null },
];

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { MENU as NAV };
