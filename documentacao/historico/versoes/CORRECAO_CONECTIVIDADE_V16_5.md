> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# v16.5 — conectividade sem falso positivo

O Desktop e o Admin Web deixaram de considerar o estado de rede do sistema operacional como fonte de verdade.

- `navigator.onLine` não controla mais os banners;
- uma única falha de `fetch` não exibe aviso global;
- o aviso só aparece após duas falhas de transporte consecutivas;
- qualquer resposta HTTP do Supabase (inclusive 401/403/500) prova conectividade e remove o aviso;
- `AbortError` não conta como falha de rede.

Nenhuma migration, RPC ou Edge Function foi alterada.
