// @ts-check
// Simplify provider — ingests the community-maintained SimplifyJobs internship
// list (a public GitHub JSON of ~15k listings, the feed many aggregators like
// intern-list.com pull from). Structured + dated, so it pairs perfectly with the
// freshness filter: each entry carries date_posted, which becomes job.postedAt.
//
// Auto-detected on raw.githubusercontent.com/SimplifyJobs/... URLs, or opt-in
// via provider: 'simplify'. No API key needed.
//
// The feed is ~11MB on the dev branch (Summer2026-Internships). 10s default
// HTTP timeout is too tight for the full file — request 180s. The freshness
// filter downstream drops 99% of rows; the network cost is the bottleneck.

import { getFeedCache, setFeedCache } from '../db.mjs';

const SIMPLIFY_HOST = 'raw.githubusercontent.com';
const SIMPLIFY_TIMEOUT_MS = 180_000;
const SIMPLIFY_CACHE_KEY = 'simplify:listings';
const SIMPLIFY_LISTINGS_PATH = '/dev/.github/scripts/listings.json';
const SIMPLIFY_PROBE_TIMEOUT_MS = 15_000;

/** @param {import('./_types.js').PortalEntry} entry */
function isSimplify(entry) {
  const u = entry.careers_url || '';
  try {
    const p = new URL(u);
    return p.hostname === SIMPLIFY_HOST && /SimplifyJobs/i.test(p.pathname);
  } catch { return false; }
}

function extractBranch(careersUrl) {
  const m = careersUrl.match(/\/SimplifyJobs\/([^/]+)\/dev\//i);
  return m ? m[1] : null;
}

function buildListingsUrl(branch) {
  return `https://raw.githubusercontent.com/SimplifyJobs/${branch}${SIMPLIFY_LISTINGS_PATH}`;
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

function dateValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function maxDatePosted(rows) {
  let maxDate = null;
  for (const row of rows) {
    const value = dateValue(row?.date_posted);
    if (value != null && (maxDate == null || value > maxDate)) maxDate = value;
  }
  return maxDate;
}

async function probeBranch(branch, ctx) {
  try {
    const text = await ctx.fetchText(buildListingsUrl(branch), {
      timeoutMs: SIMPLIFY_PROBE_TIMEOUT_MS,
      headers: { Range: 'bytes=0-1023' },
    });
    const json = JSON.parse(text);
    const rows = Array.isArray(json) ? json : [];
    const maxDate = maxDatePosted(rows);
    return maxDate == null ? null : { branch, maxDate };
  } catch {
    return null;
  }
}

/** @param {import('./_types.js').Context} ctx */
export async function resolveSeasonBranch(ctx) {
  const year = new Date().getFullYear();
  const candidates = [
    `Summer${year}-Internships`,
    `Summer${year + 1}-Internships`,
    `Summer${year + 2}-Internships`,
  ];
  let best = null;
  for (const branch of candidates) {
    const result = await probeBranch(branch, ctx);
    if (result && (!best || result.maxDate > best.maxDate)) best = result;
  }
  if (best) setFeedCache(SIMPLIFY_CACHE_KEY, { picked_branch: best.branch, last_status: 200 });
  return best;
}

/** @type {import('./_types.js').Provider} */
export default {
  id: 'simplify',

  detect(entry) {
    return isSimplify(entry) ? { url: entry.careers_url } : null;
  },

  async fetch(entry, ctx) {
    const cached = getFeedCache(SIMPLIFY_CACHE_KEY);
    let currentBranch = cached?.picked_branch || null;
    if (!currentBranch) {
      const resolved = await resolveSeasonBranch(ctx);
      currentBranch = resolved?.branch || extractBranch(entry.careers_url);
    }
    const feedUrl = currentBranch ? buildListingsUrl(currentBranch) : entry.careers_url;
    const res = await ctx.fetchWithCache(feedUrl, { timeoutMs: SIMPLIFY_TIMEOUT_MS }, SIMPLIFY_CACHE_KEY);
    if (res.status === 304) return [];

    const json = /** @type {any} */ (await res.json());
    setFeedCache(SIMPLIFY_CACHE_KEY, {
      etag: headerValue(res.headers, 'etag'),
      last_modified: headerValue(res.headers, 'last-modified'),
      picked_branch: currentBranch,
      last_status: 200,
    });

    const rows = Array.isArray(json) ? json : [];
    return rows
      // Only currently-open, publicly-visible postings.
      .filter(r => r && r.active !== false && r.is_visible !== false && r.url && r.title)
      .map(r => ({
        title: r.title,
        url: r.url,
        company: r.company_name || '',
        location: Array.isArray(r.locations) ? r.locations.join(', ') : (r.locations || ''),
        // date_posted is epoch SECONDS in this feed → convert to ms.
        postedAt: typeof r.date_posted === 'number' ? r.date_posted * 1000 : undefined,
      }));
  },
};
