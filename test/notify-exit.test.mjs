// test/notify-exit.test.mjs — notify() returns {ok, channels} and dispatcher
// catches per-channel throws. exit code surface lives in scan.mjs (untested
// directly — would require subprocess) but the result-object contract is the
// load-bearing piece; if it's wrong, scan.mjs's exit-code logic is too.
// Run: node --test test/notify-exit.test.mjs
// Zero npm deps; uses node:test (built-in, Node 22+).

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Configure at least two channels BEFORE importing notify.mjs, so the
// dispatcher actually attempts them.
process.env.DISCORD_WEBHOOK_URL = 'https://discord.example.test/webhook/abc';
process.env.NOTIFY_EMAIL = 'test@example.com';
process.env.RESEND_API_KEY = 'test_key_stub';

const { notify, _setFetch } = await import('../notify.mjs');

// ── Helpers ──────────────────────────────────────────────────────────────────
function fakeJobs(n, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    url: `https://example.com/job/${offset + i}`,
    company: 'TestCo',
    title: `Intern ${offset + i}`,
    location: 'New York',
  }));
}

// ── Suite: dispatcher result-object contract ──────────────────────────────────
describe('notify dispatcher result shape', () => {
  afterEach(() => {
    _setFetch((...a) => fetch(...a)); // restore real fetch
  });

  test('all channels succeed → ok:true, no error fields', async () => {
    _setFetch(async () => ({ ok: true, text: async () => '' }));

    const result = await notify(fakeJobs(3, 0));
    assert.equal(result.ok, true);
    assert.equal(result.channels.discord.ok, true);
    assert.equal(result.channels.email.ok, true);
    assert.equal(result.channels.discord.error, undefined);
    assert.equal(result.channels.email.error, undefined);
  });

  test('Discord throws → channels.discord.ok:false with error.message', async () => {
    _setFetch(async (url) => {
      if (String(url).includes('discord')) throw new Error('discord boom');
      return { ok: true, text: async () => '' };
    });

    const result = await notify(fakeJobs(3, 100));
    assert.equal(result.ok, false);
    assert.equal(result.channels.discord.ok, false);
    assert.equal(result.channels.discord.error, 'discord boom');
    assert.equal(result.channels.email.ok, true);
  });

  test('Email returns non-OK → channels.email.ok:false with Resend <status>', async () => {
    _setFetch(async (url) => {
      if (String(url).includes('resend.com')) {
        return { ok: false, status: 500, text: async () => 'internal error' };
      }
      return { ok: true, text: async () => '' };
    });

    const result = await notify(fakeJobs(2, 200));
    assert.equal(result.ok, false);
    assert.equal(result.channels.email.ok, false);
    assert.match(result.channels.email.error, /^Resend 500:/);
    assert.equal(result.channels.discord.ok, true);
  });

  test('BOTH channels fail → ok:false with both errors captured', async () => {
    _setFetch(async (url) => {
      if (String(url).includes('discord')) throw new Error('discord boom');
      if (String(url).includes('resend.com')) {
        return { ok: false, status: 500, text: async () => 'upstream bust' };
      }
      throw new Error('unexpected fetch: ' + url);
    });

    const result = await notify(fakeJobs(1, 300));
    assert.equal(result.ok, false);
    assert.equal(result.channels.discord.ok, false);
    assert.equal(result.channels.discord.error, 'discord boom');
    assert.equal(result.channels.email.ok, false);
    assert.match(result.channels.email.error, /^Resend 500:/);
    // One failure must not prevent the other channel from being attempted.
    assert.equal(Object.keys(result.channels).length, 2);
  });

  test('empty job list → ok:true, empty channels (no fetch attempted)', async () => {
    let calls = 0;
    _setFetch(async () => { calls++; return { ok: true, text: async () => '' }; });
    const result = await notify([]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.channels, {});
    assert.equal(calls, 0);
  });
});
