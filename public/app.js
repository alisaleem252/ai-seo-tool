const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? esc(u) : '#');
const link = (u, t) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener noreferrer">${esc(t || u)}</a>`;
const tone = (score) => (score >= 80 ? 'ok' : score >= 50 ? 'warn' : 'bad');
const stat = (v, l, cls = '') => `<div class="stat"><b class="${cls}">${esc(v)}</b><span>${esc(l)}</span></div>`;

let config, active = 'competitor-gap', mode = {}, last = null, running = false;
const keyEl = $('#key');
keyEl.value = localStorage.getItem('rtai_key') || '';
keyEl.addEventListener('change', () => localStorage.setItem('rtai_key', keyEl.value));
const hdr = () => ({ 'Content-Type': 'application/json', ...(keyEl.value ? { 'X-Api-Key': keyEl.value } : {}) });

// ---------- result renderers (all text is escaped; no untrusted HTML is ever injected) ----------
const RENDER = {
  'competitor-gap': (r) => {
    const o = r.outline || {};
    return `<h2>${esc(o.title || r.keyword)}</h2>
      <div class="stats">${stat(r.target_words, 'target words')}${stat(r.median_words, 'competitor median')}${stat((r.competitors || []).length, 'pages analysed')}${stat((r.missing || []).length, 'gaps found')}</div>
      ${r.angle ? `<p><b>Suggested angle:</b> ${esc(r.angle)}</p>` : ''}
      <h3>Recommended outline</h3><ol class="outline">${(o.sections || []).map((s) => `<li>${esc(typeof s === 'string' ? s : s.heading || s.title)}</li>`).join('')}</ol>
      ${(r.missing || []).length ? `<h3>Gaps competitors miss</h3><div class="chips">${r.missing.map((m) => `<span class="chip">${esc(m)}</span>`).join('')}</div>` : ''}
      <div class="cols"><div><h3>Covered by 2+ pages</h3>${(r.common || []).slice(0, 10).map((c) => `<div class="item">${esc(c.label)} <small>· ${c.count} pages</small></div>`).join('')}</div>
      <div><h3>FAQ ideas</h3>${((o.faq) || []).map((q) => `<div class="item">${esc(q)}</div>`).join('') || '<p class="muted">None</p>'}</div></div>`;
  },
  'content-refresh': (r) => {
    const s = r.summary || {};
    return `<h2>${esc(r.title || 'Content refresh')}</h2>
      <div class="stats">${stat(s.checked ?? 0, 'statements checked')}${stat(s.updated ?? 0, 'updated', 'ok')}${stat((r.changes || []).length, 'proposed')}</div>
      <div class="bar">${r.updated_html ? '<button class="sec" id="copyUpdated">Copy updated HTML</button>' : ''}</div>
      ${(r.changes || []).map((c) => `<div class="item"><span class="pill ${c.applied ? 'ok' : 'warn'}">${c.applied ? 'applied' : c.status === 'no_source' ? 'no source' : 'suggested'}</span>
        <q><del>${esc(c.before)}</del></q>${c.after ? `<q><ins>${esc(c.after)}</ins></q>` : ''}
        <small>${esc(c.reason || '')} ${c.source_url ? '· ' + link(c.source_url, c.source_title || 'source') : ''}</small></div>`).join('') || '<p class="muted">Nothing needed updating.</p>'}`;
  },
  'fact-check': (r) => {
    const s = r.summary || {}; const cls = { supported: 'ok', partly: 'warn', contradicted: 'bad', unverified: 'muted' };
    return `<h2>${esc(r.title || 'Fact check')}</h2>
      <div class="stats"><div class="stat"><b class="score ${tone(s.score)}">${s.score ?? 0}</b><span>score / 100</span></div>${stat(s.supported ?? 0, 'supported', 'ok')}${stat(s.partly ?? 0, 'partly', 'warn')}${stat(s.contradicted ?? 0, 'contradicted', 'bad')}${stat(s.unverified ?? 0, 'unverified')}</div>
      ${(r.claims || []).map((c) => `<div class="item"><span class="pill ${cls[c.verdict] || ''}">${esc(c.verdict)}</span><q>${esc(c.claim)}</q>
        ${c.evidence ? `<small>“${esc(c.evidence)}”</small><br>` : ''}<small>${esc(c.note || '')} ${c.source_url ? '· ' + link(c.source_url, 'source') : ''}</small></div>`).join('')}`;
  },
  originality: (r) => `<h2>${esc(r.title || 'Originality check')}</h2>
      <div class="stats"><div class="stat"><b class="score ${tone(r.score)}">${r.score ?? 0}</b><span>originality / 100</span></div>${stat(r.checked ?? 0, 'sentences sampled')}${stat(r.matched ?? 0, 'matches', r.matched ? 'bad' : 'ok')}</div>
      <p class="muted">A spot check of distinctive sentences, not a plagiarism guarantee.</p>
      ${(r.matches || []).map((m) => `<div class="item"><q>${esc(m.sentence)}</q><small>${m.run_words} consecutive words (${m.share}% of the sentence) also appear on ${link(m.url, m.title || m.host)}</small></div>`).join('') || '<p class="ok">No overlapping text found.</p>'}`,
  'brand-from-url': (r) => {
    const b = r.brand || {};
    const row = (k, v) => (v && (!Array.isArray(v) || v.length) ? `<div class="item"><small>${k}</small><br>${Array.isArray(v) ? v.map((x) => `<span class="chip">${esc(x)}</span>`).join(' ') : esc(v)}</div>` : '');
    return `<h2>${esc(b.name)}</h2><p class="muted">${esc(r.source_url || '')}</p>${row('Description', b.description)}${row('Voice', b.voice_description)}
      <div class="cols">${row('Tone', b.tone)}${row('Audience', b.audience)}${row('Point of view', b.pov)}${row('Call to action', b.cta)}</div>${row('Facts', b.facts)}${row('Preferred words', b.preferred_words)}${row('Product info', b.product_info)}
      ${r.dropped_facts ? `<p class="muted">${r.dropped_facts} fact(s) dropped: figures not found on the page.</p>` : ''}`;
  },
  embeds: (r) => `<h2>Embed suggestions</h2>
    <h3>Tweets</h3>${(r.tweets || []).map((t) => `<div class="item"><small>After “${esc(t.after_heading)}”</small><q>${esc(t.author)}: ${esc(t.text)}</q>${link(t.url)} ${t.verified ? '' : '<small>(not verified)</small>'}</div>`).join('') || '<p class="muted">None</p>'}
    <h3>Videos</h3>${(r.videos || []).map((v) => `<div class="item"><small>After “${esc(v.after_heading)}”</small><q>${esc(v.title)}</q><small>${esc(v.provider)} · ${esc(v.author)}</small> ${link(v.url)}</div>`).join('') || '<p class="muted">None</p>'}
    ${(r.warnings || []).length ? `<p class="muted">Notes: ${r.warnings.map(esc).join(', ')}</p>` : ''}`,
};

// ---------- forms ----------
const field = (id, label, type = 'text', ph = '') => type === 'area'
  ? `<label for="${id}">${label}</label><textarea id="${id}" rows="7" placeholder="${esc(ph)}"></textarea>`
  : `<label for="${id}">${label}</label><input id="${id}" type="${type}" placeholder="${esc(ph)}">`;

function renderForm() {
  const t = config.tools[active];
  const multi = t.inputs.filter((i) => ['url', 'html', 'text'].includes(i));
  if (multi.length && !multi.includes(mode[active])) mode[active] = multi[0];
  let f = `<h2>${esc(t.label)}</h2><p class="muted">${esc(t.summary)}</p>`;
  if (multi.length > 1) f += `<div class="seg">${multi.map((m) => `<button type="button" data-mode="${m}" aria-pressed="${mode[active] === m}">${{ url: 'URL', html: 'HTML', text: 'Text' }[m]}</button>`).join('')}</div>`;
  if (active === 'competitor-gap') f += field('keyword', 'Target keyword', 'text', 'e.g. project management software');
  else if (active === 'brand-from-url') f += field('url', 'Website URL', 'url', 'https://example.com');
  else if (active === 'embeds') f += field('topic', 'Topic', 'text', 'e.g. remote team budgeting') + field('keyword', 'Keyword (optional)') + field('headings', 'Headings (one per line)', 'area', 'Why budgets fail\nChoosing a tool')
    + `<div class="chk"><input type="checkbox" id="tweets" checked><label for="tweets">Tweets</label></div><div class="chk"><input type="checkbox" id="videos" checked><label for="videos">Videos</label></div>`;
  else f += { url: field('url', 'Page URL', 'url', 'https://example.com/blog/post'), html: field('html', 'HTML', 'area', '<article>…</article>'), text: field('text', 'Text', 'area', 'Paste the text to check') }[mode[active]];
  f += `<button class="go" id="go">Run · ${t.units} unit${t.units > 1 ? 's' : ''}</button>`;
  $('#form').innerHTML = f;
  $('#form').querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { mode[active] = b.dataset.mode; renderForm(); });
  $('#go').onclick = run;
}

function renderTabs() {
  $('#tabs').innerHTML = Object.entries(config.tools).map(([id, t]) => `<button role="tab" data-tool="${id}" aria-selected="${id === active}">${esc(t.label)}<small>${t.units}u</small></button>`).join('');
  $('#tabs').querySelectorAll('button').forEach((b) => b.onclick = () => { active = b.dataset.tool; renderTabs(); renderForm(); $('#out').innerHTML = '<p class="muted">Fill in the input and run the tool.</p>'; });
}

function collect() {
  const v = (id) => $('#' + id)?.value ?? '';
  const a = {};
  if (active === 'competitor-gap') a.keyword = v('keyword');
  else if (active === 'embeds') Object.assign(a, { topic: v('topic'), keyword: v('keyword'), headings: v('headings').split('\n'), tweets: $('#tweets').checked, videos: $('#videos').checked });
  else a[mode[active] || 'url'] = v(mode[active] || 'url');
  return a;
}

async function run() {
  if (running) return;
  const tool = active; running = true; $('#go').disabled = true;
  const out = $('#out'); const t0 = Date.now(); let lines = [];
  out.innerHTML = '<pre class="log" id="log">Starting...</pre>';
  try {
    const res = await fetch('/api/run/' + tool, { method: 'POST', headers: hdr(), body: JSON.stringify(collect()) });
    if (!res.ok) throw new Error((await res.json()).error?.message || res.statusText);
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        if (!chunk.startsWith('data:')) continue;
        const e = JSON.parse(chunk.slice(5));
        if (e.type === 'progress') { lines.push(`• ${e.stage}${e.detail ? ': ' + e.detail : ''}`); const l = $('#log'); if (l) l.textContent = lines.slice(-10).join('\n'); }
        else if (e.type === 'error') throw new Error(e.error.message);
        else if (e.type === 'result') { last = e.data; out.innerHTML = `<p class="muted">Finished in ${Math.round((Date.now() - t0) / 1000)}s</p><div class="bar"><button class="sec" id="copyJson">Copy JSON</button></div>` + RENDER[tool](e.data); wire(); }
      }
    }
  } catch (e) { out.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  running = false; $('#go') && ($('#go').disabled = false);
}

function wire() {
  $('#copyJson')?.addEventListener('click', () => navigator.clipboard.writeText(JSON.stringify(last, null, 2)));
  $('#copyUpdated')?.addEventListener('click', () => navigator.clipboard.writeText(last.updated_html));
}

config = await (await fetch('/api/config')).json();
if (config.hasServerKey) $('#keybox').hidden = true;
renderTabs(); renderForm();
