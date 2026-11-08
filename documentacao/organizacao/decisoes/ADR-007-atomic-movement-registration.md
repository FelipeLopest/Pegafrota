> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# ADR-007 — Movimentação por função transacional

## Status
Aprovada.

## Decisão
Entrada/Saída só é criada pela RPC que aplica lock, alternância e deduplicação.

## Consequência
OCR e clique repetido não quebram a sequência.
