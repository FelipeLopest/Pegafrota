import { dadosTelaInicial } from './dados-tela-inicial.mjs';
import { dadosEmpresas } from './dados-empresas.mjs';
import { dadosUsuariosDasEmpresas } from './dados-usuarios-das-empresas.mjs';
import { dadosProvisionamentos } from './dados-provisionamentos.mjs';
import { dadosAdministradores } from './dados-administradores.mjs';
import { dadosAuditoria } from './dados-auditoria.mjs';
export const servicos = {
  dashboard: dadosTelaInicial,
  companies: dadosEmpresas,
  members: dadosUsuariosDasEmpresas,
  operations: dadosProvisionamentos,
  admins: dadosAdministradores,
  audit: dadosAuditoria,
};
export { servicos as api };
