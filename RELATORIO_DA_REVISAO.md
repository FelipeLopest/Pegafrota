# Revisão atual — versão 1.2.6

A rotina de viagens agora permite criação e início na mesma sequência, com controle de garagem opcional por empresa. O visual completo da 1.2.5, os modelos de importação e a câmera oculta foram preservados.

Os resultados, correções e etapas pendentes estão no [relatório da versão 1.2.6](documentacao/validacao/fluxo-viagens-1.2.6/RELATORIO.md). O [guia de uso](FLUXO_DE_USO.md) explica a rotina e o [guia de atualização](ATUALIZAR_PEGANAFROTA_1_2_6.md) explica a migration necessária.

Os relatórios abaixo são históricos e não representam o escopo ou o resultado da rodada atual.

# Histórico — revisão visual 1.1.1

Data: 10 de novembro de 2026. Esta entrega acrescenta acabamento visual à integração de câmeras da versão 1.1.0, preservada no pacote.

## Alterações

- Botões dos dois aplicativos usam cores planas. Foram removidos brilhos, sombras, gradientes e movimentos de hover que deslocavam as ações. O contorno de foco por teclado foi preservado.
- Tamanhos de controles, espaçamentos entre ícones/textos, ações de cabeçalho, filtros, grupos de botões e rodapés de diálogo foram uniformizados. Textos longos podem quebrar sem ultrapassar os limites.
- Removidas camadas repetidas de CSS que impunham larguras e margens diferentes aos mesmos botões. A navegação recolhida acomoda marca e controle sem sobreposição.
- Formulários se adaptam à largura disponível; modais respeitam a altura da janela e mantêm ações acessíveis. A faixa de cinco indicadores fica em três mais dois em janelas intermediárias. O cadastro de empresa não exibe mais numeração nativa fora dos cartões das etapas.
- Novos logins da empresa e da administração: marca, ilustração vetorial própria, explicação visual da operação e cartões de recursos na área esquerda. Em telas pequenas, a marca permanece e a apresentação é compactada para priorizar o formulário.
- Ícone próprio com veículo frontal, em laranja e carvão. SVG vetorial, PNG 512px e ICO com 16/24/32/48/64/128/256px. Incluído nos favicons, no login, na configuração da janela e na configuração do executável/instalador/atalhos Windows.
- O build agora copia recursos locais de marca/ilustração. Não há imagens, fontes ou scripts de CDN.

## Validação

- 286 testes dos aplicativos/pacotes aprovados. Um teste antigo foi ajustado para reconhecer seletores CSS agrupados equivalentes.
- 55 verificações da gestão de equipe, contratos de 44 RPCs/19 consultas/quatro relatórios, configuração 11/11 e segurança Electron 38/38 aprovados.
- Compilação dos dois aplicativos, sintaxe/imports, recursos locais, segredos, fronteiras, protótipos, organização e inicialização básica do painel aprovados. As 49 migrations anteriores continuam preservadas.
- 130 combinações de tela, tema e largura no Chrome: 19 rotas operacionais da empresa e nove do painel em claro/escuro a 1440/1024 px, logins também a 390 px e diálogos de cadastro/saída. Sem erros JavaScript, sem rolagem horizontal global nas condições verificadas, imagens locais carregadas e botões sem sombras/gradientes.
- Login exercitado nos dois temas: validação de campos vazios, exibir/ocultar senha mantendo o valor, orientação de recuperação de senha, entrada com resposta simulada e opção Manter conectado da empresa.
- Amostra dos estilos dos botões em repouso e hover confirmou ausência de sombra, gradiente e transformação nas variantes disponíveis. Ícones ICO contêm os sete tamanhos declarados.

As verificações visuais usaram dados fictícios, Supabase e ponte Electron simulados. Algumas capturas internas incluem o aviso de conexão indisponível do ambiente isolado; não representam diagnóstico do servidor de produção. Foram inspecionadas capturas de login, veículos, cadastro de veículo e cadastro de empresa, incluindo temas e tamanhos distintos. As capturas e os resultados estão em documentacao/validacao/aparencia/.

## Como usar a atualização

Extraia a pasta única PegaNaFrota_Reorganizado em uma pasta nova. Atualize os arquivos do repositório, incluindo .github e recursos/. Para o painel hospedado, publique pela integração existente da Vercel. Para o programa instalado, gere um novo instalador em Actions → Gerar instalador Windows e instale PegaNaFrota-1.1.1-Instalador.exe. O novo ícone Windows só será aplicado no produto recompilado; um atalho antigo pode continuar apontando à instalação anterior.

Esta sessão não publicou o projeto no GitHub/Vercel, não alterou o Supabase e não gerou/homologou o instalador completo. A configuração de empacotamento e os recursos do ícone estão prontos. Os ajustes visuais não exigem migration adicional; quem ainda não ativou as câmeras deve seguir ATIVAR_CAMERAS.md e identificar a placa física antes de usar o firmware.

## Onde alterar depois

Em cada aplicativo: estilos/estilo-login.css para o acesso; componentes/apresentacao-do-login.mjs para a apresentação; estilos/estilo-componentes.css para botões/campos; estilos/estilo-menu-e-janela.css para a navegação; estilos/estilo-ajustes-visuais.css para ajustes de páginas; recursos/ para ícone e ilustração. O programa também tem estilos/estilo-importacao.css. O guia completo permanece em GUIA_DO_PROJETO.md.

---

# Histórico anterior

# Integração de câmeras — versão 1.1.0

Data: 9 de novembro de 2026. Base: revisão 7d9fc77 do repositório FelipeLopest/Pegafrota. A entrega contém uma única raiz PegaNaFrota_Reorganizado. O histórico de revisões anteriores foi preservado abaixo e suas contagens não representam esta versão.

## Resultado entregue

- Nova tela Câmeras e leituras no programa da empresa, com formulários separados para cadastro, pareamento e revisão.
- Captura JPEG via Wi-Fi, autenticação própria por dispositivo, chave revogável armazenada como hash privado, imagens privadas por empresa e expiração de leitura em 24 horas.
- Fila com reserva temporária, retomada limitada, identificadores idempotentes e proteção contra conclusão de trabalho de outra sessão/processador.
- OCR local no Windows, sem serviço exposto na rede e sem envio de credencial de usuário ao leitor. Motor e modelos serão incluídos no novo instalador pelo workflow.
- Movimentação automática opcional, inicialmente desligada, somente em câmera de um sentido, após duas fotos distintas concordarem na placa da frota com confiança mínima. Leitura incerta, conflitante ou direção dupla exige revisão. Presença e idempotência são conferidas no banco.
- Limite de 1.000 fotos por câmera em 24 horas corridas por padrão, ajustável de 1 a 10.000. Fila local limitada a seis fotos; fila recente do backend limitada a 30 trabalhos; capturas pendentes expiram após 15 minutos.
- Firmware ESP32-S3 com dois perfis explícitos de pinos, TLS com certificados, sincronização de relógio, detecção simples de movimento, configuração serial e reenvio persistente.
- Remoção física de imagens por função de manutenção agendada no servidor, incluindo capturas de câmeras/empresas excluídas. O agendamento deve ser ativado conforme o guia.
- Pátio e movimentação manual continuam disponíveis sem câmera. A integração não controla portão ou cancela.

## Validação executada

| Verificação | Resultado e alcance |
|---|---|
| Aplicativos e pacotes | 286 testes aprovados; zero falhas. |
| Gestão de equipe | 55 verificações aprovadas com dependências simuladas. |
| Contratos Desktop/banco | 44 RPCs, 19 consultas e quatro relatórios conferidos. |
| Configuração e Electron | 11/11 e 38/38 verificações aprovadas. |
| Compilação dos dois aplicativos | Aprovada; imports e inicialização básica do painel conferidos. |
| Sintaxe, segredos, recursos locais, fronteiras e organização | Aprovados. As 49 migrations anteriores permanecem equivalentes, aceitando somente diferenças de fim de linha entre Git/Windows. |
| Banco das câmeras | 44 verificações aprovadas em PostgreSQL isolado via PGlite, aplicando as 50 migrations reais. Inclui isolamento, permissões, cotas, leases, revogação, consenso, duplicatas, revisão, presença, auditoria e acesso às imagens. Não equivale a teste no Supabase de produção. |
| Recepção HTTP | Sete testes aprovados, com transporte/armazenamento simulados, incluindo JPEG inválido, tamanho/dimensões, identidade, reenvio, limites e heartbeat. |
| Funções novas | Verificação de tipos pelo Deno com dependências fixadas e lockfile congelado aprovada. |
| Python | Cinco testes aprovados para extração e validação. |
| OCR real | Três imagens sintéticas reconhecidas corretamente; não são fotografias de veículos nem medição da taxa de acerto em campo. |
| Executável Windows do leitor | Gerado com modelos incluídos, reconheceu imagem sintética; a ponte do aplicativo também foi exercitada com esse executável. |
| Interface | Sete cenários no Chrome com Supabase e ponte Electron simulados; zero erros JavaScript, incluindo cadastro, pareamento, revisão, monitoramento e pátio manual. |
| Instalação de dependências | Lockfile aceito por npm ci em simulação sem executar instalação/scripts. |

Evidências em documentacao/validacao/cameras/. Os comandos reproduzíveis estão no guia e nos workflows. As verificações do processo Electron incluem análise estática e teste do subprocesso; não foi homologada uma janela Electron instalada conectada ao backend real.

## Etapas externas ainda pendentes

1. Identificar a placa exata. O usuário informou ESP32-S3 com câmera, mas não sabe o modelo. Há perfis para ESP32-S3-EYE e XIAO ESP32S3 Sense; nenhum deles deve ser aplicado a outro modelo por suposição.
2. Concluir a compilação do firmware pelo workflow Linux e testar na placa física. A ferramenta C++ da Espressif não iniciou neste Windows (Illegal System DLL Relocation); nenhum binário de firmware foi homologado nesta sessão.
3. Aplicar a nova migration, implantar camera-intake/camera-maintenance e ativar a manutenção no Supabase. Nenhum dado ou configuração de produção foi alterado.
4. Gerar o instalador Windows 1.1.0 pelo GitHub Actions. O leitor foi compilado e testado localmente, mas o instalador completo ainda não: a instalação local das ferramentas Electron encontrou EPERM.
5. Calibrar enquadramento, iluminação e passagem lenta; conferir presença inicial e testar rede, reinício, falhas e placas reais antes de habilitar movimentos automáticos.

O envio para o GitHub não foi realizado: a checagem de acesso falhou no gerenciador de credenciais deste ambiente. O ZIP está pronto para envio manual preservando .github e a estrutura. Os workflows novos não foram executados remotamente nesta sessão. O pacote de fontes não inclui .env, senhas de Wi-Fi, credenciais de pareamento, node_modules, executáveis gerados ou segredos administrativos. A configuração incorporada contém somente URL e chave pública anon do projeto.

A detecção visual simples e o envio síncrono não garantem cobertura de veículos em trânsito rápido ou durante indisponibilidade prolongada de rede. A automação requer internet, aplicativo aberto/logado, usuário autorizado e monitoramento ativo. O funcionamento manual não depende desses componentes de câmera.

Guia de ativação e limites: ATIVAR_CAMERAS.md. Localização e responsabilidade dos arquivos: GUIA_DO_PROJETO.md e documentacao/organizacao/MAPA_DOS_ARQUIVOS.md.

---

# Histórico das revisões anteriores

# Revisão e validação da versão reorganizada

Data: 7 de novembro de 2026. Origem: `PegaNaFrota_Corrigido-main (4).zip`. O ZIP recebido foi preservado; esta entrega é uma cópia reorganizada.

## Preparação para distribuição e Vercel

Nesta entrega a conexão pública foi incorporada em arquivo próprio, sem exigir a criação de .env. Foram aprovados 282 testes unitários e as verificações do projeto. A saída estática da Vercel e a compilação Desktop foram conferidas sem .env. Há script e workflow para o instalador, mas nenhum .exe foi gerado: a instalação de dependências foi impedida por EPERM no Windows desta sessão. O deploy Vercel e o workflow GitHub ainda não foram executados na conta do usuário. Evidências em `documentacao/validacao/publicacao/`.

## Pacote completo unificado

A duplicação de projeto no ZIP recebido foi resolvida mantendo a fonte atualizada e preservando o `.env` anterior em uma única raiz. As duas pastas `dist` foram geradas novamente a partir desta versão. Foram repetidos os 278 testes, as verificações mínimas do projeto e os cinco cenários de CNPJ no Chrome com serviços simulados. Consulte `LEIA_PRIMEIRO.md` para abrir esta entrega; as evidências estão em `documentacao/validacao/projeto-unificado/`. O banco e a autenticação reais não foram testados.

## Atualização posterior: consulta de CNPJ

Foi acrescentado preenchimento no cadastro de nova empresa por BrasilAPI. Esta versão passa em 278 testes unitários (os 263 anteriores e 15 novos), nas verificações do projeto e em cinco cenários de interface com serviços simulados. A consulta pública real foi conferida separadamente; o cadastro real no Supabase não foi executado. Os detalhes e as instruções estão em `CONSULTA_CNPJ.md`. As contagens e comparações abaixo registram a reorganização anterior à funcionalidade.

## O que foi aplicado

- Arquivos e pastas próprios do projeto receberam nomes em português, com o assunto explícito.
- As telas foram extraídas dos arquivos grandes: 20 arquivos `tela-...` no programa da empresa e 13 no painel, incluindo login e estados de acesso. As rotas existentes foram preservadas.
- Formulários, consultas e serviços de dados foram separados por assunto. A sessão, conectividade, configuração, cache e navegação foram separados em arquivos com responsabilidade identificável.
- Variáveis, parâmetros, funções e tipos internos de JavaScript/TypeScript foram traduzidos respeitando o escopo. Propriedades abreviadas foram expandidas para preservar os nomes dos campos enviados à API.
- Foram traduzidas as variáveis visuais próprias de CSS com suas referências. Os estilos foram separados por finalidade, mantendo a ordem original.
- Foram retiradas 262 importações sem uso na primeira limpeza e outras importações desnecessárias nas etapas seguintes. Funções compactadas em uma linha foram formatadas para leitura.
- Imports, workspaces, manifests, lockfile, comandos, compilação, modelos de planilha e ferramentas foram ajustados à estrutura real.
- As cópias antigas de tela, o módulo MFA vazio e o pacote de tipos sem consumidor foram retirados do código ativo. Dez pares de arquivos de teste idênticos foram consolidados; cenários vigentes foram adaptados às implementações reais.
- As 49 migrations, seu nome e sua ordem foram preservados, com verificação por SHA-256. O seed e os contratos públicos do banco não foram reescritos.

A melhoria de leitura veio principalmente da divisão por responsabilidade, dos nomes explícitos e da formatação. Algoritmos de operação da frota não foram substituídos por novas regras de negócio. Os nomes obrigatórios de bibliotecas, banco, APIs, campos e exportações de compatibilidade continuam estáveis; isso é intencional.

## Correções pontuais feitas durante a revisão

1. O cache do programa agora respeita a geração da sessão. Consultas de um usuário não são reutilizadas pelo próximo; uma resposta antiga também não pode repovoar o cache após uma troca ou invalidação.
2. A renovação após erro 401 é limitada a uma tentativa e uma repetição, preservando opções e cabeçalhos de contagem. Uma renovação atrasada não substitui uma sessão nova.
3. “Manter conectado” passou a controlar a persistência protegida, inclusive quando o token é renovado.
4. A montagem do programa descarta os ouvintes de foco/conectividade anteriores, evitando acúmulo em novas entradas.
5. A confirmação de saída do painel usava uma função `button` não definida; agora chama o componente de botão existente. O diálogo foi aberto no navegador durante a validação.
6. Os verificadores passaram a localizar o código separado e os caminhos do Windows. O verificador de contratos agora encontra 17 consultas que antes não eram detectadas.

## Resultado das verificações locais

| Verificação | Resultado |
|---|---|
| Compilação do programa da empresa | Aprovada |
| Compilação do painel | Aprovada |
| Sintaxe, imports e convenções | Aprovada |
| Testes dos aplicativos e pacotes | 263 aprovados; zero falhas |
| Gestão de equipe no servidor, com dependências simuladas | 55 verificações aprovadas |
| Contratos Desktop/banco | 39 chamadas RPC, 17 consultas e 4 relatórios conferidos |
| Configuração | 9 verificações aprovadas, incluindo as duas funções de servidor |
| Invariantes de segurança do Electron | 37/37 |
| Organização, workspaces, comandos e migrations | Aprovados; 49 migrations idênticas |
| Recursos locais, fronteiras, protótipos e busca por segredos | Aprovados pelos verificadores do projeto |
| Instalação `npm ci --dry-run --ignore-scripts --offline` | Aceita; sem baixar/instalar dependências externas |
| Inicialização básica do build do painel | Arquivos, configuração, CSP e imports aprovados |

Os 263 testes incluem 191 verificações mantidas/adaptadas, sete cenários novos de sessão/cache e 65 cenários de contrato de dados registrados da versão original. A redução de duplicatas impede comparar a contagem bruta diretamente com os 221 testes anteriores. Os testes estruturais leem as implementações atuais, reunidas por área quando a origem foi dividida; não conferem a cópia antiga `v8.mjs`.

## Comparação com a versão original

- Foram comparadas as 18 rotas operacionais do programa e as nove rotas do painel no Chrome. As 27 apresentaram conteúdo textual idêntico, sem erros de JavaScript ou mensagens de falha na nova versão.
- Foram abertos o cadastro de veículo e os diálogos de saída dos dois aplicativos.
- A entrada pelos dois logins foi exercitada. No programa da empresa, a sessão não foi gravada com “Manter conectado” desmarcado e foi gravada quando marcado.
- As imagens de veículos, importação e painel administrativo tiveram zero pixels de diferença na comparação automatizada com a versão original, na resolução e nos dados simulados usados.
- Em 65 cenários de acesso a dados, os endereços, métodos HTTP, parâmetros e corpos de requisição ficaram idênticos aos da versão original. Esses casos estão nos testes automatizados.
- A comparação foi feita com respostas simuladas de API e uma ponte Electron simulada. Não houve conexão ao Supabase real nem alteração de contas/dados.

## Limites da validação

Não foram executados: banco PostgreSQL real/pgTAP, concorrência com banco, autenticação e entrega de e-mails reais, implantação das Edge Functions, firmware/ESP32, instalador Windows ou janela nativa do Electron com seu chaveiro real. A validação do processo Electron foi estática; a interface foi exercitada no Chrome.

Não foi instalado nem baixado o conjunto de dependências externas nesta sessão. Os pacotes locais foram disponibilizados na cópia de trabalho para os testes; a entrega não inclui `node_modules/`. A simulação de `npm ci` conferiu a consistência do lockfile. Para usar o projeto, execute a instalação normal e configure seu `.env` conforme `COMO_SUBIR_O_SISTEMA.md`.

O resultado dá evidências de preservação dos comportamentos verificados, mas não substitui homologação com seu ambiente real. As pendências de produto da análise anterior, como ingestão de câmera/ESP32, armazenamento de imagens e instalador assinado, continuam fora desta reorganização.

## Onde estão as evidências

Os resultados estão em `documentacao/validacao/`. O mapa de responsabilidades está em `GUIA_DO_PROJETO.md`; o inventário e os destinos dos 310 arquivos recebidos ficam em `documentacao/organizacao/`.
