// field-router.mjs — classify a job by title into AKPSI field channels and
// resolve which role(s) to ping. Used by notify.mjs to fan a job out from the
// #job-board firehose into the relevant field sub-channel(s).
//
// Classification is keyword-based on the job TITLE only. It is intentionally
// best-effort: a job may match multiple roles (posted to each matched channel),
// and a job that matches nothing is NOT routed here — it still appears in the
// #job-board firehose via notifyDiscord().
//
// Role IDs are Discord snowflakes (not secret) and are hardcoded.
// Channel webhook URLs ARE secret and come from env (see CHANNELS).

// Each role maps to exactly one field channel. `keywords` are matched against
// the normalized title: multi-word entries use substring match, single tokens
// must appear as a whole word (avoids "hr" matching "through", etc.).
export const ROLES = [
  // ── finance-internships ──
  { name: 'Investment Banking', channel: 'finance', id: '1520939343957463151',
    keywords: ['investment banking', 'ib analyst', 'ibd', 'm&a', 'mergers', 'leveraged finance'] },
  { name: 'Private Equity / VC', channel: 'finance', id: '1520939351704604743',
    keywords: ['private equity', 'venture capital', 'buyout', 'growth equity', 'vc'] },
  { name: 'Accounting', channel: 'finance', id: '1520939355873742918',
    keywords: ['accounting', 'accountant', 'audit', 'tax', 'assurance', 'bookkeep', 'cpa'] },
  { name: 'Corporate Finance', channel: 'finance', id: '1520939363482206341',
    keywords: ['corporate finance', 'fp&a', 'financial planning', 'treasury', 'corporate development',
               'financial analyst', 'finance analyst', 'equity research'] },
  // ── consulting-internships ──
  { name: 'Consulting', channel: 'consulting', id: '1520939348327923844',
    keywords: ['consulting', 'consultant', 'strategy', 'advisory', 'management consult'] },
  // ── marketing-sales-internships ──
  { name: 'Marketing', channel: 'marketing-sales', id: '1520939365470044311',
    keywords: ['marketing', 'brand', 'growth', 'seo', 'content', 'social media', 'communications', 'pr '] },
  { name: 'Sales / BD', channel: 'marketing-sales', id: '1520939369479934014',
    keywords: ['sales', 'business development', 'account executive', 'account manager', 'partnerships', 'bd'] },
  // ── tech-data-internships ──
  { name: 'Tech / SWE', channel: 'tech-data', id: '1520939387469299814',
    keywords: ['software', 'engineer', 'developer', 'swe', 'programmer', 'full stack', 'fullstack',
               'backend', 'frontend', 'devops', 'mobile', 'ios', 'android'] },
  { name: 'Data / Analytics', channel: 'tech-data', id: '1520939390182887525',
    keywords: ['data scien', 'data analyst', 'data engineer', 'analytics', 'machine learning',
               'business intelligence', 'bi analyst', 'ml'] },
  { name: 'Product Management', channel: 'tech-data', id: '1520939373749600386',
    keywords: ['product manager', 'product management', 'associate product', 'product owner', 'apm'] },
  // ── ops-hr-internships ──
  { name: 'Supply Chain / Ops', channel: 'ops-hr', id: '1520939383304491268',
    keywords: ['supply chain', 'operations', 'logistics', 'procurement', 'manufacturing', 'ops analyst'] },
  { name: 'Human Resources', channel: 'ops-hr', id: '1520939377449107487',
    keywords: ['human resources', 'people operations', 'talent', 'recruiting', 'recruiter', 'hris', 'hr'] },
];

// channel key → env var holding that channel's webhook URL.
export const CHANNELS = {
  finance:           'FIELD_WEBHOOK_FINANCE',
  consulting:        'FIELD_WEBHOOK_CONSULTING',
  'marketing-sales': 'FIELD_WEBHOOK_MARKETING_SALES',
  'tech-data':       'FIELD_WEBHOOK_TECH_DATA',
  'ops-hr':          'FIELD_WEBHOOK_OPS_HR',
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

/**
 * Group new jobs by field channel, attaching the matched role mentions.
 * Only channels with a configured webhook env are included.
 * @returns {Map<string,{webhook:string, entries:{job:object, roleIds:string[]}[]}>}
 */
export function routeJobs(jobs) {
  const byChannel = new Map();
  for (const job of jobs) {
    const matches = matchRoles(job);
    if (!matches.length) continue;
    // group this job's matched roles by their channel
    const perChannel = new Map();
    for (const r of matches) {
      if (!perChannel.has(r.channel)) perChannel.set(r.channel, new Set());
      perChannel.get(r.channel).add(r.id);
    }
    for (const [channel, roleIdSet] of perChannel) {
      const webhook = process.env[CHANNELS[channel]];
      if (!webhook) continue; // channel not configured → skip (firehose still covers it)
      if (!byChannel.has(channel)) byChannel.set(channel, { webhook, entries: [] });
      byChannel.get(channel).entries.push({ job, roleIds: [...roleIdSet] });
    }
  }
  return byChannel;
}
