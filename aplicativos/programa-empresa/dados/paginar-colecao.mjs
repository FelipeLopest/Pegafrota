import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';

export function comPaginacao(servico, recurso) {
  const carregar = ({ q: busca = '', filtros = {}, pagina = 1, tamanho = 50 } = {}) =>
    executarFuncaoBanco('fleet_list', {
      p_resource: recurso,
      p_search: busca.trim().slice(0, 200) || null,
      p_filters: filtros,
      p_page: pagina,
      p_page_size: tamanho,
    });
  return {
    ...servico,
    async page(filtros = {}) {
      const resposta = await carregar({ filtros });
      const lista = resposta?.items || [];
      Object.defineProperty(lista, 'paginaRemota', {
        value: {
          carregar,
          filtros,
          total: resposta?.allTotal ?? resposta?.total ?? 0,
          resumo: resposta?.summary || {},
          facetas: resposta?.facets || {},
        },
      });
      return lista;
    },
  };
}
