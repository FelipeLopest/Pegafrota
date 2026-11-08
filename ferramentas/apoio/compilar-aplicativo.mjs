import { lerConfiguracaoPublica } from './configuracao-publica.mjs';
import {
  cpSync as copiar,
  existsSync as existe,
  mkdirSync as criarPasta,
  readFileSync as lerArquivo,
  readdirSync as listarPasta,
  rmSync as remover,
  writeFileSync as gravarArquivo,
} from 'node:fs';
import {
  dirname as pastaPai,
  join as juntar,
  relative as caminhoRelativo,
  resolve as resolver,
} from 'node:path';
import { fileURLToPath as caminhoDoEndereco } from 'node:url';

export function listarArquivos(pasta) {
  return listarPasta(pasta, { withFileTypes: true }).flatMap((entrada) =>
    entrada.isDirectory()
      ? listarArquivos(juntar(pasta, entrada.name))
      : [juntar(pasta, entrada.name)],
  );
}

export function validarImportsLocais(pasta) {
  const arquivos = listarArquivos(pasta).filter((arquivo) => arquivo.endsWith('.mjs'));
  const catalogo = new Map(
    arquivos.map((arquivo) => [
      arquivo,
      { nomes: new Set(), referencias: [], codigo: lerArquivo(arquivo, 'utf8') },
    ]),
  );
  for (const [arquivo, item] of catalogo) {
    for (const declaracao of item.codigo.matchAll(
      /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/g,
    ))
      item.nomes.add(declaracao[1]);
    for (const grupo of item.codigo.matchAll(/export\s*\{([^}]+)\}/gs))
      for (const nome of grupo[1].split(','))
        item.nomes.add(
          nome
            .trim()
            .split(/\s+as\s+/)
            .at(-1),
        );
    for (const grupo of item.codigo.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g))
      item.referencias.push(resolver(pastaPai(arquivo), grupo[1]));
  }
  let alterado = true;
  while (alterado) {
    alterado = false;
    for (const item of catalogo.values())
      for (const referencia of item.referencias)
        for (const nome of catalogo.get(referencia)?.nomes || [])
          if (!item.nomes.has(nome)) {
            item.nomes.add(nome);
            alterado = true;
          }
  }
  for (const [arquivo, item] of catalogo) {
    for (const grupo of item.codigo.matchAll(
      /(?:import|export)\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/gs,
    )) {
      const destino = resolver(pastaPai(arquivo), grupo[2]);
      if (!existe(destino)) throw new Error(`Arquivo importado ausente: ${grupo[2]} em ${arquivo}`);
      for (const parte of grupo[1].split(',')) {
        const nome = parte.trim().split(/\s+as\s+/)[0];
        if (nome && !catalogo.get(destino)?.nomes.has(nome))
          throw new Error(`${nome} não é exportado por ${grupo[2]} em ${arquivo}`);
      }
    }
  }
}

export function compilarAplicativo(enderecoEntrada, programaEmpresa = false) {
  const pastaAplicativo = pastaPai(caminhoDoEndereco(enderecoEntrada));
  const raizProjeto = resolver(pastaAplicativo, '../..');
  const { supabaseUrl: enderecoServidor, anonKey: chavePublica } =
    lerConfiguracaoPublica(raizProjeto);
  const origem = new URL(enderecoServidor).origin;
  const argumentos = process.argv.slice(2);
  const indiceSaida = argumentos.indexOf('--out');
  const pastaSaida =
    indiceSaida < 0 ? juntar(pastaAplicativo, 'dist') : resolver(argumentos[indiceSaida + 1]);
  if (
    pastaSaida === pastaAplicativo ||
    pastaSaida === raizProjeto ||
    (!pastaSaida.startsWith(raizProjeto + '\\') && !pastaSaida.startsWith(raizProjeto + '/'))
  )
    throw new Error('A saída da compilação precisa ser uma subpasta do projeto.');
  remover(pastaSaida, { recursive: true, force: true });
  criarPasta(pastaSaida, { recursive: true });
  const pastasProduto = [
    'telas',
    'formularios',
    'dados',
    'acesso',
    'navegacao',
    'componentes',
    'estilos',
    'comunicacao',
    'importacao',
  ];
  if (programaEmpresa) pastasProduto.push('sistema');
  for (const nome of pastasProduto)
    if (existe(juntar(pastaAplicativo, nome)))
      copiar(juntar(pastaAplicativo, nome), juntar(pastaSaida, nome), { recursive: true });
  for (const nome of [
    'index.html',
    'iniciar-aplicativo.mjs',
    'aplicar-tema.js',
    'mostrar-erro-ao-iniciar.js',
  ])
    if (existe(juntar(pastaAplicativo, nome)))
      copiar(juntar(pastaAplicativo, nome), juntar(pastaSaida, nome));
  const entradasCompartilhadas = {
    '@peganafrota/contracts': 'permissoes-e-regras/exportar-regras.mjs',
    '@peganafrota/validation': 'validacoes/exportar-validacoes.mjs',
    '@peganafrota/validation/importacao': 'validacoes/validar-importacao.mjs',
  };
  for (const nome of ['permissoes-e-regras', 'validacoes']) {
    for (const arquivo of listarArquivos(juntar(raizProjeto, 'compartilhado', nome)).filter(
      (arquivo) => arquivo.endsWith('.mjs') && !/[\\/]testes[\\/]/.test(arquivo),
    )) {
      const destino = juntar(
        pastaSaida,
        'compartilhado',
        nome,
        caminhoRelativo(juntar(raizProjeto, 'compartilhado', nome), arquivo),
      );
      criarPasta(pastaPai(destino), { recursive: true });
      copiar(arquivo, destino);
    }
  }
  for (const arquivo of listarArquivos(pastaSaida).filter((arquivo) =>
    /\.(mjs|cjs|js)$/.test(arquivo),
  )) {
    let codigo = lerArquivo(arquivo, 'utf8');
    codigo = codigo.replace(/(['"])(@peganafrota\/[^'"]+)\1/g, (trecho, aspas, pacote) => {
      const entrada = entradasCompartilhadas[pacote];
      if (!entrada) throw new Error(`Dependência local sem entrada: ${pacote}`);
      let destino = caminhoRelativo(
        pastaPai(arquivo),
        juntar(pastaSaida, 'compartilhado', entrada),
      ).replaceAll('\\', '/');
      if (!destino.startsWith('.')) destino = './' + destino;
      return aspas + destino + aspas;
    });
    gravarArquivo(arquivo, codigo, 'utf8');
  }
  const politica = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${origem} ${origem.replace(/^http/, 'ws')}${programaEmpresa ? '' : ' https://brasilapi.com.br'}`,
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  validarImportsLocais(pastaSaida);
  // frame-ancestors precisa ser enviado como cabeçalho HTTP, não na tag meta.
  const politicaDoDocumento = politica.replace("; frame-ancestors 'none'", '');
  gravarArquivo(juntar(pastaSaida, 'politica-de-seguranca.txt'), politica + '\n', 'utf8');
  const caminhoHtml = juntar(pastaSaida, 'index.html');
  const configuracao = JSON.stringify({
    supabaseUrl: enderecoServidor,
    anonKey: chavePublica,
  }).replaceAll('<', '\\u003c');
  gravarArquivo(
    caminhoHtml,
    lerArquivo(caminhoHtml, 'utf8')
      .replace('__CSP__', politicaDoDocumento)
      .replace('__CONFIG__', configuracao),
    'utf8',
  );
  if (programaEmpresa)
    gravarArquivo(juntar(pastaSaida, 'config.json'), configuracao + '\n', 'utf8');
  for (const arquivo of listarArquivos(pastaSaida).filter((arquivo) =>
    /\.(mjs|cjs|js|html|css)$/.test(arquivo),
  )) {
    const codigo = lerArquivo(arquivo, 'utf8');
    if (/__CSP__|__CONFIG__/.test(codigo))
      throw new Error('Marcador de compilação não substituído: ' + arquivo);
    if (/\b(?:from|import)\s*['"]@peganafrota\//.test(codigo))
      throw new Error('Import não resolvido: ' + arquivo);
  }
  console.log(
    `build:${programaEmpresa ? 'desktop' : 'admin'} PASS — ${listarArquivos(pastaSaida).length} arquivos`,
  );
  return pastaSaida;
}
