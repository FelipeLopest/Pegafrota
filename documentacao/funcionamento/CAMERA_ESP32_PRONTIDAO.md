> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# O sistema está pronto para receber a câmera ESP32?

**Resposta curta: o banco está pronto. Falta uma peça de rede — o caminho pelo
qual a câmera envia a leitura.**

Este documento é o levantamento do que já existe, do que falta e do que decidir
antes de escrever a primeira linha do firmware.

---

## 1. O que já está pronto no banco

Tudo isto já existe, com testes, e **não precisa ser criado**:

| Peça | O que faz |
|---|---|
| `public.cameras` | cadastro da câmera: local, direção (entrada/saída/ambas), ativa |
| `public.plate_read_events` | cada leitura: texto bruto, placa normalizada, confiança, horário, imagem |
| `public.register_plate_read(...)` | recebe a leitura, normaliza, procura o veículo e **cria a movimentação** |
| `public.confirm_plate_read(...)` | resolve manualmente uma leitura que o sistema não conseguiu casar |
| `movement_source` = `manual` \| `ocr` | a movimentação sabe se veio de pessoa ou de câmera |
| Permissões `cameras.read`, `cameras.write` | já na matriz de papéis |

A tela do Desktop já exibe a origem: uma movimentação vinda da câmera aparece
como **"Câmera"**, e uma digitada aparece como **"Manual"**.

### O que a RPC já resolve sozinha

`register_plate_read` não é um simples "grava o que chegou". Ela já trata:

- **Confiança mínima** — leitura duvidosa não vira movimentação automática;
  fica pendente para alguém confirmar.
- **Duplicidade** — a mesma placa lida três vezes em cinco segundos (o caminhão
  passando devagar) vira **uma** movimentação, não três. É a janela de
  `dedup_window_seconds`.
- **Entrada ou saída** — o servidor calcula por alternância, a partir da última
  movimentação daquele veículo. A câmera **não** decide isso, e é melhor assim:
  ela não tem como saber o histórico.
- **Placa desconhecida** — a leitura é guardada como pendente em vez de ser
  descartada. Alguém confirma depois pelo `confirm_plate_read`.

Nada disso precisa ser reimplementado no firmware.

---

## 2. O que falta

### 2.1 O caminho de rede — a peça que falta de verdade

Hoje `register_plate_read` só pode ser chamada por **`authenticated`**, ou seja,
por alguém logado com e-mail e senha. Uma câmera não faz login numa tela.

Existem três caminhos, e a escolha não é indiferente:

| Caminho | Como funciona | Avaliação |
|---|---|---|
| **A. Edge Function com chave de dispositivo** | a câmera envia `POST` com uma chave própria; a função valida e chama a RPC com `service_role` | **Recomendado.** A chave pertence à câmera, é revogável sozinha, e a câmera nunca toca no banco |
| B. Conta de serviço por empresa | criar um usuário "câmera" e guardar a senha no firmware | Ruim: a senha vira credencial de usuário comum; quem extrair o firmware entra no sistema |
| C. Chave anon direto na câmera | a câmera chama a RPC com a chave pública | **Não.** A RPC exige `authenticated`; e mesmo que não exigisse, seria uma porta aberta |

O caminho A exige criar:

1. Uma tabela `camera_credentials` com o **hash** da chave (nunca a chave), a
   câmera dona, e data de revogação — o mesmo desenho já usado nos convites.
2. Uma Edge Function `camera-intake` que recebe a leitura, confere a chave,
   descobre de qual câmera é, e chama `register_plate_read`.
3. Uma tela no Desktop para gerar e revogar a chave de cada câmera.

É trabalho de uma entrega própria, não de um ajuste.

### 2.2 Onde a imagem fica

A coluna `image_reference` guarda uma **referência**, não a imagem. Falta
decidir onde o arquivo mora — Supabase Storage é o caminho natural — e criar o
bucket com política de acesso por empresa.

Sem isso, uma leitura errada não pode ser auditada: ninguém vai saber se a
câmera leu mal ou se o veículo era outro mesmo.

### 2.3 Telas de câmera no Desktop

Não existem ainda:

- cadastro de câmera (nome, local, direção);
- lista de leituras pendentes, para confirmar as que o sistema não casou;
- indicador de câmera fora do ar.

A terceira importa mais do que parece: uma câmera muda deixa de registrar
movimentações **sem nenhum erro visível**. O pátio parece parado quando na
verdade o sistema está cego.

---

## 3. Contrato sugerido para o firmware

Quando a Edge Function existir, o firmware envia:

```json
POST /functions/v1/camera-intake
Authorization: Bearer <chave-da-camera>

{
  "capturedAt": "2026-08-06T13:22:41Z",
  "rawText": "ABC1D23",
  "confidence": 0.93,
  "engineVersion": "esp32-ocr-1.0.0",
  "clientEventId": "cam01-000148",
  "frameHash": "sha256:...",
  "imageReference": "leituras/2026/08/06/cam01-000148.jpg"
}
```

Dois campos merecem atenção no firmware:

**`clientEventId`** — identificador que a própria câmera gera e **não repete**.
É o que permite reenviar depois de uma queda de rede sem duplicar movimentação.
Sem ele, um reenvio vira uma segunda entrada do mesmo caminhão.

**`capturedAt`** — o horário em que a leitura aconteceu, não o do envio. Se a
rede cair por dez minutos e a câmera enviar tudo junto depois, o horário
correto é o da captura. Isso exige que o ESP32 tenha relógio sincronizado por
NTP; sem isso, o histórico do pátio fica desordenado.

**Fila local no dispositivo.** A câmera precisa guardar as leituras enquanto a
rede estiver fora e reenviar depois. Sem fila, toda queda de conexão vira buraco
no histórico — e é justamente durante um problema de rede que ninguém está
olhando o pátio.

---

## 4. Resumo

| Camada | Estado |
|---|---|
| Modelo de dados | **pronto** |
| Regras de negócio (dedup, alternância, confiança) | **prontas** |
| Exibição no Desktop | **pronta** (origem "Câmera" já aparece) |
| Autenticação do dispositivo | **falta** |
| Endpoint de recepção | **falta** |
| Armazenamento de imagem | **falta decidir** |
| Telas de gestão de câmera | **faltam** |

A parte difícil — que é a lógica de negócio — está feita e testada. O que falta
é a porta de entrada, e ela deve ser construída como Edge Function com chave por
dispositivo, para que a câmera nunca receba credencial de usuário.
