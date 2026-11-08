#!/usr/bin/env node
import { createHmac as criarAssinaturaHmac } from 'node:crypto';

const SEGREDO = process.env.PNF_DEV_JWT_SECRET || 'pnf-desenvolvimento-segredo-local-0123456789';

const conteudoBase64 = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');

export function emitirToken(
  subparte,
  papel = 'authenticated',
  nivelAutenticacao = 'aal1',
  validadeSegundos = 3600,
) {
  const cabecalho = { alg: 'HS256', typ: 'JWT' };
  const agora = Math.floor(Date.now() / 1000);
  const dadosEnvio = {
    sub: subparte,
    role: papel,
    aal: nivelAutenticacao,
    iat: agora,
    exp: agora + validadeSegundos,
    iss: 'pnf-dev',
  };
  const dados = `${conteudoBase64(cabecalho)}.${conteudoBase64(dadosEnvio)}`;
  const assinaturaFuncao = criarAssinaturaHmac('sha256', SEGREDO).update(dados).digest('base64url');
  return `${dados}.${assinaturaFuncao}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [subparte, papel, nivelAutenticacao] = process.argv.slice(2);
  if (!subparte) {
    console.error('uso: dev-token.mjs <user-uuid> [role] [aal]');
    process.exit(1);
  }
  process.stdout.write(emitirToken(subparte, papel || 'authenticated', nivelAutenticacao || 'aal1'));
}
