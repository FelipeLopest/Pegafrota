> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Automações de cadastro e importação em massa

## Objetivo

Evitar que empresas com dezenas ou centenas de veículos tenham de repetir o mesmo formulário manualmente. O Desktop oferece uma central **Importar planilha** e atalhos nas próprias telas de alto volume.

O arquivo é lido **localmente no Electron**. A planilha não é enviada para um serviço de terceiros: depois da prévia, cada registro válido usa as mesmas RPCs/Edge Functions e permissões do cadastro manual.

## Formas de entrada

- Excel `.xlsx` — primeira aba; o modelo oficial usa a aba `Dados`;
- CSV/TSV — separador `;`, `,` ou tab detectado automaticamente;
- copiar e colar células diretamente do Excel, incluindo o cabeçalho.

Cada tipo possui um botão **Baixar Excel** com modelo pronto e aba `Ajuda`, além de um modelo CSV.

## Cadastros automatizados

| Tipo | Uso em massa | Dependências importantes |
|---|---|---|
| Veículos | entrada inicial de frota, aquisições grandes | placa única; combustível válido |
| Motoristas | migração da base de condutores | documento interno, quando usado, deve ser único |
| Locais | pátios, filiais, garagens e pontos operacionais | nome obrigatório |
| Abastecimentos | importar cartão/posto/planilha histórica | veículo já cadastrado; odômetro e cronologia |
| Manutenções | criar agenda preventiva/corretiva | veículo já cadastrado |
| Viagens | planejar lote de rotas | veículo e motorista já cadastrados |
| Equipe | convidar muitos usuários | e-mail não pode estar na equipe; a senha nunca fica na planilha |

## Fluxo seguro

1. Escolher o tipo de cadastro.
2. Baixar o modelo Excel ou CSV (ou colar células).
3. Preencher e selecionar o arquivo.
4. O sistema normaliza cabeçalhos/formatos brasileiros e monta uma **prévia**.
5. Linhas inválidas não são enviadas. O usuário vê o número exato da linha e o motivo.
6. Só após **Importar N registros** começam as gravações.
7. O resultado mostra sucesso/falha por linha e permite baixar um CSV de erros.
8. Para corrigir, basta reenviar somente as linhas que falharam.

## Performance e limites

- XLSX: máximo de **20 MB**;
- importação: máximo de **10.000 linhas** por operação;
- cadastros independentes usam concorrência controlada para não fazer centenas de chamadas em série;
- abastecimentos são agrupados por veículo e, dentro de cada veículo, processados sequencialmente para preservar a cronologia do ledger de odômetro;
- a operação pode ser interrompida; registros já concluídos permanecem gravados.

Esses limites existem para manter o Electron responsivo e não transformar uma planilha equivocada em uma carga sem controle.

## Ordem recomendada para implantação de uma empresa nova

1. Locais (se houver muitos).
2. Veículos.
3. Motoristas.
4. Equipe de acesso.
5. Manutenções planejadas.
6. Viagens planejadas.
7. Abastecimentos/histórico, sempre respeitando a cronologia de cada veículo.

## O que não foi colocado no importador genérico

**Pátio/movimentações:** entrada e saída alteram o estado atual do veículo e têm sequência própria. Uma planilha fora de ordem poderia deixar o pátio incorreto.

**Ajustes de odômetro:** o ledger é imutável/auditável; correções precisam apontar motivo e relação com o evento original.

Esses dois casos só devem ganhar automação futura com um fluxo especializado de simulação/validação temporal, nunca com `INSERT` genérico.

## Arquivos de implementação

- `aplicativos/programa-empresa/telas/tela-importar-planilha.mjs` — UI, prévia, progresso e execução;
- `compartilhado/validacoes/validar-importacao.mjs` — modelos, aliases, normalização e validação;
- `compartilhado/validacoes/ler-planilha.mjs` — leitor XLSX local;
- `aplicativos/programa-empresa/importacao/modelos-de-planilha/` — modelos `.xlsx` oficiais;
- `aplicativos/programa-empresa/sistema/abrir-janela.cjs` — salvar modelo Excel pelo diálogo nativo;
- `aplicativos/programa-empresa/sistema/ponte-segura.cjs` — ponte IPC restrita para salvar o modelo.

Nenhuma `service_role` é exposta ao Desktop e nenhuma migration nova é necessária para essa funcionalidade.
