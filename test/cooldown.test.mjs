import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.DB_PATH = join(tmpdir(), `cooldown-test-${randomUUID()}.db`);

const { getCooldownUntil, setCooldownUntil, openDb, _closeDb } = await import('../db.mjs');

afterEach(() => {
  _closeDb();
  process.env.DB_PATH = join(tmpdir(), `cooldown-test-${randomUUID()}.db`);
});

test('getCooldownUntil: returns null when no cache row exists', () => {
  assert.equal(getCooldownUntil('https://no-such-feed.example/'), null);
});

test('setCooldownUntil then getCooldownUntil round-trips ISO string', () => {
  const url = 'https://example.com/feed';
  const iso = new Date(Date.now() + 3_600_000).toISOString();
  setCooldownUntil(url, iso);
  assert.equal(getCooldownUntil(url), iso);
});

test('setCooldownUntil overwrites prior value', () => {
  const url = 'https://example.com/feed';
  setCooldownUntil(url, '2020-01-01T00:00:00.000Z');
  const iso = '2026-07-01T00:00:00.000Z';
  setCooldownUntil(url, iso);
  assert.equal(getCooldownUntil(url), iso);
});

test('setCooldownUntil(null) clears cooldown', () => {
  const url = 'https://example.com/feed';
  setCooldownUntil(url, '2026-07-01T00:00:00.000Z');
  setCooldownUntil(url, null);
  assert.equal(getCooldownUntil(url), null);
});

test('cooldown_until column added by migration on first open', () => {
  // openDb() must have added cooldown_until without throwing — verify via direct query.
  const db = openDb();
  const cols = db.prepare("PRAGMA table_info(feed_cache)").all().map(c => c.name);
  assert.ok(cols.includes('cooldown_until'));
});