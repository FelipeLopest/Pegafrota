import {
  el as criarElemento,
  botao,
  cartao,
  fmt as formatar,
  estadoErro,
  estadoVazio,
} from './componentes-do-programa.mjs';
import { tabela } from './listas-resumos-e-detalhes.mjs';
import { rpc as executarFuncaoBanco, sessao } from '../acesso/sessao-e-permissoes.mjs';

export function montarLinhaDoTempoVeiculo(veiculoId) {
  const area = criarElemento('div', { 'aria-live': 'polite' });
  let geracao = 0;
  async function carregar(pagina = 1) {
    const atual = ++geracao;
    const sessaoInicial = sessao.geracao;
    area.replaceChildren(criarElemento('p', { class: 'muted', text: 'Carregando histórico…' }));
    try {
      const resposta = await executarFuncaoBanco('vehicle_timeline', {
        p_vehicle_id: veiculoId,
        p_page: pagina,
        p_page_size: 30,
      });
      if (!area.isConnected || atual !== geracao || sessaoInicial !== sessao.geracao) return;
      if (!resposta?.items?.length)
        return area.replaceChildren(
          estadoVazio({
            title: 'Nenhum evento registrado',
            description: 'Os registros autorizados aparecerão aqui.',
          }),
        );
      area.replaceChildren(
        tabela(
          ['Quando', 'Tipo', 'Detalhe'],
          resposta.items.map((evento) =>
            criarElemento('tr', {}, [
              criarElemento('td', { text: formatar.dateTime(evento.at_time) }),
              criarElemento('td', { text: evento.kind }),
              criarElemento('td', { text: evento.description }),
            ]),
          ),
        ),
        criarElemento('div', { class: 'pager' }, [
          botao({
            label: 'Anterior',
            disabled: pagina <= 1,
            onClick: () => carregar(pagina - 1),
          }),
          criarElemento('span', {
            text: 'Página ' + pagina + ' · ' + resposta.total + ' evento(s)',
          }),
          botao({
            label: 'Próxima',
            disabled: !resposta.hasNext,
            onClick: () => carregar(pagina + 1),
          }),
        ]),
      );
    } catch (erro) {
      if (area.isConnected && atual === geracao && sessaoInicial === sessao.geracao)
        area.replaceChildren(
          estadoErro({
            description: erro.message,
            onRetry: () => carregar(pagina),
          }),
        );
    }
  }
  queueMicrotask(() => carregar());
  return cartao({ title: 'Linha do tempo do veículo', children: [area] });
}
