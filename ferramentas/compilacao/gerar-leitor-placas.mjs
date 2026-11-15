import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, writeFileSync, cpSync } from 'node:fs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const python = process.env.PNF_PYTHON || 'python';
const pasta = join(raiz, 'servicos/leitor-placas');
const saida = join(pasta, 'compilado');
const trabalho = join(raiz, 'artifacts/leitor-placas');
mkdirSync(trabalho, { recursive: true });
const resultado = spawnSync(
  python,
  [
    '-m',
    'PyInstaller',
    '--noconfirm',
    '--clean',
    '--onedir',
    '--console',
    '--name',
    'leitor-placas',
    '--distpath',
    saida,
    '--workpath',
    join(trabalho, 'construcao'),
    '--specpath',
    trabalho,
    '--collect-all',
    'rapidocr_onnxruntime',
    '--collect-all',
    'onnxruntime',
    '--collect-all',
    'shapely',
    '--collect-all',
    'cv2',
    '--copy-metadata',
    'Pillow',
    '--copy-metadata',
    'opencv-python',
    '--copy-metadata',
    'rapidocr_onnxruntime',
    join(pasta, 'reconhecer_placa.py'),
  ],
  { cwd: raiz, stdio: 'inherit', shell: false },
);
if (
  resultado.error ||
  resultado.status !== 0 ||
  !existsSync(join(saida, 'leitor-placas/leitor-placas.exe'))
) {
  throw new Error(
    'Não foi possível gerar o leitor. Use Python 3.12 e instale servicos/leitor-placas/requirements.txt, ou execute o workflow Windows.',
  );
}
cpSync(join(pasta, 'licencas'), join(saida, 'leitor-placas', 'licencas'), { recursive: true });
const prefixoPython = spawnSync(python, ['-c', 'import sys; print(sys.base_prefix)'], {
  encoding: 'utf8',
  shell: false,
}).stdout?.trim();
if (prefixoPython && existsSync(join(prefixoPython, 'LICENSE.txt')))
  cpSync(
    join(prefixoPython, 'LICENSE.txt'),
    join(saida, 'leitor-placas', 'licencas', 'Python-PSF.txt'),
  );
writeFileSync(
  join(saida, 'leitor-placas', 'LEIA_LICENCAS.txt'),
  'Reconhecimento local: Python (PSF), RapidOCR e modelos PP-OCR (Apache-2.0), ONNX Runtime (MIT), OpenCV (Apache-2.0), NumPy (BSD), Pillow (HPND). Consulte licencas/ e as licenças das distribuições em _internal/.\n',
);
console.log('Leitor Windows compilado e modelos incluídos para uso sem download em produção.');
