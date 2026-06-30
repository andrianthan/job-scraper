// field-router.mjs — classify a job by title into AKPSI field channels and
// resolve which role(s) to ping. Used by notify.mjs to fan a job out from the
// #job-board firehose into the relevant field sub-channel(s).
//
// Classification is keyword-based on the job TITLE only. It is intentionally
// best-effort and tuned for REAL ATS titles (often generic: "Intern",
// "Investment Associate Intern", "Universal Banker") not textbook ones. A job
// may match multiple roles (posted to each matched channel); a job that matches
// nothing is NOT routed here — it still appears in the #job-board firehose.
//
// Role IDs are Discord snowflakes (not secret) and are hardcoded.
// Channel webhook URLs ARE secret and come from env (see CHANNELS).

// Each role maps to exactly one field channel. `keywords` are matched against
// the normalized title: multi-word entries use substring match, single tokens
// must appear as a whole word (avoids "hr" matching "through", etc.).
export const ROLES = [
  // ── finance-internships ──
  { name: 'Investment Banking', channel: 'finance', id: '1520939343957463151',
    keywords: ['investment banking', 'ib analyst', 'ibd', 'm&a', 'mergers', 'leveraged finance',
               'capital markets', 'equity capital', 'debt capital', 'ecm', 'dcm', 'sell side', 'sell-side'] },
  { name: 'Private Equity / VC', channel: 'finance', id: '1520939351704604743',
    keywords: ['private equity', 'venture capital', 'buyout', 'growth equity', 'hedge fund',
               'asset management', 'investment management', 'investment associate', 'portfolio',
               'buyside', 'buy side', 'buy-side', 'wealth management', 'wealth', 'quantitative', 'quant'] },
  { name: 'Accounting', channel: 'finance', id: '1520939355873742918',
    keywords: ['accounting', 'accountant', 'audit', 'tax', 'assurance', 'bookkeep', 'cpa',
               'controller', 'financial reporting'] },
  { name: 'Corporate Finance', channel: 'finance', id: '1520939363482206341',
    keywords: ['corporate finance', 'fp&a', 'financial planning', 'treasury', 'corporate development',
               'financial analyst', 'finance analyst', 'equity research', 'research analyst',
               'finance', 'financial', 'banker', 'banking', 'markets', 'trading', 'trader',
               'securities', 'investor', 'underwriting', 'credit', 'lending'] },
  // ── consulting-internships ──
  { name: 'Consulting', channel: 'consulting', id: '1520939348327923844',
    keywords: ['consulting', 'consultant', 'strategy', 'strategic', 'advisory', 'management consult'] },
  // ── marketing-sales-internships ──
  { name: 'Marketing', channel: 'marketing-sales', id: '1520939365470044311',
    keywords: ['marketing', 'brand', 'growth', 'seo', 'content', 'social media', 'communications',
               'advertising', 'media', 'creative'] },
  { name: 'Sales / BD', channel: 'marketing-sales', id: '1520939369479934014',
    keywords: ['sales', 'business development', 'account executive', 'account manager', 'partnerships',
               'revenue', 'go-to-market', 'go to market'] },
  // ── tech-data-internships ──
  { name: 'Tech / SWE', channel: 'tech-data', id: '1520939387469299814',
    keywords: ['software', 'engineer', 'engineering', 'developer', 'swe', 'programmer', 'full stack',
               'fullstack', 'backend', 'frontend', 'devops', 'mobile', 'ios', 'android', 'technical',
               'infrastructure', 'security', 'hardware', 'firmware', 'embedded', 'vlsi', 'asic',
               'fpga', 'soc', 'chip', 'silicon', 'electrical engineering', 'ee'] },
  { name: 'Data / Analytics', channel: 'tech-data', id: '1520939390182887525',
    keywords: ['data scien', 'data analyst', 'data engineer', 'data analytics', 'analytics',
               'machine learning', 'business intelligence', 'bi analyst', 'ml', 'data'] },
  { name: 'Product Management', channel: 'tech-data', id: '1520939373749600386',
    keywords: ['product manager', 'product management', 'associate product', 'product owner', 'apm', 'product'] },
  // ── ops-hr-internships ──
  { name: 'Supply Chain / Ops', channel: 'ops-hr', id: '1520939383304491268',
    keywords: ['supply chain', 'operations', 'logistics', 'procurement', 'manufacturing', 'ops',
               'warehouse', 'fulfillment'] },
  { name: 'Human Resources', channel: 'ops-hr', id: '1520939377449107487',
    keywords: ['human resources', 'people operations', 'talent', 'recruiting', 'recruiter', 'hris',
               'hr', 'people'] },
];

// Title keywords that route a job to the #fellowships channel (no role ping —
// fellowships is not role-gated). Fellowships still also match any role above.
export const FELLOWSHIP_KEYWORDS = ['fellowship', 'fellow', 'fellows program'];

// channel key → env var holding that channel's webhook URL.
export const CHANNELS = {
  finance:           'FIELD_WEBHOOK_FINANCE',
  consulting:        'FIELD_WEBHOOK_CONSULTING',
  'marketing-sales': 'FIELD_WEBHOOK_MARKETING_SALES',
  'tech-data':       'FIELD_WEBHOOK_TECH_DATA',
  'ops-hr':          'FIELD_WEBHOOK_OPS_HR',
  fellowships:       'FIELD_WEBHOOK_FELLOWSHIPS',
};

// Normalize a title to a whitespace-joined lowercase string + a Set of tokens.
function normalize(title) {
  const text = (typeof title === 'string' ? title : String(title ?? '')).toLowerCase();
  const norm = text.replace(/[^a-z0-9&+#]/g, ' ').replace(/\s+/g, ' ').trim();
  return { norm, tokens: new Set(norm.split(' ')) };
}

// True if `kw` matches the normalized title. Multi-word keywords (containing a
// space) use substring match; single tokens must match a whole word.
function keywordHits(kw, norm, tokens) {
  return kw.includes(' ') ? norm.includes(kw) : tokens.has(kw);
}

/**
 * Classify one job by title.
 * @returns {{name:string,id:string,channel:string}[]} matched roles (possibly empty).
 */
export function matchRoles(job) {
  const { norm, tokens } = normalize(job?.title);
  if (!norm) return [];
  return ROLES.filter(r => r.keywords.some(kw => keywordHits(kw, norm, tokens)));
}

/** True if the title looks like a fellowship/fellows program. */
export function isFellowship(job) {
  const { norm, tokens } = normalize(job?.title);
  if (!norm) return false;
  return FELLOWSHIP_KEYWORDS.some(kw => keywordHits(kw, norm, tokens));
}

// name → role lookup for mapping LLM-returned field names back to role IDs.
const NAME_TO_ROLE = new Map(ROLES.map(r => [r.name, r]));

/**
 * Group new jobs by field channel, attaching the matched role mentions.
 * Uses the Claude classifier when ANTHROPIC_API_KEY is set (relevance gate +
 * field tags); otherwise falls back to keyword matching. Fellowship postings
 * also route to the #fellowships channel (no ping). Only channels with a
 * configured webhook env are included. Async because of the LLM call.
 * @returns {Promise<Map<string,{webhook:string, entries:{job:object, roleIds:string[]}[]}>>}
 */
export async function routeJobs(jobs) {
  const byChannel = new Map();
  const add = (channel, job, roleIds) => {
    const webhook = process.env[CHANNELS[channel]];
    if (!webhook) return; // channel not configured → skip (firehose still covers it)
    if (!byChannel.has(channel)) byChannel.set(channel, { webhook, entries: [] });
    byChannel.get(channel).entries.push({ job, roleIds });
  };

  // LLM classification (lazy import avoids the classifier↔router import cycle).
  let classifications = null;
  try {
    const { classifyJobs } = await import('./classifier.mjs');
    classifications = await classifyJobs(jobs);
  } catch { /* fall back to keywords */ }

  jobs.forEach((job, i) => {
    let roles, fellowship;
    const c = classifications?.[i];
    if (c) {
      if (!c.relevant) return; // LLM says off-topic → firehose only, no field routing
      roles = c.fields.map(name => NAME_TO_ROLE.get(name)).filter(Boolean);
      fellowship = c.fellowship;
    } else {
      roles = matchRoles(job);       // keyword fallback
      fellowship = isFellowship(job);
    }

    // group this job's roles by their channel
    const perChannel = new Map();
    for (const r of roles) {
      if (!perChannel.has(r.channel)) perChannel.set(r.channel, new Set());
      perChannel.get(r.channel).add(r.id);
    }
    for (const [channel, roleIdSet] of perChannel) add(channel, job, [...roleIdSet]);

    if (fellowship) add('fellowships', job, []); // no role ping
  });
  return byChannel;
}
