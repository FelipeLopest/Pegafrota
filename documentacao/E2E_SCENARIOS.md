> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Cenários E2E — especificados, não executados

Estes cenários exigem navegador headless (Admin Web) e automação de UI do
Electron (Desktop). Nenhum deles foi executado nesta entrega; estão descritos
com precisão suficiente para serem implementados sem reinterpretar o contrato.

Registro honesto: **especificado ≠ aprovado.** Enquanto não rodarem, o gate os
marca como NÃO EXECUTADO.

## Desktop

| # | Cenário | Verificação decisiva |
|---|---|---|
| D1 | Login com credencial válida | `my_context()` carrega e o menu reflete as permissões |
| D2 | Login sem vínculo ativo | tela "Sem empresa vinculada", não erro genérico |
| D3 | Permissões | `viewer` vê botão de criar veículo **desabilitado com motivo**, não ausente |
| D4 | Criar veículo | placa normalizada sem separador; duplicata devolve conflito no campo |
| D5 | Iniciar e concluir viagem | km final < km inicial é recusado antes do envio |
| D6 | Registrar abastecimento | total exibido bate com `round(l*p,2)`; total **não** é enviado |
| D7 | Movimentação manual | apenas veículo, local e observação; tipo e horário vêm do servidor |
| D8 | Arquivar com bloqueio | veículo com viagem aberta abre modal com atalho para as viagens |
| D9 | Tema | Claro/Escuro/Sistema sem flash na reabertura |

## Admin Web

| # | Cenário | Verificação decisiva |
|---|---|---|
| A1 | Login e autorização | login por e-mail/senha; ação crítica exige platform_admin ativo e confirmação explícita |
| A2 | Conta não-admin | 403 `NOT_PLATFORM_ADMIN` leva à tela "Sem acesso ao painel" |
| A3 | Criar empresa | wizard de 3 etapas; sem campo de senha |
| A4 | Primeiro admin | vínculo nasce **inativo**; só o aceite do convite ativa |
| A5 | Convite | reenvio invalida o link anterior; antes da janela devolve 429 com `Retry-After` |
| A6 | Provisionamento com falha | empresa criada + etapa 2 falha → `failed` com `retryable` |
| A7 | Compensação | empresa é **arquivada**, não excluída; auditoria preservada |
| A8 | Retentativa | reativa a mesma empresa, mesmo CNPJ, mesmo id |
| A9 | Suspender/restaurar acesso | mexe só em `company_memberships.active` |
| A10 | Bloquear/desbloquear conta | mexe só em `profiles.active`; último admin é recusado |
| A11 | Idempotência | duplo clique no wizard não cria duas empresas |
| A12 | Sem dados operacionais | `get_company` não devolve veículo, viagem nem custo |

Os cenários A6 a A11 já têm cobertura equivalente em pgTAP
(`12_platform_provisioning.sql`), no nível do banco. O que falta é a prova pela
interface.
