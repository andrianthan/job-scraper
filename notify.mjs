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

// Pick the link to surface: prefer the direct ATS URL the provider captured,
// fall back to a third-party apply redirect (e.g. jobright.ai for intern-list
// aggregator entries). Returns the empty string when neither is present — the
// embed/title will still render, just without a clickable link.
function applyLink(job) {
  return job.url || job.fallbackUrl || '';
}

// Append a second footer line when we surfaced a fallback link, so the user
// knows the click is a third-party redirect and not a direct company ATS page.
function fallbackNote(job) {
  if (!job.fallbackUrl || job.url) return '';
  try {
    return `↪ apply via ${new URL(job.fallbackUrl).hostname}`;
  } catch {
    return '';
  }
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ── Company grouping ─────────────────────────────────────────────────────────
// Collapse N listings for one company into a single digest embed so a mega-ATS
// (Walmart, Simplify) doesn't spam the channel. Per-company soft cap prevents
// the embed description from blowing past Discord's 4096-char ceiling when a
// single firm drops 20+ listings. Tune with MAX_NOTIFY_PER_COMPANY (default 5;
// set 0 to disable truncation — embed truncation becomes the bound). Read on
// every call so test env changes take effect without a module reload.
function getMaxPerCompany() {
  return Number(process.env.MAX_NOTIFY_PER_COMPANY ?? 5);
}

/**
 * Group jobs by company. Within each group: freshest first, then alpha. Across
 * groups: freshest top listing first (so most-recent company is the leading
 * embed in the Discord message). Returns mutable objects — safe to consume in
 * the same tick, do not reuse across ticks.
 *
 * Each group carries `totalCount` (original size before truncation) so channel
 * renderers can show "8 new" in titles even when only 5 listings fit inside the
 * embed. `truncated` is the overflow that didn't make it into `jobs`.
 *
 * @param {Array<{company?:string,title:string,postedAt?:number,source?:string}>} jobs
 * @returns {Array<{company:string, source:string|null, jobs:Array, totalCount:number, truncated:number}>}
 */
export function groupByCompany(jobs) {
  const maxPerCompany = getMaxPerCompany();
  const by = new Map();
  const labelFor = (j) => (typeof j.company === 'string' && j.company.trim()) || 'Unknown';
  for (const j of jobs) {
    const key = labelFor(j);
    if (!by.has(key)) by.set(key, { company: key, source: j.source || null, jobs: [] });
    by.get(key).jobs.push(j);
  }
  const out = [];
  for (const g of by.values()) {
    g.jobs.sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0) || String(a.title).localeCompare(String(b.title)));
    g.totalCount = g.jobs.length;
    if (maxPerCompany && g.jobs.length > maxPerCompany) {
      g.truncated = g.jobs.length - maxPerCompany;
      g.jobs = g.jobs.slice(0, maxPerCompany);
    } else {
      g.truncated = 0;
    }
    out.push(g);
  }
  return out.sort((a, b) => (b.jobs[0]?.postedAt || 0) - (a.jobs[0]?.postedAt || 0));
}

/**
 * Most-common source label for a group's footers. Empty string → caller omits
 * the footer line. Handles the rare case where the same company surfaces from
 * two providers in one run (e.g. intern-list + Greenhouse both list Acme).
 * @param {{source?:string|null}[]} entries jobs in a single group
 */
function pickGroupSource(entries) {
  const counts = new Map();
  for (const j of entries) {
    const s = j.source || '';
    if (!s) continue;
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  if (!counts.size) return '';
  let best = '', bestN = 0;
  for (const [s, n] of counts) {
    if (n > bestN || (n === bestN && s < best)) { best = s; bestN = n; }
  }
  return best;
}

// ── Discord channel ───────────────────────────────────────────────────────────
// Reads DISCORD_WEBHOOK_URL (canonical) with DISCORD_WEBHOOK alias.
// Chunks embeds at 10 (Discord API limit) — still one logical digest per run.
// Jobs are grouped by company BEFORE chunking so a mega-ATS with N listings
// produces one embed (with N titles inside) instead of N embeds.
export async function notifyDiscord(jobs) {
  const webhook = process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK;
  if (!webhook) return;

  const groups = groupByCompany(jobs);
  for (const batch of chunk(groups, 10)) {
    const embeds = batch.map(groupEmbed);
    const totalListings = batch.reduce((n, g) => n + g.totalCount, 0);

    const res = await _fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: process.env.BOT_NAME || 'Papa Omega Phi',
        avatar_url: process.env.BOT_AVATAR_URL || undefined,
        content: `🆕 ${totalListings} new internship(s) across ${batch.length} compan${batch.length === 1 ? 'y' : 'ies'}`,
        embeds,
      }),
    });
    if (!res.ok) throw new Error(`Discord ${res.status}: ${await res.text().catch(() => '')}`);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.error(`📨 pushed ${jobs.length} job(s) across ${groups.length} compan${groups.length === 1 ? 'y' : 'ies'} to Discord`);
}

/**
 * Build one Discord/field-channel embed for a company group. Top-listing URL is
 * the clickable target — every other title in the group is reachable via the
 * jobright/info page in the listing body if the user needs alt sources.
 * @param {{company:string,source:string|null,jobs:any[],truncated?:number}} group
 */
function groupEmbed(group) {
  const top = group.jobs[0];
  const srcLabel = pickGroupSource(group.jobs);
  const n = group.totalCount;
  return {
    title: `${group.company} — ${n} new internship${n === 1 ? '' : 's'}`.slice(0, 256),
    url: applyLink(top),
    description: [
      ...group.jobs.map(j => `• **${j.title}**${j.location ? ` _(${j.location})_` : ''}${fallbackNote(j) ? ` _${fallbackNote(j)}_` : ''}`),
      group.truncated ? `… _+${group.truncated} more_` : null,
    ].filter(Boolean).join('\n') || undefined,
    color: 0x2b6cb0,
    ...(srcLabel ? sourceFooter({ source: srcLabel }) : {}),
  };
}

// ── Field sub-channel routing ───────────────────────────────────────────────
// Fans each new job into its matched field channel(s) (finance, consulting,
// marketing-sales, tech-data, ops-hr), pinging the matched role(s) so opted-in
// members get notified. Independent of and additive to the #job-board firehose:
// a job appears in #job-board AND in every field channel it classifies into.
// Jobs that match no role are not routed here (firehose still covers them).
// Within a field channel, jobs are ALSO grouped by company so a single firm
// dropping 5 finance intern roles doesn't produce 5 separate embeds — one
// "Acme — 5 new roles" embed with the 5 titles listed inside.
export async function notifyFieldChannels(jobs) {
  const routed = await routeJobs(jobs);
  if (!routed.size) return;

  for (const [channel, { webhook, entries }] of routed) {
    // Group by company inside this channel first, then chunk by Discord's
    // 10-embed limit. Role pings are deduped per batch via the original
    // roleIds so a "<@&finance-ping>" still appears once even if the group
    // spans multiple fields.
    const grouped = groupByCompany(entries.map((e) => e.job)).map((g) => ({
      group: g,
      roleIds: [...new Set(entries.filter((e) => e.job.company === g.company || (!e.job.company && g.company === 'Unknown')).flatMap((e) => e.roleIds))],
    }));

    for (const batch of chunk(grouped, 10)) {
      const embeds = batch.map(({ group }) => groupEmbed(group));
      const roleIds = [...new Set(batch.flatMap((b) => b.roleIds))];
      const pings = roleIds.map((id) => `<@&${id}>`).join(' ');
      const totalRoles = batch.reduce((n, b) => n + b.group.totalCount, 0);

      const res = await _fetch(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: process.env.BOT_NAME || 'Papa Omega Phi',
          avatar_url: process.env.BOT_AVATAR_URL || undefined,
          content: `🆕 ${totalRoles} new role(s) across ${batch.length} compan${batch.length === 1 ? 'y' : 'ies'} ${pings}`.trim(),
          embeds,
          allowed_mentions: { parse: ['roles'] },
        }),
      });
      if (!res.ok) throw new Error(`Discord[${channel}] ${res.status}: ${await res.text().catch(() => '')}`);
      await new Promise(r => setTimeout(r, 1000));
    }
    const totalListings = grouped.reduce((n, g) => n + g.group.totalCount, 0);
    console.error(`📨 routed ${totalListings} job(s) across ${grouped.length} compan${grouped.length === 1 ? 'y' : 'ies'} to #${channel}`);
  }
}

// ── Email channel (Resend REST) ───────────────────────────────────────────────
// POST https://api.resend.com/emails — Authorization: Bearer RESEND_API_KEY
// NOTIFY_EMAIL = recipient. NOTIFY_EMAIL_FROM = sender (default onboarding@resend.dev).
// Errors are logged but never thrown — per graceful-degradation decision.
// Email body groups by company so a Walmart-style flood produces one <h3>
// header with N <li> bullets instead of a flat soup.
export async function notifyEmail(jobs) {
  const to = process.env.NOTIFY_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !apiKey) return;

  const from = process.env.NOTIFY_EMAIL_FROM || 'onboarding@resend.dev';
  const groups = groupByCompany(jobs);
  const subject = `${jobs.length} new internship${jobs.length !== 1 ? 's' : ''} across ${groups.length} compan${groups.length === 1 ? 'y' : 'ies'}`;
  const html =
    `<h2>${subject}</h2>` +
    groups.map((g) => {
      const headerLabel = `${g.company} (${g.totalCount}${g.truncated ? ` — +${g.truncated} more` : ''})`;
      return `<h3>${headerLabel}</h3><ul>` +
        g.jobs.map((j) => {
          const href = applyLink(j);
          const tag = !j.url && j.fallbackUrl ? ' <em>(via ' + (() => {
            try { return new URL(j.fallbackUrl).hostname; } catch { return 'fallback'; }
          })() + ')</em>' : '';
          return `<li><a href="${href}">${j.title}</a>${j.location ? ` [${j.location}]` : ''}${tag}</li>`;
        }).join('') +
        '</ul>';
    }).join('');

  const res = await _fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => '')}`);
  console.error(`📧 email sent to ${to} (${jobs.length} job(s) across ${groups.length} compan${groups.length === 1 ? 'y' : 'ies'})`);
}

// ── Status heartbeat ──────────────────────────────────────────────────────────
// Posts a one-line health log to STATUS_WEBHOOK_URL on EVERY run — including
// zero-new-job runs, unlike notify() which returns early on empty. Gives a
// public #bot-status channel a visible hourly pulse proving the workflow ran.
// Never pings (allowed_mentions: parse []). No-op when the webhook is unset.
export async function notifyStatus({ scanned, parked, failed, newJobs, bySource = {} }) {
  const webhook = process.env.STATUS_WEBHOOK_URL;
  if (!webhook) return;

  const now = Math.floor(Date.now() / 1000);
  const intervalHours = parseInt(process.env.SCAN_INTERVAL_HOURS || '4', 10);
  const nowDate = new Date();
  const currentHour = nowDate.getUTCHours();
  // Next multiple of intervalHours strictly greater than current hour.
  // Example: hour=11, interval=4 → 12 (today). hour=14, interval=4 → 16 (today). hour=23, interval=4 → 24 (=0 next day).
  const nextHourMark = Math.floor(currentHour / intervalHours) * intervalHours + intervalHours;
  const nextRun = new Date(nowDate);
  nextRun.setUTCMinutes(0, 0, 0);
  nextRun.setUTCHours(nextHourMark % 24);
  if (nextHourMark >= 24) nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  // Roll day forward if computed time lands in the past (safety net for DST or clock drift).
  if (nextRun.getTime() <= nowDate.getTime()) nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  const nextTs = Math.floor(nextRun.getTime() / 1000);
  const breakdown = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${s} ${n}`)
    .join(' · ');
  const content = [
    `${failed === 0 ? '✅' : '⚠️'} **Scan complete** · <t:${now}:f>`,
    `\`${scanned}\` boards · \`${parked}\` parked · \`${failed}\` failed · \`${newJobs}\` new`,
    breakdown && `↳ ${breakdown}`,
    `↳ Next run <t:${nextTs}:t> (<t:${nextTs}:R>)`,
  ].filter(Boolean).join('\n');

  try {
    const res = await _fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: process.env.BOT_NAME || 'Papa Omega Phi',
        avatar_url: process.env.BOT_AVATAR_URL || undefined,
        content,
        allowed_mentions: { parse: [] }, // never notify anyone
      }),
    });
    if (!res.ok) console.error(`✗ status ${res.status}: ${await res.text().catch(() => '')}`);
  } catch (err) {
    console.error(`✗ status webhook error: ${err.message}`);
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
// One call per run. Fans out to every configured channel.
// Returns { ok, channels } so the caller can decide whether to set process.exitCode = 1.
// - ok: true  → no channels configured OR all configured channels succeeded.
// - ok: false → at least one configured channel threw; details in `channels`.
// Non-configured channels are OMITTED from `channels` entirely.
// Channel failures are isolated: one channel throwing does not block the others.
export async function notify(jobs) {
  if (!jobs.length) return { ok: true, channels: {} };

  const hasDiscord = !!(process.env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK);
  const hasEmail   = !!(process.env.NOTIFY_EMAIL && process.env.RESEND_API_KEY);
  const hasField   = Object.values(CHANNELS).some(env => process.env[env]);

  if (!hasDiscord && !hasEmail && !hasField) {
    // Graceful no-config: digest to stdout (NOTIF-03), grouped by company.
    const groups = groupByCompany(jobs);
    console.log(`--- ${jobs.length} new internship${jobs.length !== 1 ? 's' : ''} across ${groups.length} compan${groups.length === 1 ? 'y' : 'ies'} ---`);
    for (const g of groups) {
      console.log(`▸ ${g.company} (${g.totalCount}${g.truncated ? ` — +${g.truncated} more` : ''})`);
      for (const j of g.jobs) {
        console.log(`  • ${j.title}${j.location ? `  [${j.location}]` : ''}`);
        console.log(`    ${applyLink(j)}`);
      }
    }
    return { ok: true, channels: {} };
  }

  // Wrap each channel call in an IIFE so its rejection is caught at the
  // source (Node 15+ throws on unhandled rejections — awaiting later in a
  // try/catch is too late because the rejection fires before the loop reaches
  // that channel).
  async function run(name, fn) {
    try {
      await fn();
      return [name, { ok: true }];
    } catch (e) {
      console.error(`✗ ${name}: ${e.message}`);
      return [name, { ok: false, error: e.message }];
    }
  }

  const settled = await Promise.allSettled([
    hasDiscord ? run('discord', () => notifyDiscord(jobs)) : Promise.resolve(null),
    hasEmail   ? run('email',   () => notifyEmail(jobs))   : Promise.resolve(null),
    hasField   ? run('field',   () => notifyFieldChannels(jobs)) : Promise.resolve(null),
  ]);

  const channels = {};
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) {
      const [name, result] = r.value;
      channels[name] = result;
    }
    // run() never rejects (it catches internally) — but be defensive.
  }

  const ok = Object.values(channels).every(r => r.ok);
  return { ok, channels };
}
