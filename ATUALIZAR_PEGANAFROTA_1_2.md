# Atualizar o PegaNaFrota para a versão 1.2.0

O ZIP contém uma única pasta chamada **PegaNaFrota_Reorganizado**. Extraia em uma pasta nova. Ele contém o código completo, o painel web e a rotina que gera o instalador Windows.

## O que mudou no uso diário

| Área | Como usar |
|---|---|
| Primeiro acesso | A **Visão geral** indica cadastros e operações iniciais. É possível ocultar o guia e voltar a ele depois. |
| Ficha do veículo | Abra pela placa para ver a linha do tempo e iniciar viagem, abastecimento, manutenção ou passagem com o veículo preenchido. |
| Viagens | Edite o planejamento antes de iniciar. Na saída e no retorno, confira o horário real e o odômetro. É possível registrar a passagem no pátio junto com a operação. Depois da partida, use **Interromper** se a viagem não terminar como planejado. |
| Pátio | Para veículos que já estão dentro no primeiro dia, use **Conferir presença inicial**. Em seguida registre entradas e saídas reais. A câmera pode ser usada quando estiver configurada. |
| Abastecimento | Informe a leitura real. Ao digitar quantidade e preço, o total é calculado; ao informar quantidade e total, o preço unitário é calculado. O último posto e produto podem ser sugeridos. Marque tanque cheio somente quando isso tiver ocorrido. |
| Corrigir lançamentos | Use **Estornar** ou **Substituir** no abastecimento, ou a opção de correção no **Histórico de quilometragem**, com o acesso apropriado e uma justificativa. O original permanece para auditoria. |
| Manutenção | Agende por data e/ou quilometragem. Para serviços recorrentes, informe o intervalo: ao concluir, o próximo é criado. **Pausar recorrência** mantém o serviço atual e impede o próximo automático. Garantia ou outro atendimento sem cobrança pede justificativa. |
| Relatórios | A tela pagina os resultados; **Exportar todos em CSV** inclui o recorte inteiro até 50 mil linhas. Se superar o limite, divida o período. Os custos incluem combustível e manutenção. O consumo requer ciclos válidos entre tanques cheios e separa L de m³. |
| Planilhas | Confira a prévia e envie. Se uma parte falhar, use **Importar somente pendentes**. No mesmo perfil, reabrir o mesmo conteúdo mantém as confirmações recentes. Mudanças no arquivo formam um novo lote. |
| Cadastros | Use **Consultar CEP** para sugerir endereço em locais e empresas. A consulta de CNPJ continua disponível no painel. Confira as sugestões antes de salvar. |
| Acesso | **Esqueci minha senha** envia o link para a página de recuperação do painel, inclusive para contas da empresa. A troca de senha também está no perfil. |

## 1. Prepare e atualize o Supabase

Teste primeiro com um banco separado e faça uma cópia de segurança do banco em uso. As seis migrations de nome iniciado por 20261110 complementam as anteriores. Elas precisam rodar em ordem. A versão 1.2.0 não funciona por inteiro com o banco da 1.1.1.

Abra o PowerShell na pasta extraída que contém package.json e supabase. Com Node.js instalado, rode os comandos abaixo para o projeto usado pelo app. Eles usam o CLI v2 porque o arquivo supabase/config.toml desta versão ainda contém a seção [inbucket]. [Compatibilidade do CLI](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3)

    npx.cmd --yes supabase@v2.stable login
    npx.cmd --yes supabase@v2.stable link --project-ref jnznizrtbivrvqkskcep
    npx.cmd --yes supabase@v2.stable migration list --linked
    npx.cmd --yes supabase@v2.stable db push --dry-run --linked

Confira o projeto de destino e a lista exibida. Se o banco já tiver as 50 migrations até câmeras, a prévia deve indicar as seis novas. Se ele tiver só as 49 originais, a mudança de câmera 20261109000100_camera_capture_pipeline.sql também deve estar na lista antes das seis novas. Se as tabelas foram criadas pelo SQL Editor e o histórico estiver vazio ou divergente, compare o esquema e regularize o histórico antes de prosseguir. Reaplicar migrations antigas sobre tabelas existentes pode falhar.

Depois de conferir a prévia e testar num banco separado:

    npx.cmd --yes supabase@v2.stable db push --linked

Após a confirmação de que o banco foi atualizado, publique a função:

    npx.cmd --yes supabase@v2.stable functions deploy platform-admin --project-ref jnznizrtbivrvqkskcep --use-api

A nova função platform-admin usa a pesquisa de administradores no banco inteiro. Preserve o valor da origem em **Edge Functions → Secrets → ADMIN_WEB_ORIGINS**. Para o painel atual, é **https://pegafrota.vercel.app**, sem barra final.

Em **Authentication → URL Configuration**, mantenha o domínio publicado e acrescente **https://pegafrota.vercel.app/?flow=recover** às URLs de redirecionamento. Se trocar de domínio, atualize também PAGINA_RECUPERACAO no arquivo gerenciar-conta.mjs do programa da empresa e gere o instalador novamente. Confira o modelo do e-mail de recuperação e a entrega de mensagens do Auth. Teste o recebimento e o uso do link com uma conta de teste. Veja a [referência de migrations](https://supabase.com/docs/guides/deployment/database-migrations), as [URLs autorizadas](https://supabase.com/docs/guides/auth/redirect-urls) e o [fluxo de recuperação de senha](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

Se for ativar a câmera, siga **ATIVAR_CAMERAS.md** para as funções e o dispositivo. Você pode usar o sistema manualmente sem essa ativação.

## 2. Publique o painel e gere o aplicativo

1. Envie o **conteúdo** da pasta extraída à raiz do repositório, incluindo .github, package-lock.json e vercel.json. Preserve as configurações da Vercel que já funcionam.
2. Depois da atualização do banco e da função, publique o painel na Vercel. Teste empresas, administradores e recuperação de senha.
3. No GitHub, abra **Actions → Gerar instalador Windows → Run workflow**. Ao concluir, baixe o artefato **PegaNaFrota-Instalador-Windows**, extraia **PegaNaFrota-1.2.0-Instalador.exe** e distribua apenas esse executável. Quem instala não precisa rodar npm ou criar .env.
4. Teste com uma empresa de homologação: abra a ficha de um veículo, lance um abastecimento manual, planeje uma viagem, agende uma revisão e exporte um relatório. Confirme também o acesso do perfil que só visualiza dados.

## Validação e escopo

As 56 migrations foram aplicadas em PostgreSQL descartável. Passaram 16 cenários de operação e isolamento, 288 testes unitários e 44 verificações de banco da câmera. Os dois produtos foram compilados, incluindo a saída estática da Vercel. A interface foi exercitada no Chrome com respostas simuladas: cálculo do abastecimento, CEP, exportação de 500 linhas, retomada de importação, recuperação de senha, reconexão e operação manual sem leitor.

A entrega não altera a produção nem inclui o novo instalador. O teste com e-mail real, os dados de produção, a capacidade sob carga e a câmera física precisam ser verificados no ambiente de implantação. OCR de comprovantes, ERP, cartão de combustível, telemetria e operação completa sem internet seguem como complementos. A consulta de CEP usa o [ViaCEP](https://viacep.com.br/), com preenchimento manual disponível quando o serviço não responde.
