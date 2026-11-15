# Revisão visual — versão 1.1.1

Data: 10 de novembro de 2026. Esta entrega acrescenta acabamento visual à integração de câmeras da versão 1.1.0, preservada no pacote.

## Alterações

- Botões dos dois aplicativos usam cores planas. Foram removidos brilhos, sombras, gradientes e movimentos de hover que deslocavam as ações. O contorno de foco por teclado foi preservado.
- Tamanhos de controles, espaçamentos entre ícones/textos, ações de cabeçalho, filtros, grupos de botões e rodapés de diálogo foram uniformizados. Textos longos podem quebrar sem ultrapassar os limites.
- Removidas camadas repetidas de CSS que impunham larguras e margens diferentes aos mesmos botões. A navegação recolhida acomoda marca e controle sem sobreposição.
- Formulários se adaptam à largura disponível; modais respeitam a altura da janela e mantêm ações acessíveis. A faixa de cinco indicadores fica em três mais dois em janelas intermediárias. O cadastro de empresa não exibe mais numeração nativa fora dos cartões das etapas.
- Novos logins da empresa e da administração: marca, ilustração vetorial própria, explicação visual da operação e cartões de recursos na área esquerda. Em telas pequenas, a marca permanece e a apresentação é compactada para priorizar o formulário.
- Ícone próprio com veículo frontal, em laranja e carvão. SVG vetorial, PNG 512px e ICO com 16/24/32/48/64/128/256px. Incluído nos favicons, no login, na configuração da janela e na configuração do executável/instalador/atalhos Windows.
- O build agora copia recursos locais de marca/ilustração. Não há imagens, fontes ou scripts de CDN.

## Validação

- 286 testes dos aplicativos/pacotes aprovados. Um teste antigo foi ajustado para reconhecer seletores CSS agrupados equivalentes.
- 55 verificações da gestão de equipe, contratos de 44 RPCs/19 consultas/quatro relatórios, configuração 11/11 e segurança Electron 38/38 aprovados.
- Compilação dos dois aplicativos, sintaxe/imports, recursos locais, segredos, fronteiras, protótipos, organização e inicialização básica do painel aprovados. As 49 migrations anteriores continuam preservadas.
- 130 combinações de tela, tema e largura no Chrome: 19 rotas operacionais da empresa e nove do painel em claro/escuro a 1440/1024 px, logins também a 390 px e diálogos de cadastro/saída. Sem erros JavaScript, sem rolagem horizontal global nas condições verificadas, imagens locais carregadas e botões sem sombras/gradientes.
- Login exercitado nos dois temas: validação de campos vazios, exibir/ocultar senha mantendo o valor, orientação de recuperação de senha, entrada com resposta simulada e opção Manter conectado da empresa.
- Amostra dos estilos dos botões em repouso e hover confirmou ausência de sombra, gradiente e transformação nas variantes disponíveis. Ícones ICO contêm os sete tamanhos declarados.

As verificações visuais usaram dados fictícios, Supabase e ponte Electron simulados. Algumas capturas internas incluem o aviso de conexão indisponível do ambiente isolado; não representam diagnóstico do servidor de produção. Foram inspecionadas capturas de login, veículos, cadastro de veículo e cadastro de empresa, incluindo temas e tamanhos distintos. As capturas e os resultados estão em documentacao/validacao/aparencia/.

## Como usar a atualização

Extraia a pasta única PegaNaFrota_Reorganizado em uma pasta nova. Atualize os arquivos do repositório, incluindo .github e recursos/. Para o painel hospedado, publique pela integração existente da Vercel. Para o programa instalado, gere um novo instalador em Actions → Gerar instalador Windows e instale PegaNaFrota-1.1.1-Instalador.exe. O novo ícone Windows só será aplicado no produto recompilado; um atalho antigo pode continuar apontando à instalação anterior.

Esta sessão não publicou o projeto no GitHub/Vercel, não alterou o Supabase e não gerou/homologou o instalador completo. A configuração de empacotamento e os recursos do ícone estão prontos. Os ajustes visuais não exigem migration adicional; quem ainda não ativou as câmeras deve seguir ATIVAR_CAMERAS.md e identificar a placa física antes de usar o firmware.

## Onde alterar depois

Em cada aplicativo: estilos/estilo-login.css para o acesso; componentes/apresentacao-do-login.mjs para a apresentação; estilos/estilo-componentes.css para botões/campos; estilos/estilo-menu-e-janela.css para a navegação; estilos/estilo-ajustes-visuais.css para ajustes de páginas; recursos/ para ícone e ilustração. O programa também tem estilos/estilo-importacao.css. O guia completo permanece em GUIA_DO_PROJETO.md.
