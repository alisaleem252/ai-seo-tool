// Single source of truth for the six RapidTextAI SEO tools (units = request units charged per run).
export const TOOLS = {
  'competitor-gap': {
    label: 'Competitor Gap', units: 5, endpoint: 'competitor-gap',
    summary: 'Reads the top-ranking pages for a keyword and plans an outline that covers what readers expect plus what competitors miss.',
    inputs: ['keyword'],
  },
  'content-refresh': {
    label: 'Content Refresh', units: 6, endpoint: 'content-refresh',
    summary: 'Finds outdated statements in a published post and proposes updated sentences with a cited source.',
    inputs: ['url', 'html'],
  },
  'fact-check': {
    label: 'Fact Check', units: 6, endpoint: 'fact-check',
    summary: 'Extracts checkable claims and verifies each against live search evidence, quoting the source.',
    inputs: ['url', 'html', 'text'],
  },
  originality: {
    label: 'Originality', units: 3, endpoint: 'originality',
    summary: 'Spot-checks distinctive sentences as exact phrases and flags 8+ word overlaps with existing pages.',
    inputs: ['url', 'html', 'text'],
  },
  'brand-from-url': {
    label: 'Brand from URL', units: 2, endpoint: 'brand-from-url',
    summary: 'Reads a site and suggests a brand profile: voice, tone, audience, facts and CTA.',
    inputs: ['url'],
  },
  embeds: {
    label: 'Embed Finder', units: 1, endpoint: 'embeds',
    summary: 'Finds verified tweets and YouTube/Vimeo videos for an article and the heading each belongs after.',
    inputs: ['topic', 'keyword', 'headings'],
  },
};

/** Validate user input and build the request body for a tool. Throws Error with a readable message. */
export function buildBody(tool, args = {}) {
  const t = TOOLS[tool];
  if (!t) throw new Error(`Unknown tool "${tool}". Choose one of: ${Object.keys(TOOLS).join(', ')}`);
  const body = {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  if (tool === 'competitor-gap') {
    if (!str(args.keyword)) throw new Error('A keyword is required.');
    body.keyword = str(args.keyword);
  } else if (tool === 'brand-from-url') {
    if (!/^https?:\/\//i.test(str(args.url))) throw new Error('A full URL starting with http:// or https:// is required.');
    body.url = str(args.url);
  } else if (tool === 'embeds') {
    if (!str(args.topic) && !str(args.keyword)) throw new Error('A topic or keyword is required.');
    const headings = (args.headings || []).map(str).filter(Boolean);
    if (!headings.length) throw new Error('At least one heading is required so embeds can be placed after it.');
    if (!args.tweets && !args.videos) throw new Error('Enable tweets, videos, or both.');
    Object.assign(body, {
      topic: str(args.topic), keyword: str(args.keyword), headings,
      tweets: Boolean(args.tweets), videos: Boolean(args.videos),
      tweet_count: Number(args.tweet_count) || 2, video_count: Number(args.video_count) || 2,
    });
  } else {
    // content-refresh, fact-check, originality: url, html or text
    const sources = ['url', 'html', 'text'].filter((k) => t.inputs.includes(k) && str(args[k]));
    if (!sources.length) throw new Error(`Provide ${t.inputs.join(', ')} (one of them).`);
    const k = sources[0];
    if (k === 'url' && !/^https?:\/\//i.test(str(args.url))) throw new Error('URL must start with http:// or https://');
    body[k] = k === 'url' ? str(args[k]) : args[k];
    if (JSON.stringify(body).length > 500_000) throw new Error('Input is too large (the API accepts up to 512 KB).');
  }
  if (args.model) body.model = String(args.model);
  return body;
}
