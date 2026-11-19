import testar from 'node:test';
import verificar from 'node:assert/strict';
import { impedimentoInicio } from '../formularios/regras-inicio-viagem.mjs';

const veiculo = { id: 'veiculo', status: 'available' };
const motorista = { id: 'motorista', active: true, license_expires_on: '2027-01-01' };
const conferir = (ativo = veiculo, condutor = motorista, viagens = []) =>
  impedimentoInicio(ativo, condutor, viagens, '2026-11-18');

testar('viagem pode iniciar sem cadastro de pátio ou passagem inicial', () => {
  verificar.equal(conferir(), '');
});
testar('indica como resolver a falta de veículo ou motorista', () => {
  verificar.match(conferir(null), /cadastre um veículo/);
  verificar.match(conferir(veiculo, null), /cadastre um motorista/);
});
testar('bloqueios operacionais mostram motivo sem impedir o planejamento', () => {
  verificar.match(conferir({ ...veiculo, status: 'in_maintenance' }), /manutenção/);
  verificar.match(conferir({ ...veiculo, status: 'in_use' }), /viagem em andamento/);
  verificar.match(conferir({ ...veiculo, archived_at: '2026-01-01' }), /ativo/);
  verificar.match(conferir(veiculo, { ...motorista, active: false }), /ativo/);
});
testar('consulta todas as viagens abertas e distingue concluídas', () => {
  const antigas = Array.from({ length: 80 }, () => ({ status: 'completed', driver_id: motorista.id }));
  verificar.equal(conferir(veiculo, motorista, antigas), '');
  verificar.match(conferir(veiculo, motorista, [...antigas, { status: 'in_progress', driver_id: motorista.id }]), /motorista já está/);
  verificar.match(conferir(veiculo, motorista, [{ status: 'in_progress', vehicle_id: veiculo.id }]), /veículo já está/);
});
testar('CNH é comparada com o dia da empresa e continua válida no vencimento', () => {
  verificar.match(conferir(veiculo, { ...motorista, license_expires_on: '2026-11-17' }), /vencida/);
  verificar.equal(conferir(veiculo, { ...motorista, license_expires_on: '2026-11-18' }), '');
  verificar.equal(conferir(veiculo, { ...motorista, license_expires_on: null }), '');
});
