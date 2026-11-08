> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# Mudanças desta rodada

## 1. Confirmação ao sair — feito

O botão de sair, nos dois produtos, agora pergunta antes. O diálogo diz o que
acontece: dados não salvos se perdem e será preciso entrar de novo (no Admin
Web, com senha).

No Admin Web criei uma confirmação **simples**, separada da que já existia para
arquivar empresa — aquela exige digitar o nome do alvo. Pedir isso para sair
seria atrito sem proteção, e treinaria a pessoa a ignorar a confirmação que
importa de verdade.

## 2. Tela de login — feito

| Antes | Agora |
|---|---|
| Parágrafo corrido | Título curto: *"Sua frota inteira em um só lugar"* |
| — | Cinco tópicos com ícone |
| Rodapé "Desktop · janela mínima 1024×720" | **Removido** |

O rodapé era informação de especificação técnica; não serve a quem vai entrar.

## 3. Botão de exibir senha — feito

Ícone de olho dentro do campo, nos dois produtos. Preserva a posição do cursor
ao alternar — sem isso a pessoa perde o lugar no meio da digitação.

Digitar senha às cegas num teclado de pátio é a causa mais comum de bloqueio
por tentativas erradas.

## 4. Importação em massa — feito

**O item maior.** Cadastrar centenas de veículos um a um é inviável; a empresa
já tem os dados numa planilha.

Nova tela **Importar planilha**, com quatro tipos: **veículos, motoristas,
abastecimentos e locais**.

Fluxo em três passos:

1. **Baixar o modelo** — CSV pronto com as colunas certas e uma linha de
   exemplo. Elimina a adivinhação sobre nomes de coluna.
2. **Conferir** — a planilha é lida e validada **sem gravar nada**. Você vê
   quantas linhas passaram, quantas falharam, e o número da linha de cada erro
   para corrigir no arquivo.
3. **Importar** — só as linhas válidas, uma a uma, com contador ao vivo.

### Decisões

**CSV, não `.xlsx`.** Ler `.xlsx` exigiria uma biblioteca dentro do Electron.
Qualquer Excel, LibreOffice ou Google Planilhas exporta CSV em dois cliques, e
o arquivo é auditável a olho nu. A tela explica onde clicar.

**Linha a linha, não em bloco.** Uma linha ruim no meio de 300 não pode derrubar
as outras 299 — e você precisa saber exatamente qual falhou.

**Sempre com prévia.** Importação silenciosa que grava 300 registros errados é
pior que não ter importação.

O motor entende os formatos brasileiros: separador ponto e vírgula (padrão do
Excel em português), `1.234,56`, datas `31/12/2028`, BOM do Excel, e aspas com
vírgula dentro. **17 testes** cobrem esses casos.

Um dos testes pegou um defeito real: `"abc"` virava `0` depois da limpeza, e um
odômetro zerado entraria como valor válido.

## 5. Local no detalhe do veículo — feito

Novo cartão **"Onde está agora"**: situação (No pátio / Fora / Sem
movimentação), local atual, desde quando, e **qual será a próxima movimentação**
— o servidor calcula por alternância, e antecipar evita escolha errada.

Abaixo, as últimas seis movimentações com local e origem (Manual ou Câmera).

## 6. Câmera ESP32 — levantado

**O banco está pronto. Falta a porta de entrada.**

Já existem: tabela de câmeras, tabela de leituras de placa,
`register_plate_read` (que já trata confiança mínima, duplicidade e alternância
entrada/saída), `confirm_plate_read`, a origem `ocr` nas movimentações e as
permissões de câmera. A tela já mostra "Câmera" como origem.

Falta: um endpoint autenticado por **chave de dispositivo** — a RPC hoje só
aceita usuário logado, e uma câmera não faz login. Também falta decidir onde a
imagem fica e criar as telas de gestão de câmera.

O levantamento completo, com o contrato sugerido para o firmware, está em
`docs/CAMERA_ESP32_PRONTIDAO.md`.

## 7. `atividade is not defined` — corrigido

A função existia apenas em `v8.mjs`, que é **código morto** e não é importado
por ninguém. O arquivo em uso chamava sem definir: erro garantido ao abrir
qualquer veículo.

Recriada como `linhaAtividade()` no arquivo certo.

## 8. Relatórios — corrigido

A lista de rótulos cobria menos da metade das colunas; o resto caía no fallback
e aparecia como "Fuel cost", meio em inglês.

Mapeei **todas** as colunas dos quatro relatórios contra as funções do banco, e
adicionei formatação por tipo:

| Antes | Agora |
|---|---|
| `1234.5` | `R$ 1.234,50` |
| `2026-08-06T13:22:00Z` | `06/08/2026 13:22` |
| `in_maintenance` | `Em manutenção` |
| `2026-08` | `agosto de 2026` |
| `entry` | `Entrada` |

**O CSV agora sai em português** — cabeçalho com os rótulos e valores
formatados. Antes exportava o nome cru da coluna (`total_cost`) e o código
interno.

## 9. Log do histórico de alterações — removido

A tela e o item de menu saíram do Desktop.

**A trilha de auditoria continua sendo gravada no banco.** O que saiu foi o log
técnico do dia a dia — uma lista de ações internas que o operador de frota não
consegue interpretar e que competia por atenção com as telas que ele usa. A
consulta continua possível pelo banco, para quem tem motivo e credencial.

## 10. Cópia morta das telas — removida

`screens/v8.mjs` era uma **cópia inteira** de `screens/index.mjs`, com 802
linhas, que ninguém importava. O build já a apagava do artefato, então nunca
chegou ao cliente.

Não era inofensiva: **foi dela que veio o bug do item 7**. A função `atividade`
existia lá, o arquivo vivo a chamava sem definir, e quem procurasse no projeto
encontrava a definição — dando a impressão de que estava tudo certo.

Antes de apagar, verifiquei que o arquivo vivo satisfaz **todas** as asserções
que os 18 testes faziam contra a cópia. Os testes foram repontados para o
arquivo real, sem perda de cobertura: eles validavam código que não era
executado.

Um teste novo impede o retorno da duplicata.

---

## Verificações

```
lint                PASS
test:unit           PASS  157/157
test:contracts      PASS
verify:secrets      PASS
verify:no-cdn       PASS
verify:prototype    PASS
verify:boundaries   PASS
verify:electron     PASS
build:admin         PASS
build:desktop       PASS
smoke:desktop       PASS  9/9  (Electron real)
```

## Dois erros meus, encontrados ao testar

Rodar o aplicativo de verdade — e não só compilar — encontrou dois defeitos que
eu mesmo introduzi:

1. **`telaImportacao is not defined`.** Meu patch de import não casou com o
   bloco existente e não aplicou, em silêncio. Mesma classe do bug do item 7.
2. **`ui.mjs does not provide an export named 'tabela'`.** Assumi que o helper
   era exportado; é local de cada tela.

Os dois só apareceram com o Electron aberto. Compilar não basta.
