// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// intern-list.com provider — hybrid source that fuses two feeds:
//   1. Primary: POST https://jobright.ai/swan/mini-sites/list (paginated JSON)
//      for 20 intern categories. The site itself just iframes jobright, so the
//      API is the canonical stream — 11/20 categories return real listings.
//   2. Fallback: legacy sitemap+JSON-LD crawl for the 3 zero-return categories
//      that overlap with our 6 configured sitemap dirs (software_engineer,
//      accounting, marketing). The other 6 zero-returns aren't in the sitemap,
//      so they silently yield zero (API is empty too — no data exists).
//
// Output Job shape:
//   url          = jobright info URL (API rows) or intern-list detail URL (sitemap rows)
//                  — used as the dedup key
//   fallbackUrl  = same as url for API rows (no further fallback exists),
//                  or jobright apply URL (https://jobright.ai/jobs/info/{hash})
//                  for sitemap rows (preserved for notify.mjs's third-party flow)
//   source       = 'intern-list' (tagged by scan.mjs after fetch returns)

const INTERN_LIST_HOST = 'intern-list.com';
const SITEMAP_URL = 'https://www.intern-list.com/sitemap.xml';
const SITEMAP_TIMEOUT_MS = 30_000;

// Bounded-concurrency detail fetcher. Webflow tolerates bursts but the host
// is small — 8 workers keeps the crawl polite without throttling throughput.
const DETAIL_CONCURRENCY = 8;
const DETAIL_TIMEOUT_MS = 20_000;

// jobright fan-out — 4 workers is friendly to their CDN while still hitting
// all 20 categories in ~5 batches.
const API_CONCURRENCY = 4;
const API_TIMEOUT_MS = 30_000;

// Categories to ingest from the legacy sitemap path. Each maps to a top-level
// subdir under intern-list.com that the sitemap indexes independently. Only
// 3 of the 9 API zero-return slugs land in this set: software_engineer,
// accounting, marketing. The remaining 6 (machine_learning, engineering,
// cybersecurity, management, legal, arts, education) just yield zero.
const CATEGORIES = [
  'swe-intern-list',
  'da-intern-list',
  'mkt-intern-list',
  'accounting-and-finance-intern-list',
  'pm-intern-list',
  'data-science-internships',
];

// Maps jobright API slug → sitemap dir suffix, for cats that need fallback.
// Only populated when the API returns total:0 AND the slug has a sitemap dir.
const SITEMAP_SLUG_TO_DIR = {
  software_engineer: 'swe-intern-list',
  accounting: 'accounting-and-finance-intern-list',
  marketing: 'mkt-intern-list',
};

const JOB_SLUG_RE = /^[a-z0-9_]+_at_[a-z0-9_]+_\d+$/;

const JSONLD_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]+?)<\/script>/i;

// ── Jobright API constants ────────────────────────────────────────────────

/** Jobright paginated mini-sites list endpoint. */
export const JOBRIGHT_API = 'https://jobright.ai/swan/mini-sites/list';

/**
 * All 20 category slugs the jobright intern mini-site exposes. Order matches
 * the production client — does not affect correctness, only log readability.
 */
export const JOBRIGHT_CATEGORIES = [
  'software_engineer',
  'data_analysis',
  'machine_learning',
  'product_management',
  'accounting',
  'engineering',
  'business_analyst',
  'marketing',
  'cybersecurity',
  'consulting',
  'creatives_design',
  'management',
  'public_sector',
  'legal',
  'human_resources',
  'arts',
  'sales',
  'customer_service',
  'education',
  'healthcare',
  'supply_chain',
];

/**
 * AI / annotation / labeling roles that the client filters server-side. Sent
 * under BOTH `excludeTitle` and `excludedTitle` keys — the production client
 * emits both even though only one is read; we mirror it so we don't surprise
 * their backend.
 */
export const EXCLUDED_TITLES = [
  'AI Data Trainer',
  'AI Data Annotation',
  'Data Annotation',
  'Data Labeler',
  'Data Labeling',
  'AI Research Assistant',
  'AI Researcher',
  'Research Assistant',
  'Data Quality',
  'AI Quality',
  'Dataset Curator',
  'Dataset Operations',
  'Prompt Engineer',
  'Prompt Engineering',
  'Generative AI',
  'LLM',
  'LLM Operations',
  'AI Content',
  'Content Reviewer',
  'Trust & Safety',
];

// ── URL/label helpers (pure, exported for tests) ──────────────────────────

/**
 * Convert a jobright slug to a human-readable campaign label.
 * Splits on `_`, title-cases each token. Spaces are then URL-encoded by
 * `buildJobrightApplyUrl` at the call site.
 * @param {string} slug e.g. 'data_analysis' → 'Data Analysis'
 */
export function slugToCategoryLabel(slug) {
  if (typeof slug !== 'string' || !slug) return '';
  return slug
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .filter(Boolean)
    .join(' ');
}

/**
 * Synthesize the canonical apply/info URL for an API-sourced row. Mirrors
 * the campaign-tracking format the production mini-site client uses; the
 * jobright info page is the dedup key + apply target for these rows.
 * @param {string} jobId
 * @param {string} categorySlug
 */
export function buildJobrightApplyUrl(jobId, categorySlug) {
  if (typeof jobId !== 'string' || !jobId) return '';
  const label = slugToCategoryLabel(categorySlug);
  const base = `https://jobright.ai/jobs/info/${jobId}?utm_source=1099&utm_campaign=${encodeURIComponent(label)}`;
  return base;
}

/** @param {string} u */
function isInternListUrl(u) {
  try {
    const p = new URL(u);
    return p.hostname === `www.${INTERN_LIST_HOST}` || p.hostname === INTERN_LIST_HOST;
  } catch { return false; }
}

// ── Sitemap parsing ──────────────────────────────────────────────────────

/**
 * Pull all job detail URLs for the configured categories out of the sitemap.
 * Sitemap is plain XML `<urlset>` with `<loc>` per URL — no namespace surprises
 * (the only namespace declared is the standard sitemap one).
 * @param {string} xml
 * @returns {string[]} detail URLs (one per `<loc>` matching category + slug pattern)
 */
export function parseSitemapJobs(xml) {
  const locs = xml.match(/<loc>([^<]+)<\/loc>/g) || [];
  const out = [];
  for (const tag of locs) {
    const url = tag.replace(/^<loc>|<\/loc>$/g, '');
    if (!isInternListUrl(url)) continue;
    let path;
    try { path = new URL(url).pathname; } catch { continue; }
    const parts = path.replace(/^\/|\/$/g, '').split('/');
    if (parts.length !== 2) continue; // skip root + nested paths
    const [dir, slug] = parts;
    if (!CATEGORIES.includes(dir)) continue;
    if (!JOB_SLUG_RE.test(slug)) continue; // skip index/guide pages sharing the dir
    out.push(url);
  }
  return out;
}

// ── Detail-page parsers (sitemap path) ───────────────────────────────────

/**
 * Extract the schema.org JobPosting JSON-LD block. Returns null when absent
 * or malformed (e.g. anti-bot response). Most jobs on intern-list include it;
 * a small minority of legacy posts may not — for those we fall back to the
 * regex parsers below.
 * @param {string} html
 */
export function extractJobPosting(html) {
  const m = html.match(JSONLD_RE);
  if (!m) return null;
  try {
    const data = JSON.parse(m[1]);
    return data && data['@type'] === 'JobPosting' ? data : null;
  } catch {
    return null;
  }
}

// "2026-06-29 23:19:07" or "2026-06-29" — parse to epoch ms. NaN → null.
function parseDatePosted(value) {
  if (typeof value !== 'string') return null;
  // Normalize "YYYY-MM-DD HH:MM:SS" → ISO "YYYY-MM-DDTHH:MM:SSZ" so Date.parse is reliable.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(' ', 'T') + 'Z'
    : value;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

// Jobright applies hash → apply URL. The hash is exposed in JSON-LD as
// identifier.value, and on the page body as the link target.
function buildApplyUrl(hashId) {
  if (typeof hashId !== 'string' || !/^[a-f0-9]+$/i.test(hashId)) return null;
  return `https://jobright.ai/jobs/info/${hashId}`;
}

// Fold schema.org PostalAddress into a single readable location string. Prefer
// the locality → region → country order so it matches the format shown on the
// detail page (e.g. "Markham, Ontario, Canada" / "Dayton, OH, US").
function formatLocation(addr) {
  if (!addr || typeof addr !== 'object') return '';
  const parts = [];
  if (typeof addr.addressLocality === 'string' && addr.addressLocality.trim()) {
    parts.push(addr.addressLocality.trim());
  }
  if (typeof addr.addressRegion === 'string' && addr.addressRegion.trim()) {
    parts.push(addr.addressRegion.trim());
  }
  if (typeof addr.addressCountry === 'string' && addr.addressCountry.trim()) {
    parts.push(addr.addressCountry.trim());
  }
  return parts.join(', ');
}

// Build a Job-shaped object from a JobPosting JSON-LD blob. Returns null when
// required fields are missing. Freshness filtering is delegated to scan.mjs's
// passesFreshness gate (postedAt, MAX_JOB_AGE_DAYS) so the cutoff is
// configurable and consistent across all providers. We do NOT honor
// validThrough here — intern-list's feed sets it == datePosted for most rows,
// which would mark the job stale the day after it was indexed.
/** @param {string} url @param {any} jp */
export function jobFromJsonLd(url, jp) {
  const title = typeof jp.title === 'string' ? jp.title.trim() : '';
  const hashId = jp.identifier?.value;
  const applyUrl = buildApplyUrl(hashId);
  if (!title || !applyUrl) return null;

  const orgName = jp.hiringOrganization?.name;
  const company = typeof orgName === 'string' ? orgName.trim() : '';

  const location = formatLocation(jp.jobLocation?.address);
  const postedAt = parseDatePosted(jp.datePosted) ?? undefined;

  return { title, url, fallbackUrl: applyUrl, company, location, postedAt };
}

// ── API row → Job (pure) ──────────────────────────────────────────────────

/**
 * Build a Job from one jobright API row. Skips rows missing required fields.
 * @param {any} row
 * @param {string} categorySlug
 */
export function jobFromApi(row, categorySlug) {
  if (!row || typeof row !== 'object') return null;
  const jobId = typeof row.jobId === 'string' ? row.jobId : '';
  const props = row.properties;
  const title = props && typeof props.title === 'string' ? props.title.trim() : '';
  if (!jobId || !title) return null;

  const url = buildJobrightApplyUrl(jobId, categorySlug);
  const company = typeof props.company === 'string' ? props.company.trim() : '';
  const location = typeof props.location === 'string' ? props.location.trim() : '';
  const postedAt = Number.isFinite(row.postedAt) ? row.postedAt : undefined;
  /** @type {{title:string,url:string,fallbackUrl:string,company:string,location:string,postedAt?:number,salary?:string}} */
  const job = { title, url, fallbackUrl: url, company, location };
  if (postedAt !== undefined) job.postedAt = postedAt;
  if (typeof props.salary === 'string' && props.salary.trim()) {
    job.salary = props.salary.trim();
  }
  return job;
}

/**
 * Transform one category response into an array of Jobs. Returns [] for any
 * non-success / malformed / empty payload.
 * @param {any} json
 * @param {string} categorySlug
 */
export function parseApiResponse(json, categorySlug) {
  if (!json || typeof json !== 'object') return [];
  if (json.success !== true) return [];
  const result = json.result;
  if (!result || typeof result !== 'object') return [];
  const list = Array.isArray(result.jobList) ? result.jobList : [];
  const out = [];
  for (const row of list) {
    const job = jobFromApi(row, categorySlug);
    if (job) out.push(job);
  }
  return out;
}

// ── Concurrency-limited parallel map ──────────────────────────────────────
// Bounded worker pool. Mirrors the pattern used in scan.mjs so a slow site
// cannot queue thousands of pending fetches.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── API fan-out ───────────────────────────────────────────────────────────

/**
 * POST a single category to the jobright list API. Returns the parsed JSON
 * or null when the request fails (network / timeout / non-2xx). The fetchJson
 * layer already retries 3x with backoff, so failures here are genuinely dead.
 */
async function fetchCategory(ctx, slug) {
  const body = JSON.stringify({
    category: `intern:us:${slug}`,
    excludeTitle: EXCLUDED_TITLES,
    excludedTitle: EXCLUDED_TITLES,
  });
  try {
    return await ctx.fetchJson(JOBRIGHT_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      timeoutMs: API_TIMEOUT_MS,
    });
  } catch {
    return null; // tolerate errors per category
  }
}

/**
 * True when the API response carries no data for this category — either an
 * explicit total:0 or an empty jobList. Used to decide if sitemap fallback
 * should run.
 */
function isEmptyApiResponse(json) {
  if (!json || typeof json !== 'object') return true;
  if (json.success !== true) return true;
  const result = json.result;
  if (!result || typeof result !== 'object') return true;
  const total = Number.isFinite(result.total) ? result.total : 0;
  const list = Array.isArray(result.jobList) ? result.jobList : [];
  return total === 0 && list.length === 0;
}

// ── Sitemap fallback path (per-category) ──────────────────────────────────

/**
 * Run the legacy sitemap+JSON-LD crawl for ONE sitemap dir. Returns [] for
 * any error path so hybrid merge stays simple.
 * @param {string} dir sitemap dir like 'swe-intern-list'
 * @param {Provider['fetch'] extends (e: any, ctx: infer C) => any ? C : never} ctx
 */
async function fetchSitemapDir(ctx, dir) {
  // Re-fetch the sitemap (it's small, ~250KB) and filter to URLs in this dir.
  let sitemapXml;
  try {
    sitemapXml = await ctx.fetchText(SITEMAP_URL, { timeoutMs: SITEMAP_TIMEOUT_MS });
  } catch {
    return [];
  }
  const allUrls = parseSitemapJobs(sitemapXml);
  // parseSitemapJobs already filters to CATEGORIES — narrow to this dir.
  const dirUrls = allUrls.filter((u) => {
    try {
      const parts = new URL(u).pathname.replace(/^\/|\/$/g, '').split('/');
      return parts[0] === dir;
    } catch { return false; }
  });
  if (dirUrls.length === 0) return [];

  const pages = await mapWithConcurrency(dirUrls, DETAIL_CONCURRENCY, async (url) => {
    try {
      const html = await ctx.fetchText(url, { timeoutMs: DETAIL_TIMEOUT_MS });
      const jp = extractJobPosting(html);
      return jp ? jobFromJsonLd(url, jp) : null;
    } catch {
      return null; // dead slug, timeout, 5xx — skip silently
    }
  });
  return pages.filter(Boolean);
}

/** @type {Provider} */
export default {
  id: 'intern-list',

  async fetch(_entry, ctx) {
    // 1. Fan out POSTs to jobright for all 20 categories (bounded).
    const apiResults = await mapWithConcurrency(JOBRIGHT_CATEGORIES, API_CONCURRENCY, async (slug) => ({
      slug,
      json: await fetchCategory(ctx, slug),
    }));

    // 2. Merge API results, collect slugs that need sitemap fallback.
    /** @type {any[]} */
    const allJobs = [];
    /** @type {string[]} */
    const needsFallback = [];
    for (const { slug, json } of apiResults) {
      const jobs = parseApiResponse(json, slug);
      for (const j of jobs) allJobs.push(j);
      if (jobs.length === 0 && SITEMAP_SLUG_TO_DIR[slug]) {
        needsFallback.push(slug);
      }
    }

    // 3. Sitemap fallback for zero-return cats that overlap our 6 sitemap dirs.
    if (needsFallback.length > 0) {
      const fallbackDirs = needsFallback.map((slug) => SITEMAP_SLUG_TO_DIR[slug]);
      const perDir = await mapWithConcurrency(fallbackDirs, Math.min(3, fallbackDirs.length), (dir) =>
        fetchSitemapDir(ctx, dir),
      );
      for (const jobs of perDir) {
        for (const j of jobs) allJobs.push(j);
      }
    }

    // 4. Dedupe by url (last write wins — preserves API rows when both paths
    //    surface the same job via the synthesized jobright URL).
    const seen = new Map();
    for (const j of allJobs) {
      if (j && j.url) seen.set(j.url, j);
    }
    return Array.from(seen.values());
  },
};
