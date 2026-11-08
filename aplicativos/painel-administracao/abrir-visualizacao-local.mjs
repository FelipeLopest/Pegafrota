#!/usr/bin/env node
import { createServer as criarServidor } from 'node:http';
import {
  readFileSync as lerArquivoSincrono,
  existsSync as arquivoExiste,
  statSync as consultarArquivoSincrono,
} from 'node:fs';
import {
  join as juntarCaminhos,
  extname as obterExtensao,
  dirname as obterPastaPai,
  resolve as resolverCaminho,
  normalize as normalizar,
} from 'node:path';
import { fileURLToPath as converterEnderecoEmCaminho } from 'node:url';

const PASTA_COMPILADA = resolverCaminho(
  obterPastaPai(converterEnderecoEmCaminho(import.meta.url)),
  'dist',
);
const PORTA = Number(process.env.PORT || 5174);

if (!arquivoExiste(PASTA_COMPILADA)) {
  console.error('dist ausente. Rode `npm run build:admin` antes.');
  process.exit(1);
}

const arquivoPolitica = juntarCaminhos(PASTA_COMPILADA, 'politica-de-seguranca.txt');
const politicaDeSeguranca = arquivoExiste(arquivoPolitica)
  ? lerArquivoSincrono(arquivoPolitica, 'utf8').trim()
  : "frame-ancestors 'none'";

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

criarServidor((requisicao, resposta) => {
  const endereco = decodeURIComponent((requisicao.url || '/').split('?')[0]);
  const alvo = normalizar(
    juntarCaminhos(PASTA_COMPILADA, endereco === '/' ? 'index.html' : endereco),
  );
  if (!alvo.startsWith(PASTA_COMPILADA)) {
    resposta.writeHead(403).end('Forbidden');
    return;
  }

  const arquivo =
    arquivoExiste(alvo) && consultarArquivoSincrono(alvo).isFile()
      ? alvo
      : juntarCaminhos(PASTA_COMPILADA, 'index.html');

  resposta.writeHead(200, {
    'Content-Type': TIPOS[obterExtensao(arquivo)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': politicaDeSeguranca,
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  });
  resposta.end(lerArquivoSincrono(arquivo));
}).listen(PORTA, () => {
  console.log(`Admin Web em http://localhost:${PORTA}`);
});
