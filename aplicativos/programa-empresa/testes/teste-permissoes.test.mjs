import testar from 'node:test';
import verificarCondicao from 'node:assert/strict';

globalThis.localStorage = {
  _s: new Map(),
  getItem(chaveItem) {
    return this._s.get(chaveItem) ?? null;
  },
  setItem(chaveItem, veiculoItem) {
    this._s.set(chaveItem, String(veiculoItem));
  },
  removeItem(chaveItem) {
    this._s.delete(chaveItem);
  },
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.window = { pnf: { getConfig: async () => ({ supabaseUrl: 'https://x.test', anonKey: 'k' }) } };
globalThis.document = { documentElement: { setAttribute() {}, removeAttribute() {} } };

const {
  contexto: contexto,
  aplicarPermissao: aplicarPermissao,
  protegerRota: protegerRota,
} = await import('../acesso/sessao-e-permissoes.mjs');

function carregarContexto(dados) {
  Object.defineProperty(contexto, 'data', { value: dados, configurable: true });
  Object.defineProperty(contexto, 'permissions', {
    get: () => dados?.permissions ?? [],
    configurable: true,
  });
  Object.defineProperty(contexto, 'isLoaded', { value: dados !== null, configurable: true });
  Object.defineProperty(contexto, 'hasActiveMembership', {
    value: Boolean(dados) && dados.error !== 'AUTH_NO_ACTIVE_MEMBERSHIP',
    configurable: true,
  });
  Object.defineProperty(contexto, 'role', { value: dados?.role ?? null, configurable: true });
}

function noFalso() {
  const atributos = new Map();
  return {
    disabled: false,
    hidden: false,
    title: '',
    setAttribute(chaveItem, veiculoItem) {
      atributos.set(chaveItem, veiculoItem);
    },
    removeAttribute(chaveItem) {
      atributos.delete(chaveItem);
    },
    getAttribute(chaveItem) {
      return atributos.get(chaveItem) ?? null;
    },
  };
}

testar('can() responde por permissão atômica', () => {
  carregarContexto({
    userId: 'u1',
    companyId: 'c1',
    role: 'operator',
    permissions: ['trips.read', 'movements.write', 'vehicles.read'],
  });

  verificarCondicao.equal(contexto.can('movements.write'), true);
  verificarCondicao.equal(contexto.can('vehicles.write'), false);
});

testar('a decisão NÃO vem do nome do papel', () => {
  carregarContexto({
    userId: 'u1',
    companyId: 'c1',
    role: 'company_admin',
    permissions: ['company.read', 'dashboard.read'],
  });

  verificarCondicao.equal(contexto.role, 'company_admin');
  verificarCondicao.equal(contexto.can('reports.export'), false, 'papel não concede por si só');

  const botao = noFalso();
  aplicarPermissao(botao, 'reports.export');
  verificarCondicao.equal(botao.disabled, true);
});

testar('o inverso também: um viewer com permissão extra a recebe', () => {
  carregarContexto({
    userId: 'u2',
    companyId: 'c1',
    role: 'viewer',
    permissions: ['dashboard.read', 'reports.read', 'reports.export'],
  });

  verificarCondicao.equal(contexto.can('reports.export'), true);
  const botao = noFalso();
  aplicarPermissao(botao, 'reports.export');
  verificarCondicao.equal(botao.disabled, false);
});

testar('controle negado fica desabilitado e explicado, não escondido', () => {
  carregarContexto({ userId: 'u', companyId: 'c', role: 'viewer', permissions: ['vehicles.read'] });

  const botao = noFalso();
  aplicarPermissao(botao, 'vehicles.write');

  verificarCondicao.equal(botao.disabled, true, 'fica desabilitado');
  verificarCondicao.equal(botao.hidden, false, 'e continua visível');
  verificarCondicao.equal(botao.getAttribute('aria-disabled'), 'true');
  verificarCondicao.equal(botao.getAttribute('data-permission-denied'), 'vehicles.write');
  verificarCondicao.match(botao.title, /não tem permissão/i);
  verificarCondicao.match(botao.title, /Criar e editar veículos/);
});

testar('hideWhenDenied esconde apenas quando pedido explicitamente', () => {
  carregarContexto({ userId: 'u', companyId: 'c', role: 'viewer', permissions: [] });

  const botao = noFalso();
  aplicarPermissao(botao, 'audit.read', { hideWhenDenied: true });
  verificarCondicao.equal(botao.hidden, true);
});

testar('permissão concedida limpa o estado negado anterior', () => {
  carregarContexto({ userId: 'u', companyId: 'c', role: 'viewer', permissions: [] });
  const botao = noFalso();
  aplicarPermissao(botao, 'vehicles.write');
  verificarCondicao.equal(botao.disabled, true);

  carregarContexto({ userId: 'u', companyId: 'c', role: 'fleet_manager', permissions: ['vehicles.write'] });
  aplicarPermissao(botao, 'vehicles.write');

  verificarCondicao.equal(botao.disabled, false);
  verificarCondicao.equal(botao.getAttribute('data-permission-denied'), null);
  verificarCondicao.equal(botao.hidden, false);
});

testar('canAny e canAll', () => {
  carregarContexto({
    userId: 'u',
    companyId: 'c',
    role: 'operator',
    permissions: ['trips.read', 'trips.write'],
  });

  verificarCondicao.equal(contexto.canAny('trips.read', 'audit.read'), true);
  verificarCondicao.equal(contexto.canAny('audit.read', 'users.manage'), false);
  verificarCondicao.equal(contexto.canAll('trips.read', 'trips.write'), true);
  verificarCondicao.equal(contexto.canAll('trips.read', 'trips.cancel'), false);
});

testar('guardRoute nega sem vínculo ativo, com motivo próprio', () => {
  carregarContexto({ error: 'AUTH_NO_ACTIVE_MEMBERSHIP' });

  const grupo = protegerRota('dashboard.read');
  verificarCondicao.equal(grupo.allowed, false);
  verificarCondicao.equal(
    grupo.reason,
    'no_membership',
    'a tela precisa distinguir isto de falta de permissão',
  );
});

testar('guardRoute nega por permissão, informando qual falta', () => {
  carregarContexto({ userId: 'u', companyId: 'c', role: 'operator', permissions: ['trips.read'] });

  const grupo = protegerRota('audit.read');
  verificarCondicao.equal(grupo.allowed, false);
  verificarCondicao.equal(grupo.reason, 'permission');
  verificarCondicao.equal(grupo.permission, 'audit.read');
  verificarCondicao.equal(grupo.label, 'Ver auditoria');
});

testar('guardRoute distingue "carregando" de "negado"', () => {
  carregarContexto(null);
  const grupo = protegerRota('dashboard.read');
  verificarCondicao.equal(grupo.allowed, false);
  verificarCondicao.equal(grupo.reason, 'loading', 'mostrar "sem permissão" antes de carregar seria mentira');
});

testar('guardRoute permite rota sem permissão exigida quando há vínculo', () => {
  carregarContexto({ userId: 'u', companyId: 'c', role: 'viewer', permissions: [] });
  verificarCondicao.equal(protegerRota(null).allowed, true);
});

testar('settings.manage não existe no vocabulário de permissões', async () => {
  const { PERMISSAO: PERMISSAO, ROTULO_PERMISSAO: ROTULO_PERMISSAO } = await import('@peganafrota/contracts');
  verificarCondicao.equal(Object.values(PERMISSAO).includes('settings.manage'), false);
  verificarCondicao.equal('settings.manage' in ROTULO_PERMISSAO, false);
});
