// Disponibilidade na interface orienta o usuário. O banco confere novamente ao salvar.
export function impedimentoInicio(veiculo, motorista, viagens, hoje) {
  if (!veiculo) return 'Selecione ou cadastre um veículo.';
  if (veiculo.archived_at || veiculo.status === 'inactive' || veiculo.status === 'archived')
    return 'Escolha um veículo ativo.';
  if (veiculo.status === 'in_maintenance') return 'Este veículo está em manutenção. Escolha outro ou conclua a manutenção.';
  if (veiculo.status === 'in_use' || viagens.some((item) => item.status === 'in_progress' && item.vehicle_id === veiculo.id))
    return 'Este veículo já está em uma viagem. Conclua a viagem em andamento ou escolha outro.';
  if (!motorista) return 'Selecione ou cadastre um motorista.';
  if (!motorista.active || motorista.archived_at) return 'Escolha um motorista ativo.';
  if (viagens.some((item) => item.status === 'in_progress' && item.driver_id === motorista.id))
    return 'Este motorista já está em uma viagem. Escolha outro ou conclua a viagem em andamento.';
  if (motorista.license_expires_on && motorista.license_expires_on < hoje)
    return 'A CNH deste motorista está vencida. Atualize o cadastro ou escolha outro motorista.';
  return '';
}
