#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from '../src/env.js';
import { SeoClient } from '../src/client.js';
import { TOOLS, buildBody } from '../src/tools.js';
import { toMarkdown } from '../src/report.js';

loadEnv();

const ALIASES = { gap: 'competitor-gap', refresh: 'content-refresh', facts: 'fact-check', factcheck: 'fact-check', brand: 'brand-from-url', original: 'originality' };

const HELP = `Usage: ai-seo-tool <tool> [input] [options]

Tools (units charged per run):
  gap "<keyword>"            competitor-gap     5   Plan an outline from top-ranking pages
  refresh <url>              content-refresh    6   Find and update outdated statements
  fact-check <url>           fact-check         6   Verify claims against live evidence
  originality <url>          originality        3   Spot-check for copied text
  brand <url>                brand-from-url     2   Suggest a brand profile from a site
  embeds --topic "<t>" --heading "<h>" ...      1   Find tweets/videos to embed
  capabilities | models                         free

Input for refresh / fact-check / originality can also be a local file:
  --file page.html   (HTML)    --file draft.txt   (plain text)

Options:
  -f, --file <path>      Read the content from a file instead of a URL
  -m, --model <id>       Model used by the tool (default chosen by the API)
      --topic <text>     embeds: article topic
  -k, --keyword <text>   embeds: primary keyword
  -H, --heading <text>   embeds: heading to place embeds after (repeatable)
      --tweets           embeds: look for tweets
      --videos           embeds: look for videos
  -o, --out <dir>        Save report (.md) and raw result (.json) here (default ./output)
      --no-save          Print only, do not write files
      --json             Print the raw JSON result
      --key <api-key>    Override RAPIDTEXTAI_API_KEY
  -q, --quiet            No progress output
  -h, --help`;

let values, positionals;
try {
  ({ values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      file: { type: 'string', short: 'f' }, model: { type: 'string', short: 'm' }, topic: { type: 'string' },
      keyword: { type: 'string', short: 'k' }, heading: { type: 'string', short: 'H', multiple: true },
      tweets: { type: 'boolean' }, videos: { type: 'boolean' }, out: { type: 'string', short: 'o', default: 'output' },
      'no-save': { type: 'boolean' }, json: { type: 'boolean' }, key: { type: 'string' },
      quiet: { type: 'boolean', short: 'q' }, help: { type: 'boolean', short: 'h' },
    },
  }));
} catch (e) { console.error(e.message + '\n\n' + HELP); process.exit(2); }

const [rawTool, ...rest] = positionals;
if (values.help || !rawTool) { console.log(HELP); process.exit(values.help ? 0 : 2); }

const log = (...a) => { if (!values.quiet && !values.json) console.error(...a); };
const tool = ALIASES[rawTool] || rawTool;
const ac = new AbortController();
process.on('SIGINT', () => { ac.abort(); console.error('\nCancelled.'); process.exit(130); });

try {
  const client = new SeoClient({ apiKey: values.key });
  if (tool === 'capabilities') { console.log(JSON.stringify(await client.capabilities(), null, 2)); process.exit(0); }
  if (tool === 'models') { console.log(JSON.stringify(await client.models(), null, 2)); process.exit(0); }
  if (!TOOLS[tool]) { console.error(`Unknown tool "${rawTool}".\n\n${HELP}`); process.exit(2); }

  // Assemble the input from positional / flags / file
  const input = rest.join(' ').trim();
  const args = { model: values.model };
  if (tool === 'competitor-gap') args.keyword = input;
  else if (tool === 'embeds') Object.assign(args, { topic: values.topic || input, keyword: values.keyword, headings: values.heading, tweets: values.tweets, videos: values.videos });
  else if (values.file) {
    const content = await readFile(values.file, 'utf8');
    args[/\.html?$/i.test(values.file) ? 'html' : 'text'] = content;
  } else args.url = input;

  if (tool === 'content-refresh' && args.text) throw new Error('content-refresh needs a URL or an HTML file (--file page.html).');
  const body = buildBody(tool, args);

  log(`Running ${tool} (${TOOLS[tool].units} units)...`);
  const t0 = Date.now();
  const result = await client.run(tool, body, {
    signal: ac.signal,
    onEvent: (e) => e.type === 'progress' && log(`  • ${e.stage}${e.detail ? `: ${e.detail}` : ''}`),
  });
  const md = toMarkdown(tool, result);
  if (values.json) console.log(JSON.stringify(result, null, 2)); else console.log('\n' + md);

  if (!values['no-save']) {
    await mkdir(values.out, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const base = join(values.out, `${tool}-${stamp}`);
    await writeFile(`${base}.md`, md);
    await writeFile(`${base}.json`, JSON.stringify(result, null, 2));
    const saved = [`${base}.md`, `${base}.json`];
    if (tool === 'content-refresh' && result.updated_html) { await writeFile(`${base}.updated.html`, result.updated_html); saved.push(`${base}.updated.html`); }
    log(`Done in ${Math.round((Date.now() - t0) / 1000)}s. Saved:\n  ${saved.join('\n  ')}`);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
