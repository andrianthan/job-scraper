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
    // ── Community aggregate feed (SimplifyJobs ~15k listings, structured + dated) ──
    // The open-source list aggregators like intern-list.com pull from. Auto-detected
    // by providers/simplify.mjs. Freshness filter + dedup keep it to new postings.
    { name: 'SimplifyJobs', careers_url: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json' },

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

    // ── Expansion batch — all endpoints live-verified to return jobs. ──
    // Greenhouse
    { name: 'Datadog',              careers_url: 'https://job-boards.greenhouse.io/datadog', provider: 'greenhouse' },
    { name: 'General Atlantic',     careers_url: 'https://job-boards.greenhouse.io/generalatlantic', provider: 'greenhouse' },
    { name: 'Lincoln International', careers_url: 'https://job-boards.greenhouse.io/lincolninternational', provider: 'greenhouse' },
    { name: 'William Blair',        careers_url: 'https://job-boards.greenhouse.io/williamblair', provider: 'greenhouse' },
    { name: 'HubSpot',              careers_url: 'https://job-boards.greenhouse.io/hubspotjobs', provider: 'greenhouse' },
    { name: 'TPG',                  careers_url: 'https://job-boards.greenhouse.io/tpgcareers', provider: 'greenhouse' },
    { name: 'Warburg Pincus',       careers_url: 'https://job-boards.greenhouse.io/warburgpincusllc', provider: 'greenhouse' },
    // Ashby / Lever / SmartRecruiters
    { name: 'Snowflake',            careers_url: 'https://jobs.ashbyhq.com/snowflake', provider: 'ashby' },
    { name: 'Palantir',             careers_url: 'https://jobs.lever.co/palantir', provider: 'lever' },
    { name: 'ServiceNow',           careers_url: 'https://careers.smartrecruiters.com/servicenow', provider: 'smartrecruiters' },
    // Workday — finance/PE boutiques (no query: internships named "Summer Analyst")
    { name: 'Blackstone',           careers_url: 'https://blackstone.wd1.myworkdayjobs.com/Blackstone_Campus_Careers', provider: 'workday' },
    { name: 'Apollo Global Management', careers_url: 'https://athene.wd5.myworkdayjobs.com/Apollo_Careers', provider: 'workday' },
    { name: 'Bain Capital',         careers_url: 'https://baincapital.wd1.myworkdayjobs.com/External_Private', provider: 'workday' },
    { name: 'BlackRock',            careers_url: 'https://blackrock.wd1.myworkdayjobs.com/BlackRock_Professional', provider: 'workday' },
    { name: 'Houlihan Lokey',       careers_url: 'https://hl.wd1.myworkdayjobs.com/Corporate', provider: 'workday' },
    { name: 'Moelis & Company',     careers_url: 'https://moelis.wd1.myworkdayjobs.com/Experienced-Hires', provider: 'workday' },
    { name: 'PJT Partners',         careers_url: 'https://pjtpartners.wd1.myworkdayjobs.com/Careers', provider: 'workday' },
    { name: 'Guggenheim Partners',  careers_url: 'https://guggenheim.wd1.myworkdayjobs.com/Guggenheim_Careers', provider: 'workday' },
    // Workday — tech/CPG/logistics (query:'intern' caps volume so mega boards don't truncate)
    { name: 'Workday',              careers_url: 'https://workday.wd5.myworkdayjobs.com/Workday', provider: 'workday', query: 'intern' },
    { name: 'Salesforce',           careers_url: 'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site', provider: 'workday', query: 'intern' },
    { name: 'Adobe',                careers_url: 'https://adobe.wd5.myworkdayjobs.com/external_experienced', provider: 'workday', query: 'intern' },
    { name: 'PwC',                  careers_url: 'https://pwc.wd3.myworkdayjobs.com/Global_Experienced_Careers', provider: 'workday', query: 'intern' },
    { name: 'RSM US',               careers_url: 'https://rsm.wd1.myworkdayjobs.com/RSMCareers', provider: 'workday', query: 'intern' },
    { name: 'Procter & Gamble',     careers_url: 'https://pg.wd5.myworkdayjobs.com/1000', provider: 'workday', query: 'intern' },
    { name: 'Unilever',             careers_url: 'https://unilever.wd3.myworkdayjobs.com/Unilever_Experienced_Professionals', provider: 'workday', query: 'intern' },
    { name: 'PepsiCo',              careers_url: 'https://pbv.wd503.myworkdayjobs.com/external', provider: 'workday', query: 'intern' },
    { name: 'Coca-Cola Company',    careers_url: 'https://coke.wd1.myworkdayjobs.com/coca-cola-careers', provider: 'workday', query: 'intern' },
    { name: 'Nike',                 careers_url: 'https://nike.wd1.myworkdayjobs.com/nke', provider: 'workday', query: 'intern' },
    { name: 'Mondelez International', careers_url: 'https://mdlz.wd3.myworkdayjobs.com/External', provider: 'workday', query: 'intern' },
    { name: 'Target',               careers_url: 'https://target.wd5.myworkdayjobs.com/targetcareers', provider: 'workday', query: 'intern' },
    { name: 'Walmart',              careers_url: 'https://walmart.wd504.myworkdayjobs.com/WalmartExternal', provider: 'workday', query: 'intern' },
    { name: 'UPS',                  careers_url: 'https://hcmportal.wd5.myworkdayjobs.com/Search', provider: 'workday', query: 'intern' },

    // ── JobSpy search sources — keyword-based broad sweep via python-jobspy sidecar. ──
    // Requires: pip install python-jobspy  (or sidecar/requirements.txt in CI).
    // Set JOBSPY_PYTHON env var if python3 is not on PATH.
    // LinkedIn is listed last per IP-safety convention; never list it alone.
    { name: 'Search — Finance Intern', careers_url: 'jobspy://search', provider: 'jobspy', enabled: true,
      api: { sites: ['indeed', 'google', 'linkedin'], term: 'finance internship', location: 'United States', resultsWanted: 25, hoursOld: 168 } },
    { name: 'Search — Consulting Intern', careers_url: 'jobspy://search', provider: 'jobspy', enabled: true,
      api: { sites: ['indeed', 'google'], term: 'consulting internship', location: 'United States', resultsWanted: 25, hoursOld: 168 } },
    { name: 'Search — Tech/Data Intern', careers_url: 'jobspy://search', provider: 'jobspy', enabled: true,
      api: { sites: ['indeed', 'google', 'linkedin'], term: 'data analyst internship', location: 'United States', resultsWanted: 25, hoursOld: 168 } },
  ],
};
