import { rota } from './trocar-tela.mjs';
import { tema } from '../componentes/componentes-do-painel.mjs';
import { telaPainel } from '../telas/tela-inicial.mjs';
import { telaEmpresas } from '../telas/tela-empresas.mjs';
import { telaDetalhesEmpresa } from '../telas/tela-detalhes-empresa.mjs';
import { telaCadastrarEmpresa } from '../telas/tela-cadastrar-empresa.mjs';
import { telaAdministradores } from '../telas/tela-administradores.mjs';
import { telaProvisionamentos } from '../telas/tela-provisionamentos.mjs';
import { telaDetalhesProvisionamento } from '../telas/tela-detalhes-provisionamento.mjs';
import { telaAuditoria } from '../telas/tela-auditoria.mjs';
import { telaPerfil } from '../telas/tela-meu-perfil.mjs';

export function registrarRotas(obterAtor) {
  rota('/', telaPainel);
  rota('/empresas', telaEmpresas);
  rota('/empresas/nova', telaCadastrarEmpresa);
  rota('/empresas/:id', telaDetalhesEmpresa);
  rota('/administradores', telaAdministradores);
  rota('/provisionamentos', telaProvisionamentos);
  rota('/provisionamentos/:id', telaDetalhesProvisionamento);
  rota('/auditoria', telaAuditoria);
  rota('/perfil', (contexto) => telaPerfil({ ...contexto, actor: obterAtor(), theme: tema }));
}
