export const MENU = [
  { path: '/', pattern: '/', label: 'Visão geral', icon: 'overview' },
  { path: '/empresas', pattern: '/empresas', label: 'Empresas', icon: 'company' },
  {
    path: '/administradores',
    pattern: '/administradores',
    label: 'Administradores',
    icon: 'admin',
  },
  {
    path: '/provisionamentos',
    pattern: '/provisionamentos',
    label: 'Cadastros',
    icon: 'operation',
  },
  { path: '/auditoria', pattern: '/auditoria', label: 'Histórico de ações', icon: 'audit' },
  { path: '/perfil', pattern: '/perfil', label: 'Meu perfil', icon: 'user' },
];

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { MENU as NAV };
