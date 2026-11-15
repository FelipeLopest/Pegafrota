import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-painel.mjs';
import { contaUsuario } from '../acesso/conta-do-usuario.mjs';
import { PAGINA_RECUPERACAO } from '../acesso/gerenciar-conta.mjs';

export function abrirTrocaSenha() {
  let janela,
    ocupado = false;
  const atual = criarElemento('input', {
    class: 'input',
    type: 'password',
    autocomplete: 'current-password',
    maxlength: '72',
  });
  const nova = criarElemento('input', {
    class: 'input',
    type: 'password',
    autocomplete: 'new-password',
    maxlength: '72',
  });
  const confirmar = criarElemento('input', {
    class: 'input',
    type: 'password',
    autocomplete: 'new-password',
    maxlength: '72',
  });
  const mensagem = criarElemento('p', { class: 'field-error', role: 'alert' });
  const salvar = botao({
    label: 'Alterar minha senha',
    variant: 'primary',
    onClick: async () => {
      if (ocupado) return;
      ocupado = true;
      salvar.disabled = true;
      mensagem.textContent = '';
      try {
        await contaUsuario.trocar(atual.value, nova.value, confirmar.value);
        atual.value = nova.value = confirmar.value = '';
        janela.close();
        notificacao('Sua senha foi alterada.', { tone: 'success' });
      } catch (erro) {
        mensagem.textContent = erro.message;
      } finally {
        ocupado = false;
        salvar.disabled = false;
      }
    },
  });
  janela = modal({
    title: 'Alterar minha senha',
    body: criarElemento('div', {}, [
      criarElemento('p', {
        class: 'muted',
        text: 'A senha pertence à sua conta e vale em todos os seus acessos. Use ao menos 12 caracteres.',
      }),
      campo({
        id: 'senha-atual',
        label: 'Senha atual',
        required: true,
        control: atual,
      }),
      campo({
        id: 'senha-nova',
        label: 'Nova senha',
        required: true,
        control: nova,
      }),
      campo({
        id: 'senha-confirmar',
        label: 'Confirmar nova senha',
        required: true,
        control: confirmar,
      }),
      mensagem,
    ]),
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({
        label: 'Cancelar',
        onClick: () => {
          atual.value = nova.value = confirmar.value = '';
          janela.close();
        },
      }),
      salvar,
    ]),
  });
}

let ultimoEnvio = 0;
export function abrirRecuperacaoSenha(emailInicial = '') {
  let janela,
    ocupado = false;
  const entrada = criarElemento('input', {
    class: 'input',
    type: 'email',
    autocomplete: 'email',
    value: emailInicial,
  });
  const mensagem = criarElemento('p', { role: 'status', class: 'muted' });
  const enviar = botao({
    label: 'Enviar link de recuperação',
    variant: 'primary',
    onClick: async () => {
      if (ocupado) return;
      if (Date.now() - ultimoEnvio < 60000) {
        mensagem.textContent = 'Aguarde um minuto antes de pedir outro link.';
        return;
      }
      ocupado = true;
      enviar.disabled = true;
      try {
        const destino =
          location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname)
            ? location.origin + location.pathname + '?flow=recover'
            : PAGINA_RECUPERACAO;
        mensagem.textContent = await contaUsuario.recuperar(entrada.value, destino);
        ultimoEnvio = Date.now();
      } catch (erro) {
        mensagem.textContent = erro.message;
      } finally {
        ocupado = false;
        enviar.disabled = false;
      }
    },
  });
  janela = modal({
    title: 'Recuperar minha senha',
    body: criarElemento('div', {}, [
      criarElemento('p', {
        class: 'muted',
        text: 'Informe o e-mail da sua conta. O link abre uma página segura para definir outra senha. Depois, volte ao aplicativo e entre com a nova senha.',
      }),
      campo({
        id: 'recuperar-email',
        label: 'E-mail da conta',
        required: true,
        control: entrada,
      }),
      mensagem,
    ]),
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Fechar', onClick: () => janela.close() }),
      enviar,
    ]),
  });
}
