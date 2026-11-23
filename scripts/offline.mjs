import { mkdir, readFile, writeFile } from 'node:fs/promises';

const readAsset = (file) => readFile(new URL('../public/' + file, import.meta.url), 'utf8');
const styleFiles = ['style.css', 'network.css', 'consensus.css', 'response.css'];
const scriptFiles = ['verify.js', 'copy.js', 'network.js', 'consensus.js', 'response.js', 'app.js'];
const [html, icon, styles, sources] = await Promise.all([
  readAsset('index.html'), readAsset('icon.svg'), Promise.all(styleFiles.map(readAsset)), Promise.all(scriptFiles.map(readAsset)),
]);
const parts = ['const offlineModules = Object.create(null);'];
for (let index = 0; index < scriptFiles.length; index++) {
  const source = sources[index];
  const exports = [...source.matchAll(/^export (?:async )?(?:const|function) (\w+)/gm)].map((match) => match[1]);
  const copied = source
    .replace(/^import\s+\{([^}]+)\}\s+from\s+['"]\.\/([^'"]+)['"];\s*$/gm,
      (_, names, from) => 'const {' + names + '} = offlineModules[' + JSON.stringify(from) + '];')
    .replace(/^export /gm, '');
  parts.push('offlineModules[' + JSON.stringify(scriptFiles[index]) + '] = (() => {\n' +
    copied + '\nreturn { ' + exports.join(', ') + ' };\n})();');
}
let offline = html.replaceAll('./icon.svg', 'data:image/svg+xml,' + encodeURIComponent(icon));
for (let index = 0; index < styleFiles.length; index++) {
  offline = offline.replace('<link rel="stylesheet" href="./' + styleFiles[index] + '">',
    () => '<style>\n' + styles[index] + '</style>');
}
offline = offline.replace('<script type="module" src="./app.js"></script>',
  () => '<script type="module">\n' + parts.join('\n').replace(/<\/script/gi, '<\\/script') + '</script>');
const destination = new URL('../dist/', import.meta.url);
await mkdir(destination, { recursive: true });
await writeFile(new URL('supply-shield.html', destination), offline);
console.log('Offline demo: dist/supply-shield.html');
