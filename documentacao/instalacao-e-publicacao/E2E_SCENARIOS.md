> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Cenários E2E — especificados, execução depende do ambiente

Estes cenários exigem navegador real/headless para o Admin Web e automação do Electron para o Desktop. O gate deve marcar como **N/E** quando o ambiente não tiver os serviços necessários; N/E nunca significa aprovado.

## Desktop

| # | Cenário | Verificação decisiva |
|---|---|---|
| D1 | Login com credencial válida | `my_context()` carrega e o menu reflete as permissões |
| D2 | Login sem vínculo ativo | tela “Sem empresa vinculada”, não erro genérico |
| D3 | Permissões | controle negado fica desabilitado com motivo quando aplicável |
| D4 | Criar veículo | placa normalizada; duplicata vira conflito tratável |
| D5 | Iniciar e concluir viagem | odômetro final inválido é recusado |
| D6 | Registrar abastecimento | total calculado pelo backend e ledger atualizado |
| D7 | Movimentação manual | veículo/local informados; tipo e horário são resolvidos pelo servidor |
| D8 | Arquivar com bloqueio | veículo com operação aberta é protegido |
| D9 | Importar Excel/CSV | modelo oficial abre, prévia mostra linhas válidas/inválidas e nada grava antes da confirmação |
| D10 | Tema | Claro/Escuro/Sistema sem flash na reabertura |

## Admin Web

| # | Cenário | Verificação decisiva |
|---|---|---|
| A1 | Login e autorização | e-mail/senha + `platform_admin` ativo |
| A2 | Conta não-admin | 403 `NOT_PLATFORM_ADMIN` leva à tela de acesso negado |
| A3 | Criar empresa | wizard de 3 etapas inclui senha inicial do primeiro administrador |
| A4 | Primeiro admin | conta Auth é criada, e-mail confirmado e `company_admin` nasce ativo; login direto no Desktop |
| A5 | Convite de integrante | fluxo de equipe gera link; aceite define senha conforme contrato atual |
| A6 | Provisionamento com falha | operação fica `failed` com `retryable` coerente |
| A7 | Compensação | empresa é arquivada quando a compensação assim exigir; auditoria preservada |
| A8 | Retentativa | idempotência não duplica empresa nem usuário |
| A9 | Suspender/restaurar acesso | altera o vínculo/estado permitido sem corromper histórico |
| A10 | Redefinir senha | `member.passwordReset` atualiza Auth sem persistir senha em auditoria |
| A11 | Excluir usuário | remove vínculo e identidade apenas quando seguro; último admin protegido |
| A12 | Excluir empresa | exige estado/confirmacão previstos e saneia dados conforme RPC |
| A13 | Sem dados operacionais | Admin Web não recebe veículos, viagens nem custos dos tenants |

## Regras gerais

- Primeiro administrador por senha direta e convite de equipe são **fluxos diferentes**.
- MFA/TOTP não faz parte do fluxo atual.
- Toda ação privilegiada deve deixar auditoria adequada.
- Idempotência deve ser testada com repetição real do mesmo payload/chave.
