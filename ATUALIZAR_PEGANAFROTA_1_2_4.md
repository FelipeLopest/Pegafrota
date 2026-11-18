# Atualizar para o PegaNaFrota 1.2.4

## O que mudou

- **Desktop** — menu organizado por tarefa, títulos mais curtos, menos efeitos visuais e indicadores completos sob **Ver indicadores da frota**. **Primeiros passos** leva direto ao próximo cadastro.
- **Importar planilha** — escolha o tipo e baixe o modelo Excel direto da tela. Em **Como preencher a planilha**, consulte as etapas, os exemplos e a versão CSV. Depois envie o arquivo ou cole os dados e confira a prévia.
- **Viagens** — se faltar veículo ou motorista, o formulário abre o cadastro e volta à viagem com os dados já preenchidos. Para registrar também a passagem pelo pátio, o aplicativo orienta a cadastrar o local e a confirmar onde o veículo está.
- **Painel** — **Acompanhar cadastros** é onde você vê o andamento do cadastro de empresas. As ações registradas ficam em **Histórico de ações**.

## Publicação

Se o Supabase já recebeu a 1.2.3, a 1.2.4 usa essa mesma estrutura. Se ainda estiver na 1.2.2 ou anterior, faça primeiro a atualização do banco e das funções descrita no [guia 1.2.3](ATUALIZAR_PEGANAFROTA_1_2_3.md).

Depois, envie a 1.2.4 para a branch `main` do GitHub e confira a publicação do painel na Vercel. No GitHub, execute **Actions → Gerar instalador Windows → Run workflow**. Baixe o arquivo de instalação e confira a versão em **Meu perfil** depois de instalar.
