// test/notify.test.mjs — credential-free proof of digest + dup-guard semantics.
// Run: node --test test/notify.test.mjs
// Zero npm deps; uses node:test (built-in, Node 22+).

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// ── DB isolation: each describe block gets a unique temp DB ──────────────────
// DB_PATH must be set BEFORE db.mjs is imported for the first time.
// Use a single temp file for this test run (module-level).
process.env.DB_PATH = join(tmpdir(), `notify-test-${randomUUID()}.db`);

// Ensure no real channels fire during tests
delete process.env.DISCORD_WEBHOOK_URL;
delete process.env.DISCORD_WEBHOOK;
delete process.env.NOTIFY_EMAIL;
delete process.env.RESEND_API_KEY;

const { markSeen, markNotified, getUnnotified, _closeDb } = await import('../db.mjs');
const { notify, notifyEmail, _setFetch } = await import('../notify.mjs');

// ── Helper ────────────────────────────────────────────────────────────────────
function fakeJobs(n, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    url: `https://example.com/job/${offset + i}`,
    company: 'TestCo',
    title: `Intern ${offset + i}`,
    location: 'New York',
  }));
}

// ── Suite: dup guard (NOTIF-04) ───────────────────────────────────────────────
describe('getUnnotified dup guard', () => {
  afterEach(() => {
    _closeDb(); // reset singleton so next test reopens fresh
    process.env.DB_PATH = join(tmpdir(), `notify-test-${randomUUID()}.db`);
  });

  test('all newly-seen jobs are un-notified', () => {
    const jobs = fakeJobs(5, 100);
    for (const j of jobs) markSeen(j);
    assert.equal(getUnnotified(jobs).length, 5, 'all 5 should be un-notified');
  });

  test('jobs are excluded after markNotified', () => {
    const jobs = fakeJobs(3, 200);
    for (const j of jobs) markSeen(j);
    markNotified(jobs.map(j => j.url));
    assert.equal(getUnnotified(jobs).length, 0, '0 after marking notified');
  });

  test('markNotified is idempotent (no throw on second call)', () => {
    const jobs = fakeJobs(2, 300);
    for (const j of jobs) markSeen(j);
    markNotified(jobs.map(j => j.url));
    assert.doesNotThrow(() => markNotified(jobs.map(j => j.url)));
  });

  test('empty input returns empty array', () => {
    assert.deepEqual(getUnnotified([]), []);
  });
});

// ── Suite: dispatcher (NOTIF-01 / NOTIF-02 / NOTIF-03) ───────────────────────
describe('notify dispatcher', () => {
  afterEach(() => {
    delete process.env.DISCORD_WEBHOOK_URL;
    delete process.env.DISCORD_WEBHOOK;
    delete process.env.NOTIFY_EMAIL;
    delete process.env.RESEND_API_KEY;
  });

  test('NOTIF-03: no channels → no fetch calls (stdout only)', async () => {
    const calls = [];
    _setFetch((...a) => { calls.push(a); return Promise.resolve({ ok: true, text: async () => '' }); });

    const jobs = fakeJobs(5, 400);
    await notify(jobs); // no env vars set

    assert.equal(calls.length, 0, 'fetch must not be called when no channels configured');
  });

  test('NOTIF-02: email channel → exactly 1 fetch call to Resend', async () => {
    const calls = [];
    _setFetch((...a) => { calls.push(a); return Promise.resolve({ ok: true, text: async () => '' }); });

    process.env.NOTIFY_EMAIL = 'test@example.com';
    process.env.RESEND_API_KEY = 'test_key_stub';

    const jobs = fakeJobs(5, 500);
    await notify(jobs);

    assert.equal(calls.length, 1, '5 jobs → exactly 1 Resend fetch call (NOTIF-01)');
    const [url, opts] = calls[0];
    assert.ok(url.includes('resend.com/emails'), 'must call Resend endpoint');
    assert.ok(opts.headers['Authorization'].startsWith('Bearer '), 'must send Bearer token');

    const body = JSON.parse(opts.body);
    assert.equal(body.to, 'test@example.com');
  });

  test('NOTIF-01: 5 jobs with email → 1 send, not 5', async () => {
    const calls = [];
    _setFetch((...a) => { calls.push(a); return Promise.resolve({ ok: true, text: async () => '' }); });

    process.env.NOTIFY_EMAIL = 'test@example.com';
    process.env.RESEND_API_KEY = 'test_key_stub';

    const jobs = fakeJobs(5, 600);
    await notifyEmail(jobs); // test the channel directly

    assert.equal(calls.length, 1, 'notifyEmail must send exactly 1 request regardless of job count');
  });

  test('notify with empty array is a no-op', async () => {
    const calls = [];
    _setFetch((...a) => { calls.push(a); return Promise.resolve({ ok: true }); });
    await notify([]);
    assert.equal(calls.length, 0);
  });
});
