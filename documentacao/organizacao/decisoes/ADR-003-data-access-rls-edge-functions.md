> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# ADR-003 — RLS para dados e Edge Functions para privilégios

## Status
Aprovada.

## Decisão
CRUD normal acessa Supabase diretamente sob RLS. Segredos e administração ficam em Edge Functions.

## Consequência
Não há servidor Node separado no MVP e nenhuma service role no Electron.
