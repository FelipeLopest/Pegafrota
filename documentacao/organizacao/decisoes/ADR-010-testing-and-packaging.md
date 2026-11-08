> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# ADR-010 — Testes em camadas e Electron Forge

## Status
Aprovada.

## Decisão
Usar testes SQL/pgTAP, testes JavaScript, integração e E2E. Empacotar com Electron Forge.

## Consequência
Banco e aplicação são reproduzíveis e o release possui gates objetivos.
