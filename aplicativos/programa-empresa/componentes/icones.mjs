const CAMINHOS = {
  dashboard:
    '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  yard: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V8h3.5a2.75 2.75 0 010 5.5H9"/>',
  movements: '<path d="M7 8h13m0 0l-3-3m3 3l-3 3M17 16H4m0 0l3-3m-3 3l3 3"/>',
  truck:
    '<path d="M2 6.5A1.5 1.5 0 013.5 5H14v11H2z"/><path d="M14 9h4l3 3.5V16h-7z"/><circle cx="6.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
  users:
    '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 5.5a3.2 3.2 0 010 5.4M18 20a6.4 6.4 0 00-2.2-4.8"/>',
  route:
    '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M15.5 6H10a4 4 0 000 8h4a4 4 0 010 8H8.5"/>',
  fuel: '<path d="M4 20V5a2 2 0 012-2h5a2 2 0 012 2v15"/><path d="M3 20h11M6 9h5"/><path d="M13 9h3.5a1.5 1.5 0 011.5 1.5V16a1.5 1.5 0 003 0V9l-2.5-2.5"/>',
  tool: '<path d="M14.7 6.3a4.5 4.5 0 005.9 5.9L20 13l-7 7a2.1 2.1 0 01-3-3l7-7z"/><path d="M8.5 8.5L4 4"/><path d="M3 8l3-3 2 1-1 3z"/>',
  gauge: '<path d="M3.5 17a9 9 0 1117 0"/><path d="M12 14l4-3.5"/><circle cx="12" cy="14" r="1.4"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  chart:
    '<path d="M4 20V4M4 20h16"/><rect x="8" y="11" width="3.4" height="6" rx="1"/><rect x="14.6" y="7" width="3.4" height="10" rx="1"/>',
  building:
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/><path d="M10 21v-3h4v3"/>',
  shield: '<path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6z"/><path d="M9.5 12l1.8 1.8L15 10"/>',
  audit:
    '<path d="M5 4h9l5 5v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"/><path d="M14 4v5h5M8 13h6M8 17h4"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M4.5 20a7.5 7.5 0 0115 0"/>',

  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M13 9l3 3-3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
  edit: '<path d="M4 20h4l10-10a2.5 2.5 0 10-3.5-3.5L4.5 16.5z"/><path d="M13.5 7.5l3 3"/>',
  trash:
    '<path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"/><path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/><path d="M10 11v6M14 11v6"/>',
  archive:
    '<rect x="3" y="4" width="18" height="4.5" rx="1.5"/><path d="M5 8.5V19a1 1 0 001 1h12a1 1 0 001-1V8.5"/><path d="M10 12.5h4"/>',
  download: '<path d="M12 4v11m0 0l-4-4m4 4l4-4"/><path d="M4 18v1a1 1 0 001 1h14a1 1 0 001-1v-1"/>',
  filter: '<path d="M4 5h16l-6.2 7.4V19l-3.6 1.6v-8.2z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  camera:
    '<path d="M3 8.5A1.5 1.5 0 014.5 7h2.7l1.3-2h6l1.3 2h3.7A1.5 1.5 0 0121 8.5V18a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18z"/><circle cx="12" cy="13" r="3.4"/>',
  refresh: '<path d="M20 12a8 8 0 11-2.6-5.9"/><path d="M20 4v4h-4"/>',
  logout: '<path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  dots: '<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/>',

  warning:
    '<path d="M12 4l8.5 15H3.5z"/><path d="M12 10v4"/><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="8" r=".9" fill="currentColor" stroke="none"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6.2 6.2l11.6 11.6"/>',
  inbox: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 13H8l1.5 2.5h5L16 13h4.5"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.2"/>',
  'eye-off':
    '<path d="M9.9 5.8A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-3.3 4.1M6.2 7.9A17 17 0 002.5 12S6 18.5 12 18.5c.9 0 1.7-.1 2.5-.4"/><path d="M9.9 9.9a3.2 3.2 0 004.3 4.3"/><path d="M3.5 3.5l17 17"/>',
  upload: '<path d="M12 20V9m0 0l-4 4m4-4l4 4"/><path d="M4 6V5a1 1 0 011-1h14a1 1 0 011 1v1"/>',
  sheet:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9h17M3.5 14.5h17M9 3.5v17M15 3.5v17"/>',
  reports:
    '<path d="M4 20V4M4 20h16"/><rect x="8" y="11" width="3.4" height="6" rx="1"/><rect x="14.6" y="7" width="3.4" height="10" rx="1"/>',
  vehicles:
    '<path d="M2 6.5A1.5 1.5 0 013.5 5H14v11H2z"/><path d="M14 9h4l3 3.5V16h-7z"/><circle cx="6.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
  bell: '<path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 004 0"/>',
  up: '<path d="M7 17L17 7m0 0H8m9 0v9"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
};

const IDENTIFICADOR_SPRITE = 'pnf-icons';

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
    .map(([nome, dadosRegistro]) => `<symbol id="i-${nome}" viewBox="0 0 24 24">${dadosRegistro}</symbol>`)
    .join('');
  svg.append(definicoes);
  document.body.prepend(svg);
}

export function temIcone(nome) {
  return Object.prototype.hasOwnProperty.call(CAMINHOS, nome);
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
  usar.setAttribute('href', `#i-${temIcone(nome) ? nome : 'info'}`);
  svg.append(usar);
  return svg;
}
