# Guia do projeto — organização implementada

Esta é a estrutura real da versão reorganizada do PegaNaFrota. As telas e funcionalidades atuais foram preservadas. O relatório de validação está em `RELATORIO_DA_REVISAO.md`.

## Comece pelo que você quer alterar

| Quero alterar… | Arquivo/pasta |
|---|---|
| Tela de login da empresa | `aplicativos/programa-empresa/telas/tela-login.mjs` |
| Tela de veículos | `aplicativos/programa-empresa/telas/tela-veiculos.mjs` |
| Cadastro de um veículo | `aplicativos/programa-empresa/formularios/formulario-veiculo.mjs` |
| Consulta/gravação de veículos | `aplicativos/programa-empresa/dados/dados-veiculos.mjs` |
| Empresas da plataforma | `aplicativos/painel-administracao/telas/tela-empresas.mjs` |
| Consulta automática de CNPJ | `aplicativos/painel-administracao/dados/consultar-cnpj.mjs`; uso e instalação em `CONSULTA_CNPJ.md` |
| Cadastro de empresa na plataforma | `aplicativos/painel-administracao/telas/tela-cadastrar-empresa.mjs` |
| Menu lateral | `navegacao/menu-lateral.mjs` de cada aplicativo |
| Endereços das telas | `navegacao/enderecos-das-telas.mjs` de cada aplicativo |
| Validação de cadastros | `compartilhado/validacoes/` |
| Regras finais do banco | Nova migration em `supabase/migrations/` |

O programa da empresa e o painel da administração são separados. Escolha primeiro o aplicativo; depois a pasta e o assunto.

## Pastas da raiz

| Pasta | Responsabilidade |
|---|---|
| `aplicativos/programa-empresa/` | Programa Electron usado pelas empresas para operar a frota. |
| `aplicativos/painel-administracao/` | Painel web para administrar empresas, acessos, provisionamentos e auditoria global. |
| `compartilhado/permissoes-e-regras/` | Permissões, papéis, situações e códigos compartilhados. |
| `compartilhado/validacoes/` | Validações em português e leitura de planilhas. |
| `ferramentas/` | Desenvolvimento, verificações, testes e rotinas administrativas. |
| `supabase/` | Banco, funções de servidor e testes do backend. |
| `documentacao/` | Mapa detalhado, referências de produto, operação e histórico. |

## Programa da empresa

Arquivos de entrada: `iniciar-aplicativo.mjs` conecta as partes; `compilar-aplicativo.mjs` gera `dist/`; `index.html` é a página inicial; `aplicar-tema.js` evita que o tema pisque ao abrir.

| Pasta | Responsabilidade |
|---|---|
| `acesso/` | Entrada, saída, sessão e permissões do usuário. |
| `componentes/` | Peças visuais reutilizadas dentro deste aplicativo. |
| `comunicacao/` | Requisições, configuração de conexão, cache e acompanhamento de operações. |
| `dados/` | Consultas e envio de registros de cada assunto. Os nomes dos campos da API são preservados. |
| `estilos/` | Cores, medidas, temas e aparência. O arquivo principal só mantém a ordem de carregamento. |
| `formularios/` | Campos e ações de cadastro, edição ou confirmação. |
| `importacao/` | Modelos de planilha usados pela central de importação. |
| `navegacao/` | Menu lateral, endereços e troca de tela. |
| `sistema/` | Janela e recursos do Electron; ponte segura; configuração pública da interface. |
| `telas/` | Conteúdo de cada tela; um arquivo por tela. |
| `testes/` | Testes automatizados e casos de referência da versão original. |

Telas disponíveis:

```text
aplicativos/programa-empresa/telas/
  tela-abastecimentos.mjs
  tela-detalhes-motorista.mjs
  tela-detalhes-veiculo.mjs
  tela-empresa.mjs
  tela-equipe.mjs
  tela-erro-configuracao.mjs
  tela-importar-planilha.mjs
  tela-inicial.mjs
  tela-locais.mjs
  tela-login.mjs
  tela-manutencoes.mjs
  tela-meu-perfil.mjs
  tela-motoristas.mjs
  tela-movimentacoes.mjs
  tela-odometro.mjs
  tela-patio.mjs
  tela-relatorios.mjs
  tela-sem-empresa.mjs
  tela-veiculos.mjs
  tela-viagens.mjs
```

Os arquivos `exportar-telas*.mjs` só reúnem exportações. As implementações ficam nos arquivos `tela-...`; não há uma segunda cópia da tela nesses pontos de entrada.

## Painel da administração

Arquivos de entrada: `iniciar-aplicativo.mjs` conecta as partes; `compilar-aplicativo.mjs` gera `dist/`; `index.html` é a página inicial; `aplicar-tema.js` evita que o tema pisque ao abrir.

| Pasta | Responsabilidade |
|---|---|
| `acesso/` | Entrada, saída, sessão e permissões do usuário. |
| `componentes/` | Peças visuais reutilizadas dentro deste aplicativo. |
| `comunicacao/` | Requisições, configuração de conexão, cache e acompanhamento de operações. |
| `dados/` | Consultas e envio de registros de cada assunto. Os nomes dos campos da API são preservados. |
| `estilos/` | Cores, medidas, temas e aparência. O arquivo principal só mantém a ordem de carregamento. |
| `formularios/` | Campos e ações de cadastro, edição ou confirmação. |
| `navegacao/` | Menu lateral, endereços e troca de tela. |
| `telas/` | Conteúdo de cada tela; um arquivo por tela. |
| `testes/` | Testes automatizados e casos de referência da versão original. |

Telas disponíveis:

```text
aplicativos/painel-administracao/telas/
  tela-aceitar-convite-administracao.mjs
  tela-aceitar-convite-equipe.mjs
  tela-administradores.mjs
  tela-auditoria.mjs
  tela-cadastrar-empresa.mjs
  tela-detalhes-empresa.mjs
  tela-detalhes-provisionamento.mjs
  tela-empresas.mjs
  tela-inicial.mjs
  tela-login.mjs
  tela-meu-perfil.mjs
  tela-provisionamentos.mjs
  tela-sem-acesso.mjs
```

Os arquivos `exportar-telas*.mjs` só reúnem exportações. As implementações ficam nos arquivos `tela-...`; não há uma segunda cópia da tela nesses pontos de entrada.

## Como localizar os outros códigos

- `dados/dados-do-programa.mjs` e `dados/dados-do-painel.mjs` reúnem os serviços por assunto. O comportamento de consulta/gravação está nos arquivos `dados-...`.
- `acesso/sessao-e-permissoes.mjs` no programa e `comunicacao/comunicacao-com-servidor.mjs` no painel são pontos de exportação para manter compatibilidade. A implementação está separada nos arquivos das respectivas áreas.
- `sistema/abrir-janela.cjs` é o processo principal do Electron: janela, configuração, segurança, comunicação e gravação de arquivos/sessão. `sistema/ponte-segura.cjs` expõe a interface restrita para a janela. Não carregar módulos locais com `require()` nesse preload isolado.
- `estilos/estilo-principal.css` importa os arquivos de aparência na ordem original. `estilo-login.css` trata a entrada; `estilo-menu-e-janela.css` trata o menu; `estilo-componentes.css` trata componentes; `estilo-importacao.css` existe no programa da empresa. `estilo-ajustes-visuais.css` conserva as sobrescritas e adaptações de tamanho na mesma ordem da versão anterior.
- `compartilhado/validacoes/exportar-validacoes.mjs` reúne os validadores. Procure `validar-veiculo.mjs`, `validar-empresa.mjs`, `validar-senha.mjs`, `validar-importacao.mjs` e `ler-planilha.mjs` pelo assunto.
- `supabase/functions/platform-admin/index.ts` atende a administração global; `supabase/functions/admin-users/index.ts` e `gerenciar-equipe.ts` atendem a equipe da empresa. Os nomes implantados foram preservados.

## Convenção de nomes

Use `tela-assunto.mjs`, `formulario-assunto.mjs`, `dados-assunto.mjs`, `validar-assunto.mjs`, `estilo-assunto.css` e `teste-assunto.test.mjs`. Identificadores internos usam português sem acentos. Não reutilize uma abreviação sem significado para guardar vários tipos de dado.

Variáveis e parâmetros internos foram traduzidos; as funções grandes foram divididas por responsabilidade e o código foi formatado para leitura. As variáveis visuais de CSS também foram traduzidas. Nomes de APIs, campos do banco, propriedades de bibliotecas, seletores de interface e exportações antigas necessárias à compatibilidade permanecem estáveis. Veja `documentacao/organizacao/NOMES_E_COMPATIBILIDADE.md`.

## O que não deve ser traduzido ou reescrito

- `package.json`, `package-lock.json`, `README.md`, `AGENTS.md`, arquivos de ambiente e entradas exigidas pelas ferramentas.
- As 49 migrations anteriores: nome, ordem e conteúdo foram preservados por SHA-256. Mudanças de banco exigem uma migration nova.
- Schemas, tabelas, RPCs, colunas, ações da API, variáveis de ambiente e nomes das funções implantadas.
- A ponte `window.pnf`, chaves de armazenamento, canais IPC e contratos públicos preservados. Os nomes locais que os utilizam estão em português.

## Comandos principais

Execute na raiz do projeto, após `npm ci` e a configuração descrita em `COMO_SUBIR_O_SISTEMA.md`.

| Comando | O que faz |
|---|---|
| `npm run abrir:empresa` | Compila e abre o programa da empresa. |
| `npm run compilar` | Compila os dois aplicativos. |
| `npm run compilar:painel` | Compila somente o painel. |
| `npm run abrir:painel` | Serve a versão compilada do painel localmente. |
| `npm run testar` | Executa os testes dos aplicativos e pacotes. |
| `npm run test:edge:unit` | Executa os testes locais da função de gestão de equipe. |
| `npm run verificar:organizacao` | Confere caminhos, workspaces, imports e migrations preservadas. |
| `npm run lint` | Verifica sintaxe, imports e convenções. |

Os comandos anteriores em inglês continuam disponíveis para compatibilidade. `dist/`, `node_modules/`, `artifacts/` e `.env` são locais/gerados e não estão no pacote de fontes.

## Histórico e mapa completo

O inventário completo de arquivos está em `documentacao/organizacao/MAPA_DOS_ARQUIVOS.md`. O caminho de cada arquivo original e seu destino estão em `documentacao/organizacao/ARQUIVOS_ANTES_E_DEPOIS.csv`. A documentação recebida foi preservada e sinalizada como referência anterior quando necessário.

A cópia antiga `v8.mjs`, o módulo MFA vazio e o pacote de tipos sem consumidor foram retirados do código ativo; o motivo consta no mapa. Os cenários úteis dos testes antigos foram preservados/adaptados; dez pares idênticos de arquivos de teste foram consolidados.

## Distribuição e hospedagem

- `configuracao-publica.json`: URL e chave pública incorporadas; sem dados administrativos.
- `ferramentas/apoio/configuracao-publica.mjs`: prioridade da configuração e rejeição de chaves privilegiadas.
- `ferramentas/compilacao/gerar-instalador.mjs`: pacote Electron para Windows x64, somente o produto compilado.
- `.github/workflows/gerar-instalador.yml`: geração manual do instalador no GitHub Actions.
- `ferramentas/compilacao/compilar-painel-vercel.mjs`: saída estática da Vercel com cabeçalhos CSP.
- `vercel.json` e `.vercelignore`: comandos de build e exclusões do envio.
- `PUBLICAR_E_GERAR_APLICATIVO.md`: instruções de instalação, Vercel e autorização do domínio no Supabase.

## Câmeras opcionais — versão 1.1.0

| Arquivo/pasta | Responsabilidade |
|---|---|
| `ATIVAR_CAMERAS.md` | Preparação, implantação, pareamento, calibração e limites. |
| `aplicativos/programa-empresa/telas/tela-cameras.mjs` | Cadastro, estado do dispositivo, chave, imagens e revisão. |
| `aplicativos/programa-empresa/dados/dados-cameras.mjs` | Contratos da fila e leitura autenticada de imagens privadas. |
| `aplicativos/programa-empresa/comunicacao/monitorar-cameras.mjs` | Monitoramento durante a sessão, reserva de trabalhos e retorno validado. |
| `aplicativos/programa-empresa/sistema/processar-imagem.cjs` | Subprocesso local de caminho fixo, sem shell, com limite de imagem e tempo. |
| `servicos/leitor-placas/` | Motor OCR local, extração de placas brasileiras, dependências e testes. |
| `dispositivos/esp32-s3/peganafrota-camera/` | Firmware, perfis explícitos de pinos, Wi-Fi, TLS, relógio e reenvio. |
| `supabase/functions/camera-intake/` | Validação de requisições de dispositivo e upload reservado pelo banco. |
| `supabase/functions/camera-maintenance/` | Remoção física de imagens expiradas por agendamento do servidor. |
| `supabase/migrations/20261109000100_camera_capture_pipeline.sql` | Credenciais privadas, RLS, fila, leases, consenso e movimentação transacional. |
| `ferramentas/administracao/agendar-limpeza-cameras.sql` | Agendamento com Vault, sem credenciais no fonte. |
| `ferramentas/testes/cameras/` | PostgreSQL descartável, migrations reais e verificações de isolamento. |
| `.github/workflows/verificar-camera.yml` | Compilação do firmware no Linux. |
| `ferramentas/compilacao/gerar-leitor-placas.mjs` | Executável Windows com modelos incluídos para o instalador. |

| `aplicativos/programa-empresa/formularios/formulario-camera.mjs` | Cadastro e edição: local, sentido, enquadramento, confiança e limite de fotos. |
| `aplicativos/programa-empresa/formularios/formulario-parear-camera.mjs` | Modelo explícito, Wi-Fi e emissão única da configuração de pareamento. |
| `aplicativos/programa-empresa/formularios/formulario-revisar-leitura.mjs` | Conferência da imagem, seleção de veículo e motivo da confirmação. |

O limite padrão é de 1.000 fotos por câmera em 24 horas corridas, ajustável de 1 a 10.000 no cadastro. O firmware envia até três fotos por passagem; heartbeat não consome a cota. Consulte ATIVAR_CAMERAS.md para implantação e homologação.

## Aparência e marca — versão 1.1.1

- Cada app tem seu próprio estilos/estilo-login.css e componentes/apresentacao-do-login.mjs: layout de acesso, apresentação e ilustração.
- Botões e campos são definidos em estilos/estilo-componentes.css; ajustes de páginas e faixas de resumo ficam em estilo-ajustes-visuais.css; menu e janela ficam em estilo-menu-e-janela.css. O foco de teclado é preservado.
- recursos/icone-aplicativo.svg é a fonte vetorial da marca; .png tem 512 px e .ico reúne 16/24/32/48/64/128/256 px. O build copia recursos/ para a saída de cada app.
- O ícone da janela fica em sistema/abrir-janela.cjs; o do instalador/executável e atalhos usa ferramentas/compilacao/gerar-instalador.mjs.
- A aparência foi conferida com serviços simulados; os ajustes visuais não implantam alterações na Vercel ou no Supabase por conta própria.
## Operação da frota — versão 1.2.0

| Onde | Responsabilidade |
|---|---|
| `ATUALIZAR_PEGANAFROTA_1_2.md` | Ordem de atualização do banco, painel e aplicativo; verificação de funcionamento. |
| `aplicativos/programa-empresa/formularios/apoio-operacoes.mjs` | Data e hora no fuso da empresa, números obrigatórios e atalhos pela ficha do veículo. |
| `aplicativos/programa-empresa/formularios/formulario-operacao-viagem.mjs` | Início, conclusão e interrupção; passagem opcional no pátio. |
| `aplicativos/programa-empresa/dados/paginar-colecao.mjs` | Envia pesquisa, filtros e página ao banco. |
| `aplicativos/programa-empresa/dados/identificar-comando.mjs` | Mantém um identificador estável quando a mesma gravação é reenviada. |
| `aplicativos/programa-empresa/dados/retomar-importacao.mjs` | Identifica o lote e guarda os números de linhas já confirmadas neste navegador. |
| `aplicativos/programa-empresa/dados/exportar-relatorios.mjs` | Prepara CSV para Excel, com valores numéricos e proteção contra fórmulas em textos. |
| `aplicativos/programa-empresa/componentes/linha-do-tempo-veiculo.mjs` | Mostra os eventos autorizados de um veículo em ordem. |
| `aplicativos/painel-administracao/telas/tela-recuperar-senha.mjs` | Recebe o link de recuperação e permite definir a senha nova. |
| `supabase/migrations/20261110*.sql` | Seis mudanças novas: reenvios, quilometragem, viagens, pátio, preventiva, consumo, consultas e importação. |
| `ferramentas/testes/evolucao/testar-banco.cjs` | Aplica as migrations e exercita as operações num banco descartável. |

