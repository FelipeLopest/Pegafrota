export const ERRO_TENANT = Object.freeze({
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NO_ACTIVE_MEMBERSHIP: 'AUTH_NO_ACTIVE_MEMBERSHIP',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  USE_RPC: 'USE_RPC',
  INVALID_INPUT: 'INVALID_INPUT',
  ODOMETER_REGRESSION: 'ODOMETER_REGRESSION',
  IMMUTABLE_RECORD: 'IMMUTABLE_RECORD',
  APPEND_ONLY_TABLE: 'APPEND_ONLY_TABLE',
  DUPLICATE: 'CONFLICT_DUPLICATE',
  NOT_FOUND: 'NOT_FOUND',
  VEHICLE_HAS_OPEN_TRIPS: 'VEHICLE_HAS_OPEN_TRIPS',
  CONFLICT_STATE: 'CONFLICT_STATE',
  CONFLICT_ARCHIVED: 'CONFLICT_ARCHIVED',
  CONFLICT_RETRY: 'CONFLICT_RETRY',
  LAST_ADMIN_PROTECTED: 'LAST_ADMIN_PROTECTED',
  PROFILE_GLOBALLY_INACTIVE: 'PROFILE_GLOBALLY_INACTIVE',
  USER_ALREADY_LINKED: 'USER_ALREADY_LINKED',
  CANNOT_DEACTIVATE_SELF: 'CANNOT_DEACTIVATE_SELF',
});

export const ERRO_PLATAFORMA = Object.freeze({
  NOT_PLATFORM_ADMIN: 'NOT_PLATFORM_ADMIN',
  IDEMPOTENCY_REUSE: 'IDEMPOTENCY_REUSE',
  NOT_RETRYABLE: 'NOT_RETRYABLE',
  CONFIRMATION_MISMATCH: 'CONFIRMATION_MISMATCH',
  REASON_REQUIRED: 'REASON_REQUIRED',
  CANNOT_BLOCK_SELF: 'CANNOT_BLOCK_SELF',
  LAST_PLATFORM_ADMIN_PROTECTED: 'LAST_PLATFORM_ADMIN_PROTECTED',
  CONFLICT_STALE: 'CONFLICT_STALE',
  BOOTSTRAP_NOT_AVAILABLE: 'BOOTSTRAP_NOT_AVAILABLE',
  BOOTSTRAP_INVALID_TOKEN: 'BOOTSTRAP_INVALID_TOKEN',
  BOOTSTRAP_TOKEN_CONSUMED: 'BOOTSTRAP_TOKEN_CONSUMED',
  BOOTSTRAP_TOKEN_EXPIRED: 'BOOTSTRAP_TOKEN_EXPIRED',
  INVITE_INVALID: 'INVITE_INVALID',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_REVOKED: 'INVITE_REVOKED',
  INVITE_ALREADY_ACCEPTED: 'INVITE_ALREADY_ACCEPTED',
  RESEND_TOO_SOON: 'RESEND_TOO_SOON',
  INVALID_CNPJ: 'invalid_cnpj',
  INVALID_EMAIL: 'invalid_email',
  CNPJ_ALREADY_EXISTS: 'cnpj_already_exists',
  AUTH_EMAIL_CONFLICT: 'auth_email_conflict',
  PARTIAL_FAILURE: 'partial_failure',
  COMPENSATION_BLOCKED: 'compensation_blocked',
});

export const PERMISSAO = Object.freeze({
  COMPANY_READ: 'company.read',
  COMPANY_UPDATE: 'company.update',
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  DRIVERS_READ: 'drivers.read',
  DRIVERS_WRITE: 'drivers.write',
  DRIVERS_ARCHIVE: 'drivers.archive',
  VEHICLES_READ: 'vehicles.read',
  VEHICLES_WRITE: 'vehicles.write',
  VEHICLES_ARCHIVE: 'vehicles.archive',
  ODOMETER_READ: 'odometer.read',
  ODOMETER_ADJUST: 'odometer.adjust',
  TRIPS_READ: 'trips.read',
  TRIPS_WRITE: 'trips.write',
  TRIPS_CANCEL: 'trips.cancel',
  FUELINGS_READ: 'fuelings.read',
  FUELINGS_WRITE: 'fuelings.write',
  MAINTENANCE_READ: 'maintenance.read',
  MAINTENANCE_WRITE: 'maintenance.write',
  MAINTENANCE_SCHEDULE: 'maintenance.schedule',
  LOCATIONS_READ: 'locations.read',
  LOCATIONS_WRITE: 'locations.write',
  MOVEMENTS_READ: 'movements.read',
  MOVEMENTS_WRITE: 'movements.write',
  CAMERAS_READ: 'cameras.read',
  CAMERAS_WRITE: 'cameras.write',
  OCR_READ: 'ocr.read',
  OCR_OPERATE: 'ocr.operate',
  DASHBOARD_READ: 'dashboard.read',
  REPORTS_READ: 'reports.read',
  REPORTS_EXPORT: 'reports.export',
  AUDIT_READ: 'audit.read',
});

export const ROTULO_PERMISSAO = Object.freeze({
  'company.read': 'Ver dados da empresa',
  'company.update': 'Editar dados da empresa',
  'users.read': 'Ver usuários e vínculos da empresa',
  'users.manage': 'Criar, alterar papel e desativar usuários',
  'drivers.read': 'Ver motoristas',
  'drivers.write': 'Criar e editar motoristas',
  'drivers.archive': 'Arquivar motoristas',
  'vehicles.read': 'Ver veículos',
  'vehicles.write': 'Criar e editar veículos',
  'vehicles.archive': 'Arquivar e desarquivar veículos',
  'odometer.read': 'Ver ledger de odômetro',
  'odometer.adjust': 'Registrar ajuste manual de odômetro',
  'trips.read': 'Ver viagens',
  'trips.write': 'Criar, iniciar e concluir viagens',
  'trips.cancel': 'Cancelar viagens',
  'fuelings.read': 'Ver abastecimentos',
  'fuelings.write': 'Registrar abastecimentos',
  'maintenance.read': 'Ver manutenções',
  'maintenance.write': 'Registrar e concluir manutenções',
  'maintenance.schedule': 'Agendar manutenções futuras',
  'locations.read': 'Ver locais',
  'locations.write': 'Criar e editar locais',
  'movements.read': 'Ver movimentações de entrada e saída',
  'movements.write': 'Registrar movimentação',
  'cameras.read': 'Ver câmeras',
  'cameras.write': 'Criar e editar câmeras',
  'ocr.read': 'Ver leituras de placa',
  'ocr.operate': 'Operar câmera e registrar leitura de placa',
  'dashboard.read': 'Ver dashboard',
  'reports.read': 'Gerar relatórios',
  'reports.export': 'Exportar relatórios',
  'audit.read': 'Ver auditoria',
});

export const PAPEL_VINCULO = Object.freeze({
  COMPANY_ADMIN: 'company_admin',
  FLEET_MANAGER: 'fleet_manager',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
});

export const ROTULO_PAPEL_VINCULO = Object.freeze({
  company_admin: 'Administrador',
  fleet_manager: 'Gestor de frota',
  operator: 'Operador',
  viewer: 'Visualizador',
});

export const MOTIVO_SUSPENSAO = Object.freeze({
  SOLICITACAO_DO_CLIENTE: 'solicitacao_do_cliente',
  VIOLACAO_CONTRATUAL: 'violacao_contratual',
  RISCO_DE_SEGURANCA: 'risco_de_seguranca',
  CADASTRO_EM_REVISAO: 'cadastro_em_revisao',
});

export const ROTULO_MOTIVO_SUSPENSAO = Object.freeze({
  solicitacao_do_cliente: 'Solicitação do cliente',
  violacao_contratual: 'Violação contratual',
  risco_de_seguranca: 'Risco de segurança',
  cadastro_em_revisao: 'Cadastro em revisão',
});

export const SITUACAO_OPERACAO = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  COMPENSATING: 'compensating',
  COMPENSATED: 'compensated',
  NEEDS_MANUAL: 'needs_manual',
});

export const ROTULO_SITUACAO_OPERACAO = Object.freeze({
  pending: 'Aguardando',
  running: 'Em andamento',
  succeeded: 'Concluída',
  failed: 'Falhou',
  compensating: 'Compensando',
  compensated: 'Compensada',
  needs_manual: 'Requer intervenção',
});

export const ETAPAS_PROVISIONAMENTO = Object.freeze([
  { code: 'create_company', label: 'Criar empresa' },
  { code: 'create_auth_user', label: 'Criar conta de acesso' },
  { code: 'link_company_admin', label: 'Vincular primeiro administrador' },
  { code: 'send_invite', label: 'Ativar acesso' },
]);

export const SITUACAO_VEICULO = Object.freeze({
  AVAILABLE: 'available',
  IN_USE: 'in_use',
  IN_MAINTENANCE: 'in_maintenance',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
});

export const ROTULO_SITUACAO_VEICULO = Object.freeze({
  available: 'Disponível',
  in_use: 'Em uso',
  in_maintenance: 'Em manutenção',
  inactive: 'Inativo',
  archived: 'Arquivado',
});

export const ROTULO_SITUACAO_VIAGEM = Object.freeze({
  planned: 'Planejada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
});

export const ROTULO_SITUACAO_MANUTENCAO = Object.freeze({
  scheduled: 'Agendada',
  in_progress: 'Em execução',
  completed: 'Concluída',
  cancelled: 'Cancelada',
});

export const ROTULO_SITUACAO_EMPRESA = Object.freeze({
  active: 'Ativa',
  suspended: 'Suspensa',
  archived: 'Arquivada',
});

export const TIPOS_COMBUSTIVEL_BOMBA = Object.freeze([
  { value: 'diesel_s10', label: 'Diesel S10' },
  { value: 'diesel_s500', label: 'Diesel S500' },
  { value: 'gasoline', label: 'Gasolina' },
  { value: 'ethanol', label: 'Etanol' },
  { value: 'cng', label: 'GNV' },
]);

export const TIPOS_COMBUSTIVEL_VEICULO = Object.freeze([
  ...TIPOS_COMBUSTIVEL_BOMBA,
  { value: 'flex', label: 'Flex' },
  { value: 'electric', label: 'Elétrico' },
]);

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { SITUACAO_OPERACAO as STATUS_OPERACAO };
export { ROTULO_SITUACAO_OPERACAO as ROTULO_STATUS_OPERACAO };
export { SITUACAO_VEICULO as STATUS_VEICULO };
export { ROTULO_SITUACAO_VEICULO as ROTULO_STATUS_VEICULO };
export { ROTULO_SITUACAO_VIAGEM as ROTULO_STATUS_VIAGEM };
export { ROTULO_SITUACAO_MANUTENCAO as ROTULO_STATUS_MANUTENCAO };
export { ROTULO_SITUACAO_EMPRESA as ROTULO_STATUS_EMPRESA };
