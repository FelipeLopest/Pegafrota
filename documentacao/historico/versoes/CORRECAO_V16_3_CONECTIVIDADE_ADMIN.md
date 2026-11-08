> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# v16.3 — conectividade real no Admin Web

O painel não usa mais `navigator.onLine` para decidir se o servidor está indisponível.
Esse sinal do navegador pode gerar falsos positivos em VPNs, DNS corporativo e
adaptadores virtuais.

Agora o estado é atualizado por requisições reais ao Supabase:

- resposta HTTP, inclusive 401/403/500: servidor alcançável;
- falha de transporte/fetch: servidor temporariamente inalcançável;
- AbortController: não altera o estado de conectividade;
- uma requisição posterior bem-sucedida remove o aviso automaticamente.

O aviso é apenas informativo e não bloqueia ações preventivamente.
