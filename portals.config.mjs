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
    // any negative present → drop, even if a positive matched
    negative: [
      'Senior', 'Staff', 'Principal', 'Manager', 'Director', 'VP',
      'Vice President', 'Head of', 'Engineer', 'Developer', 'Software', 'Data Scientist',
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

    // ── NO PUBLIC ATS — need Avature/Oracle providers (future phase). Disabled. ──
    { name: 'Goldman Sachs',      careers_url: 'https://higher.gs.com/', enabled: false,
      notes: 'Avature "Higher" platform — no GH/Lever/Ashby/Workday JSON. Needs Avature provider.' },
    { name: 'JPMorgan Chase',     careers_url: 'https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001', enabled: false,
      notes: 'Oracle Recruiting Cloud — has REST (recruitingCEJobRequisitions) but needs Oracle provider.' },
    { name: 'Citadel',            careers_url: 'https://www.citadel.com/careers/open-opportunities/', enabled: false,
      notes: 'Custom SSR site, no public ATS API.' },
    { name: 'Citadel Securities', careers_url: 'https://www.citadelsecurities.com/careers/open-opportunities/', enabled: false,
      notes: 'Custom SSR site, no public ATS API.' },
    { name: 'Two Sigma',          careers_url: 'https://careers.twosigma.com/careers/OpenRoles', enabled: false,
      notes: 'Avature — no public JSON board API.' },
    { name: 'McKinsey',           careers_url: 'https://www.mckinsey.com/careers/search-jobs', enabled: false,
      notes: 'Custom site, no supported ATS API.' },
  ],
};
