> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Guia do produto

O PegaNaFrota possui dois produtos sobre o mesmo projeto Supabase.

## Desktop da empresa

- **Administrador da empresa:** frota, motoristas, viagens, abastecimentos, manutenções, pátio, locais, equipe, empresa, importação e relatórios.
- **Gestor de frota:** operação e gestão da frota, sem administração global da plataforma.
- **Operador:** rotina operacional permitida pelo papel — pátio, viagens, abastecimentos e manutenções.
- **Visualizador:** consultas e relatórios permitidos pelo papel.

Entidades históricas não são apagadas quando isso destruiria rastreabilidade. Veículos, motoristas e locais usam ativação/arquivamento; viagens e manutenções usam cancelamento quando necessário. A auditoria continua no banco, mas não existe mais uma tela técnica de “histórico de alterações” no menu do Desktop.

### Principais telas

- **Visão geral:** resumo da frota, custos, operação e alertas.
- **Pátio:** situação atual e registro de entrada/saída.
- **Veículos / Motoristas / Locais:** cadastros operacionais.
- **Viagens:** planejar, iniciar, concluir e cancelar.
- **Abastecimentos:** registrar consumo, valor e odômetro.
- **Manutenções:** agendar, iniciar, concluir e cancelar.
- **Movimentações:** histórico de entradas e saídas.
- **Odômetro:** ledger e ajustes autorizados.
- **Relatórios:** relatórios operacionais/financeiros e exportação CSV.
- **Importar planilha:** Excel `.xlsx`, CSV ou células copiadas para veículos, motoristas, locais, abastecimentos, manutenções, viagens e equipe, sempre com prévia antes da gravação.
- **Equipe:** gestão dos integrantes da empresa por meio da Edge Function `admin-users`.

## Admin Web da plataforma

O painel global administra o SaaS, não a frota interna de cada cliente:

- empresas;
- primeiro administrador da empresa com senha inicial direta;
- usuários/administradores das empresas;
- redefinição de senha e exclusão/desvinculação de usuários;
- provisionamentos;
- suspensão, arquivamento e exclusão definitiva de empresa quando aplicável;
- auditoria global da plataforma.

## Navegação

- `Ctrl+B`: recolher/expandir a lateral;
- `Ctrl+K`: busca global;
- `/`: busca da lista atual, quando disponível;
- filtros avançados ficam recolhidos até serem necessários.

A interface mostra ações compatíveis com o papel atual e mantém detalhes técnicos fora do fluxo principal.
