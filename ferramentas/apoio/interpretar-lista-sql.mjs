// Separa parâmetros sem confundir vírgulas dentro de strings SQL e parênteses.
export function separarListaSql(fonte) {
  const partes = [];
  let trecho = '';
  let profundidade = 0;
  let aspas = null;
  for (let indice = 0; indice < fonte.length; indice++) {
    const caractere = fonte[indice];
    if (aspas) {
      trecho += caractere;
      if (caractere === aspas) {
        if (fonte[indice + 1] === aspas) trecho += fonte[++indice];
        else aspas = null;
      }
      continue;
    }
    if (caractere === "'" || caractere === '"') aspas = caractere;
    else if (caractere === '(') profundidade++;
    else if (caractere === ')') profundidade--;
    if (caractere === ',' && profundidade === 0 && !aspas) {
      partes.push(trecho);
      trecho = '';
    } else trecho += caractere;
  }
  if (trecho.trim()) partes.push(trecho);
  return partes;
}
