import { dadosCameras, baixarImagemCamera } from '../dados/dados-cameras.mjs';
import { contexto } from '../acesso/empresa-e-permissoes-do-usuario.mjs';
import { sessao } from '../acesso/sessao-do-usuario.mjs';

let temporizador = null;
let geracao = 0;
let ocupado = false;
let executando = false;
let mensagem = 'Monitoramento desligado.';
const ouvintes = new Set();
function emitir() {
  for (const ouvinte of ouvintes) ouvinte({ executando, ocupado, mensagem });
}
const chave = () => `pnf.camera.monitor.${contexto.companyId}`;

export const monitorCameras = {
  estado: () => ({ executando, ocupado, mensagem }),
  acompanhar(funcao) {
    ouvintes.add(funcao);
    funcao(this.estado());
    return () => ouvintes.delete(funcao);
  },
  async parar({ lembrar = true } = {}) {
    geracao++;
    executando = false;
    ocupado = false;
    clearTimeout(temporizador);
    temporizador = null;
    if (lembrar && contexto.companyId) localStorage.setItem(chave(), '0');
    await window.pnf?.leitorPlacas?.parar().catch(() => {});
    mensagem = 'Monitoramento desligado.';
    emitir();
  },
  async iniciar() {
    if (executando) return;
    if (!sessao.accessToken || !contexto.can('ocr.operate'))
      throw new Error('Sem permissão para operar o reconhecimento.');
    const disponivel = await window.pnf?.leitorPlacas?.disponivel();
    if (!disponivel)
      throw new Error(
        'Esta instalação não inclui o leitor de placas. Gere o instalador atualizado pelo GitHub Actions.',
      );
    executando = true;
    localStorage.setItem(chave(), '1');
    const atual = ++geracao;
    const empresa = contexto.companyId;
    const usuario = contexto.userId;
    const valida = () =>
      executando &&
      atual === geracao &&
      empresa === contexto.companyId &&
      usuario === contexto.userId &&
      Boolean(sessao.accessToken);
    async function processar() {
      if (!valida()) return;
      let captura;
      try {
        ocupado = true;
        mensagem = 'Verificando capturas…';
        emitir();
        captura = await dadosCameras.reservar();
        if (!valida()) return;
        if (captura) {
          const imagem = await baixarImagemCamera(captura.path);
          if (!valida()) return;
          const bytes = new Uint8Array(await imagem.arrayBuffer());
          let binario = '';
          for (let inicio = 0; inicio < bytes.length; inicio += 8192)
            binario += String.fromCharCode(...bytes.subarray(inicio, inicio + 8192));
          const leitura = await window.pnf.leitorPlacas.analisar({
            jpegBase64: btoa(binario),
            roi: captura.roi,
          });
          if (!valida()) return;
          const resultado = await dadosCameras.concluir({
            p_capture_id: captura.id,
            p_claim_id: captura.claimId,
            p_plate: leitura.plate,
            p_confidence: leitura.confidence,
            p_ambiguous: leitura.ambiguous,
          });
          mensagem = leitura.plate
            ? `Última leitura: ${leitura.plate} · ${resultado.status || 'processada'}`
            : 'Captura processada; nenhuma placa válida.';
          window.dispatchEvent(new CustomEvent('pnf:captura-processada'));
        } else mensagem = 'Monitoramento ativo. Aguardando capturas.';
      } catch (erro) {
        if (!valida()) return;
        mensagem = erro.message || 'Falha no reconhecimento. Tentaremos novamente.';
        if (captura) {
          await dadosCameras
            .concluir({
              p_capture_id: captura.id,
              p_claim_id: captura.claimId,
              p_error: mensagem.slice(0, 240),
            })
            .catch(() => {});
        }
      } finally {
        if (valida()) {
          ocupado = false;
          emitir();
          temporizador = setTimeout(processar, captura ? 300 : 3000);
        }
      }
    }
    processar();
  },
  async restaurar() {
    if (contexto.companyId && localStorage.getItem(chave()) === '1' && contexto.can('ocr.operate'))
      await this.iniciar();
  },
};
