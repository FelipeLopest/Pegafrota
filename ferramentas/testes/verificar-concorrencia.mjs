#!/usr/bin/env node
import postgres from 'pg';
import { randomUUID as criarIdentificadorUnico } from 'node:crypto';

const ENDERECO_BANCO = process.env.DATABASE_URL;
const PARES = Number(process.env.PAIRS ?? 12);

async function conectarComo(usuarioIdentificador) {
  const cliente = new postgres.Client({ connectionString: ENDERECO_BANCO });
  await cliente.connect();
  await cliente.query('set role authenticated');
  await cliente.query('select set_config($1, $2, false)', [
    'request.jwt.claims',
    JSON.stringify({ sub: usuarioIdentificador, role: 'authenticated' }),
  ]);
  return cliente;
}

async function principal() {
  const administrador = new postgres.Client({ connectionString: ENDERECO_BANCO });
  await administrador.connect();

  const { rows: linhas } = await administrador.query(`
    select private.stable_uuid('company:auroraverde')     as company_id,
           private.stable_uuid('user:auroraverde:gestor') as manager_id
  `);
  const { company_id: empresaIdentificador, manager_id: gestorIdentificador } = linhas[0];

  const pares = [];
  for (let indiceItem = 0; indiceItem < PARES; indiceItem += 1) {
    const vIdentificador = criarIdentificadorUnico();
    const tIdentificador = criarIdentificadorUnico();
    const placa = `PRB${String(1000 + indiceItem)}`;
    await administrador.query(
      `insert into public.vehicles (id, company_id, plate, brand, model, fuel_type, current_odometer_km)
       values ($1, $2, $3, 'Sonda', 'Sonda', 'diesel_s10', 1000)`,
      [vIdentificador, empresaIdentificador, placa],
    );
    await administrador.query(
      `insert into public.trips (id, company_id, vehicle_id, status, origin_label,
                                 destination_label, actual_departure_at, start_odometer_km)
       values ($1, $2, $3, 'in_progress', 'Origem', 'Destino', now() - interval '2 hours', 1000)`,
      [tIdentificador, empresaIdentificador, vIdentificador],
    );
    await administrador.query(`update public.vehicles set status = 'in_use' where id = $1`, [vIdentificador]);
    pares.push({ vId: vIdentificador, tId: tIdentificador });
  }

  const primeiroItem = [];
  const segundoItem = [];
  for (let indiceItem2 = 0; indiceItem2 < PARES; indiceItem2 += 1) {
    primeiroItem.push(await conectarComo(gestorIdentificador));
    segundoItem.push(await conectarComo(gestorIdentificador));
  }

  const resolvido = await Promise.allSettled(
    pares.flatMap((parametroItem, indiceItem3) => [
      primeiroItem[indiceItem3].query(`select public.complete_trip($1, 1500)`, [parametroItem.tId]),
      segundoItem[indiceItem3].query(`select public.cancel_trip($1, 'sonda')`, [parametroItem.tId]),
    ]),
  );

  const codigos = resolvido
    .filter((textoItem) => textoItem.status === 'rejected')
    .map((textoItem) => textoItem.reason?.code);
  const impasses = codigos.filter((registro) => registro === '40P01').length;

  console.log(`banco:      ${ENDERECO_BANCO.split('/').pop()}`);
  console.log(`pares:      ${PARES}`);
  console.log(`sucessos:   ${resolvido.filter((textoItem) => textoItem.status === 'fulfilled').length}`);
  console.log(`deadlocks:  ${impasses}  <-- 40P01`);
  console.log(
    `outros:     ${JSON.stringify(
      codigos
        .filter((registro) => registro !== '40P01')
        .reduce(
          (acumulador, registro) => ({ ...acumulador, [registro]: (acumulador[registro] ?? 0) + 1 }),
          {},
        ),
    )}`,
  );

  for (const cliente of [...primeiroItem, ...segundoItem]) await cliente.end();
  await administrador.end();
  process.exitCode = 0;
}

principal().catch((erro) => {
  console.error('sonda falhou:', erro.message);
  process.exit(1);
});
