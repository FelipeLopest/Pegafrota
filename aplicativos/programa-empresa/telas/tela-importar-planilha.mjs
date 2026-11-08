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
  estadoVazio,
} from '../componentes/componentes-do-programa.mjs';
import { dados } from '../dados/dados-do-programa.mjs';
import { contexto } from '../acesso/sessao-e-permissoes.mjs';
import { PERMISSAO } from '@peganafrota/contracts';
import { validarVeiculo } from '@peganafrota/validation';
import { icone } from '../componentes/icones.mjs';
import { lerCsv, lerPlanilhaXlsx, conferir, csvModelo, MODELOS } from '@peganafrota/validation/importacao';

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

const ENVIO_POR_MODELO = {
  veiculos: (dadosRegistro) => dados.vehicles.create(dadosRegistro),
  motoristas: (dadosRegistro) => dados.drivers.create(dadosRegistro),
  locais: (dadosRegistro) => dados.locations.create(dadosRegistro),
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

const ICONE_POR_MODELO = {
  veiculos: 'truck',
  motoristas: 'users',
  locais: 'pin',
  abastecimentos: 'fuel',
  manutencoes: 'tool',
  viagens: 'route',
  equipe: 'users',
};

function trilhaImportacao({ resultado, relatorio, enviando }) {
  const atual = relatorio && !enviando ? 4 : resultado ? 3 : 2;
  const passos = [
    ['1', 'Modelo'],
    ['2', 'Enviar dados'],
    ['3', 'Conferir'],
    ['4', 'Resultado'],
  ];
  return criarElemento(
    'div',
    { class: 'import-stepper', 'aria-label': 'Etapas da importação' },
    passos.map(([numero, rotulo], indice) =>
      criarElemento(
        'div',
        {
          class: `import-step${indice + 1 < atual ? ' is-complete' : ''}${indice + 1 === atual ? ' is-active' : ''}`,
        },
        [
          criarElemento('span', { class: 'import-step-number', text: numero }),
          criarElemento('span', { class: 'import-step-label', text: rotulo }),
        ],
      ),
    ),
  );
}

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

function empresaLocalParaIso(valor, fusoHorario = contexto.data?.company?.timezone || 'America/Sao_Paulo') {
  if (!valor) return null;
  if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(valor)) return new Date(valor).toISOString();
  const correspondencia = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(valor);
  if (!correspondencia) {
    const dadosRecebidos = new Date(valor);
    return Number.isNaN(dadosRecebidos.getTime()) ? null : dadosRecebidos.toISOString();
  }
  const [, outroItemComparado, mesAtual, dadosRegistro, cabecalhos2, indiceManutencao, segundos = '0'] =
    correspondencia;
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
      porDocumento.set(normalizarChave(correspondenciaItem.internal_document), correspondenciaItem.id);
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
  const precisaMotoristas = ['motoristas', 'abastecimentos', 'viagens'].includes(modeloIdentificador);
  const precisaUsuarios = modeloIdentificador === 'equipe';

  const [veiculos, motoristas, usuarios] = await Promise.all([
    precisaVeiculos ? dados.vehicles.list().catch(() => []) : [],
    precisaMotoristas ? dados.drivers.list().catch(() => []) : [],
    precisaUsuarios ? dados.users.list().catch(() => ({ members: [] })) : { members: [] },
  ]);

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
  if (dica === 'CONFLICT_STATE') return erroRecebido.message || 'O registro conflita com o estado atual.';
  if (dica === 'USER_ALREADY_LINKED') return 'Este usuário já possui vínculo ativo.';
  if (dica === 'VALIDATION_ERROR') return erroRecebido.message || 'Dados inválidos.';
  if (dica === 'PERMISSION_DENIED') return 'Sem permissão para criar este registro.';
  if (dica === 'NETWORK_ERROR') return 'Falha de rede. Tente novamente quando a conexão estabilizar.';
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
        description: 'Seu cargo não possui permissão de cadastro em lote. Peça ao administrador da empresa.',
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
      notificacao(erro?.message || 'Não foi possível salvar o modelo Excel.', { tone: 'danger' });
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
      .catch(() => notificacao('Não foi possível salvar o modelo CSV.', { tone: 'danger' }));
  }

  async function conferirLinhas(leitura, descricaoOrigem) {
    resultado = null;
    relatorio = null;
    origem = descricaoOrigem;
    renderizar();
    if (!leitura?.linhas?.length) {
      notificacao('A planilha está vazia ou só tem o cabeçalho.', { tone: 'warning' });
      return;
    }
    if (leitura.linhas.length > 10000) {
      notificacao('O limite é de 10.000 linhas por importação. Divida a planilha.', { tone: 'warning' });
      return;
    }
    try {
      const contextoImportacao = await prepararContextoImportacao(modeloIdentificador);
      resultado = conferir(modeloIdentificador, leitura.linhas, contextoImportacao);
      resultado.cabecalho = leitura.cabecalho;
      resultado.formato = leitura.formato;
      resultado.aba = leitura.aba || null;
    } catch (erro) {
      notificacao(erro?.message || 'Não foi possível conferir a planilha.', { tone: 'danger' });
    }
    renderizar();
  }

  async function lerArquivo(arquivo) {
    if (!arquivo) return;
    try {
      const nome = arquivo.name || 'planilha';
      const extensao = nome.toLowerCase().split('.').pop();
      if (extensao === 'xlsx') {
        await conferirLinhas(await lerPlanilhaXlsx(await arquivo.arrayBuffer()), nome);
      } else if (['csv', 'txt', 'tsv'].includes(extensao)) {
        await conferirLinhas(lerCsv(await arquivo.text()), nome);
      } else {
        notificacao('Use um arquivo .xlsx ou .csv.', { tone: 'warning' });
      }
    } catch (erro) {
      notificacao(erro?.message || 'Não foi possível ler a planilha.', { tone: 'danger', duration: 8000 });
    }
  }

  async function conferirColado() {
    if (!textoColado.trim()) {
      notificacao('Cole primeiro as células copiadas do Excel.', { tone: 'warning' });
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
      await gravar(item.dados);
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
    if (!resultado?.validas.length || enviando) return;
    enviando = true;
    cancelarSolicitado = false;
    relatorio = { sucesso: 0, falhas: [], processados: 0, total: resultado.validas.length, cancelado: false };
    renderizar();
    const gravar = ENVIO_POR_MODELO[modeloIdentificador];

    if (modeloIdentificador === 'abastecimentos') {
      await enviarAbastecimentos(resultado.validas, gravar);
    } else {
      await executarFila(
        resultado.validas,
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
      notificacao(`Importação interrompida após ${relatorio.processados} linha(s).`, { tone: 'warning' });
    } else if (relatorio.falhas.length === 0) {
      notificacao(`${relatorio.sucesso} registro(s) importado(s).`, { tone: 'success' });
    } else {
      notificacao(`${relatorio.sucesso} importado(s), ${relatorio.falhas.length} com erro.`, {
        tone: 'warning',
        duration: 8000,
      });
    }
  }

  function baixarErros() {
    if (!relatorio?.falhas.length && !resultado?.invalidas.length) return;
    const linhas = [
      'Linha;Motivo',
      ...(resultado?.invalidas || []).map(
        (indiceItem) => `${indiceItem.linha};${String(indiceItem.motivo).replace(/;/g, ',')}`,
      ),
      ...(relatorio?.falhas || []).map(
        (formulario) => `${formulario.linha};${String(formulario.motivo).replace(/;/g, ',')}`,
      ),
    ];
    window.pnf
      .exportFile({
        suggestedName: `erros-${modeloIdentificador}`,
        content: `\uFEFF${linhas.join('\n')}\n`,
        format: 'csv',
      })
      .catch(() => {});
  }

  function renderizar() {
    const modelo = MODELOS[modeloIdentificador];
    const seletor = criarElemento(
      'select',
      {
        class: 'select import-select',
        id: 'imp-tipo',
        disabled: enviando,
        onChange: (evento) => {
          modeloIdentificador = evento.target.value;
          resultado = null;
          relatorio = null;
          origem = null;
          textoColado = '';
          renderizar();
        },
      },
      modelosPermitidos.map((correspondenciaItem) =>
        criarElemento('option', {
          value: correspondenciaItem.id,
          text: correspondenciaItem.titulo,
          selected: correspondenciaItem.id === modeloIdentificador,
        }),
      ),
    );

    const seletorDecorado = criarElemento('div', { class: 'import-select-shell' }, [
      criarElemento('span', { class: 'import-select-leading', 'aria-hidden': 'true' }, [
        icone(ICONE_POR_MODELO[modeloIdentificador] || 'sheet'),
      ]),
      seletor,
      criarElemento('span', { class: 'import-select-chevron', 'aria-hidden': 'true' }, [
        icone('down', { size: 'sm' }),
      ]),
    ]);

    const entradaArquivo = criarElemento('input', {
      id: 'imp-arquivo',
      type: 'file',
      accept: '.xlsx,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      class: 'import-file-input',
      disabled: enviando,
      onChange: (evento) => lerArquivo(evento.target.files?.[0]),
    });

    const botaoExcel = botao({
      label: 'Baixar modelo Excel',
      icon: 'sheet',
      variant: 'primary',
      onClick: baixarModeloExcel,
    });
    const botaoCsv = botao({
      label: 'Baixar modelo CSV',
      icon: 'download',
      variant: 'automation',
      onClick: baixarModeloCsv,
    });

    const passo1 = cartao({
      title: '1. Escolha o cadastro e use um modelo pronto',
      children: [
        criarElemento('div', { class: 'import-model-grid' }, [
          criarElemento('div', { class: 'field import-model-field' }, [
            criarElemento('label', { class: 'field-label', for: 'imp-tipo', text: 'Tipo de registro' }),
            seletorDecorado,
            criarElemento('p', { class: 'field-hint import-model-description', text: modelo.descricao }),
          ]),
          criarElemento('div', { class: 'import-template-panel' }, [
            criarElemento('div', { class: 'import-template-head' }, [
              criarElemento('span', { class: 'import-template-icon', 'aria-hidden': 'true' }, [
                icone('sheet'),
              ]),
              criarElemento('div', {}, [
                criarElemento('strong', { text: 'Comece pelo modelo oficial' }),
                criarElemento('span', { text: 'Já vem com as colunas certas para evitar retrabalho.' }),
              ]),
            ]),
            criarElemento('div', { class: 'import-template-actions' }, [botaoExcel, botaoCsv]),
          ]),
        ]),
        criarElemento('div', { class: 'import-columns-head' }, [
          criarElemento('div', {}, [
            criarElemento('h3', { class: 'card-title', text: 'Estrutura esperada' }),
            criarElemento('p', {
              class: 'field-hint',
              text: 'As colunas obrigatórias precisam existir; as demais podem ficar vazias.',
            }),
          ]),
          criarElemento('span', { class: 'import-format-badge', text: `${modelo.colunas.length} colunas` }),
        ]),
        tabela(
          ['Coluna', 'Obrigatória', 'Exemplo'],
          modelo.colunas.map((registro) =>
            criarElemento('tr', {}, [
              criarElemento('td', { text: registro.nome }),
              criarElemento('td', {}, [
                criarElemento('span', {
                  class: `import-required-badge${registro.obrigatoria ? ' is-required' : ''}`,
                  text: registro.obrigatoria ? 'Obrigatória' : 'Opcional',
                }),
              ]),
              criarElemento('td', { class: 'mono', text: registro.exemplo }),
            ]),
          ),
        ),
      ],
    });
    passo1.classList.add('import-card');

    const colar = criarElemento(
      'textarea',
      {
        class: 'textarea',
        rows: '5',
        disabled: enviando,
        placeholder: 'Ou copie no Excel incluindo o cabeçalho e cole aqui…',
        onInput: (evento) => {
          textoColado = evento.target.value;
        },
      },
      [textoColado],
    );

    const zonaArquivo = criarElemento(
      'div',
      {
        class: 'import-drop',
        onDragenter: (evento) => {
          evento.preventDefault();
          evento.currentTarget.classList.add('is-dragging');
        },
        onDragover: (evento) => {
          evento.preventDefault();
          evento.currentTarget.classList.add('is-dragging');
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
      },
      [
        criarElemento('div', { class: 'import-drop-icon', 'aria-hidden': 'true' }, [
          icone('upload', { size: 'lg' }),
        ]),
        criarElemento('div', { class: 'import-drop-copy' }, [
          criarElemento('strong', { class: 'import-drop-title', text: 'Arraste sua planilha aqui' }),
          criarElemento('p', {
            text: 'Excel (.xlsx) ou CSV. O arquivo é analisado localmente antes de qualquer cadastro.',
          }),
        ]),
        criarElemento('div', { class: 'import-file-actions' }, [
          entradaArquivo,
          criarElemento(
            'label',
            {
              class: `btn btn-primary import-file-trigger${enviando ? ' is-disabled' : ''}`,
              for: 'imp-arquivo',
            },
            [icone('upload', { size: 'sm' }), criarElemento('span', { text: 'Escolher arquivo' })],
          ),
          criarElemento('span', { class: 'import-file-help', text: 'até 20 MB · primeira aba do Excel' }),
        ]),
      ],
    );

    const passo2 = cartao({
      title: '2. Envie o Excel/CSV ou cole as células',
      children: [
        zonaArquivo,
        criarElemento('div', { class: 'import-divider' }, [criarElemento('span', { text: 'ou' })]),
        criarElemento('div', { class: 'import-paste-panel' }, [
          criarElemento('div', { class: 'import-paste-head' }, [
            criarElemento('span', { class: 'import-paste-icon', 'aria-hidden': 'true' }, [icone('sheet')]),
            criarElemento('div', {}, [
              criarElemento('strong', { text: 'Cole direto do Excel' }),
              criarElemento('span', { text: 'Copie as células incluindo o cabeçalho e cole abaixo.' }),
            ]),
          ]),
          colar,
          criarElemento('div', { class: 'import-paste-actions' }, [
            botao({
              label: 'Conferir dados colados',
              icon: 'check',
              variant: 'automation',
              disabled: enviando || !textoColado.trim(),
              onClick: conferirColado,
            }),
          ]),
        ]),
        criarElemento('div', { class: 'import-safety-note' }, [
          icone('shield', { size: 'sm' }),
          criarElemento('span', {
            text: 'Nada é gravado nesta etapa. Primeiro o sistema valida e mostra as linhas que precisam de correção.',
          }),
        ]),
      ],
    });
    passo2.classList.add('import-card');

    let passo3 = null;
    if (resultado) {
      const resumo = criarElemento('div', { class: 'kpi-grid import-kpi-grid' }, [
        kpiSimples('Linhas lidas', resultado.total, 'neutral'),
        kpiSimples('Prontas', resultado.validas.length, 'success'),
        kpiSimples(
          'Com problema',
          resultado.invalidas.length,
          resultado.invalidas.length ? 'danger' : 'success',
        ),
      ]);
      const origemInformacoes = origem
        ? criarElemento('div', { class: 'import-source-badge' }, [
            icone('sheet', { size: 'sm' }),
            criarElemento('span', {
              text: `Fonte: ${origem}${resultado.aba ? ` · aba ${resultado.aba}` : ''}`,
            }),
          ])
        : null;
      const listaErros = resultado.invalidas.length
        ? criarElemento('div', { class: 'import-validation-panel is-danger' }, [
            criarElemento('div', { class: 'import-validation-head' }, [
              icone('warning'),
              criarElemento('div', {}, [
                criarElemento('h3', { class: 'card-title', text: 'Linhas que precisam de correção' }),
                criarElemento('p', {
                  class: 'field-hint',
                  text: 'Essas linhas não serão cadastradas até serem corrigidas.',
                }),
              ]),
            ]),
            tabela(
              ['Linha', 'O que corrigir'],
              resultado.invalidas
                .slice(0, 60)
                .map((indiceItem) =>
                  criarElemento('tr', {}, [
                    criarElemento('td', { class: 'mono', text: String(indiceItem.linha) }),
                    criarElemento('td', { text: indiceItem.motivo }),
                  ]),
                ),
            ),
            resultado.invalidas.length > 60
              ? criarElemento('p', {
                  class: 'field-hint',
                  text: `…e mais ${resultado.invalidas.length - 60}.`,
                })
              : null,
            botao({ label: 'Baixar lista de erros', icon: 'download', onClick: baixarErros }),
          ])
        : null;

      const previa = resultado.validas.length
        ? criarElemento('div', { class: 'import-validation-panel is-success' }, [
            criarElemento('div', { class: 'import-validation-head' }, [
              icone('check'),
              criarElemento('div', {}, [
                criarElemento('h3', { class: 'card-title', text: 'Prévia do que será importado' }),
                criarElemento('p', {
                  class: 'field-hint',
                  text: 'Confira uma amostra antes de confirmar o cadastro em massa.',
                }),
              ]),
            ]),
            tabela(
              ['Linha', ...Object.keys(resultado.validas[0].dados).slice(0, 6)],
              resultado.validas.slice(0, 12).map((veiculoItem) =>
                criarElemento('tr', {}, [
                  criarElemento('td', { class: 'mono', text: String(veiculoItem.linha) }),
                  ...Object.keys(resultado.validas[0].dados)
                    .slice(0, 6)
                    .map((chaveItem) =>
                      criarElemento('td', { text: String(veiculoItem.dados[chaveItem] ?? '—') }),
                    ),
                ]),
              ),
            ),
            resultado.validas.length > 12
              ? criarElemento('p', {
                  class: 'field-hint',
                  text: `Mostrando 12 de ${resultado.validas.length}.`,
                })
              : null,
          ])
        : null;

      const percentual = relatorio
        ? Math.round((relatorio.processados / Math.max(relatorio.total, 1)) * 100)
        : 0;
      const progresso =
        enviando && relatorio
          ? criarElemento('div', { class: 'import-progress' }, [
              criarElemento('div', { class: 'import-progress-head' }, [
                criarElemento('strong', { text: 'Importação em andamento' }),
                criarElemento('span', { class: 'import-progress-percent', text: `${percentual}%` }),
              ]),
              criarElemento('div', { class: 'import-progress-track' }, [
                criarElemento('div', { class: 'import-progress-bar', style: `width:${percentual}%` }),
              ]),
              criarElemento('div', { class: 'import-progress-stats' }, [
                criarElemento('span', { text: `${relatorio.processados}/${relatorio.total} processadas` }),
                criarElemento('span', { class: 'is-success', text: `${relatorio.sucesso} gravadas` }),
                criarElemento('span', {
                  class: relatorio.falhas.length ? 'is-danger' : '',
                  text: `${relatorio.falhas.length} falharam`,
                }),
              ]),
            ])
          : null;

      passo3 = cartao({
        title: '3. Confira e importe',
        children: [
          resumo,
          origemInformacoes,
          previa,
          listaErros,
          progresso,
          criarElemento('div', { class: 'modal-actions import-submit-actions' }, [
            enviando
              ? botao({
                  label: 'Parar após as atuais',
                  variant: 'danger',
                  icon: 'close',
                  onClick: () => {
                    cancelarSolicitado = true;
                  },
                })
              : null,
            botao({
              label: enviando ? 'Importando…' : `Importar ${resultado.validas.length} registro(s)`,
              variant: 'primary',
              icon: 'upload',
              busy: enviando,
              disabled: enviando || resultado.validas.length === 0,
              permission: PERMISSAO_POR_MODELO[modeloIdentificador],
              onClick: enviar,
            }),
          ]),
        ],
      });
      passo3.classList.add('import-card');
    }

    let passo4 = null;
    if (relatorio && !enviando) {
      passo4 = cartao({
        title: 'Resultado da importação',
        children: [
          criarElemento('div', { class: 'kpi-grid import-kpi-grid' }, [
            kpiSimples('Importados', relatorio.sucesso, 'success'),
            kpiSimples('Falharam', relatorio.falhas.length, relatorio.falhas.length ? 'danger' : 'success'),
            kpiSimples('Processados', relatorio.processados, 'neutral'),
          ]),
          relatorio.cancelado
            ? criarElemento('p', {
                class: 'field-hint',
                text: 'A importação foi interrompida. As linhas já concluídas permanecem gravadas.',
              })
            : null,
          relatorio.falhas.length
            ? criarElemento('div', {}, [
                tabela(
                  ['Linha', 'Motivo'],
                  relatorio.falhas
                    .slice(0, 60)
                    .map((formulario) =>
                      criarElemento('tr', {}, [
                        criarElemento('td', { class: 'mono', text: String(formulario.linha) }),
                        criarElemento('td', { text: formulario.motivo }),
                      ]),
                    ),
                ),
                botao({ label: 'Baixar lista de erros', icon: 'download', onClick: baixarErros }),
                criarElemento('p', {
                  class: 'field-hint',
                  text: 'Corrija somente as linhas com erro e importe novamente. Duplicidades são recusadas pelo sistema.',
                }),
              ])
            : criarElemento('p', {
                text: relatorio.cancelado
                  ? 'Nenhum erro nas linhas processadas.'
                  : 'Todas as linhas processadas foram importadas.',
              }),
        ],
      });
      passo4.classList.add('import-card', relatorio.falhas.length ? 'has-warning' : 'is-finished');
    }

    area.replaceChildren(
      cabecalhoPagina({
        title: 'Importar planilha',
        subtitle:
          'Automatize cadastros grandes com Excel, CSV ou copiando células. O sistema confere antes de gravar e mostra o resultado por linha.',
      }),
      trilhaImportacao({ resultado, relatorio, enviando }),
      passo1,
      passo2,
      passo3,
      passo4,
    );
  }

  renderizar();
}

function kpiSimples(rotulo, valor, tom = 'neutral') {
  return criarElemento('div', { class: 'kpi import-kpi', dataset: { tone: tom } }, [
    criarElemento('p', { class: 'kpi-label', text: rotulo }),
    criarElemento('p', { class: 'kpi-value', text: String(valor) }),
  ]);
}
