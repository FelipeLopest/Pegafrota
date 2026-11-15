import teste from 'node:test';
import verificar from 'node:assert/strict';
import { separarListaSql } from '../../../ferramentas/apoio/interpretar-lista-sql.mjs';
teste('Verificador entende JSON, precisão numérica e aspas SQL em valores padrão', () => {
  verificar.deepEqual(
    separarListaSql(
      "p_roi jsonb default '[0,0,1,1]'::jsonb, p_score numeric(9,2) default 0, p_text text default 'a''b,c'",
    ),
    [
      "p_roi jsonb default '[0,0,1,1]'::jsonb",
      ' p_score numeric(9,2) default 0',
      " p_text text default 'a''b,c'",
    ],
  );
});
