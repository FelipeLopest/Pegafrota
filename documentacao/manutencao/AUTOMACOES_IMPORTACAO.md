> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# Contrato técnico — automações de importação

Fonte funcional detalhada: [`../produto/AUTOMACOES_IMPORTACAO_EM_MASSA.md`](../produto/AUTOMACOES_IMPORTACAO_EM_MASSA.md).

Para alterar a importação, preserve estas invariantes:

1. validação e prévia acontecem antes da primeira mutação;
2. permissões são as mesmas do cadastro manual e continuam sendo revalidadas no servidor;
3. nenhuma senha é importada por planilha;
4. abastecimentos do mesmo veículo não podem ser paralelizados fora de ordem;
5. erros de uma linha não devem desfazer linhas independentes já concluídas;
6. o parser XLSX deve permanecer local, limitado por tamanho/linhas/colunas e sem código/macros;
7. modelos oficiais ficam em `renderer/templates/importacao/` e são salvos por IPC com ID em whitelist;
8. não incluir movimentações de pátio ou ajustes de odômetro no importador genérico.

Ao adicionar um novo tipo, é obrigatório atualizar: `MODELOS`, permissão do modelo, função de envio, template XLSX, teste unitário, documentação e — se necessário — o whitelist IPC.
