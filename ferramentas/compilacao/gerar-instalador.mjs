import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilarAplicativo } from '../apoio/compilar-aplicativo.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const programa = join(raiz, 'aplicativos/programa-empresa');
compilarAplicativo(
  new URL('../../aplicativos/programa-empresa/compilar-aplicativo.mjs', import.meta.url).href,
  true,
);
const manifesto = JSON.parse(readFileSync(join(programa, 'package.json'), 'utf8'));
const versaoElectron = JSON.parse(readFileSync(join(raiz, 'package-lock.json'), 'utf8')).packages[
  'node_modules/electron'
].version;
// O pacote distribuído tem somente o produto compilado, sem .env ou ferramentas administrativas.
writeFileSync(
  join(programa, 'dist/package.json'),
  JSON.stringify(
    {
      name: 'peganafrota-desktop',
      productName: 'PegaNaFrota',
      version: manifesto.version,
      description: 'Gestão de frota',
      author: 'PegaNaFrota',
      main: 'sistema/abrir-janela.cjs',
      private: true,
    },
    null,
    2,
  ) + '\n',
);
const cli = join(raiz, 'node_modules/electron-builder/out/cli/cli.js');
if (!existsSync(cli))
  throw new Error('Instale as dependências com npm ci antes de gerar o instalador.');
const { build, Platform, Arch } = await import('electron-builder');
await build({
  targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
  publish: 'never',
  config: {
    appId: 'app.peganafrota.desktop',
    productName: 'PegaNaFrota',
    electronVersion: versaoElectron,
    directories: { app: join(programa, 'dist'), output: join(raiz, 'instaladores') },
    files: ['**/*', '!**/testes/**', '!**/*.map'],
    asar: true,
    npmRebuild: false,
    artifactName: 'PegaNaFrota-${version}-Instalador.${ext}',
    win: { target: 'nsis' },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'PegaNaFrota',
    },
  },
});
