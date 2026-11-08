import { requisitar, sessao } from '../acesso/sessao-e-permissoes.mjs';

export async function selecionar(
  tabela,
  {
    columns: colunas = '*',
    filters: filtros = {},
    order: ordem,
    limit: limite2 = 1000,
    offset: deslocamento = 0,
  } = {},
) {
  const parametros = new URLSearchParams();
  parametros.set('select', colunas);
  for (const [chaveItem, veiculoItem] of Object.entries(filtros)) {
    if (veiculoItem == null || veiculoItem === '') continue;
    parametros.append(chaveItem, veiculoItem);
  }
  if (ordem) parametros.set('order', ordem);
  if (limite2) parametros.set('limit', String(limite2));
  if (deslocamento) parametros.set('offset', String(deslocamento));
  return requisitar(`/rest/v1/${tabela}?${parametros.toString()}`, { method: 'GET' });
}

export async function contar(tabela, filtros = {}) {
  const parametros = new URLSearchParams({ select: 'id', limit: '1' });
  for (const [chaveItem, veiculoItem] of Object.entries(filtros || {})) {
    if (veiculoItem == null || veiculoItem === '') continue;
    parametros.append(chaveItem, veiculoItem);
  }
  const resposta = await requisitar(`/rest/v1/${tabela}?${parametros.toString()}`, {
    method: 'GET',
    headers: { Prefer: 'count=exact' },
    raw: true,
  });
  const faixa = resposta?.headers?.get?.('content-range') || '';
  const total = /\/(\d+)$/.exec(faixa)?.[1];
  return total == null ? (Array.isArray(resposta?.data) ? resposta.data.length : 0) : Number(total);
}

export async function selecionarTodos(tabela, opcoes = {}) {
  const tamanhoPagina = Math.min(Number(opcoes.pageSize) || 1000, 1000);
  const primeira = await selecionar(tabela, { ...opcoes, limit: tamanhoPagina, offset: 0 });
  const saida = Array.isArray(primeira) ? [...primeira] : [];
  if (!Array.isArray(primeira) || primeira.length < tamanhoPagina) return saida;

  // Históricos grandes eram lidos página por página, somando uma latência de
  // rede para cada 1.000 linhas. As páginas seguintes são buscadas em lotes de
  // até 4 requisições paralelas, preservando a ordem e o mesmo resultado final.
  const concorrencia = 4;
  for (let base = tamanhoPagina; ; base += tamanhoPagina * concorrencia) {
    const paginas = await Promise.all(
      Array.from({ length: concorrencia }, (_valorIgnorado, indiceItem) =>
        selecionar(tabela, { ...opcoes, limit: tamanhoPagina, offset: base + indiceItem * tamanhoPagina }),
      ),
    );
    let terminou = false;
    for (const linhas of paginas) {
      if (!Array.isArray(linhas)) {
        terminou = true;
        break;
      }
      saida.push(...linhas);
      if (saida.length > 50000) throw new Error('Consulta muito grande. Refine os filtros.');
      if (linhas.length < tamanhoPagina) {
        terminou = true;
        break;
      }
    }
    if (terminou) break;
  }
  return saida;
}

export const cacheLeituras = new Map();

export function chaveFiltros(filtros = {}) {
  return Object.entries(filtros || {})
    .sort(([primeiroItem], [segundoItem]) => primeiroItem.localeCompare(segundoItem))
    .map(([chaveItem, veiculoItem]) => `${chaveItem}:${veiculoItem}`)
    .join('|');
}

export async function comCache(chave, leitor, validadeMilissegundos = 15000) {
  const agora = Date.now();
  const geracao = sessao.geracao;
  const entrada = cacheLeituras.get(chave);
  const atual = entrada?.geracao === geracao ? entrada : null;
  if (atual?.valor !== undefined && atual.expiraEm > agora) return atual.valor;
  if (atual?.promessa) return atual.promessa;
  const promessa = Promise.resolve()
    .then(leitor)
    .then((valor) => {
      if (sessao.geracao === geracao && cacheLeituras.get(chave)?.promessa === promessa) {
        cacheLeituras.set(chave, {
          valor,
          expiraEm: Date.now() + validadeMilissegundos,
          promessa: null,
          geracao,
        });
      }
      return valor;
    })
    .catch((erro) => {
      if (cacheLeituras.get(chave)?.promessa === promessa) cacheLeituras.delete(chave);
      throw erro;
    });
  cacheLeituras.set(chave, { valor: atual?.valor, expiraEm: atual?.expiraEm || 0, promessa, geracao });
  return promessa;
}

export function invalidarCache(...prefixos) {
  for (const chave of cacheLeituras.keys()) {
    if (prefixos.some((prefixo) => chave === prefixo || chave.startsWith(`${prefixo}:`)))
      cacheLeituras.delete(chave);
  }
}

export async function executarMutacao(executor, ...prefixos) {
  const resultado = await executor();
  invalidarCache(...prefixos);
  return resultado;
}

export async function chamarFuncaoDoServidor(nome, corpo) {
  const resposta = await requisitar(`/functions/v1/${nome}`, {
    method: 'POST',
    body: corpo,
    headers: {
      'Idempotency-Key': `ui-${Date.now().toString(36)}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`,
    },
  });
  return resposta?.data ?? resposta;
}
