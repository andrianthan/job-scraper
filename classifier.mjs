// classifier.mjs — LLM relevance gate + field classification via OpenRouter.
//
// Calls OpenRouter's OpenAI-compatible chat-completions API with fetch (zero npm
// deps, matching notify.mjs). Classifies a batch of jobs in ONE request,
// returning per-job { relevant, fellowship, fields[] }. Field names align with
// field-router.mjs ROLES[].name.
//
// Key-gated + graceful: if no OpenRouter key is set or the call fails, returns
// null and the caller falls back to the keyword router. Never throws.
//
// Auth: OPENROUTER_JOB_SCRAPER (or OPENROUTER_API_KEY).
// Model: anthropic/claude-haiku-4.5 (cheap) — override with CLASSIFIER_MODEL.

import { ROLES } from './field-router.mjs';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.CLASSIFIER_MODEL || 'anthropic/claude-haiku-4.5';
const FIELD_NAMES = [...new Set(ROLES.map(r => r.name))];

// Test hook — inject a mock fetch in tests.
let _fetch = (...a) => fetch(...a);
export function _setFetch(fn) { _fetch = fn; }

const SYSTEM = `You classify internship/job postings for an Alpha Kappa Psi (business fraternity) Discord.
For each posting decide:
- relevant: true if it is a genuine internship, co-op, early-insight/sophomore program, fellowship, or new-grad/entry role in business, finance, consulting, marketing, sales, tech, data, product, operations, or HR. false for senior/experienced-only roles, spam, or non-career postings.
- fellowship: true if it is a fellowship or a named fellows/scholars program.
- fields: the career field(s) it best fits, chosen ONLY from the allowed list. Pick all that clearly apply (usually 1-2). Empty array if none fit.
Decide from the title and company. Be precise; never invent a field the title doesn't support.
Respond with ONLY a JSON object of the form {"results":[{"index":0,"relevant":true,"fellowship":false,"fields":["Tech / SWE"]}, ...]} — one entry per posting, no prose, no markdown fences.`;

// Strip ```json fences / surrounding prose and parse the first JSON object.
function parseJson(text) {
  let t = (text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in response');
  return JSON.parse(t.slice(start, end + 1));
}

/**
 * Classify jobs with the LLM. Returns an array aligned 1:1 with `jobs`
 * ([{relevant, fellowship, fields[]}, ...]), or null if unavailable/failed.
 */
export async function classifyJobs(jobs) {
  const apiKey = process.env.OPENROUTER_JOB_SCRAPER || process.env.OPENROUTER_API_KEY;
  if (!apiKey || !jobs.length) return null;

  const listing = jobs.map((j, i) =>
    `${i}. ${j.company || '?'} — ${j.title || '?'}${j.location ? ` [${j.location}]` : ''}`
  ).join('\n');

  let res;
  try {
    res = await _fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
        'X-Title': 'job-board-aggregator',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Allowed fields: ${FIELD_NAMES.join(', ')}.\n\nClassify these ${jobs.length} postings:\n${listing}` },
        ],
      }),
    });
  } catch (err) {
    console.error(`✗ classifier network error: ${err.message}`);
    return null;
  }

  if (!res.ok) {
    console.error(`✗ classifier ${res.status}: ${await res.text().catch(() => '')}`);
    return null;
  }

  let parsed;
  try {
    const body = await res.json();
    const text = body?.choices?.[0]?.message?.content ?? '';
    parsed = parseJson(text);
  } catch (err) {
    console.error(`✗ classifier parse error: ${err.message}`);
    return null;
  }

  const byIndex = new Map((parsed.results || []).map(r => [r.index, r]));
  return jobs.map((_, i) => {
    const r = byIndex.get(i);
    if (!r) return { relevant: true, fellowship: false, fields: [] }; // default: keep, no field
    return {
      relevant: r.relevant !== false,
      fellowship: !!r.fellowship,
      fields: Array.isArray(r.fields) ? r.fields : [],
    };
  });
}
