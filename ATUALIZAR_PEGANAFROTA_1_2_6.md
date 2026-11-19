# Atualização 1.2.6

Esta versão mantém o visual completo da 1.2.5, os modelos de planilha e a câmera oculta. Acrescenta o fluxo direto de criação e início de viagem, preferência de garagem por empresa, orientação de disponibilidade e correções na conferência de passagens.

## Banco Supabase

Há uma nova migration: `supabase/migrations/20261118000100_fluxo_simples_de_viagens.sql`. Ela deve ser aplicada antes de distribuir o novo aplicativo. As migrations anteriores são preservadas e o CLI aplica também as que ainda estiverem pendentes no projeto vinculado.

No PowerShell, entre na pasta que contém `package.json` e `supabase/`. Execute cada linha sem os caracteres `PS` ou `>>` do terminal:

```powershell
npx.cmd --yes supabase@2.113.0 link --project-ref jnznizrtbivrvqkskcep
npx.cmd --yes supabase@2.113.0 db push --dry-run --linked
npx.cmd --yes supabase@2.113.0 db push --linked
```

O CLI precisa estar autenticado e pode solicitar as credenciais do banco. O comando com `--dry-run` apenas mostra o que será aplicado; o comando seguinte aplica a atualização. Nenhuma senha administrativa é embutida no aplicativo.

Esta alteração não muda Edge Functions. Se as funções das versões anteriores já estão atualizadas, não é necessário publicá-las novamente por causa da 1.2.6.

O verificador `npm run backend:verify` foi corrigido para localizar os arquivos reorganizados e exigir os novos contratos. Ele usa `SUPABASE_DB_URL` ou `DATABASE_URL` e deve ser executado somente em ambiente administrativo. Para apenas listar os contratos, sem conexão, use:

```powershell
npm.cmd run backend:verify -- --listar-contratos
```

## Código, painel e aplicativo Windows

Instale as dependências com `npm ci`. O pacote inclui o lockfile. Configure o projeto conforme `COMO_SUBIR_O_SISTEMA.md` e publique o código no repositório usado pela Vercel e pelo workflow **Gerar instalador Windows**.

Gere o instalador dessa revisão e instale a versão 1.2.6 no computador da empresa. Baixar ou atualizar o código não altera sozinho um aplicativo já instalado. A publicação no GitHub/Vercel e a geração do instalador não foram feitas nesta entrega.

## Primeiro acesso após atualizar

Em **Empresa → Controle de garagem**, confira a preferência. Empresas com histórico de presença ou passagens mantêm o controle ligado. Empresas sem esse histórico começam sem integração de garagem nas viagens. Desligar a preferência não apaga registros nem remove a operação avulsa de pátio.

O passo a passo de operação está em `FLUXO_DE_USO.md`. O relatório desta entrega está em `documentacao/validacao/fluxo-viagens-1.2.6/RELATORIO.md`.
