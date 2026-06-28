---
phase: 05-config-docs-test
plan: 01
subsystem: testing
tags: [node-test, e2e, sqlite, fetch-stub, dedup]

# Dependency graph
requires:
  - phase: 04-notifications
    provides: notify.mjs with _setFetch hook + stdout fallback; db.mjs with _closeDb + DB_PATH env override
  - phase: 02-sqlite-storage
    provides: hasSeen/markSeen/seenRoles dedup primitives
provides:
  - scan.mjs exports main() — safe to import without auto-running
  - test/e2e.test.mjs — full fetch→filter→dedup→notify pipeline covered under node:test
  - npm test script wired to node --test (zero new deps)
affects: [docs, future feature development — any scan.mjs importer benefits from exported main]

# Tech tracking
tech-stack:
  added: [node:test (built-in test runner wired via npm test)]
  patterns: [globalThis.fetch stub pattern, DB_PATH env isolation for SQLite tests, direct-run guard via pathToFileURL comparison]

key-files:
  created: [test/e2e.test.mjs]
  modified: [scan.mjs, package.json]

key-decisions:
  - "Guard uses `process.argv[1] &&` null-check before pathToFileURL to handle -e eval context (undefined argv[1]) without throwing"
  - "fetch stub keyed on URL substring (greenhouse.io / ashbyhq.com / else) — catches all provider API calls without matching exact slugs"
  - "Both GH stub jobs use fixed absolute_url paths; first company in config order wins hasSeen, subsequent companies skip — 3 unique new jobs in run-1"

patterns-established:
  - "DB isolation: set process.env.DB_PATH to tmpdir UUID path BEFORE any db.mjs import; call _closeDb() in after()"
  - "fetch stub: assign globalThis.fetch = mockFn BEFORE scan.mjs import so _http.mjs's bare fetch() call resolves to mock at invocation time"
  - "Direct-run guard: `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)` — safe in eval, dynamic import, and worker contexts"

requirements-completed: [TEST-01]

# Metrics
duration: 2min
completed: 2026-06-28
---

# Phase 5 Plan 01: scan.mjs Testability Refactor + E2E Test Summary

**scan.mjs exports main() with a pathToFileURL direct-run guard; node:test e2e proves the full fetch→filter→dedup→notify pipeline end-to-end with zero network calls**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-28T22:15:38Z
- **Completed:** 2026-06-28T22:17:19Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Refactored scan.mjs with `export async function main()` + `if (process.argv[1] && import.meta.url === pathToFileURL(...).href)` guard — `node scan.mjs` behavior unchanged, dynamic import is now safe
- Created test/e2e.test.mjs: stubs globalThis.fetch with Greenhouse + Ashby shaped responses, isolates DB via temp path, proves run-1 yields 3 new jobs and run-2 yields 0 (dedup)
- Wired `"test": "node --test"` in package.json — discovers test/*.test.mjs automatically, zero new npm dependencies

## Full npm test output

```
> job-board-aggregator@0.1.0 test
> node --test

📊 scanned 16 · parked 6 · failed 0 · 3 new jobs
  • Ramp — Finance Strategy Summer Analyst Intern  [New York]
    https://jobs.ashbyhq.com/ramp/abc-001
  • Brex — Finance Summer Analyst Intern  [New York]
    https://boards-api.greenhouse.io/v1/boards/brex/jobs/1001
  • Brex — Business Operations Summer Intern  [Remote]
    https://boards-api.greenhouse.io/v1/boards/brex/jobs/1002

📊 scanned 16 · parked 6 · failed 0 · 0 new jobs
--- 1 new internship ---
• TestCo — Finance Summer Analyst Intern  [New York]
  https://example.com/jobs/e2e-sentinel
✔ e2e run-1: pipeline finds new intern jobs via stubbed ATS feeds (9.448917ms)
✔ e2e run-2: dedup — zero new jobs on identical repeat run (0.972875ms)
✔ e2e notify: stdout fallback completes without throwing when no channels set (0.212583ms)
▶ getUnnotified dup guard
  ✔ all newly-seen jobs are un-notified (3.53ms)
  ✔ jobs are excluded after markNotified (2.635708ms)
  ✔ markNotified is idempotent (no throw on second call) (1.540375ms)
  ✔ empty input returns empty array (0.548958ms)
✔ getUnnotified dup guard (8.757292ms)
▶ notify dispatcher
  ✔ NOTIF-03: no channels → no fetch calls (stdout only) (0.518917ms)
  ✔ NOTIF-02: email channel → exactly 1 fetch call to Resend (0.28ms)
  ✔ NOTIF-01: 5 jobs with email → 1 send, not 5 (0.107583ms)
  ✔ notify with empty array is a no-op (0.057791ms)
✔ notify dispatcher (1.05775ms)
ℹ tests 11
ℹ suites 2
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 74.006833
```

## Task Commits

Each task was committed atomically:

1. **Task 1: Export main() + direct-run guard + wire npm test** - `bfc87e6` (feat)
2. **Task 2: Create test/e2e.test.mjs** - `84d8144` (test)

**Plan metadata:** (final docs commit — see below)

## Files Created/Modified
- `scan.mjs` — Added `pathToFileURL` import, `export` keyword on main(), null-guarded direct-run guard
- `package.json` — Added `"test": "node --test"` to scripts
- `test/e2e.test.mjs` — New: 105-line e2e test with fetch stub, temp DB, 3 test cases

## Decisions Made
- Added `process.argv[1] &&` null-check in the direct-run guard (deviation: Rule 1 bug fix — `pathToFileURL(undefined)` throws in `-e` eval and dynamic import contexts; guard must not throw when argv[1] is absent)
- Fetch stub URL matching uses substring checks (`greenhouse.io`, `ashbyhq.com`) rather than exact match — covers all current and future boards on those platforms without hardcoding slugs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added null-check on process.argv[1] in direct-run guard**
- **Found during:** Task 1 verification
- **Issue:** `pathToFileURL(undefined)` throws `TypeError [ERR_INVALID_ARG_TYPE]` when scan.mjs is imported via `node -e` (eval context) where `process.argv[1]` is `undefined`
- **Fix:** Changed guard to `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)` — short-circuit prevents the call when argv[1] is absent
- **Files modified:** scan.mjs
- **Verification:** `node -e "import('./scan.mjs').then(m => { ... })"` succeeds; `node scan.mjs` still fires main()
- **Committed in:** `bfc87e6` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in guard implementation)
**Impact on plan:** Necessary for correctness — the guard must be safe in all import contexts. No scope creep.

## Issues Encountered
- The plan's guard template `pathToFileURL(process.argv[1])` assumes argv[1] is always a string, but Node's `-e` eval sets argv[1] to undefined. Added the null-check to make the guard universal.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None — all test responses are intentional stubs (canned ATS JSON for testing only). The scan pipeline itself is fully wired.

## Self-Check: PASSED

All files verified present, all commits verified in git log.

## Next Phase Readiness
- TEST-01 complete: npm test green with 11 tests (8 existing notify + 3 new e2e)
- scan.mjs is importable for any future test needing to drive the pipeline
- Phase 5 Plan 02 (README + .env.example) can proceed independently
