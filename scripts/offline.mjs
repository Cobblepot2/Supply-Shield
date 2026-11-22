import { mkdir, readFile, writeFile } from 'node:fs/promises';

const readAsset = (file) => readFile(new URL('../public/' + file, import.meta.url), 'utf8');
const [html, css, icon, ...modules] = await Promise.all(
  ['index.html', 'style.css', 'icon.svg', 'fixture.js', 'verify.js', 'copy.js', 'app.js'].map(readAsset),
);
const js = modules.map((source) => source.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')).join('\n');
const offline = html
  .replaceAll('./icon.svg', 'data:image/svg+xml,' + encodeURIComponent(icon))
  .replace('<link rel="stylesheet" href="./style.css">', () => '<style>\n' + css + '</style>')
  .replace('<script type="module" src="./app.js"></script>', () => '<script type="module">\n' + js + '</script>');
const destination = new URL('../dist/', import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL('supply-shield.html', destination), offline);
console.log('Offline demo: dist/supply-shield.html');
