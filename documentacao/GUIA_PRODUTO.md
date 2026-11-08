> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Guia do produto

O PegaNaFrota possui dois produtos sobre o mesmo projeto Supabase.

## Desktop da empresa

- **Administrador da empresa:** frota, motoristas, viagens, abastecimentos, manutenções, pátio, locais, equipe, empresa, relatórios e histórico.
- **Gestor de frota:** operação e gestão da frota, sem administração global da conta.
- **Operador:** rotina operacional de pátio, viagens, abastecimentos e manutenções.
- **Visualizador:** consultas e relatórios permitidos pelo papel.

Entidades históricas não são apagadas quando isso destruiria rastreabilidade. Veículos, motoristas e locais usam ativação/arquivamento; viagens e manutenções usam cancelamento quando necessário.

## Admin Web da plataforma

O painel global administra o SaaS, não a frota interna de cada cliente: empresas, administradores, provisionamentos, convites e auditoria global.

## Navegação

- `Ctrl+B`: recolher/expandir a lateral;
- `Ctrl+K`: busca global;
- `/`: busca da lista atual, quando disponível;
- filtros avançados ficam recolhidos até serem necessários.

A interface mostra ações compatíveis com o papel atual e mantém detalhes técnicos fora do fluxo principal.
