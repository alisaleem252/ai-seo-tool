// Turn each tool's result into a readable Markdown report.
const list = (a) => (a || []).filter(Boolean);
const bullets = (a) => list(a).map((x) => `- ${x}`).join('\n');

const VERDICT = { supported: '✅ Supported', partly: '🟡 Partly supported', contradicted: '❌ Contradicted', unverified: '❔ Unverified' };

const R = {
  'competitor-gap': (r) => {
    const o = r.outline || {};
    return [
      `# Competitor gap: ${r.keyword}`, '',
      `**Target length:** ${r.target_words} words (competitor median ${r.median_words})`,
      r.angle ? `\n**Suggested angle:** ${r.angle}` : '',
      '\n## What competitors cover (headings used by 2+ pages)', bullets((r.common || []).map((c) => `${c.label} (${c.count} pages)`)),
      '\n## Covered by only one page', bullets((r.single || []).map((c) => c.label)),
      r.missing?.length ? `\n## Gaps to own\n${bullets(r.missing)}` : '',
      `\n## Recommended outline: ${o.title || r.keyword}`,
      o.secondary_keywords?.length ? `Secondary keywords: ${o.secondary_keywords.join(', ')}\n` : '',
      list(o.sections).map((s, i) => `${i + 1}. ${typeof s === 'string' ? s : s.heading || s.title || JSON.stringify(s)}`).join('\n'),
      o.faq?.length ? `\n## FAQ ideas\n${bullets(o.faq)}` : '',
      r.competitors?.length ? `\n## Pages analysed\n${bullets(r.competitors.map((c) => (c.url ? `${c.title || c.url} (${c.url})` : String(c))))}` : '',
    ].filter((x) => x !== '').join('\n') + '\n';
  },

  'content-refresh': (r) => {
    const s = r.summary || {};
    return [
      `# Content refresh${r.title ? `: ${r.title}` : ''}`, '',
      r.source_url ? `Source: ${r.source_url}\n` : '',
      `Checked ${s.checked ?? 0} time-sensitive statements, ${s.updated ?? 0} updated.` + (s.old_years?.length ? ` Older years mentioned: ${JSON.stringify(s.old_years)}.` : ''),
      '', '## Proposed changes', '',
      list(r.changes).map((c, i) => [
        `### ${i + 1}. ${c.applied ? 'Applied' : c.status === 'no_source' ? 'No current source' : 'Suggested (not auto-applied)'}`,
        `**Before:** ${c.before}`,
        c.after ? `**After:** ${c.after}` : '',
        c.source_url ? `**Source:** [${c.source_title || c.source_url}](${c.source_url})` : '',
        c.reason ? `*${c.reason}*` : '',
      ].filter(Boolean).join('\n\n')).join('\n\n') || '_No updates proposed._',
    ].filter((x) => x !== '').join('\n') + '\n';
  },

  'fact-check': (r) => {
    const s = r.summary || {};
    return [
      `# Fact check${r.title ? `: ${r.title}` : ''}`, '',
      `**Score: ${s.score ?? 0}/100**: ${s.supported ?? 0} supported, ${s.partly ?? 0} partly, ${s.contradicted ?? 0} contradicted, ${s.unverified ?? 0} unverified (of ${s.checked ?? 0} claims)`,
      '', '## Claims', '',
      list(r.claims).map((c, i) => [
        `${i + 1}. **${VERDICT[c.verdict] || c.verdict}**: ${c.claim}`,
        c.evidence ? `   > ${c.evidence}` : '',
        c.source_url ? `   Source: ${c.source_url}` : '',
        c.note ? `   Note: ${c.note}` : '',
      ].filter(Boolean).join('\n')).join('\n\n'),
    ].join('\n') + '\n';
  },

  originality: (r) => [
    `# Originality check${r.title ? `: ${r.title}` : ''}`, '',
    `**Score: ${r.score ?? 0}/100**: ${r.matched ?? 0} of ${r.checked ?? 0} sampled sentences matched existing pages.`,
    '*This is a spot check of distinctive sentences, not a plagiarism guarantee.*', '',
    list(r.matches).length ? '## Matches\n\n' + r.matches.map((m, i) => `${i + 1}. "${m.sentence}"\n   ${m.run_words} consecutive words (${m.share}% of the sentence) also appear on [${m.title || m.host}](${m.url})`).join('\n\n') : '_No overlapping text found._',
  ].join('\n') + '\n',

  'brand-from-url': (r) => {
    const b = r.brand || {};
    const row = (k, v) => (v && (!Array.isArray(v) || v.length) ? `- **${k}:** ${Array.isArray(v) ? v.join('; ') : v}` : '');
    return [
      `# Suggested brand: ${b.name || ''}`, '',
      r.source_url ? `Source: ${r.source_url}\n` : '',
      row('Description', b.description), row('Voice', b.voice_description), row('Tone', b.tone), row('Audience', b.audience),
      row('Point of view', b.pov), row('Language', b.language), row('Call to action', b.cta), row('Product info', b.product_info),
      row('Facts', b.facts), row('Preferred words', b.preferred_words),
      r.dropped_facts ? `\n_${r.dropped_facts} fact(s) were dropped because their figures were not on the page._` : '',
    ].filter((x) => x !== '').join('\n') + '\n';
  },

  embeds: (r) => [
    '# Embed suggestions', '',
    '## Tweets', list(r.tweets).length ? r.tweets.map((t) => `- After **${t.after_heading}**: ${t.author}: "${t.text}"\n  ${t.url}${t.verified ? '' : ' (not verified)'}`).join('\n') : '_None_',
    '', '## Videos', list(r.videos).length ? r.videos.map((v) => `- After **${v.after_heading}**: ${v.title} (${v.provider}, ${v.author})\n  ${v.url}`).join('\n') : '_None_',
    r.warnings?.length ? `\n## Warnings\n${bullets(r.warnings)}` : '',
  ].filter((x) => x !== '').join('\n') + '\n',
};

export function toMarkdown(tool, result) {
  return (R[tool] ? R[tool](result) : '```json\n' + JSON.stringify(result, null, 2) + '\n```\n');
}
