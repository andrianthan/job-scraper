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

  // -- Location filter (NA-only). Empty location passes (don't penalize missing data). --
  // Order in passesLocation(): block wins over allow (any non-NA country trumps US city).
  // NA allow list expanded to US + Canada + Mexico cities commonly posted as US-remote.
  locationFilter: {
    alwaysAllow: ['United States', 'USA', 'US', 'Canada', 'Mexico', 'Remote'],
    allow: ['United States', 'USA', 'US', 'U.S.', 'Canada', 'CA', 'Mexico', 'MX', 'Remote',
            // Major US hubs
            'New York', 'NY', 'San Francisco', 'SF', 'Bay Area', 'Chicago', 'Boston',
            'Charlotte', 'Atlanta', 'Dallas', 'Los Angeles', 'LA', 'Seattle', 'Austin',
            'Miami', 'Denver', 'Washington DC', 'DC', 'Philadelphia', 'Houston',
            'Minneapolis', 'Detroit', 'Phoenix', 'San Diego', 'Portland',
            // Canadian provinces (London, ON vs London, UK — Ontario wins)
            'Ontario', 'ON', 'Quebec', 'QC', 'British Columbia', 'BC', 'Alberta', 'AB',
            'Manitoba', 'MB', 'Saskatchewan', 'SK', 'Nova Scotia', 'NS', 'Toronto',
            'Vancouver', 'Montreal', 'Ottawa', 'Calgary', 'Edmonton'],
    block: [
      // Asia
      'India', 'Singapore', 'Hong Kong', 'China', 'Japan', 'Korea', 'Taiwan',
      'Philippines', 'Vietnam', 'Thailand', 'Malaysia', 'Indonesia', 'Pakistan',
      'Bangladesh', 'Sri Lanka', 'Nepal',
      // Europe (UK, EU, etc.)
      'United Kingdom', 'UK', 'England', 'Scotland', 'Wales', 'Ireland',
      'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Belgium', 'Switzerland',
      'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Portugal',
      'Greece', 'Czech', 'Romania', 'Hungary', 'Russia', 'Ukraine', 'Turkey',
      // Middle East / Africa
      'Israel', 'UAE', 'Dubai', 'Saudi Arabia', 'Qatar', 'Egypt', 'South Africa',
      'Nigeria', 'Kenya', 'Morocco',
      // Oceania
      'Australia', 'Sydney', 'Melbourne', 'New Zealand', 'Auckland',
      // Latin America (not Mexico)
      'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Costa Rica',
    ],
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

    // ── Expansion batch 2026-06-29 — 100+ live-verified boards across fintech/banks/AI/SaaS/CPG ──
    // All slugs verified via curl probe before addition. Unverified entries (e.g. Workday
    // tenants hit by global maintenance, custom-ATS companies) intentionally omitted.

    // ── Fintech (Ashby/Greenhouse/Lever/Workable — all live) ──
    { name: 'Antithesis',           careers_url: 'https://jobs.ashbyhq.com/antithesis',                 provider: 'ashby' },
    { name: 'Aven',                 careers_url: 'https://jobs.ashbyhq.com/aven',                       provider: 'ashby' },
    { name: 'Capitalize',           careers_url: 'https://job-boards.greenhouse.io/capitalize',          provider: 'greenhouse' },
    { name: 'Cardless',             careers_url: 'https://jobs.ashbyhq.com/cardless',                   provider: 'ashby' },
    { name: 'Coalition',            careers_url: 'https://job-boards.greenhouse.io/coalition',           provider: 'greenhouse' },
    { name: 'Column',               careers_url: 'https://jobs.ashbyhq.com/column',                     provider: 'ashby' },
    { name: 'Comun',                careers_url: 'https://jobs.ashbyhq.com/comun',                      provider: 'ashby' },
    { name: 'DataSnipper',          careers_url: 'https://jobs.ashbyhq.com/datasnipper',                provider: 'ashby' },
    { name: 'Esusu',                careers_url: 'https://job-boards.greenhouse.io/esusu',               provider: 'greenhouse' },
    { name: 'Found',                careers_url: 'https://job-boards.greenhouse.io/found',               provider: 'greenhouse' },
    { name: 'Highnote',             careers_url: 'https://job-boards.greenhouse.io/highnote',            provider: 'greenhouse' },
    { name: 'Honeycomb Insurance',  careers_url: 'https://job-boards.greenhouse.io/honeycombinsurance',  provider: 'greenhouse' },
    { name: 'Human Interest',       careers_url: 'https://job-boards.greenhouse.io/humaninterest',       provider: 'greenhouse' },
    { name: 'Imprint',              careers_url: 'https://jobs.ashbyhq.com/imprint',                    provider: 'ashby' },
    { name: 'Kalshi',               careers_url: 'https://jobs.ashbyhq.com/kalshi',                     provider: 'ashby' },
    { name: 'Kin Insurance',        careers_url: 'https://jobs.ashbyhq.com/kin',                        provider: 'ashby' },
    { name: 'Lead Bank',            careers_url: 'https://jobs.ashbyhq.com/leadbank',                   provider: 'ashby' },
    { name: 'Maybern',              careers_url: 'https://jobs.ashbyhq.com/maybern',                    provider: 'ashby' },
    { name: 'Monarch',              careers_url: 'https://apply.workable.com/monarch',                  provider: 'workable' },
    { name: 'Nayya',                careers_url: 'https://job-boards.greenhouse.io/nayya',               provider: 'greenhouse' },
    { name: 'Parafin',              careers_url: 'https://jobs.ashbyhq.com/parafin',                    provider: 'ashby' },
    { name: 'Payabli',              careers_url: 'https://jobs.ashbyhq.com/payabli',                    provider: 'ashby' },
    { name: 'Persona',              careers_url: 'https://jobs.ashbyhq.com/persona',                    provider: 'ashby' },
    { name: 'Phantom',              careers_url: 'https://jobs.ashbyhq.com/phantom',                    provider: 'ashby' },
    { name: 'Polymarket',           careers_url: 'https://jobs.ashbyhq.com/polymarket',                 provider: 'ashby' },
    { name: 'Rain',                 careers_url: 'https://jobs.ashbyhq.com/rain',                       provider: 'ashby' },
    { name: 'Relay',                careers_url: 'https://jobs.lever.co/relay',                         provider: 'lever' },
    { name: 'Rillet',               careers_url: 'https://jobs.ashbyhq.com/rillet',                     provider: 'ashby' },
    { name: 'Rogo',                 careers_url: 'https://jobs.ashbyhq.com/rogo',                       provider: 'ashby' },
    { name: 'Securitize',           careers_url: 'https://job-boards.greenhouse.io/securitize',          provider: 'greenhouse' },
    { name: 'Socure',               careers_url: 'https://jobs.ashbyhq.com/socure',                     provider: 'ashby' },
    { name: 'Tala',                 careers_url: 'https://jobs.lever.co/tala',                          provider: 'lever' },
    { name: 'Valon',                careers_url: 'https://jobs.ashbyhq.com/valon',                      provider: 'ashby' },
    { name: 'Zip',                  careers_url: 'https://jobs.ashbyhq.com/zip',                        provider: 'ashby' },

    // ── US Banks (Workday CXS — all live) ──
    // Many large banks (Wells, BNY, AmEx, Schwab, BMO, Truist, PNC, Ally, etc.) run Phenom / Eightfold / Avature / Oracle
    // platforms that lack public REST. Not included — would need new provider impls.
    { name: 'Bank of America',   careers_url: 'https://ghr.wd1.myworkdayjobs.com/lateral-us',                   provider: 'workday' },
    { name: 'U.S. Bancorp',      careers_url: 'https://usbank.wd1.myworkdayjobs.com/US_Bank_Careers',            provider: 'workday' },
    { name: 'Capital One',       careers_url: 'https://capitalone.wd12.myworkdayjobs.com/Capital_One',            provider: 'workday' },
    { name: 'TD Bank',           careers_url: 'https://td.wd3.myworkdayjobs.com/TD_Bank_Careers',                provider: 'workday' },
    { name: 'State Street',      careers_url: 'https://statestreet.wd1.myworkdayjobs.com/Global',                provider: 'workday' },
    { name: 'USAA',              careers_url: 'https://usaa.wd1.myworkdayjobs.com/USAAJOBSWD',                   provider: 'workday' },
    { name: 'M&T Bank',          careers_url: 'https://mtb.wd5.myworkdayjobs.com/MTB',                           provider: 'workday' },
    { name: 'KeyBank',           careers_url: 'https://keybank.wd5.myworkdayjobs.com/External_Career_Site',      provider: 'workday' },
    { name: 'Ameriprise',        careers_url: 'https://ameriprise.wd5.myworkdayjobs.com/Ameriprise',              provider: 'workday' },
    { name: 'Northern Trust',    careers_url: 'https://ntrs.wd1.myworkdayjobs.com/northerntrust',                provider: 'workday' },
    { name: 'Santander',         careers_url: 'https://santander.wd3.myworkdayjobs.com/SantanderCareers',        provider: 'workday' },
    { name: 'Western Alliance',  careers_url: 'https://westernalliancebank.wd5.myworkdayjobs.com/WAB',            provider: 'workday' },
    { name: 'Mizuho Americas',   careers_url: 'https://mizuho.wd1.myworkdayjobs.com/mizuhoamericas',              provider: 'workday' },
    { name: 'Webster Bank',      careers_url: 'https://websteronline.wd12.myworkdayjobs.com/WebsterExternalCareerSite', provider: 'workday' },
    { name: 'UMB Financial',     careers_url: 'https://umb.wd1.myworkdayjobs.com/UMBExternal',                   provider: 'workday' },
    { name: 'Wintrust Financial',careers_url: 'https://wintrust.wd1.myworkdayjobs.com/Search',                    provider: 'workday' },
    { name: 'Cullen/Frost',      careers_url: 'https://frostbank.wd5.myworkdayjobs.com/external',                 provider: 'workday' },
    { name: 'Texas Capital',     careers_url: 'https://texascapitalbank.wd12.myworkdayjobs.com/Careers',          provider: 'workday' },
    { name: 'Axos Financial',    careers_url: 'https://axos.wd5.myworkdayjobs.com/Axos',                          provider: 'workday' },

    // ── AI / Tech startups (Ashby/Greenhouse/Lever — all live) ──
    { name: 'Glean',              careers_url: 'https://job-boards.greenhouse.io/gleanwork',          provider: 'greenhouse' },
    { name: 'EliseAI',            careers_url: 'https://jobs.ashbyhq.com/eliseai',                    provider: 'ashby' },
    { name: 'Cognition',          careers_url: 'https://jobs.ashbyhq.com/cognition',                  provider: 'ashby' },
    { name: 'Harness',            careers_url: 'https://job-boards.greenhouse.io/harnessinc',         provider: 'greenhouse' },
    { name: 'Writer',             careers_url: 'https://jobs.ashbyhq.com/writer',                     provider: 'ashby' },
    { name: 'Harvey',             careers_url: 'https://jobs.ashbyhq.com/harvey',                     provider: 'ashby' },
    { name: 'SEON',               careers_url: 'https://jobs.ashbyhq.com/seon',                       provider: 'ashby' },
    { name: 'FalconX',            careers_url: 'https://job-boards.greenhouse.io/falconx',            provider: 'greenhouse' },
    { name: 'Agility Robotics',   careers_url: 'https://job-boards.greenhouse.io/agilityrobotics',    provider: 'greenhouse' },
    { name: 'You.com',            careers_url: 'https://job-boards.greenhouse.io/youcom',             provider: 'greenhouse' },
    { name: 'Commonwealth Fusion',careers_url: 'https://jobs.lever.co/cfsenergy',                     provider: 'lever' },
    { name: 'MarqVision',         careers_url: 'https://job-boards.greenhouse.io/marqvision',         provider: 'greenhouse' },
    { name: 'Alloy',              careers_url: 'https://job-boards.greenhouse.io/alloy',              provider: 'greenhouse' },
    { name: 'BitGo',              careers_url: 'https://job-boards.greenhouse.io/bitgo',              provider: 'greenhouse' },
    { name: 'Honor',              careers_url: 'https://job-boards.greenhouse.io/honor',              provider: 'greenhouse' },
    { name: 'Mercor',             careers_url: 'https://jobs.ashbyhq.com/mercor',                     provider: 'ashby' },
    { name: 'Character.ai',       careers_url: 'https://jobs.ashbyhq.com/character',                  provider: 'ashby' },
    { name: 'CodeRabbit',         careers_url: 'https://jobs.ashbyhq.com/coderabbit',                 provider: 'ashby' },
    { name: 'OpenEvidence',       careers_url: 'https://jobs.ashbyhq.com/openevidence',               provider: 'ashby' },
    { name: 'Eight Sleep',        careers_url: 'https://jobs.ashbyhq.com/eightsleep',                 provider: 'ashby' },
    { name: 'Lambda',             careers_url: 'https://jobs.ashbyhq.com/lambda',                     provider: 'ashby' },
    { name: 'Paradox',            careers_url: 'https://jobs.ashbyhq.com/paradox',                    provider: 'ashby' },
    { name: 'Suno',               careers_url: 'https://jobs.ashbyhq.com/suno',                       provider: 'ashby' },
    { name: 'Factory',            careers_url: 'https://jobs.ashbyhq.com/factory',                    provider: 'ashby' },
    { name: '6sense',             careers_url: 'https://job-boards.greenhouse.io/6sense',             provider: 'greenhouse' },
    { name: 'Neuralink',          careers_url: 'https://job-boards.greenhouse.io/neuralink',          provider: 'greenhouse' },
    { name: 'Flock Safety',       careers_url: 'https://jobs.ashbyhq.com/flock',                      provider: 'ashby' },
    { name: 'Sierra',             careers_url: 'https://jobs.ashbyhq.com/sierra',                     provider: 'ashby' },
    { name: 'Odyssey Therapeutics', careers_url: 'https://jobs.ashbyhq.com/odyssey',                 provider: 'ashby' },
    { name: 'Liquid AI',          careers_url: 'https://jobs.ashbyhq.com/liquid-ai',                  provider: 'ashby' },
    { name: 'Runway',             careers_url: 'https://jobs.ashbyhq.com/runway',                     provider: 'ashby' },
    { name: 'Apollo.io',          careers_url: 'https://job-boards.greenhouse.io/apolloio',           provider: 'greenhouse' },
    { name: 'VAST Data',          careers_url: 'https://job-boards.greenhouse.io/vast',               provider: 'greenhouse' },
    { name: 'Exa',                careers_url: 'https://jobs.ashbyhq.com/exa',                        provider: 'ashby' },
    { name: 'Strava',             careers_url: 'https://jobs.ashbyhq.com/strava',                     provider: 'ashby' },
    { name: 'Semperis',           careers_url: 'https://jobs.ashbyhq.com/semperis',                   provider: 'ashby' },
    { name: 'TRM Labs',           careers_url: 'https://jobs.ashbyhq.com/trm-labs',                   provider: 'ashby' },
    { name: 'Distyl AI',          careers_url: 'https://jobs.ashbyhq.com/distyl',                     provider: 'ashby' },
    { name: 'May Mobility',       careers_url: 'https://job-boards.greenhouse.io/maymobility',        provider: 'greenhouse' },
    { name: 'FanDuel',            careers_url: 'https://job-boards.greenhouse.io/fanduel',            provider: 'greenhouse' },
    { name: 'Apptronik',          careers_url: 'https://job-boards.greenhouse.io/apptronik',          provider: 'greenhouse' },
    { name: 'Juniper Square',     careers_url: 'https://jobs.ashbyhq.com/junipersquare',              provider: 'ashby' },

    // ── SaaS (Greenhouse/Ashby/Lever/Workday — all live) ──
    { name: 'Dropbox',            careers_url: 'https://job-boards.greenhouse.io/dropbox',            provider: 'greenhouse' },
    { name: 'Klaviyo',            careers_url: 'https://job-boards.greenhouse.io/klaviyo',            provider: 'greenhouse' },
    { name: 'Asana',              careers_url: 'https://job-boards.greenhouse.io/asana',              provider: 'greenhouse' },
    { name: 'Xero',               careers_url: 'https://jobs.ashbyhq.com/xero',                       provider: 'ashby' },
    { name: 'CrowdStrike',        careers_url: 'https://crowdstrike.wd5.myworkdayjobs.com/crowdstrikecareers', provider: 'workday' },
    { name: 'Tegus (AlphaSense)', careers_url: 'https://job-boards.greenhouse.io/alphasense',         provider: 'greenhouse', notes: 'Tegus merged into AlphaSense; uses AlphaSense board' },
    { name: 'Vectara',            careers_url: 'https://job-boards.greenhouse.io/vectara',            provider: 'greenhouse' },
    { name: 'Descope',            careers_url: 'https://job-boards.greenhouse.io/descope',            provider: 'greenhouse' },
    { name: 'UiPath',             careers_url: 'https://jobs.ashbyhq.com/uipath',                     provider: 'ashby' },
    { name: 'Zendesk',            careers_url: 'https://zendesk.wd1.myworkdayjobs.com/Zendesk',       provider: 'workday' },
    { name: 'Twilio',             careers_url: 'https://job-boards.greenhouse.io/twilio',             provider: 'greenhouse' },
    { name: 'Okta',               careers_url: 'https://job-boards.greenhouse.io/okta',               provider: 'greenhouse' },
    { name: 'Coupa Software',     careers_url: 'https://jobs.lever.co/coupa',                         provider: 'lever' },
    { name: 'Sprinklr',           careers_url: 'https://sprinklr.wd1.myworkdayjobs.com/careers',      provider: 'workday' },
    { name: 'Braze',              careers_url: 'https://job-boards.greenhouse.io/braze',              provider: 'greenhouse' },
    { name: 'Amplitude',          careers_url: 'https://job-boards.greenhouse.io/amplitude',          provider: 'greenhouse' },
    { name: 'LaunchDarkly',       careers_url: 'https://job-boards.greenhouse.io/launchdarkly',       provider: 'greenhouse' },
    { name: 'Contentful',         careers_url: 'https://job-boards.greenhouse.io/contentful',         provider: 'greenhouse' },
    { name: 'Miro',               careers_url: 'https://jobs.ashbyhq.com/miro',                       provider: 'ashby' },

    // ── CPG / Consumer (only live-verified during probe; many CPG Workday tenants hit by global maintenance) ──
    { name: 'Anheuser-Busch InBev', careers_url: 'https://job-boards.greenhouse.io/abinbev',         provider: 'greenhouse', query: 'intern' },
    { name: 'Clorox',               careers_url: 'https://clorox.wd1.myworkdayjobs.com/Clorox',         provider: 'workday',   query: 'intern' },

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
