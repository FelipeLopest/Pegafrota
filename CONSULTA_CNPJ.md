# Consulta de CNPJ no cadastro de empresa

## Como usar

No painel da administração, abra **Empresas → Nova empresa** e informe um CNPJ numérico válido. Após uma pequena pausa na digitação, a consulta começa automaticamente. O botão **Consultar CNPJ** permite uma nova tentativa.

São preenchidos, quando disponíveis: razão social, nome fantasia, e-mail, telefone, logradouro, número, complemento, bairro, cidade, UF e CEP. O endereço aparece na segunda etapa do cadastro. Confira os dados antes de continuar; todos os campos continuam editáveis. Se não houver nome fantasia, usamos a razão social como sugestão.

Os campos que você digitou ou corrigiu são preservados, inclusive se a consulta ainda estiver carregando. Ao trocar o CNPJ, apagamos somente os dados preenchidos automaticamente. Correções manuais permanecem e precisam ser conferidas para a nova empresa. O nome, e-mail e senha do primeiro administrador continuam sendo informados por você.

A consulta não salva a empresa. A gravação segue ocorrendo somente ao clicar em **Provisionar empresa**, com as validações e permissões existentes.

## Serviço utilizado

[Documentação oficial da BrasilAPI](https://brasilapi.com.br/docs#tag/CNPJ).

Endereço: `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`. Consulta pública sem chave; nenhuma dependência foi adicionada. Apenas o CNPJ é enviado ao serviço, sem token, cookies ou chave do Supabase. A consulta não confirma a titularidade de quem está cadastrando.

Dados podem estar ausentes ou desatualizados. Falhas de internet, CNPJ não encontrado, excesso de consultas ou demora de mais de oito segundos exibem uma mensagem e permitem continuar manualmente. Não há tentativas automáticas em sequência. Respostas bem-sucedidas ficam em memória por dez minutos, com limite de 30 CNPJs, enquanto a página permanece aberta. Nenhum dado da consulta é persistido no navegador por esta funcionalidade.

O cadastro mantém a validação numérica de CNPJ já existente no projeto. Não foi adicionado suporte a CNPJ alfanumérico.

## Onde alterar cada parte

| Arquivo | Responsabilidade |
|---|---|
| `aplicativos/painel-administracao/dados/consultar-cnpj.mjs` | Consulta HTTP, validação do retorno, conversão dos dados, cache, cancelamento e proteção dos campos manuais. |
| `aplicativos/painel-administracao/telas/tela-cadastrar-empresa.mjs` | Digitação do CNPJ, botão, mensagens, preenchimento e manutenção das três etapas existentes. |
| `aplicativos/painel-administracao/testes/teste-consulta-cnpj.test.mjs` | Quinze testes reproduzíveis de consulta, erros, cancelamento e preservação de dados. |
| `ferramentas/apoio/compilar-aplicativo.mjs` | Autoriza BrasilAPI na política de conexão do painel e gera a política de segurança. |
| `aplicativos/painel-administracao/abrir-visualizacao-local.mjs` | Envia a política de segurança completa no cabeçalho HTTP do servidor local. |

A diretiva `frame-ancestors` passou para o cabeçalho HTTP, corrigindo o aviso anterior do navegador. Para hospedagem própria com outro servidor, configure o cabeçalho `Content-Security-Policy` com o conteúdo de `aplicativos/painel-administracao/dist/politica-de-seguranca.txt`; se já existir uma política no servidor, atualize também a permissão `connect-src https://brasilapi.com.br`.

Não há alteração de banco, migrations, Edge Functions, credenciais nem regras de provisionamento.

## Pacote completo unificado

Neste pacote, a consulta já está integrada e a configuração pública já está incorporada. Siga `LEIA_PRIMEIRO.md`; não é necessário aplicar o ZIP de atualização separado. Os arquivos `dist` foram recompilados desta versão.

## Instalar apenas a atualização na versão reorganizada

1. Feche o servidor do painel com Ctrl+C.
2. Extraia o ZIP de atualização dentro da pasta do projeto que contém `package.json`, `aplicativos` e `ferramentas`. Aceite substituir os arquivos correspondentes. O ZIP de atualização isolado não contém `.env`, credenciais ou `node_modules`; esta observação não se aplica ao pacote completo unificado, que inclui apenas a configuração pública.
3. Nessa pasta, execute:

```powershell
npm run compilar:painel
npm run abrir:painel
```

4. Atualize a página do navegador com Ctrl+F5 e abra **Nova empresa**.

Se estiver usando o ZIP completo em uma pasta nova, siga `COMO_SUBIR_O_SISTEMA.md` para instalar as dependências e configurar o `.env` antes de compilar. Não crie uma pasta adicional dentro de `aplicativos` ao extrair.

## Validação realizada

- 278 testes unitários aprovados, incluindo os 15 novos casos de CNPJ.
- Cinco cenários no Chrome: preenchimento e envio explícito; edição durante consulta; troca de CNPJ com resposta atrasada; erro de limite com nova tentativa; CNPJ não encontrado com cadastro manual.
- A interface foi exercitada com respostas simuladas da BrasilAPI e do Supabase. O envio final foi interceptado e conferido, incluindo complemento e endereço; nenhuma empresa real foi criada.
- Uma consulta separada ao endpoint público real da BrasilAPI retornou os dados de um CNPJ de referência. Isso verifica disponibilidade e formato naquele momento; não equivale a uma consulta pela sua instalação.
- Compilação dos dois aplicativos, sintaxe/imports, contratos, configuração, busca de segredos, recursos locais, fronteiras, segurança do Electron e organização/migrations aprovados. A política de segurança foi verificada no servidor local e no Chrome.

As evidências desta atualização estão em `documentacao/validacao/consulta-cnpj/`. O teste do navegador usou Chrome real e requisições interceptadas para simular sucessos e falhas de forma reproduzível.

O erro anterior `ERR_NAME_NOT_RESOLVED` do Supabase é uma questão separada de conexão/configuração. Esta atualização não troca o endereço do seu Supabase e não comprova login ou gravação no seu banco real.