import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);
const mime = new Map([['.html', 'text/html'], ['.css', 'text/css'], ['.js', 'text/javascript'], ['.svg', 'image/svg+xml']]);
const port = Number(process.env.SHIELD_PORT ?? 4180);

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const asset = pathname === '/' ? 'index.html' : pathname.slice(1);
  const type = mime.get(asset.slice(asset.lastIndexOf('.')));
  if (!/^[a-z0-9-]+\.(html|css|js|svg)$/i.test(asset) || !type) {
    res.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(new URL(asset, root));
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' }).end(bytes);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, '127.0.0.1', () => console.log('Supply Shield: http://127.0.0.1:' + port));
