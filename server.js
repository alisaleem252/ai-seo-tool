import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './src/env.js';
import { SeoClient, RapidTextAIError } from './src/client.js';
import { TOOLS, buildBody } from './src/tools.js';

loadEnv();
const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const STATIC = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };

const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

function readBody(req, limit = 600_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Key comes from .env, or from the browser (localStorage), sent only to this local server.
const clientFor = (req) => new SeoClient({ apiKey: req.headers['x-api-key'] || undefined });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname];
      res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      return res.end(await readFile(join(__dirname, 'public', file)));
    }
    if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { hasServerKey: Boolean(process.env.RAPIDTEXTAI_API_KEY), tools: TOOLS });
    if (req.method === 'GET' && url.pathname === '/api/capabilities') return json(res, 200, await clientFor(req).capabilities());
    if (req.method === 'POST' && url.pathname.startsWith('/api/run/')) {
      const tool = url.pathname.slice('/api/run/'.length);
      const args = JSON.parse((await readBody(req)) || '{}');
      const body = buildBody(tool, args);          // throws a readable validation error before any units are spent
      const client = clientFor(req);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const ac = new AbortController();
      res.on('close', () => ac.abort());
      const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      try {
        const result = await client.run(tool, body, { onEvent: (e) => e.type !== 'result' && send(e), signal: ac.signal });
        send({ type: 'result', data: result });
      } catch (e) {
        if (!ac.signal.aborted) send({ type: 'error', error: { message: e.message } });
      }
      return res.end();
    }
    json(res, 404, { error: { message: 'Not found' } });
  } catch (e) {
    const status = e instanceof RapidTextAIError ? (e.status || 400) : e instanceof SyntaxError ? 400 : 400;
    if (!res.headersSent) json(res, status, { error: { message: e.message } }); else res.end();
  }
});

// Localhost only: this server holds your API key.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`AI SEO Tool running at http://localhost:${PORT}`);
  if (!process.env.RAPIDTEXTAI_API_KEY) console.log('No RAPIDTEXTAI_API_KEY in .env; you can paste your key in the page instead.');
});
