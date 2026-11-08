import {
  existsSync as arquivoExiste,
  readdirSync as listarPastaSincrona,
  statSync as consultarArquivoSincrono,
} from 'node:fs';
import { join as juntarCaminhos } from 'node:path';

export function listarArquivos(diretorio, { ignorar = [] } = {}, saida = []) {
  if (!arquivoExiste(diretorio)) return saida;
  const bloqueados = ignorar instanceof Set ? ignorar : new Set(ignorar);
  for (const nome of listarPastaSincrona(diretorio)) {
    if (bloqueados.has(nome)) continue;
    const completo = juntarCaminhos(diretorio, nome);
    if (consultarArquivoSincrono(completo).isDirectory())
      listarArquivos(completo, { ignorar: bloqueados }, saida);
    else saida.push(completo);
  }
  return saida;
}
