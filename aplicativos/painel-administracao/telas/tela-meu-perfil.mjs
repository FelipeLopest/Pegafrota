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
        subtitle: 'Sua conta de administrador global e a aparência do painel.',
      }),
      secao('Conta', [
        criarElemento('div', { class: 'detail-grid' }, [
          detalhe('E-mail', ator?.email),
          detalhe('Papel', 'Administrador da plataforma'),
        ]),
        criarElemento('p', {
          class: 'muted',
          text: 'Este perfil é global e não pertence a nenhuma empresa cliente.',
        }),
      ]),
      secao('Aplicativo Windows', [
        criarElemento('p', {
          class: 'muted',
          text: 'Consulte as versões publicadas e as notas de atualização do aplicativo das empresas.',
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
        botao({ label: 'Alterar minha senha', onClick: abrirTrocaSenha }),
        criarElemento('p', {
          class: 'muted',
          text: 'O acesso usa e-mail e senha. Ações críticas exigem confirmação explícita e são auditadas no servidor.',
        }),
        botao({
          label: 'Transferir administração da plataforma',
          variant: 'danger',
          onClick: () => abrirTransferenciaAdministradorPlataforma(ator),
        }),
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
