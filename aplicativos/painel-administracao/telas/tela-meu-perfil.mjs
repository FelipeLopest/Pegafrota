import { abrirTrocaSenha } from '../formularios/formulario-senha.mjs';
import { PAGINA_VERSOES } from '../acesso/gerenciar-conta.mjs';
import { el as criarElemento, botao, notificacao } from '../componentes/componentes-do-painel.mjs';

import { cabecalhoPagina, secao, detalhe } from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirTransferenciaAdminPlataforma as abrirTransferenciaAdministradorPlataforma } from '../formularios/formulario-transferir-administracao.mjs';

export async function telaPerfil({
  outlet: conteudoTela,
  setTitle: definirTitulo,
  actor: ator,
  theme: tema,
}) {
  definirTitulo('Meu perfil');
  const temaChoice = tema.get();
  conteudoTela.replaceChildren(
    criarElemento('div', {}, [
      cabecalhoPagina({
        title: 'Meu perfil',
      }),
      secao('Conta', [
        criarElemento('div', { class: 'detail-grid' }, [
          detalhe('E-mail', ator?.email),
          detalhe('Papel', 'Administrador da plataforma'),
        ]),
      ]),
      secao('Aplicativo Windows', [
        criarElemento('p', {
          class: 'muted',
          text: 'Veja as versões e novidades do aplicativo das empresas.',
        }),
        criarElemento('a', {
          class: 'btn btn-secondary',
          href: PAGINA_VERSOES,
          target: '_blank',
          rel: 'noopener noreferrer',
          text: 'Consultar versões do aplicativo',
        }),
      ]),
      secao('Segurança', [
        criarElemento('div', { class: 'form-row' }, [
          botao({ label: 'Alterar minha senha', onClick: abrirTrocaSenha }),
          botao({
            label: 'Transferir administração da plataforma',
            variant: 'danger',
            onClick: () => abrirTransferenciaAdministradorPlataforma(ator),
          }),
        ]),
      ]),
      secao('Aparência', [
        criarElemento('fieldset', { class: 'reason-picker' }, [
          criarElemento('legend', { class: 'field-label', text: 'Tema' }),
          ...[
            ['light', 'Claro'],
            ['dark', 'Escuro'],
            ['system', 'Sistema'],
          ].map(([veiculoItem, linhaItem]) =>
            criarElemento('label', { class: 'radio-option' }, [
              criarElemento('input', {
                type: 'radio',
                name: 'tema',
                value: veiculoItem,
                checked: temaChoice === veiculoItem,
                onChange: () => {
                  tema.set(veiculoItem);
                  notificacao(`Tema: ${linhaItem}`, { tone: 'info' });
                },
              }),
              criarElemento('span', { text: linhaItem }),
            ]),
          ),
        ]),
      ]),
    ]),
  );
}
