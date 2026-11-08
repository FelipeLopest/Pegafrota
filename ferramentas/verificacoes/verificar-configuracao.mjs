#!/usr/bin/env node
import { readFileSync as lerArquivoSincrono, existsSync as arquivoExiste } from 'node:fs';
import { join as juntarCaminhos } from 'node:path';

const RAIZ = process.cwd();
const problemas = [];
const verificacoes = [];

const sucesso = (identificador, detalhe) =>
  verificacoes.push({ id: identificador, ok: true, detail: detalhe });
const invalido = (identificador, detalhe) => {
  verificacoes.push({ id: identificador, ok: false, detail: detalhe });
  problemas.push(`${identificador}: ${detalhe}`);
};

const configuracaoCaminho = juntarCaminhos(RAIZ, 'supabase/config.toml');
if (!arquivoExiste(configuracaoCaminho)) {
  console.error('test:config  FAIL — supabase/config.toml ausente');
  process.exit(1);
}
const configuracao = lerArquivoSincrono(configuracaoCaminho, 'utf8');

function lerAmbiente(arquivo) {
  const saida = {};
  const completo = juntarCaminhos(RAIZ, arquivo);
  if (!arquivoExiste(completo)) return saida;
  for (const linha of lerArquivoSincrono(completo, 'utf8').split('\n')) {
    const correspondenciaItem = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
    if (correspondenciaItem)
      saida[correspondenciaItem[1]] = correspondenciaItem[2].trim().replace(/^["']|["']$/g, '');
  }
  return saida;
}

const ambiente = { ...lerAmbiente('.env.example'), ...lerAmbiente('.env') };

const correspondenciaLista = /additional_redirect_urls\s*=\s*\[([\s\S]*?)\]/.exec(configuracao);
const listaPermitida = correspondenciaLista
  ? [...correspondenciaLista[1].matchAll(/"([^"]+)"/g)].map((correspondenciaItem) => correspondenciaItem[1])
  : [];

if (listaPermitida.length === 0) {
  invalido('redirect_allowlist', 'additional_redirect_urls ausente ou vazia no config.toml');
} else {
  sucesso('redirect_allowlist', `${listaPermitida.length} destino(s) declarado(s)`);

  const baseConvite = ambiente.INVITE_BASE_URL;
  if (!baseConvite) {
    invalido('invite_base_url_definida', 'INVITE_BASE_URL não está em .env.example');
  } else {
    const origem = (() => {
      try {
        return new URL(baseConvite).origin;
      } catch {
        return null;
      }
    })();
    if (!origem) {
      invalido('invite_base_url_valida', `INVITE_BASE_URL não é URL válida: ${baseConvite}`);
    } else {
      const cobertos = listaPermitida.some((entrada) => {
        const limpo = entrada.replace(/\/\*\*$/, '').replace(/\/$/, '');
        return limpo === origem || baseConvite.startsWith(limpo);
      });
      if (cobertos) sucesso('invite_base_url_na_allowlist', `${origem} coberto`);
      else
        invalido(
          'invite_base_url_na_allowlist',
          `${origem} não está em additional_redirect_urls — o GoTrue ignoraria o redirectTo`,
        );
    }
  }
}

const minimoCorrespondencia = /minimum_password_length\s*=\s*(\d+)/.exec(configuracao);
const fonteValidacao = lerArquivoSincrono(
  juntarCaminhos(RAIZ, 'compartilhado/validacoes/validar-senha.mjs'),
  'utf8',
);
const compartilhadoCorrespondencia = /export const TAMANHO_MINIMO_SENHA\s*=\s*(\d+)/.exec(fonteValidacao);

if (!minimoCorrespondencia)
  invalido('auth_min_password', 'minimum_password_length não declarado no config.toml');
else if (!compartilhadoCorrespondencia)
  invalido('shared_min_password', 'TAMANHO_MINIMO_SENHA não exportado pelo pacote de validação');
else if (minimoCorrespondencia[1] !== compartilhadoCorrespondencia[1]) {
  invalido(
    'password_policy_alinhada',
    `Auth exige ${minimoCorrespondencia[1]} e o cliente valida ${compartilhadoCorrespondencia[1]} — o cliente aceitaria senha que o servidor recusa`,
  );
} else {
  sucesso('password_policy_alinhada', `${minimoCorrespondencia[1]} caracteres nos dois lados`);
}

const telaConvite = juntarCaminhos(
  RAIZ,
  'aplicativos/painel-administracao/telas/tela-aceitar-convite-equipe.mjs',
);
if (arquivoExiste(telaConvite)) {
  const fonte = lerArquivoSincrono(telaConvite, 'utf8');
  if (!/TAMANHO_MINIMO_SENHA/.test(fonte)) {
    invalido('tela_usa_constante', 'a tela de convite não importa TAMANHO_MINIMO_SENHA');
  } else if (/length\s*<\s*\d+/.test(fonte.replace(/TAMANHO_MINIMO_SENHA/g, 'K'))) {
    invalido('tela_sem_literal', 'a tela de convite compara comprimento com um número literal');
  } else {
    sucesso('tela_usa_constante', 'a tela lê a constante compartilhada');
  }
}

if (/\[functions\.platform-admin\]/.test(configuracao)) {
  sucesso('edge_function_declarada', 'platform-admin presente no config.toml');
  const secao = configuracao.slice(configuracao.indexOf('[functions.platform-admin]'));
  if (/verify_jwt\s*=\s*true/.test(secao.split('\n[')[0])) {
    sucesso('edge_function_verify_jwt', 'verify_jwt = true');
  } else {
    invalido('edge_function_verify_jwt', 'verify_jwt não está true para platform-admin');
  }
} else {
  invalido('edge_function_declarada', '[functions.platform-admin] ausente — a função nunca seria implantada');
}

const fonteServicos = lerArquivoSincrono(
  juntarCaminhos(RAIZ, 'aplicativos/painel-administracao/comunicacao/enviar-requisicao.mjs'),
  'utf8',
);
const fonteDadosProgramaEmpresa = lerArquivoSincrono(
  juntarCaminhos(RAIZ, 'aplicativos/programa-empresa/dados/dados-equipe.mjs'),
  'utf8',
);
const fnReferencias = [
  ...[...fonteServicos.matchAll(/functions\/v1\/([a-z0-9-]+)/g)].map(
    (correspondenciaItem) => correspondenciaItem[1],
  ),
  ...[
    ...fonteDadosProgramaEmpresa.matchAll(
      /(?:edgeFunction|funcaoEdge|chamarFuncaoDoServidor)\(\s*['"]([a-z0-9-]+)['"]/g,
    ),
  ].map((correspondenciaItem) => correspondenciaItem[1]),
];
const unicoFnReferencias = [...new Set(fnReferencias)];
const naoDeclarado = unicoFnReferencias.filter(
  (quantidadeItem) => !configuracao.includes(`[functions.${quantidadeItem}]`),
);
if (naoDeclarado.length) {
  invalido('funcoes_chamadas_declaradas', `chamadas não declaradas: ${naoDeclarado.join(', ')}`);
} else {
  sucesso('funcoes_chamadas_declaradas', `${unicoFnReferencias.join(', ') || 'nenhuma'}`);
}

for (const funcao of unicoFnReferencias) {
  const marcador = `[functions.${funcao}]`;
  const inicio = configuracao.indexOf(marcador);
  if (inicio < 0) continue;
  const secao = configuracao.slice(inicio).split(/\n(?=\[)/)[0];
  if (/verify_jwt\s*=\s*true/.test(secao)) sucesso(`verify_jwt:${funcao}`, 'verify_jwt = true');
  else invalido(`verify_jwt:${funcao}`, 'verify_jwt precisa estar true');
}

for (const registro of verificacoes)
  console.log(`  ${registro.ok ? 'OK  ' : 'FAIL'}  ${registro.id}  — ${registro.detail}`);
console.log('');
if (problemas.length) {
  console.error(`test:config  FAIL — ${problemas.length} inconsistência(s)`);
  process.exit(1);
}
console.log(`test:config  PASS — ${verificacoes.length}/${verificacoes.length}`);
