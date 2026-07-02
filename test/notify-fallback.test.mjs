// test/notify-fallback.test.mjs — verifies notify.mjs routes apply URLs to
// fallbackUrl when the primary url is missing, and surfaces a footer note so
// the user knows they're hitting a third-party redirect.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.DB_PATH = join(tmpdir(), `notify-fallback-${randomUUID()}.db`);

delete process.env.DISCORD_WEBHOOK_URL;
delete process.env.DISCORD_WEBHOOK;
delete process.env.NOTIFY_EMAIL;
delete process.env.RESEND_API_KEY;

const { notifyDiscord, notifyEmail, _setFetch } = await import('../notify.mjs');
const { _closeDb } = await import('../db.mjs');

afterEach(() => {
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.DISCORD_WEBHOOK;
  delete process.env.NOTIFY_EMAIL;
  delete process.env.RESEND_API_KEY;
  _closeDb();
  process.env.DB_PATH = join(tmpdir(), `notify-fallback-${randomUUID()}.db`);
});

function captureFetch() {
  const calls = [];
  _setFetch(async (url, opts = {}) => {
    calls.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
    return { ok: true, status: 200, text: async () => '' };
  });
  return calls;
}

describe('Discord fallbackUrl handling', () => {
  test('uses job.url when present (no fallback note)', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.test/x';
    const calls = captureFetch();
    await notifyDiscord([{
      url: 'https://boards.greenhouse.io/acme/jobs/1',
      fallbackUrl: 'https://jobright.ai/jobs/info/abc',
      title: 'SWE Intern', company: 'Acme', location: 'NY', source: 'greenhouse',
    }]);
    assert.equal(calls.length, 1);
    const embed = calls[0].body.embeds[0];
    assert.equal(embed.url, 'https://boards.greenhouse.io/acme/jobs/1');
    assert.ok(!embed.description?.includes('jobright'));
  });

  test('falls back to fallbackUrl when url missing, appends ↪ note', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.test/x';
    const calls = captureFetch();
    await notifyDiscord([{
      url: '',
      fallbackUrl: 'https://jobright.ai/jobs/info/abc123',
      title: 'SWE Intern', company: 'Acme', location: 'NY', source: 'intern-list',
    }]);
    assert.equal(calls.length, 1);
    const embed = calls[0].body.embeds[0];
    assert.equal(embed.url, 'https://jobright.ai/jobs/info/abc123');
    assert.ok(embed.description?.includes('↪ apply via jobright.ai'));
  });

  test('handles missing url AND missing fallbackUrl with empty link, no note', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.test/x';
    const calls = captureFetch();
    await notifyDiscord([{
      url: '', title: 'X', company: 'X', source: 'greenhouse',
    }]);
    const embed = calls[0].body.embeds[0];
    assert.equal(embed.url, '');
    assert.ok(!embed.description?.includes('↪'));
  });

  test('mix of jobs with and without fallback all render correctly', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://discord.test/x';
    const calls = captureFetch();
    await notifyDiscord([
      { url: 'https://gh.example/1', fallbackUrl: 'https://jr/1', title: 'A', company: 'A', source: 'greenhouse' },
      { url: '', fallbackUrl: 'https://jr/2', title: 'B', company: 'B', source: 'intern-list' },
    ]);
    assert.equal(calls[0].body.embeds[0].url, 'https://gh.example/1');
    assert.equal(calls[0].body.embeds[1].url, 'https://jr/2');
    assert.ok(!calls[0].body.embeds[0].description?.includes('↪'));
    assert.ok(calls[0].body.embeds[1].description?.includes('↪ apply via jr'));
  });
});

describe('Email fallbackUrl handling', () => {
  test('renders fallback hostname annotation when url missing', async () => {
    process.env.NOTIFY_EMAIL = 'me@test';
    process.env.RESEND_API_KEY = 'rk';
    const calls = captureFetch();
    await notifyEmail([{
      url: '',
      fallbackUrl: 'https://jobright.ai/jobs/info/abc',
      title: 'X', company: 'Acme', location: 'NY',
    }]);
    assert.equal(calls.length, 1);
    const html = calls[0].body.html;
    assert.ok(html.includes('href="https://jobright.ai/jobs/info/abc"'));
    assert.ok(html.includes('<em>(via jobright.ai)</em>'));
  });

  test('no annotation when primary url present', async () => {
    process.env.NOTIFY_EMAIL = 'me@test';
    process.env.RESEND_API_KEY = 'rk';
    const calls = captureFetch();
    await notifyEmail([{
      url: 'https://gh.example/1',
      fallbackUrl: 'https://jobright.ai/jobs/info/abc',
      title: 'X', company: 'Acme', location: 'NY',
    }]);
    const html = calls[0].body.html;
    assert.ok(!html.includes('<em>'));
    assert.ok(html.includes('href="https://gh.example/1"'));
  });
});