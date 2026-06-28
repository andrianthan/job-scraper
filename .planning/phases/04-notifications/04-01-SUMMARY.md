---
phase: 04-notifications
plan: 01
subsystem: notifications
tags: [notifications, discord, email, resend, sqlite, dup-guard, digest]
dependency_graph:
  requires: [02-sqlite-storage]
  provides: [notify-dispatcher, notified_at-guard, email-channel]
  affects: [05-e2e-test]
tech_stack:
  added: []
  patterns: [Resend REST API via fetch, injectable test hook (_setFetch), idempotent ALTER TABLE, Promise.allSettled fan-out]
key_files:
  created:
    - test/notify.test.mjs
  modified:
    - db.mjs
    - notify.mjs
    - scan.mjs
decisions:
  - "Resend REST API over SMTP — keeps zero npm deps; POST https://api.resend.com/emails with Bearer auth"
  - "notified_at column (not separate table) — simplest idempotent migration; ALTER TABLE guarded with try/catch"
  - "markNotified called after notify() succeeds — crash mid-send triggers re-notify on next run (safer than pre-marking)"
  - "Promise.allSettled fan-out — one channel failure never silences the other"
metrics:
  duration_minutes: 3
  completed_date: "2026-06-28"
  tasks_completed: 3
  files_modified: 4
---

# Phase 4 Plan 01: Notifications Dispatcher Summary

**One-liner:** Multi-channel digest dispatcher with SQLite dup guard — Discord + Resend email via fetch, notified_at idempotent migration, stdout fallback, injectable test hook.

## What Was Built

**db.mjs** gained four additions:
- `DB_PATH` env override so tests can point at a temp SQLite file
- Idempotent `ALTER TABLE jobs ADD COLUMN notified_at TEXT` (try/catch — safe on existing DBs)
- `markNotified(urls)` — UPDATE WHERE notified_at IS NULL; safe to call twice
- `getUnnotified(jobs)` — filters to jobs with null notified_at or absent from DB
- `_closeDb()` — resets module singleton for test teardown

**notify.mjs** was fully rewritten as a dispatcher:
- `_setFetch(fn)` — test hook allowing mock fetch injection without real network calls
- `notifyDiscord(jobs)` — reads `DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK`, chunks at 10 (Discord limit), uses `_fetch`
- `notifyEmail(jobs)` — 1 POST to `https://api.resend.com/emails` with `Authorization: Bearer $RESEND_API_KEY` regardless of job count (NOTIF-01/02)
- `notify(jobs)` — fans out to configured channels via `Promise.allSettled`; prints digest to stdout and exits 0 if no channels configured (NOTIF-03)

**scan.mjs** received two targeted edits:
- Import line extended with `getUnnotified, markNotified`
- Notify block replaced: filters through `getUnnotified(newJobs)`, calls `notify(unnotified)`, then `markNotified(...)` after success; `notifyDiscord` no longer called directly

**test/notify.test.mjs** created — 8 node:test assertions, zero credentials, zero npm deps.

## Test Output (pasted verbatim)

```
--- 5 new internships ---
• TestCo — Intern 400  [New York]
  https://example.com/job/400
• TestCo — Intern 401  [New York]
  https://example.com/job/401
• TestCo — Intern 402  [New York]
  https://example.com/job/402
• TestCo — Intern 403  [New York]
  https://example.com/job/403
• TestCo — Intern 404  [New York]
  https://example.com/job/404
📧 email sent to test@example.com (5 job(s))
📧 email sent to test@example.com (5 job(s))
▶ getUnnotified dup guard
  ✔ all newly-seen jobs are un-notified (3.562541ms)
  ✔ jobs are excluded after markNotified (1.469375ms)
  ✔ markNotified is idempotent (no throw on second call) (1.166458ms)
  ✔ empty input returns empty array (0.480417ms)
✔ getUnnotified dup guard (7.131541ms)
▶ notify dispatcher
  ✔ NOTIF-03: no channels → no fetch calls (stdout only) (0.464416ms)
  ✔ NOTIF-02: email channel → exactly 1 fetch call to Resend (0.235125ms)
  ✔ NOTIF-01: 5 jobs with email → 1 send, not 5 (0.104916ms)
  ✔ notify with empty array is a no-op (0.057834ms)
✔ notify dispatcher (0.958708ms)
ℹ tests 8
ℹ suites 2
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 69.952708
```

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | db.mjs notified_at + helpers | a5af3ae | db.mjs |
| 2 | notify.mjs dispatcher + tests | 8b08913 | notify.mjs, test/notify.test.mjs |
| 3 | scan.mjs wiring | 64d8427 | scan.mjs |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data paths are real; no placeholder values flow to any consumer.

## Self-Check: PASSED

- `test/notify.test.mjs` exists: FOUND
- `notify.mjs` rewrote (contains `_setFetch`, `api.resend.com/emails`): FOUND
- `db.mjs` contains `notified_at`, `markNotified`, `getUnnotified`, `_closeDb`: FOUND
- `scan.mjs` contains `getUnnotified`, `markNotified`, no `notifyDiscord`: FOUND
- Commits a5af3ae, 8b08913, 64d8427: FOUND
