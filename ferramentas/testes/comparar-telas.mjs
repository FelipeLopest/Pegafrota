#!/usr/bin/env node
import {
  readFileSync as lerArquivoSincrono,
  writeFileSync as gravarArquivoSincrono,
  existsSync as arquivoExiste,
  readdirSync as listarPastaSincrona,
  mkdirSync as criarPastaSincrona,
} from 'node:fs';
import { join as juntarCaminhos, resolve as resolverCaminho, dirname as obterPastaPai } from 'node:path';
import { fileURLToPath as converterEnderecoEmCaminho } from 'node:url';
import { PNG as ImagemPng } from 'pngjs';
import compararPixels from 'pixelmatch';

const AQUI = obterPastaPai(converterEnderecoEmCaminho(import.meta.url));
const RAIZ = resolverCaminho(AQUI, '../..');
const CAPTURAS = juntarCaminhos(RAIZ, 'artifacts/screenshots');
const PASTA_IMAGENS_REFERENCIA = juntarCaminhos(CAPTURAS, 'design');
const PASTA_IMAGENS_IMPLEMENTACAO = juntarCaminhos(CAPTURAS, 'implementation');
const DIFERENCAS = juntarCaminhos(CAPTURAS, 'diff');

const LIMITE_DIFERENCA_PIXELS = 0.12;
const SIMILARIDADE_MINIMA_ESTRUTURA = 0.8;
const COLUNAS_GRADE = 24;
const LINHAS_GRADE = 16;

const ignorar = (correspondenciaItem) => {
  console.log(`visual:similarity  NÃO EXECUTADO — ${correspondenciaItem}`);
  process.exit(2);
};

if (!arquivoExiste(PASTA_IMAGENS_REFERENCIA) || !arquivoExiste(PASTA_IMAGENS_IMPLEMENTACAO)) {
  ignorar('sem capturas: rode `npm run visual:routes` antes');
}
criarPastaSincrona(DIFERENCAS, { recursive: true });

const carregar = (arquivo) => ImagemPng.sync.read(lerArquivoSincrono(arquivo));

function redimensionarPara(imagemPng, largura, altura) {
  const saida = new ImagemPng({ width: largura, height: altura });
  for (let outroItemComparado = 0; outroItemComparado < altura; outroItemComparado += 1) {
    const coordenadaOrigemY = Math.min(
      imagemPng.height - 1,
      Math.floor((outroItemComparado * imagemPng.height) / altura),
    );
    for (let itemComparado = 0; itemComparado < largura; itemComparado += 1) {
      const coordenadaOrigemX = Math.min(
        imagemPng.width - 1,
        Math.floor((itemComparado * imagemPng.width) / largura),
      );
      const indiceOrigem = (coordenadaOrigemY * imagemPng.width + coordenadaOrigemX) * 4;
      const indiceDestino = (outroItemComparado * largura + itemComparado) * 4;
      saida.data[indiceDestino] = imagemPng.data[indiceOrigem];
      saida.data[indiceDestino + 1] = imagemPng.data[indiceOrigem + 1];
      saida.data[indiceDestino + 2] = imagemPng.data[indiceOrigem + 2];
      saida.data[indiceDestino + 3] = imagemPng.data[indiceOrigem + 3];
    }
  }
  return saida;
}

function assinatura(imagemPng) {
  const celulas = [];
  const larguraCelula = imagemPng.width / COLUNAS_GRADE;
  const caractere = imagemPng.height / LINHAS_GRADE;

  for (let resultadoItem = 0; resultadoItem < LINHAS_GRADE; resultadoItem += 1) {
    for (let registro = 0; registro < COLUNAS_GRADE; registro += 1) {
      let soma = 0;
      let quantidadeItem = 0;
      const coordenadaInicialX = Math.floor(registro * larguraCelula);
      const coordenadaFinalX = Math.floor((registro + 1) * larguraCelula);
      const coordenadaInicialY = Math.floor(resultadoItem * caractere);
      const coordenadaFinalY = Math.floor((resultadoItem + 1) * caractere);

      for (
        let outroItemComparado = coordenadaInicialY;
        outroItemComparado < coordenadaFinalY;
        outroItemComparado += 3
      ) {
        for (let itemComparado = coordenadaInicialX; itemComparado < coordenadaFinalX; itemComparado += 3) {
          const indiceItem = (outroItemComparado * imagemPng.width + itemComparado) * 4;
          soma +=
            0.2126 * imagemPng.data[indiceItem] +
            0.7152 * imagemPng.data[indiceItem + 1] +
            0.0722 * imagemPng.data[indiceItem + 2];
          quantidadeItem += 1;
        }
      }
      celulas.push(quantidadeItem ? soma / quantidadeItem : 0);
    }
  }
  return celulas;
}

function estruturalCorrespondencia(primeiroItem, segundoItem) {
  const classe = (veiculoItem) => (veiculoItem < 85 ? 0 : veiculoItem < 190 ? 1 : 2);
  let ocorrencias = 0;
  for (let indiceItem = 0; indiceItem < primeiroItem.length; indiceItem += 1)
    if (classe(primeiroItem[indiceItem]) === classe(segundoItem[indiceItem])) ocorrencias += 1;
  return ocorrencias / primeiroItem.length;
}

const arquivosDesign = listarPastaSincrona(PASTA_IMAGENS_REFERENCIA).filter((formulario) =>
  formulario.endsWith('.png'),
);
const arquivosImplementacao = new Set(
  listarPastaSincrona(PASTA_IMAGENS_IMPLEMENTACAO).filter((formulario) => formulario.endsWith('.png')),
);
const pares = [];
const semPar = [];

for (const formulario of arquivosDesign) {
  const [produto, rota, largura, temaExtensao] = formulario.replace('.png', '').split('__');
  if (!arquivosImplementacao.has(formulario)) {
    semPar.push(formulario);
    continue;
  }
  pares.push({
    id: formulario.replace('.png', ''),
    produto,
    rota,
    largura: Number(largura),
    tema: temaExtensao,
    a: juntarCaminhos(PASTA_IMAGENS_REFERENCIA, formulario),
    b: juntarCaminhos(PASTA_IMAGENS_IMPLEMENTACAO, formulario),
  });
}

const soImpl = [...arquivosImplementacao].filter((formulario2) => !arquivosDesign.includes(formulario2));

if (pares.length === 0) ignorar('nenhum par protótipo/implementação encontrado');

const resultados = [];

for (const par of pares) {
  const PRIMEIRO = carregar(par.a);
  const SEGUNDO = carregar(par.b);

  const largura = Math.min(PRIMEIRO.width, SEGUNDO.width);
  const altura = Math.min(PRIMEIRO.height, SEGUNDO.height);
  const primeiroItem =
    PRIMEIRO.width === largura && PRIMEIRO.height === altura
      ? PRIMEIRO
      : redimensionarPara(PRIMEIRO, largura, altura);
  const segundoItem =
    SEGUNDO.width === largura && SEGUNDO.height === altura
      ? SEGUNDO
      : redimensionarPara(SEGUNDO, largura, altura);

  const diferenca = new ImagemPng({ width: largura, height: altura });
  const pixelsDiferenca = compararPixels(
    primeiroItem.data,
    segundoItem.data,
    diferenca.data,
    largura,
    altura,
    {
      threshold: LIMITE_DIFERENCA_PIXELS,
      includeAA: false,
    },
  );
  const proporcaoDiferenca = pixelsDiferenca / (largura * altura);

  const estrutura2 = estruturalCorrespondencia(assinatura(primeiroItem), assinatura(segundoItem));

  const arquivoDiferenca = juntarCaminhos(DIFERENCAS, `${par.id}__diff.png`);
  gravarArquivoSincrono(arquivoDiferenca, ImagemPng.sync.write(diferenca));

  resultados.push({
    ...par,
    a: undefined,
    b: undefined,
    largura: par.largura,
    diffPixels: pixelsDiferenca,
    diffRatio: Number(proporcaoDiferenca.toFixed(4)),
    estrutura: Number(estrutura2.toFixed(4)),
    veredito: estrutura2 >= SIMILARIDADE_MINIMA_ESTRUTURA ? 'aprovado' : 'corrigir',
    diffFile: `diff/${par.id}__diff.png`,
  });
}

resultados.sort(
  (itemComparado, outroItemComparado) => itemComparado.estrutura - outroItemComparado.estrutura,
);

console.log('visual:similarity — semelhança medida contra o Design aprovado\n');
console.log(`  limiar de cor por pixel : ${LIMITE_DIFERENCA_PIXELS}`);
console.log(`  mínimo estrutural       : ${SIMILARIDADE_MINIMA_ESTRUTURA}`);
console.log(`  grade                   : ${COLUNAS_GRADE}×${LINHAS_GRADE} blocos\n`);

const janelaItem = (textoItem, quantidadeItem) => String(textoItem).padEnd(quantidadeItem);
console.log(
  `  ${janelaItem('produto', 9)}${janelaItem('rota', 16)}${janelaItem('larg', 6)}${janelaItem('tema', 7)}${janelaItem('estrut', 8)}${janelaItem('pixels', 8)}veredito`,
);
for (const resultadoItem of resultados) {
  console.log(
    `  ${janelaItem(resultadoItem.produto, 9)}${janelaItem(resultadoItem.rota, 16)}${janelaItem(resultadoItem.largura, 6)}${janelaItem(resultadoItem.tema, 7)}` +
      `${janelaItem(resultadoItem.estrutura.toFixed(3), 8)}${janelaItem(`${(resultadoItem.diffRatio * 100).toFixed(1)}%`, 8)}` +
      `${resultadoItem.veredito === 'aprovado' ? 'aprovado' : 'CORRIGIR'}`,
  );
}

const corrigir = resultados.filter((resultadoItem2) => resultadoItem2.veredito === 'corrigir');

gravarArquivoSincrono(
  juntarCaminhos(CAPTURAS, 'similaridade.json'),
  JSON.stringify(
    {
      semParNoDesign: soImpl.map((formulario2) => formulario2.replace('.png', '')),
      geradoEm: new Date().toISOString(),
      limiares: {
        pixel: LIMITE_DIFERENCA_PIXELS,
        estrutural: SIMILARIDADE_MINIMA_ESTRUTURA,
        grade: [COLUNAS_GRADE, LINHAS_GRADE],
      },
      metodo: 'pixelmatch + assinatura estrutural por blocos de luminância',
      totalPares: resultados.length,
      aprovados: resultados.length - corrigir.length,
      corrigir: corrigir.length,
      resultados,
    },
    null,
    2,
  ),
);

if (soImpl.length) {
  console.log(`\n  ${soImpl.length} captura(s) da implementação sem tela equivalente na`);
  console.log('  navegação do protótipo (alcançadas de dentro de outras telas):');
  for (const formulario2 of soImpl.slice(0, 8)) console.log(`    ${formulario2.replace('.png', '')}`);
}

console.log(`\n  imagens de diferença: ${DIFERENCAS}`);
console.log(`  ${resultados.length - corrigir.length}/${resultados.length} pares acima do mínimo estrutural`);

if (corrigir.length) {
  console.error(`\nvisual:similarity  FAIL — ${corrigir.length} par(es) abaixo do mínimo:`);
  for (const resultadoItem2 of corrigir) {
    console.error(
      `    ${resultadoItem2.produto}/${resultadoItem2.rota} ${resultadoItem2.largura} ${resultadoItem2.tema}  estrutura=${resultadoItem2.estrutura.toFixed(3)}`,
    );
  }
  console.error('\n  Revise as imagens de diferença antes de corrigir — o número aponta,');
  console.error('  a imagem explica.');
  process.exit(1);
}

console.log('\nvisual:similarity  PASS — todos os pares acima do mínimo estrutural');
console.log('  ATENÇÃO: número não substitui revisão. As imagens de diferença ficam');
console.log('  gravadas justamente para serem olhadas.');
