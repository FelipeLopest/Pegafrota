/**
 * Importação em massa a partir de planilha.
 *
 * O módulo mantém toda transformação/validação fora da UI. A tela pode receber
 * CSV, XLSX ou células coladas do Excel e sempre produz o mesmo formato de
 * linhas para conferência antes de gravar.
 */

import { lerXlsx, objetosXlsx } from './ler-planilha.mjs';

// ---------------------------------------------------------------------------
// Leitura de CSV / XLSX
// ---------------------------------------------------------------------------

function detectarSeparador(primeiraLinha) {
  const pontoEVirgula = (primeiraLinha.match(/;/g) || []).length;
  const virgula = (primeiraLinha.match(/,/g) || []).length;
  const abaAtual = (primeiraLinha.match(/\t/g) || []).length;
  if (abaAtual > pontoEVirgula && abaAtual > virgula) return '\t';
  return pontoEVirgula >= virgula ? ';' : ',';
}

function dividirLinha(linha, separadorAtual) {
  const campos = [];
  let atual = '';
  let dentroDeAspas = false;
  for (let indiceItem = 0; indiceItem < linha.length; indiceItem += 1) {
    const registro = linha[indiceItem];
    if (registro === '"') {
      if (dentroDeAspas && linha[indiceItem + 1] === '"') {
        atual += '"';
        indiceItem += 1;
      } else dentroDeAspas = !dentroDeAspas;
    } else if (registro === separadorAtual && !dentroDeAspas) {
      campos.push(atual);
      atual = '';
    } else atual += registro;
  }
  campos.push(atual);
  return campos.map((itemComparado) => itemComparado.trim());
}

export function normalizarCabecalho(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function lerCsv(texto) {
  const limpo = String(texto ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
  const linhas = limpo.split('\n').filter((linhaItem) => linhaItem.trim().length > 0);
  if (linhas.length === 0) return { cabecalho: [], linhas: [], separador: ';', formato: 'csv' };
  const separador = detectarSeparador(linhas[0]);
  const cabecalho = dividirLinha(linhas[0], separador);
  const dados = linhas.slice(1).map((linha, indiceItem) => {
    const campos = dividirLinha(linha, separador);
    const objeto = {};
    cabecalho.forEach((titulo, indice) => {
      objeto[normalizarCabecalho(titulo)] = campos[indice] ?? '';
    });
    objeto.__linha = indiceItem + 2;
    return objeto;
  });
  return { cabecalho, linhas: dados, separador, formato: separador === '\t' ? 'colado' : 'csv' };
}

export async function lerPlanilhaXlsx(memoriaTemporaria) {
  const resultado = await lerXlsx(memoriaTemporaria);
  return { ...resultado, linhas: objetosXlsx(resultado, normalizarCabecalho) };
}

export function coluna(linha, ...nomes) {
  for (const nome of nomes) {
    const chave = normalizarCabecalho(nome);
    if (linha[chave] !== undefined && String(linha[chave]).trim() !== '') return String(linha[chave]).trim();
  }
  return '';
}

// ---------------------------------------------------------------------------
// Conversões tolerantes a planilhas brasileiras
// ---------------------------------------------------------------------------

export function numeroBrasileiro(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto || !/\d/.test(texto)) return null;
  const temVirgula = texto.includes(',');
  const temPonto = texto.includes('.');
  let limpo = texto.replace(/[^\d.,-]/g, '');
  if (temVirgula && temPonto) {
    limpo =
      texto.lastIndexOf(',') > texto.lastIndexOf('.')
        ? limpo.replace(/\./g, '').replace(',', '.')
        : limpo.replace(/,/g, '');
  } else if (temVirgula) limpo = limpo.replace(',', '.');
  const quantidadeItem = Number(limpo);
  return Number.isFinite(quantidadeItem) ? quantidadeItem : null;
}

function excelSerialParaDados(serial, comHora = false) {
  const quantidadeItem = Number(serial);
  if (!Number.isFinite(quantidadeItem) || quantidadeItem < 1 || quantidadeItem > 2958465) return null;
  // Excel usa 1899-12-30 para reproduzir o bug histórico do ano 1900.
  const dadosRecebidos = new Date(Date.UTC(1899, 11, 30) + Math.round(quantidadeItem * 86400000));
  const outroItemComparado = dadosRecebidos.getUTCFullYear();
  const correspondenciaItem = String(dadosRecebidos.getUTCMonth() + 1).padStart(2, '0');
  const dadosRegistro = String(dadosRecebidos.getUTCDate()).padStart(2, '0');
  if (!comHora) return `${outroItemComparado}-${correspondenciaItem}-${dadosRegistro}`;
  const cabecalhos = String(dadosRecebidos.getUTCHours()).padStart(2, '0');
  const indiceManutencao = String(dadosRecebidos.getUTCMinutes()).padStart(2, '0');
  const textoItem = String(dadosRecebidos.getUTCSeconds()).padStart(2, '0');
  return `${outroItemComparado}-${correspondenciaItem}-${dadosRegistro}T${cabecalhos}:${indiceManutencao}:${textoItem}`;
}

export function dadosBrasileiro(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  if (/^\d+(?:[.,]\d+)?$/.test(texto)) return excelSerialParaDados(texto.replace(',', '.'), false);
  const brasileiro = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(texto);
  if (brasileiro) {
    const [, dadosRegistro, correspondenciaItem, primeiroItem] = brasileiro;
    return `${primeiroItem}-${correspondenciaItem.padStart(2, '0')}-${dadosRegistro.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
  return null;
}

/** Retorna data/hora local sem offset: a UI converte usando o fuso da empresa. */
export function dadosHoraPlanilha(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  if (/^\d+(?:[.,]\d+)?$/.test(texto)) return excelSerialParaDados(texto.replace(',', '.'), true);

  const brasileiro = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(texto);
  if (brasileiro) {
    const [
      ,
      dadosRegistro,
      correspondenciaItem,
      primeiroItem,
      cabecalhos = '0',
      indiceManutencao = '0',
      textoItem = '0',
    ] = brasileiro;
    return `${primeiroItem}-${correspondenciaItem.padStart(2, '0')}-${dadosRegistro.padStart(2, '0')}T${cabecalhos.padStart(2, '0')}:${indiceManutencao}:${textoItem.padStart(2, '0')}`;
  }

  const isoLocal = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(texto);
  if (isoLocal)
    return `${isoLocal[1]}T${(isoLocal[2] || '0').padStart(2, '0')}:${isoLocal[3] || '00'}:${isoLocal[4] || '00'}`;

  // Se já vier com offset/Z, preserve o instante como ISO absoluto.
  if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(texto)) {
    const dadosRegistro = new Date(texto);
    return Number.isNaN(dadosRegistro.getTime()) ? null : dadosRegistro.toISOString();
  }
  return null;
}

export function booleanoPlanilha(valor) {
  const valorEntrada = normalizarCabecalho(valor);
  if (!valorEntrada) return false;
  return ['sim', 's', 'yes', 'y', 'true', '1', 'x', 'cheio', 'completo'].includes(valorEntrada);
}

const COMBUSTIVEIS = new Map([
  ['diesel s10', 'diesel_s10'],
  ['diesel_s10', 'diesel_s10'],
  ['s10', 'diesel_s10'],
  ['diesel s500', 'diesel_s500'],
  ['diesel_s500', 'diesel_s500'],
  ['s500', 'diesel_s500'],
  ['gasolina', 'gasoline'],
  ['gasoline', 'gasoline'],
  ['etanol', 'ethanol'],
  ['alcool', 'ethanol'],
  ['ethanol', 'ethanol'],
  ['gnv', 'cng'],
  ['cng', 'cng'],
  ['flex', 'flex'],
  ['eletrico', 'electric'],
  ['electric', 'electric'],
]);

export function normalizarCombustivel(valor, { paraBomba = false } = {}) {
  const original = String(valor ?? '').trim();
  if (!original) return null;
  const chave = normalizarCabecalho(original).replace(/_/g, ' ');
  const canonico = COMBUSTIVEIS.get(chave) || COMBUSTIVEIS.get(original.toLowerCase()) || null;
  if (paraBomba && ['flex', 'electric'].includes(canonico)) return null;
  return canonico;
}

export function normalizarTipoManutencao(valor) {
  const valorEntrada = normalizarCabecalho(valor);
  if (['preventiva', 'preventivo', 'preventive'].includes(valorEntrada)) return 'preventive';
  if (['corretiva', 'corretivo', 'corrective'].includes(valorEntrada)) return 'corrective';
  return null;
}

export function normalizarPapel(valor) {
  const valorEntrada = normalizarCabecalho(valor).replace(/ /g, '_');
  const mapa = {
    administrador: 'company_admin',
    admin: 'company_admin',
    company_admin: 'company_admin',
    gestor: 'fleet_manager',
    gestor_de_frota: 'fleet_manager',
    fleet_manager: 'fleet_manager',
    operador: 'operator',
    operator: 'operator',
    visualizador: 'viewer',
    consulta: 'viewer',
    viewer: 'viewer',
  };
  return mapa[valorEntrada] || null;
}

function emailSimplesValido(valor) {
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(valor || '').trim());
}

function resolverObrigatorio(valor, resolver, rotulo) {
  if (!String(valor || '').trim()) return { erro: `${rotulo} é obrigatório.` };
  const identificador = resolver?.(valor);
  return identificador ? { id: identificador } : { erro: `${rotulo} "${valor}" não está cadastrado.` };
}

// ---------------------------------------------------------------------------
// Modelos de importação
// ---------------------------------------------------------------------------

export const MODELOS = {
  veiculos: {
    id: 'veiculos',
    titulo: 'Veículos',
    descricao: 'Cadastre centenas de veículos de uma vez.',
    colunas: [
      { nome: 'Placa', obrigatoria: true, exemplo: 'ABC1D23' },
      { nome: 'Marca', obrigatoria: true, exemplo: 'Volvo' },
      { nome: 'Modelo', obrigatoria: true, exemplo: 'FH 460' },
      { nome: 'Combustivel', obrigatoria: true, exemplo: 'Diesel S10' },
      { nome: 'Ano modelo', obrigatoria: false, exemplo: '2023' },
      { nome: 'Odometro inicial', obrigatoria: false, exemplo: '125000' },
      { nome: 'Cor', obrigatoria: false, exemplo: 'Branco' },
      { nome: 'Categoria', obrigatoria: false, exemplo: 'Cavalo mecanico' },
      { nome: 'Capacidade tanque L', obrigatoria: false, exemplo: '600' },
      { nome: 'Observacoes', obrigatoria: false, exemplo: 'Frota matriz' },
    ],
    chaveUnica: (dadosRegistro) => `placa:${String(dadosRegistro.plate || '').toUpperCase()}`,
    mapear(linha, contexto) {
      const combustivelTipo = normalizarCombustivel(
        coluna(linha, 'combustivel', 'tipo de combustivel') || 'diesel s10',
      );
      if (!combustivelTipo) return { erro: 'Combustível inválido.' };
      const dados = {
        plate: coluna(linha, 'placa', 'placa do veiculo')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, ''),
        brand: coluna(linha, 'marca', 'fabricante'),
        model: coluna(linha, 'modelo'),
        fuelType: combustivelTipo,
        modelYear: numeroBrasileiro(coluna(linha, 'ano modelo', 'ano', 'ano do modelo')),
        initialOdometerKm:
          numeroBrasileiro(coluna(linha, 'odometro inicial', 'odometro', 'km', 'quilometragem')) ?? 0,
        color: coluna(linha, 'cor'),
        category: coluna(linha, 'categoria'),
        tankCapacityL: numeroBrasileiro(coluna(linha, 'capacidade tanque l', 'capacidade tanque', 'tanque')),
        notes: coluna(linha, 'observacoes', 'observacao', 'notas'),
      };
      if (contexto.existeVeiculo?.(dados.plate))
        return { erro: `A placa ${dados.plate} já está cadastrada.` };
      const resultadoItem = contexto.validarVeiculo?.(dados);
      if (resultadoItem && !resultadoItem.ok) return { erro: Object.values(resultadoItem.errors)[0] };
      if (!dados.plate || !dados.brand || !dados.model)
        return { erro: 'Placa, marca e modelo são obrigatórios.' };
      return { dados };
    },
  },

  motoristas: {
    id: 'motoristas',
    titulo: 'Motoristas',
    descricao: 'Importe a equipe de motoristas de uma vez.',
    colunas: [
      { nome: 'Nome', obrigatoria: true, exemplo: 'João da Silva' },
      { nome: 'Documento', obrigatoria: false, exemplo: 'MAT-1042' },
      { nome: 'Telefone', obrigatoria: false, exemplo: '15999998888' },
      { nome: 'Categoria CNH', obrigatoria: false, exemplo: 'E' },
      { nome: 'Validade CNH', obrigatoria: false, exemplo: '31/12/2028' },
      { nome: 'Observacoes', obrigatoria: false, exemplo: 'Base Sorocaba' },
    ],
    chaveUnica: (dadosRegistro) =>
      dadosRegistro.internalDocument ? `doc:${String(dadosRegistro.internalDocument).toLowerCase()}` : null,
    mapear(linha, contexto) {
      const nome = coluna(linha, 'nome', 'nome completo', 'motorista');
      const documento = coluna(linha, 'documento', 'matricula', 'documento interno') || null;
      if (!nome || nome.length < 2) return { erro: 'Nome do motorista é obrigatório.' };
      if (documento && contexto.existeMotoristaDocumento?.(documento))
        return { erro: `O documento ${documento} já está cadastrado.` };
      const validadeBruta = coluna(linha, 'validade cnh', 'validade', 'vencimento cnh');
      const validade = validadeBruta ? dadosBrasileiro(validadeBruta) : null;
      if (validadeBruta && !validade) return { erro: 'Validade da CNH inválida.' };
      return {
        dados: {
          fullName: nome,
          internalDocument: documento,
          phone: coluna(linha, 'telefone', 'celular') || null,
          licenseCategory: (coluna(linha, 'categoria cnh', 'categoria', 'cnh') || '').toUpperCase() || null,
          licenseExpiresOn: validade,
          notes: coluna(linha, 'observacoes', 'observacao', 'notas') || null,
        },
      };
    },
  },

  locais: {
    id: 'locais',
    titulo: 'Locais',
    descricao: 'Cadastre pátios, filiais, garagens e pontos operacionais.',
    colunas: [
      { nome: 'Nome', obrigatoria: true, exemplo: 'Pátio Central' },
      { nome: 'Logradouro', obrigatoria: false, exemplo: 'Av. Brasil' },
      { nome: 'Numero', obrigatoria: false, exemplo: '1000' },
      { nome: 'Bairro', obrigatoria: false, exemplo: 'Industrial' },
      { nome: 'Cidade', obrigatoria: false, exemplo: 'Sorocaba' },
      { nome: 'UF', obrigatoria: false, exemplo: 'SP' },
      { nome: 'CEP', obrigatoria: false, exemplo: '18000000' },
      { nome: 'Fuso horario', obrigatoria: false, exemplo: 'America/Sao_Paulo' },
      { nome: 'Observacoes', obrigatoria: false, exemplo: 'Portaria 24h' },
    ],
    mapear(linha) {
      const nome = coluna(linha, 'nome', 'local', 'descricao');
      if (!nome) return { erro: 'Nome do local é obrigatório.' };
      const estadoFederacao = (coluna(linha, 'uf', 'estado') || '').toUpperCase();
      if (estadoFederacao && !/^[A-Z]{2}$/.test(estadoFederacao)) return { erro: 'UF deve ter duas letras.' };
      return {
        dados: {
          name: nome,
          addressStreet: coluna(linha, 'logradouro', 'rua', 'endereco') || null,
          addressNumber: coluna(linha, 'numero', 'n') || null,
          addressDistrict: coluna(linha, 'bairro') || null,
          addressCity: coluna(linha, 'cidade', 'municipio') || null,
          addressState: estadoFederacao || null,
          addressPostalCode: coluna(linha, 'cep', 'codigo postal').replace(/\D/g, '') || null,
          timezone: coluna(linha, 'fuso horario', 'timezone') || null,
          notes: coluna(linha, 'observacoes', 'observacao', 'notas') || null,
        },
      };
    },
  },

  abastecimentos: {
    id: 'abastecimentos',
    titulo: 'Abastecimentos',
    descricao: 'Importe lançamentos do posto ou cartão de combustível.',
    colunas: [
      { nome: 'Placa', obrigatoria: true, exemplo: 'ABC1D23' },
      { nome: 'Data hora', obrigatoria: false, exemplo: '18/08/2026 14:30' },
      { nome: 'Litros', obrigatoria: true, exemplo: '120,5' },
      { nome: 'Valor por litro', obrigatoria: true, exemplo: '6,19' },
      { nome: 'Odometro', obrigatoria: true, exemplo: '125430' },
      { nome: 'Combustivel', obrigatoria: true, exemplo: 'Diesel S10' },
      { nome: 'Motorista', obrigatoria: false, exemplo: 'MAT-1042' },
      { nome: 'Posto', obrigatoria: false, exemplo: 'Posto Central' },
      { nome: 'Tanque cheio', obrigatoria: false, exemplo: 'Sim' },
      { nome: 'Observacoes', obrigatoria: false, exemplo: 'Cartão frota' },
    ],
    mapear(linha, contexto) {
      const placa = coluna(linha, 'placa', 'veiculo');
      const resultadoVeiculo = resolverObrigatorio(placa, contexto.resolverVeiculo, 'Veículo');
      if (resultadoVeiculo.erro) return { erro: resultadoVeiculo.erro };
      const litros = numeroBrasileiro(coluna(linha, 'litros', 'quantidade', 'volume'));
      const preco = numeroBrasileiro(
        coluna(linha, 'valor por litro', 'preco por litro', 'preco', 'valor litro'),
      );
      const odometro = numeroBrasileiro(coluna(linha, 'odometro', 'km', 'quilometragem'));
      const combustivelTipo = normalizarCombustivel(coluna(linha, 'combustivel', 'produto') || 'diesel s10', {
        paraBomba: true,
      });
      if (!litros || litros <= 0) return { erro: 'Litros inválido.' };
      if (!preco || preco <= 0) return { erro: 'Valor por litro inválido.' };
      if (odometro == null || odometro < 0) return { erro: 'Odômetro inválido.' };
      if (!combustivelTipo) return { erro: 'Combustível/produto inválido.' };
      const dadosBruta = coluna(linha, 'data hora', 'data', 'abastecido em');
      const dadosLocal = dadosBruta ? dadosHoraPlanilha(dadosBruta) : null;
      if (dadosBruta && !dadosLocal) return { erro: 'Data/hora do abastecimento inválida.' };
      const motoristaTexto = coluna(linha, 'motorista', 'documento motorista');
      const motoristaIdentificador = motoristaTexto ? contexto.resolverMotorista?.(motoristaTexto) : null;
      if (motoristaTexto && !motoristaIdentificador)
        return { erro: `Motorista "${motoristaTexto}" não foi encontrado.` };
      return {
        dados: {
          vehicleId: resultadoVeiculo.id,
          liters: litros,
          pricePerLiter: preco,
          odometerKm: odometro,
          fuelType: combustivelTipo,
          fueledAt: dadosLocal ? contexto.converterDataHora?.(dadosLocal) || dadosLocal : null,
          driverId: motoristaIdentificador || null,
          stationName: coluna(linha, 'posto', 'estabelecimento') || null,
          fullTank: booleanoPlanilha(coluna(linha, 'tanque cheio', 'completou tanque', 'tanque completo')),
          notes: coluna(linha, 'observacoes', 'observacao', 'notas') || null,
        },
      };
    },
  },

  manutencoes: {
    id: 'manutencoes',
    titulo: 'Manutenções',
    descricao: 'Agende manutenção de vários veículos sem abrir um formulário por vez.',
    colunas: [
      { nome: 'Placa', obrigatoria: true, exemplo: 'ABC1D23' },
      { nome: 'Tipo', obrigatoria: true, exemplo: 'Preventiva' },
      { nome: 'Descricao', obrigatoria: true, exemplo: 'Troca de óleo e filtros' },
      { nome: 'Data agendada', obrigatoria: true, exemplo: '25/08/2026 08:00' },
      { nome: 'Odometro previsto', obrigatoria: false, exemplo: '130000' },
      { nome: 'Fornecedor', obrigatoria: false, exemplo: 'Oficina Central' },
      { nome: 'Observacoes', obrigatoria: false, exemplo: 'Prioridade alta' },
    ],
    mapear(linha, contexto) {
      const placa = coluna(linha, 'placa', 'veiculo');
      const resultadoVeiculo = resolverObrigatorio(placa, contexto.resolverVeiculo, 'Veículo');
      if (resultadoVeiculo.erro) return { erro: resultadoVeiculo.erro };
      const tipo = normalizarTipoManutencao(coluna(linha, 'tipo', 'tipo manutencao'));
      if (!tipo) return { erro: 'Tipo deve ser Preventiva ou Corretiva.' };
      const descricao = coluna(linha, 'descricao', 'servico', 'manutencao');
      if (!descricao) return { erro: 'Descrição da manutenção é obrigatória.' };
      const dadosBruta = coluna(linha, 'data agendada', 'agendada para', 'data');
      const dadosLocal = dadosHoraPlanilha(dadosBruta);
      if (!dadosLocal) return { erro: 'Data agendada inválida.' };
      return {
        dados: {
          vehicleId: resultadoVeiculo.id,
          maintenanceType: tipo,
          description: descricao,
          scheduledFor: contexto.converterDataHora?.(dadosLocal) || dadosLocal,
          scheduledOdometerKm: numeroBrasileiro(coluna(linha, 'odometro previsto', 'odometro', 'km')),
          supplierName: coluna(linha, 'fornecedor', 'oficina') || null,
          notes: coluna(linha, 'observacoes', 'observacao', 'notas') || null,
        },
      };
    },
  },

  viagens: {
    id: 'viagens',
    titulo: 'Viagens planejadas',
    descricao: 'Planeje várias viagens de uma só vez.',
    colunas: [
      { nome: 'Placa', obrigatoria: true, exemplo: 'ABC1D23' },
      { nome: 'Motorista', obrigatoria: true, exemplo: 'MAT-1042' },
      { nome: 'Origem', obrigatoria: true, exemplo: 'Sorocaba - SP' },
      { nome: 'Destino', obrigatoria: true, exemplo: 'Campinas - SP' },
      { nome: 'Saida prevista', obrigatoria: false, exemplo: '20/08/2026 07:00' },
      { nome: 'Retorno previsto', obrigatoria: false, exemplo: '20/08/2026 18:00' },
    ],
    mapear(linha, contexto) {
      const resultadoVeiculo = resolverObrigatorio(
        coluna(linha, 'placa', 'veiculo'),
        contexto.resolverVeiculo,
        'Veículo',
      );
      if (resultadoVeiculo.erro) return { erro: resultadoVeiculo.erro };
      const resultadoDados = resolverObrigatorio(
        coluna(linha, 'motorista', 'documento motorista'),
        contexto.resolverMotorista,
        'Motorista',
      );
      if (resultadoDados.erro) return { erro: resultadoDados.erro };
      const origem = coluna(linha, 'origem');
      const destino = coluna(linha, 'destino');
      if (!origem || !destino) return { erro: 'Origem e destino são obrigatórios.' };
      const saidaBruta = coluna(linha, 'saida prevista', 'partida prevista');
      const retornoBruto = coluna(linha, 'retorno previsto', 'chegada prevista');
      const saidaLocal = saidaBruta ? dadosHoraPlanilha(saidaBruta) : null;
      const retornoLocal = retornoBruto ? dadosHoraPlanilha(retornoBruto) : null;
      if (saidaBruta && !saidaLocal) return { erro: 'Saída prevista inválida.' };
      if (retornoBruto && !retornoLocal) return { erro: 'Retorno previsto inválido.' };
      const dados = {
        vehicleId: resultadoVeiculo.id,
        driverId: resultadoDados.id,
        originLabel: origem,
        destinationLabel: destino,
        plannedDepartureAt: saidaLocal ? contexto.converterDataHora?.(saidaLocal) || saidaLocal : null,
        plannedReturnAt: retornoLocal ? contexto.converterDataHora?.(retornoLocal) || retornoLocal : null,
      };
      if (
        dados.plannedDepartureAt &&
        dados.plannedReturnAt &&
        new Date(dados.plannedReturnAt) <= new Date(dados.plannedDepartureAt)
      ) {
        return { erro: 'Retorno previsto deve ser posterior à saída.' };
      }
      return { dados };
    },
  },

  equipe: {
    id: 'equipe',
    titulo: 'Equipe de acesso',
    descricao: 'Convide vários usuários para o sistema sem cadastrar um por um.',
    colunas: [
      { nome: 'Nome', obrigatoria: true, exemplo: 'Maria Souza' },
      { nome: 'Email', obrigatoria: true, exemplo: 'maria@empresa.com.br' },
      { nome: 'Telefone', obrigatoria: false, exemplo: '15999998888' },
      { nome: 'Cargo', obrigatoria: true, exemplo: 'Operador' },
    ],
    chaveUnica: (dadosRegistro) => `email:${String(dadosRegistro.email || '').toLowerCase()}`,
    mapear(linha, contexto) {
      const nomeCompleto = coluna(linha, 'nome', 'nome completo');
      const email = coluna(linha, 'email', 'e mail').toLowerCase();
      const papel = normalizarPapel(coluna(linha, 'cargo', 'papel', 'perfil'));
      if (!nomeCompleto || nomeCompleto.length < 2) return { erro: 'Nome completo é obrigatório.' };
      if (!emailSimplesValido(email)) return { erro: 'E-mail inválido.' };
      if (contexto.existeUsuarioEmail?.(email)) return { erro: `O e-mail ${email} já pertence à equipe.` };
      if (!papel) return { erro: 'Cargo inválido. Use Administrador, Gestor, Operador ou Visualizador.' };
      return {
        dados: {
          fullName: nomeCompleto,
          email,
          phone: coluna(linha, 'telefone', 'celular') || null,
          role: papel,
          mode: 'invite',
        },
      };
    },
  },
};

export function csvModelo(modeloIdentificador) {
  const modelo = MODELOS[modeloIdentificador];
  if (!modelo) return '';
  const cabecalho = modelo.colunas.map((registro) => registro.nome).join(';');
  const exemplo = modelo.colunas.map((registro) => registro.exemplo).join(';');
  return `\uFEFF${cabecalho}\n${exemplo}\n`;
}

export function conferir(modeloIdentificador, linhas, contexto = {}) {
  const modelo = MODELOS[modeloIdentificador];
  if (!modelo) throw new Error(`Modelo desconhecido: ${modeloIdentificador}`);
  const validas = [];
  const invalidas = [];
  const chaves = new Map();

  for (const linha of linhas) {
    let resultado;
    try {
      resultado = modelo.mapear(linha, contexto);
    } catch (erroRecebido) {
      resultado = { erro: erroRecebido?.message || 'Linha ilegível.' };
    }

    if (!resultado.erro && modelo.chaveUnica) {
      const chave = modelo.chaveUnica(resultado.dados);
      if (chave) {
        const primeira = chaves.get(chave);
        if (primeira)
          resultado = { erro: `Duplicado dentro da própria planilha (também aparece na linha ${primeira}).` };
        else chaves.set(chave, linha.__linha);
      }
    }

    if (resultado.erro) invalidas.push({ linha: linha.__linha, motivo: resultado.erro, original: linha });
    else validas.push({ linha: linha.__linha, dados: resultado.dados });
  }

  return { validas, invalidas, total: linhas.length };
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { numeroBrasileiro as numeroBr };
export { dadosBrasileiro as dataBr };
export { dadosHoraPlanilha as dataHoraPlanilha };
