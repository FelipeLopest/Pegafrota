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
