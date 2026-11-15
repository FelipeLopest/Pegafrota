const cache = new Map();
export const FUSOS_HORARIOS = [
  ['America/Sao_Paulo', 'Brasília / São Paulo'],
  ['America/Manaus', 'Manaus / Amazonas'],
  ['America/Cuiaba', 'Cuiabá / Mato Grosso'],
  ['America/Campo_Grande', 'Campo Grande / Mato Grosso do Sul'],
  ['America/Porto_Velho', 'Porto Velho / Rondônia'],
  ['America/Boa_Vista', 'Boa Vista / Roraima'],
  ['America/Rio_Branco', 'Rio Branco / Acre'],
  ['America/Noronha', 'Fernando de Noronha'],
  ['America/Belem', 'Belém / Pará'],
  ['America/Fortaleza', 'Fortaleza / Ceará'],
  ['America/Recife', 'Recife / Pernambuco'],
  ['America/Bahia', 'Salvador / Bahia'],
  ['America/Araguaina', 'Palmas / Tocantins'],
  ['America/Santarem', 'Santarém / Pará'],
  ['America/Maceio', 'Maceió / Alagoas'],
  ['America/Eirunepe', 'Eirunepé / Amazonas'],
];
export async function consultarCep(valor, transportar = fetch) {
  const cep = String(valor || '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(cep)) throw new Error('Informe um CEP com oito números.');
  const anterior = cache.get(cep);
  if (anterior && anterior.expira > Date.now()) return anterior.dados;
  let resposta;
  try {
    resposta = await transportar('https://viacep.com.br/ws/' + cep + '/json/', {
      signal: AbortSignal.timeout(8000),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new Error(
      'Não foi possível consultar o CEP. Você pode preencher o endereço manualmente.',
    );
  }
  if (!resposta.ok)
    throw new Error('Consulta de CEP indisponível. Preencha o endereço manualmente.');
  const dados = await resposta.json();
  if (dados.erro || !dados.localidade || !/^[A-Z]{2}$/.test(dados.uf || ''))
    throw new Error('CEP não encontrado. Confira os números ou preencha manualmente.');
  const endereco = {
    addressStreet: String(dados.logradouro || '').slice(0, 250),
    addressDistrict: String(dados.bairro || '').slice(0, 150),
    addressCity: String(dados.localidade).slice(0, 150),
    addressState: dados.uf,
  };
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(cep, { dados: endereco, expira: Date.now() + 3600000 });
  return endereco;
}

export function criarAssistenteCep({ estado, localizar, avisar }) {
  const editados = new Set();
  let geracao = 0;
  return {
    editar(nome) {
      editados.add(nome);
    },
    async consultar() {
      const atual = ++geracao;
      const cepInicial = String(estado.addressPostalCode || '').replace(/\D/g, '');
      avisar('Consultando endereço…');
      try {
        const dados = await consultarCep(cepInicial);
        if (
          atual !== geracao ||
          cepInicial !== String(estado.addressPostalCode || '').replace(/\D/g, '')
        )
          return;
        let quantidade = 0;
        for (const [nome, valor] of Object.entries(dados)) {
          if (!valor || editados.has(nome) || String(estado[nome] || '').trim()) continue;
          estado[nome] = valor;
          const entrada = localizar(nome);
          if (entrada) entrada.value = valor;
          quantidade++;
        }
        avisar(
          quantidade
            ? 'Endereço sugerido. Confira e informe o número.'
            : 'CEP encontrado. Seus campos preenchidos foram preservados.',
        );
      } catch (erro) {
        if (atual === geracao) avisar(erro.message);
      }
    },
    encerrar() {
      geracao++;
    },
  };
}
