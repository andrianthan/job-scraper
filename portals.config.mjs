// Portal scanner config — finance / business / HR internships for underclassmen.
//
// Lifted from career-ops's portals.yml schema, rewritten as a JS module so we
// need zero YAML-parser dependency. Edit freely.
//
// Each tracked_company is auto-routed to a providers/*.mjs by detect() on its
// careers_url, OR force one with `provider: 'greenhouse'`.
//
// SLUG WARNING: company ATS slugs drift (companies switch ATS, rename boards).
// Run `node verify-slugs.mjs` after editing to drop dead boards before relying
// on this list. Treat the set below as a STARTER, not verified-live.

export default {
  // -- Title filter --
  // GATE on the intern/underclassman signal: a title must contain at least one
  // of `positive` (all are intern markers) AND zero `negative`. Function-only
  // titles ("Risk Management Lead") correctly fall out — no intern keyword.
  // To target a function, pair it with a marker in the title, e.g. the listing
  // itself says "Investment Banking Summer Analyst" → matches "Summer Analyst".
  titleFilter: {
    positive: [
      'Intern', 'Internship', 'Summer Analyst', 'Summer Associate', 'Co-op', 'Co op',
      // underclassman signal (the unmet-demand niche)
      'Sophomore', 'Freshman', 'First-Year', 'First Year',
      'Spring Week', 'Insight Program', 'Insight Day', 'Early Identification',
      'Early Insight', 'Discovery Program', 'Rising Sophomore', 'Rising Junior',
      'Scholars Program', 'Fellowship', 'Apprentice',
    ],
    // any negative present → drop, even if a positive matched.
    // NOTE: engineering terms (Engineer/Developer/Software/Data Scientist) are
    // intentionally NOT excluded — tech/data internships are in scope and route
    // to #tech-data-internships. Only seniority/experience markers are blocked.
    negative: [
      'Senior', 'Staff', 'Principal', 'Manager', 'Director', 'VP',
      'Vice President', 'Head of',
      'PhD', 'Experienced', '5+ years', '10+ years', 'Full Time' /* kill non-intern FT */,
    ],
  },

  // -- Location filter (optional). Empty location always passes. --
  locationFilter: {
    alwaysAllow: ['United States', 'New York', 'Remote'],
    allow: ['United States', 'USA', 'US', 'Remote', 'New York', 'Chicago',
            'San Francisco', 'Boston', 'Charlotte', 'Atlanta', 'Dallas', 'Los Angeles'],
    block: ['India', 'United Kingdom', 'London', 'Singapore', 'Germany', 'Hong Kong'],
  },

  // -- Companies. STARTER set — verify slugs before trusting. --
  // Greenhouse/Lever/Ashby = free JSON APIs (preferred). Many banks use Workday
  // (slower, sometimes auth-walled) — add via providers/workday.mjs if needed.
  trackedCompanies: [
    // ── Fintech (mostly Greenhouse/Ashby, hire business + finance interns) ──
    { name: 'Ramp',       careers_url: 'https://jobs.ashbyhq.com/ramp' },
    { name: 'Brex',       careers_url: 'https://job-boards.greenhouse.io/brex' },
    { name: 'Plaid',      careers_url: 'https://jobs.ashbyhq.com/plaid' }, // Ashby (verified 107); GH slug is dead
    { name: 'Stripe',     careers_url: 'https://stripe.com/jobs', provider: 'greenhouse',
      api: 'https://boards-api.greenhouse.io/v1/boards/stripe/jobs' },
    { name: 'Robinhood',  careers_url: 'https://job-boards.greenhouse.io/robinhood' },
    { name: 'Coinbase',   careers_url: 'https://job-boards.greenhouse.io/coinbase' },
    { name: 'Affirm',     careers_url: 'https://job-boards.greenhouse.io/affirm' },
    { name: 'Chime',      careers_url: 'https://job-boards.greenhouse.io/chime' },
    { name: 'Marqeta',    careers_url: 'https://job-boards.greenhouse.io/marqeta' },
    { name: 'SoFi',       careers_url: 'https://job-boards.greenhouse.io/sofi' },

    // ── Asset mgmt / trading firms that run structured intern programs ──
    { name: 'Jane Street',  careers_url: 'https://job-boards.greenhouse.io/janestreet' },
    { name: 'Bridgewater',  careers_url: 'https://job-boards.greenhouse.io/bridgewater89' }, // verified 23

    // ── Big banks on Workday (verified public CXS feeds) ──
    { name: 'Morgan Stanley', careers_url: 'https://ms.wd5.myworkdayjobs.com/External' },   // verified 1348
    { name: 'Citi',           careers_url: 'https://citi.wd5.myworkdayjobs.com/2' },        // verified 2000

    // ── Consulting / corporate (business/HR/strategy interns) ──
    { name: 'DoorDash',   careers_url: 'https://job-boards.greenhouse.io/doordashusa' }, // verified 443
    { name: 'Airbnb',     careers_url: 'https://job-boards.greenhouse.io/airbnb' },

    // ── Expansion batch (STARTER slugs — run `node verify-slugs.mjs` to prune dead boards) ──
    // Tech / data / product / business interns on Greenhouse
    { name: 'Anthropic',   careers_url: 'https://job-boards.greenhouse.io/anthropic' },
    { name: 'Databricks',  careers_url: 'https://job-boards.greenhouse.io/databricks' },
    { name: 'Figma',       careers_url: 'https://job-boards.greenhouse.io/figma' },
    { name: 'Reddit',      careers_url: 'https://job-boards.greenhouse.io/reddit' },
    { name: 'Instacart',   careers_url: 'https://job-boards.greenhouse.io/instacart' },
    { name: 'Gusto',       careers_url: 'https://job-boards.greenhouse.io/gusto' },
    { name: 'Samsara',     careers_url: 'https://job-boards.greenhouse.io/samsara' },
    { name: 'Point72',     careers_url: 'https://job-boards.greenhouse.io/point72' },
    { name: 'Scale AI',    careers_url: 'https://job-boards.greenhouse.io/scaleai' },
    { name: 'Discord',     careers_url: 'https://job-boards.greenhouse.io/discord' },
    { name: 'Pinterest',   careers_url: 'https://job-boards.greenhouse.io/pinterest' },
    { name: 'Flexport',    careers_url: 'https://job-boards.greenhouse.io/flexport' },
    // Ashby
    { name: 'Linear',      careers_url: 'https://jobs.ashbyhq.com/linear' },
    { name: 'Vanta',       careers_url: 'https://jobs.ashbyhq.com/vanta' },
    { name: 'OpenAI',      careers_url: 'https://jobs.ashbyhq.com/openai' },
    { name: 'Mercury',     careers_url: 'https://jobs.ashbyhq.com/mercury' },
    { name: 'Notion',      careers_url: 'https://jobs.ashbyhq.com/notion' },

    // ── NO PUBLIC ATS — scraped via Firecrawl (provider: 'firecrawl' → scrape + LLM extract). ──
    // Verified scrapeable (Firecrawl renders JS). Best-effort; verify output periodically.
    { name: 'McKinsey',           careers_url: 'https://www.mckinsey.com/careers/search-jobs',
      provider: 'firecrawl' }, // verified: extracts Business Analyst / Associate / Fellow intern roles
    { name: 'Citadel',            careers_url: 'https://www.citadel.com/careers/open-opportunities/',
      provider: 'firecrawl' },
    { name: 'Citadel Securities', careers_url: 'https://www.citadelsecurities.com/careers/open-opportunities/',
      provider: 'firecrawl' },
    { name: 'Two Sigma',          careers_url: 'https://careers.twosigma.com/careers/OpenRoles',
      provider: 'firecrawl' },

    // ── Login/auth-walled (Avature, Oracle) — Firecrawl can't reach listings. Disabled. ──
    { name: 'Goldman Sachs',      careers_url: 'https://higher.gs.com/', enabled: false,
      notes: 'Avature "Higher" platform — auth-walled; needs a dedicated Avature provider.' },
    { name: 'JPMorgan Chase',     careers_url: 'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001', enabled: false,
      notes: 'Oracle Recruiting Cloud — has REST (recruitingCEJobRequisitions) but needs an Oracle provider.' },
  ],
};
