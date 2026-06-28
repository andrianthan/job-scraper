# Phase 4: Notifications - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Make notifications batched (one digest per run), multi-channel (Discord + email),
graceful when unconfigured, and dup-protected (never notify the same job twice).

In scope: notify.mjs (digest + email channel + channel selection), a DB-backed
sent guard. Out of scope: web, multi-user, SMS.
</domain>

<decisions>
## Implementation Decisions

### Locked
- **Email via HTTP API, NOT SMTP** — use Resend's REST API
  (`POST https://api.resend.com/emails`, `Authorization: Bearer $RESEND_API_KEY`)
  with plain `fetch`. This keeps the project ZERO npm deps (no nodemailer). Do
  NOT add any email library.
- **Env contract:**
  - Discord: `DISCORD_WEBHOOK_URL` (canonical) — also accept `DISCORD_WEBHOOK` as
    an alias (roadmap success criteria names it `DISCORD_WEBHOOK`). Read
    `DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK`.
  - Email: `NOTIFY_EMAIL` (recipient). Requires `RESEND_API_KEY`; `NOTIFY_EMAIL_FROM`
    optional (default a placeholder like `onboarding@resend.dev`, documented as
    needing a verified sender for real use).
- **Digest:** one logical notification per channel per run containing all new
  jobs. Discord may still split into ≤10-embed messages (API limit) — that's one
  digest, just chunked transport.
- **Graceful no-config:** if neither Discord nor email is configured, print the
  digest to stdout and exit 0 (never throw).
- **Dup guard (NOTIF-04):** add a `notified_at` column to the `jobs` table (or a
  `notifications` table). Only notify jobs with `notified_at IS NULL`; set it
  after a successful send. A job re-appearing in the feed is never re-notified.

### Claude's Discretion
- Digest formatting (Discord embeds already exist; email = simple HTML or text list).
- Whether to put the sent guard as a column vs table — column is simplest.
- Per-channel failure handling: a failed channel logs and does not block the other.
</decisions>

<code_context>
## Existing Code Insights

- `notify.mjs` — currently `notifyDiscord(jobs)`: reads `DISCORD_WEBHOOK_URL`,
  chunks into 10-embed messages. Extend: add email, add a dispatcher
  `notify(jobs)` that fans out to configured channels, add stdout fallback.
- `scan.mjs` — calls `notifyDiscord` when `--notify` and newJobs.length. Change
  to call the new dispatcher `notify(newJobs)`; pass jobs that are un-notified.
- `db.mjs` — add `markNotified(urls)` + a way to fetch un-notified new jobs, or
  add `notified_at` to the jobs schema (migration-safe: ALTER TABLE ADD COLUMN
  if missing on open).
- `data/jobs.db` — schema lives here; handle the new column idempotently.

Codebase context refined during plan-phase research.
</code_context>

<specifics>
## Specific Ideas

- NOTIF-01: 5 new jobs → exactly 1 digest (assert by counting send calls / mock).
- NOTIF-02: NOTIFY_EMAIL + RESEND_API_KEY → email sent; DISCORD_WEBHOOK(_URL)
  fires independently. Both set = both fire.
- NOTIF-03: neither set → digest to stdout, exit 0.
- NOTIF-04: notified_at guard — second run never re-notifies. Provable with a
  stubbed sender + temp DB (this overlaps the Phase 5 e2e test).
- Keep secrets out of logs.
</specifics>

<deferred>
## Deferred Ideas

None — discuss skipped. (Real email delivery needs a live RESEND_API_KEY +
verified sender — that's an operator step, document it; unit proof uses a stub.)
</deferred>
