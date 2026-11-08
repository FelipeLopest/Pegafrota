import * as arquivos from 'node:fs';
import { dirname as obterPastaPai, resolve as resolverCaminho, relative as caminhoRelativo } from 'node:path';
import { fileURLToPath as converterEnderecoEmCaminho } from 'node:url';
export * from 'node:fs';
const raiz = resolverCaminho(obterPastaPai(converterEnderecoEmCaminho(import.meta.url)), '../..');
const areas = JSON.parse(
  arquivos.readFileSync(resolverCaminho(raiz, 'ferramentas/apoio/areas-de-codigo.json'), 'utf8'),
);
// As regressões estruturais precisam examinar as implementações reais, agora separadas.
// O leitor reúne apenas os fontes da área solicitada; os testes de comportamento importam os módulos normalmente.
export function lerCodigoParaTeste(caminho, opcoes) {
  const arquivo = caminho instanceof URL ? converterEnderecoEmCaminho(caminho) : String(caminho);
  const relativo = caminhoRelativo(raiz, arquivo).replaceAll('\\', '/');
  const partes = areas[relativo];
  if (partes?.length && !relativo.includes('/dist/')) {
    const conteudo =
      arquivos.readFileSync(caminho, 'utf8') +
      '\n' +
      partes.map((parte) => arquivos.readFileSync(resolverCaminho(raiz, parte), 'utf8')).join('\n');
    return typeof opcoes === 'string' || opcoes?.encoding ? conteudo : Buffer.from(conteudo);
  }
  return arquivos.readFileSync(caminho, opcoes);
}
export { lerCodigoParaTeste as readFileSync };

export default { ...arquivos, readFileSync: lerCodigoParaTeste };

export { existsSync, statSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
