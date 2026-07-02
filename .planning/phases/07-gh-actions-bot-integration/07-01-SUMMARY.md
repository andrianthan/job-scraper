---
phase: 07-gh-actions-bot-integration
plan: 01
subsystem: infra
tags: [github-actions, csv-push, bot, jobs-data]

# Dependency graph
requires:
  - phase: 06-csv-writer-format
    provides: appendRows() API + atomicWrite + resolveFilePath used by push-csv helper
provides:
  - scripts/push-csv.mjs pushCsv() helper (D-08 API, D-09 fail-loud, D-06 no-diff skip, D-04 bot identity, D-05 commit message, D-03 PAT push auth)
  - .github/workflows/scan.yml extended with jobs-data checkout + CSV push steps
  - .env.example entries for GH_TOKEN, JOBS_DATA_REPO, CSV_PATH (D-11)
  - Unit test suite for push-csv helper covering all 6 D-10 cases
affects: [phase-08-csv-channel-switchover, phase-09-docs]

# Tech tracking
tech-stack:
  added: []
  patterns: [pat-in-url git push, injectable _runGit dep for testability, no-diff belt-and-suspenders skip, bot identity via git config]

key-files:
  created:
    - scripts/push-csv.mjs
    - test/push-csv.test.mjs
  modified:
    - .github/workflows/scan.yml
    - .env.example

key-decisions:
  - "Helper exposes optional _runGit as 3rd pushCsv arg — tests inject spy, production uses real spawnSync. Zero npm deps maintained."
  - "CLI detection via fileURLToPath on process.argv[1] — avoids top-level await pitfalls when imported as module"
  - "Concurrency group renamed job-scan → job-scan-csv to serialize CSV push with scan (D-13, override of context's default)"
  - "Cold-start path: writer still writes header + separator even when rowsAppended=0; helper skips no-change check based on `fileExistedBefore`, not just diff status"
  - "PAT URL-encoded via encodeURIComponent before splicing into push URL — handles tokens with special chars"

patterns-established:
  - "Pattern: injectable _runGit for git-spawning helpers — test via fake that records args + returns canned { status, stdout, stderr }"
  - "Pattern: belt-and-suspenders skip — writer-level dedup (rowsAppended) AND git-level diff check (status 0/1)"

requirements-completed: [CSV-03]

# Metrics
duration: 10min
completed: 2026-07-02
---

# Phase 7 Plan 01: GH Actions Bot Pushes CSV to jobs-data

**Helper module `scripts/push-csv.mjs` (zero deps, injectable git spy) + extended workflow + .env.example + 12-test suite, all 103 tests green**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-02T07:03:32Z (phase context session)
- **Completed:** 2026-07-02T07:13:20Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `scripts/push-csv.mjs` (175 lines, zero npm deps) exports `pushCsv({ jobs, env, _runGit })` with full D-01..D-13 coverage
- Workflow extended with permissions/contents:write, jobs-data checkout step, push helper invocation step, GITHUB_RUN_URL env
- `.env.example` updated with GH_TOKEN, JOBS_DATA_REPO, CSV_PATH entries per D-11
- 12 unit tests across 6 describe blocks covering command construction, no-diff skip, missing-token guard, repo override, appendRows error propagation, cold start
- All 103 tests pass (91 prior + 12 new), verified clean on two consecutive runs (no test pollution)

## Task Commits

Each task was committed atomically:

1. **Task 1: Build scripts/push-csv.mjs helper** - `81a9572` (feat)
2. **Task 2: Write test/push-csv.test.mjs** - `34bb722` (test)
3. **Task 3: Extend .github/workflows/scan.yml + .env.example** - `a7033d1` (chore)

**Plan metadata:** pending (docs commit follows this SUMMARY)

## Files Created/Modified

- `scripts/push-csv.mjs` - pushCsv() helper with injectable _runGit, env-driven config, fail-loud guards
- `test/push-csv.test.mjs` - 12-test suite covering D-10 acceptance cases; uses spawnSync CLI invocation for missing-token end-to-end check
- `.github/workflows/scan.yml` - added permissions/env at job level, 3 new steps after Run scan, concurrency group renamed to job-scan-csv
- `.env.example` - appended GH_TOKEN/JOBS_DATA_REPO/CSV_PATH section with inline comments

## Decisions Made

- **Concurrency group rename (D-13 deviation):** Context default said either extend the concurrency group OR add `git pull --rebase`. Plan chose to extend the concurrency group (`job-scan` → `job-scan-csv`). This is the simpler path; no rebase logic needed in the helper.
- **Injectable `_runGit` 3rd arg:** Plan suggested this as the cleanest test path; implemented. Production code path unchanged (defaults to real `runGit` wrapping `spawnSync`).
- **`fileExistedBefore` gate:** Plan said "if rowsAppended === 0 and file existed before" — implemented by reading the file before `appendRows` runs (catches ENOENT vs other errors). This is necessary because the writer writes the header on cold-start even when no rows are appended; the no-change check must compare pre- vs post-state, not just `rowsAppended`.
- **CLI detection via `fileURLToPath`:** Avoids top-level `await` issues when the file is imported (not run directly). Falls back to `endsWith('push-csv.mjs')` check for cross-platform safety.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restructured CLI mode to use `main()` async wrapper**
- **Found during:** Task 1 (initial implementation used top-level `await readFile` inside an `if (isMain)` block at module load)
- **Issue:** Top-level await in CLI detection block can cause issues when the module is imported by tests (Awaited module-level promise blocks import). The structure also duplicated the CLI detection logic.
- **Fix:** Extracted CLI mode to an async `main()` function and used `fileURLToPath` for reliable main-module detection (compares `import.meta.url` against `process.argv[1]`).
- **Files modified:** scripts/push-csv.mjs
- **Verification:** Module imports cleanly in tests; CLI exits 1 with usage when invoked without args; all 12 tests still pass.
- **Committed in:** 81a9572 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Fixed CLI test to be properly async**
- **Found during:** Task 2 (initial test used `.then()` callback without await)
- **Issue:** `node:test` requires test functions to be sync, async, or return a Promise. The `.then()` callback was fire-and-forget; the test could complete before the spawnSync results were checked, leading to false-positive passes if the assertion threw later.
- **Fix:** Converted test to `async`, awaited `writeFile` before `spawnSync`, and used `try/finally` to clean up the temp file regardless of assertion outcome.
- **Files modified:** test/push-csv.test.mjs
- **Verification:** Test passes deterministically; CLI exit code 1 + stderr match verified via spawnSync inspection.
- **Committed in:** 34bb722 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both auto-fixes essential for code structure and test reliability. No scope creep.

## Issues Encountered

None — all planned behavior implemented on first try after the structural fix.

## User Setup Required

**External services require manual configuration.** The plan's CSV-03 success criteria depends on operator setup (see `.env.example` for canonical wording):

- **Create the `andrianthan/jobs-data` repo** (private, single branch `main`) — operator does once.
- **Create a fine-grained PAT** at https://github.com/settings/tokens?type=beta with `contents:write` scope on `andrianthan/jobs-data` ONLY (not this repo).
- **Add PAT as `GH_TOKEN` secret** in this repo's settings (Settings → Secrets and variables → Actions → New repository secret).
- **Optional:** override `JOBS_DATA_REPO` repo variable if forked.

## Next Phase Readiness

Phase 7 (CSV bot) is complete. Phase 8 (CSV channel switchover) can proceed: it will:
- Splice `appendRows()` into `scan.mjs --notify` block (the helper's CLI mode is the seam)
- Pin a Discord message in `#job-board` with the live raw URL
- Remove per-company `#job-board` embeds (CSV replaces them)
- Update field-channel grouping logic per CSV-04 / CSV-05 / CSV-07

No blockers for Phase 8.

---
*Phase: 07-gh-actions-bot-integration*
*Completed: 2026-07-02*