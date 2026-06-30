import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';

const TMP_DB = join(tmpdir(), `simplify-test-${randomUUID()}.db`);
process.env.DB_PATH = TMP_DB;

const originalFetch = globalThis.fetch;

const { default: simplify, resolveSeasonBranch } = await import('../providers/simplify.mjs');
const { makeHttpCtx } = await import('../providers/_http.mjs');
const { _closeDb, getFeedCache, openDb, setFeedCache } = await import('../db.mjs');

const CACHE_KEY = 'simplify:listings';
const BRANCH = 'Summer2026-Internships';
const CAREERS_URL = `https://raw.githubusercontent.com/SimplifyJobs/${BRANCH}/dev/.github/scripts/listings.json`;

function response({ status = 200, json, text, headers = {} }) {
  const body = text ?? (json == null ? '' : JSON.stringify(json));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => json ?? JSON.parse(body),
    text: async () => body,
  };
}

function header(headers, name) {
  const target = name.toLowerCase();
  if (headers instanceof Headers) return headers.get(name);
  const match = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === target);
  return match?.[1] ?? null;
}

function installFetchQueue(handlers) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const index = calls.length;
    calls.push({ url: String(url), opts });
    assert.ok(index < handlers.length, `Unexpected fetch call to ${url}`);
    return response(await handlers[index](String(url), opts));
  };
  return calls;
}

function listing(id = '1') {
  return [{
    active: true,
    is_visible: true,
    title: `Finance Intern ${id}`,
    url: `https://example.com/jobs/${id}`,
    company_name: 'ExampleCo',
    locations: ['New York'],
    date_posted: 1_780_000_000,
  }];
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
  openDb().exec('DELETE FROM feed_cache');
});

after(() => {
  globalThis.fetch = originalFetch;
  _closeDb();
  for (const path of [TMP_DB, `${TMP_DB}-shm`, `${TMP_DB}-wal`]) {
    try { unlinkSync(path); } catch { /* already removed */ }
  }
});

test('resolveSeasonBranch picks branch with highest date_posted', async () => {
  const year = new Date().getFullYear();
  const branches = [
    `Summer${year}-Internships`,
    `Summer${year + 1}-Internships`,
    `Summer${year + 2}-Internships`,
  ];
  const calls = installFetchQueue([
    (url, opts) => {
      assert.ok(url.includes(branches[0]));
      assert.equal(header(opts.headers, 'range'), 'bytes=0-1023');
      return { status: 200, json: [{ date_posted: 1_780_000_000 }] };
    },
    (url, opts) => {
      assert.ok(url.includes(branches[1]));
      assert.equal(header(opts.headers, 'range'), 'bytes=0-1023');
      return { status: 200, json: [{ date_posted: 1_790_000_000 }] };
    },
    (url, opts) => {
      assert.ok(url.includes(branches[2]));
      assert.equal(header(opts.headers, 'range'), 'bytes=0-1023');
      return { status: 404, text: '' };
    },
  ]);

  const result = await resolveSeasonBranch(makeHttpCtx());

  assert.deepEqual(result, { branch: branches[1], maxDate: 1_790_000_000 });
  assert.equal(getFeedCache(CACHE_KEY).picked_branch, branches[1]);
  assert.equal(calls.length, 3);
});

test('first fetch hits network + persists etag', async () => {
  setFeedCache(CACHE_KEY, { picked_branch: BRANCH });
  installFetchQueue([
    (url, opts) => {
      assert.equal(url, CAREERS_URL);
      assert.equal(header(opts.headers, 'if-none-match'), null);
      return { status: 200, headers: { etag: 'etag-v1' }, json: listing('first') };
    },
  ]);

  const jobs = await simplify.fetch({ careers_url: CAREERS_URL }, makeHttpCtx());

  assert.equal(jobs.length, 1);
  assert.equal(getFeedCache(CACHE_KEY).etag, 'etag-v1');
});

test('second fetch with If-None-Match returns empty array on 304', async () => {
  setFeedCache(CACHE_KEY, { picked_branch: BRANCH });
  installFetchQueue([
    () => ({ status: 200, headers: { etag: 'etag-v1' }, json: listing('cached') }),
    (_url, opts) => {
      assert.equal(header(opts.headers, 'if-none-match'), 'etag-v1');
      return { status: 304, text: '' };
    },
  ]);

  const first = await simplify.fetch({ careers_url: CAREERS_URL }, makeHttpCtx());
  const second = await simplify.fetch({ careers_url: CAREERS_URL }, makeHttpCtx());

  assert.equal(first.length, 1);
  assert.deepEqual(second, []);
});

test('server returns new etag parses normally', async () => {
  setFeedCache(CACHE_KEY, { picked_branch: BRANCH });
  installFetchQueue([
    () => ({ status: 200, headers: { etag: 'etag-v1' }, json: listing('old') }),
    (_url, opts) => {
      assert.equal(header(opts.headers, 'if-none-match'), 'etag-v1');
      return { status: 200, headers: { etag: 'etag-v2' }, json: listing('new') };
    },
  ]);

  await simplify.fetch({ careers_url: CAREERS_URL }, makeHttpCtx());
  const jobs = await simplify.fetch({ careers_url: CAREERS_URL }, makeHttpCtx());

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Finance Intern new');
  assert.equal(getFeedCache(CACHE_KEY).etag, 'etag-v2');
});
