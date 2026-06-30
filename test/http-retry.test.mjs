import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson } from '../providers/_http.mjs';

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

function stub(responses) {
  let i = 0;
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    const r = responses[Math.min(i++, responses.length - 1)];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      headers: new Headers(r.headers || {}),
      text: async () => r.body ?? '',
      json: async () => JSON.parse(r.body ?? '{}'),
    };
  };
  return calls;
}

test('fetchJson throws BAD_JSON on 200 with non-JSON body', async () => {
  stub([{ status: 200, body: '<html>not json</html>' }]);
  await assert.rejects(
    () => fetchJson('https://example.test/feed'),
    (err) => {
      assert.equal(err.code, 'BAD_JSON');
      assert.equal(err.status, 200);
      assert.ok(err.message.includes('Bad JSON'));
      assert.ok(err.message.includes('not json'));
      return true;
    }
  );
});

test('fetchJson parses valid JSON', async () => {
  stub([{ status: 200, body: '{"jobs":[{"id":1}]}' }]);
  const out = await fetchJson('https://example.test/feed');
  assert.deepEqual(out, { jobs: [{ id: 1 }] });
});

test('fetchJson retries 5xx then succeeds on 200 JSON', async () => {
  const calls = stub([
    { status: 500, body: 'fail' },
    { status: 500, body: 'fail' },
    { status: 200, body: '{"ok":true}' },
  ]);
  const out = await fetchJson('https://example.test/feed');
  assert.deepEqual(out, { ok: true });
  assert.ok(calls.length >= 3, `expected ≥3 calls (retries), got ${calls.length}`);
});

test('fetchJson does not retry BAD_JSON', async () => {
  const calls = stub([{ status: 200, body: 'definitely not json' }]);
  await assert.rejects(() => fetchJson('https://example.test/feed'), (e) => e.code === 'BAD_JSON');
  assert.equal(calls.length, 1, 'BAD_JSON must not trigger retries');
});