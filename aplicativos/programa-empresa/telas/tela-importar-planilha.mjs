import { executarMutacao } from '../comunicacao/consultar-e-guardar-dados.mjs';
/**
 * Central de importações em massa.
 *
 * Aceita XLSX, CSV e células copiadas do Excel. A validação acontece inteira
 * antes de qualquer gravação. Cadastros independentes são enviados com
 * concorrência controlada; abastecimentos preservam ordem por veículo para não
 * corromper a cronologia do odômetro.
 */

import {
  el as criarElemento,
  botao,
  notificacao,
  cabecalhoPagina,
  cartao,
  estadoErro,
  estadoVazio,
} from '../componentes/componentes-do-programa.mjs';
import { dados } from '../dados/dados-do-programa.mjs';
import { contexto, sessao, rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
import { identificarImportacao } from '../dados/retomar-importacao.mjs';
import { escaparCelulaCsv } from '../dados/exportar-relatorios.mjs';
import { PERMISSAO } from '@peganafrota/contracts';
import { validarVeiculo } from '@peganafrota/validation';
import {
  lerCsv,
  lerPlanilhaXlsx,
  normalizarCabecalho,
  conferir,
  csvModelo,
  MODELOS,
} from '@peganafrota/validation/importacao';

function tabela(cabecalhos, linhas) {
  return criarElemento('div', { class: 'table-wrap' }, [
    criarElemento('table', {}, [
      criarElemento('thead', {}, [
        criarElemento(
          'tr',
          {},
          cabecalhos.map((cabecalhos2) => criarElemento('th', { text: cabecalhos2 })),
        ),
      ]),
      criarElemento('tbody', {}, linhas),
    ]),
  ]);
}

const PERMISSAO_POR_MODELO = {
  veiculos: PERMISSAO.VEHICLES_WRITE,
  motoristas: PERMISSAO.DRIVERS_WRITE,
  locais: PERMISSAO.LOCATIONS_WRITE,
  abastecimentos: PERMISSAO.FUELINGS_WRITE,
  manutencoes: PERMISSAO.MAINTENANCE_SCHEDULE,
  viagens: PERMISSAO.TRIPS_WRITE,
  equipe: PERMISSAO.USERS_MANAGE,
};

function importarCadastro(tipo, formulario) {
  const { commandId, ...campos } = formulario;
  return executarMutacao(
    () =>
      executarFuncaoBanco('import_catalog_record', {
        p_kind: tipo,
        p_payload: campos,
        p_command_id: commandId,
      }),
    tipo,
    'dashboard',
    'yard',
  );
}
const ENVIO_POR_MODELO = {
  veiculos: (dadosRegistro) => importarCadastro('vehicles', dadosRegistro),
  motoristas: (dadosRegistro) => importarCadastro('drivers', dadosRegistro),
  locais: (dadosRegistro) => importarCadastro('locations', dadosRegistro),
  abastecimentos: (dadosRegistro) => dados.fuelings.create(dadosRegistro),
  manutencoes: (dadosRegistro) => dados.maintenance.schedule(dadosRegistro),
  viagens: (dadosRegistro) => dados.trips.create(dadosRegistro),
  equipe: (dadosRegistro) => dados.users.invite(dadosRegistro),
};

const CONCORRENCIA_POR_MODELO = {
  veiculos: 5,
  motoristas: 5,
  locais: 5,
  manutencoes: 4,
  viagens: 3,
  equipe: 2,
  abastecimentos: 3, // concorrência entre veículos; dentro do veículo é sequencial.
};

function normalizarPlaca(valor) {
  return String(valor || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizarChave(valor) {
  return String(valor || '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function empresaLocalParaIso(
  valor,
  fusoHorario = contexto.data?.company?.timezone || 'America/Sao_Paulo',
) {
  if (!valor) return null;
  if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(valor)) return new Date(valor).toISOString();
  const correspondencia = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(valor);
  if (!correspondencia) {
    const dadosRecebidos = new Date(valor);
    return Number.isNaN(dadosRecebidos.getTime()) ? null : dadosRecebidos.toISOString();
  }
  const [
    ,
    outroItemComparado,
    mesAtual,
    dadosRegistro,
    cabecalhos2,
    indiceManutencao,
    segundos = '0',
  ] = correspondencia;
  const desejado = Date.UTC(
    +outroItemComparado,
    +mesAtual - 1,
    +dadosRegistro,
    +cabecalhos2,
    +indiceManutencao,
    +segundos,
  );
  let palpite = desejado;
  const formatador = new Intl.DateTimeFormat('en-CA', {
    timeZone: fusoHorario,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let indiceItem = 0; indiceItem < 3; indiceItem += 1) {
    const partes = Object.fromEntries(
      formatador
        .formatToParts(new Date(palpite))
        .map((parametroItem) => [parametroItem.type, parametroItem.value]),
    );
    const exibido = Date.UTC(
      +partes.year,
      +partes.month - 1,
      +partes.day,
      +partes.hour,
      +partes.minute,
      +partes.second,
    );
    palpite += desejado - exibido;
  }
  return new Date(palpite).toISOString();
}

function resolverMotoristas(motoristas) {
  const porDocumento = new Map();
  const porNome = new Map();
  const nomesAmbiguos = new Set();
  for (const correspondenciaItem of motoristas || []) {
    if (correspondenciaItem.internal_document)
      porDocumento.set(
        normalizarChave(correspondenciaItem.internal_document),
        correspondenciaItem.id,
      );
    const nome = normalizarChave(correspondenciaItem.full_name);
    if (!nome) continue;
    if (porNome.has(nome)) nomesAmbiguos.add(nome);
    else porNome.set(nome, correspondenciaItem.id);
  }
  return (valor) => {
    const chave = normalizarChave(valor);
    if (!chave) return null;
    if (porDocumento.has(chave)) return porDocumento.get(chave);
    if (nomesAmbiguos.has(chave)) return null;
    return porNome.get(chave) || null;
  };
}

async function prepararContextoImportacao(modeloIdentificador) {
  const precisaVeiculos = ['veiculos', 'abastecimentos', 'manutencoes', 'viagens'].includes(
    modeloIdentificador,
  );
  const precisaMotoristas = ['motoristas', 'abastecimentos', 'viagens'].includes(
    modeloIdentificador,
  );
  const precisaUsuarios = modeloIdentificador === 'equipe';

  const [veiculos, motoristas, usuarios] = await Promise.all([
    precisaVeiculos ? dados.vehicles.list() : [],
    precisaMotoristas ? dados.drivers.list() : [],
    precisaUsuarios ? dados.users.list() : { members: [] },
  ]).catch((erro) => {
    throw new Error('Não foi possível consultar os cadastros da empresa.', { cause: erro });
  });

  const porPlaca = new Map(
    (veiculos || []).map((veiculoItem) => [normalizarPlaca(veiculoItem.plate), veiculoItem.id]),
  );
  const docsMotorista = new Set(
    (motoristas || [])
      .map((dadosRegistro) => normalizarChave(dadosRegistro.internal_document))
      .filter(Boolean),
  );
  const membros = usuarios?.members ?? usuarios?.items ?? (Array.isArray(usuarios) ? usuarios : []);
  const emails = new Set(
    (membros || []).map((usuarioItem) => normalizarChave(usuarioItem.email)).filter(Boolean),
  );
  const resolverMotorista = resolverMotoristas(motoristas);

  return {
    validarVeiculo,
    resolverVeiculo: (placa) => porPlaca.get(normalizarPlaca(placa)) || null,
    resolverMotorista,
    existeVeiculo: (placa) => porPlaca.has(normalizarPlaca(placa)),
    existeMotoristaDocumento: (documento) => docsMotorista.has(normalizarChave(documento)),
    existeUsuarioEmail: (email) => emails.has(normalizarChave(email)),
    converterDataHora: empresaLocalParaIso,
  };
}

function traduzirErro(erroRecebido) {
  const dica = erroRecebido?.hint || '';
  if (dica === 'CONFLICT_DUPLICATE') return 'Já existe um registro com esse identificador.';
  if (dica === 'ODOMETER_REGRESSION') return 'Odômetro menor que a última leitura do veículo.';
  if (dica === 'CHRONOLOGY_ERROR')
    return erroRecebido.message || 'Data anterior ao último evento do veículo.';
  if (dica === 'CONFLICT_STATE')
    return erroRecebido.message || 'O registro conflita com o estado atual.';
  if (dica === 'USER_ALREADY_LINKED') return 'Este usuário já possui vínculo ativo.';
  if (dica === 'VALIDATION_ERROR') return erroRecebido.message || 'Dados inválidos.';
  if (dica === 'PERMISSION_DENIED') return 'Sem permissão para criar este registro.';
  if (dica === 'NETWORK_ERROR')
    return 'Falha de rede. Tente novamente quando a conexão estabilizar.';
  return erroRecebido?.message || 'Falha ao gravar.';
}

async function executarFila(itens, concorrencia, tarefa, aoFinalizarItem, deveParar) {
  let proximo = 0;
  const executor = async () => {
    while (proximo < itens.length && !deveParar()) {
      const indice = proximo;
      proximo += 1;
      await tarefa(itens[indice]);
      aoFinalizarItem();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concorrencia, itens.length) }, () => executor()));
}

export function telaImportacao({ outlet: conteudoTela, setTitle: definirTitulo, query: consulta }) {
  definirTitulo('Importar planilha');

  if (!contexto.hasActiveMembership) {
    conteudoTela.replaceChildren(
      estadoVazio({
        title: 'Sem empresa ativa',
        description: 'É necessário estar vinculado a uma empresa para importar dados.',
      }),
    );
    return;
  }

  const modelosPermitidos = Object.values(MODELOS).filter((correspondenciaItem) =>
    contexto.can(PERMISSAO_POR_MODELO[correspondenciaItem.id]),
  );
  if (!modelosPermitidos.length) {
    conteudoTela.replaceChildren(
      estadoVazio({
        title: 'Você não tem acesso a importações',
        description:
          'Seu cargo não possui permissão de cadastro em lote. Peça ao administrador da empresa.',
      }),
    );
    return;
  }

  const solicitado = consulta?.get?.('tipo');
  let modeloIdentificador = modelosPermitidos.some(
    (correspondenciaItem) => correspondenciaItem.id === solicitado,
  )
    ? solicitado
    : modelosPermitidos[0].id;
  let resultado = null;
  let origem = null;
  let enviando = false;
  let cancelarSolicitado = false;
  let relatorio = null;
  let textoColado = '';
  let ultimoRenderizarProgresso = 0;
  let lote = null;
  let linhasOriginais = [];
  let sessaoDoEnvio;
  let sequenciaConferencia = 0;
  let sequenciaLeitura = 0;
  let conferenciaPendente = null;
  const secoesAbertas = new Map();

  const area = criarElemento('div', { class: 'import-page' });
  conteudoTela.replaceChildren(area);

  async function baixarModeloExcel() {
    try {
      const resultadoItem = await window.pnf.saveImportTemplate?.(modeloIdentificador);
      if (resultadoItem?.saved)
        notificacao('Modelo Excel salvo. Preencha a aba Dados e importe o arquivo aqui.', {
          tone: 'success',
        });
    } catch (erro) {
      notificacao(erro?.message || 'Não foi possível salvar o modelo Excel.', {
        tone: 'danger',
      });
    }
  }

  function baixarModeloCsv() {
    window.pnf
      .exportFile({
        suggestedName: `modelo-${modeloIdentificador}`,
        content: csvModelo(modeloIdentificador),
        format: 'csv',
      })
      .then((resultadoItem) => {
        if (resultadoItem?.saved) notificacao('Modelo CSV salvo.', { tone: 'success' });
      })
      .catch(() =>
        notificacao('Não foi possível salvar o modelo CSV.', {
          tone: 'danger',
        }),
      );
  }

  async function conferirLinhas(leitura, descricaoOrigem) {
    const conferencia = ++sequenciaConferencia;
    const modeloConferido = modeloIdentificador;
    const sessaoConferida = sessao.geracao;
    const pedido = { leitura, descricaoOrigem, erro: null };
    resultado = null;
    relatorio = null;
    lote = null;
    origem = descricaoOrigem;
    conferenciaPendente = null;
    secoesAbertas.delete('trocar');
    secoesAbertas.delete('previa');
    secoesAbertas.delete('corrigir');
    secoesAbertas.delete('falhas');
    if (!leitura?.linhas?.length) {
      renderizar();
      notificacao('A planilha está vazia ou só tem o cabeçalho.', {
        tone: 'warning',
      });
      return;
    }
    if (leitura.linhas.length > 10000) {
      renderizar();
      notificacao('O limite é de 10.000 linhas por importação. Divida a planilha.', {
        tone: 'warning',
      });
      return;
    }
    conferenciaPendente = pedido;
    renderizar();
    let resultadoConferido;
    let loteConferido;
    try {
      const contextoImportacao = await prepararContextoImportacao(modeloConferido);
      loteConferido = await identificarImportacao({
        empresa: contexto.data?.companyId,
        usuario: contexto.data?.userId,
        modelo: modeloConferido,
        linhas: leitura.linhas,
      });
      resultadoConferido = conferir(modeloConferido, leitura.linhas, contextoImportacao);
    } catch (erro) {
      pedido.erro = erro?.message || 'Não foi possível conferir a planilha.';
    }
    if (
      conferencia !== sequenciaConferencia ||
      sessaoConferida !== sessao.geracao ||
      !area.isConnected
    )
      return;
    if (resultadoConferido) {
      resultado = resultadoConferido;
      linhasOriginais = leitura.linhas;
      lote = loteConferido;
      resultado.invalidas = resultado.invalidas.filter((item) => !lote.gravadas.has(item.linha));
      resultado.cabecalho = leitura.cabecalho;
      resultado.formato = leitura.formato;
      resultado.aba = leitura.aba || null;
      conferenciaPendente = null;
    }
    renderizar();
  }

  async function lerArquivo(arquivo) {
    if (!arquivo) return;
    const pedido = ++sequenciaLeitura;
    const conferencia = sequenciaConferencia;
    try {
      const nome = arquivo.name || 'planilha';
      const extensao = nome.toLowerCase().split('.').pop();
      let leitura;
      if (extensao === 'xlsx') {
        leitura = await lerPlanilhaXlsx(await arquivo.arrayBuffer());
      } else if (['csv', 'txt', 'tsv'].includes(extensao)) {
        leitura = lerCsv(await arquivo.text());
      } else {
        notificacao('Use um arquivo .xlsx ou .csv.', { tone: 'warning' });
      }
      if (
        leitura &&
        pedido === sequenciaLeitura &&
        conferencia === sequenciaConferencia &&
        !enviando &&
        area.isConnected
      )
        await conferirLinhas(leitura, nome);
    } catch (erro) {
      if (pedido !== sequenciaLeitura || conferencia !== sequenciaConferencia || !area.isConnected)
        return;
      notificacao(erro?.message || 'Não foi possível ler a planilha.', {
        tone: 'danger',
        duration: 8000,
      });
    }
  }

  async function conferirColado() {
    if (!textoColado.trim()) {
      notificacao('Cole primeiro as células copiadas do Excel.', {
        tone: 'warning',
      });
      return;
    }
    await conferirLinhas(lerCsv(textoColado), 'dados colados');
  }

  function atualizarProgresso(forcar = false) {
    const agora = Date.now();
    if (forcar || agora - ultimoRenderizarProgresso > 120) {
      ultimoRenderizarProgresso = agora;
      renderizar();
    }
  }

  async function gravarItem(item, gravar) {
    try {
      if (sessao.geracao !== sessaoDoEnvio) {
        cancelarSolicitado = true;
        throw new Error('A sessão mudou. Retome o lote após entrar novamente.');
      }
      const comando = await lote.comando(item.linha);
      if (sessao.geracao !== sessaoDoEnvio) {
        cancelarSolicitado = true;
        throw new Error('A sessão mudou. Retome o lote após entrar novamente.');
      }
      await gravar({ ...item.dados, commandId: comando });
      lote.confirmar(item.linha);
      relatorio.sucesso += 1;
    } catch (erro) {
      relatorio.falhas.push({ linha: item.linha, motivo: traduzirErro(erro) });
    } finally {
      relatorio.processados += 1;
    }
  }

  async function enviarAbastecimentos(itens, gravar) {
    const grupos = new Map();
    for (const item of itens) {
      const chave = item.dados.vehicleId;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(item);
    }
    for (const grupo of grupos.values()) {
      grupo.sort((primeiroItem, segundoItem) => {
        if (primeiroItem.dados.fueledAt && segundoItem.dados.fueledAt)
          return new Date(primeiroItem.dados.fueledAt) - new Date(segundoItem.dados.fueledAt);
        return primeiroItem.linha - segundoItem.linha;
      });
    }
    await executarFila(
      [...grupos.values()],
      CONCORRENCIA_POR_MODELO.abastecimentos,
      async (grupo) => {
        for (const item of grupo) {
          if (cancelarSolicitado) break;
          await gravarItem(item, gravar);
          atualizarProgresso();
        }
      },
      () => {},
      () => cancelarSolicitado,
    );
  }

  async function enviar() {
    if (!resultado?.validas.length || enviando || !lote) return;
    const pendentes = resultado.validas.filter((item) => !lote.gravadas.has(item.linha));
    if (!pendentes.length) return;
    enviando = true;
    sessaoDoEnvio = sessao.geracao;
    cancelarSolicitado = false;
    relatorio = {
      sucesso: 0,
      falhas: [],
      processados: 0,
      total: pendentes.length,
      cancelado: false,
    };
    renderizar();
    const gravar = ENVIO_POR_MODELO[modeloIdentificador];

    if (modeloIdentificador === 'abastecimentos') {
      await enviarAbastecimentos(pendentes, gravar);
    } else {
      await executarFila(
        pendentes,
        CONCORRENCIA_POR_MODELO[modeloIdentificador] || 3,
        (item) => gravarItem(item, gravar),
        () => atualizarProgresso(),
        () => cancelarSolicitado,
      );
    }

    relatorio.cancelado = cancelarSolicitado && relatorio.processados < relatorio.total;
    enviando = false;
    atualizarProgresso(true);

    if (relatorio.cancelado) {
      notificacao(`Importação interrompida após ${relatorio.processados} linha(s).`, {
        tone: 'warning',
      });
    } else if (relatorio.falhas.length === 0) {
      notificacao(`${relatorio.sucesso} registro(s) importado(s).`, {
        tone: 'success',
      });
    } else {
      notificacao(`${relatorio.sucesso} importado(s), ${relatorio.falhas.length} com erro.`, {
        tone: 'warning',
        duration: 8000,
      });
    }
  }

  function baixarErros() {
    if (!relatorio?.falhas.length && !resultado?.invalidas.length) return;
    const originais = new Map(linhasOriginais.map((linha) => [linha.__linha, linha]));
    const linhaErro = (item) =>
      [item.linha, item.motivo, JSON.stringify(originais.get(item.linha) ?? '')]
        .map((valor) => escaparCelulaCsv(valor))
        .join(';');
    const linhas = [
      'Linha;Motivo;Dados originais',
      ...(resultado?.invalidas || []).map(linhaErro),
      ...(relatorio?.falhas || []).map(linhaErro),
    ];
    window.pnf
      .exportFile({
        suggestedName: `erros-${modeloIdentificador}`,
        content: `\uFEFF${linhas.join('\n')}\n`,
        format: 'csv',
      })
      .catch(() => {});
  }

  function detalhes(chave, titulo, filhos, abertoPorPadrao = false) {
    return criarElemento('details', {
      class: 'import-details',
      open: secoesAbertas.get(chave) ?? abertoPorPadrao,
      onToggle: (evento) => {
        const secao = evento.currentTarget;
        if (secao.isConnected) secoesAbertas.set(chave, secao.open);
      },
    }, [
      criarElemento('summary', { text: titulo }),
      criarElemento('div', { class: 'import-details-body' }, filhos),
    ]);
  }

  function controlesDaPlanilha() {
    const seletor = criarElemento('select', {
      class: 'select',
      id: 'imp-tipo',
      disabled: enviando,
      onChange: (evento) => {
        sequenciaConferencia++;
        modeloIdentificador = evento.target.value;
        resultado = null;
        relatorio = null;
        lote = null;
        conferenciaPendente = null;
        origem = null;
        textoColado = '';
        renderizar();
        area.querySelector('#imp-tipo')?.focus();
      },
    }, modelosPermitidos.map((item) =>
      criarElemento('option', {
        value: item.id,
        text: item.id === 'locais' ? 'Pátios e bases' : item.titulo,
        selected: item.id === modeloIdentificador,
      }),
    ));

    const entradaArquivo = criarElemento('input', {
      id: 'imp-arquivo',
      type: 'file',
      accept:
        '.xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      hidden: true,
      disabled: enviando,
      onChange: (evento) => lerArquivo(evento.target.files?.[0]),
    });
    const zonaArquivo = criarElemento('div', {
      class: 'import-drop',
      onDragover: (evento) => {
        evento.preventDefault();
        if (!enviando) evento.currentTarget.classList.add('is-dragging');
      },
      onDragleave: (evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget))
          evento.currentTarget.classList.remove('is-dragging');
      },
      onDrop: (evento) => {
        evento.preventDefault();
        evento.currentTarget.classList.remove('is-dragging');
        if (!enviando) void lerArquivo(evento.dataTransfer?.files?.[0]);
      },
    }, [
      criarElemento('div', { class: 'import-drop-copy' }, [
        criarElemento('strong', { text: 'Arraste a planilha aqui' }),
        criarElemento('p', { class: 'field-hint', text: 'Excel (.xlsx) ou CSV, até 20 MB.' }),
      ]),
      entradaArquivo,
      botao({
        label: 'Escolher arquivo',
        icon: 'upload',
        variant: 'primary',
        disabled: enviando,
        onClick: () => entradaArquivo.click(),
      }),
    ]);

    const botaoConferirColagem = botao({
      label: 'Conferir dados colados',
      icon: 'check',
      disabled: enviando || !textoColado.trim(),
      onClick: conferirColado,
    });
    const colagem = detalhes('colagem', 'Colar dados do Excel', [
      criarElemento('label', {
        class: 'field-label',
        for: 'imp-colagem',
        text: 'Copie as células junto com o cabeçalho.',
      }),
      criarElemento('textarea', {
        class: 'textarea',
        id: 'imp-colagem',
        rows: 4,
        disabled: enviando,
        onInput: (evento) => {
          textoColado = evento.target.value;
          botaoConferirColagem.disabled = enviando || !textoColado.trim();
        },
      }, [textoColado]),
      criarElemento('div', { class: 'import-actions' }, [botaoConferirColagem]),
    ]);

    return [
      criarElemento('div', { class: 'field import-model-field' }, [
        criarElemento('label', {
          class: 'field-label',
          for: 'imp-tipo',
          text: 'O que você quer importar?',
        }),
        seletor,
      ]),
      zonaArquivo,
      colagem,
    ];
  }

  function guiaDaPlanilha() {
    const modelo = MODELOS[modeloIdentificador];
    const nome = modelo.id === 'locais' ? 'Pátios e bases' : modelo.titulo;
    return [
      criarElemento('div', { class: 'import-modelo-pronto' }, [
        criarElemento('p', { text: `Modelo pronto · ${nome}` }),
        botao({ label: 'Baixar modelo Excel', icon: 'download', onClick: baixarModeloExcel }),
      ]),
      detalhes('modelo', 'Como preencher a planilha', [
        criarElemento('ol', { class: 'import-instrucoes' }, [
          criarElemento('li', { text: 'Baixe o modelo do tipo selecionado.' }),
          criarElemento('li', {
            text: 'Preencha a aba Dados, com um registro por linha. Mantenha os cabeçalhos e complete os campos obrigatórios. Os opcionais podem ficar vazios.',
          }),
          criarElemento('li', {
            text: 'Salve o arquivo, volte aqui e clique em Escolher arquivo. Confira a prévia antes de importar.',
          }),
        ]),
        criarElemento('div', { class: 'import-actions' }, [
          botao({ label: 'Baixar modelo CSV', icon: 'download', onClick: baixarModeloCsv }),
        ]),
        tabela(['Coluna', 'Preenchimento', 'Exemplo'], modelo.colunas.map((coluna) =>
          criarElemento('tr', {}, [
            criarElemento('td', { text: coluna.nome }),
            criarElemento('td', { text: coluna.obrigatoria ? 'Obrigatório' : 'Opcional' }),
            criarElemento('td', { text: coluna.exemplo }),
          ]),
        )),
      ]),
    ];
  }

  function renderizarConferencia() {
    const { leitura, descricaoOrigem, erro } = conferenciaPendente;
    return cartao({
      title: 'Conferir planilha',
      children: [
        criarElemento('p', { class: 'field-hint import-source', text: descricaoOrigem }),
        erro
          ? estadoErro({
              title: 'Conferência interrompida',
              description: `${erro} Você pode tentar de novo com a mesma planilha.`,
              onRetry: () => conferirLinhas(leitura, descricaoOrigem),
            })
          : criarElemento('p', { role: 'status', text: 'Conferindo a planilha…' }),
      ],
    });
  }

  function listarErros(chave, titulo, itens, aberto = false) {
    if (!itens.length) return null;
    return detalhes(chave, `${titulo} (${itens.length})`, [
      tabela(['Linha', 'O que aconteceu'], itens.slice(0, 60).map((item) =>
        criarElemento('tr', {}, [
          criarElemento('td', { text: String(item.linha) }),
          criarElemento('td', { text: item.motivo }),
        ]),
      )),
      itens.length > 60
        ? criarElemento('p', { class: 'field-hint', text: 'Baixe a lista completa para ver os demais erros.' })
        : null,
    ], aberto);
  }

  function renderizarPrevia(prontas) {
    const colunas = resultado.cabecalho.filter(Boolean).slice(0, 6);
    const chaves = colunas.map(normalizarCabecalho);
    const porLinha = new Map(linhasOriginais.map((linha) => [linha.__linha, linha]));
    return detalhes('previa', 'Prévia das linhas prontas', [
      tabela(['Linha', ...colunas], prontas.slice(0, 12).map(({ linha }) =>
        criarElemento('tr', {}, [
          criarElemento('td', { text: String(linha) }),
          ...chaves.map((chave) => criarElemento('td', { text: String(porLinha.get(linha)?.[chave] || '—') })),
        ]),
      )),
      prontas.length > 12
        ? criarElemento('p', { class: 'field-hint', text: `Mostrando 12 de ${prontas.length} linhas.` })
        : null,
    ], true);
  }

  function renderizarResultado() {
    const prontas = resultado.validas.filter((item) => !lote.gravadas.has(item.linha));
    const totalErros = resultado.invalidas.length + (relatorio?.falhas.length || 0);
    const acabou = relatorio && !enviando;
    const percentual = enviando ? Math.round((relatorio.processados / relatorio.total) * 100) : 0;
    const origemInformacoes = `${origem}${resultado.aba ? ` · ${resultado.aba}` : ''}`;
    const resumo = [
      ['Lidas', resultado.total],
      ['Prontas', prontas.length],
      ...(lote.gravadas.size ? [['Já gravadas', lote.gravadas.size]] : []),
      ...(totalErros ? [['Com erro', totalErros]] : []),
    ];
    let resultadoEnvio = null;
    if (acabou) {
      const importadas = relatorio.sucesso === 1 ? 'linha importada' : 'linhas importadas';
      const saldo = `${relatorio.sucesso} ${importadas} nesta tentativa.`;
      resultadoEnvio = criarElemento('p', {
        class: 'import-status',
        role: 'status',
        text: relatorio.cancelado ? `Envio interrompido. ${saldo}` : saldo,
      });
    }

    return cartao({
      title: enviando ? 'Importação em andamento' : acabou ? 'Resultado da importação' : 'Conferir planilha',
      children: [
        criarElemento('p', { class: 'field-hint import-source', text: origemInformacoes }),
        resumoImportacao(resumo),
        resultadoEnvio,
        enviando
          ? criarElemento('div', { class: 'import-progress' }, [
              criarElemento('progress', {
                value: relatorio.processados,
                max: relatorio.total,
                'aria-label': 'Progresso da importação',
              }),
              criarElemento('p', {
                class: 'field-hint',
                text: `${percentual}% · ${relatorio.processados} de ${relatorio.total} processadas`,
              }),
            ])
          : null,
        prontas.length && !enviando ? renderizarPrevia(prontas) : null,
        !enviando ? listarErros('corrigir', 'Linhas que precisam de correção', resultado.invalidas, !prontas.length) : null,
        acabou ? listarErros('falhas', 'Falhas ao importar', relatorio.falhas, true) : null,
        !acabou && !enviando && !prontas.length && !totalErros
          ? criarElemento('p', { class: 'field-hint', text: 'Todas as linhas desta planilha já foram importadas.' })
          : null,
        criarElemento('div', { class: 'import-actions import-result-actions' }, [
          !enviando && totalErros
            ? botao({ label: 'Baixar lista de erros', onClick: baixarErros })
            : null,
          enviando
            ? botao({
                label: cancelarSolicitado ? 'Parada solicitada' : 'Parar após as linhas em andamento',
                disabled: cancelarSolicitado,
                onClick: () => { cancelarSolicitado = true; renderizar(); },
              })
            : null,
          prontas.length && !enviando
            ? botao({
                label: lote.gravadas.size || acabou
                  ? 'Importar somente pendentes'
                  : `Importar ${prontas.length} ${prontas.length === 1 ? 'linha' : 'linhas'}`,
                variant: 'primary',
                icon: 'upload',
                permission: PERMISSAO_POR_MODELO[modeloIdentificador],
                onClick: enviar,
              })
            : null,
        ]),
      ],
    });
  }

  function renderizar() {
    const temLeitura = Boolean(resultado || conferenciaPendente);
    const controles = enviando ? null : controlesDaPlanilha();
    const secao = controles
      ? cartao({
          children: temLeitura
            ? [...guiaDaPlanilha(), detalhes('trocar', 'Trocar arquivo ou tipo', controles)]
            : [controles[0], ...guiaDaPlanilha(), ...controles.slice(1)],
        })
      : null;
    const elementos = [
      cabecalhoPagina({
        title: 'Importar planilha',
        subtitle: 'Escolha uma planilha e confira os dados antes de importar.',
        iconName: 'sheet',
      }),
      conferenciaPendente ? renderizarConferencia() : resultado ? renderizarResultado() : null,
      secao,
    ];
    area.replaceChildren(...elementos.filter(Boolean));
  }

  renderizar();
  return () => {
    cancelarSolicitado = true;
  };
}

function resumoImportacao(itens) {
  return criarElemento('dl', { class: 'import-summary' }, itens.map(([rotulo, valor]) =>
    criarElemento('div', {}, [
      criarElemento('dt', { text: rotulo }),
      criarElemento('dd', { text: String(valor) }),
    ]),
  ));
}
