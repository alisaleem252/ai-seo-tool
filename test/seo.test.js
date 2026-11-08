import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { SeoClient, parseSSE } from '../src/client.js';
import { buildBody, TOOLS } from '../src/tools.js';
import { toMarkdown } from '../src/report.js';

test('parseSSE handles split chunks and stops at [DONE]', async () => {
  const body = (async function* () {
    yield Buffer.from('data: {"type":"progress","stage":"search"}\n\ndata: {"ty');
    yield Buffer.from('pe":"result","data":{"ok":1}}\n\ndata: [DONE]\n\ndata: {"type":"x"}\n\n');
  })();
  const out = []; for await (const e of parseSSE(body)) out.push(e.type);
  assert.deepEqual(out, ['progress', 'result']);
});

test('buildBody validates and shapes input for every tool', () => {
  assert.deepEqual(buildBody('competitor-gap', { keyword: ' seo ' }), { keyword: 'seo' });
  assert.throws(() => buildBody('competitor-gap', {}), /keyword/);
  assert.throws(() => buildBody('brand-from-url', { url: 'example.com' }), /http/);
  assert.deepEqual(buildBody('fact-check', { text: 'hello' }), { text: 'hello' });
  assert.throws(() => buildBody('originality', {}), /Provide/);
  assert.throws(() => buildBody('embeds', { topic: 't', headings: ['h'] }), /tweets, videos/);
  const e = buildBody('embeds', { topic: 't', headings: ['a', ' '], tweets: true });
  assert.deepEqual(e.headings, ['a']);
  assert.throws(() => buildBody('nope', {}), /Unknown tool/);
  assert.equal(Object.keys(TOOLS).length, 6);
});

test('run() posts to the right endpoint with bearer auth and returns the result', async () => {
  let seen;
  const srv = createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      seen = { url: req.url, auth: req.headers.authorization, body: JSON.parse(b) };
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"progress","stage":"s","detail":"d"}\n\n');
      res.write('data: {"type":"result","data":{"score":90}}\n\n');
      res.end('data: [DONE]\n\n');
    });
  }).listen(0);
  const c = new SeoClient({ apiKey: 'k', baseUrl: `http://127.0.0.1:${srv.address().port}/openai` });
  const events = [];
  const r = await c.run('originality', { text: 'x' }, { onEvent: (e) => events.push(e.type) });
  srv.close();
  assert.equal(r.score, 90);
  assert.equal(seen.url, '/openai/v2/seo/originality');
  assert.equal(seen.auth, 'Bearer k');
  assert.equal(seen.body.stream, true);
  assert.deepEqual(events, ['progress', 'result']);
});

test('API errors include the message and a hint', async () => {
  const srv = createServer((_, res) => { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end('{"error":{"message":"busy","code":"concurrent_request"}}'); }).listen(0);
  const c = new SeoClient({ apiKey: 'k', baseUrl: `http://127.0.0.1:${srv.address().port}` });
  await assert.rejects(c.run('fact-check', { text: 'x' }), (e) => /busy/.test(e.message) && /already running/.test(e.message) && e.status === 429);
  srv.close();
});

test('missing key throws', () => {
  const old = process.env.RAPIDTEXTAI_API_KEY; delete process.env.RAPIDTEXTAI_API_KEY;
  assert.throws(() => new SeoClient(), /Missing API key/);
  if (old) process.env.RAPIDTEXTAI_API_KEY = old;
});

test('reports render for each tool without throwing', () => {
  assert.match(toMarkdown('fact-check', { summary: { score: 70, checked: 1, supported: 1 }, claims: [{ claim: 'c', verdict: 'supported' }] }), /Score: 70/);
  assert.match(toMarkdown('originality', { score: 88, checked: 8, matched: 1, matches: [] }), /No overlapping/);
  assert.match(toMarkdown('competitor-gap', { keyword: 'k', target_words: 1000, median_words: 900, outline: { sections: ['a'] } }), /1\. a/);
  assert.match(toMarkdown('content-refresh', { changes: [{ before: 'b', after: 'a', applied: true }], summary: {} }), /Applied/);
  assert.match(toMarkdown('brand-from-url', { brand: { name: 'N', tone: 'x' } }), /Suggested brand: N/);
  assert.match(toMarkdown('embeds', { tweets: [], videos: [] }), /None/);
});
