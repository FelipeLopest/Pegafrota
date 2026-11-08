> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# ADR-006 — Ledger imutável de odômetro

## Status
Aprovada.

## Decisão
Toda mudança de quilometragem cria `vehicle_odometer_events`.

## Consequência
Regressão é bloqueada e a origem do valor é auditável.
