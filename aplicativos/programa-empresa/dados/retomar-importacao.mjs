async function hash(texto) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bytes), (valor) => valor.toString(16).padStart(2, '0')).join('');
}

function uuidDoHash(valor) {
  return `${valor.slice(0, 8)}-${valor.slice(8, 12)}-4${valor.slice(13, 16)}-8${valor.slice(17, 20)}-${valor.slice(20, 32)}`;
}

export async function identificarImportacao({ empresa, usuario, modelo, linhas }) {
  const assinatura = await hash(JSON.stringify([empresa, usuario, modelo, linhas]));
  const chave = `pnf.importacao.${empresa}.${usuario}`;
  function lerLotes() {
    try {
      const valor = JSON.parse(localStorage.getItem(chave) || '{}');
      return valor && typeof valor === 'object' ? valor : {};
    } catch {
      return {};
    }
  }
  const gravadas = new Set(lerLotes()[assinatura]?.linhas || []);
  return {
    gravadas,
    async comando(linha) {
      return uuidDoHash(await hash(`${assinatura}:${linha}`));
    },
    confirmar(linha) {
      gravadas.add(linha);
      try {
        const lotes = lerLotes();
        lotes[assinatura] = {
          atualizado: Date.now(),
          linhas: [...new Set([...(lotes[assinatura]?.linhas || []), ...gravadas])],
        };
        const recentes = Object.entries(lotes)
          .sort(([, a], [, b]) => b.atualizado - a.atualizado)
          .slice(0, 8);
        localStorage.setItem(chave, JSON.stringify(Object.fromEntries(recentes)));
      } catch {
        /* O identificador continua estável mesmo sem armazenamento local. */
      }
    },
  };
}
