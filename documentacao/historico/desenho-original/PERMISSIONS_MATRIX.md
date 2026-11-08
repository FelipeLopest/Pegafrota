> **REFERÊNCIA:** documento de arquitetura original/blueprint. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Matriz Inicial de Permissões

Legenda: ✅ permitido, ◐ limitado, ❌ negado.

| Ação | Admin | Gestor | Operador | Visualizador |
|---|---:|---:|---:|---:|
| Ver empresa | ✅ | ✅ | ◐ | ◐ |
| Editar empresa | ✅ | ❌ | ❌ | ❌ |
| Gerir usuários | ✅ | ❌ | ❌ | ❌ |
| Ver usuários | ✅ | ◐ | ❌ | ❌ |
| Gerir veículos | ✅ | ✅ | ◐ | ❌ |
| Ver veículos | ✅ | ✅ | ✅ | ✅ |
| Gerir motoristas | ✅ | ✅ | ◐ | ❌ |
| Registrar viagem | ✅ | ✅ | ✅ | ❌ |
| Editar/cancelar viagem | ✅ | ✅ | ◐ | ❌ |
| Registrar abastecimento | ✅ | ✅ | ✅ | ❌ |
| Registrar manutenção | ✅ | ✅ | ◐ | ❌ |
| Agendar manutenção | ✅ | ✅ | ❌ | ❌ |
| Registrar movimento manual | ✅ | ✅ | ✅ | ❌ |
| Operar câmera/OCR | ✅ | ✅ | ✅ | ❌ |
| Ver dashboard | ✅ | ✅ | ✅ | ✅ |
| Gerar relatórios | ✅ | ✅ | ◐ | ◐ |
| Exportar relatórios | ✅ | ✅ | ◐ | ◐ |
| Ver auditoria | ✅ | ◐ | ❌ | ❌ |

`◐` deve ser detalhado por permissão atômica. A matriz final será implementada com códigos como:

- `company.read`;
- `company.update`;
- `users.manage`;
- `vehicles.write`;
- `trips.write`;
- `fuelings.write`;
- `maintenance.write`;
- `movements.write`;
- `ocr.operate`;
- `reports.export`;
- `audit.read`.
