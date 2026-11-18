import { el as criarElemento } from './componentes-do-painel.mjs';
import { icone } from './icones.mjs';

export function apresentacaoLogin() {
  const recursos = [
    ['company', 'Empresas', 'Cadastre empresas e gerencie os acessos.'],
    ['audit', 'Histórico de ações', 'Consulte alterações e confira seus resultados.'],
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
        criarElemento('h2', {
          class: 'auth-hero-title',
          text: 'Painel da plataforma',
        }),
        criarElemento('figure', { class: 'auth-illustration' }, [
          criarElemento('img', {
            src: './recursos/ilustracao-plataforma.svg',
            alt: '',
            width: '560',
            height: '232',
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
    ],
  );
}
