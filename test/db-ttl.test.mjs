// test/db-ttl.test.mjs — seenRoles() TTL filter (last FUZZY_DEDUP_DAYS days).
// Run: node --test test/db-ttl.test.mjs
// Zero npm deps; uses node:test (built-in, Node 22+).
//
// The module-level DB_PATH const is captured at first import, so we set it
// once with a single temp file for the run and DELETE all rows in beforeEach
// to isolate tests.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// Set DB_PATH BEFORE importing db.mjs.
process.env.DB_PATH = join(tmpdir(), `db-ttl-${randomUUID()}.db`);
// Default cutoff. Env override verification is by code review — see db.mjs.
process.env.FUZZY_DEDUP_DAYS = '90';

const { openDb, seenRoles } = await import('../db.mjs');

function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

// Insert with a SPECIFIC first_seen date (markSeen() always uses today).
function insertRaw({ url, company, title, firstSeen }) {
  const db = openDb();
  db.prepare(
    'INSERT INTO jobs (url, company, title, location, first_seen, posted_at, canon) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(url, company, title, '', firstSeen, null, null);
}

function clearJobs() {
  openDb().prepare('DELETE FROM jobs').run();
}

describe('seenRoles TTL filter (90d window)', () => {
  beforeEach(clearJobs);

  test('drops stale titles, keeps recent ones', () => {
    insertRaw({ url: 'u30',  company: 'TestCo', title: 'Recent 30', firstSeen: daysAgo(30)  });
    insertRaw({ url: 'u60',  company: 'TestCo', title: 'Recent 60', firstSeen: daysAgo(60)  });
    insertRaw({ url: 'u120', company: 'TestCo', title: 'Stale 120', firstSeen: daysAgo(120) });
    insertRaw({ url: 'u200', company: 'TestCo', title: 'Stale 200', firstSeen: daysAgo(200) });

    const rows = seenRoles('TestCo').map(r => r.title).sort();
    assert.deepEqual(rows, ['Recent 30', 'Recent 60']);
  });

  test('boundary at 90 days: 89d included, 91d excluded', () => {
    insertRaw({ url: 'in89',  company: 'TestCo', title: 'In 89',  firstSeen: daysAgo(89)  });
    insertRaw({ url: 'out91', company: 'TestCo', title: 'Out 91', firstSeen: daysAgo(91)  });
    const rows = seenRoles('TestCo').map(r => r.title);
    assert.deepEqual(rows, ['In 89']);
  });

  test('scoped to the requested company only', () => {
    insertRaw({ url: 'o30',  company: 'OtherCo', title: 'Other recent', firstSeen: daysAgo(30)  });
    insertRaw({ url: 'o300', company: 'OtherCo', title: 'Other stale',  firstSeen: daysAgo(300) });
    insertRaw({ url: 't120', company: 'TestCo',  title: 'Test stale',   firstSeen: daysAgo(120) });

    assert.deepEqual(seenRoles('OtherCo').map(r => r.title), ['Other recent']);
    assert.deepEqual(seenRoles('TestCo').map(r => r.title), []);
  });

  test('empty-title rows are still excluded by the title filter', () => {
    insertRaw({ url: 'e1', company: 'TestCo', title: '',                 firstSeen: daysAgo(10) });
    insertRaw({ url: 'e2', company: 'TestCo', title: 'Real recent job', firstSeen: daysAgo(10) });
    const rows = seenRoles('TestCo').map(r => r.title);
    assert.deepEqual(rows, ['Real recent job']);
  });
});
