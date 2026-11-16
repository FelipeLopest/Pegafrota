const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

const raiz = path.resolve(__dirname, '../../..');
const banco = new PGlite({ extensions: { pgcrypto } });

async function executar() {
  try {
    await banco.exec(fs.readFileSync(
      path.join(raiz, 'ferramentas/testes/cameras/ambiente-descartavel.sql'), 'utf8',
    ));
    const pasta = path.join(raiz, 'supabase/migrations');
    const migracoes = fs.readdirSync(pasta).filter(nome => nome.endsWith('.sql')).sort();
    for (const nome of migracoes) {
      try {
        await banco.exec(fs.readFileSync(path.join(pasta, nome), 'utf8'));
      } catch (erro) {
        throw new Error(`Migration ${nome}: ${erro.message}`, { cause: erro });
      }
    }

    const admin = randomUUID();
    const cliente = randomUUID();
    await banco.query("insert into auth.users(id,email) values($1,'admin@example.test'),($2,'outro@example.test')", [admin, cliente]);
    await banco.query("insert into public.profiles(id,full_name) values($1,'Admin QA'),($2,'Busca Específica')", [admin, cliente]);
    await banco.query('insert into platform.admins(user_id) values($1)', [admin]);
    const empresa = randomUUID();
    await banco.query(
      "insert into public.companies(id,cnpj,legal_name,trade_name,timezone) values($1,'11444777000161','Transportadora QA','Frota QA','America/Sao_Paulo')",
      [empresa],
    );
    await banco.query(
      "insert into public.company_memberships(company_id,user_id,role) values($1,$2,'company_admin')",
      [empresa, cliente],
    );
    await banco.query(`
      insert into platform.audit_events(actor_user_id,action,occurred_at) values
        ($1,'company.provision','2026-11-12 00:00+00'),
        ($1,'company.update','2026-11-12 14:00+00'),
        ($1,'company.update','2026-11-12 23:00+00'),
        ($1,'local.midnight','2026-11-12 03:00+00'),
        ($1,'local.last','2026-11-13 02:59:59+00'),
        ($1,'local.next','2026-11-13 03:00+00'),
        ($2,'history.target','2026-11-11 00:00+00')
    `, [admin, cliente]);

    async function listar({
      ator = admin, acao = null, de = null, ate = null, pagina = 1,
      tamanho = 50, busca = null, fuso = 'UTC', papel = 'service_role',
    } = {}) {
      return banco.transaction(async (tx) => {
        await tx.exec(papel === 'service_role' ? 'set local role service_role' : 'set local role authenticated');
        return (await tx.query(
          'select platform.list_audit_events_filtered($1,$2,null,$3,$4,$5,$6,$7,$8) as resposta',
          [ator, acao, de, ate, pagina, tamanho, busca, fuso],
        )).rows[0].resposta;
      });
    }

    const noDia = await listar({ acao: 'company.', de: '2026-11-12', ate: '2026-11-12' });
    assert.equal(noDia.total, 3);
    assert.equal((await listar({ acao: 'company.' })).total, 3);
    assert.equal((await listar({ acao: 'company.update' })).total, 2);
    const dataLocal = await listar({
      acao: 'local.', de: '2026-11-12', ate: '2026-11-12', fuso: 'America/Sao_Paulo',
    });
    assert.deepEqual(dataLocal.items.map(item => item.action), ['local.last', 'local.midnight']);
    const primeiraSemBusca = await listar({ tamanho: 1 });
    const primeiraComBusca = await listar({ tamanho: 1, busca: 'busca especifica' });
    assert.notEqual(primeiraSemBusca.items[0].action, 'history.target');
    assert.equal(primeiraComBusca.total, 1);
    assert.equal(primeiraComBusca.items[0].action, 'history.target');
    await assert.rejects(listar({ ator: cliente }));
    await assert.rejects(listar({ papel: 'authenticated' }));
    await assert.rejects(
      listar({ de: '2026-11-12', ate: '2026-11-11' }), erro => erro.hint === 'INVALID_INPUT',
    );
    const porEmail = await banco.transaction(async (tx) => {
      await tx.exec('set local role service_role');
      return (await tx.query(
        'select platform.list_company_admins_filtered($1,$2,$3) as resposta',
        [admin, empresa, 'outro@example.test'],
      )).rows[0].resposta;
    });
    assert.equal(porEmail.total, 1);
    assert.equal(porEmail.items[0].email, 'outro@example.test');
    console.log(JSON.stringify({
      migracoes: migracoes.length,
      mesmoDia: noDia.total,
      buscaParcial: 3,
      fusoDaExibicao: dataLocal.items.map(item => item.action),
      buscaAntesDaPaginacao: primeiraComBusca.total,
      listaAdministradoresPorEmail: porEmail.total,
      acessoProtegido: true,
    }, null, 2));
  } finally {
    await banco.close();
  }
}

executar().catch((erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
