/**
 * Leitura local de planilhas para importação em massa.
 *
 * Não usa biblioteca externa nem envia o arquivo para servidor. O XLSX é um
 * contêiner ZIP de XML; aqui lemos somente o necessário para obter a primeira
 * aba como matriz de células. O objetivo é manter o Desktop leve e permitir que
 * uma empresa use diretamente a planilha que já possui.
 */

const MAXIMO_ARQUIVO_BYTES = 20 * 1024 * 1024;
const MAXIMO_ENTRADA_DESCOMPACTADA = 30 * 1024 * 1024;
const MAXIMO_LINHAS = 10000;
const MAXIMO_COLUNAS = 200;

function erroPlanilha(mensagem) {
  const erro = new Error(mensagem);
  erro.hint = 'SPREADSHEET_INVALID';
  return erro;
}

function decodificarXml(texto) {
  return String(texto ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_correspondenciaIgnorada, cabecalhos) =>
      String.fromCodePoint(parseInt(cabecalhos, 16)),
    )
    .replace(/&#(\d+);/g, (_correspondenciaIgnorada, dadosRegistro) =>
      String.fromCodePoint(Number(dadosRegistro)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function textoTags(documentoXml, nome = 't') {
  const expressaoRegular = new RegExp(
    `<(?:[A-Za-z0-9_]+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${nome}>`,
    'gi',
  );
  const partes = [];
  let correspondenciaItem;
  while ((correspondenciaItem = expressaoRegular.exec(documentoXml)))
    partes.push(decodificarXml(correspondenciaItem[1]));
  return partes.join('');
}

function indiceColuna(referencia) {
  const letras = /^([A-Z]+)/i.exec(referencia)?.[1]?.toUpperCase() || 'A';
  let valor = 0;
  for (const registro of letras) valor = valor * 26 + registro.charCodeAt(0) - 64;
  return valor - 1;
}

function normalizarAlvoZip(alvo) {
  const partes = [];
  for (const parametroItem of String(alvo || '')
    .replace(/\\/g, '/')
    .split('/')) {
    if (!parametroItem || parametroItem === '.') continue;
    if (parametroItem === '..') partes.pop();
    else partes.push(parametroItem);
  }
  return partes.join('/');
}

function localizarEocd(bytes) {
  // EOCD pode ter comentário de até 65535 bytes.
  const minimo = Math.max(0, bytes.length - 65557);
  for (let indiceItem = bytes.length - 22; indiceItem >= minimo; indiceItem -= 1) {
    if (
      bytes[indiceItem] === 0x50 &&
      bytes[indiceItem + 1] === 0x4b &&
      bytes[indiceItem + 2] === 0x05 &&
      bytes[indiceItem + 3] === 0x06
    )
      return indiceItem;
  }
  return -1;
}

function mapaEntradasZip(memoriaTemporaria) {
  const bytes = new Uint8Array(memoriaTemporaria);
  const visualizacao = new DataView(memoriaTemporaria);
  const eocd = localizarEocd(bytes);
  if (eocd < 0) throw erroPlanilha('Arquivo XLSX inválido: estrutura ZIP não encontrada.');

  const total = visualizacao.getUint16(eocd + 10, true);
  const inicioCentral = visualizacao.getUint32(eocd + 16, true);
  const decodificador = new TextDecoder('utf-8');
  const entradas = new Map();
  let posicao = inicioCentral;

  for (let quantidadeItem = 0; quantidadeItem < total; quantidadeItem += 1) {
    if (visualizacao.getUint32(posicao, true) !== 0x02014b50)
      throw erroPlanilha('Arquivo XLSX inválido: diretório ZIP corrompido.');
    const metodo = visualizacao.getUint16(posicao + 10, true);
    const tamanhoCompactado = visualizacao.getUint32(posicao + 20, true);
    const tamanhoOriginal = visualizacao.getUint32(posicao + 24, true);
    const nomeTamanho = visualizacao.getUint16(posicao + 28, true);
    const extraTamanho = visualizacao.getUint16(posicao + 30, true);
    const comentarioTamanho = visualizacao.getUint16(posicao + 32, true);
    const localDeslocamento = visualizacao.getUint32(posicao + 42, true);
    const nome = decodificador.decode(bytes.subarray(posicao + 46, posicao + 46 + nomeTamanho));

    if (tamanhoOriginal > MAXIMO_ENTRADA_DESCOMPACTADA)
      throw erroPlanilha(`Arquivo XLSX muito grande (${nome}).`);
    entradas.set(normalizarAlvoZip(nome), {
      metodo,
      tamanhoCompactado,
      tamanhoOriginal,
      localOffset: localDeslocamento,
    });
    posicao += 46 + nomeTamanho + extraTamanho + comentarioTamanho;
  }
  return { bytes, view: visualizacao, entradas };
}

async function lerEntradaZip(arquivoZip, nome) {
  const metadadosAtuais = arquivoZip.entradas.get(normalizarAlvoZip(nome));
  if (!metadadosAtuais) return null;
  const { view: visualizacao, bytes } = arquivoZip;
  const posicao = metadadosAtuais.localOffset;
  if (visualizacao.getUint32(posicao, true) !== 0x04034b50)
    throw erroPlanilha(`Entrada XLSX inválida: ${nome}.`);
  const nomeTamanho = visualizacao.getUint16(posicao + 26, true);
  const extraTamanho = visualizacao.getUint16(posicao + 28, true);
  const inicio = posicao + 30 + nomeTamanho + extraTamanho;
  const dados = bytes.slice(inicio, inicio + metadadosAtuais.tamanhoCompactado);

  if (metadadosAtuais.metodo === 0) return dados;
  if (metadadosAtuais.metodo !== 8)
    throw erroPlanilha(`XLSX usa compressão não suportada na entrada ${nome}.`);

  try {
    const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const memoriaTemporaria = await new Response(fluxo).arrayBuffer();
    if (memoriaTemporaria.byteLength > MAXIMO_ENTRADA_DESCOMPACTADA)
      throw erroPlanilha(`Entrada XLSX muito grande: ${nome}.`);
    return new Uint8Array(memoriaTemporaria);
  } catch (erro) {
    if (erro?.hint === 'SPREADSHEET_INVALID') throw erro;
    throw erroPlanilha(`Não foi possível descompactar a planilha (${nome}).`);
  }
}

async function lerXmlZip(arquivoZip, nome) {
  const bytes = await lerEntradaZip(arquivoZip, nome);
  return bytes ? new TextDecoder('utf-8').decode(bytes) : null;
}

function primeiraAba(pastaTrabalhoXml, relacoesXml) {
  const aba = /<(?:[A-Za-z0-9_]+:)?sheet\b[^>]*\br:id="([^"]+)"[^>]*>/i.exec(pastaTrabalhoXml || '');
  const relIdentificador = aba?.[1];
  if (!relIdentificador) return 'xl/worksheets/sheet1.xml';
  const relacoes = String(relacoesXml || '');
  const expressaoRegular = /<Relationship\b([^>]*)\/>/gi;
  let correspondenciaItem;
  while ((correspondenciaItem = expressaoRegular.exec(relacoes))) {
    const atributos = correspondenciaItem[1];
    const identificador = /\bId="([^"]+)"/i.exec(atributos)?.[1];
    if (identificador !== relIdentificador) continue;
    const alvo = /\bTarget="([^"]+)"/i.exec(atributos)?.[1];
    if (alvo) return normalizarAlvoZip(alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`);
  }
  return 'xl/worksheets/sheet1.xml';
}

function nomePrimeiraAba(pastaTrabalhoXml) {
  return decodificarXml(
    /<(?:[A-Za-z0-9_]+:)?sheet\b[^>]*\bname="([^"]+)"/i.exec(pastaTrabalhoXml || '')?.[1] || 'Planilha1',
  );
}

function lerStringsCompartilhadas(documentoXml) {
  if (!documentoXml) return [];
  const saida = [];
  const expressaoRegular = /<(?:[A-Za-z0-9_]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?si>/gi;
  let correspondenciaItem;
  while ((correspondenciaItem = expressaoRegular.exec(documentoXml)))
    saida.push(textoTags(correspondenciaItem[1], 't'));
  return saida;
}

function valorCelula(xmlCelula, tipo, compartilhadas) {
  if (tipo === 'inlineStr') return textoTags(xmlCelula, 't');
  const bruto = /<(?:[A-Za-z0-9_]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?v>/i.exec(xmlCelula)?.[1];
  if (bruto == null) return '';
  const valor = decodificarXml(bruto);
  if (tipo === 's') return compartilhadas[Number(valor)] ?? '';
  if (tipo === 'b') return valor === '1' ? 'SIM' : 'NAO';
  return valor;
}

function matrizDaAba(abaXml, compartilhadas) {
  const linhas = [];
  const reLinha = /<(?:[A-Za-z0-9_]+:)?row\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?row>/gi;
  let mLinha;
  let contador = 0;
  while ((mLinha = reLinha.exec(abaXml || ''))) {
    contador += 1;
    if (contador > MAXIMO_LINHAS + 1)
      throw erroPlanilha(`A planilha excede o limite de ${MAXIMO_LINHAS} linhas.`);
    const numeroLinha = Number(/\br="(\d+)"/i.exec(mLinha[1])?.[1] || contador);
    const celulas = [];
    const reCelula = /<(?:[A-Za-z0-9_]+:)?c\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?c>/gi;
    let mCelula;
    while ((mCelula = reCelula.exec(mLinha[2]))) {
      const atributos = mCelula[1];
      const referencia = /\br="([A-Z]+\d+)"/i.exec(atributos)?.[1] || `A${numeroLinha}`;
      const coluna = indiceColuna(referencia);
      if (coluna >= MAXIMO_COLUNAS)
        throw erroPlanilha(`A planilha excede o limite de ${MAXIMO_COLUNAS} colunas.`);
      const tipo = /\bt="([^"]+)"/i.exec(atributos)?.[1] || '';
      celulas[coluna] = valorCelula(mCelula[2], tipo, compartilhadas);
    }
    linhas.push({ numero: numeroLinha, celulas });
  }
  return linhas;
}

/**
 * Lê a primeira aba de um .xlsx e devolve linhas no mesmo formato do leitor CSV.
 * Datas numéricas do Excel permanecem como número textual; `dataPlanilha()` faz
 * a conversão somente quando o campo esperado é uma data.
 */
export async function lerXlsx(memoriaTemporaria) {
  if (!(memoriaTemporaria instanceof ArrayBuffer)) throw erroPlanilha('Arquivo XLSX inválido.');
  if (memoriaTemporaria.byteLength === 0) return { cabecalho: [], linhas: [], aba: null, formato: 'xlsx' };
  if (memoriaTemporaria.byteLength > MAXIMO_ARQUIVO_BYTES)
    throw erroPlanilha('O arquivo XLSX excede 20 MB. Divida a importação em arquivos menores.');

  const arquivoZip = mapaEntradasZip(memoriaTemporaria);
  const pastaTrabalhoXml = await lerXmlZip(arquivoZip, 'xl/workbook.xml');
  const relacoesXml = await lerXmlZip(arquivoZip, 'xl/_rels/workbook.xml.rels');
  const caminhoAba = primeiraAba(pastaTrabalhoXml, relacoesXml);
  const [abaXml, compartilhadoXml] = await Promise.all([
    lerXmlZip(arquivoZip, caminhoAba),
    lerXmlZip(arquivoZip, 'xl/sharedStrings.xml'),
  ]);
  if (!abaXml) throw erroPlanilha('A primeira aba do arquivo XLSX não foi encontrada.');

  const matriz = matrizDaAba(abaXml, lerStringsCompartilhadas(compartilhadoXml));
  // Muitas planilhas corporativas trazem um título isolado antes do cabeçalho.
  // Prefira a primeira linha com pelo menos duas células preenchidas; se não
  // houver, mantenha o comportamento tolerante de usar a primeira não vazia.
  const preenchidas = (linhaItem) =>
    linhaItem.celulas.filter((registro) => String(registro ?? '').trim() !== '').length;
  const cabecalhoLinha =
    matriz.find((linhaItem) => preenchidas(linhaItem) >= 2) ||
    matriz.find((linhaItem) => preenchidas(linhaItem) > 0);
  if (!cabecalhoLinha)
    return { cabecalho: [], linhas: [], aba: nomePrimeiraAba(pastaTrabalhoXml), formato: 'xlsx' };

  const cabecalho = cabecalhoLinha.celulas.map((registro) => String(registro ?? '').trim());
  const linhas = matriz
    .filter(
      (linhaItem) =>
        linhaItem.numero > cabecalhoLinha.numero &&
        linhaItem.celulas.some((registro) => String(registro ?? '').trim() !== ''),
    )
    .map((linhaItem) => ({ __linha: linhaItem.numero, __celulas: linhaItem.celulas }));

  return { cabecalho, linhas, aba: nomePrimeiraAba(pastaTrabalhoXml), formato: 'xlsx' };
}

/** Converte as linhas matriciais do XLSX em objetos indexados pelo cabeçalho. */
export function objetosXlsx(resultado, normalizarCabecalho) {
  const cabecalho = resultado?.cabecalho || [];
  return (resultado?.linhas || []).map((linha) => {
    const objeto = { __linha: linha.__linha };
    cabecalho.forEach((titulo, indice) => {
      objeto[normalizarCabecalho(titulo)] = linha.__celulas?.[indice] ?? '';
    });
    return objeto;
  });
}
