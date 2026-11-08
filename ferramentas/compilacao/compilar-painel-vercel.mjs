import { mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilarAplicativo } from '../apoio/compilar-aplicativo.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const painel = join(raiz, 'aplicativos/painel-administracao');
compilarAplicativo(
  new URL('../../aplicativos/painel-administracao/compilar-aplicativo.mjs', import.meta.url).href,
);
const destino = join(raiz, '.vercel/output');
rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });
cpSync(join(painel, 'dist'), join(destino, 'static'), { recursive: true });
const politica = readFileSync(join(painel, 'dist/politica-de-seguranca.txt'), 'utf8').trim();
writeFileSync(
  join(destino, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: '/(.*)',
          headers: {
            'Content-Security-Policy': politica,
            'X-Frame-Options': 'DENY',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'Cache-Control': 'no-cache',
          },
          continue: true,
        },
        { handle: 'filesystem' },
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log('Painel preparado em .vercel/output, com cabeçalhos de segurança.');
