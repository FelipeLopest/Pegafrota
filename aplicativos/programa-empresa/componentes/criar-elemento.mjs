export function criarElemento(etiqueta, propriedades = {}, filhos = []) {
  const no = document.createElement(etiqueta);
  for (const [chaveItem, veiculoItem] of Object.entries(propriedades)) {
    if (veiculoItem == null || veiculoItem === false) continue;
    if (chaveItem === 'class') no.className = veiculoItem;
    else if (chaveItem === 'text') no.textContent = veiculoItem;
    else if (chaveItem === 'dataset') Object.assign(no.dataset, veiculoItem);
    else if (chaveItem.startsWith('on') && typeof veiculoItem === 'function') {
      no.addEventListener(chaveItem.slice(2).toLowerCase(), veiculoItem);
    } else no.setAttribute(chaveItem, veiculoItem === true ? '' : String(veiculoItem));
  }
  for (const registro of [].concat(filhos)) {
    if (registro == null) continue;
    no.append(registro instanceof Node ? registro : document.createTextNode(String(registro)));
  }
  return no;
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { criarElemento as el };
