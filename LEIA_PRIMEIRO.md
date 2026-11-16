## Atualização 1.2.2 — correções validadas em operação

Se já usa o PegaNaFrota, siga [o guia 1.2.2](ATUALIZAR_PEGANAFROTA_1_2_2.md). Atualize o banco e a função platform-admin antes da publicação do painel e do novo instalador.

## Atualização 1.2.0 — operação da frota

Esta versão revisa viagens, portaria, abastecimento, manutenção, relatórios, importação e acesso. **Se já usa o PegaNaFrota, siga `ATUALIZAR_PEGANAFROTA_1_2.md` antes de publicar o painel ou distribuir o instalador.** As novas migrations precisam estar aplicadas no Supabase. A câmera continua opcional.

## Acabamento visual — versão 1.1.1

O login dos dois aplicativos foi renovado com ilustrações e cartões de recursos. Botões, filtros, títulos, formulários, diálogos e navegação receberam ajustes de alinhamento; botões usam cores planas sem brilhos. Há um ícone próprio nos logins, favicons e configuração de janela/instalador Windows. Para ver a mudança no programa instalado, envie os fontes ao GitHub, gere o instalador atualizado e instale essa nova versão. No painel, a publicação ocorre após atualizar o repositório ligado à Vercel. Não há mudança de banco para os ajustes visuais desta versão; a integração de câmeras ainda exige a ativação descrita em ATIVAR_CAMERAS.md.

## Atualização 1.1.0: câmeras opcionais

A integração ESP32-S3 está no fonte, com fila privada no Supabase, leitor local e nova tela no Desktop. Antes de usá-la, siga ATIVAR_CAMERAS.md. É necessário aplicar a nova migration, implantar as novas funções, gerar o instalador atualizado e identificar o modelo físico da placa. Não grave um perfil de pinos por suposição. A operação manual continua disponível.

# Comece por aqui

Este pacote contém um único projeto com consulta de CNPJ, configuração pública incorporada, preparação para Vercel e geração do instalador Windows. Extraia em uma pasta nova para evitar que um .env antigo substitua a configuração incorporada.

## Desenvolvimento

Com Node.js 22 ou superior instalado, execute uma vez:

```powershell
npm ci
```

Para abrir o programa da empresa:

```powershell
npm run abrir:empresa
```

Para abrir o painel local:

```powershell
npm run compilar:painel
npm run abrir:painel
```

## Instalador e Vercel

Leia PUBLICAR_E_GERAR_APLICATIVO.md. O comando npm run gerar:instalador gera o instalador Windows. O workflow Gerar instalador Windows também permite fazer isso pela aba Actions do GitHub. A Vercel está configurada por vercel.json para hospedar somente o painel.

O pacote não requer recriar .env: configuracao-publica.json contém somente a URL e a chave pública anon do Supabase. Dados administrativos e SMTP não são incorporados. A autenticação e as permissões continuam sendo responsabilidade do Supabase.

O usuário final instala o .exe sem precisar instalar Node.js ou executar npm. O instalador atualizado e as novas funções de câmera ainda precisam ser gerados/implantados conforme os guias.

Guia dos arquivos: GUIA_DO_PROJETO.md. Consulta de CNPJ: CONSULTA_CNPJ.md.
