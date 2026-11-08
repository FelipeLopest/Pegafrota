# Comece por aqui

Este pacote contém um único projeto atualizado. A consulta automática de CNPJ está incluída, e os dois aplicativos foram recompilados a partir desta versão.

## Abrir o painel da administração

1. Extraia este ZIP em uma pasta nova. Não extraia sobre a pasta antiga, pois arquivos antigos podem permanecer nela.
2. Abra a pasta PegaNaFrota_Reorganizado. Nela estão package.json, package-lock.json, aplicativos, ferramentas e este guia. Não existe outro projeto dentro dela.
3. Feche o servidor antigo com Ctrl+C para liberar a porta do painel.
4. Com Node.js 22 ou superior instalado, abra um terminal nessa pasta e execute:

```powershell
npm run compilar:painel
npm run abrir:painel
```

5. Abra o endereço informado pelo terminal e atualize a página com Ctrl+F5. Em Empresas → Nova empresa, o campo CNPJ e o botão Consultar CNPJ aparecem antes da razão social.

A configuração .env da sua cópia anterior foi preservada na raiz. Ela não foi impressa nos relatórios. Não substitua esse arquivo por .env.example ao abrir este pacote.

## Programa da empresa e desenvolvimento

Para instalar as dependências do projeto completo, execute npm ci na raiz. Depois, npm run abrir:empresa abre o programa da empresa. O painel local usa os módulos já compilados, e seu servidor depende somente do Node.js.

## Organização

- aplicativos/painel-administracao: painel web atualizado, com fontes e dist gerado desta versão.
- aplicativos/programa-empresa: programa Electron da empresa, com fontes e dist gerado desta versão.
- compartilhado: validações e contratos usados pelos aplicativos.
- ferramentas: compilação, verificações e comandos do projeto.
- supabase: migrations e funções do servidor, preservadas.
- documentacao: mapas e evidências de validação.

O detalhamento de cada arquivo está em GUIA_DO_PROJETO.md. O funcionamento da consulta está em CONSULTA_CNPJ.md.

Nenhuma conta foi criada e nenhum dado foi alterado no Supabase real. O endereço do seu Supabase foi preservado; esta organização não corrige eventual erro de DNS do serviço.
