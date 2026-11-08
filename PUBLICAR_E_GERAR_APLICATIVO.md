# Gerar o aplicativo e publicar o painel

O aplicativo da empresa é Electron para Windows. O painel da administração é um site separado. Ambos usam o backend existente no Supabase. A Vercel hospeda somente o painel; ela não executa o Electron nem substitui o Supabase.

## Configuração incorporada

`configuracao-publica.json` contém somente a URL e a chave anon do projeto informado. Esse arquivo pode ser versionado e acompanha o aplicativo compilado. Não é necessário recriar `.env` para abrir ou compilar o sistema.

O cliente precisa ler esses dados, portanto a chave pública fica visível no instalador e no navegador. A segurança dos registros depende de autenticação, RLS e autorização das funções no Supabase. A configuração rejeita chaves service_role e sb_secret por engano, mas essa checagem local não substitui autorização no servidor.

Variáveis de ambiente PNF_SUPABASE_URL e PNF_SUPABASE_ANON_KEY têm prioridade sobre `.env`, que tem prioridade sobre o arquivo público. Se houver um `.env` antigo na pasta, seus valores continuam prevalecendo. Um `.env` não deve ser enviado ao GitHub ou à Vercel. Chaves administrativas e SMTP permanecem somente no backend.

## Abrir no computador de desenvolvimento

Com Node.js 22 ou superior instalado, execute uma vez na raiz:

```powershell
npm ci
```

Depois:

```powershell
npm run abrir:empresa
```

O usuário que receber o instalador não precisará de Node.js, npm, código-fonte ou `.env`. O aplicativo precisará de internet e do Supabase disponível.

## Gerar o instalador no seu Windows

```powershell
npm run gerar:instalador
```

O comando compila novamente o produto e gera `instaladores/PegaNaFrota-1.0.0-Instalador.exe` (a versão segue o package.json). Inclui somente o aplicativo da empresa e os dois campos públicos; não inclui o painel, as fontes do servidor ou `.env`. O instalador é para Windows x64 e permite escolher a pasta de instalação.

Sem certificado de assinatura de código configurado, o Windows pode mostrar um aviso de editor desconhecido. Nenhum certificado foi adicionado nesta entrega.

### Gerar pelo GitHub

Após enviar estes arquivos à raiz de `https://github.com/FelipeLopest/Pegafrota`:

1. Abra a aba **Actions** do repositório.
2. Escolha **Gerar instalador Windows**.
3. Clique em **Run workflow**.
4. Aguarde o resultado. Abra a execução concluída e baixe o arquivo em **Artifacts → PegaNaFrota-Instalador-Windows**.
5. Extraia o artefato e distribua o `.exe`.

A ação é manual e não publica uma release automaticamente. O arquivo da ação está em `.github/workflows/gerar-instalador.yml`. Para gerar outra versão, ajuste a versão em `aplicativos/programa-empresa/package.json` e mantenha o lockfile consistente.

## Publicar o painel na Vercel

1. Envie a versão atualizada à raiz do repositório **FelipeLopest/Pegafrota**, incluindo os arquivos ocultos `.github`, `.vercelignore` e o `vercel.json`. Não crie outra pasta PegaNaFrota_Reorganizado dentro do repositório.
2. Na Vercel, abra **Add New → Project**, conecte sua conta do GitHub e importe esse repositório.
3. Use **Root Directory: raiz do repositório** e **Framework Preset: Other**. Mantenha o Node.js 22.
4. O `vercel.json` define o comando `npm run compilar:vercel` e dispensa instalar Electron para esse build estático. Não configure um Output Directory manual: o comando gera a estrutura `.vercel/output` do Build Output API.
5. Não é necessário cadastrar a chave anon como segredo: ela já está no arquivo público. Se quiser usar outro Supabase, defina PNF_SUPABASE_URL e PNF_SUPABASE_ANON_KEY nas variáveis do projeto Vercel e faça novo deploy. Nunca configure service_role no frontend.
6. Clique em **Deploy** e anote o endereço HTTPS definitivo do painel.

O build entrega apenas arquivos estáticos do painel e gera cabeçalhos CSP, bloqueio de frames, política de referência e proteção de tipos de conteúdo. A consulta de CNPJ permanece autorizada na CSP. As rotas atuais usam `#/...` e não exigem um redirecionamento geral que mascare arquivos ausentes.

## Autorizar o domínio no Supabase

Depois de obter o endereço definitivo da Vercel:

- Nas configurações/secrets das Edge Functions do Supabase, ajuste **ADMIN_WEB_ORIGINS** para incluir a origem exata, por exemplo `https://seu-painel.vercel.app`. Para manter o painel local, use uma lista separada por vírgula: `http://localhost:5174,https://seu-painel.vercel.app`.
- O arquivo `.env` local não altera os secrets das funções já implantadas. A mudança deve ser feita no projeto remoto correto.
- Nas configurações de URL do Supabase Auth, confira Site URL e Redirect URLs dos fluxos web de convite/recuperação usados pelo painel. Configure a URL real do painel e os redirecionamentos necessários aos fluxos existentes. Convites de equipe do Desktop continuam tendo seu fluxo separado.
- Se usar convites de administradores da plataforma, ajuste também a configuração remota **INVITE_BASE_URL** para o painel e confira o serviço de e-mail já existente.
- Use o domínio definitivo para testar o painel. URLs de Preview diferentes precisam de autorização própria; não abra CORS para qualquer origem.

As migrations e Edge Functions existentes precisam estar implantadas. Este pacote não executa migrações ou altera permissões remotamente.

## Verificação após publicar

Abra o painel, entre com um administrador da plataforma e teste a listagem de empresas e a consulta de CNPJ. No aplicativo instalado, entre com um usuário da empresa e confira as telas de frota. Sem login autorizado, a publicação do painel não deve conceder acesso aos dados.

Foram validadas localmente a compilação dos produtos, a saída da Vercel sem `.env`, os testes do projeto e a separação dos dados públicos. O instalador não foi gerado neste ambiente porque o Windows bloqueou a instalação de dependências com EPERM. O workflow do GitHub ainda precisa ser executado na sua conta; o deploy Vercel e a homologação no banco real também continuam pendentes.

Referências: [chaves do Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [Build Output API da Vercel](https://vercel.com/docs/build-output-api/configuration), [electron-builder v26](https://www.electron.build/v26/docs/configuration/).
