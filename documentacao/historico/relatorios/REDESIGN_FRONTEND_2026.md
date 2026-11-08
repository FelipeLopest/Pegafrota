> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# Redesign Front-end 2026 — PegaNaFrota

Esta revisão muda somente a camada visual e de experiência dos dois produtos: **Admin Web** e **Company Desktop (Electron)**. Contratos de API, permissões, migrations e regras de negócio foram mantidos.

## Direção visual

- tema padrão escuro, com preto/grafite e laranja como cor de ação;
- superfícies em camadas, bordas discretas e brilhos de acento;
- navegação lateral com ícones e agrupamentos semânticos;
- cabeçalhos compactos com contexto da tela e estado de conexão;
- botões com hierarquia visual forte, ícones e estados hover/active/busy;
- formulários, tabelas, KPIs, modais, toasts e estados vazios redesenhados;
- animações curtas para entrada de páginas, modais, cards e elementos do login;
- `prefers-reduced-motion` continua respeitado;
- todos os ícones são SVG internos, sem CDN ou dependência externa.

## Admin Web

- console administrativo com identidade visual própria;
- menu agrupado em Plataforma, Gestão, Sistema e Conta;
- login com visual de central de administração em vez de placeholder de imagem;
- KPIs com ícones e destaque contextual;
- perfil do administrador no rodapé do menu;
- ações críticas continuam usando as mesmas confirmações e regras de backend.

## Desktop / Electron

- navegação agrupada em Operação, Frota, Gestão, Sistema e Conta;
- login com visual de Fleet Command e indicadores de viagens/combustível/manutenção;
- KPIs operacionais com iconografia automática;
- cards de pátio, tabelas, formulários e modais com o mesmo sistema black/orange;
- tema escuro passa a ser o padrão e é persistido corretamente entre aberturas.

## Segurança e funcionalidade

A revisão não adiciona scripts remotos, fontes remotas ou imagens remotas. Os gates `verify:no-cdn`, `verify:boundaries`, `verify:electron`, `test:contracts`, `test:config`, `lint` e `smoke:admin` continuam passando.
