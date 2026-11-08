import { el as criarElemento } from './criar-elemento.mjs';

/**
 * Campo de formulário.
 *
 * `wrapper` permite envolver o controle (por exemplo, um input de senha com
 * botão de exibir) sem perder rótulo, dica e erro. Os atributos de
 * acessibilidade continuam no CONTROLE, não no invólucro — um leitor de tela
 * precisa encontrar `aria-describedby` no campo que recebe o foco.
 */
export function campo({
  id: identificador,
  label: rotulo,
  hint: dica,
  error: erro,
  required: obrigatorio,
  control: controle,
  wrapper: envoltorio,
}) {
  const descrito = [];
  if (dica) descrito.push(`${identificador}-hint`);
  if (erro) descrito.push(`${identificador}-error`);
  controle.id = identificador;
  if (descrito.length) controle.setAttribute('aria-describedby', descrito.join(' '));
  if (erro) controle.setAttribute('aria-invalid', 'true');
  else controle.removeAttribute('aria-invalid');
  if (obrigatorio) controle.setAttribute('aria-required', 'true');

  return criarElemento('div', { class: 'field', dataset: { invalid: erro ? 'true' : 'false' } }, [
    criarElemento('label', { class: 'field-label', for: identificador }, [
      rotulo,
      obrigatorio
        ? criarElemento('span', { class: 'field-required', 'aria-hidden': 'true', text: ' *' })
        : null,
    ]),
    envoltorio || controle,
    dica ? criarElemento('p', { class: 'field-hint', id: `${identificador}-hint`, text: dica }) : null,
    erro
      ? criarElemento('p', { class: 'field-error', id: `${identificador}-error`, role: 'alert', text: erro })
      : null,
  ]);
}
