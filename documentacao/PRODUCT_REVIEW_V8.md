> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# PegaNaFrota v8 — revisão funcional

Esta versão reorganiza o Desktop por trabalho real, não por tabela do banco.

- **Pátio** é a tela operacional de entrada/saída. O histórico fica em Avançado.
- **Veículos** têm detalhe real, edição, ativação/desativação e arquivamento.
- **Motoristas** têm edição, ativação/desativação e arquivamento.
- **Locais** têm CRUD operacional e arquivamento; locais usados não são apagados.
- **Manutenção** segue Agendada → Em execução → Concluída, com cancelamento.
- **Equipe** integra a Edge Function `admin-users` para convite, cargo e suspensão de vínculo.
- **Histórico de alterações** humaniza a auditoria e recolhe detalhes técnicos.
- O menu é reduzido conforme o papel para evitar telas técnicas sem utilidade.
- Consultas de lista não têm mais corte silencioso em 200 itens.
- O snapshot do pátio é calculado no servidor e respeita o timezone da empresa.
- MFA/TOTP foi removido do Admin Web e da Edge Function `platform-admin` por decisão de produto.
- Builds falham quando as variáveis do Supabase estão ausentes, em vez de apontar silenciosamente para localhost.

## Aplicação no Supabase existente

1. `npx supabase db push --db-url "$env:SUPABASE_DB_URL"`
2. `npx supabase functions deploy platform-admin --project-ref SEU_REF`
3. `npx supabase functions deploy admin-users --project-ref SEU_REF`
4. Configure `ADMIN_USERS_ALLOWED_ORIGINS=null,app://peganafrota,http://localhost:5173` se necessário.
5. Refaça os builds dos dois front-ends.
