import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import { resolve as resolverCaminho } from 'node:path';

const raiz = resolverCaminho(import.meta.dirname, '../../..');
const telas = lerArquivoSincrono(
  resolverCaminho(raiz, 'aplicativos/painel-administracao/telas/exportar-telas.mjs'),
  'utf8',
);
const servicos = lerArquivoSincrono(
  resolverCaminho(raiz, 'aplicativos/painel-administracao/comunicacao/comunicacao-com-servidor.mjs'),
  'utf8',
);
const funcaoServidor = lerArquivoSincrono(
  resolverCaminho(raiz, 'supabase/functions/platform-admin/index.ts'),
  'utf8',
);
const migracaoAtual = lerArquivoSincrono(
  resolverCaminho(raiz, 'supabase/migrations/20260812000200_platform_hard_delete_user_management.sql'),
  'utf8',
);

testar('painel oferece gestão de todos os usuários da empresa', () => {
  verificarCondicao.match(telas, /Usuários da empresa/);
  verificarCondicao.match(telas, /Alterar senha/);
  verificarCondicao.match(telas, /Excluir usuário/);
  verificarCondicao.match(servicos, /member\.passwordReset/);
  verificarCondicao.match(servicos, /member\.delete/);
});

testar('redefinição de senha fica exclusivamente no backend com Auth Admin', () => {
  verificarCondicao.match(
    funcaoServidor,
    /auth\.admin\.updateUserById\(parametroItem\.userId, \{\s*password: senha,?\s*\}\)/,
  );
  verificarCondicao.doesNotMatch(telas, /service_role/i);
  verificarCondicao.match(migracaoAtual, /USER_NOT_ACTIVE/);
});

testar('exclusão individual protege o último administrador', () => {
  verificarCondicao.match(migracaoAtual, /LAST_ADMIN_PROTECTED/);
  verificarCondicao.match(migracaoAtual, /prepare_delete_company_member/);
  verificarCondicao.match(funcaoServidor, /auth\.admin\.deleteUser\(parametroItem\.userId, false\)/);
});

testar('empresa só pode ser apagada fisicamente depois de arquivada', () => {
  verificarCondicao.match(telas, /Excluir definitivamente/);
  verificarCondicao.match(migracaoAtual, /v_company\.status <> 'archived'/);
  verificarCondicao.match(migracaoAtual, /delete from public\.companies where id = p_company_id/);
  verificarCondicao.match(servicos, /company\.delete/);
});

testar('purge remove dados operacionais e preserva trilha global saneada', () => {
  for (const tabela of [
    'vehicle_movements',
    'plate_read_events',
    'fuelings',
    'maintenance_records',
    'trips',
    'vehicle_odometer_events',
    'cameras',
    'locations',
    'vehicles',
    'drivers',
    'company_memberships',
  ]) {
    verificarCondicao.match(migracaoAtual, new RegExp(`delete from public\\.${tabela}`));
  }
  verificarCondicao.match(migracaoAtual, /delete from audit\.events/);
  verificarCondicao.match(migracaoAtual, /update platform\.audit_events[\s\S]*company_id = null/);
  verificarCondicao.match(migracaoAtual, /company\.deleted_permanently/);
});
