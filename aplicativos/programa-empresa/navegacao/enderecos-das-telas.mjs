import { rota } from '../componentes/componentes-do-programa.mjs';

import { tema } from '../acesso/sessao-e-permissoes.mjs';

import {
  screenDashboard as telaInicial,
  telaPatio,
  telaVeiculos,
  telaDetalheVeiculo,
  telaMotoristas,
  telaDetalheMotorista,
  telaViagens,
  telaAbastecimentos,
  telaManutencao,
  telaLocais,
  telaMovimentacoes,
  screenOdometer as telaLivroOdometro,
  screenReports as telaListaRelatorios,
  telaEmpresa,
  telaUsuarios,
  telaPerfil,
} from '../telas/exportar-telas.mjs';

import { telaImportacao } from '../telas/tela-importar-planilha.mjs';

export function registrarRotas() {
  rota('/', telaInicial);
  rota('/patio', telaPatio);
  rota('/movimentacoes', telaMovimentacoes);
  rota('/veiculos', telaVeiculos);
  rota('/veiculos/:id', telaDetalheVeiculo);
  rota('/motoristas', telaMotoristas);
  rota('/motoristas/:id', telaDetalheMotorista);
  rota('/viagens', telaViagens);
  rota('/abastecimentos', telaAbastecimentos);
  rota('/manutencoes', telaManutencao);
  rota('/odometro', telaLivroOdometro);
  rota('/odometro/:id', telaLivroOdometro);
  rota('/locais', telaLocais);
  rota('/relatorios', telaListaRelatorios);
  rota('/importar', telaImportacao);
  rota('/empresa', telaEmpresa);
  rota('/usuarios', telaUsuarios);
  rota('/perfil', (contextoLocal) => telaPerfil({ ...contextoLocal, theme: tema }));
}
