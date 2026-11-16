# Atualizar para o PegaNaFrota 1.2.2

Esta versão corrige quilometragem, próxima preventiva, datas de CNH, filtros de relatório, criação da primeira conta da empresa e auditoria global. Ela preserva as migrations anteriores e inclui cinco arquivos SQL novos com nomes iniciados por 20261116.

## Supabase

Abra o PowerShell na raiz do projeto 1.2.2, com a sessão do Supabase CLI ativa. A referência abaixo é a do projeto já configurado para o PegaNaFrota.

    npx.cmd --yes supabase@2.113.0 link --project-ref jnznizrtbivrvqkskcep
    npx.cmd --yes supabase@2.113.0 db push --dry-run --linked

Se o banco já está atualizado para a 1.2.1, a prévia deve mostrar somente as cinco migrations 20261116. Confira o destino e preserve uma cópia de segurança do banco. Se aparecerem versões anteriores que você esperava já aplicadas, confira o histórico antes de prosseguir.

    npx.cmd --yes supabase@2.113.0 db push --linked

Quando o banco terminar, publique a função que atende o painel.

    npx.cmd --yes supabase@2.113.0 functions deploy platform-admin --project-ref jnznizrtbivrvqkskcep --use-api

Mantenha a origem autorizada da Vercel e o redirecionamento do Auth já configurados. Os ajustes desta versão não exigem trocar chaves do aplicativo. O guia 1.2.0 descreve os endereços se for uma instalação nova.

## GitHub, Vercel e Windows

1. Envie o código da versão 1.2.2 para o GitHub depois de atualizar o Supabase. Na integração existente com a Vercel, acompanhe a publicação do painel.
2. Abra **Actions → Gerar instalador Windows → Run workflow** na branch **main**. Depois de concluir, baixe **PegaNaFrota-Instalador-Windows** em Artifacts.
3. Extraia o ZIP do GitHub, feche o PegaNaFrota antigo e execute **PegaNaFrota-1.2.2-Instalador.exe**. Confira a versão em Meu perfil.
4. Em uma empresa de teste, confirme uma saída com quilometragem, consulte um lançamento e abra a data da CNH. No painel, pesquise um evento de auditoria por parte da ação e por data no mesmo dia.

As migrations evitam novas inconsistências. Correções de quilometragem antigas que já estavam divergentes e empresas que ficaram ativas sem primeiro administrador devem ser examinadas com o histórico aberto. Nenhum cadastro anterior é removido automaticamente.
