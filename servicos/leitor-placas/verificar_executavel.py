"""Verifica o leitor congelado com uma imagem sintética, sem câmera ou rede."""
import base64
import io
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

pasta = Path(__file__).resolve().parent
executavel = pasta / "compilado" / "leitor-placas" / "leitor-placas.exe"
fotografia = Image.new("RGB", (640, 480), "gray")
desenho = ImageDraw.Draw(fotografia)
desenho.rectangle((100, 170, 540, 310), fill="white")
fonte = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 84)
desenho.text((120, 182), "ABC1D23", fill="black", font=fonte)
imagem = io.BytesIO()
fotografia.save(imagem, format="JPEG", quality=90)
pedido = {"jpegBase64": base64.b64encode(imagem.getvalue()).decode(), "roi": [0.12, 0.3, 0.9, 0.7]}
resultado = subprocess.run([str(executavel)], input=json.dumps(pedido) + "\n", text=True,
                           capture_output=True, timeout=90, check=True)
leitura = json.loads(resultado.stdout.strip())
assert leitura["plate"] == "ABC1D23", leitura
assert leitura["confidence"] >= 0.90 and not leitura["ambiguous"], leitura
print("Executável Windows e modelos: OCR real aprovado em imagem sintética.")
