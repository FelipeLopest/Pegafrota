import {
  el as criarElemento,
  botao,
  cabecalhoPagina,
  cartao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { PERMISSAO } from '@peganafrota/contracts';
import { tela, faixaResumo, detalhe } from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirEditorEmpresa } from '../formularios/formulario-empresa.mjs';

export function telaEmpresa({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Empresa');
  const recarregar = () => telaEmpresa({ outlet: conteudoTela, setTitle: definirTitulo });
  return tela(
    conteudoTela,
    PERMISSAO.COMPANY_READ,
    () => dados.company.get(),
    (registro) =>
      criarElemento('div', {}, [
        cabecalhoPagina({
          title: 'Empresa',
          subtitle:
            'Dados operacionais da sua organização. CNPJ e situação da conta são administrados pela plataforma.',
          actions: [
            botao({
              label: 'Editar dados',
              icon: 'edit',
              permission: PERMISSAO.COMPANY_UPDATE,
              onClick: () => abrirEditorEmpresa(registro, recarregar),
            }),
          ],
        }),
        faixaResumo([
          { label: 'Nome fantasia', value: registro.tradeName || '—', icon: 'building' },
          {
            label: 'Cidade / UF',
            value: [registro.addressCity, registro.addressState].filter(Boolean).join(' / ') || '—',
            icon: 'pin',
          },
          { label: 'Fuso horário', value: registro.timezone || '—', icon: 'clock' },
        ]),
        cartao({
          title: 'Identificação',
          children: [
            criarElemento('div', { class: 'detail-grid' }, [
              detalhe('Razão social', registro.legalName),
              detalhe('Nome fantasia', registro.tradeName),
              detalhe('CNPJ', registro.cnpj),
              detalhe('E-mail', registro.email),
              detalhe('Telefone', registro.phone),
              detalhe('Fuso horário', registro.timezone),
            ]),
          ],
        }),
        cartao({
          title: 'Endereço',
          children: [
            criarElemento('div', { class: 'detail-grid' }, [
              detalhe('Logradouro', registro.addressStreet),
              detalhe('Número', registro.addressNumber),
              detalhe('Bairro', registro.addressDistrict),
              detalhe('Cidade', registro.addressCity),
              detalhe('UF', registro.addressState),
              detalhe('CEP', registro.addressPostalCode),
            ]),
          ],
        }),
      ]),
  );
}
