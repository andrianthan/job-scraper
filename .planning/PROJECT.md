# job-board-aggregator

## What This Is

A **CLI daemon** that aggregates finance / business / HR **internship** listings
from public ATS APIs (Greenhouse, Lever, Ashby, Workday) and notifies students
when new postings appear. Targeted at incoming sophomores/juniors hunting
next-summer internships — a niche the existing CS-heavy GitHub internship repos
underserve.

Not a web app, not a multi-user SaaS. A single-tenant tool the operator runs
(locally or via cron/CI) that pushes new matches to a notification channel.

## Core Value

**The one thing that must work:** new, relevant internship postings reach the
user reliably and without duplicates. Everything else (sources, scheduling,
channels) serves that.

## Context

Brownfield. A working scanner core already exists, lifted from
[career-ops](https://github.com/santifer/career-ops) (MIT):

- `providers/` — 19 ATS fetchers (greenhouse, lever, ashby, workday, +15), each
  a plugin exporting `{ id, detect, fetch }` → normalized `Job`.
- `scan.mjs` — orchestrator: load providers → fetch each board → filter
  (title word-boundary gate + location) → dedup → emit new jobs.
- `notify.mjs` — Discord webhook push (one function: `notifyDiscord`).
- `portals.config.mjs` — 16 verified-live boards (fintech, trading firms, 2
  Workday banks) + intern/underclassman keyword filters.
- `role-matcher.mjs` — fuzzy title dedup (repost killer).
- `verify-slugs.mjs` — probes every board live vs dead.
- `data/seen.json` — flat dedup store (to be replaced by SQLite).

Stack: Node 18+, ESM, **zero npm deps** currently. Want to keep deps minimal;
SQLite via `node:sqlite` (built-in, Node 22+) or `better-sqlite3` if needed.

## Requirements

### Validated

- ✓ Fetch postings from Greenhouse/Lever/Ashby/Workday public APIs — existing
- ✓ Normalize postings to a common Job shape — existing
- ✓ Word-boundary title filter (intern gate) + location filter — existing
- ✓ Dedup by URL + fuzzy role-title match — existing
- ✓ Push new jobs to Discord webhook — existing
- ✓ Verify which configured boards are live — existing (`verify-slugs.mjs`)

### Active

- [ ] Harden scanner: per-board error isolation, retries, rate-limit safety, run summary
- [ ] Wire remaining Workday banks; document adding Avature/Oracle later
- [ ] SQLite job store replacing `data/seen.json` (jobs + seen + run history)
- [ ] Scheduler: cron / GitHub Actions running the scan on an interval
- [ ] Email notification channel alongside Discord
- [ ] Per-run digest (batch new jobs into one notification, not N pings)
- [ ] Config + setup docs + end-to-end test

### Out of Scope

- Web UI / dashboard — CLI daemon only (deferred to a later milestone)
- Multi-user accounts / auth / per-user subscriptions — single-tenant for v1
- LinkedIn/Indeed scraping — ATS APIs only (JobSpy is a future fallback)
- ComfyUI-style external integrations — irrelevant
- Avature/Oracle ATS providers — parked (GS/JPM/Citadel disabled w/ notes)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ATS public JSON APIs over board scraping | No login/proxy/captcha, stable, legal, zero-token | — Pending |
| Reuse career-ops provider layer (MIT) | Battle-tested fetchers + edge cases already solved | — Pending |
| SQLite over flat JSON | Durable dedup, run history, queryable; sets up future multi-user | — Pending |
| CLI daemon, not web app (this milestone) | Fastest path to the core value; web is a separate milestone | — Pending |
| Keep deps minimal (prefer built-ins) | Existing code is zero-dep; easy to run anywhere | — Pending |

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
*Last updated: 2026-06-28 after initialization*
