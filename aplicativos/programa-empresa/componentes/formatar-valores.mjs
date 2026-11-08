export const formatar = {
  dateTime: (iso) =>
    iso
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
      : '—',
  date: (iso) => (iso ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso)) : '—'),
  km: (veiculoItem) =>
    veiculoItem == null ? '—' : `${new Intl.NumberFormat('pt-BR').format(Number(veiculoItem))} km`,
  money: (veiculoItem) =>
    veiculoItem == null
      ? '—'
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(veiculoItem)),
  liters: (veiculoItem) =>
    veiculoItem == null
      ? '—'
      : `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3 }).format(Number(veiculoItem))} L`,
  plate: (parametroItem) => (parametroItem ? String(parametroItem).toUpperCase() : '—'),
};

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { formatar as fmt };
