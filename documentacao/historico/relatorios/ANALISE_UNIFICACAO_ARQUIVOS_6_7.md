> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# Análise de unificação — arquivos 6 e 7

## Fonte usada

- **Arquivo 6:** documentação criada para melhorar contexto de IA (`ai.md`, `spec.md`, arquitetura, banco, API, regras, integração, implantação, desenvolvimento e troubleshooting).
- **Arquivo 7:** projeto executável atualizado, notas de correções, documentação de câmera e captura da nova tela de login. O ZIP e o TAR.GZ do arquivo 7 continham o mesmo projeto; o TAR.GZ era apenas uma duplicata com pasta-raiz adicional.

## Decisões de merge

1. O projeto executável do ZIP interno do arquivo 7 foi usado como base.
2. O `README.md` e o `COMO_SUBIR_O_SISTEMA.md` externos do arquivo 7 **não substituíram cegamente** os internos, porque continham regressões documentais (ex.: 44 migrations, fluxo manual de bootstrap e omissão de `admin-users`).
3. A documentação do arquivo 6 foi integrada em `docs/ia/`, com links e fatos corrigidos contra o código atual.
4. O índice de ADRs solto do arquivo 6 referenciava ADRs 011–016 que não vieram no ZIP. Essas decisões foram consolidadas em `documentacao/manutencao/DECISOES_ATUAIS.md`; os ADRs 001–010 existentes foram preservados.
5. Notas de versões que estavam espalhadas na raiz foram movidas para `docs/historico/`.
6. A imagem `tela-login-nova.png` foi preservada em `docs/assets/`.

## Inconsistências corrigidas durante a auditoria

- `packages/shared-types` reapareceu apesar de a própria documentação afirmar que era órfão: removido.
- `ferramentas/administracao/preparar-usuarios-demonstracao.mjs` reapareceu apesar de ter sido substituído por `seed-demo-remote.mjs`: removido.
- `config.example.json` residual: removido.
- `screens/mfa.mjs` obsoleto: removido; teste agora garante sua ausência.
- `aplicativos/programa-empresa/package.json` apontava para `src/main/main.js`, inexistente: corrigido para `main.cjs`.
- contador da tela Veículos usava status inexistente `maintenance`: corrigido para `in_maintenance`.
- contratos JS não continham `cameras.*`/`ocr.*` apesar de o banco conter essas permissões: vocabulário alinhado.
- scripts de integração/visual ainda continham expectativas de MFA/AAL2: atualizados para a decisão atual sem MFA.
- guias de implantação/E2E ainda descreviam primeiro administrador por convite: atualizados para senha direta.

## Organização final

A raiz ficou reservada a arquivos de entrada/configuração. Documentação detalhada foi agrupada por finalidade e o histórico ficou isolado para não confundir IA ou novos programadores.

## Limpeza adicional de estrutura

- o teste duplicado `v8-product.test.mjs` foi removido; `product.test.mjs` já cobria o mesmo conjunto e cenários adicionais;
- testes com nomes de versão (`v9-*`, `v11-*`, `v16-*`) foram renomeados por responsabilidade (`navigation-filters`, `connectivity`, `performance`, `user-management`, etc.);
- os textos de teste que tratavam números de versão como requisito funcional foram neutralizados;
- foi criado `documentacao/manutencao/MAPA_DE_PASTAS_E_ARQUIVOS.md` para dizer onde cada tipo de arquivo pertence;
- ZIP/TAR de release foram adicionados ao `.gitignore`, evitando voltar a empacotar releases dentro do repositório.

## Validação executada após o merge

Executado no projeto unificado:

- `npm run lint` — **PASS**;
- `npm run test:unit` — **146/146 PASS** após remoção do conjunto duplicado;
- `npm run test:edge:unit` — **55/55 PASS**;
- `npm run test:contracts` — **PASS**;
- `npm run test:config` — **8/8 PASS**;
- `npm run verify:secrets` — **PASS**;
- `npm run verify:no-cdn` — **PASS**;
- `npm run verify:prototype` — **PASS**;
- `npm run verify:boundaries` — **PASS**;
- `npm run verify:electron` — **37/37 PASS**;
- `npm run build:admin` — **PASS** com configuração pública temporária de teste;
- `npm run build:desktop` — **PASS** com configuração pública temporária de teste;
- `npm run smoke:admin` — **31/31 PASS**;
- `npm run smoke:desktop` — **não executado neste ambiente**, pois o binário/pacote Electron não está instalado por completo aqui.

Também foi confirmado por comparação byte a byte que:

- as **49 migrations** não foram alteradas;
- `supabase/seed.sql` não foi alterado;
- as duas Edge Functions não foram alteradas;
- `supabase/config.toml` só mudou um caminho de documentação em comentário.

Portanto a unificação reorganiza documentação, saneia código/metadata e corrige inconsistências de frontend/testes, mas **não muda o schema remoto nem exige migration nova**.
