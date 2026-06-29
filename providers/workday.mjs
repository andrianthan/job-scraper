// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Workday provider — hits the public CXS jobs endpoint (POST, paginated).
// Auto-detects from careers_url pattern
// `https://<tenant>.<instance>.myworkdayjobs.com[/<locale>]/<site>`,
// e.g. https://23andme.wd5.myworkdayjobs.com/23 →
//      POST https://23andme.wd5.myworkdayjobs.com/wday/cxs/23andme/23/jobs
//
// Workday only exposes a relative "postedOn" label ("Posted Today",
// "Posted 5 Days Ago", "Posted 30+ Days Ago"); postedAt is derived from it
// and omitted for the unbounded "30+ Days Ago" form.

const PAGE_SIZE = 20;
const MAX_PAGES = 50; // safety cap — at most 1000 postings per site

function resolveEndpoint(entry) {
  const url = entry.careers_url || '';
  const m = url.match(/^https:\/\/([\w-]+)\.(wd[\w-]*)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/);
  if (!m) return null;
  const [, tenant, instance, site] = m;
  const origin = `https://${tenant}.${instance}.myworkdayjobs.com`;
  return {
    api: `${origin}/wday/cxs/${tenant}/${site}/jobs`,
    // externalPath is relative to the site, not the host root — without the
    // site segment the URL 404s.
    jobBase: `${origin}/${site}`,
  };
}

function parsePostedOn(label) {
  if (!label) return undefined;
  if (/posted\s+today/i.test(label)) return Date.now();
  if (/posted\s+yesterday/i.test(label)) return Date.now() - 86_400_000;
  const m = label.match(/posted\s+(\d+)(\+?)\s*day/i);
  if (!m) return undefined;
  // "30+ Days Ago" is a lower bound (at least N days old). Stamp it AS N days
  // old rather than undefined — otherwise the freshness gate's "no date → pass"
  // rule lets stale reposts through. N days old correctly fails a tight window.
  return Date.now() - Number(m[1]) * 86_400_000;
}

/** @type {Provider} */
export default {
  id: 'workday',

  detect(entry) {
    const ep = resolveEndpoint(entry);
    return ep ? { url: ep.api } : null;
  },

  async fetch(entry, ctx) {
    const ep = resolveEndpoint(entry);
    if (!ep) throw new Error(`workday: cannot derive CXS endpoint for ${entry.name}`);

    const jobs = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = JSON.stringify({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        // Optional server-side narrowing. Big boards (PwC 4k+, Walmart 2k+) would
        // otherwise hit the MAX_PAGES cap and truncate before intern roles are
        // reached — set entry.query (e.g. 'intern') to filter at the source.
        // Leave unset for finance boards that name internships "Summer Analyst".
        searchText: entry.query || '',
        appliedFacets: {},
      });
      const json = await ctx.fetchJson(ep.api, {
        method: 'POST',
        redirect: 'error',
        body,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
      });
      const postings = Array.isArray(json?.jobPostings) ? json.jobPostings : [];
      for (const j of postings) {
        if (!j.externalPath) continue;
        jobs.push({
          title: j.title || '',
          url: ep.jobBase + j.externalPath,
          company: entry.name,
          location: j.locationsText || '',
          postedAt: parsePostedOn(j.postedOn),
        });
      }
      if (postings.length < PAGE_SIZE) break;
    }
    return jobs;
  },
};
