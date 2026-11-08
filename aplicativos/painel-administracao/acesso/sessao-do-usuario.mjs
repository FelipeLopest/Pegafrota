export const CHAVE_SESSAO = 'pnf.admin.session';

export const sessao = {
  get() {
    try {
      const bruto = sessionStorage.getItem(CHAVE_SESSAO);
      return bruto ? JSON.parse(bruto) : null;
    } catch {
      return null;
    }
  },
  set(valor) {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(valor));
  },
  clear() {
    sessionStorage.removeItem(CHAVE_SESSAO);
  },
  get accessToken() {
    return this.get()?.access_token ?? null;
  },
};
