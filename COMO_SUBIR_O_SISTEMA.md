# Como executar o PegaNaFrota

1. Extraia o pacote e abra um terminal na pasta que contém `package.json`.
2. Use Node.js 22 ou superior e execute `npm ci`. Isso instala as dependências das mesmas versões do lockfile; não é necessário instalar pacotes dentro de cada aplicativo.
3. Este pacote unificado já preserva seu `.env` na raiz. Em uma instalação sem configuração existente, copie `.env.example` para `.env`. Preencha `PNF_SUPABASE_URL` e `PNF_SUPABASE_ANON_KEY` com a configuração pública do seu projeto Supabase. Nunca coloque a chave privilegiada nesses campos.
4. O backend precisa ter as migrations e as funções da versão compatível já aplicadas. A reorganização não aplica mudanças ao banco automaticamente.

## Programa da empresa

```powershell
npm run abrir:empresa
```

O comando compila e abre o Electron. O primeiro administrador e os demais usuários continuam usando os fluxos de acesso existentes. A opção “Manter conectado” agora controla a persistência protegida da sessão.

## Painel da administração

```powershell
npm run compilar:painel
npm run abrir:painel
```

Abra o endereço informado pelo servidor local. Para publicar, use o conteúdo de `aplicativos/painel-administracao/dist/`, não a pasta de fontes.

## Verificações locais

```powershell
npm run compilar
npm run lint
npm run testar
npm run test:edge:unit
npm run test:contracts
npm run test:config
npm run verificar:organizacao
```

Os testes locais não substituem banco, autenticação, e-mail e Electron reais. As rotinas Bash de banco são ferramentas de desenvolvimento que recriam bases de teste; use somente um ambiente descartável explicitamente configurado. O pacote contém fontes, não um instalador Windows.
