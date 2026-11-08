> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# PegaNaFrota v16.6 — Performance e conectividade

Esta versão corrige falsos positivos de indisponibilidade do servidor e reduz o tempo de carregamento das telas sem remover funcionalidades.

## Conectividade

- Electron e Admin deixaram de transformar falhas comuns de requisição em estado offline global.
- A disponibilidade do backend é confirmada por uma sondagem dedicada do endpoint de saúde do Supabase Auth.
- São necessárias falhas consecutivas da sondagem antes de exibir o aviso.
- Qualquer resposta HTTP válida de uma chamada normal ou da sondagem restabelece o estado online.
- `AbortError` de navegação/requisição cancelada não é tratado como queda do servidor.
- O estado é verificado novamente quando o shell inicia, evitando banner antigo preso na interface.

## Performance do Electron

- leituras repetidas usam cache curto em memória e deduplicação de requisições em andamento;
- mutações invalidam apenas os caches relacionados;
- dependências independentes das telas são carregadas com `Promise.all`;
- histórico paginado continua completo, porém as páginas posteriores são buscadas em lotes concorrentes;
- Pátio baixa apenas as movimentações recentes realmente exibidas;
- detalhes de veículo e motorista usam contagem exata + amostras recentes, em vez de baixar o histórico inteiro;
- resultados de uma tela anterior são ignorados quando o usuário navega antes do carregamento terminar;
- animações foram encurtadas para reduzir latência percebida;
- `screens/v8.mjs` permanece no código-fonte para regressão histórica, mas deixa de ser copiado para o build final por não ser usado pelo produto.

## Performance do Admin

- a checagem inicial de acesso e o primeiro dashboard reutilizam a mesma resposta por alguns segundos;
- requisições simultâneas do dashboard são deduplicadas;
- carregamentos antigos são descartados após mudança de rota;
- animações foram encurtadas.

## Backend

Nenhuma migration, tabela, RPC ou Edge Function foi alterada nesta versão. Não é necessário `db push` nem redeploy das funções por causa da v16.6.
