import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import { readFileSync as lerArquivoSincrono } from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';
import { fileURLToPath as converterEnderecoEmCaminho } from 'node:url';
import {
  lerCsv,
  lerPlanilhaXlsx,
  numeroBr as numeroBrasileiro,
  dataBr as dadosBrasileiro,
  dataHoraPlanilha as dadosHoraPlanilha,
  coluna,
  conferir,
  csvModelo,
  MODELOS,
} from '../validar-importacao.mjs';
import { validarVeiculo } from '../exportar-validacoes.mjs';

// ---------------------------------------------------------------------------
// Leitura de CSV
// ---------------------------------------------------------------------------
testar('detecta ponto e vírgula, que é o padrão do Excel em português', () => {
  const resultadoItem = lerCsv('Placa;Marca;Modelo\nABC1D23;Volvo;FH 460');
  verificarCondicao.equal(resultadoItem.separador, ';');
  verificarCondicao.equal(resultadoItem.linhas.length, 1);
  verificarCondicao.equal(resultadoItem.linhas[0].placa, 'ABC1D23');
});

testar('detecta vírgula em exportações internacionais', () => {
  const resultadoItem = lerCsv('Placa,Marca,Modelo\nABC1D23,Volvo,FH 460');
  verificarCondicao.equal(resultadoItem.separador, ',');
  verificarCondicao.equal(resultadoItem.linhas[0].marca, 'Volvo');
});

testar('remove o BOM que o Excel escreve no início', () => {
  // Sem isso, a primeira coluna vem com um caractere invisível grudado e nunca
  // casa com o cabeçalho esperado.
  const resultadoItem = lerCsv('\uFEFFPlaca;Marca\nABC1D23;Volvo');
  verificarCondicao.equal(resultadoItem.linhas[0].placa, 'ABC1D23');
});

testar('respeita vírgula dentro de aspas', () => {
  const resultadoItem = lerCsv('Nome;Endereco\nPátio;"Rua A, 100"');
  verificarCondicao.equal(resultadoItem.linhas[0].endereco, 'Rua A, 100');
});

testar('cabeçalho é tolerante a acento, caixa e espaços', () => {
  const resultadoItem = lerCsv('PLACA;Validade CNH\nABC1D23;31/12/2028');
  verificarCondicao.equal(coluna(resultadoItem.linhas[0], 'placa'), 'ABC1D23');
  verificarCondicao.equal(coluna(resultadoItem.linhas[0], 'validade cnh'), '31/12/2028');
});

testar('numera as linhas como a planilha mostra', () => {
  // A pessoa vai abrir o arquivo para corrigir: o número precisa bater.
  const resultadoItem = lerCsv('Placa\nAAA1A11\nBBB2B22');
  verificarCondicao.equal(resultadoItem.linhas[0].__linha, 2);
  verificarCondicao.equal(resultadoItem.linhas[1].__linha, 3);
});

// ---------------------------------------------------------------------------
// Números e datas no formato brasileiro
// ---------------------------------------------------------------------------
testar('interpreta decimal com vírgula', () => {
  verificarCondicao.equal(numeroBrasileiro('120,5'), 120.5);
  verificarCondicao.equal(numeroBrasileiro('6,19'), 6.19);
});

testar('distingue separador de milhar de separador decimal', () => {
  // Confundir os dois transforma 1.234 litros em 1,234 — e o erro só aparece
  // no relatório de custo, semanas depois.
  verificarCondicao.equal(numeroBrasileiro('1.234,56'), 1234.56);
  verificarCondicao.equal(numeroBrasileiro('1,234.56'), 1234.56);
  verificarCondicao.equal(numeroBrasileiro('1234'), 1234);
});

testar('devolve null para texto que não é número', () => {
  verificarCondicao.equal(numeroBrasileiro('abc'), null);
  verificarCondicao.equal(numeroBrasileiro(''), null);
});

testar('aceita data brasileira e ISO', () => {
  verificarCondicao.equal(dadosBrasileiro('31/12/2028'), '2028-12-31');
  verificarCondicao.equal(dadosBrasileiro('5/3/2027'), '2027-03-05');
  verificarCondicao.equal(dadosBrasileiro('2028-12-31'), '2028-12-31');
  verificarCondicao.equal(dadosBrasileiro('não é data'), null);
});

// ---------------------------------------------------------------------------
// Conferência antes de enviar
// ---------------------------------------------------------------------------
testar('separa linhas válidas das inválidas sem enviar nada', () => {
  const { linhas } = lerCsv(
    [
      'Placa;Marca;Modelo;Combustivel',
      'ABC1D23;Volvo;FH 460;diesel_s10',
      'PLACAERRADA;Scania;R450;diesel_s10',
      'DEF4G56;Iveco;Daily;diesel_s10',
    ].join('\n'),
  );

  const resultadoItem = conferir('veiculos', linhas, { validarVeiculo });
  verificarCondicao.equal(resultadoItem.total, 3);
  verificarCondicao.equal(resultadoItem.validas.length, 2);
  verificarCondicao.equal(resultadoItem.invalidas.length, 1);
  // O número da linha precisa apontar a linha real da planilha.
  verificarCondicao.equal(resultadoItem.invalidas[0].linha, 3);
  verificarCondicao.match(resultadoItem.invalidas[0].motivo, /[Pp]laca/);
});

testar('uma linha ruim não derruba as boas', () => {
  const { linhas } = lerCsv(['Nome;Categoria CNH', 'João da Silva;E', ';D', 'Maria Souza;C'].join('\n'));

  const resultadoItem = conferir('motoristas', linhas);
  verificarCondicao.equal(resultadoItem.validas.length, 2);
  verificarCondicao.equal(resultadoItem.invalidas.length, 1);
});

testar('abastecimento exige veículo já cadastrado', () => {
  const { linhas } = lerCsv(
    ['Placa;Litros;Valor por litro;Odometro', 'ABC1D23;120,5;6,19;125430', 'ZZZ9Z99;80;6,00;90000'].join(
      '\n',
    ),
  );

  const resolverVeiculo = (placa) => (placa === 'ABC1D23' ? 'uuid-do-veiculo' : null);
  const resultadoItem = conferir('abastecimentos', linhas, { resolverVeiculo });

  verificarCondicao.equal(resultadoItem.validas.length, 1);
  verificarCondicao.equal(resultadoItem.validas[0].dados.liters, 120.5);
  verificarCondicao.equal(resultadoItem.validas[0].dados.pricePerLiter, 6.19);
  verificarCondicao.match(resultadoItem.invalidas[0].motivo, /não está cadastrado/);
});

testar('o total enviado NÃO é calculado no cliente', () => {
  // O servidor calcula; enviar arriscaria divergência de centavo e recusa.
  const { linhas } = lerCsv('Placa;Litros;Valor por litro;Odometro\nABC1D23;10;5,50;1000');
  const resultadoItem = conferir('abastecimentos', linhas, { resolverVeiculo: () => 'uuid' });
  verificarCondicao.equal('totalAmount' in resultadoItem.validas[0].dados, false);
});

// ---------------------------------------------------------------------------
// Modelo para download
// ---------------------------------------------------------------------------
testar('o modelo tem cabeçalho, exemplo e BOM para o Excel', () => {
  const conteudoCsv = csvModelo('veiculos');
  verificarCondicao.ok(conteudoCsv.startsWith('\uFEFF'));
  const [cabecalho, exemplo] = conteudoCsv
    .replace(/^\uFEFF/, '')
    .trim()
    .split('\n');
  verificarCondicao.match(cabecalho, /Placa;Marca;Modelo/);
  verificarCondicao.match(exemplo, /ABC1D23/);
});

testar('o modelo gerado é lido de volta sem erro', () => {
  // Ida e volta: se o próprio modelo não passar na conferência, ninguém passa.
  for (const identificador of Object.keys(MODELOS)) {
    const { linhas } = lerCsv(csvModelo(identificador));
    verificarCondicao.equal(linhas.length, 1, `modelo ${identificador} deveria ter uma linha de exemplo`);
  }
});

testar('todos os modelos declaram colunas com exemplo', () => {
  for (const [identificador, correspondenciaItem] of Object.entries(MODELOS)) {
    verificarCondicao.ok(correspondenciaItem.colunas.length > 0, `${identificador} sem colunas`);
    for (const registro of correspondenciaItem.colunas) {
      verificarCondicao.ok(
        registro.nome && registro.exemplo !== undefined,
        `${identificador}: coluna incompleta`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Excel real e novos fluxos em massa
// ---------------------------------------------------------------------------
testar('os sete modelos Excel oficiais são lidos e conferidos', async () => {
  const pasta = new URL(
    '../../../aplicativos/programa-empresa/importacao/modelos-de-planilha/',
    import.meta.url,
  );
  const contexto = {
    validarVeiculo,
    existeVeiculo: () => false,
    existeMotoristaDocumento: () => false,
    existeUsuarioEmail: () => false,
    resolverVeiculo: () => '11111111-1111-4111-8111-111111111111',
    resolverMotorista: () => '22222222-2222-4222-8222-222222222222',
    converterDataHora: (valorEntrada) => valorEntrada,
  };

  verificarCondicao.deepEqual(Object.keys(MODELOS).sort(), [
    'abastecimentos',
    'equipe',
    'locais',
    'manutencoes',
    'motoristas',
    'veiculos',
    'viagens',
  ]);

  for (const identificador of Object.keys(MODELOS)) {
    const bytes = lerArquivoSincrono(
      converterEnderecoEmCaminho(new URL(`modelo-${identificador}.xlsx`, pasta)),
    );
    const memoriaTemporaria = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const leitura = await lerPlanilhaXlsx(memoriaTemporaria);
    verificarCondicao.equal(leitura.aba, 'Dados', `${identificador}: primeira aba`);
    verificarCondicao.equal(leitura.linhas.length, 1, `${identificador}: linha de exemplo`);
    const resultado = conferir(identificador, leitura.linhas, contexto);
    verificarCondicao.equal(
      resultado.invalidas.length,
      0,
      `${identificador}: ${resultado.invalidas[0]?.motivo || ''}`,
    );
    verificarCondicao.equal(
      resultado.validas.length,
      1,
      `${identificador}: deveria aceitar a própria linha de exemplo`,
    );
  }
});

testar('datas numéricas do Excel e datas brasileiras viram data/hora local', () => {
  verificarCondicao.equal(dadosHoraPlanilha('45292'), '2024-01-01T00:00:00');
  verificarCondicao.equal(dadosHoraPlanilha('18/08/2026 14:30'), '2026-08-18T14:30:00');
});

testar('duplicidade dentro da mesma planilha é recusada antes de gravar', () => {
  const { linhas } = lerCsv(
    ['Placa;Marca;Modelo;Combustivel', 'ABC1D23;Volvo;FH;Diesel S10', 'ABC1D23;Volvo;FH;Diesel S10'].join(
      '\n',
    ),
  );
  const resultado = conferir('veiculos', linhas, { validarVeiculo, existeVeiculo: () => false });
  verificarCondicao.equal(resultado.validas.length, 1);
  verificarCondicao.equal(resultado.invalidas.length, 1);
  verificarCondicao.match(resultado.invalidas[0].motivo, /Duplicado dentro/);
});

testar('importação da equipe detecta e-mail já vinculado e nunca pede senha em planilha', () => {
  const modelo = MODELOS.equipe;
  verificarCondicao.equal(
    modelo.colunas.some((registro) => /senha/i.test(registro.nome)),
    false,
  );
  const { linhas } = lerCsv('Nome;Email;Cargo\nMaria Souza;maria@empresa.com.br;Operador');
  const resultado = conferir('equipe', linhas, {
    existeUsuarioEmail: (evento) => evento === 'maria@empresa.com.br',
  });
  verificarCondicao.equal(resultado.validas.length, 0);
  verificarCondicao.match(resultado.invalidas[0].motivo, /já pertence à equipe/);
});

testar('viagem e manutenção de planilha resolvem referências existentes', () => {
  const base = {
    resolverVeiculo: () => 'v1',
    resolverMotorista: () => 'd1',
    converterDataHora: (valorEntrada) => valorEntrada,
  };
  const viagem = conferir(
    'viagens',
    lerCsv(
      'Placa;Motorista;Origem;Destino;Saida prevista;Retorno previsto\nABC1D23;MAT-1;A;B;18/08/2026 08:00;18/08/2026 10:00',
    ).linhas,
    base,
  );
  verificarCondicao.equal(viagem.invalidas.length, 0);
  verificarCondicao.equal(viagem.validas[0].dados.vehicleId, 'v1');
  verificarCondicao.equal(viagem.validas[0].dados.driverId, 'd1');

  const manutencao = conferir(
    'manutencoes',
    lerCsv('Placa;Tipo;Descricao;Data agendada\nABC1D23;Preventiva;Revisão;20/08/2026 08:00').linhas,
    base,
  );
  verificarCondicao.equal(manutencao.invalidas.length, 0);
  verificarCondicao.equal(manutencao.validas[0].dados.maintenanceType, 'preventive');
});
