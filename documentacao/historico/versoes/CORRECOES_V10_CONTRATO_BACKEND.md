> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# PegaNaFrota v10 — contrato do backend remoto

## Erro corrigido

`PGRST202: Could not find the function public.yard_snapshot without parameters in the schema cache`

Esse erro não é da tela de Pátio. O cliente v8/v9 depende da migration
`20260808000200_product_completeness.sql`. Se o frontend for atualizado sem
aplicar essa migration, também ficam indisponíveis edição de motorista e CRUD
de locais.

## Verificação antes de abrir o app

Com `SUPABASE_DB_URL` definido:

```powershell
npm run backend:verify
```

O script consulta o banco remoto, confirma a migration e todas as RPCs usadas
pelo Desktop.

## Atualização

```powershell
npx supabase db push --db-url "$env:SUPABASE_DB_URL"
npm run backend:verify
```

Se o banco possuir a função, mas a Data API ainda devolver PGRST202:

```sql
NOTIFY pgrst, 'reload schema';
```

A migration `20260808000300_postgrest_contract_refresh.sql` também faz esse
refresh explicitamente.
