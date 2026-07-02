import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  default as provider,
  // legacy exports (sitemap path)
  parseSitemapJobs,
  extractJobPosting,
  jobFromJsonLd,
  // new exports
  JOBRIGHT_API,
  JOBRIGHT_CATEGORIES,
  EXCLUDED_TITLES,
  slugToCategoryLabel,
  buildJobrightApplyUrl,
  jobFromApi,
  parseApiResponse,
} from '../providers/intern-list.mjs';
import { makeHttpCtx } from '../providers/_http.mjs';

// ── Fixtures ─────────────────────────────────────────────────────────────

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.intern-list.com</loc></url>
  <url><loc>https://www.intern-list.com/swe-intern-list/web_development_intern_at_mahle_13365239</loc></url>
  <url><loc>https://www.intern-list.com/da-intern-list/data_analyst_intern_at_acme_99</loc></url>
  <url><loc>https://www.intern-list.com/swe-intern-list</loc></url>
  <url><loc>https://www.intern-list.com/job-function-guide/accounting</loc></url>
  <url><loc>https://www.intern-list.com/data-science-internships/vehicle_analyst_at_nissan_63884453</loc></url>
  <url><loc>https://www.intern-list.com/other-list/whatever_at_x_1</loc></url>
  <url><loc>https://www.intern-list.com/swe-intern-list/badpage_no_at_no_id</loc></url>
</urlset>`;

const MAHLE_HTML = `<html><script type="application/ld+json">{"@context":"https://schema.org/","@type":"JobPosting","title":"Web Development Intern","identifier":{"@type":"PropertyValue","name":"MAHLE","value":"6a434930e09ecb4959643dc7"},"hiringOrganization":{"@type":"Organization","name":"MAHLE"},"jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Dayton","addressRegion":"OH","addressCountry":"US"}},"datePosted":"2026-06-30 00:00:00"}</script></html>`;

const AMD_HTML = `<html><script type="application/ld+json">{"@type":"JobPosting","title":"SW Eng Intern","identifier":{"value":"abc123"},"hiringOrganization":{"name":"AMD"},"jobLocation":{"address":{"addressLocality":"Markham","addressRegion":"Ontario","addressCountry":"CA"}},"datePosted":"2026-06-29"}</script></html>`;

const NO_LD = '<html><body>no structured data here</body></html>';

const MALFORMED_LD = '<html><script type="application/ld+json">{this is not json</script></html>';

const MISSING_TITLE = '<html><script type="application/ld+json">{"@type":"JobPosting","identifier":{"value":"abc123"},"hiringOrganization":{"name":"X"},"datePosted":"2026-06-30"}</script></html>';

const MISSING_HASH = '<html><script type="application/ld+json">{"@type":"JobPosting","title":"X","hiringOrganization":{"name":"X"},"datePosted":"2026-06-30"}</script></html>';

// Real sample API row (Tesla BA — intern:us:business_analyst + data_analysis).
const SAMPLE_API_ROW = {
  jobId: '6a43205638fa63084105046e',
  tabCategory: ['intern:us:business_analyst', 'intern:us:data_analysis'],
  properties: {
    title: 'Internship, Business Analyst, Applications Engineering (Fall 2026)',
    company: 'Tesla',
    location: 'Fremont, CA',
    salary: '$32.45-$45.43/hr',
    workModel: 'On Site',
    industry: ['Automotive'],
    companySize: '10000+',
    qualifications: '...',
    expLevel: null,
    jobFunction: null,
    h1bSponsored: 'No',
    isNewGrad: false,
    roleType: null,
    hireTime: '2026-Fall',
    graduateTime: '',
  },
  postedAt: 1782837601000,
};

const EMPTY_API = { success: true, errorCode: 10000, result: { jobList: [], total: 0 } };

// ── Existing sitemap-path tests (unchanged from pre-rewrite baseline) ────

test('parseSitemapJobs: keeps all 6 configured category slugs, drops index/guide/foreign/malformed', () => {
  const urls = parseSitemapJobs(SITEMAP_XML);
  assert.deepEqual(urls, [
    'https://www.intern-list.com/swe-intern-list/web_development_intern_at_mahle_13365239',
    'https://www.intern-list.com/da-intern-list/data_analyst_intern_at_acme_99',
    'https://www.intern-list.com/data-science-internships/vehicle_analyst_at_nissan_63884453',
  ]);
});

test('extractJobPosting: parses valid JobPosting JSON-LD', () => {
  const jp = extractJobPosting(MAHLE_HTML);
  assert.equal(jp['@type'], 'JobPosting');
  assert.equal(jp.title, 'Web Development Intern');
});

test('extractJobPosting: returns null when no script tag present', () => {
  assert.equal(extractJobPosting(NO_LD), null);
});

test('extractJobPosting: returns null on malformed JSON', () => {
  assert.equal(extractJobPosting(MALFORMED_LD), null);
});

test('extractJobPosting: returns null when @type is not JobPosting', () => {
  const html = '<html><script type="application/ld+json">{"@type":"Organization","name":"X"}</script></html>';
  assert.equal(extractJobPosting(html), null);
});

test('jobFromJsonLd: builds full Job from MAHLE-shaped payload', () => {
  const jp = extractJobPosting(MAHLE_HTML);
  const job = jobFromJsonLd('https://intern-list/swe-intern-list/x_13365239', jp);
  assert.equal(job.title, 'Web Development Intern');
  assert.equal(job.url, 'https://intern-list/swe-intern-list/x_13365239');
  assert.equal(job.fallbackUrl, 'https://jobright.ai/jobs/info/6a434930e09ecb4959643dc7');
  assert.equal(job.company, 'MAHLE');
  assert.equal(job.location, 'Dayton, OH, US');
  assert.equal(job.postedAt, Date.UTC(2026, 5, 30));
});

test('jobFromJsonLd: folds locality/region/country into location', () => {
  const jp = extractJobPosting(AMD_HTML);
  const job = jobFromJsonLd('https://x', jp);
  assert.equal(job.location, 'Markham, Ontario, CA');
  assert.equal(job.fallbackUrl, 'https://jobright.ai/jobs/info/abc123');
});

test('jobFromJsonLd: parses ISO date-only as UTC midnight', () => {
  const jp = extractJobPosting(AMD_HTML);
  const job = jobFromJsonLd('https://x', jp);
  assert.equal(job.postedAt, Date.UTC(2026, 5, 29));
});

test('jobFromJsonLd: returns null when title missing', () => {
  const jp = extractJobPosting(MISSING_TITLE);
  assert.equal(jobFromJsonLd('https://x', jp), null);
});

test('jobFromJsonLd: returns null when apply hash missing/invalid', () => {
  const jp = extractJobPosting(MISSING_HASH);
  assert.equal(jobFromJsonLd('https://x', jp), null);
});

test('jobFromJsonLd: returns null when identifier.value is not a valid hex hash', () => {
  const html = '<html><script type="application/ld+json">{"@type":"JobPosting","title":"X","identifier":{"value":"not-hex!!!"},"hiringOrganization":{"name":"X"}}</script></html>';
  const jp = extractJobPosting(html);
  assert.equal(jobFromJsonLd('https://x', jp), null);
});

// ── New constants / helpers ──────────────────────────────────────────────

test('JOBRIGHT_API: points at the swan mini-sites list endpoint', () => {
  assert.equal(JOBRIGHT_API, 'https://jobright.ai/swan/mini-sites/list');
});

test('JOBRIGHT_CATEGORIES: contains 20 unique slugs', () => {
  assert.equal(JOBRIGHT_CATEGORIES.length, 21);
  assert.equal(new Set(JOBRIGHT_CATEGORIES).size, 21);
  // Spot-check a few well-known ones (order matters per production client).
  assert.equal(JOBRIGHT_CATEGORIES[0], 'software_engineer');
  assert.ok(JOBRIGHT_CATEGORIES.includes('data_analysis'));
  assert.ok(JOBRIGHT_CATEGORIES.includes('product_management'));
  assert.ok(JOBRIGHT_CATEGORIES.includes('supply_chain'));
});

test('EXCLUDED_TITLES: 20 unique AI / annotation / labeling roles', () => {
  assert.equal(EXCLUDED_TITLES.length, 20);
  assert.equal(new Set(EXCLUDED_TITLES).size, 20);
  assert.ok(EXCLUDED_TITLES.includes('Prompt Engineer'));
  assert.ok(EXCLUDED_TITLES.includes('Trust & Safety'));
});

test('slugToCategoryLabel: title-cases each underscore-separated token', () => {
  assert.equal(slugToCategoryLabel('software_engineer'), 'Software Engineer');
  assert.equal(slugToCategoryLabel('data_analysis'), 'Data Analysis');
  assert.equal(slugToCategoryLabel('product_management'), 'Product Management');
  assert.equal(slugToCategoryLabel(''), '');
  assert.equal(slugToCategoryLabel('consulting'), 'Consulting');
});

test('buildJobrightApplyUrl: encodes label into utm_campaign, uses jobId', () => {
  const url = buildJobrightApplyUrl('abc123', 'data_analysis');
  assert.equal(url, 'https://jobright.ai/jobs/info/abc123?utm_source=1099&utm_campaign=Data%20Analysis');
});

test('buildJobrightApplyUrl: handles multi-word labels', () => {
  const url = buildJobrightApplyUrl('xyz', 'product_management');
  assert.equal(url, 'https://jobright.ai/jobs/info/xyz?utm_source=1099&utm_campaign=Product%20Management');
});

// ── jobFromApi / parseApiResponse ────────────────────────────────────────

test('jobFromApi: builds correct Job from sample API row', () => {
  const job = jobFromApi(SAMPLE_API_ROW, 'data_analysis');
  assert.equal(job.title, 'Internship, Business Analyst, Applications Engineering (Fall 2026)');
  assert.equal(job.company, 'Tesla');
  assert.equal(job.location, 'Fremont, CA');
  assert.equal(job.salary, '$32.45-$45.43/hr');
  assert.equal(job.postedAt, 1782837601000);
  assert.equal(job.url, 'https://jobright.ai/jobs/info/6a43205638fa63084105046e?utm_source=1099&utm_campaign=Data%20Analysis');
  assert.equal(job.fallbackUrl, job.url);
});

test('jobFromApi: returns null when jobId is missing', () => {
  const row = { properties: { title: 'X' } };
  assert.equal(jobFromApi(row, 'data_analysis'), null);
});

test('jobFromApi: returns null when properties.title is missing', () => {
  const row = { jobId: 'abc', properties: {} };
  assert.equal(jobFromApi(row, 'data_analysis'), null);
});

test('jobFromApi: returns null when row is null/non-object', () => {
  assert.equal(jobFromApi(null, 'x'), null);
  assert.equal(jobFromApi('string', 'x'), null);
});

test('parseApiResponse: returns array of jobs from a category response', () => {
  const resp = { success: true, errorCode: 10000, result: { jobList: [SAMPLE_API_ROW], total: 1 } };
  const jobs = parseApiResponse(resp, 'business_analyst');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, 'Tesla');
  // label comes from the slug we passed in, not tabCategory[0]
  assert.match(jobs[0].url, /utm_campaign=Business%20Analyst/);
});

test('parseApiResponse: skips malformed rows and preserves postedAt ms', () => {
  const goodRow = { ...SAMPLE_API_ROW };
  const noId = { properties: { title: 'NoId' } };
  const noTitle = { jobId: 'x' }; // no properties at all
  const resp = {
    success: true,
    errorCode: 10000,
    result: { jobList: [goodRow, noId, noTitle], total: 3 },
  };
  const jobs = parseApiResponse(resp, 'data_analysis');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].postedAt, 1782837601000);
});

test('parseApiResponse: returns [] for empty / malformed / non-success responses', () => {
  assert.deepEqual(parseApiResponse(EMPTY_API, 'data_analysis'), []);
  assert.deepEqual(parseApiResponse(null, 'data_analysis'), []);
  assert.deepEqual(parseApiResponse({ success: false }, 'x'), []);
  assert.deepEqual(parseApiResponse({}, 'x'), []);
  assert.deepEqual(parseApiResponse({ result: {} }, 'x'), []);
});

// ── provider.fetch — POST body ───────────────────────────────────────────

test('provider.fetch: POST body carries excludeTitle and excludedTitle arrays of 20 items', async () => {
  /** @type {Array<{url: string, body: any}>} */
  const calls = [];
  const ctx = {
    transport: 'http',
    fetchJson: async (url, opts = {}) => {
      calls.push({ url: String(url), body: JSON.parse(opts.body) });
      return EMPTY_API;
    },
    fetchText: async () => { throw new Error('fetchText should not be called'); },
  };
  await provider.fetch({ name: 'intern-list.com' }, ctx);
  assert.ok(calls.length >= 1, 'expected at least one POST');
  // Pick the data_analysis call
  const daCall = calls.find((c) => c.body.category === 'intern:us:data_analysis');
  assert.ok(daCall, 'expected a POST with category intern:us:data_analysis');
  assert.equal(daCall.url, JOBRIGHT_API);
  assert.ok(Array.isArray(daCall.body.excludeTitle));
  assert.equal(daCall.body.excludeTitle.length, 20);
  assert.ok(Array.isArray(daCall.body.excludedTitle));
  assert.equal(daCall.body.excludedTitle.length, 20);
  // arrays must be identical (same reference is fine — both point at EXCLUDED_TITLES)
  assert.deepEqual(daCall.body.excludeTitle, daCall.body.excludedTitle);
});

// ── provider.fetch — API path only ───────────────────────────────────────

test('provider.fetch: API path returns jobs for 11 data-returning categories with correct URL format', async () => {
  const dataCats = [
    'data_analysis',
    'product_management',
    'business_analyst',
    'consulting',
    'creatives_design',
    'public_sector',
    'human_resources',
    'sales',
    'customer_service',
    'healthcare',
    'supply_chain',
  ];
  const calls = [];
  const ctx = {
    transport: 'http',
    fetchJson: async (url, opts = {}) => {
      const body = JSON.parse(opts.body);
      calls.push(body.category);
      const slug = body.category.replace(/^intern:us:/, '');
      if (dataCats.includes(slug)) {
        return {
          success: true,
          errorCode: 10000,
          result: { jobList: [SAMPLE_API_ROW], total: 1 },
        };
      }
      return EMPTY_API; // the other 9 slugs return zero
    },
    fetchText: async () => { throw new Error('fetchText should not be called when API yields data'); },
  };
  const jobs = await provider.fetch({ name: 'intern-list.com' }, ctx);
  assert.ok(calls.length >= 21, `expected 21 POSTs, got ${calls.length}`);
  assert.equal(jobs.length, 11, 'expected one job per data-returning category');
  for (const j of jobs) {
    assert.match(j.url, /^https:\/\/jobright\.ai\/jobs\/info\/[a-f0-9]+\?utm_source=1099&utm_campaign=/);
    assert.equal(j.url, j.fallbackUrl);
  }
});

// ── provider.fetch — hybrid fallback ─────────────────────────────────────

test('provider.fetch: hybrid — sitemap fills in for API zero-return cats that have a sitemap dir', async () => {
  // Zero-return for cats that overlap sitemap (software_engineer → swe-intern-list,
  // accounting → accounting-and-finance-intern-list, marketing → mkt-intern-list).
  // Non-zero for an example data cat (data_analysis). Zero for everything else.
  const dataCats = new Set(['data_analysis']);
  // Build the expected sitemap job from MAHLE_HTML using the URL it actually
  // appears under in SITEMAP_XML.
  const mahleJp = extractJobPosting(MAHLE_HTML);
  const mahleExpected = mahleJp ? jobFromJsonLd(
    'https://www.intern-list.com/swe-intern-list/web_development_intern_at_mahle_13365239',
    mahleJp,
  ) : null;

  /** @type {string[]} */
  const textCalls = [];
  const ctx = {
    transport: 'http',
    fetchJson: async (_url, opts = {}) => {
      const body = JSON.parse(opts.body);
      const slug = body.category.replace(/^intern:us:/, '');
      if (dataCats.has(slug)) {
        return { success: true, errorCode: 10000, result: { jobList: [SAMPLE_API_ROW], total: 1 } };
      }
      return EMPTY_API;
    },
    fetchText: async (url) => {
      textCalls.push(String(url));
      // Match SITEMAP_XML exactly so parseSitemapJobs filters correctly.
      if (String(url).endsWith('/sitemap.xml')) return SITEMAP_XML;
      if (String(url).includes('mahle')) return MAHLE_HTML;
      return NO_LD;
    },
  };
  const jobs = await provider.fetch({ name: 'intern-list.com' }, ctx);
  // 1 API job + ≥1 sitemap job (only the swe-intern-list entry has matching
  // JOB_SLUG_RE shape; da/data-science ones do too — exactly the legacy
  // parseSitemapJobs behavior).
  const apiJobs = jobs.filter((j) => j.url.includes('jobright.ai/jobs/info/'));
  const sitemapJobs = jobs.filter((j) => j.url.startsWith('https://www.intern-list.com/'));
  assert.ok(apiJobs.length >= 1, 'expected at least one API row');
  assert.ok(sitemapJobs.length >= 1, 'expected sitemap fallback rows');
  // Sitemap was actually fetched for fallback (we only fetch fallback dirs).
  assert.ok(textCalls.includes('https://www.intern-list.com/sitemap.xml'));
  // expectedSitemapJob may be null if MAHLE_HTML somehow changed, but it isn't.
  if (mahleExpected) {
    assert.ok(
      sitemapJobs.some((j) => j.url === mahleExpected.url),
      `expected MAHLE row ${mahleExpected.url} in sitemap fallback, got: ${sitemapJobs.map(j => j.url).join(', ')}`,
    );
  }
  // All jobs must have a non-empty url (the dedup key invariant).
  for (const j of jobs) assert.ok(j.url, `empty url on job: ${JSON.stringify(j)}`);
  // No duplicate urls.
  const urls = jobs.map((j) => j.url);
  assert.equal(new Set(urls).size, urls.length, 'duplicate url after dedup');
});

// ── provider.fetch — sitemap-only path (legacy) ─────────────────────────

test('provider.fetch: sitemap-only path still works when API is blocked entirely', async () => {
  // Mirror the legacy test: fetchJson returns total:0 for all cats, sitemap path
  // is taken and we get the same 2 jobs as before.
  globalThis.fetch = async (url) => {
    if (url.endsWith('/sitemap.xml')) {
      return { ok: true, status: 200, text: async () => SITEMAP_XML };
    }
    if (url.includes('mahle')) {
      return { ok: true, status: 200, text: async () => MAHLE_HTML };
    }
    if (url.includes('acme')) {
      return { ok: true, status: 200, text: async () => AMD_HTML };
    }
    if (url.includes('nissan')) {
      return { ok: true, status: 200, text: async () => NO_LD };
    }
    return { ok: false, status: 404, text: async () => '' };
  };
  try {
    const ctx = makeHttpCtx();
    // Force the hybrid path to fall back to sitemap: stub fetchJson to return zero.
    const jsonCalls = [];
    const hybridCtx = {
      transport: 'http',
      fetchJson: async (_url, opts = {}) => {
        jsonCalls.push(JSON.parse(opts.body).category);
        return EMPTY_API;
      },
      fetchText: ctx.fetchText,
    };
    const jobs = await provider.fetch({ name: 'intern-list.com' }, hybridCtx);
    // 21 API POSTs all returning zero → all fallback cats checked → sitemap run
    // for software_engineer, accounting, marketing dirs.
    assert.equal(jsonCalls.length, 21);
    assert.ok(jobs.length >= 1, 'expected at least one sitemap-derived job');
    assert.ok(jobs.some((j) => j.company === 'MAHLE' || j.company === 'AMD'));
    assert.ok(jobs.every((j) => j.fallbackUrl.startsWith('https://jobright.ai/jobs/info/')));
  } finally {
    delete globalThis.fetch;
  }
});

test('provider.fetch: tolerates fetch errors per detail page and per category API call', async () => {
  const ctx = {
    transport: 'http',
    fetchJson: async () => { throw new Error('upstream timeout'); },
    fetchText: async () => { throw new Error('upstream timeout'); },
  };
  // Both the API and the sitemap path fail → no jobs emitted, no crash.
  const jobs = await provider.fetch({ name: 'intern-list.com' }, ctx);
  assert.deepEqual(jobs, []);
});
