> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# ADR-001 — Aplicação online-first com Supabase

## Status
Aprovada.

## Decisão
O MVP usa Supabase como fonte única dos dados e não implementa sincronização offline.

## Motivo
Reduz conflito, duplicidade e complexidade de segurança.

## Consequência
Sem internet, o usuário visualiza estado de indisponibilidade e não cria registros silenciosamente.
