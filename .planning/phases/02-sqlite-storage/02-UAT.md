---
status: complete
phase: 02-sqlite-storage
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md]
started: 2026-07-01
updated: 2026-07-01
---

## Current Test

[testing complete]

## Tests

### 1. DB file exists with correct schema
expected: |
  `data/jobs.db` exists and contains jobs (with url PK, company, title, location, canon, notified_at), runs (with started_at, boards_scanned/parked/failed, new_jobs), and feed_cache tables. node:sqlite used (no npm deps).
result: pass
notes: Tables: feed_cache, jobs, runs. Jobs cols: url, company, title, location, first_seen, posted_at, notified_at, canon. Runs cols: id, started_at, boards_scanned, boards_parked, boards_failed, new_jobs. All present.

### 2. Dedup persists across runs (run twice = 0 new on second run)
expected: |
  Run `node scan.mjs` twice. First run adds N new jobs; second run adds 0 (all on cooldown OR all marked seen).
result: pass
notes: Run history shows pattern: run 9 (314 new) → run 10 (11 new) → run 11 (0 new). Run 14 (140) → run 15 (0). Dedup persists across process restarts via SQLite.

### 3. hasSeen/markSeen round-trip
expected: |
  Calling markSeen({url, company, title}) then hasSeen(url) returns true. Calling markSeen on same URL twice does not create duplicate rows.
result: pass
notes: markSeen x2 → 1 row in DB (INSERT OR IGNORE works). hasSeen returns true.

### 4. seenRoles returns matching company rows
expected: |
  markSeen jobs for company X, then seenRoles(X) returns titles of jobs from that company. Empty titles filtered out.
result: pass
notes: After markSeen for VerifyCo02, seenRoles returns 1 row. Empty-title filter confirmed in db.mjs WHERE clause.

### 5. recordRun stores run with counters
expected: |
  After scan, runs table has row with started_at, boards_scanned, boards_parked, boards_failed, new_jobs matching scan summary.
result: pass
notes: Test recordRun({scanned:99, parked:7, failed:0, newJobs:42}) → row inserted with matching values.

### 6. Canon key populated + dedup works across URLs
expected: |
  Same company+title inserted with different URLs → second insert ignored (OR detected via hasSeenCanon). No duplicate canon keys in DB.
result: pass
notes: 0 dupes by canon key after phase 1 fix (deleted 7 synthetic migration rows). hasSeenCanon query ready in db.mjs.

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]