# job-board-aggregator

## What This Is

A **CLI daemon** that aggregates internship listings from public ATS APIs
(Greenhouse, Lever, Ashby, Workday, +20 more), aggregator feeds
(SimplifyJobs, intern-list.com), and keyword-search sidecars (JobSpy). Notifies
students when new postings appear via Discord (with role-pinged field channels),
Resend email, or stdout fallback. Targeted at incoming sophomores/juniors
hunting next-summer internships — a niche the existing CS-heavy GitHub
internship repos underserve.

Not a web app, not a multi-user SaaS. A single-tenant tool the operator runs
(locally or via cron/CI) that pushes new matches to a notification channel.

## Core Value

**The one thing that must work:** new, relevant internship postings reach the
user reliably and without duplicates. Everything else (sources, scheduling,
channels) serves that.

## Context

Brownfield. Originated from
[career-ops](https://github.com/santifer/career-ops) (MIT) scanner core, then
hardened through v1.0 + post-v1.0 hardening phases.

**Live architecture (post-v1.0):**

- `providers/` — 25 ATS fetchers (greenhouse, lever, ashby, workday, bamboohr,
  breezy, smartrecruiters, workable, recruit-easy, ibm, remoteok, remotive,
  jobstreet, glints, solidjobs, arbeitsagentur, jobspy, firecrawl, local-parser,
  workingnomads, simplify, intern-list, +3 legacy). Each exports
  `{ id, detect, fetch }` → normalized `Job`.
- `scan.mjs` — orchestrator: load providers → fetch each board → filter
  (title word-boundary gate + US-only location) → dedup → emit new jobs. Per-entry
  cooldown (default 24h, opt-out `cooldown_hours: 0`). `--drain-backlog` flag for
  bulk-clearing pre-existing unnotified jobs after a source change.
  `MAX_NOTIFY_AGE_HOURS` (default 48h) silences repost-spam from aggregators
  re-listing old roles.
- `notify.mjs` — multi-channel dispatcher: Discord webhook (firehose +
  role-pinged field channels), Resend email, stdout fallback. Jobs grouped by
  company (cap `MAX_NOTIFY_PER_COMPANY`, default 5) before chunking into
  10-embed Discord batches. `applyLink()` routes through `fallbackUrl` for
  third-party apply redirects (jobright.ai via intern-list aggregator).
- `db.mjs` — SQLite via `node:sqlite` (zero npm deps). Tables: `jobs` (with
  `notified_at`), `feed_cache` (with `cooldown_until`, etag, last_checked_at),
  `runs`. Helpers: `hasSeen/hasSeenCanon/markSeen`, `seenRoles`, `recordRun`,
  `getUnnotified/markNotified/markAllNotified`, `getCooldownUntil/setCooldownUntil`,
  `getFeedCacheStatus/setFeedCacheStatus`.
- `portals.config.mjs` — 196 verified-live boards (fintech, trading firms,
  consulting, banks, AI/SaaS, CPG, big-tech) + SimplifyJobs + intern-list.com +
  3 JobSpy keyword-search entries. US-only location filter (expanded allow list
  of US cities + state abbreviations).
- `role-matcher.mjs` — fuzzy title dedup (repost killer, 7d TTL via
  `db-ttl.test.mjs`).
- `field-router.mjs` — maps job roles to Discord field channels via role pings.
- `verify-slugs.mjs` — probes every board live vs dead.

Stack: Node 22+, ESM, **zero npm deps**. SQLite via `node:sqlite` built-in.

## Requirements

### Validated

- ✓ Fetch postings from Greenhouse/Lever/Ashby/Workday public APIs — Phase 1
- ✓ Normalize postings to a common Job shape — existing
- ✓ Word-boundary title filter (intern gate) + location filter — existing
- ✓ Per-board error isolation, retries (5xx/429/network, 3x exp backoff + jitter),
  parked counter, run summary — Phase 1
- ✓ Dedup by URL + fuzzy role-title match — existing
- ✓ SQLite job store replacing `data/seen.json` (jobs + seen + run history +
  cooldown_until) — Phase 2
- ✓ Scheduler: idempotent cron install + GitHub Actions workflow with
  actions/cache for incremental DB snapshots — Phase 3
- ✓ Per-run digest (batch new jobs into one notification, not N pings) —
  Phase 4 + post-v1.0 grouping enhancement
- ✓ Discord webhook + role-pinged field channels — Phase 4
- ✓ Resend email channel + stdout fallback — Phase 4
- ✓ Notified-at dup guard — Phase 4
- ✓ Operator-ready README + config reference + .env.example — Phase 5
- ✓ E2E test suite (84 tests across 11 suites, stubbed network + temp DB) —
  Phase 5 + post-v1.0 hardening
- ✓ 100+ live-verified boards (fintech, trading, banks, AI/SaaS, CPG, consulting,
  big-tech, Workday tenants) — post-v1.0
- ✓ SimplifyJobs aggregator integration — post-v1.0
- ✓ JobSpy keyword-search sidecar (LinkedIn/Indeed/Google) — post-v1.0
- ✓ Firecrawl fallback for blocked ATS — post-v1.0
- ✓ US-only location filter (expanded allow list) — post-v1.0
- ✓ Intern-list.com aggregator (sitemap + JSON-LD) — post-v1.0
- ✓ Per-entry cooldown (24h default, opt-out) — post-v1.0
- ✓ Company-grouped digest (cap 5/company, fallback-link routing) — post-v1.0
- ✓ Notify-age gate (48h default) — post-v1.0
- ✓ `--drain-backlog` flag — post-v1.0
- ✓ Concurrent scan (8 workers) + HTTP cache (etag) + Workday timeout + JSON
  guard — post-v1.0
- ✓ Status heartbeat (#bot-status hourly) + next-run timestamp — post-v1.0
- ✓ Freshness gate (7d window, with 30d override for known-stale providers) —
  post-v1.0

### Active

None — all v1.0 requirements validated. Post-v1.0 hardening complete.

### Out of Scope

- Web UI / dashboard — CLI daemon only (deferred to a later milestone)
- Multi-user accounts / auth / per-user subscriptions — single-tenant for v1
- LinkedIn/Indeed scraping via direct HTTP — JobSpy sidecar is the fallback
- ComfyUI-style external integrations — irrelevant
- Avature/Oracle ATS providers — parked (GS/JPM/Citadel disabled w/ notes)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ATS public JSON APIs over board scraping | No login/proxy/captcha, stable, legal, zero-token | ✓ Validated |
| Reuse career-ops provider layer (MIT) | Battle-tested fetchers + edge cases already solved | ✓ Validated |
| SQLite via `node:sqlite` over `better-sqlite3` | Preserves zero npm deps, requires Node 22+ | ✓ Validated |
| CLI daemon, not web app (this milestone) | Fastest path to the core value; web is a separate milestone | ✓ Validated |
| Keep deps minimal (prefer built-ins) | Easy to run anywhere | ✓ Validated |
| Per-entry cooldown (Phase 1 — 24h default) | Slow-changing boards (intern-list, Workday) shouldn't burn cron ticks | ✓ Validated |
| Notify-age gate (post-v1.0 — 48h default) | Aggregators re-list old roles to regain traction; silence them | ✓ Validated |
| Company-grouped digest (post-v1.0) | Mega-ATS (Walmart, Simplify) would spam channels without grouping | ✓ Validated |
| Fallback link routing via `fallbackUrl` | Third-party apply redirects (jobright.ai) need explicit disclosure | ✓ Validated |
| HTTP cache via etag (post-v1.0) | Cron runs every 4h; many feeds unchanged between runs | ✓ Validated |
| US-only location filter (post-v1.0) | Canada/Mexico listings frequently leaked into "US-remote" posts | ✓ Validated |
| Drain-backlog flag (post-v1.0) | After big source change (intern-list rewrite), suppress inevitable flood | ✓ Validated |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last reconciled: 2026-07-01 (post-v1.0 + post-hardening)*