> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# PegaNaFrota v8 — completude funcional e coerência de produto

Esta revisão parte do princípio de que o Desktop é um produto de operação de frota, e não um navegador de tabelas do banco. O Admin Web continua sendo o painel do operador da plataforma.

## O que foi corrigido

### Desktop da empresa

- Modais de confirmação agora devolvem o resultado correto; ações como arquivar/cancelar não fecham mais sem executar.
- Veículos ganharam detalhe real, edição, estado, arquivamento, resumo de viagens/abastecimentos/manutenções/movimentações e odômetro recente.
- Motoristas ganharam detalhe real, edição, ativação/desativação e arquivamento sem apagar histórico.
- Locais passaram a ter cadastro, edição, ativação/desativação e arquivamento.
- Viagens oferecem apenas veículos disponíveis e motoristas ativos; possuem iniciar, concluir e cancelar.
- Manutenções usam o fluxo agendada → em execução → concluída, além de cancelamento.
- Pátio mostra claramente **No pátio / Fora do pátio** e calcula o snapshot no servidor, sem inferência a partir de uma lista truncada.
- Movimentações viraram histórico consultivo; a operação de entrada/saída fica concentrada no Pátio.
- Administrador da empresa pode editar dados operacionais da empresa, mantendo CNPJ/situação sob administração da plataforma.
- Equipe usa a Edge Function `admin-users` para convidar/criar, mudar cargo, suspender e restaurar acesso; o próprio acesso do usuário logado é protegido na interface. Convites novos levam a uma rota pública de ativação de senha e depois orientam a pessoa a entrar no Desktop; contas Auth já existentes apenas recebem o novo vínculo e mantêm a senha atual.
- Auditoria da empresa virou **Histórico de alterações**, com linguagem humana e detalhes técnicos recolhidos.
- Meu Perfil explica o cargo em linguagem de negócio, sem despejar códigos de permissões.
- Navegação muda conforme o papel para reduzir telas sem utilidade.
- Listas grandes deixaram de ter corte silencioso de 200 registros; áreas de grande volume usam paginação na interface.
- Datas operacionais criadas pelo Desktop são interpretadas no timezone da empresa.
- O build falha se URL/chave pública do Supabase estiverem ausentes; não existe mais fallback silencioso para `localhost:54321`.

### Admin Web da plataforma

- MFA/TOTP foi removido da fonte do painel e da Edge Function conforme decisão de produto.
- “Administradores” foi esclarecido como “Administradores das empresas”.
- Cadastro de empresa pode ser corrigido pela interface do operador da plataforma.
- Transferência de administração global pode ser iniciada pelo painel, sem depender apenas de script local.
- Fluxos de confirmação foram corrigidos para não resolverem como cancelados antes da chamada ao backend.

### Banco e Edge Functions

A migration `20260808000200_product_completeness.sql` adiciona/ajusta:

- `public.update_driver`
- `public.create_location`
- `public.update_location`
- `public.set_location_active`
- `public.archive_location`
- `public.unarchive_location`
- `public.yard_snapshot`
- `public.company_members` com e-mail do Auth restrito aos membros da própria empresa

A Edge Function `admin-users` precisa ser publicada junto com `platform-admin`.

## Política de exclusão

Dados com histórico operacional não são apagados fisicamente pela interface. O sistema usa **desativar, arquivar, cancelar ou estornar/corrigir** conforme a entidade. Isso preserva viagens, custos, odômetro e auditoria.

## Aplicação em um Supabase já existente

Não é necessário resetar o banco nem reaplicar a seed.

```powershell
npx supabase db push --db-url "$env:SUPABASE_DB_URL"

npx supabase functions deploy platform-admin --project-ref SEU_PROJECT_REF
npx supabase functions deploy admin-users --project-ref SEU_PROJECT_REF

npx supabase secrets set ADMIN_USERS_ALLOWED_ORIGINS="null,app://peganafrota,http://localhost:5173,http://127.0.0.1:5173" INVITE_BASE_URL="http://localhost:5174" --project-ref SEU_PROJECT_REF

npm run build
```

O `.env` real não faz parte do pacote. Copie o seu `.env` atual ou crie um a partir de `.env.example` com `PNF_SUPABASE_URL` e `PNF_SUPABASE_ANON_KEY`.

## Validação recomendada após deploy

1. Entrar no Electron como `company_admin` e editar um veículo, motorista, local e empresa.
2. Criar → iniciar → concluir uma viagem e repetir o fluxo cancelando outra.
3. Agendar → iniciar → concluir uma manutenção e cancelar outra.
4. Registrar entrada/saída no Pátio e conferir o Histórico de movimentações.
5. Criar/convidar uma pessoa, abrir o link de convite, definir a primeira senha, entrar no Desktop, mudar o cargo, suspender e restaurar o acesso.
6. Entrar como gestor, operador e visualizador e conferir que o menu é menor e coerente com o papel.
7. No Admin Web, editar cadastro de empresa e conferir auditoria/administradores das empresas.
