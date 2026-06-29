// @ts-check
// Simplify provider — ingests the community-maintained SimplifyJobs internship
// list (a public GitHub JSON of ~15k listings, the feed many aggregators like
// intern-list.com pull from). Structured + dated, so it pairs perfectly with the
// freshness filter: each entry carries date_posted, which becomes job.postedAt.
//
// Auto-detected on raw.githubusercontent.com/SimplifyJobs/... URLs, or opt-in
// via provider: 'simplify'. No API key needed.

const SIMPLIFY_HOST = 'raw.githubusercontent.com';

/** @param {import('./_types.js').PortalEntry} entry */
function isSimplify(entry) {
  const u = entry.careers_url || '';
  try {
    const p = new URL(u);
    return p.hostname === SIMPLIFY_HOST && /SimplifyJobs/i.test(p.pathname);
  } catch { return false; }
}

/** @type {import('./_types.js').Provider} */
export default {
  id: 'simplify',

  detect(entry) {
    return isSimplify(entry) ? { url: entry.careers_url } : null;
  },

  async fetch(entry, ctx) {
    const json = /** @type {any} */ (await ctx.fetchJson(entry.careers_url, { redirect: 'error' }));
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
