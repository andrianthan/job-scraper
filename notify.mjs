// notify.mjs — multi-channel notification dispatcher.
// Channels: Discord (DISCORD_WEBHOOK_URL | DISCORD_WEBHOOK) + email (NOTIFY_EMAIL + RESEND_API_KEY).
// No-config fallback: prints digest to stdout, exits 0 — never throws.
// Zero npm deps — email uses Resend REST API via fetch (per D-locked decision in 04-CONTEXT.md).

import { routeJobs, CHANNELS } from './field-router.mjs';

// ── Test hook ────────────────────────────────────────────────────────────────
// Inject a mock fetch in tests to assert call counts without real network.
let _fetch = (...a) => fetch(...a);
export function _setFetch(fn) { _fetch = fn; }

// ── Utilities ─────────────────────────────────────────────────────────────────
// Friendly source labels for the embed footer (job.source = provider id).
const SOURCE_LABELS = {
  greenhouse: 'Greenhouse', ashby: 'Ashby', workday: 'Workday', lever: 'Lever',
  simplify: 'SimplifyJobs', firecrawl: 'Web scrape', breezy: 'Breezy',
  smartrecruiters: 'SmartRecruiters', workable: 'Workable', recruitee: 'Recruitee',
  bamboohr: 'BambooHR', remoteok: 'RemoteOK', remotive: 'Remotive',
};
function sourceFooter(job) {
  if (!job.source) return {};
  return { footer: { text: `via ${SOURCE_LABELS[job.source] || job.source}` } };
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ── Discord channel ───────────────────────────────────────────────────────────
// Reads DISCORD_WEBHOOK_URL (canonical) with DISCORD_WEBHOOK alias.
// Chunks embeds at 10 (Discord API limit) — still one logical digest per run.
export async function notifyDiscord(jobs) {
  const webhook = process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK;
  if (!webhook) return;

  for (const batch of chunk(jobs, 10)) {
    const embeds = batch.map(j => ({
      title: `${j.company} — ${j.title}`.slice(0, 256),
      url: j.url,
      description: [
        j.location && `📍 ${j.location}`,
        j.salary && `💰 ${j.salary.min}-${j.salary.max} ${j.salary.currency}`,
        j.postedAt && `🗓️ Posted <t:${Math.floor(j.postedAt / 1000)}:f>`,
      ].filter(Boolean).join('\n') || undefined,
      color: 0x2b6cb0,
      ...sourceFooter(j),
    }));

    const res = await _fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: process.env.BOT_NAME || 'Papa Omega Phi',
        avatar_url: process.env.BOT_AVATAR_URL || undefined,
        content: `🆕 ${batch.length} new internship(s)`,
        embeds,
      }),
    });
    if (!res.ok) console.error(`✗ Discord ${res.status}: ${await res.text().catch(() => '')}`);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.error(`📨 pushed ${jobs.length} job(s) to Discord`);
}

// ── Field sub-channel routing ───────────────────────────────────────────────
// Fans each new job into its matched field channel(s) (finance, consulting,
// marketing-sales, tech-data, ops-hr), pinging the matched role(s) so opted-in
// members get notified. Independent of and additive to the #job-board firehose:
// a job appears in #job-board AND in every field channel it classifies into.
// Jobs that match no role are not routed here (firehose still covers them).
export async function notifyFieldChannels(jobs) {
  const routed = await routeJobs(jobs);
  if (!routed.size) return;

  for (const [channel, { webhook, entries }] of routed) {
    for (const batch of chunk(entries, 10)) {
      const embeds = batch.map(({ job }) => ({
        title: `${job.company} — ${job.title}`.slice(0, 256),
        url: job.url,
        description: [
          job.location && `📍 ${job.location}`,
          job.salary && `💰 ${job.salary.min}-${job.salary.max} ${job.salary.currency}`,
          job.postedAt && `🗓️ Posted <t:${Math.floor(job.postedAt / 1000)}:f>`,
        ].filter(Boolean).join('\n') || undefined,
        color: 0x2b6cb0,
        ...sourceFooter(job),
      }));
      const roleIds = [...new Set(batch.flatMap(e => e.roleIds))];
      const pings = roleIds.map(id => `<@&${id}>`).join(' ');

      const res = await _fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: process.env.BOT_NAME || 'Papa Omega Phi',
          avatar_url: process.env.BOT_AVATAR_URL || undefined,
          content: `🆕 ${batch.length} new role(s) ${pings}`.trim(),
          embeds,
          allowed_mentions: { parse: ['roles'] },
        }),
      });
      if (!res.ok) console.error(`✗ Discord[${channel}] ${res.status}: ${await res.text().catch(() => '')}`);
      await new Promise(r => setTimeout(r, 1000));
    }
    console.error(`📨 routed ${entries.length} job(s) to #${channel}`);
  }
}

// ── Email channel (Resend REST) ───────────────────────────────────────────────
// POST https://api.resend.com/emails — Authorization: Bearer RESEND_API_KEY
// NOTIFY_EMAIL = recipient. NOTIFY_EMAIL_FROM = sender (default onboarding@resend.dev).
// Errors are logged but never thrown — per graceful-degradation decision.
export async function notifyEmail(jobs) {
  const to = process.env.NOTIFY_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !apiKey) return;

  const from = process.env.NOTIFY_EMAIL_FROM || 'onboarding@resend.dev';
  const subject = `${jobs.length} new internship${jobs.length !== 1 ? 's' : ''}`;
  const html =
    `<h2>${subject}</h2><ul>` +
    jobs
      .map(j => `<li><a href="${j.url}">${j.company} — ${j.title}</a>${j.location ? ` [${j.location}]` : ''}</li>`)
      .join('') +
    '</ul>';

  let res;
  try {
    res = await _fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
  } catch (err) {
    console.error(`✗ Resend network error: ${err.message}`);
    return;
  }

  if (!res.ok) {
    console.error(`✗ Resend ${res.status}: ${await res.text().catch(() => '')}`);
  } else {
    console.error(`📧 email sent to ${to} (${jobs.length} job(s))`);
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
// One call per run. Fans out to every configured channel.
// No channels configured → stdout fallback, exits 0, no throw.
// Channel failure is logged but does not block the other channel.
export async function notify(jobs) {
  if (!jobs.length) return;

  const hasDiscord = !!(process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK);
  const hasEmail   = !!(process.env.NOTIFY_EMAIL && process.env.RESEND_API_KEY);
  const hasField   = Object.values(CHANNELS).some(env => process.env[env]);

  if (!hasDiscord && !hasEmail && !hasField) {
    // Graceful no-config: digest to stdout (NOTIF-03)
    console.log(`--- ${jobs.length} new internship${jobs.length !== 1 ? 's' : ''} ---`);
    for (const j of jobs) {
      console.log(`• ${j.company} — ${j.title}${j.location ? `  [${j.location}]` : ''}`);
      console.log(`  ${j.url}`);
    }
    return;
  }

  const results = await Promise.allSettled([
    hasDiscord ? notifyDiscord(jobs)       : Promise.resolve(),
    hasEmail   ? notifyEmail(jobs)         : Promise.resolve(),
    hasField   ? notifyFieldChannels(jobs) : Promise.resolve(),
  ]);

  for (const r of results) {
    if (r.status === 'rejected') {
      console.error('✗ channel error:', r.reason?.message ?? String(r.reason));
    }
  }
}
