import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import { resolve as resolverCaminho } from 'node:path';

const raiz = resolverCaminho(import.meta.dirname, '../../..');
const tela = lerArquivoSincrono(
  resolverCaminho(raiz, 'aplicativos/painel-administracao/telas/exportar-telas.mjs'),
  'utf8',
);
const funcaoServidor = lerArquivoSincrono(
  resolverCaminho(raiz, 'supabase/functions/platform-admin/index.ts'),
  'utf8',
);
const migracaoAtual = lerArquivoSincrono(
  resolverCaminho(raiz, 'supabase/migrations/20260812000100_company_admin_password_login.sql'),
  'utf8',
);

// Garante que a senha é definida no painel e enviada apenas para a Edge Function.
testar('primeiro administrador usa senha direta, sem convite', () => {
  verificarCondicao.match(tela, /adminPassword/);
  verificarCondicao.match(tela, /password:\s*formulario\.adminPassword/);
  verificarCondicao.match(tela, /Nenhum link de convite será necessário/);
  verificarCondicao.match(funcaoServidor, /auth\.admin\.createUser\(\{/);
  verificarCondicao.match(funcaoServidor, /password:\s*senha/);
  verificarCondicao.match(funcaoServidor, /email_confirm:\s*true/);
  verificarCondicao.match(funcaoServidor, /provision_first_admin_password/);
});

testar('senha não é persistida no payload auditável da operação', () => {
  verificarCondicao.match(funcaoServidor, /primeiroAdministradorAuditavel/);
  const trecho = funcaoServidor.slice(
    funcaoServidor.indexOf('const primeiroAdministradorAuditavel'),
    funcaoServidor.indexOf("const aberto = await chamarPlataforma('open_operation'"),
  );
  verificarCondicao.doesNotMatch(trecho, /password\s*:/);
});

testar('vínculo nasce ativo e convite é ignorado', () => {
  verificarCondicao.match(migracaoAtual, /'company_admin', true/);
  verificarCondicao.match(migracaoAtual, /'send_invite',\s*'skipped'/s);
  verificarCondicao.match(migracaoAtual, /'inviteSent', false/);
  verificarCondicao.match(migracaoAtual, /platform\.finish_provisioning/);
});
