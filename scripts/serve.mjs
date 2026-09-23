import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './config.mjs';

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

export async function createPreviewServer() {
  const dist = join(ROOT, 'dist');
  const rules = [];
  for (const line of (await readFile(join(dist, '_headers'), 'utf8')).split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const expression = line.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
      rules.push({ pattern: new RegExp(`^${expression}$`), headers: {} });
    } else {
      const colon = line.indexOf(':');
      if (colon < 0) throw new Error(`Unsupported preview header rule: ${line}`);
      rules.at(-1).headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  const notFound = await readFile(join(dist, '404.html'));
  return createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let path;
    try {
      path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch {
      response.writeHead(400).end('Invalid request path.');
      return;
    }
    const headers = { 'Cache-Control': 'no-cache' };
    for (const rule of rules) {
      if (rule.pattern.test(path)) Object.assign(headers, rule.headers);
    }
    if (path === '/') path = '/index.html';
    else if (path === '/review') path = '/review.html';
    else if (path === '/gallery') path = '/gallery.html';
    const file = resolve(dist, `.${path}`);
    if (!file.startsWith(`${dist}${sep}`) || path.includes('\0') || path.split('/').some((part) => part.startsWith('_'))) {
      response.writeHead(404, { ...headers, 'Content-Type': mime['.html'] }).end(request.method === 'HEAD' ? undefined : notFound);
      return;
    }
    try {
      const content = await readFile(file);
      response.writeHead(200, { ...headers, 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EISDIR') {
        response.writeHead(404, { ...headers, 'Content-Type': mime['.html'] }).end(request.method === 'HEAD' ? undefined : notFound);
      } else {
        console.error(`Preview failed for ${path}:`, error);
        response.writeHead(500).end('Could not read the requested file.');
      }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535.');
  const server = await createPreviewServer();
  server.on('error', (error) => {
    console.error('Preview server failed:', error);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Home: http://127.0.0.1:${port}\nGallery: http://127.0.0.1:${port}/gallery\nArt review: http://127.0.0.1:${port}/review`));
}
