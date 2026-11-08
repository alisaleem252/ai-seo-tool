// Offline demo: runs the web UI against a fake RapidTextAI API so you can try every tool
// without an API key or spending units. All output is canned sample text, not real analysis.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const R = {
  'competitor-gap': {
    keyword: 'project management software', median_words: 2100, target_words: 2400,
    angle: 'A practical buyer guide for small teams that compares setup effort and total cost, not just features.',
    competitors: Array.from({ length: 8 }, (_, i) => ({ url: `https://example.com/page-${i + 1}`, title: `Competitor page ${i + 1}` })),
    common: [{ label: 'What is project management software?', count: 7 }, { label: 'Key features to look for', count: 6 }, { label: 'Pricing comparison', count: 5 }, { label: 'Best tools for small teams', count: 4 }, { label: 'How to choose the right tool', count: 4 }],
    single: [{ label: 'Security and compliance checklist', count: 1 }],
    missing: ['Migration plan from spreadsheets', 'Total cost of ownership', 'Onboarding time per tool', 'Integration limits on free plans'],
    outline: {
      title: 'Project Management Software: How Small Teams Should Choose in 2026', keyword: 'project management software',
      secondary_keywords: ['task management', 'team collaboration', 'project tracking'],
      sections: ['What project management software actually does', 'Features that matter for small teams', 'Pricing and the real cost of ownership', 'Migrating from spreadsheets without losing history', 'Integrations and their limits', 'A simple scorecard for choosing', 'Rolling it out in the first 30 days'],
      faq: ['Is free project management software enough?', 'How long does onboarding take?', 'Can I switch tools later?'],
    },
  },
  'content-refresh': {
    title: 'Remote Team Budgeting Guide', source_url: 'https://example.com/blog/remote-budgeting',
    original_html: '<p>old</p>', updated_html: '<p>new</p>',
    summary: { checked: 6, updated: 2, year: 2026, old_years: [{ year: 2023, count: 3 }] },
    changes: [
      { before: 'As of 2023, most small teams use three or more paid tools.', after: 'As of 2025, most small teams use four or more paid tools, according to a recent industry survey.', source_url: 'https://example.com/survey', source_title: 'Industry survey', reason: 'Newer figure found', applied: true, status: 'applied' },
      { before: 'The average subscription costs $9 per user each month.', after: 'The average subscription now costs $12 per user each month.', source_url: 'https://example.com/pricing-report', source_title: 'Pricing report', reason: 'Price changed', applied: true, status: 'applied' },
      { before: 'Version 4 is the latest release.', after: 'Version 5 is the latest release.', source_url: 'https://example.com/changelog', source_title: 'Changelog', reason: 'Sentence not found verbatim in the HTML', applied: false, status: 'not_found_in_html' },
      { before: 'Most teams review budgets quarterly.', after: '', source_url: '', source_title: '', reason: 'No current source found', applied: false, status: 'no_source' },
    ],
  },
  'fact-check': {
    title: 'Remote Team Budgeting Guide', source_url: 'https://example.com/blog/remote-budgeting',
    summary: { checked: 5, supported: 3, partly: 1, contradicted: 1, unverified: 0, score: 70 },
    claims: [
      { claim: 'Most small teams use four or more paid tools.', verdict: 'supported', evidence: 'Respondents reported using four or more paid tools on average.', source_url: 'https://example.com/survey', note: '' },
      { claim: 'Teams that review budgets monthly overspend less.', verdict: 'supported', evidence: 'Monthly reviews were associated with fewer overruns.', source_url: 'https://example.com/study', note: '' },
      { claim: 'Cloud tools cost 30% less than on-premise software.', verdict: 'partly', evidence: 'Savings ranged from 10% to 25% depending on team size.', source_url: 'https://example.com/costs', note: 'Figure is higher than the evidence suggests.' },
      { claim: 'Spreadsheets are used by 90% of teams.', verdict: 'contradicted', evidence: 'Spreadsheet use was reported by roughly 60% of teams.', source_url: 'https://example.com/usage', note: '' },
      { claim: 'Onboarding takes under a day.', verdict: 'supported', evidence: 'Median onboarding time was 6 hours.', source_url: 'https://example.com/onboarding', note: '' },
    ],
  },
  originality: {
    title: 'Remote Team Budgeting Guide', source_url: 'https://example.com/blog/remote-budgeting', checked: 8, matched: 1, score: 88,
    matches: [{ sentence: 'A shared spreadsheet is the simplest way to start tracking every recurring expense across the team.', url: 'https://example.com/other-article', title: 'Another article', host: 'example.com', run_words: 11, share: 61 }],
  },
  'brand-from-url': {
    source_url: 'https://example.com', fetch_mode: 'curl', dropped_facts: 1,
    brand: {
      name: 'Example Co', description: 'A fictional company used for this demo.', voice_description: 'Plain, direct and friendly. Short sentences, no jargon.',
      tone: 'Friendly, practical', audience: 'Small business owners', pov: 'second', language: 'English', cta: 'Start a free trial',
      product_info: 'Cloud tools that help small teams plan and track work.', facts: ['Founded in 2019', 'Used by teams in 40 countries'], preferred_words: ['simple', 'clear', 'practical'],
    },
  },
  embeds: {
    tweets: [{ url: 'https://x.com/example/status/1', author: '@example', text: 'The best budget is the one your whole team actually opens every month.', verified: true, after_heading: 'Why budgets fail' }],
    videos: [{ url: 'https://www.youtube.com/watch?v=example', provider: 'youtube', title: 'Budgeting for small teams in 10 minutes', author: 'Example Channel', after_heading: 'Choosing a tool' }],
    warnings: [],
  },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const api = createServer(async (req, res) => {
  const m = req.url.match(/\/v2\/seo\/([a-z-]+)/);
  if (req.url.includes('/v2/seo/capabilities')) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ version: '2.0', demo: true })); }
  if (m && R[m[1]]) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    for (const [stage, detail] of [['search', 'finding sources'], ['read', 'reading pages'], ['analyse', 'comparing results']]) { send({ type: 'progress', stage, detail }); await sleep(Number(process.env.MOCK_DELAY ?? 600)); }
    send({ type: 'result', data: R[m[1]] });
    return res.end('data: [DONE]\n\n');
  }
  res.writeHead(404); res.end();
}).listen(Number(process.env.MOCK_PORT || 0), '127.0.0.1', () => {
  const env = { ...process.env, RAPIDTEXTAI_API_KEY: 'demo-key', RAPIDTEXTAI_BASE_URL: `http://127.0.0.1:${api.address().port}/openai` };
  console.log('DEMO MODE: using a fake API with sample data. No key or units needed.');
  spawn(process.execPath, ['server.js'], { env, stdio: 'inherit' }).on('exit', () => process.exit());
});
