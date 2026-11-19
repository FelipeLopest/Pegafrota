import testar from 'node:test';
import verificar from 'node:assert/strict';
import { execFileSync as executar } from 'node:child_process';
import { fileURLToPath as caminho } from 'node:url';

testar('verificador encontra os contratos reorganizados sem conexão ou credenciais', () => {
  const raiz = caminho(new URL('../../../', import.meta.url));
  const resultado = JSON.parse(executar(process.execPath,
    ['ferramentas/administracao/verificar-backend.mjs', '--listar-contratos'],
    { cwd: raiz, encoding: 'utf8' }));
  verificar.equal(resultado.migration, '20261118000100');
  for (const nome of ['save_trip', 'trip_operation', 'create_and_start_trip', 'fleet_workflow_settings', 'save_fueling'])
    verificar.ok(resultado.functions.includes(nome), nome);
  verificar.ok(resultado.signatures.includes('public.create_and_start_trip(jsonb,numeric,timestamptz,uuid,uuid)'));
});
