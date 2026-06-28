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
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { makeHttpCtx } from './providers/_http.mjs';
import { roleFuzzyMatch } from './role-matcher.mjs';
import { hasSeen, markSeen, seenRoles, recordRun } from './db.mjs';
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

// Explicit `provider:` field wins; else first detect() hit in load order.
function resolveProvider(entry, providers) {
  if (entry.provider && providers.has(entry.provider)) return providers.get(entry.provider);
  for (const p of providers.values()) {
    if (typeof p.detect !== 'function') continue;
    try { if (p.detect(entry)) return p; } catch { /* skip */ }
  }
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
  if (f.alwaysAllow?.some(k => loc.includes(lc(k)))) return true;
  if (f.block?.some(k => loc.includes(lc(k)))) return false;
  if (!f.allow?.length) return true;
  return f.allow.some(k => loc.includes(lc(k)));
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  const providers = await loadProviders();
  const ctx = makeHttpCtx();

  const newJobs = [];
  let scanned = 0, parked = 0, failed = 0;

  for (const entry of config.trackedCompanies) {
    if (entry.enabled === false) { parked++; continue; }
    const provider = resolveProvider(entry, providers);
    if (!provider) { console.error(`⏭  no provider for ${entry.name} (${entry.careers_url})`); failed++; continue; }

    let jobs;
    try { jobs = await provider.fetch(entry, ctx); }
    catch (e) { console.error(`✗  ${entry.name} [${provider.id}]: ${e.message}`); failed++; continue; }

    scanned++;
    for (const job of jobs) {
      if (!job.url || !job.title) continue;
      if (!passesTitle(job.title, config.titleFilter)) continue;
      if (!passesLocation(job.location, config.locationFilter)) continue;
      if (hasSeen(job.url)) continue; // exact-URL dedup (DB)
      // fuzzy same-company repost dedup (reads from DB — persists across runs)
      const storedRoles = seenRoles(job.company);
      const dupe = storedRoles.some(r => roleFuzzyMatch(r.title, job.title));
      if (dupe) continue;

      newJobs.push(job);
      markSeen(job);
    }
  }

  recordRun({ scanned, parked, failed, newJobs: newJobs.length });

  // ── Report ──
  console.error(`\n📊 scanned ${scanned} · parked ${parked} · failed ${failed} · ${newJobs.length} new jobs`);
  for (const j of newJobs) {
    console.error(`  • ${j.company} — ${j.title}${j.location ? `  [${j.location}]` : ''}`);
    console.error(`    ${j.url}`);
  }

  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(newJobs, null, 2) + '\n');

  if (process.argv.includes('--notify') && newJobs.length) {
    const { notifyDiscord } = await import('./notify.mjs');
    await notifyDiscord(newJobs);
  }

  return newJobs;
}

main().catch(e => { console.error(e); process.exit(1); });
