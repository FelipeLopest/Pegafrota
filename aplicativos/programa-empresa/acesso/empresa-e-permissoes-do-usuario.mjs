import { ROTULO_PERMISSAO } from '@peganafrota/contracts';
import { rpc as executarFuncaoBanco } from '../comunicacao/enviar-requisicao.mjs';

export class ContextoUsuario {
  #dados = null;
  #ouvintes = new Set();

  get data() {
    return this.#dados;
  }
  get isLoaded() {
    return this.#dados !== null;
  }

  get hasActiveMembership() {
    if (!this.#dados) return false;
    if (this.#dados.error === 'AUTH_NO_ACTIVE_MEMBERSHIP') return false;
    const estado = String(this.#dados.sessionState ?? '').toUpperCase();
    if (estado && estado !== 'ACTIVE') return false;
    return Boolean(this.#dados.companyId ?? this.#dados.company?.id);
  }

  get companyId() {
    return this.#dados?.companyId ?? this.#dados?.company?.id ?? null;
  }
  get companyName() {
    return this.#dados?.company?.tradeName ?? this.#dados?.company?.legalName ?? null;
  }
  get companyStatus() {
    return this.#dados?.company?.status ?? null;
  }
  get userId() {
    return this.#dados?.userId ?? null;
  }
  get fullName() {
    return this.#dados?.profile?.fullName ?? null;
  }
  get role() {
    return this.#dados?.role ?? null;
  }
  get permissions() {
    return this.#dados?.permissions ?? [];
  }

  async load() {
    this.#dados = await executarFuncaoBanco('my_context');
    this.#emitir();
    return this.#dados;
  }

  clear() {
    this.#dados = null;
    this.#emitir();
  }

  subscribe(funcao) {
    this.#ouvintes.add(funcao);
    return () => this.#ouvintes.delete(funcao);
  }

  #emitir() {
    for (const funcao of this.#ouvintes) funcao(this.#dados);
  }

  can(permissao) {
    return this.permissions.includes(permissao);
  }

  canAny(...permissoes) {
    return permissoes.some((parametroItem) => this.can(parametroItem));
  }

  canAll(...permissoes) {
    return permissoes.every((parametroItem) => this.can(parametroItem));
  }
}

export const contexto = new ContextoUsuario();

export function aplicarPermissao(no, permissao, { hideWhenDenied: ocultarQuandoNegado = false } = {}) {
  const permitido = contexto.can(permissao);

  if (permitido) {
    no.disabled = false;
    no.removeAttribute('aria-disabled');
    no.removeAttribute('data-permission-denied');
    no.hidden = false;
    return no;
  }

  if (ocultarQuandoNegado) {
    no.hidden = true;
    return no;
  }

  no.disabled = true;
  no.setAttribute('aria-disabled', 'true');
  no.setAttribute('data-permission-denied', permissao);
  no.title = `Você não tem permissão para: ${ROTULO_PERMISSAO[permissao] || permissao}`;
  return no;
}

export function protegerRota(obrigatorioPermission) {
  if (!contexto.isLoaded) return { allowed: false, reason: 'loading' };
  if (!contexto.hasActiveMembership) return { allowed: false, reason: 'no_membership' };
  if (!obrigatorioPermission) return { allowed: true };
  if (contexto.can(obrigatorioPermission)) return { allowed: true };
  return {
    allowed: false,
    reason: 'permission',
    permission: obrigatorioPermission,
    label: ROTULO_PERMISSAO[obrigatorioPermission] || obrigatorioPermission,
  };
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { ContextoUsuario as Context };
