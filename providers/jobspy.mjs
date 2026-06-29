// @ts-check
// providers/jobspy.mjs — opt-in search source. Spawns python-jobspy sidecar.
//
// Opt-in only: set `provider: 'jobspy'` and `careers_url: 'jobspy://...'` on
// the portals.config entry. Returns [] (never throws) when python is missing,
// python-jobspy is not installed, or the sidecar fails for any reason.

import { spawn } from 'node:child_process';

/** @typedef {import('./_types.js').Provider} Provider */

const PY = process.env.JOBSPY_PYTHON || 'python3';

/** @type {Provider} */
export default {
  id: 'jobspy',

  detect(entry) {
    return entry.careers_url?.startsWith('jobspy://') ? { url: entry.careers_url } : null;
  },

  async fetch(entry, _ctx) {
    const p = entry.api;
    if (!p?.term) return [];
    let raw;
    try {
      raw = await runSidecar({
        sites: p.sites ?? ['indeed', 'google'],
        term: p.term,
        location: p.location ?? 'United States',
        results_wanted: p.resultsWanted ?? 25,
        hours_old: p.hoursOld ?? 168,
        proxies: process.env.JOBSPY_PROXIES ? process.env.JOBSPY_PROXIES.split(',') : null,
      });
    } catch (err) {
      console.error(`[jobspy] sidecar failed, skipping: ${err.message}`);
      return [];
    }
    return raw
      .filter((j) => j.title && j.job_url)
      .map((j) => ({
        title: j.title.trim(),
        url: j.job_url,
        company: j.company ?? '',
        location: j.location ?? '',
        description: j.description || undefined,
        postedAt: j.date_posted ? (Date.parse(j.date_posted) || undefined) : undefined,
        salary: j.min_amount && j.max_amount
          ? { min: j.min_amount, max: j.max_amount, currency: j.currency ?? 'USD' }
          : undefined,
        source: `jobspy:${j.site ?? 'search'}`,
      }));
  },
};

function runSidecar(args) {
  return new Promise((resolve, reject) => {
    const ps = spawn(PY, ['jobspy_runner.py'], {
      cwd: new URL('../sidecar', import.meta.url).pathname,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    ps.stdout.on('data', (d) => (out += d));
    ps.stderr.on('data', (d) => (err += d));
    ps.on('error', reject);
    ps.on('close', (code) => {
      if (code !== 0) return reject(new Error(err || `exit ${code}`));
      try { resolve(JSON.parse(out)); } catch { reject(new Error('bad JSON from sidecar')); }
    });
    ps.stdin.write(JSON.stringify(args));
    ps.stdin.end();
  });
}
