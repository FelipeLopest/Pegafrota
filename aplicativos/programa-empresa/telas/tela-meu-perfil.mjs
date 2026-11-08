import {
  el as criarElemento,
  botao,
  cabecalhoPagina,
  cartao,
} from '../componentes/componentes-do-programa.mjs';

import { contexto } from '../acesso/sessao-e-permissoes.mjs';

import { rotuloPapel, faixaResumo, detalhe } from '../componentes/listas-resumos-e-detalhes.mjs';

/*
 * A tela "Histórico de alterações" foi REMOVIDA da interface do Desktop.
 *
 * O que saiu: apenas a tela. A trilha de auditoria continua sendo gravada no
 * banco a cada operação — é ela que permite responder "quem mudou isto e
 * quando" numa investigação, e removê-la enfraqueceria a rastreabilidade que o
 * resto do sistema depende.
 *
 * O que saiu da vista foi o log técnico do dia a dia: uma lista de ações
 * internas que o operador de frota não consegue interpretar e que competia por
 * atenção com as telas que ele realmente usa. A consulta continua possível pelo
 * banco, para quem tem motivo e credencial para isso.
 */

export function telaPerfil({ outlet: conteudoTela, setTitle: definirTitulo, theme: tema }) {
  definirTitulo('Meu perfil');
  const papel = rotuloPapel(contexto.role);
  const resumos = {
    company_admin: 'Administra cadastro, equipe e toda a operação da empresa.',
    fleet_manager: 'Gerencia frota, operação e relatórios, sem alterar acessos da equipe.',
    operator: 'Registra a operação diária: viagens, abastecimentos e pátio.',
    viewer: 'Consulta frota, indicadores e relatórios sem alterar dados.',
  };

  conteudoTela.replaceChildren(
    criarElemento('div', {}, [
      cabecalhoPagina({
        title: 'Meu perfil',
        subtitle: 'Sua conta e como o seu cargo se traduz no dia a dia.',
      }),
      faixaResumo([
        { label: 'Empresa', value: contexto.companyName || '—', icon: 'building' },
        { label: 'Cargo', value: papel, icon: 'shield', tone: 'info' },
        { label: 'Sessão', value: 'Ativa', icon: 'check', tone: 'success' },
      ]),
      cartao({
        title: 'Conta',
        children: [
          criarElemento('div', { class: 'detail-grid' }, [
            detalhe('Nome', contexto.fullName),
            detalhe('Empresa', contexto.companyName),
            detalhe('Cargo', papel),
            detalhe(
              'O que você pode fazer',
              resumos[contexto.role] || 'Acesso conforme permissões da empresa.',
            ),
          ]),
        ],
      }),
      cartao({
        title: 'Aparência',
        children: [
          criarElemento('p', { class: 'muted', text: 'Escolha o tema usado neste computador.' }),
          criarElemento(
            'div',
            { class: 'modal-actions' },
            [
              ['dark', 'Escuro'],
              ['light', 'Claro'],
              ['system', 'Sistema'],
            ].map(([valor, rotulo]) =>
              botao({
                label: rotulo,
                variant: 'ghost',
                onClick: () => tema.set(valor),
              }),
            ),
          ),
        ],
      }),
    ]),
  );
}
