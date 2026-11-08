> **REFERÊNCIA:** documento de arquitetura original/blueprint. Migrations e código executável são a fonte final de verdade; para o estado atual consolidado, comece por `docs/ia/`.

# Definition of Done

Uma funcionalidade só está pronta quando:

## Código

- arquivos completos;
- sem `TODO` bloqueante;
- sem código morto evidente;
- validação de entrada;
- erros tratados;
- convenções mantidas.

## Banco

- migration;
- rollback/estratégia documentada;
- RLS;
- grants;
- índices;
- tests;
- seed atualizado quando necessário.

## Segurança

- autorização no servidor/banco;
- sem segredo;
- logs redigidos;
- IPC restrito;
- negative tests.

## Interface

- loading;
- vazio;
- erro;
- sucesso;
- sem permissão;
- teclado;
- foco;
- contraste;
- janela mínima.

## Testes

- unitários;
- integração;
- RLS;
- regressão;
- comandos executados;
- resultados registrados.

## Documentação

- README;
- `.env.example`;
- decisões;
- handoff;
- comandos.

## Entrega

- lint passa;
- testes passam;
- build passa;
- revisão sem bloqueantes;
- commit criado.
