> **REFERÊNCIA:** documento de arquitetura original/blueprint. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Plano de Implementação

## Fase 0 — Preparação

Entregas:

- repositório;
- documentação;
- Git;
- Node LTS compatível;
- Docker;
- Supabase CLI;
- convenções.

Gate:

- clone limpo;
- documentos presentes;
- primeiro commit.

## Fase 1 — Banco e Supabase

Entregas:

- schemas;
- enums;
- tabelas;
- constraints;
- índices;
- helpers;
- RLS;
- RPCs centrais;
- auditoria;
- seed;
- usuários Auth;
- testes;
- documentação.

Gate:

- `supabase db reset`;
- seed completo;
- testes RLS;
- revisão independente;
- nenhuma falha crítica.

## Fase 2 — Foundation Electron

Entregas:

- Electron Forge;
- main/preload/renderer;
- protocolo local;
- CSP;
- sessão protegida;
- config;
- logs;
- IPC;
- build Windows.

Gate:

- janela abre;
- renderer isolado;
- testes;
- pacote sem segredo.

## Fase 3 — Auth e shell

Entregas:

- login;
- logout;
- restauração;
- guards;
- sidebar;
- topbar;
- router;
- permissões;
- estados de rede.

Gate:

- usuários de empresas distintas;
- inativo bloqueado;
- sessão segura.

## Fase 4 — Empresa e usuários

Entregas:

- perfil da empresa;
- usuários;
- papéis;
- ativação/desativação;
- Edge Function administrativa.

Gate:

- última conta admin protegida;
- auditoria;
- isolamento.

## Fase 5 — Veículos, motoristas e odômetro

Entregas:

- CRUD;
- paginação;
- filtros;
- drawer;
- ledger de odômetro;
- arquivamento.

Gate:

- placa única;
- km não regride;
- histórico preservado.

## Fase 6 — Operação

Subfases:

1. viagens;
2. abastecimentos;
3. manutenções.

Gate:

- regras transacionais;
- valores;
- cronologia;
- auditoria.

## Fase 7 — Locais e movimentações

Entregas:

- pátios;
- câmeras lógicas;
- movimentação manual;
- RPC atômica;
- timeline.

Gate:

- primeira Entrada;
- alternância;
- concorrência;
- deduplicação.

## Fase 8 — Dashboard e relatórios

Entregas:

- KPIs;
- gráficos;
- alertas;
- relatórios;
- filtros;
- exportações.

Gate:

- totais conferidos;
- performance com seed;
- RLS.

## Fase 9 — OCR

Entregas:

- prova de conceito;
- worker;
- câmera;
- contrato;
- normalização;
- confiança;
- deduplicação;
- integração.

Gate:

- testes com dataset autorizado;
- falhas tratadas;
- motor substituível.

## Fase 10 — Release

Entregas:

- hardening;
- E2E;
- instalador;
- assinatura;
- documentação;
- backup;
- rollback.

Gate:

- auditoria final GO.
