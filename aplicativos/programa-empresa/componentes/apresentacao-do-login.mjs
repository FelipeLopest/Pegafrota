import { el as criarElemento } from './componentes-do-programa.mjs';
import { icone } from './icones.mjs';

export function apresentacaoLogin() {
  const recursos = [
    ['vehicles', 'Frota organizada', 'Veículos e motoristas no mesmo lugar.'],
    ['reports', 'Decisões com contexto', 'Custos e histórico para acompanhar a operação.'],
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
      criarElemento('p', { class: 'auth-hero-kicker', text: 'CADA MOVIMENTO CONTA' }),
      criarElemento('h2', { class: 'auth-hero-title', text: 'Sua operação no caminho certo.' }),
      criarElemento('p', {
        class: 'auth-hero-text',
        text: 'Do pátio à estrada, acompanhe sua frota com clareza e mantenha a rotina da equipe organizada.',
      }),
      criarElemento('figure', { class: 'auth-illustration' }, [
        criarElemento('img', {
          src: './recursos/ilustracao-operacao.svg',
          alt: 'Ilustração de um caminhão em uma rota entre a entrada e a saída do pátio.',
          width: '560',
          height: '232',
        }),
        criarElemento('figcaption', {
          text: 'Uma rotina conectada, da entrada ao próximo destino.',
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
      icone('shield', { size: 'sm' }),
      criarElemento('span', { text: 'Gestão da frota, com cada pessoa no seu papel.' }),
    ]),
  ]);
}
