const dataLocal = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

export function formatarDataCalendario(valor) {
  if (!valor) return '—';
  const partes = typeof valor === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (partes) {
    const [, ano, mes, dia] = partes;
    return `${dia}/${mes}/${ano}`;
  }
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '—' : dataLocal.format(data);
}
