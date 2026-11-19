# Como usar o PegaNaFrota na rotina — versão 1.2.6

## Preparação

Cadastre um veículo e um motorista. O veículo precisa estar ativo e disponível para sair, e o motorista precisa estar ativo, sem outra viagem em andamento. A validade de CNH informada no cadastro é conferida na saída.

Empresa → Controle de garagem permite escolher se as viagens também terão registro de passagem pelo pátio. Empresas novas começam com essa opção desligada. A atualização mantém a opção ligada nas empresas que já têm presença inicial ou movimentações registradas.

Se ativar, cadastre os pátios usados pela empresa e confira a presença inicial dos veículos. Garagem, base ou filial podem ser pátios. Cliente e endereço de destino podem ser escritos diretamente na viagem e não exigem cadastro de pátio.

## Viagem para sair agora

1. Abra **Nova viagem**, pela Visão geral ou por Viagens.
2. Selecione veículo e motorista e informe origem e destino. Cadastros rápidos estão disponíveis na própria janela para quem tem permissão. Os campos preenchidos são preservados ao voltar.
3. Clique em **Continuar para saída**.
4. Informe a quilometragem real e confira o horário. A última quilometragem aparece como referência e pode ser copiada pelo botão **Usar última quilometragem** após conferência.
5. Quando o controle de garagem estiver ativo, marque a passagem somente se o veículo realmente estiver saindo do pátio. Se houver apenas um pátio ativo, ele será selecionado. Se a presença já identifica a garagem atual, ela será selecionada ao conferir a saída. Com múltiplos pátios e sem presença conhecida, escolha o local correto.
6. Clique em **Confirmar saída**. A criação e o início são salvos juntos. Quando marcada, a passagem é salva na mesma operação. Uma falha reverte o conjunto e a repetição da mesma solicitação não duplica a viagem.

As datas previstas, motivo e observações ficam em **Datas previstas e observações** e são opcionais. É possível voltar da confirmação da saída e continuar editando o planejamento. Durante o envio, os controles impedem um segundo envio e o fechamento da confirmação.

## Planejamento para depois

Preencha os dados e clique em **Salvar planejamento**. A viagem fica planejada, sem ocupar o veículo ou o motorista e sem registrar saída da garagem. Use **Editar** para alterar o planejamento e **Iniciar** quando houver a saída real. É possível planejar um serviço futuro para um recurso ocupado agora. A disponibilidade será conferida novamente na saída.

## Encerramento

Clique em **Concluir**, informe a quilometragem final e confira o horário do encerramento. A quilometragem precisa respeitar a saída e o histórico de leituras. O veículo e o motorista ficam liberados ao encerrar, respeitando os bloqueios operacionais existentes.

Se o veículo também chegou a um pátio, marque **Registrar também entrada na portaria**. Uma viagem pode terminar fora da garagem, sem registrar entrada. O encerramento do serviço e a chegada à garagem são registrados conforme os acontecimentos reais.

Se o serviço começou e foi interrompido, use **Interromper** para manter saída, percurso e motivo no histórico. **Cancelar** é usado para o planejamento que não chegou a começar.

## Outras operações

- **Pátio e Movimentações** continuam disponíveis para conferência e passagens avulsas, como saída para lavagem. Não repita manualmente uma passagem que já foi registrada junto da viagem.
- **Abastecimentos** registram combustível, quantidade, valor e leitura. O valor total é calculado e o histórico alimenta os custos e o consumo.
- **Manutenções** reúnem serviços, custos e próximas revisões. Uma manutenção em andamento impede iniciar a viagem do mesmo veículo.
- **Quilometragem** mantém o histórico e as correções justificadas, preservando os registros originais.
- **Importar planilhas** mantém modelos Excel/CSV, instruções, prévia, validação e retomada das linhas pendentes.
- **Relatórios** permitem acompanhar os dados e exportar o resultado completo.
- **Equipe** define os acessos de cada pessoa. Preferências da empresa ficam restritas a quem pode administrá-la.

A câmera permanece oculta. O fluxo de trabalho descrito funciona com confirmações manuais de saída e encerramento.
