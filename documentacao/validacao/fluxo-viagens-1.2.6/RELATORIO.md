# Validação da versão 1.2.6

Revisão executada sobre a versão local do repositório, com base na 1.2.5. Os dados usados nos testes são fictícios. O Supabase publicado, as contas reais e o aplicativo instalado do usuário não foram alterados.

## Resultado e adequação de uso

O escopo atual cobre cadastro de veículos e motoristas, planejamento e execução de viagens, quilometragem, abastecimentos, manutenção recorrente, custos, relatórios, importação de planilhas, gestão de equipe e histórico de auditoria. O painel separado mantém administração de empresas e acessos. O controle de garagem é opcional e a câmera permanece oculta.

Os cenários locais descritos abaixo passaram sem inconsistência impeditiva identificada após as correções. Isso permite seguir para publicação e homologação na empresa. Não equivale a certificar todas as condições possíveis de uso nem a confirmar que a instalação atual já está atualizada.

Para liberar esta revisão no ambiente real, ainda é necessário aplicar as migrations pendentes, publicar o código usado pela Vercel, gerar e instalar o aplicativo Windows desta revisão e conferir uma jornada com uma empresa de teste no ambiente publicado. A rotina é de controle operacional com confirmação de saída e encerramento pelo usuário. A posição do pátio depende das passagens registradas.

## Alterações e inconsistências corrigidas

- Cadastro de viagem agora permite seguir diretamente para a confirmação da saída ou salvar o planejamento para depois.
- A criação e a saída usam uma única transação. Se a saída ou a passagem falhar, a criação também é revertida. Repetir a mesma solicitação devolve o resultado anterior.
- Preferência de garagem persistida por empresa, alterável somente com `company.update`. Empresas com histórico de presença ou passagens conservam o controle ativo na migração. Desativar não apaga registros.
- Primeiros passos e atalhos principais priorizam viagens. A configuração de pátio só integra os passos quando a empresa opta por esse controle.
- Veículo em uso/manutenção, motorista ocupado e CNH vencida recebem orientação na interface. O servidor continua validando disponibilidade e autorização ao confirmar, inclusive quando os dados da tela estão desatualizados.
- A consulta de viagens em andamento considera a coleção completa, além da primeira página da tabela.
- Cadastros rápidos de veículo e motorista continuam acessíveis quando há outros registros. Rascunho, observações e datas são preservados na volta.
- A quilometragem de saída continua exigindo confirmação. Há referência e botão para usar a última leitura. O encerramento não pressupõe retorno à garagem.
- Passagens marcadas exigem uma consulta válida de presença. Falhas permitem repetir a consulta ou registrar apenas a viagem. A interface também orienta quando o veículo já está dentro ou fora.
- Com várias garagens, uma saída não pode ser registrada em outra garagem enquanto o veículo consta presente na anterior. O servidor também garante a regra.
- Durante o envio de planejamento ou operação, os controles impedem iniciar outro fluxo, editar o conteúdo ou fechar a confirmação.
- O cadastro rápido de garagem abre corretamente pelo atalho de Empresa.
- O verificador administrativo do backend foi corrigido para ler a estrutura reorganizada e exigir os contratos desta versão. O modo de listar contratos funciona sem credenciais ou conexão com banco.
- Visual completo da 1.2.5, modelos Excel/CSV, instruções de importação, planejamento, passagens avulsas e demais operações existentes preservados.

## Verificações executadas

| Área | Evidência e resultado |
|---|---|
| Testes dos aplicativos e pacotes | 298 aprovados, nenhuma falha ou teste ignorado |
| Banco operacional | 26 cenários aprovados em PostgreSQL descartável via PGlite, com 65 migrations |
| Regras novas no servidor | Sem pátio, saída e entrada integradas, repetição segura, rollback, motorista ocupado, quilometragem, horário, autorização, isolamento e garagem incorreta |
| Banco administrativo | Auditoria, cadastro de empresa com rollback/repetição, proteção do último administrador, revogação com autoria preservada e exclusão de empresa aprovados |
| Administração no servidor | 55 verificações do serviço de equipe aprovadas com dependências simuladas |
| Interface das viagens | Cadastro/início/conclusão, planejamento, volta ao rascunho, falhas, permissão da preferência e bloqueio durante envio exercitados no Chrome com API simulada |
| Regressão de viagens | Cadastro de veículo/motorista/pátio dentro da jornada, presença inicial, operador sem permissão de cadastro, consulta pendente, resposta antiga e repetição após falha aprovados |
| Painel no navegador | 18 jornadas aprovadas: login, recuperação, CNPJ/CEP simulados, duplicidade, usuários, senha, proteção de acesso, suspensão, reativação, exclusão, paginação, convites, auditoria e renovação da sessão |
| Importação | Modelo Excel/CSV, guia, prévia, gravação, validação, falha de catálogo, retomada, repetição só de pendências e troca de arquivo/colagem aprovados |
| Operação complementar | Abastecimento com total calculado e data no fuso da empresa; CEP sem sobrescrever endereço digitado; relatório de 2.500 linhas exportado em três chamadas; recuperação de senha e reconexão aprovados |
| Revisão visual | 166 combinações de tela/tema/largura aprovadas no Chrome, incluindo logins e diálogos |
| Contratos | 54 chamadas RPC, 19 consultas e cinco relatórios conferidos com as migrations |
| Segurança Electron | 38 invariantes estáticas aprovadas |
| Câmera oculta | Jornadas sem chamadas de câmera; 44 verificações do banco de referência da integração aprovadas, sem uso de hardware |
| Compilação | Desktop com 131 arquivos e painel com 82 arquivos, ambos aprovados |
| Outras verificações | Sintaxe/imports, configuração, recursos locais, segredos, fronteiras e organização aprovados; 49 migrations originais preservadas |

O banco descartável executa as funções e transações reais das migrations, com um ambiente local de autenticação e armazenamento preparado para os testes. Não substitui validação de rede, e-mails, Auth e políticas de implantação do Supabase publicado. As jornadas no navegador usam respostas simuladas de API e ponte Electron simulada, complementadas pelos testes reais de regras de banco.

As evidências textuais desta rodada ficam ao lado deste relatório. As capturas selecionadas mostram a nova viagem e o dashboard. Os testes novos de regras e os cenários de banco fazem parte do código entregue.

## Etapas não aprovadas nesta sessão

- Nenhuma publicação no GitHub/Vercel ou aplicação de migration no Supabase remoto.
- Nenhum instalador NSIS novo gerado ou instalado.
- A tentativa de abrir o código atual com uma cópia isolada do runtime Windows Electron 43.2.0 não concluiu a inicialização pelo controlador. Não foi contada como teste aprovado, e não foi identificada a causa dessa falha de lançamento.
- Autenticação, entrega de e-mail, convites e serviços públicos de CNPJ/CEP não foram homologados pela rede real nesta rodada.
- Sem validação de ESP32, pois a integração está oculta e fora do fluxo atual.

As instruções para aplicar a atualização estão em `ATUALIZAR_PEGANAFROTA_1_2_6.md`. O caminho de operação está em `FLUXO_DE_USO.md`.
