> Referência anterior à reorganização. As regras de produto podem continuar válidas, mas os caminhos e a divisão do código devem ser conferidos no `GUIA_DO_PROJETO.md` da raiz e no código atual.

# v16.8 — Inicialização direta do Admin

O painel não exibe mais uma tela intermediária com “Carregando…”.

- Sem sessão: o login é renderizado imediatamente pelo módulo principal.
- Com sessão: o container permanece visualmente vazio durante a validação curta e então abre o painel.
- O `boot-guard.js` foi preservado para mostrar um erro real se o JavaScript principal falhar.
- Nenhuma regra de autenticação, rota, banco ou Edge Function foi alterada.
