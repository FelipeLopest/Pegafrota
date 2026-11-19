import { el as criarElemento, botao, cartao, navegar, notificacao } from './componentes-do-programa.mjs';
import { contexto } from '../acesso/sessao-e-permissoes.mjs';
import { PERMISSAO } from '@peganafrota/contracts';
import { dados } from '../dados/dados-do-programa.mjs';

export function controleDeGaragem(fluxo, aoSalvar) {
  const podeEditar = contexto.can(PERMISSAO.COMPANY_UPDATE);
  const habilitar = criarElemento('input', {
    id: 'controlar-garagem', type: 'checkbox',
    checked: fluxo?.yardControlEnabled === true,
    disabled: !podeEditar || !fluxo,
  });
  const salvar = botao({
    label: 'Salvar controle de garagem',
    permission: PERMISSAO.COMPANY_UPDATE,
    onClick: async () => {
      if (salvar.disabled) return;
      salvar.disabled = true;
      habilitar.disabled = true;
      try {
        await dados.company.setWorkflow(habilitar.checked);
        notificacao('Preferência de garagem salva.', { tone: 'success' });
        aoSalvar?.();
      } catch (erro) {
        notificacao(erro.message, { tone: 'danger' });
      } finally {
        salvar.disabled = !podeEditar || !fluxo;
        habilitar.disabled = !podeEditar || !fluxo;
      }
    },
  });
  salvar.disabled = !podeEditar || !fluxo;
  return cartao({
    title: 'Controle de garagem (opcional)',
    children: [
      criarElemento('p', { class: 'field-hint', text: 'Viagens exigem veículo, motorista, trajeto e quilometragem. Ative esta opção se também quiser registrar entradas e saídas da garagem junto das viagens. Desativar preserva o histórico e o registro avulso de passagens.' }),
      criarElemento('label', { class: 'auth-remember', for: 'controlar-garagem' }, [habilitar, 'Controlar entradas e saídas da garagem nas viagens']),
      !fluxo ? criarElemento('p', { role: 'status', text: 'Configuração indisponível. Tente recarregar. Se persistir, confira a conexão e aplique a atualização do Supabase desta versão.' }) : null,
      criarElemento('div', { class: 'page-actions' }, [
        salvar,
        fluxo?.yardControlEnabled ? botao({ label: 'Cadastrar garagem', permission: PERMISSAO.LOCATIONS_WRITE, onClick: () => navegar('/locais?novo=1') }) : null,
        fluxo?.yardControlEnabled ? botao({ label: 'Conferir veículos no pátio', permission: PERMISSAO.MOVEMENTS_READ, onClick: () => navegar('/patio') }) : null,
      ]),
    ],
  });
}
