import { spawnSync as executar } from 'node:child_process';
import { readdirSync as listarPasta } from 'node:fs';
import { join as juntar } from 'node:path';

function encontrarTestes(pasta) {
  return listarPasta(pasta, { withFileTypes: true }).flatMap((entrada) =>
    entrada.isDirectory()
      ? ['node_modules', 'dist', 'artifacts'].includes(entrada.name)
        ? []
        : encontrarTestes(juntar(pasta, entrada.name))
      : entrada.name.endsWith('.test.mjs')
        ? [juntar(pasta, entrada.name)]
        : [],
  );
}
const arquivos = ['aplicativos', 'compartilhado'].flatMap(encontrarTestes);
const resultado = executar(process.execPath, ['--test', '--test-reporter=tap', ...arquivos], {
  stdio: 'inherit',
});
process.exit(resultado.status ?? 1);
