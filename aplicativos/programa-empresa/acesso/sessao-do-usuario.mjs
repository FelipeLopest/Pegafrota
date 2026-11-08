import { carregarConfiguracao } from '../sistema/carregar-configuracao-da-interface.mjs';
import { requisicaoServidor } from '../comunicacao/verificar-conexao.mjs';

export class SessaoUsuario {
  #memoria = null;
  #efemera = false;
  #persistir = true;
  #geracao = 0;

  get accessToken() {
    return this.#memoria?.access_token ?? null;
  }
  get refreshToken() {
    return this.#memoria?.refresh_token ?? null;
  }
  get isEphemeral() {
    return this.#efemera;
  }
  get geracao() {
    return this.#geracao;
  }
  get() {
    return this.#memoria;
  }

  async restore() {
    if (this.#memoria?.access_token) return this.#memoria;
    try {
      this.#memoria = await window.pnf.session.load();
    } catch {
      this.#memoria = null;
    }
    this.#geracao += 1;
    return this.#memoria;
  }

  async set(valor, { persistir = this.#persistir } = {}) {
    this.#memoria = valor;
    this.#persistir = persistir;
    this.#geracao += 1;
    this.#efemera = false;
    if (!persistir) {
      await window.pnf.session.clear();
      return;
    }
    try {
      const resultado = await window.pnf.session.save(valor);
      this.#efemera = resultado?.persisted === false;
    } catch {
      this.#efemera = true;
    }
  }

  async clear() {
    this.#memoria = null;
    this.#efemera = false;
    this.#persistir = true;
    this.#geracao += 1;
    try {
      await window.pnf.session.clear();
    } catch {
      /* já limpo */
    }
  }
}

export const sessao = new SessaoUsuario();

export let renovacaoEmAndamento = null;

export async function tentarRenovarSessao() {
  const geracaoInicial = sessao.geracao;
  const renovarToken = sessao.refreshToken;
  if (!renovarToken) return false;

  if (!renovacaoEmAndamento) {
    renovacaoEmAndamento = (async () => {
      try {
        const configuracao = await carregarConfiguracao();
        const resposta = await requisicaoServidor(
          `${configuracao.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: configuracao.anonKey },
            body: JSON.stringify({ refresh_token: renovarToken }),
          },
        );
        if (!resposta.ok) return false;
        const dadosRenovados = await resposta.json();
        if (sessao.geracao !== geracaoInicial) return false;
        await sessao.set(dadosRenovados);
        return true;
      } catch {
        return false;
      } finally {
        renovacaoEmAndamento = null;
      }
    })();
  }
  return renovacaoEmAndamento;
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { SessaoUsuario as Session };
export { renovacaoEmAndamento as refreshInFlight };
export { tentarRenovarSessao as tryRefresh };
