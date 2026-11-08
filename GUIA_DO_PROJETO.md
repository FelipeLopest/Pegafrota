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
