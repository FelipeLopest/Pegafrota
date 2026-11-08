import { notificacao } from '../componentes/componentes-do-programa.mjs';

import { REPORTS as RELATORIOS } from './dados-do-programa.mjs';

import { humanizarColuna, formatarCelula } from '../componentes/indicadores-e-relatorios.mjs';

/**
 * Exporta o relatório em CSV.
 *
 * O cabeçalho vai com os RÓTULOS em português e os valores já formatados —
 * antes saíam os nomes crus das colunas (`total_cost`, `movement_type`) e os
 * códigos internos, e quem abria a planilha precisava de um tradutor.
 *
 * Separador ponto e vírgula e BOM: é o que o Excel em português abre com as
 * colunas separadas e a acentuação certa, sem passar pelo assistente de
 * importação.
 */
export async function exportarCsv(nome, colunas, linhas) {
  const escaparTexto = (veiculoItem) => {
    const textoItem = String(veiculoItem ?? '');
    return /[";\n]/.test(textoItem) ? `"${textoItem.replace(/"/g, '""')}"` : textoItem;
  };

  const cabecalho = colunas.map((registro) => escaparTexto(humanizarColuna(registro))).join(';');
  const corpo = linhas.map((resultadoItem) =>
    colunas.map((registro) => escaparTexto(formatarCelula(resultadoItem[registro], registro))).join(';'),
  );
  const conteudoCsv = [cabecalho, ...corpo].join('\n');

  const rotuloArquivo = (RELATORIOS.find((resultadoItem) => resultadoItem.id === nome)?.label || nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();

  try {
    const resposta = await window.pnf.exportFile({
      suggestedName: `${rotuloArquivo}-${new Date().toISOString().slice(0, 10)}`,
      content: `\uFEFF${conteudoCsv}`,
      format: 'csv',
    });
    if (resposta.saved) notificacao('Relatório exportado.', { tone: 'success' });
  } catch (erro) {
    notificacao('Não foi possível exportar.', { tone: 'danger' });
  }
}
