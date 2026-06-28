// Probe every tracked company's resolved ATS endpoint. Prints which boards are
// live (job count) vs dead (404/wrong slug/no provider). Run after editing
// portals.config.mjs — slugs drift and a dead board silently yields 0 jobs.
//
//   node verify-slugs.mjs

import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { makeHttpCtx } from './providers/_http.mjs';
import config from './portals.config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadProviders() {
  const dir = join(__dirname, 'providers');
  const files = readdirSync(dir).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).sort();
  const providers = new Map();
  for (const file of files) {
    const mod = await import(join(dir, file));
    if (mod.default?.id && typeof mod.default.fetch === 'function') providers.set(mod.default.id, mod.default);
  }
  return providers;
}

function resolveProvider(entry, providers) {
  if (entry.provider && providers.has(entry.provider)) return providers.get(entry.provider);
  for (const p of providers.values()) {
    if (typeof p.detect !== 'function') continue;
    try { if (p.detect(entry)) return p; } catch { /* skip */ }
  }
  return null;
}

const providers = await loadProviders();
const ctx = makeHttpCtx();
let live = 0, dead = 0;

for (const entry of config.trackedCompanies) {
  const p = resolveProvider(entry, providers);
  if (!p) { console.log(`❌ NO PROVIDER  ${entry.name}  (${entry.careers_url})`); dead++; continue; }
  try {
    const jobs = await p.fetch(entry, ctx);
    console.log(`✅ ${String(jobs.length).padStart(4)} jobs  ${entry.name}  [${p.id}]`);
    live++;
  } catch (e) {
    console.log(`❌ ${e.message.slice(0, 60).padEnd(60)}  ${entry.name}  [${p.id}]`);
    dead++;
  }
}
console.log(`\n${live} live · ${dead} dead/missing`);
