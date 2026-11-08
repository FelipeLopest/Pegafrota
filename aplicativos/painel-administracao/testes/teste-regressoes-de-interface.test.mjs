import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';
import {
  readFileSync as lerArquivoSincrono,
  existsSync as arquivoExiste,
} from '../../../ferramentas/apoio/ler-codigo-para-testes.mjs';

const telas = lerArquivoSincrono(new URL('../telas/exportar-telas.mjs', import.meta.url), 'utf8');
const roteador = lerArquivoSincrono(new URL('../navegacao/trocar-tela.mjs', import.meta.url), 'utf8');
const estilosCss = lerArquivoSincrono(new URL('../estilos/estilo-principal.css', import.meta.url), 'utf8');

testar('listagens críticas mantêm filtros e busca global', () => {
  verificarCondicao.match(telas, /function barraFiltros/);
  for (const trecho of [
    'Estado da conta',
    'Acesso à empresa',
    'Buscar nesta página por empresa, ID ou erro',
    'Ação contém',
  ])
    verificarCondicao.match(telas, new RegExp(trecho));
  verificarCondicao.match(roteador, /abrirBuscaNavegacao/);
  verificarCondicao.match(roteador, /Ctrl K/);
  verificarCondicao.match(roteador, /data-list-search/);
});

testar('sidebar continua compactável e persistida', () => {
  verificarCondicao.match(roteador, /pnf\.admin\.sidebar-collapsed/);
  verificarCondicao.match(roteador, /evento2\.key\.toLowerCase\(\) === 'b'/);
  verificarCondicao.match(estilosCss, /admin-shell\[data-sidebar=['"]collapsed['"]\]/);
});

testar('overview usa gráficos variados sem donut e resumo compacto', () => {
  for (const trecho of ['segmentoCicloVida(', 'colunasAdministrador(', 'barrasAdministrador('])
    verificarCondicao.match(telas, new RegExp(trecho.replace('(', '\\(')));
  verificarCondicao.doesNotMatch(telas, /adminDonut\(/);
  for (const rotulo of ['Empresas', 'Ativas', 'Suspensas', 'Convites', 'Falhas'])
    verificarCondicao.match(telas, new RegExp(rotulo));
});

testar('UI administrativa mantém page head, summary rail e contraste', () => {
  verificarCondicao.match(telas, /ADMIN_PAGE_META/);
  verificarCondicao.match(telas, /resumoAdministrador/);
  verificarCondicao.match(estilosCss, /summary-rail/);
  verificarCondicao.match(estilosCss, /\.btn-secondary \{/);
  verificarCondicao.match(estilosCss, /var\(--tema-destaque-sob-ponteiro\)/);
});

testar('Admin Web não deixa imports nomeados quebrados chegarem ao navegador', () => {
  const compilacao = lerArquivoSincrono(new URL('../compilar-aplicativo.mjs', import.meta.url), 'utf8');
  verificarCondicao.match(compilacao, /validarImportsLocais/);
  verificarCondicao.match(compilacao, /não é exportado por/);
});

testar('fluxo TOTP antigo não faz parte do Admin Web', () => {
  const principal = lerArquivoSincrono(new URL('../iniciar-aplicativo.mjs', import.meta.url), 'utf8');
  verificarCondicao.doesNotMatch(principal, /mfa\.mjs|TOTP|aal2|MFA_NOT_ENROLLED/);
  verificarCondicao.equal(
    arquivoExiste(new URL('../telas/tela-mfa.mjs', import.meta.url)),
    false,
    'a tela MFA obsoleta não deve existir',
  );
});
