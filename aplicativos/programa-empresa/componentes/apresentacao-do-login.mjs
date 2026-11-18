import { el as criarElemento } from './componentes-do-programa.mjs';
import { icone } from './icones.mjs';

export function apresentacaoLogin() {
  const recursos = [
    ['vehicles', 'Veículos e motoristas', 'Acompanhe viagens, entradas e saídas.'],
    ['reports', 'Custos da frota', 'Consulte abastecimentos, manutenções e relatórios.'],
  ];
  return criarElemento('aside', { class: 'auth-hero', 'aria-label': 'Conheça o PegaNaFrota' }, [
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
      criarElemento('span', { class: 'auth-product-tag', text: 'EMPRESA' }),
    ]),
    criarElemento('div', { class: 'auth-hero-body' }, [
      criarElemento('h2', { class: 'auth-hero-title', text: 'Controle de frota' }),
      criarElemento('figure', { class: 'auth-illustration' }, [
        criarElemento('img', {
          src: './recursos/ilustracao-operacao.svg',
          alt: 'Ilustração de um caminhão em uma rota entre a entrada e a saída do pátio.',
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
  ]);
}
