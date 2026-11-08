> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Decisões atuais complementares

Os ADRs 001–010 permanecem em [`docs/adr/`](../adr/). As decisões abaixo foram consolidadas a partir do código, migrations e correções posteriores. Em vez de criar vários arquivos soltos, ficam reunidas aqui.

## Decisão 011 — camada de plataforma e dois eixos de identidade

**Decisão:** `platform_admin` e vínculo de empresa são eixos independentes. O Admin Web usa a Edge Function `platform-admin`; o Desktop usa o contexto de tenant sob RLS.

**Evidência:** migrations `20260802000100_platform_schema.sql` em diante, `platform.admins`, `public.company_memberships` e `supabase/functions/platform-admin/`.

## Decisão 012 — primeiro administrador com senha direta

**Decisão:** ao provisionar uma empresa, o primeiro `company_admin` recebe uma senha inicial definida pelo operador da plataforma e nasce com vínculo ativo. Não depende de convite por e-mail.

**Evidência:** `20260812000100_company_admin_password_login.sql` e `platform-admin` → `company.provision`.

**Importante:** convites por link continuam existindo para integrantes/equipe; isso é outro fluxo.

## Decisão 013 — build próprio, sem bundler e sem CDN

**Decisão:** Desktop e Admin Web são compilados por scripts Node próprios. Imports de pacotes locais são reescritos para `vendor/`, CSP é gerada no build e produção não carrega scripts/fontes remotos.

**Evidência:** `apps/*/build.mjs`, `verify:no-cdn`.

## Decisão 014 — ordem de locks padronizada

**Decisão:** RPCs concorrentes seguem ordem consistente de locks para evitar deadlocks e manter invariantes de viagem, manutenção, pátio e odômetro.

**Evidência:** migration `20260731000400_fix_lock_order.sql` e testes de concorrência.

## Decisão 015 — conectividade por sondagem de saúde

**Decisão:** `navigator.onLine` não é fonte de verdade. Falhas de transporte são confirmadas por sondagem ao `/auth/v1/health`; respostas HTTP provam que o servidor foi alcançado.

**Evidência:** testes de `connectivity`/`performance` e código de sessão/API dos dois produtos.

## Decisão 016 — importação em massa assistida por Excel/CSV

**Decisão:** cadastros volumosos usam uma central de importação local com `.xlsx`, CSV ou células copiadas do Excel. A tela oferece modelos oficiais, prévia, validação por linha, relatório de erros e gravação com concorrência controlada. O XLSX é lido por um parser interno mínimo, sem biblioteca/CDN externa e sem enviar o arquivo para terceiros.

O escopo atual cobre veículos, motoristas, locais, abastecimentos, manutenções, viagens e equipe. Pátio/movimentações e ajustes de odômetro continuam fora da importação genérica porque dependem de sequência temporal/ledger e exigem fluxo próprio para não falsificar estado operacional.

**Evidência:** `aplicativos/programa-empresa/telas/tela-importar-planilha.mjs`, `compartilhado/validacoes/validar-importacao.mjs`, `compartilhado/validacoes/ler-planilha.mjs` e `aplicativos/programa-empresa/importacao/modelos-de-planilha/`.
