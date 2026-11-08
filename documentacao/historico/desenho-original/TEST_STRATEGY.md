> **REFERÊNCIA:** documento de arquitetura original/blueprint. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Estratégia de Testes

## 1. Pirâmide

### Banco

- pgTAP para schema, constraints, functions e RLS;
- testes via cliente Supabase para comportamento real;
- testes com duas empresas;
- testes de concorrência.

### JavaScript

- testes unitários de schemas, normalização, formatadores e domínio;
- testes de serviços com mocks controlados;
- testes de Web Components;
- testes de preload e IPC.

### Integração

- Supabase local;
- Edge Functions locais;
- Electron em modo teste;
- worker OCR simulado.

### E2E

Fluxos:

- login;
- usuário inativo;
- veículo;
- viagem;
- abastecimento;
- manutenção;
- movimentação;
- dashboard;
- relatório;
- OCR simulado.

## 2. Gates

Cada fase exige:

```text
lint → unit → database → integration → build
```

E2E completo a partir da fase de autenticação.

## 3. Dados

- seed determinístico;
- fixtures por empresa;
- relógio controlado;
- IDs previsíveis quando necessário;
- nenhuma pessoa real;
- nenhuma imagem de placa real sem autorização.

## 4. Segurança

- package scan;
- secret scan;
- RLS negative tests;
- IPC fuzz básico;
- CSP;
- navegação;
- permissões de câmera;
- pacote sem scripts administrativos.

## 5. Performance

Metas iniciais em ambiente local/homologação:

- abertura da tela principal sem bloqueio longo;
- consultas paginadas;
- dashboard com número limitado de chamadas;
- movimentação registrada em transação curta;
- OCR fora da thread principal;
- listas sem carregar histórico completo.

As metas numéricas serão definidas após primeiro baseline.
