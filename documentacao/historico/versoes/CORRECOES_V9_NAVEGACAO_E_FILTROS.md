> **HISTÓRICO:** este documento registra uma versão/rodada anterior. Para o estado atual, use `docs/ia/` e confirme no código/migrations.

# PegaNaFrota v9 — Navegação, filtros e busca

Esta versão melhora a navegação e a localização de dados sem alterar as regras de negócio do banco.

## Atalhos globais

- `Ctrl+K` (ou `Cmd+K`): abre a busca global de telas no Electron e no painel administrativo.
- `/`: quando o foco não está em um campo de texto, leva o cursor diretamente para a busca da lista aberta.

## Navegação mais limpa

- Os grupos do menu lateral do Electron agora podem ser recolhidos e expandidos.
- A preferência de grupos abertos/fechados é mantida localmente.
- A seção da rota atual abre automaticamente.
- A busca global permite navegar sem percorrer manualmente todos os menus.
- Informações secundárias, como movimentações recentes do Pátio, ficam recolhidas até o usuário pedir para vê-las.

## Listas e filtros do Electron

As telas principais ganharam busca textual, filtros avançados recolhíveis, indicação de filtros ativos, limpeza rápida, contagem de resultados e paginação local.

### Pátio

- Buscar por placa, marca ou modelo.
- Filtrar por: no pátio, fora do pátio ou sem histórico.
- Movimentações recentes ficam em seção recolhível.

### Veículos

- Arquivados ficam ocultos por padrão, mas podem ser exibidos pelo filtro.
- Buscar por placa, marca, modelo, cor e categoria.
- Filtrar por situação de cadastro, status operacional, combustível e marca.

### Motoristas

- Arquivados ficam ocultos por padrão.
- Buscar por nome, documento, telefone e categoria da CNH.
- Filtrar por situação, vencimento da CNH e categoria.

### Viagens

- Buscar por origem, destino, placa e motorista.
- Filtrar por status, período, veículo e motorista.

### Abastecimentos

- Buscar por placa, posto e combustível.
- Filtrar por período, combustível e veículo.

### Manutenções

- Buscar por descrição, fornecedor, nota e placa.
- Filtrar por status, tipo, período e veículo.

### Locais

- Arquivados ficam ocultos por padrão.
- Buscar por nome, cidade, UF e observações.
- Filtrar por situação e UF.

### Histórico de movimentações

- Buscar por placa, local e observações.
- Filtrar por entrada/saída, período, local e veículo.

### Equipe

- Buscar por nome e e-mail.
- Filtrar por cargo e situação de acesso.

### Histórico de alterações

- Busca textual.
- Filtros avançados por ação, área/entidade, resultado e intervalo de datas.

## Painel administrativo

Também foram adicionadas busca e filtros recolhíveis às áreas com maior volume:

- Empresas: busca, status e UF.
- Administradores das empresas: busca, acesso à empresa e situação global da conta.
- Provisionamentos: busca e status.
- Auditoria global: busca, ação, resultado e período.

## Comportamento dos filtros

- Filtros avançados começam recolhidos para reduzir poluição visual.
- O sistema informa quantos filtros estão ativos.
- O botão **Limpar** restaura rapidamente a visão padrão.
- Nas principais listas do Electron, as escolhas de filtro ficam preservadas durante a sessão.
- Registros arquivados não desaparecem do sistema: ficam apenas ocultos por padrão onde isso melhora a navegação.

## Implantação

Esta v9 é uma alteração de interface/navegação. Não adiciona migration e não altera Edge Functions.

Em uma instalação já atualizada para a v8:

1. Copie o `.env` da instalação anterior para a nova pasta.
2. Execute `npm ci` no seu computador.
3. Execute `npm run build:admin` e `npm run build:desktop`.
4. Abra o painel com `npm run preview:admin` e o Electron com `npm run desktop`.

Não é necessário executar `db push` nem redeployar as Edge Functions somente por causa desta atualização.
