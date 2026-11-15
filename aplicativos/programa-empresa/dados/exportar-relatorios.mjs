import { notificacao } from '../componentes/componentes-do-programa.mjs';

import { REPORTS as RELATORIOS } from './dados-do-programa.mjs';

import { humanizarColuna, ROTULO_VALOR } from '../componentes/indicadores-e-relatorios.mjs';

export function escaparCelulaCsv(valor, numerico = false) {
  const original = String(valor ?? '');
  const texto =
    numerico && /^-?\d+(?:\.\d+)?$/.test(original)
      ? original.replace('.', ',')
      : /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(original)
        ? `'${original}`
        : original;
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Exporta o relatório em CSV.
 *
 * Rótulos em português, números sem símbolos para permitir somas e
 * proteção contra células interpretadas como fórmulas pela planilha.
 *
 * Separador ponto e vírgula e BOM: é o que o Excel em português abre com as
 * colunas separadas e a acentuação certa, sem passar pelo assistente de
 * importação.
 */
export async function exportarCsv(nome, colunas, linhas) {
  const cabecalho = colunas
    .map((registro) => escaparCelulaCsv(humanizarColuna(registro)))
    .join(';');
  const corpo = linhas.map((resultadoItem) =>
    colunas
      .map((registro) => {
        const valor = resultadoItem[registro];
        const numerico =
          /(?:cost|amount|price|_km|quantity|segments|km_per_unit|liters|remaining)$/.test(
            registro,
          );
        const legivel =
          typeof valor === 'boolean'
            ? valor
              ? 'Sim'
              : 'Não'
            : ['status', 'source', 'movement_type', 'maintenance_type', 'fuel_type'].includes(
                  registro,
                ) && Object.hasOwn(ROTULO_VALOR, valor)
              ? ROTULO_VALOR[valor]
              : valor;
        return escaparCelulaCsv(legivel, numerico);
      })
      .join(';'),
  );
  const conteudoCsv = [cabecalho, ...corpo].join('\n');

  const rotuloArquivo = (
    RELATORIOS.find((resultadoItem) => resultadoItem.id === nome)?.label || nome
  )
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
