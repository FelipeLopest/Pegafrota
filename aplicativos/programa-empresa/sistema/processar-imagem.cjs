'use strict';
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const caminho = require('node:path');

// Executável fixo empacotado. A interface não escolhe comando, arquivo ou argumentos.
function criarProcessador({ pastaRecursos, executar = spawn, existe = existsSync }) {
  let filho = null;
  let pendente = null;
  let acumulado = '';
  function encerrar() {
    const atual = filho;
    filho = null;
    atual?.kill();
    if (pendente) {
      clearTimeout(pendente.temporizador);
      pendente.rejeitar(new Error('Leitor de placas interrompido.'));
      pendente = null;
    }
    acumulado = '';
  }
  function iniciar() {
    if (filho) return;
    const executavel = caminho.join(pastaRecursos, 'leitor-placas', 'leitor-placas.exe');
    if (!existe(executavel))
      throw new Error(
        'Leitor de placas não incluído neste instalador. Gere a versão com suporte a câmera.',
      );
    const processo = executar(executavel, [], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    filho = processo;
    // Drenar stderr sem copiar textos/imagens da câmera para logs persistentes.
    processo.stderr.on('data', () => {});
    processo.on('error', () => {
      if (filho === processo) encerrar();
    });
    processo.on('exit', () => {
      if (filho === processo) encerrar();
    });
    processo.stdout.on('data', (dados) => {
      if (filho !== processo) return;
      acumulado += dados.toString('utf8');
      if (acumulado.length > 32768) {
        encerrar();
        return;
      }
      const fim = acumulado.indexOf('\n');
      if (fim < 0) return;
      const linha = acumulado.slice(0, fim);
      acumulado = acumulado.slice(fim + 1);
      const pedido = pendente;
      pendente = null;
      if (!pedido) return;
      clearTimeout(pedido.temporizador);
      try {
        const resposta = JSON.parse(linha);
        if (resposta.error) throw new Error(String(resposta.error));
        if (
          (resposta.plate !== null && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(resposta.plate)) ||
          !Number.isFinite(resposta.confidence) ||
          resposta.confidence < 0 ||
          resposta.confidence > 1 ||
          typeof resposta.ambiguous !== 'boolean'
        )
          throw new Error('Retorno inválido do leitor.');
        pedido.resolver(resposta);
      } catch (erro) {
        pedido.rejeitar(erro);
      }
    });
  }
  return {
    disponivel: () => existe(caminho.join(pastaRecursos, 'leitor-placas', 'leitor-placas.exe')),
    encerrar,
    async analisar(pedido) {
      if (
        !pedido ||
        typeof pedido.jpegBase64 !== 'string' ||
        pedido.jpegBase64.length > 409600 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(pedido.jpegBase64)
      )
        throw new Error('Imagem inválida.');
      const imagem = Buffer.from(pedido.jpegBase64, 'base64');
      if (imagem.length < 4 || imagem.length > 307200 || imagem[0] !== 255 || imagem[1] !== 216)
        throw new Error('JPEG inválido.');
      const roi = pedido.roi || [0, 0, 1, 1];
      if (
        !Array.isArray(roi) ||
        roi.length !== 4 ||
        roi.some((v) => !Number.isFinite(v) || v < 0 || v > 1) ||
        roi[2] - roi[0] < 0.1 ||
        roi[3] - roi[1] < 0.1
      )
        throw new Error('Área da imagem inválida.');
      if (pendente) throw new Error('Já existe uma imagem em processamento.');
      iniciar();
      return new Promise((resolver, rejeitar) => {
        pendente = { resolver, rejeitar, temporizador: setTimeout(encerrar, 60000) };
        filho.stdin.write(JSON.stringify({ jpegBase64: pedido.jpegBase64, roi }) + '\n', (erro) => {
          if (erro) encerrar();
        });
      });
    },
  };
}
module.exports = { criarProcessador };
