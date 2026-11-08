> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Matriz de comparação visual — 26/26 rotas

Gerada por `npm run visual` (`visual:routes` + `visual:similarity`).

| | Valor |
|---|---|
| Rotas na matriz | **26** (17 Desktop + 9 Admin Web) |
| Rotas com par A/B medido | **21** |
| Rotas sem tela equivalente no menu do protótipo | 5 |
| Pares medidos | **98** |
| Estrutura média | **0.949** |
| Estrutura mínima | **0.839** |
| Resultado | **98/98 acima do mínimo (0,80)** |

Larguras: **1280 · 1440 · 1920**. Temas: **Claro · Escuro**.

## Como a medida funciona

**pixelmatch**, limiar de cor 0,12 — informa, não decide. Protótipo e
implementação mostram dados diferentes; exigir igualdade de pixels reprovaria
composições corretas.

**Assinatura estrutural**, grade 24×16: cada bloco vira média de luminância,
classificada em escuro / médio / claro; compara-se a CLASSE. É o que distingue
"card centralizado" de "split com painel escuro".

**Mínimo 0,80**, calibrado com casos reais: o Admin Login media 0,216–0,326
antes da correção e 0,938–0,961 depois; o Pátio media 0,768 antes e 0,927
depois.

## Desktop — 17 rotas

| Rota | Pares A/B | Larguras × temas | Estrutura mín. | Resultado |
|---|---|---|---|---|
| `abastecimentos` | 5 | 1920 claro, 1280 claro, 1440 claro, 1280 escuro, 1440 escuro | 0.930 | aprovado |
| `auditoria` | 5 | 1440 claro, 1920 claro, 1280 claro, 1280 escuro, 1440 escuro | 0.940 | aprovado |
| `dashboard` | 5 | 1280 claro, 1920 claro, 1440 claro, 1280 escuro, 1440 escuro | 0.872 | aprovado |
| `empresa` | 5 | 1920 claro, 1440 claro, 1280 claro, 1440 escuro, 1280 escuro | 0.940 | aprovado |
| `locais` | 5 | 1920 claro, 1440 claro, 1280 claro, 1440 escuro, 1280 escuro | 0.940 | aprovado |
| `login` | 5 | 1280 escuro, 1440 escuro, 1280 claro, 1440 claro, 1920 claro | 0.914 | aprovado |
| `manutencoes` | 5 | 1920 claro, 1280 claro, 1440 claro, 1280 escuro, 1440 escuro | 0.930 | aprovado |
| `motoristas` | 5 | 1440 claro, 1920 claro, 1280 claro, 1440 escuro, 1280 escuro | 0.932 | aprovado |
| `movimentacoes` | — | — | — | sem par no menu do protótipo |
| `odometro` | — | — | — | sem par no menu do protótipo |
| `patio` | 5 | 1440 claro, 1920 claro, 1280 claro, 1440 escuro, 1280 escuro | 0.927 | aprovado |
| `perfil` | 5 | 1280 claro, 1920 claro, 1440 claro, 1280 escuro, 1440 escuro | 0.940 | aprovado |
| `relatorios` | 5 | 1280 claro, 1440 claro, 1920 claro, 1280 escuro, 1440 escuro | 0.938 | aprovado |
| `usuarios` | 5 | 1440 claro, 1920 claro, 1280 claro, 1440 escuro, 1280 escuro | 0.940 | aprovado |
| `veiculo-detalhe` | — | — | — | sem par no menu do protótipo |
| `veiculos` | 5 | 1440 claro, 1920 claro, 1280 claro, 1280 escuro, 1440 escuro | 0.935 | aprovado |
| `viagens` | 5 | 1440 claro, 1280 claro, 1920 claro, 1280 escuro, 1440 escuro | 0.891 | aprovado |

## Admin Web — 9 rotas

| Rota | Pares A/B | Larguras × temas | Estrutura mín. | Resultado |
|---|---|---|---|---|
| `administradores` | 4 | 1920 claro, 1280 claro, 1440 claro, 1440 escuro | 0.945 | aprovado |
| `auditoria` | 4 | 1920 claro, 1280 claro, 1440 claro, 1440 escuro | 0.945 | aprovado |
| `dashboard` | 4 | 1920 claro, 1280 claro, 1440 claro, 1440 escuro | 0.940 | aprovado |
| `empresa-detalhe` | — | — | — | sem par no menu do protótipo |
| `empresas` | 4 | 1440 claro, 1280 claro, 1920 claro, 1440 escuro | 0.943 | aprovado |
| `login` | 4 | 1920 claro, 1280 claro, 1440 claro, 1440 escuro | 0.839 | aprovado |
| `nova-empresa` | — | — | — | sem par no menu do protótipo |
| `perfil` | 4 | 1280 claro, 1440 claro, 1920 claro, 1440 escuro | 0.935 | aprovado |
| `provisionamentos` | 4 | 1920 claro, 1280 claro, 1440 claro, 1440 escuro | 0.945 | aprovado |

## Correções feitas nesta rodada

| Tela | Diferença | Correção |
|---|---|---|
| **Admin Login** | Card central; o Design usa split com painel institucional | Split 16fr/9fr, marca "PegaNaFrota Admin", kicker "AMBIENTE ADMINISTRATIVO", hero, rodapé de acesso restrito, botão "Continuar", card removido |
| **Desktop Pátio** | Grade de cartões de veículo; o Design usa indicadores + histórico + presença | 4 KPIs, histórico de movimentações à esquerda, presença no pátio à direita com a **próxima** movimentação calculada |
| **Desktop Login** | Card central (corrigido na rodada anterior) | Split 50/50, painel escuro, "Manter conectado", "Esqueci minha senha" |

## Rotas sem par no menu do protótipo

`desktop/movimentacoes`, `desktop/odometro`, `desktop/veiculo-detalhe`,
`admin/empresa-detalhe`, `admin/nova-empresa`.

No protótipo essas telas são alcançadas **de dentro** de outras (Pátio, Veículo,
lista de Empresas) e não têm item próprio de menu. Têm captura da implementação
em `implementation/`, e estão declaradas aqui como sem par — comparar contra uma
tela parecida e chamar de aprovado seria pior do que registrar a ausência.

## Quatro defeitos do harness corrigidos no caminho

Cada um produzia medida falsa, não erro visível:

1. **`\s` consumido em dois níveis** de escape virava a letra "s" literal: o
   normalizador apagava o "s" dos rótulos e só casavam itens sem essa letra.
2. **Fluxo de entrada do Admin** tem três passos (senha, segundo fator,
   carregamento). Clicando só o primeiro, a navegação interna nem existia.
3. **`platform_admin` sem profile ativo**: `is_platform_admin` retornava falso e
   as seis rotas do Admin capturavam "Sem acesso ao painel" — daí o 0,263
   idêntico em todas.
4. **Seletor JANELA do protótipo** ficava em 1440×900: a captura a 1920 mostrava
   um app de 1440 centralizado com faixas escuras, e a medida comparava moldura.
5. **Tema do Desktop** vinha da ponte IPC e sobrescrevia o atributo injetado —
   as capturas "escuras" saíam claras.

## Limites declarados

**Tipografia.** Inter e JetBrains Mono vêm do Google Fonts, bloqueado neste
ambiente. Os dois lados caem na mesma fonte de sistema: tamanho, peso e
espaçamento são comparáveis; o **desenho da letra não é**.

**Tema Sistema.** Capturados Claro e Escuro. "Sistema" resolve para um dos dois
conforme o sistema operacional — capturá-lo produziria imagem idêntica a uma já
capturada. A resolução tem cobertura em teste unitário.

**Estados internos.** A comparação cobre o estado "com dados" de cada rota. Os
estados de carregando, vazio, erro, offline e conflito existem na implementação
e têm cobertura funcional no E2E, mas **não** foram comparados lado a lado.

**A medida não aprova sozinha.** As 98 imagens de diferença ficam em `diff/`
para revisão. Estrutura alta significa "a composição bate", não "aprovado pelo
Design".
