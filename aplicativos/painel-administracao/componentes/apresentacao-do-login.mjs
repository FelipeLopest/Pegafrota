import { el as criarElemento } from './componentes-do-painel.mjs';
import { icone } from './icones.mjs';

export function apresentacaoLogin() {
  const recursos = [
    ['company', 'Empresas organizadas', 'Cadastros e acessos em um só ambiente.'],
    ['audit', 'Histórico rastreável', 'Operações e auditoria para acompanhar cada etapa.'],
  ];
  return criarElemento(
    'aside',
    { class: 'auth-hero', 'aria-label': 'Conheça o painel da plataforma' },
    [
      criarElemento('div', { class: 'auth-hero-brand' }, [
        criarElemento('img', {
          class: 'auth-brand-icon',
          src: './recursos/icone-aplicativo.svg',
          alt: '',
          width: '44',
          height: '44',
        }),
        criarElemento('span', {}, [
          criarElemento('span', { text: 'Pega' }),
          criarElemento('span', { class: 'auth-hero-brand-accent', text: 'NaFrota' }),
        ]),
        criarElemento('span', { class: 'auth-product-tag', text: 'ADMIN' }),
      ]),
      criarElemento('div', { class: 'auth-hero-body' }, [
        criarElemento('p', {
          class: 'auth-hero-kicker',
          text: 'VISÃO GERAL. CONTROLE EM CADA ETAPA.',
        }),
        criarElemento('h2', {
          class: 'auth-hero-title',
          text: 'Sua plataforma, bem administrada.',
        }),
        criarElemento('p', {
          class: 'auth-hero-text',
          text: 'Organize empresas, gerencie acessos e acompanhe o histórico das operações em um único painel.',
        }),
        criarElemento('figure', { class: 'auth-illustration' }, [
          criarElemento('img', {
            src: './recursos/ilustracao-plataforma.svg',
            alt: 'Ilustração de empresas conectadas ao painel central de administração.',
            width: '560',
            height: '232',
          }),
          criarElemento('figcaption', {
            text: 'Empresas, acessos e operações com responsabilidades claras.',
          }),
        ]),
        criarElemento(
          'div',
          { class: 'auth-feature-grid' },
          recursos.map(([nomeIcone, titulo, descricao]) =>
            criarElemento('div', { class: 'auth-feature' }, [
              icone(nomeIcone, { size: 'sm' }),
              criarElemento('div', {}, [
                criarElemento('h3', { text: titulo }),
                criarElemento('p', { text: descricao }),
              ]),
            ]),
          ),
        ),
      ]),
      criarElemento('p', { class: 'auth-hero-foot' }, [
        icone('admin', { size: 'sm' }),
        criarElemento('span', { text: 'Ambiente exclusivo da administração da plataforma.' }),
      ]),
    ],
  );
}
