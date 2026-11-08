# Nomes em português e compatibilidade

A tradução foi feita sobre declarações e referências do código, respeitando o escopo de cada variável. Propriedades abreviadas foram expandidas quando necessário: uma variável local pode se chamar `usuarioIdentificador`, enquanto o campo enviado continua `userId`. Isso preserva o servidor e os dados existentes.

Nomes antigos de funções/constantes exportadas foram mantidos como aliases quando há consumidores internos ou testes que dependem deles. O código usa os nomes locais em português; o alias não é uma segunda implementação. Métodos de bibliotecas, propriedades públicas estáveis, seletores e canais permanecem com seus nomes de contrato.

As variáveis CSS próprias foram traduzidas com suas referências em CSS e JavaScript. A ordem das folhas de estilo foi mantida para preservar precedência.

As migrations e o seed SQL foram preservados. Seus identificadores históricos, nomes de campos, parâmetros públicos e variáveis antigas não foram reescritos. Variáveis de ambiente do sistema, Postgres e Supabase também são contratos de configuração.

Não há dependência de TypeScript, formatador ou ferramenta de refatoração adicional no produto final. As ferramentas auxiliares usadas nesta revisão não fazem parte do runtime dos aplicativos.
