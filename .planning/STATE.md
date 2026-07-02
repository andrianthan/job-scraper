---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Roadmap defined
stopped_at: Phase 6 context gathered
last_updated: "2026-07-02T05:18:46.959Z"
last_activity: 2026-07-01
progress:
  total_phases: 9
  completed_phases: 5
  total_plans: 7
  completed_plans: 7
  percent: 56
---

# Project State

## Project Reference

See: .planning/PROJECT.md (reconciled 2026-07-01)

**Core value:** New, relevant internship postings reach the user reliably and without duplicates
**Current focus:** v1.1 CSV-as-Notification — replace #job-board embeds with auto-updating GH-hosted CSV

## Current Position

Phase: 6 (next)
Plan: Not started
Status: Roadmap defined
Last activity: 2026-07-01

Progress: [█████░░░░░] 56% (5/9 phases complete — v1.0 done, v1.1 not started)

## Performance Metrics

**Velocity:**

- Total plans completed: 7 (v1.0)
- Average duration: -
- Total execution time: 0 hours (post-v1.0 work done ad-hoc, not via GSD plans)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-scanner-hardening | 1 | 1 | - |
| 02-sqlite-storage | 2 | 2 | - |
| 03-scheduling | 1 | 1 | - |
| 04-notifications | 1 | 1 | - |
| 05-config-docs-test | 2 | 2 | - |
| 06-csv-writer-format (v1.1) | 0 | 0 | - |

**Recent Trend:**

- Last 7 plans: 01-01, 02-01, 02-02, 03-01, 04-01, 05-01, 05-02
- Trend: All completed; v1.0 milestone verified

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Init: ATS public JSON APIs over scraping (no login/proxy/captcha)
- Init: SQLite over flat JSON (durable dedup + run history)
- Init: CLI daemon only for this milestone (web is a separate milestone)
- Init: Keep deps minimal; prefer node:sqlite built-in (Node 22+) or better-sqlite3
- [Phase 01-scanner-hardening]: Retry logic lives in _http.mjs only — all providers retry automatically; per-provider loops removed as anti-pattern
- [Phase 01-scanner-hardening]: 404/4xx errors not retried — dead slugs fail fast; 5xx/429/network errors retried up to 3x with exponential backoff+jitter
- [Phase 01-scanner-hardening]: No-provider boards count as failed (not a separate skipped bucket) — simpler summary metrics
- [Phase 02-sqlite-storage]: node:sqlite (DatabaseSync) chosen over better-sqlite3 — preserves zero npm deps, requires Node 22+
- [Phase 02-sqlite-storage]: seenRoles() filters empty titles to handle migration-era rows cleanly
- [Phase 02-sqlite-storage]: Synthetic URL keyed role:company:title keeps seenRoles() working for migration-era entries without colliding with real ATS URLs
- [Phase 03-scheduling]: Idempotent cron install uses grep -qF anchored on project dir + binary to prevent duplicates across multiple projects on same machine
- [Phase 03-scheduling]: GH Actions cache: unique run_id key guarantees save on post; prefix restore-keys picks up most recent DB snapshot — rolling incremental chain
- [Phase 04-notifications]: Resend REST API over SMTP keeps zero npm deps; notified_at column guard is idempotent; markNotified called after notify() for retry safety; Promise.allSettled fan-out isolates channel failures
- [Phase 05-config-docs-test]: Guard uses process.argv[1] null-check before pathToFileURL to handle eval contexts without throwing
- [Phase 05-config-docs-test]: fetch stub keyed on URL substring (greenhouse.io/ashbyhq.com/else) to intercept all provider calls without hardcoding slugs
- [Phase 05-config-docs-test]: README links to docs/SCHEDULING.md rather than duplicating scheduling content
- [post-v1.0 audit-notify-ttl-sources]: Per-entry cooldown (default 24h) via feed_cache.cooldown_until; simplifies scheduling and protects slow-changing boards from cron-tick spam
- [post-v1.0 audit-notify-ttl-sources]: Notify-age gate (MAX_NOTIFY_AGE_HOURS=48) separate from freshness gate (21d DB-write cutoff) — silences repost-spam without losing dedup history
- [post-v1.0 audit-notify-ttl-sources]: Company-grouped digest (MAX_NOTIFY_PER_COMPANY=5) collapses mega-ATS listings into one embed; preserves jobright.ai fallback links via applyLink()
- [post-v1.0 audit-notify-ttl-sources]: --drain-backlog flag bulk-clears pre-existing unnotified jobs without sending — used after big source changes (intern-list rewrite) to suppress inevitable floods
- [v1.1 roadmap]: CSV uses GH-flavored markdown table (not literal CSV) — columns Date Added, Company, Role, Location, URL, Source, Age, Application; pipes/quotes in fields must be escaped for proper rendering
- [v1.1 roadmap]: jobs-data repo lives at `andrianthan/jobs-data`; GH Actions bot commits with `[skip ci]` to avoid recursive workflow runs
- [v1.1 roadmap]: #job-board pinned message posted on first CSV-configured run only; subsequent runs update the file silently without re-posting
- [v1.1 roadmap]: MAX_NOTIFY_PER_COMPANY cap moves from #job-board (removed) to email digest + CSV row count only; field-channel embeds remain uncapped

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-07-02T05:18:46.957Z
Stopped at: Phase 6 context gathered
Resume file: .planning/phases/06-csv-writer-format/06-CONTEXT.md
