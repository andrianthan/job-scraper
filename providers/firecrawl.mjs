// @ts-check
// Firecrawl provider — last-resort scraper for career sites with NO public ATS
// JSON API (Goldman/Avature, JPMorgan/Oracle, Citadel, McKinsey, etc.).
//
// Two steps: (1) Firecrawl scrapes the careers URL to markdown; (2) the LLM
// (OpenRouter, via classifier-style call) extracts structured listings from
// that markdown. Best-effort by design — JS-heavy/anti-bot sites may yield
// little; tune per-site and verify output.
//
// Opt-in only: set `provider: 'firecrawl'` on the portals.config entry. Never
// auto-detected. Gated on FIRECRAWL_API_KEY + an OpenRouter key; returns [] (a
// soft skip, not a thrown error) when either is missing or the scrape fails.

const FIRECRAWL_URL = 'https://api.firecrawl.dev/v1/scrape';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const EXTRACT_MODEL = process.env.CLASSIFIER_MODEL || 'anthropic/claude-haiku-4.5';

function parseJsonArray(text) {
  let t = (text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return []; }
}

// Scrape one URL to markdown via Firecrawl. Returns '' on failure.
async function scrapeMarkdown(url, apiKey) {
  let res;
  try {
    res = await fetch(FIRECRAWL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
    });
  } catch (err) {
    console.error(`✗ firecrawl network error (${url}): ${err.message}`);
    return '';
  }
  if (!res.ok) {
    console.error(`✗ firecrawl ${res.status} (${url}): ${await res.text().catch(() => '')}`);
    return '';
  }
  const body = await res.json().catch(() => ({}));
  return body?.data?.markdown || '';
}

// LLM-extract job listings from scraped markdown. Returns [] on failure.
async function extractJobs(markdown, company, baseUrl, orKey) {
  if (!markdown) return [];
  const sys = `Extract internship and entry-level job postings from this careers-page markdown.
Return ONLY a JSON array: [{"title": "...", "url": "...", "location": "..."}].
- title: the role title exactly as shown.
- url: the absolute application/posting URL. If a link is relative, resolve it against ${baseUrl}. If no link exists, use ${baseUrl}.
- location: city/region if shown, else "".
Only include real job postings. No prose, no markdown fences.`;
  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${orKey}`, 'X-Title': 'job-board-aggregator' },
      body: JSON.stringify({
        model: EXTRACT_MODEL,
        max_tokens: 8192,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: markdown.slice(0, 60000) },
        ],
      }),
    });
  } catch (err) {
    console.error(`✗ firecrawl extract network error: ${err.message}`);
    return [];
  }
  if (!res.ok) {
    console.error(`✗ firecrawl extract ${res.status}: ${await res.text().catch(() => '')}`);
    return [];
  }
  const body = await res.json().catch(() => ({}));
  const arr = parseJsonArray(body?.choices?.[0]?.message?.content ?? '');
  return arr
    .filter(j => j && j.title && j.url)
    .map(j => ({ title: String(j.title), url: String(j.url), company, location: String(j.location || '') }));
}

/** @type {import('./_types.js').Provider} */
export default {
  id: 'firecrawl',

  // Opt-in only — never auto-claim a URL.
  detect() { return null; },

  async fetch(entry) {
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const orKey = process.env.OPENROUTER_JOB_SCRAPER || process.env.OPENROUTER_API_KEY;
    if (!fcKey || !orKey) {
      console.error(`⏭  firecrawl skipped for ${entry.name} (need FIRECRAWL_API_KEY + OpenRouter key)`);
      return [];
    }
    const url = entry.careers_url;
    const md = await scrapeMarkdown(url, fcKey);
    return extractJobs(md, entry.name, url, orKey);
  },
};
