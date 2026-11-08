import {
  el as criarElemento,
  campo,
  botao,
  modal,
  notificacao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

export function abrirConviteUsuario(aoConcluir) {
  const formulario = { email: '', fullName: '', phone: '', role: 'viewer', mode: 'invite', password: '' };
  let correspondenciaItem;
  const conteinerCorpo = criarElemento('div', {});
  const rodapeConteiner = criarElemento('div', { class: 'modal-actions' });

  const enviar = async () => {
    if (!formulario.email.trim() || !formulario.fullName.trim()) {
      notificacao('Informe nome e e-mail.', { tone: 'warning' });
      return;
    }
    if (formulario.mode === 'create' && formulario.password.length < 12) {
      notificacao('A senha temporária precisa ter pelo menos 12 caracteres.', { tone: 'warning' });
      return;
    }
    try {
      let resultado;
      if (formulario.mode === 'create') resultado = await dados.users.create(formulario);
      else resultado = await dados.users.invite(formulario);
      correspondenciaItem.close();
      if (formulario.mode === 'create') {
        notificacao('Acesso criado. A pessoa já pode entrar com a senha temporária.', {
          tone: 'success',
          duration: 7000,
        });
      } else if (resultado?.authUserExisted) {
        notificacao('Acesso vinculado. Esta pessoa já possuía uma conta e continua usando a senha atual.', {
          tone: 'success',
          duration: 8000,
        });
      } else if (resultado?.inviteSent) {
        notificacao(
          'Convite enviado. A pessoa define a senha pelo link e depois entra no PegaNaFrota Desktop.',
          { tone: 'success', duration: 9000 },
        );
      } else {
        notificacao('Acesso preparado.', { tone: 'success' });
      }
      aoConcluir();
    } catch (erro) {
      notificacao(erro.message, { tone: 'danger' });
    }
  };

  const renderizar = () => {
    conteinerCorpo.replaceChildren(
      campo({
        id: 'iu-name',
        label: 'Nome completo',
        required: true,
        control: criarElemento('input', {
          class: 'input',
          value: formulario.fullName,
          onInput: (evento) => {
            formulario.fullName = evento.target.value;
          },
        }),
      }),
      campo({
        id: 'iu-email',
        label: 'E-mail',
        required: true,
        control: criarElemento('input', {
          class: 'input',
          type: 'email',
          value: formulario.email,
          onInput: (evento) => {
            formulario.email = evento.target.value;
          },
        }),
      }),
      campo({
        id: 'iu-phone',
        label: 'Telefone',
        control: criarElemento('input', {
          class: 'input',
          value: formulario.phone,
          onInput: (evento) => {
            formulario.phone = evento.target.value.replace(/\D/g, '');
          },
        }),
      }),
      campo({
        id: 'iu-role',
        label: 'Cargo',
        required: true,
        hint: 'Administrador gerencia equipe e cadastro; gestor cuida da operação; operador registra; visualizador apenas consulta.',
        control: criarElemento(
          'select',
          {
            class: 'select',
            onChange: (evento) => {
              formulario.role = evento.target.value;
            },
          },
          [
            ['company_admin', 'Administrador'],
            ['fleet_manager', 'Gestor de frota'],
            ['operator', 'Operador'],
            ['viewer', 'Visualizador'],
          ].map(([valor, rotulo]) =>
            criarElemento('option', { value: valor, text: rotulo, selected: valor === formulario.role }),
          ),
        ),
      }),
      campo({
        id: 'iu-mode',
        label: 'Como liberar o primeiro acesso',
        required: true,
        control: criarElemento(
          'select',
          {
            class: 'select',
            onChange: (evento) => {
              formulario.mode = evento.target.value;
              renderizar();
            },
          },
          [
            criarElemento('option', {
              value: 'invite',
              text: 'Enviar convite por e-mail',
              selected: formulario.mode === 'invite',
            }),
            criarElemento('option', {
              value: 'create',
              text: 'Criar com senha temporária',
              selected: formulario.mode === 'create',
            }),
          ],
        ),
      }),
      formulario.mode === 'create'
        ? campo({
            id: 'iu-password',
            label: 'Senha temporária',
            required: true,
            hint: 'Mínimo de 12 caracteres. Entregue a senha por um canal seguro e peça a troca no primeiro contato.',
            control: criarElemento('input', {
              class: 'input',
              type: 'password',
              value: formulario.password,
              onInput: (evento) => {
                formulario.password = evento.target.value;
              },
            }),
          })
        : criarElemento('p', {
            class: 'muted',
            text: 'A pessoa receberá um link para definir a primeira senha. Depois, ela entra no PegaNaFrota Desktop; este painel web não é usado pela equipe da empresa.',
          }),
    );
    rodapeConteiner.replaceChildren(
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close() }),
      botao({
        label: formulario.mode === 'create' ? 'Criar acesso' : 'Enviar convite',
        variant: 'primary',
        onClick: enviar,
      }),
    );
  };

  correspondenciaItem = modal({
    title: 'Adicionar pessoa à equipe',
    body: conteinerCorpo,
    footer: rodapeConteiner,
  });
  renderizar();
}
