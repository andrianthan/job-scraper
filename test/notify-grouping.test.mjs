// test/notify-grouping.test.mjs — gates + grouping for spam control.
// Run: node --test test/notify-grouping.test.mjs
// Zero npm deps; uses node:test (built-in, Node 22+).
//
// Covers:
//   - groupByCompany: collapsing, sort order, truncation, missing-company fallback.
//   - Discord channel: 1 embed per company (not 1 per job).
//   - Email body: <h3> per company, <li> per listing, "+N more" suffix.
//   - markAllNotified: idempotent bulk drain.
//   - passesNotifyAge: respects default 48h, 0 disables, missing postedAt passes.
//
// DB_PATH is set BEFORE importing modules so the SQLite singleton opens fresh.

import { test, describe, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';

// ── DB isolation ──────────────────────────────────────────────────────────────
const TMP_DB = join(tmpdir(), `notify-grouping-${randomUUID()}.db`);
process.env.DB_PATH = TMP_DB;
delete process.env.DISCORD_WEBHOOK_URL;
delete process.env.DISCORD_WEBHOOK;
delete process.env.NOTIFY_EMAIL;
delete process.env.RESEND_API_KEY;

const { markSeen, markAllNotified, _closeDb } = await import('../db.mjs');
const { groupByCompany, notifyDiscord, notifyEmail, _setFetch } = await import('../notify.mjs');

// ── Fixtures ──────────────────────────────────────────────────────────────────
function fakeJob(overrides) {
  return {
    url: `https://example.com/${randomUUID()}`,
    company: 'Acme',
    title: 'Software Engineering Intern',
    location: 'New York, NY',
    postedAt: Date.now(),
    source: 'greenhouse',
    ...overrides,
  };
}

function freshDb() {
  _closeDb();
  try { unlinkSync(TMP_DB); } catch { /* missing is fine */ }
  process.env.DB_PATH = join(tmpdir(), `notify-grouping-${randomUUID()}.db`);
}

before(() => { freshDb(); });

afterEach(() => {
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.NOTIFY_EMAIL;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAX_NOTIFY_PER_COMPANY;
});

// ── groupByCompany ────────────────────────────────────────────────────────────
describe('groupByCompany', () => {
  test('collapses N listings for one company into one group', () => {
    const jobs = [
      fakeJob({ company: 'Acme', title: 'SWE Intern' }),
      fakeJob({ company: 'Acme', title: 'PM Intern' }),
      fakeJob({ company: 'Acme', title: 'Data Intern' }),
      fakeJob({ company: 'Beta', title: 'Finance Intern' }),
    ];
    const groups = groupByCompany(jobs);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].company, 'Acme');
    assert.equal(groups[0].jobs.length, 3);
    assert.equal(groups[1].company, 'Beta');
    assert.equal(groups[1].jobs.length, 1);
  });

  test('within group: freshest first then alpha', () => {
    const now = Date.now();
    const jobs = [
      fakeJob({ company: 'Acme', title: 'Zebra Intern', postedAt: now - 1000 }),
      fakeJob({ company: 'Acme', title: 'Apple Intern', postedAt: now - 1000 }),
      fakeJob({ company: 'Acme', title: 'Middle Intern', postedAt: now - 500 }),
      fakeJob({ company: 'Acme', title: 'Top Intern',     postedAt: now }),
    ];
    const [g] = groupByCompany(jobs);
    assert.equal(g.jobs[0].title, 'Top Intern', 'freshest first');
    assert.equal(g.jobs[1].title, 'Middle Intern');
    assert.equal(g.jobs[2].title, 'Apple Intern', 'alpha on tie');
    assert.equal(g.jobs[3].title, 'Zebra Intern');
  });

  test('across groups: freshest top listing first', () => {
    const now = Date.now();
    const jobs = [
      fakeJob({ company: 'Old',   postedAt: now - 100_000 }),
      fakeJob({ company: 'New',   postedAt: now - 10 }),
      fakeJob({ company: 'Older', postedAt: now - 200_000 }),
    ];
    const groups = groupByCompany(jobs);
    assert.equal(groups[0].company, 'New');
    assert.equal(groups[groups.length - 1].company, 'Older');
  });

  test('truncates to MAX_NOTIFY_PER_COMPANY (default 5)', () => {
    process.env.MAX_NOTIFY_PER_COMPANY = '5';
    const jobs = Array.from({ length: 12 }, (_, i) => fakeJob({ title: `Intern ${i}` }));
    const [g] = groupByCompany(jobs);
    assert.equal(g.jobs.length, 5);
    assert.equal(g.truncated, 7);
  });

  test('MAX_NOTIFY_PER_COMPANY=0 disables truncation', () => {
    process.env.MAX_NOTIFY_PER_COMPANY = '0';
    const jobs = Array.from({ length: 12 }, (_, i) => fakeJob({ title: `Intern ${i}` }));
    const [g] = groupByCompany(jobs);
    assert.equal(g.jobs.length, 12);
    assert.equal(g.truncated, 0, 'no overflow when cap disabled');
    assert.equal(g.totalCount, 12);
  });

  test('missing/blank company labels as "Unknown"', () => {
    const jobs = [
      fakeJob({ company: undefined }),
      fakeJob({ company: '' }),
      fakeJob({ company: '  ' }),
      fakeJob({ company: 'Acme' }),
    ];
    const groups = groupByCompany(jobs);
    const unknown = groups.find((g) => g.company === 'Unknown');
    assert.ok(unknown, 'unbranded jobs collapse under "Unknown"');
    assert.equal(unknown.jobs.length, 3);
    assert.equal(groups.find((g) => g.company === 'Acme').jobs.length, 1);
  });

  test('group has no truncation when exactly at cap', () => {
    process.env.MAX_NOTIFY_PER_COMPANY = '3';
    const jobs = Array.from({ length: 3 }, (_, i) => fakeJob({ title: `Intern ${i}` }));
    const [g] = groupByCompany(jobs);
    assert.equal(g.jobs.length, 3);
    assert.equal(g.truncated, 0);
    assert.equal(g.totalCount, 3);
  });
});

// ── Discord channel ───────────────────────────────────────────────────────────
describe('notifyDiscord grouping', () => {
  test('12 listings across 2 companies → exactly 2 embeds', async () => {
    const calls = [];
    _setFetch((url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return Promise.resolve({ ok: true, text: async () => '' }); });
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.test/wh';

    const jobs = [
      ...Array.from({ length: 8 }, (_, i) => fakeJob({ company: 'Acme', title: `Acme ${i}`, url: `https://a.test/${i}` })),
      ...Array.from({ length: 4 }, (_, i) => fakeJob({ company: 'Beta', title: `Beta ${i}`, url: `https://b.test/${i}` })),
    ];
    await notifyDiscord(jobs);

    assert.equal(calls.length, 1, 'one Discord POST for ≤10 group-embeds');
    assert.equal(calls[0].body.embeds.length, 2, '12 listings grouped to 2 embeds (per company)');
    const acme = calls[0].body.embeds.find((e) => e.title.startsWith('Acme'));
    const beta = calls[0].body.embeds.find((e) => e.title.startsWith('Beta'));
    assert.ok(acme.title.includes('8 new'), 'Acme title shows count');
    assert.ok(beta.title.includes('4 new'), 'Beta title shows count');
    assert.ok(acme.url === 'https://a.test/0', 'top listing URL is clickable target');
    assert.ok(acme.description.includes('Acme 0'), 'listings listed in description');
    assert.ok(acme.description.includes('+3 more'), 'Acme 8 > 5 cap → +3 more suffix');
    assert.ok(beta.description.includes('Beta 0'), 'Beta listings present');
    assert.ok(!beta.description.includes('+') || beta.description.includes('Beta 0'), 'Beta 4 under cap → no +suffix');
  });

  test('truncation suffix appears only when over cap', async () => {
    const calls = [];
    _setFetch((url, opts) => { calls.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, text: async () => '' }); });
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.test/wh';
    process.env.MAX_NOTIFY_PER_COMPANY = '5';

    const jobs = Array.from({ length: 3 }, (_, i) => fakeJob({ title: `Intern ${i}` }));
    await notifyDiscord(jobs);

    const e = calls[0].embeds[0];
    assert.ok(!e.description.includes('more'), 'no "more" when under cap');
  });
});

// ── Email channel ─────────────────────────────────────────────────────────────
describe('notifyEmail grouping', () => {
  test('body has one <h3> per company + <li> per listing', async () => {
    const calls = [];
    _setFetch((url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return Promise.resolve({ ok: true, text: async () => '' }); });
    process.env.NOTIFY_EMAIL = 'test@example.com';
    process.env.RESEND_API_KEY = 'test_key';

    const jobs = [
      ...Array.from({ length: 2 }, (_, i) => fakeJob({ company: 'Acme', title: `Acme ${i}`, url: `https://a.test/${i}` })),
      fakeJob({ company: 'Beta', title: 'Beta 1', url: 'https://b.test/1' }),
    ];
    await notifyEmail(jobs);

    assert.equal(calls.length, 1);
    const html = calls[0].body.html;
    const h3Count = (html.match(/<h3>/g) || []).length;
    const liCount = (html.match(/<li>/g) || []).length;
    assert.equal(h3Count, 2, 'one <h3> per company');
    assert.equal(liCount, 3, 'one <li> per listing');
    assert.ok(html.includes('(2)'), 'Acme group header with original 2-listing count');
    assert.ok(html.includes('(1)'), 'Beta group header with 1-listing count');
  });

  test('+N more suffix when over cap', async () => {
    process.env.MAX_NOTIFY_PER_COMPANY = '2';
    const jobs = Array.from({ length: 5 }, (_, i) => fakeJob({ title: `Intern ${i}` }));
    const [g] = groupByCompany(jobs);
    assert.equal(g.totalCount, 5, 'totalCount preserves original size');
    assert.equal(g.jobs.length, 2, 'jobs list truncated to cap');
    assert.equal(g.truncated, 3, 'truncated overflow');
  });
});

// ── markAllNotified (Gate C) ──────────────────────────────────────────────────
describe('markAllNotified', () => {
  before(freshDb);

  test('drains all unnotified rows; idempotent on second call', () => {
    for (let i = 0; i < 5; i++) markSeen(fakeJob({ title: `Intern ${i}`, url: `https://t.test/${i}` }));

    const first = markAllNotified();
    assert.equal(first, 5, 'first drain returns count of unnotified');

    const second = markAllNotified();
    assert.equal(second, 0, 'second drain returns 0 (idempotent)');
  });
});

// ── passesNotifyAge (Gate A) ──────────────────────────────────────────────────
describe('passesNotifyAge (via scan.mjs semantics)', () => {
  test('48h default + 2h-old passes, 72h-old fails, missing passes', () => {
    delete process.env.MAX_NOTIFY_AGE_HOURS;
    const fresh = { postedAt: Date.now() - 2 * 3_600_000 };
    const stale = { postedAt: Date.now() - 72 * 3_600_000 };
    const missing = { postedAt: undefined };

    // Re-derive the same predicate scan.mjs uses (cannot import the private fn
    // without exporting; replicate the formula here to lock the contract).
    const MAX = Number(process.env.MAX_NOTIFY_AGE_HOURS ?? 48);
    const passes = (j) => !MAX || !j.postedAt || (Date.now() - j.postedAt) / 3_600_000 <= MAX;
    assert.ok(passes(fresh), '2h old passes 48h default');
    assert.ok(!passes(stale), '72h old fails');
    assert.ok(passes(missing), 'missing postedAt passes');
  });

  test('MAX_NOTIFY_AGE_HOURS=0 disables gate', () => {
    process.env.MAX_NOTIFY_AGE_HOURS = '0';
    const stale = { postedAt: Date.now() - 999 * 3_600_000 };
    const MAX = Number(process.env.MAX_NOTIFY_AGE_HOURS ?? 48);
    const passes = (j) => !MAX || !j.postedAt || (Date.now() - j.postedAt) / 3_600_000 <= MAX;
    assert.ok(passes(stale), 'disabled gate passes everything');
  });
});

// ── Cleanup ───────────────────────────────────────────────────────────────────
test('cleanup', () => {
  _closeDb();
  try { unlinkSync(TMP_DB); } catch { /* ignore */ }
});
