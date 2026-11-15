import teste from 'node:test';
import verificar from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { criarProcessador } from '../sistema/processar-imagem.cjs';

const imagem = {
  jpegBase64: Buffer.from([255, 216, 255, 217]).toString('base64'),
  roi: [0, 0, 1, 1],
};
function preparar() {
  const processo = new EventEmitter();
  processo.stdout = new EventEmitter();
  processo.stderr = new EventEmitter();
  processo.kill = () => {
    processo.encerrado = true;
  };
  processo.stdin = {
    write: (linha, funcao) => {
      processo.linha = linha;
      funcao?.();
    },
  };
  const chamadas = [];
  const leitor = criarProcessador({
    pastaRecursos: 'C:/app/resources',
    existe: () => true,
    executar: (...argumentos) => {
      chamadas.push(argumentos);
      return processo;
    },
  });
  return { processo, chamadas, leitor };
}
teste('Processador usa binário fixo, sem shell, e retorna apenas resultado validado', async () => {
  const { processo, chamadas, leitor } = preparar();
  const resposta = leitor.analisar(imagem);
  verificar.ok(chamadas[0][0].endsWith('leitor-placas.exe'));
  verificar.deepEqual(chamadas[0][1], []);
  verificar.equal(chamadas[0][2].shell, false);
  processo.stdout.emit(
    'data',
    Buffer.from('{"plate":"ABC1D23","confidence":0.99,"ambiguous":false}\n'),
  );
  verificar.equal((await resposta).plate, 'ABC1D23');
  leitor.encerrar();
});
teste('Processador rejeita imagem, área inválida e chamada concorrente', async () => {
  const { leitor, processo } = preparar();
  await verificar.rejects(leitor.analisar({ jpegBase64: 'comando.exe' }));
  await verificar.rejects(leitor.analisar({ ...imagem, roi: [0, 0, -1, 1] }));
  const pendente = leitor.analisar(imagem);
  await verificar.rejects(leitor.analisar(imagem));
  leitor.encerrar();
  await verificar.rejects(pendente);
  verificar.equal(processo.encerrado, true);
});
teste('Resposta inválida do executável não vira leitura de placa', async () => {
  const { leitor, processo } = preparar();
  const pendente = leitor.analisar(imagem);
  processo.stdout.emit('data', Buffer.from('{"plate":"OUTRO","confidence":2,"ambiguous":false}\n'));
  await verificar.rejects(pendente);
  leitor.encerrar();
});
