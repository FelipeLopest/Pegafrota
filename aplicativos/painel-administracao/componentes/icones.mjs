const CAMINHOS = {
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.2"/>',
  'eye-off':
    '<path d="M9.9 5.8A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-3.3 4.1M6.2 7.9A17 17 0 002.5 12S6 18.5 12 18.5c.9 0 1.7-.1 2.5-.4"/><path d="M9.9 9.9a3.2 3.2 0 004.3 4.3"/><path d="M3.5 3.5l17 17"/>',
  overview:
    '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  company:
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/><path d="M10 21v-3h4v3"/>',
  admin: '<path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6z"/><path d="M9.5 12l1.8 1.8L15 10"/>',
  operation:
    '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  audit:
    '<path d="M5 4h9l5 5v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"/><path d="M14 4v5h5M8 13h6M8 17h4"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M4.5 20a7.5 7.5 0 0115 0"/>',

  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M13 9l3 3-3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
  filter: '<path d="M4 5h16l-6.2 7.4V19l-3.6 1.6v-8.2z"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  retry: '<path d="M20 12a8 8 0 11-2.6-5.9"/><path d="M20 4v4h-4"/>',
  logout: '<path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  trash:
    '<path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"/><path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/><path d="M10 11v6M14 11v6"/>',
  key: '<circle cx="8.5" cy="12" r="4.5"/><path d="M13 12h8M18 12v3M21 12v2"/>',
  users:
    '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 5.5a3.2 3.2 0 010 5.4M18 20a6.4 6.4 0 00-2.2-4.8"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  invite: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',

  warning:
    '<path d="M12 4l8.5 15H3.5z"/><path d="M12 10v4"/><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="8" r=".9" fill="currentColor" stroke="none"/>',
  inbox: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 13H8l1.5 2.5h5L16 13h4.5"/>',
  theme: '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>',
};

const IDENTIFICADOR_SPRITE = 't-icons';

export function montarSpriteIcones() {
  if (document.getElementById(IDENTIFICADOR_SPRITE)) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', IDENTIFICADOR_SPRITE);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  const definicoes = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  definicoes.innerHTML = Object.entries(CAMINHOS)
    .map(([nome, dadosRegistro]) => `<symbol id="ti-${nome}" viewBox="0 0 24 24">${dadosRegistro}</symbol>`)
    .join('');
  svg.append(definicoes);
  document.body.prepend(svg);
}

export function icone(nome, { size: tamanho = 'md', className: classeNome = '' } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute(
    'class',
    ['icon', tamanho === 'sm' ? 'icon-sm' : '', tamanho === 'lg' ? 'icon-lg' : '', classeNome]
      .filter(Boolean)
      .join(' '),
  );
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const usar = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  usar.setAttribute('href', `#ti-${Object.prototype.hasOwnProperty.call(CAMINHOS, nome) ? nome : 'info'}`);
  svg.append(usar);
  return svg;
}
