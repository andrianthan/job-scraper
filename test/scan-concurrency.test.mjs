// test/scan-concurrency.test.mjs — proves the scan loop runs in parallel and
// returns all fetched jobs.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';

const TMP_DB = join(tmpdir(), `concurrency-test-${randomUUID()}.db`);
process.env.DB_PATH = TMP_DB;
process.env.SCAN_CONCURRENCY = '8';
delete process.env.DISCORD_WEBHOOK_URL;
delete process.env.DISCORD_WEBHOOK;
delete process.env.STATUS_WEBHOOK_URL;
delete process.env.NOTIFY_EMAIL;
delete process.env.RESEND_API_KEY;
delete process.env.FIRECRAWL_API_KEY;

const STUB_ENTRIES = Array.from({ length: 5 }, (_, i) => ({
  name: `Stub Co ${i}`,
  careers_url: `https://boards.greenhouse.io/stubco${i}`,
  api: `https://boards-api.greenhouse.io/v1/boards/stubco${i}/jobs`,
  provider: 'greenhouse',
}));

const STUB_JOB = (i) => ({
  id: String(i),
  absolute_url: `https://boards-api.greenhouse.io/v1/boards/stubco${i}/jobs/${i}`,
  title: `Finance Summer Analyst Intern Co ${i}`,
  location: { name: 'New York' },
  first_published: new Date().toISOString(),
});

const originalFetch = globalThis.fetch;

globalThis.fetch = async (url) => {
  await new Promise(r => setTimeout(r, 50));
  const match = String(url).match(/stubco(\d+)/);
  const i = Number(match?.[1] ?? 0);
  const body = { jobs: [STUB_JOB(i)] };
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
};

const { main } = await import('../scan.mjs');
const configMod = await import('../portals.config.mjs');
const { _closeDb } = await import('../db.mjs');

after(() => {
  globalThis.fetch = originalFetch;
  _closeDb();
  for (const p of [TMP_DB, `${TMP_DB}-shm`, `${TMP_DB}-wal`]) {
    try { unlinkSync(p); } catch { /* ignore */ }
  }
});

test('scan fan-out: 5 boards × 50ms each complete in <250ms wall-clock', async () => {
  const realList = configMod.default.trackedCompanies;
  configMod.default.trackedCompanies = STUB_ENTRIES;
  try {
    const t0 = Date.now();
    const jobs = await main();
    const elapsed = Date.now() - t0;
    assert.equal(jobs.length, 5, `expected 5 new jobs, got ${jobs.length}`);
    assert.ok(elapsed < 250, `wall-clock ${elapsed}ms should be <250ms (parallel); serial would be 250ms+`);
  } finally {
    configMod.default.trackedCompanies = realList;
  }
});
