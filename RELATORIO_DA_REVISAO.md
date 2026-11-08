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
