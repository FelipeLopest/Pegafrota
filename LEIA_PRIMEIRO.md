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

O usuário final instala o .exe sem precisar instalar Node.js ou executar npm. O instalador e o deploy remoto ainda precisam ser gerados/executados conforme o guia.

Guia dos arquivos: GUIA_DO_PROJETO.md. Consulta de CNPJ: CONSULTA_CNPJ.md.
