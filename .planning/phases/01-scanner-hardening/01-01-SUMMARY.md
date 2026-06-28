---
phase: 01-scanner-hardening
plan: 01
subsystem: infra
tags: [http, retry, backoff, error-isolation, scanner, workday, ashby]

requires: []
provides:
  - "fetchWithRetry with exponential backoff+jitter in providers/_http.mjs (3 retries, 500/1500/3500ms windows)"
  - "isRetryable: retries 5xx/429/network; fails immediately on 4xx (except 429)"
  - "Ashby provider simplified: outer retry loop removed, relies on shared HTTP layer"
  - "parked counter in scan.mjs for enabled:false boards"
  - "Summary line format: scanned N · parked N · failed N · N new jobs"
affects: [02-sqlite-store, 03-scheduler, all-future-phases]

tech-stack:
  added: []
  patterns:
    - "Shared retry/backoff via fetchWithRetry in providers/_http.mjs — all providers retry automatically without per-provider loops"
    - "isRetryable distinguishes transient (5xx/429/network) from permanent (4xx) errors"
    - "enabled:false boards increment parked counter, never fetched"

key-files:
  created: []
  modified:
    - providers/_http.mjs
    - providers/ashby.mjs
    - scan.mjs

key-decisions:
  - "Retry logic lives exclusively in _http.mjs so all providers get it automatically; per-provider loops are anti-pattern"
  - "404/4xx errors are not retried — a dead slug should fail fast, not waste 3 retries + 5s backoff"
  - "No-provider boards count as failed (not a separate skipped bucket) to keep summary metrics simple and actionable"

patterns-established:
  - "HTTP retry pattern: fetchWithRetry wraps fetchWithTimeout; fetchJson/fetchText delegate to it"
  - "Summary line always reports scanned / parked / failed / new jobs — four counters, one line"

requirements-completed: [SCAN-01, SCAN-02, SCAN-03, SCAN-04, SCAN-05]

duration: 6min
completed: 2026-06-28
---

# Phase 1 Plan 1: Scanner Hardening — HTTP Retry Layer + Run Summary

**Shared fetchWithRetry (3 retries, exponential backoff+jitter) wired into all providers; parked counter and scanned/parked/failed/new-jobs summary line added to scan.mjs**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-28T20:56:47Z
- **Completed:** 2026-06-28T21:02:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `isRetryable`, `sleep`, `fetchWithRetry`, and `DEFAULT_RETRIES=3` to `providers/_http.mjs`; `fetchJson` and `fetchText` now delegate to `fetchWithRetry` so every provider retries automatically
- Removed `ASHBY_RETRIES`, `sleep`, and the outer retry loop from `providers/ashby.mjs`; Ashby now relies on the shared HTTP layer, eliminating duplicate retry semantics
- Added `parked` counter to `scan.mjs` for `enabled:false` boards; updated summary line to `scanned N · parked N · failed N · N new jobs`

## Live Run Output

```
node scan.mjs
📊 scanned 16 · parked 6 · failed 0 · 7 new jobs
  • Bridgewater — 2027 Investment Associate Intern   [New York City]
    https://job-boards.greenhouse.io/bridgewater89/jobs/8395041002
  • Morgan Stanley — Intern - Bilingual Eglish/Mandarin  [Pasadena, California, United States of America]
    https://ms.wd5.myworkdayjobs.com/External/job/...
  • Morgan Stanley — Intern  [Pasadena, California, United States of America]
    https://ms.wd5.myworkdayjobs.com/External/job/...
  • Morgan Stanley — Intern - Bilingual English/Spanish  [Pasadena, California, United States of America]
    https://ms.wd5.myworkdayjobs.com/External/job/...
  • Morgan Stanley — Real Assets Sustainability - Investment Management - Off-Cycle Intern  [New York, New York, United States of America]
    https://ms.wd5.myworkdayjobs.com/External/job/...
  • Citi — Part-Time (20 Hours) Universal Banker - Co-Op City Branch  [Bronx New York United States]
    https://citi.wd5.myworkdayjobs.com/2/job/...
  • DoorDash — AI Research Fellowship, (Summer and Fall 2026)  [San Francisco, CA]
    https://job-boards.greenhouse.io/doordashusa/jobs/7848317
```

```
node verify-slugs.mjs (SCAN-05 check)
✅ 1000 jobs  Morgan Stanley  [workday]
✅ 1000 jobs  Citi  [workday]
```

## Task Commits

Each task was committed atomically:

1. **Task 1: Add retry/backoff to shared HTTP layer and remove ashby's duplicate loop** - `3ac8e3e` (feat)
2. **Task 2: Add parked counter and fix summary line in scan.mjs** - `777294d` (feat)

**Plan metadata:** (docs commit — see Final Commit below)

## Files Created/Modified
- `providers/_http.mjs` - Added `DEFAULT_RETRIES`, `sleep`, `isRetryable`, `fetchWithRetry`; `fetchJson`/`fetchText` now delegate to `fetchWithRetry`
- `providers/ashby.mjs` - Removed `ASHBY_RETRIES`, `sleep`, outer retry loop; now a direct `ctx.fetchJson` call with `ASHBY_TIMEOUT_MS`
- `scan.mjs` - `parked` counter replaces `skipped`; `enabled:false` increments parked; summary line updated

## Decisions Made
- Retry logic lives exclusively in `_http.mjs` — all providers get retry for free without per-provider loops
- 4xx errors (except 429) are not retried — dead slugs should fail fast on first attempt
- No-provider boards count as `failed` (not a separate bucket) to keep metrics simple

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- All SCAN-01 through SCAN-05 requirements satisfied
- HTTP layer is now the authoritative retry source; future providers should NOT add their own retry loops
- Ready for Phase 1 Plan 2 (SQLite store) — scan.mjs stable, provider contract unchanged

---
*Phase: 01-scanner-hardening*
*Completed: 2026-06-28*

## Self-Check: PASSED
