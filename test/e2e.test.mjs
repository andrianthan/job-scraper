// test/e2e.test.mjs — end-to-end: stubbed fetch → filter → dedup → notify fallback
// Run: node --test test/e2e.test.mjs   (or npm test to run all tests)
// Zero npm deps; uses node:test (built-in, Node 22+).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';

// ── 1. Isolate DB: set DB_PATH BEFORE any db.mjs import ──────────────────────
const TMP_DB = join(tmpdir(), `e2e-${randomUUID()}.db`);
process.env.DB_PATH = TMP_DB;
delete process.env.DISCORD_WEBHOOK_URL;
delete process.env.DISCORD_WEBHOOK;
delete process.env.NOTIFY_EMAIL;
delete process.env.RESEND_API_KEY;

// ── 2. Stub globalThis.fetch BEFORE scan.mjs import ──────────────────────────
// Titles contain 'Summer Analyst' + 'Intern' → pass titleFilter positive gate.
// Titles contain no negative keywords ('Senior', 'Engineer', etc.) → pass negative gate.
// Location 'New York' is in alwaysAllow → passes locationFilter.
// All responses are ok:true so _http.mjs's retry logic never fires (no sleep delays).
const GH_RESPONSE = {
  jobs: [
    {
      absolute_url: 'https://boards-api.greenhouse.io/v1/boards/brex/jobs/1001',
      title: 'Finance Summer Analyst Intern',
      location: { name: 'New York' },
      first_published: new Date().toISOString(),
    },
    {
      absolute_url: 'https://boards-api.greenhouse.io/v1/boards/brex/jobs/1002',
      title: 'Business Operations Summer Intern',
      location: { name: 'Remote' },
      first_published: new Date().toISOString(),
    },
  ],
};

const ASHBY_RESPONSE = {
  jobs: [
    {
      jobUrl: 'https://jobs.ashbyhq.com/ramp/abc-001',
      title: 'Finance Strategy Summer Analyst Intern',
      location: 'New York',
    },
  ],
};

const EMPTY_RESPONSE = { jobs: [] };

globalThis.fetch = (url, _opts) => {
  const u = String(url);
  let body;
  if (u.includes('greenhouse.io')) {
    body = GH_RESPONSE;
  } else if (u.includes('ashbyhq.com')) {
    body = ASHBY_RESPONSE;
  } else {
    // Workday and any other provider: return empty valid payload, no retries.
    body = EMPTY_RESPONSE;
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
};

// ── 3. Import AFTER env + fetch are set ───────────────────────────────────────
const { main } = await import('../scan.mjs');
const { _closeDb } = await import('../db.mjs');
const { notify } = await import('../notify.mjs');

// ── 4. Cleanup ────────────────────────────────────────────────────────────────
after(() => {
  _closeDb();
  try { unlinkSync(TMP_DB); } catch { /* ignore if already gone */ }
});

// ── 5. Tests ──────────────────────────────────────────────────────────────────

test('e2e run-1: pipeline finds new intern jobs via stubbed ATS feeds', async () => {
  const jobs = await main();
  assert.ok(jobs.length > 0, `Expected ≥1 new job from stubbed feeds, got ${jobs.length}`);
  assert.ok(jobs.every(j => j.title && j.url), 'All returned jobs must have title + url');
});

test('e2e run-2: dedup — zero new jobs on identical repeat run', async () => {
  const jobs = await main();
  assert.equal(jobs.length, 0, 'Second run must produce 0 new jobs (DB dedup via hasSeen/markSeen)');
});

test('e2e notify: stdout fallback completes without throwing when no channels set', async () => {
  // No DISCORD_WEBHOOK_URL / NOTIFY_EMAIL → notify() writes digest to stdout, never throws.
  const fakeJobs = [{
    company: 'TestCo',
    title: 'Finance Summer Analyst Intern',
    url: 'https://example.com/jobs/e2e-sentinel',
    location: 'New York',
  }];
  await assert.doesNotReject(() => notify(fakeJobs));
});
