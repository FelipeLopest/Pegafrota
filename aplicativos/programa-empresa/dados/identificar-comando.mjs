const comandos = new WeakMap();
export function novoComando() {
  return crypto.randomUUID();
}
export function comandoPara(dados) {
  if (dados.commandId) return dados.commandId;
  const conteudo = JSON.stringify(dados);
  const anterior = comandos.get(dados);
  if (anterior?.conteudo === conteudo) return anterior.id;
  const id = novoComando();
  comandos.set(dados, { conteudo, id });
  return id;
}
