// Lean scanner — the reusable core of career-ops, stripped of the agentic
// CV/cover/tracker layers. Loads providers, fetches each company's ATS feed,
// filters, dedups against data/jobs.db, emits NEW jobs.
//
//   node scan.mjs            → scan, print new jobs, update data/jobs.db
//   node scan.mjs --json     → also dump new jobs as JSON to stdout
//   node scan.mjs --notify   → push new jobs to Discord (needs DISCORD_WEBHOOK_URL)
//
// Zero npm deps. Node 22+ (native fetch + node:sqlite built-in).

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { makeHttpCtx } from './providers/_http.mjs';
import { roleFuzzyMatch } from './role-matcher.mjs';
import { hasSeen, hasSeenCanon, markSeen, seenRoles, recordRun, getUnnotified, markNotified, markAllNotified, getCooldownUntil, setCooldownUntil } from './db.mjs';
import { normCompany, canonKey } from './normalize.mjs';
import config from './portals.config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load providers ────────────────────────────────────────────────
// Auto-import every providers/*.mjs except _-prefixed shared helpers.
async function loadProviders() {
  const dir = join(__dirname, 'providers');
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.mjs') && !f.startsWith('_'))
    .sort(); // alphabetical → deterministic detect() order
  const providers = new Map();
  for (const file of files) {
    const mod = await import(join(dir, file));
    const p = mod.default;
    if (p && p.id && typeof p.fetch === 'function') providers.set(p.id, p);
  }
  return providers;
}

// Provider resolution order:
//   1. Explicit `provider:` field on the entry wins.
//   2. First ATS provider whose detect() matches the careers_url.
//   3. Firecrawl fallback — any site with no supported ATS gets scraped +
//      LLM-extracted, so non-Greenhouse/Lever/Ashby/Workday companies "just
//      work" when you add them (requires FIRECRAWL_API_KEY). Firecrawl never
//      auto-claims via detect(); it is only ever the last resort here.
function resolveProvider(entry, providers) {
  if (entry.provider && providers.has(entry.provider)) return providers.get(entry.provider);
  for (const p of providers.values()) {
    if (p.id === 'firecrawl') continue; // opt-in / fallback only, never via detect
    if (typeof p.detect !== 'function') continue;
    try { if (p.detect(entry)) return p; } catch { /* skip */ }
  }
  if (process.env.FIRECRAWL_API_KEY && providers.has('firecrawl')) return providers.get('firecrawl');
  return null;
}

// ── Filters ───────────────────────────────────────────────────────
const lc = s => (s || '').toLowerCase();

// Word-boundary match so "Intern" does NOT hit "Internal"/"International".
// Cached per keyword. Hyphen treated as boundary ("Co-op" matches "co-op").
const _kwCache = new Map();
function matchesKeyword(text, kw) {
  let re = _kwCache.get(kw);
  if (!re) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`, 'i');
    _kwCache.set(kw, re);
  }
  return re.test(text);
}

function passesTitle(title, f) {
  if (!f) return true;
  const t = title || '';
  if (f.negative?.some(k => matchesKeyword(t, k))) return false;
  if (f.positive?.length) return f.positive.some(k => matchesKeyword(t, k));
  return true;
}

function passesLocation(location, f) {
  if (!f) return true;
  const loc = lc(location);
  if (!loc) return true; // don't penalize missing data
  // Block wins over everything — "Remote, India" must NOT pass even if "remote" is in alwaysAllow.
  if (f.block?.some(k => loc.includes(lc(k)))) return false;
  // Word-boundary match for short tokens (US, UK, CA, NY, DC) — substring "us" matches "australia".
  // For longer tokens (multi-char cities/countries) plain substring is fine.
  const matchAny = (haystack, kws) => kws.some(k => {
    const kk = lc(k);
    if (kk.length <= 3) {
      // word-boundary regex
      const re = new RegExp(`(?<![a-z])${kk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`, 'i');
      return re.test(haystack);
    }
    return haystack.includes(kk);
  });
  if (f.alwaysAllow?.length && matchAny(loc, f.alwaysAllow)) return true;
  if (!f.allow?.length) return true;
  return matchAny(loc, f.allow);
}

// Freshness gate — only notify NEWLY released postings. job.postedAt is the
// original publish date (epoch ms); roles reposted to regain traction keep their
// old date, so a max-age cutoff filters them out. Jobs with no postedAt are kept
// (don't penalize missing data — e.g. Firecrawl-extracted listings have no date).
// Tune with MAX_JOB_AGE_DAYS env (default 21; set 0 to disable).
const MAX_JOB_AGE_DAYS = Number(process.env.MAX_JOB_AGE_DAYS ?? 21);
function passesFreshness(job) {
  if (!MAX_JOB_AGE_DAYS) return true;
  if (!job.postedAt) return true;
  const ageDays = (Date.now() - job.postedAt) / 86_400_000;
  return ageDays <= MAX_JOB_AGE_DAYS;
}

// Notify-age gate — restrict what actually surfaces to the digest. Distinct from
// passesFreshness (which gates DB writes via 21d cutoff). Jobs older than
// MAX_NOTIFY_AGE_HOURS still get marked seen in DB (canonical dedup), they just
// don't produce a notification. Kills repost-spam: aggregators that re-list old
// roles to regain traction are silenced. Tune with MAX_NOTIFY_AGE_HOURS
// (default 48; set 0 to disable).
const MAX_NOTIFY_AGE_HOURS = Number(process.env.MAX_NOTIFY_AGE_HOURS ?? 48);
function passesNotifyAge(job) {
  if (!MAX_NOTIFY_AGE_HOURS) return true;
  if (!job.postedAt) return true; // don't penalize missing data (Firecrawl, some ATS feeds)
  const ageHours = (Date.now() - job.postedAt) / 3_600_000;
  return ageHours <= MAX_NOTIFY_AGE_HOURS;
}

// ── Main ──────────────────────────────────────────────────────────
export async function main() {
  // --drain-backlog: bulk-mark every unnotified job as notified without sending
  // anything. Used once after a big source change (e.g. intern-list rewrite) to
  // suppress the inevitable backlog before the digest rules take effect.
  // Idempotent: second invocation drains 0. If --notify is also set, fall
  // through to fetch + notify (drain happens first, then fresh run on top).
  if (process.argv.includes('--drain-backlog')) {
    const drained = markAllNotified();
    console.error(`🔥 drained ${drained} unnotified job(s) (--drain-backlog)`);
    if (!process.argv.includes('--notify')) return [];
  }

  const providers = await loadProviders();
  const ctx = makeHttpCtx();

  const newJobs = [];
  let scanned = 0, parked = 0, failed = 0;

  // Companies covered by a direct provider (ATS/Firecrawl) — JobSpy search
  // results for these are dropped so a precise direct feed is never duplicated
  // by a board-search hit on the same firm. JobSpy's job is DISCOVERY of firms
  // NOT on this list. (Layer 1 of overlap control; canonical dedup below is the
  // source-agnostic safety net.)
  const directCompanies = new Set(
    config.trackedCompanies
      .filter(e => e.provider !== 'jobspy' && !e.careers_url?.startsWith('jobspy://'))
      .map(e => normCompany(e.name))
      .filter(Boolean)
  );

  const CONCURRENCY = Math.max(1, Number(process.env.SCAN_CONCURRENCY ?? 8));
  console.error(`📡 concurrency: ${CONCURRENCY}`);
  // Bounded-concurrency fan-out so 100+ boards don't scan serially. Workers
  // share a FIFO queue; each one drains entries until empty. Results are
  // collected (provider.id travels with each batch) so per-job dedup can
  // still run sequentially after all fetches complete.
  const queue = config.trackedCompanies.slice(); // shallow copy — never mutate config
  const fetchResults = []; // { ok, name, provider?, jobs?, error?, cooldown?: boolean }
  // Per-entry cooldown — slow-changing boards (intern-list aggregator, Workday
  // tenants) gate their fetches so we don't burn network/CPU every cron tick.
  // Default 24h, opt-out with `cooldown_hours: 0` on an entry. Cooldown is
  // applied AFTER a successful fetch — failed fetches don't reset it (the
  // cache row from prior runs still tells us "we already tried recently").
  const DEFAULT_COOLDOWN_HOURS = Number(process.env.SCAN_COOLDOWN_HOURS ?? 24);
  function resolveCooldownHours(entry) {
    const raw = entry.cooldown_hours;
    if (raw === undefined || raw === null) return DEFAULT_COOLDOWN_HOURS;
    const n = Number(raw);
    return Number.isFinite(n) ? n : DEFAULT_COOLDOWN_HOURS;
  }
  function isOnCooldown(entry) {
    const hours = resolveCooldownHours(entry);
    if (hours <= 0) return false;
    const until = getCooldownUntil(entry.careers_url);
    if (!until) return false;
    return Date.parse(until) > Date.now();
  }
  async function worker() {
    while (queue.length) {
      const entry = queue.shift();
      if (entry.enabled === false) { fetchResults.push({ ok: true, parked: true, name: entry.name }); continue; }
      if (isOnCooldown(entry)) {
        fetchResults.push({ ok: true, parked: true, cooldown: true, name: entry.name });
        continue;
      }
      const provider = resolveProvider(entry, providers);
      if (!provider) { console.error(`⏭  no provider for ${entry.name} (${entry.careers_url})`); fetchResults.push({ ok: false, name: entry.name }); continue; }
      try {
        const jobs = await provider.fetch(entry, ctx);
        // Stamp cooldown only on success — a 5xx shouldn't extend a board's quiet period.
        const hours = resolveCooldownHours(entry);
        if (hours > 0) {
          setCooldownUntil(entry.careers_url, new Date(Date.now() + hours * 3_600_000).toISOString());
        }
        fetchResults.push({ ok: true, name: entry.name, provider: provider.id, jobs });
      } catch (e) {
        console.error(`✗  ${entry.name} [${provider.id}]: ${e.message}`);
        fetchResults.push({ ok: false, name: entry.name, provider: provider.id, error: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  for (const result of fetchResults) {
    if (result.cooldown) { parked++; console.error(`⏸  ${result.name} on cooldown`); continue; }
    if (result.parked) { parked++; continue; }
    if (!result.ok) { failed++; continue; }
    scanned++;
    const providerId = result.provider;
    for (const job of result.jobs) {
      if (!job.url || !job.title) continue;
      job.source = providerId; // tag origin (greenhouse/ashby/workday/simplify/firecrawl/jobspy) for the notification footer
      // Layer 1 — JobSpy company-exclusion: skip board-search hits for any firm
      // already covered by a direct provider (precise feed wins, no overlap).
      if (providerId === 'jobspy' && directCompanies.has(normCompany(job.company))) continue;
      if (!passesTitle(job.title, config.titleFilter)) continue;
      if (!passesLocation(job.location, config.locationFilter)) continue;
      if (!passesFreshness(job)) continue; // skip stale/reposted-old listings
      if (!passesNotifyAge(job)) continue; // skip sending notify for >48h-old (still mark seen below)
      if (hasSeen(job.url)) continue; // exact-URL dedup (DB)
      // Layer 2 — canonical cross-source dedup: same normalized company|title
      // seen before (any source/URL) → skip. Catches JobSpy↔ATS and JobSpy↔JobSpy
      // (same role across the 3 searches / across boards) that exact-URL misses.
      if (hasSeenCanon(canonKey(job.company, job.title))) continue;
      // fuzzy same-company repost dedup (reads from DB — persists across runs)
      const storedRoles = seenRoles(job.company);
      const dupe = storedRoles.some(r => roleFuzzyMatch(r.title, job.title));
      if (dupe) continue;

      newJobs.push(job);
      markSeen(job);
    }
  }

  // Parallel scan makes arrival order non-deterministic. Sort by freshest first
  // then by company for stable notification/listing order.
  newJobs.sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0) || String(a.company).localeCompare(String(b.company)));

  recordRun({ scanned, parked, failed, newJobs: newJobs.length });

  // ── Report ──
  // Per-source tally of NEW jobs (greenhouse/ashby/workday/simplify/firecrawl/jobspy)
  // so each run shows which providers actually contributed.
  const bySource = {};
  for (const j of newJobs) bySource[j.source] = (bySource[j.source] || 0) + 1;
  const breakdown = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${s} ${n}`)
    .join(' · ');
  console.error(`\n📊 scanned ${scanned} · parked ${parked} · failed ${failed} · ${newJobs.length} new jobs`);
  if (breakdown) console.error(`   by source: ${breakdown}`);
  for (const j of newJobs) {
    console.error(`  • ${j.company} — ${j.title}${j.location ? `  [${j.location}]` : ''}`);
    console.error(`    ${j.url}`);
  }

  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(newJobs, null, 2) + '\n');

  if (process.argv.includes('--notify')) {
    const { notify } = await import('./notify.mjs');
    const unnotified = getUnnotified(newJobs);
    // Cap notifications per run to avoid flooding (large feeds like Simplify can
    // surface many fresh listings at once). Notify the freshest CAP; mark ALL
    // unnotified as notified so the overflow is suppressed, not re-sent next run.
    // MAX_NOTIFY_PER_RUN default 40; 0 = unlimited.
    const CAP = Number(process.env.MAX_NOTIFY_PER_RUN ?? 40);
    let toNotify = unnotified;
    if (CAP && unnotified.length > CAP) {
      toNotify = [...unnotified].sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0)).slice(0, CAP);
      console.error(`⚠️  ${unnotified.length} new jobs > cap ${CAP}: notifying the ${CAP} freshest, suppressing ${unnotified.length - CAP}`);
    }
    if (toNotify.length) {
      const result = await notify(toNotify);
      markNotified(unnotified.map(j => j.url)); // mark all seen-as-notified, incl. suppressed overflow
      // Surface channel failures via exit code (cron needs to know) WITHOUT
      // throwing — DB writes and post-notify cleanup must still run below.
      if (!result.ok) {
        const fails = Object.entries(result.channels)
          .filter(([, r]) => !r.ok)
          .map(([k, r]) => `${k}: ${r.error}`)
          .join('; ');
        console.error(`⚠️  notify had failures: ${fails}`);
        process.exitCode = 1;
      }
    }
  }

  // Status heartbeat — fires every run (incl. zero-new), self-gated on
  // STATUS_WEBHOOK_URL so local dev runs stay silent. Proves the workflow ran.
  if (process.env.STATUS_WEBHOOK_URL) {
    const { notifyStatus } = await import('./notify.mjs');
    await notifyStatus({ scanned, parked, failed, newJobs: newJobs.length, bySource });
  }

  return newJobs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1); });
}
