"""Reconhecimento local, sem servidor HTTP e sem acesso a arquivos solicitado pelo cliente.

Protocolo: uma linha JSON de entrada e uma de saída. Imagens ficam somente em memória.
Os modelos do RapidOCR são empacotados com o executável; não há download em produção.
"""
import base64
import contextlib
import io
import json
import math
import re
import sys

LIMITE_IMAGEM = 307200
PADRAO_PLACA = re.compile(r"^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$")


def extrair_placas(resultados):
    """Agrupa caracteres na mesma linha, sem adivinhar trocas de O/0 ou I/1."""
    grupos = []
    candidatos = {}
    for caixa, texto, confianca in resultados or []:
        if not math.isfinite(float(confianca)) or not 0 <= float(confianca) <= 1:
            continue
        letras = re.sub(r"[\s-]", "", str(texto).upper())
        if not re.fullmatch(r"[A-Z0-9]{1,20}", letras):
            continue
        xs = [float(ponto[0]) for ponto in caixa]
        ys = [float(ponto[1]) for ponto in caixa]
        if not all(math.isfinite(valor) for valor in xs + ys):
            continue
        altura = max(ys) - min(ys)
        if altura <= 0:
            continue
        item = (min(xs), max(xs), sum(ys) / len(ys), altura, letras, float(confianca))
        grupo = next((linha for linha in grupos if abs(linha[0][2] - item[2]) < min(linha[0][3], altura) * 0.6), None)
        if grupo is None:
            grupos.append([item])
        else:
            grupo.append(item)
    for linha in grupos:
        linha.sort(key=lambda item: item[0])
        for inicio, primeiro in enumerate(linha):
            texto = ""
            confianca = 1.0
            anterior = primeiro
            for item in linha[inicio:inicio + 8]:
                if item[0] - anterior[1] > max(item[3], anterior[3]) * 2:
                    break
                texto += item[4]
                confianca = min(confianca, item[5])
                if len(texto) > 7:
                    break
                if PADRAO_PLACA.fullmatch(texto):
                    candidatos[texto] = max(candidatos.get(texto, 0), confianca)
                anterior = item
    return sorted(candidatos.items(), key=lambda item: item[1], reverse=True)


def validar_imagem(pedido):
    dados = pedido.get("jpegBase64")
    if not isinstance(dados, str) or len(dados) > 409600:
        raise ValueError("Imagem excede o limite permitido.")
    imagem = base64.b64decode(dados, validate=True)
    if not 4 <= len(imagem) <= LIMITE_IMAGEM or not imagem.startswith(b"\xff\xd8") or not imagem.endswith(b"\xff\xd9"):
        raise ValueError("JPEG inválido.")
    roi = pedido.get("roi", [0, 0, 1, 1])
    if not isinstance(roi, list) or len(roi) != 4 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1 for v in roi):
        raise ValueError("Área de reconhecimento inválida.")
    if roi[2] - roi[0] < 0.1 or roi[3] - roi[1] < 0.1:
        raise ValueError("Área de reconhecimento pequena ou invertida.")
    return imagem, roi


class Reconhecedor:
    def __init__(self):
        from rapidocr_onnxruntime import RapidOCR
        self.motor = RapidOCR()

    def analisar(self, pedido):
        from PIL import Image
        import numpy as np
        imagem, roi = validar_imagem(pedido)
        with Image.open(io.BytesIO(imagem)) as fotografia:
            if fotografia.format != "JPEG" or fotografia.width * fotografia.height > 2000000:
                raise ValueError("Dimensão da imagem não permitida.")
            largura, altura = fotografia.size
            recorte = fotografia.crop((int(roi[0] * largura), int(roi[1] * altura), int(roi[2] * largura), int(roi[3] * altura))).convert("RGB")
            matriz = np.array(recorte)[:, :, ::-1].copy()
        resultados, _tempos = self.motor(matriz)
        placas = extrair_placas(resultados)
        if not placas:
            return {"plate": None, "confidence": 0, "ambiguous": False}
        placa, confianca = placas[0]
        return {"plate": placa, "confidence": confianca, "ambiguous": len(placas) > 1,
                "alternatives": [p[0] for p in placas[:5]], "engineVersion": "rapidocr-onnx-1.4.4"}


def executar():
    # Bibliotecas podem registrar mensagens; stdout é reservado ao protocolo JSON.
    with contextlib.redirect_stdout(sys.stderr):
        motor = Reconhecedor()
    for linha in sys.stdin:
        if len(linha) > 411000:
            resposta = {"error": "Imagem excede o limite permitido."}
        else:
            try:
                with contextlib.redirect_stdout(sys.stderr):
                    resposta = motor.analisar(json.loads(linha))
            except Exception:
                resposta = {"error": "Não foi possível reconhecer esta captura."}
        print(json.dumps(resposta, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    executar()
