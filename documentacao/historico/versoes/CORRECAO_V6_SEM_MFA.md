> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# Correção v6 — Admin Web sem aplicativo autenticador

Data: 2026-08-08

Por decisão de produto, o Admin Web não exige mais TOTP/MFA nem sessão `aal2`.

## Alterações

- removido o step-up obrigatório da Edge Function `platform-admin`;
- removido o enrollment automático de autenticador no login;
- removida a repetição automática de ações por `STEP_UP_REQUIRED` / `MFA_NOT_ENROLLED`;
- perfil agora informa a política ativa: e-mail + senha, sem autenticador obrigatório;
- ações destrutivas continuam exigindo confirmação explícita pelo nome do alvo;
- autorização de `platform_admin`, integridade no banco e auditoria continuam ativas;
- documentação e testes de regressão foram atualizados.

## Aplicação no projeto hospedado

O banco não precisa de migration para esta mudança. É necessário:

```powershell
npm run build:admin
npx supabase functions deploy platform-admin --project-ref SEU_PROJECT_REF
npm run preview:admin
```

Depois faça `Ctrl+Shift+R` no navegador.

Fatores TOTP já cadastrados no Supabase Auth podem permanecer; eles não são
consultados nem exigidos pelo painel ou pela Edge Function.
