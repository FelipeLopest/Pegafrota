export const tema = {
  async get() {
    return window.pnf.getTheme();
  },
  async set(escolha) {
    const resultado = await window.pnf.setTheme(escolha);
    document.documentElement.setAttribute('data-theme', resultado.effective);
    document.documentElement.setAttribute('data-theme-choice', resultado.choice);
    return resultado;
  },
  async apply() {
    const { choice: escolha, effective: efetivo } = await window.pnf.getTheme();
    document.documentElement.setAttribute('data-theme', efetivo);
    document.documentElement.setAttribute('data-theme-choice', escolha);
  },
};

export function prefereMovimentoReduzido() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
