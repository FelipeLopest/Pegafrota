# Câmera ESP32-S3 no PegaNaFrota 1.1.0

## O que esta versão entrega

O fluxo implementado é: câmera captura JPEG por Wi-Fi → Supabase autentica o dispositivo e guarda uma imagem privada → aplicativo Windows busca o trabalho → leitor local reconhece a placa → banco confere frota, confiança, repetição e presença → movimentação ou revisão manual.

Não é necessário contratar uma API de OCR. O motor e os modelos acompanham o instalador gerado pelo GitHub. As capturas usam Storage, banco e Edge Functions do seu Supabase e consomem as cotas de armazenamento e transferência desse serviço.

**Há uma configuração inicial obrigatória:** identificar a placa, gravar o firmware correto, informar o Wi-Fi, parear a câmera e calibrar o enquadramento. Não é possível escolher pinos com segurança sabendo apenas “ESP32-S3”. Depois dessa preparação, o fluxo funciona com o computador ligado, o aplicativo aberto e logado e o monitoramento ativo.

Esta integração registra o pátio; não controla relé, portão ou cancela. A operação manual continua disponível sem câmera, sem leitor instalado e sem monitoramento.

## 1. Atualizar o projeto

Extraia o ZIP em uma pasta nova, com uma única raiz PegaNaFrota_Reorganizado. Envie os arquivos dessa raiz ao seu repositório, preservando a estrutura. Inclua as pastas ocultas .github e os arquivos de configuração; não envie pareamentos, senhas ou .env.

O painel Vercel continua separado e não é responsável pelo processamento das imagens. A nova tela **Câmeras e leituras** pertence ao aplicativo Desktop da empresa.

## 2. Atualizar o backend existente

Em um ambiente de teste do seu projeto Supabase, aplique **somente a nova migration**:

`supabase/migrations/20261109000100_camera_capture_pipeline.sql`

O arquivo usa uma transação e depende das migrations anteriores já existentes no seu sistema. Não execute novamente todas as migrations no SQL Editor sobre um banco já instalado. Depois de conferir a atualização no ambiente de teste e o backup do projeto, aplique a mesma migration na produção. Se seu histórico de migrations for gerenciado pelo CLI e estiver sincronizado, o fluxo normal de migrations do projeto também pode ser usado.

Ela acrescenta configurações às câmeras, credenciais privadas, fila, políticas de acesso, armazenamento privado e funções específicas de ingestão/processamento. As 49 migrations anteriores não foram reescritas; as movimentações e o odômetro existentes não são substituídos.

Depois implante as duas novas Edge Functions, na raiz do projeto vinculado ao Supabase:

```powershell
npx supabase login
npx supabase link --project-ref jnznizrtbivrvqkskcep
npm run deploy:cameras
```

Se usar outro projeto para homologação, troque o project-ref e a configuração pública do aplicativo de teste. O login e a vinculação são feitos por você com sua conta administrativa; não é necessário colocar chave privilegiada no aplicativo.

- `camera-intake` tem verify_jwt=false **somente porque autentica a chave de dispositivo no próprio endpoint**. Uma requisição sem chave válida é recusada. Não altere a verificação de JWT das funções administrativas existentes.
- `camera-maintenance` tem verify_jwt=true e aceita somente a credencial do servidor. Sua chave administrativa permanece no Supabase.
- Não é necessário ampliar ADMIN_WEB_ORIGINS para a câmera. A câmera chama o endpoint nativo; ele não é uma API aberta de navegador.

## 3. Configurar a retenção de imagens

O bucket `camera-captures` é privado. Uma empresa só pode ler suas próprias capturas, com usuário autorizado, e a política encerra o acesso após 24 horas. Não transforme o bucket em público.

Para remover os arquivos fisicamente, configure a manutenção a cada cinco minutos. No Vault do projeto Supabase, crie:

- `pnf_camera_project_url`: URL HTTPS do Supabase, sem barra no fim.
- `pnf_camera_service_key`: chave **service_role legada do mesmo projeto**, correspondente à credencial injetada em SUPABASE_SERVICE_ROLE_KEY na Edge Function. Não use a chave anon nem coloque essa chave no Git, no firmware ou no aplicativo.

Com as funções já implantadas, execute no SQL Editor:

`ferramentas/administracao/agendar-limpeza-cameras.sql`

O agendamento chama a manutenção pelo servidor. A rotina remove imagens vencidas e marca a remoção apenas depois do sucesso da API Storage. Também recolhe imagens de câmeras/empresas excluídas e retoma lotes restantes na execução seguinte. Confira as execuções no Cron e nos logs da função; sem agendamento ativo não há garantia de remoção física automática. Com execução normal e sem acúmulo de lotes, as imagens ficam armazenadas aproximadamente 24 horas a 24 horas e cinco minutos; metadados da fila duram aproximadamente 30 dias. Se houver acúmulo, confirme que os lotes de manutenção conseguem acompanhar o volume antes de aumentar a quantidade de câmeras. Os registros de negócio e auditoria existentes seguem suas regras próprias.

Referência: https://supabase.com/docs/guides/functions/schedule-functions

## 4. Gerar o instalador atualizado

No GitHub: **Actions → Gerar instalador Windows → Run workflow**. A ação instala Python 3.12 para a compilação, executa os testes da câmera, gera o leitor local com seus modelos e inclui tudo no instalador **PegaNaFrota-1.1.1-Instalador.exe**.

O usuário final não instala Python, npm ou modelos separadamente. O processamento não abre um servidor na rede do Windows: a comunicação entre o aplicativo e o leitor usa um canal local entre processos.

Para desenvolver/compilar no seu Windows:

```powershell
npm ci
python -m pip install -r servicos/leitor-placas/requirements.txt
npm run compilar:leitor
npm run gerar:instalador
```

Use Python 3.12. Se houver várias versões, PNF_PYTHON pode apontar para o executável Python usado na compilação. O gerador não cria silenciosamente um instalador sem leitor quando esse componente estiver faltando.

## 5. Identificar a placa e verificar o firmware

Os perfis incluídos são:

- Espressif ESP32-S3-EYE → `esp32s3-eye`.
- Seeed XIAO ESP32S3 Sense → `xiao-esp32s3-sense`.

**Uma ESP32-S3 genérica, Freenove ou outra placa não deve usar um desses perfis por suposição.** Nesses casos é necessário conferir o esquema oficial e acrescentar os pinos em `dispositivos/esp32-s3/peganafrota-camera/perfis_camera.h` antes de gravar. O firmware recusa pareamento com perfil desconhecido e exige PSRAM.

O código está em `dispositivos/esp32-s3/peganafrota-camera/`. Use Arduino-ESP32 3.3.4 e ArduinoJson 7.4.2. O workflow **Verificar firmware ESP32-S3** compila no Linux com suporte a PSRAM OPI e flash de 8 MB. Esse perfil de compilação corresponde às duas placas listadas; outras placas podem exigir outro tipo de PSRAM, tamanho de flash e configuração de USB.

Na máquina desta revisão, a ferramenta de compilação C++ da Espressif falhou ao iniciar com “Illegal System DLL Relocation”. Portanto, o firmware **ainda precisa concluir o workflow de compilação e ser validado na placa real**. Nenhum binário de câmera é apresentado como homologado.

## 6. Cadastrar e parear uma câmera

1. Entre no aplicativo como administrador da empresa ou gestor com permissão para câmeras.
2. Abra **Câmeras e leituras → Cadastrar câmera**.
3. Escolha um local ativo e o sentido observado: entrada, saída ou ambos. Mantenha inicialmente **movimentação automática desativada**.
4. Defina o limite de fotos (padrão 1.000 em 24 horas corridas; ajustável de 1 a 10.000). Cada passagem gera até três fotos e consome armazenamento/transferência no Supabase. O heartbeat não consome a cota. Defina o enquadramento. A área usa quatro números entre 0 e 1: esquerda, topo, direita, base. Exemplo: `0.15,0.35,0.85,0.75`. Use ponto nos decimais. Esse recorte também é enviado à câmera no heartbeat para limitar a detecção de movimento à região relevante.
5. Clique em **Parear câmera** e selecione o modelo exato. Informe a rede Wi-Fi de 2,4 GHz e sua senha.
6. Gere a chave/configuração. O texto exibido começa com `CONFIG ` e é uma única linha JSON. A chave só é exibida nessa operação; uma nova chave invalida a anterior.
7. Com o firmware gravado e a placa ligada ao USB, abra o Monitor Serial a 115200, com final de linha, e envie essa linha uma vez.
8. O firmware salva a configuração e reinicia sem imprimir as credenciais. Aguarde o estado online no aplicativo.

O arquivo de pareamento contém a senha Wi-Fi e a chave da câmera. Guarde-o como credencial; não o coloque no repositório. As entradas `.gitignore` protegem o nome padrão do arquivo, mas não substituem essa conferência.

Sem modelo conhecido, câmera ou PSRAM funcionando, não há motivo para habilitar a automação. O pareamento não dispensa a gravação inicial do firmware nem identifica fisicamente a placa por conta própria.

## 7. Calibrar e ativar

1. Mantenha o computador ligado e entre com um usuário com permissão `ocr.operate`.
2. Clique em **Ativar monitoramento**. A escolha é lembrada por empresa e retomada no próximo login autorizado.
3. Posicione a câmera em um ponto de passagem lenta. Confira foco, distância, iluminação e ausência de reflexos. Use a área de reconhecimento para não juntar placas de veículos diferentes.
4. No Monitor Serial, o comando `CAPTURAR` gera uma rajada de teste. As passagens normais são detectadas por mudança de imagem, sem sensor adicional.
5. Abra **Ver imagem** e confira as leituras sugeridas. Teste entradas, saídas, placas antigas e Mercosul, erro de leitura e falta de rede.
6. Confira a presença inicial no Pátio: registre manualmente os veículos que já estão dentro. A primeira movimentação continua sendo uma entrada, conforme a regra existente.
7. Só depois habilite o registro automático para uma câmera de **um único sentido**. Uma câmera em “ambos” continua em revisão manual: o sistema não inventa a direção a partir de uma única fotografia.

A automação exige duas capturas distintas e concordantes da mesma passagem, confiança mínima e placa válida da frota. Uma primeira captura ruim pode ser superada por duas boas seguintes. Placas conflitantes, cenas com múltiplas placas, leitura duvidosa ou captura atrasada ficam para revisão. Um veículo já dentro não recebe outra entrada automática pela mesma câmera de entrada; o equivalente vale para saída.

A detecção simples de movimento não substitui um sensor dedicado nem garante capturar todo veículo em trânsito rápido. O uso previsto é portaria de passagem lenta, com enquadramento calibrado. A confiança do OCR não é uma probabilidade certificada de acerto.

## 8. Falhas e recuperação

- Sem Wi-Fi: há fila local limitada a seis fotos ou ao espaço disponível. Os reenvios mantêm seus identificadores, inclusive após reiniciar. Sem relógio sincronizado no boot, não são criados registros com horário inventado.
- Sem computador/monitoramento: a fila no backend é limitada a 30 trabalhos pendentes recentes por câmera. A câmera reduz o ritmo diante de limites; não há fila infinita.
- Captura pendente por mais de 15 minutos: expira. Não será convertida tardiamente em movimentação automática. Confira o pátio manualmente após uma interrupção.
- Reconhecimento travado: a reivindicação do trabalho expira e pode ser retomada, com limite de tentativas. Uma resposta antiga não pode concluir o trabalho de outro processamento.
- Câmera sem comunicação recente: o aplicativo mostra o estado depois de 90 segundos. Estados de erro do dispositivo também aparecem.
- Revogar chave: bloqueia novas capturas. Gerar outra chave exige atualizar o pareamento USB. Reparear apaga a fila antiga para não enviar fotos antigas a outra câmera/empresa.
- O comando USB `FORMATAR_FILA` apaga explicitamente as fotos pendentes; use apenas para recuperação consciente do dispositivo.
- Revisão exige veículo e motivo. Captura com imagem removida ou fora do prazo não pode ser confirmada: use o registro manual do Pátio com observação.
- Ao sair da conta ou desligar o monitoramento, o aplicativo encerra o leitor e não aplica respostas atrasadas de outra sessão.

## Validação desta entrega

Testes do sistema, fila/autorização no PostgreSQL isolado com todas as migrations, recepção HTTP, IPC do leitor, interface no Chrome com APIs simuladas e OCR real sobre imagens geradas para teste. O executável Windows do leitor foi gerado e reconheceu uma dessas imagens.

Não foram realizados: teste na sua câmera física, avaliação de taxa de acerto com placas reais, compilação concluída do firmware neste Windows, novo instalador completo nesta sessão, implantação no seu Supabase ou teste de ponta a ponta entre hardware, nuvem e aplicativo instalado. Os workflows e os passos acima fazem parte da ativação e homologação.

O sistema continua operável manualmente sem câmera. Não habilite automação antes de completar a homologação do seu local e identificar a placa correta.
