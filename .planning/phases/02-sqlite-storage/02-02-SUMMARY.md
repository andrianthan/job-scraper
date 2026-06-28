---
phase: 02-sqlite-storage
plan: "02"
subsystem: storage/scanner
tags: [sqlite, dedup, migration, scan]
dependency_graph:
  requires: [02-01]
  provides: [STORE-02, STORE-03, STORE-04, STORE-05]
  affects: [scan.mjs]
tech_stack:
  added: []
  patterns: [INSERT OR IGNORE idempotency, synthetic-URL role rows, per-company seenRoles() query]
key_files:
  created:
    - migrate-seen.mjs
  modified:
    - scan.mjs
decisions:
  - "Synthetic URL keyed role:company:title keeps seenRoles() working for migration-era entries without colliding with real ATS URLs"
  - "recordRun() placed after dedup loop so counts reflect actual DB writes"
metrics:
  duration_minutes: 6
  completed_date: "2026-06-28"
  tasks_completed: 2
  files_modified: 2
  files_created: 1
requirements_satisfied: [STORE-02, STORE-03, STORE-04, STORE-05]
---

# Phase 2 Plan 2: scan.mjs SQLite Migration Summary

**One-liner:** SQLite dedup wired into scan.mjs (hasSeen/markSeen/seenRoles/recordRun) with idempotent migrate-seen.mjs importing seen.json role and URL history into jobs.db.

## What Was Built

### Task 1 — Wire scan.mjs to db.mjs (commit: 57fd597)

Replaced the flat-file `loadSeen/saveSeen` pattern in `scan.mjs` with the four db.mjs exports created in Plan 01:

| Old (seen.json) | New (SQLite) |
|---|---|
| `seen.urls[job.url]` | `hasSeen(job.url)` |
| `seen.roles.some(r => r.company === job.company && roleFuzzyMatch(...))` | `seenRoles(job.company).some(r => roleFuzzyMatch(r.title, job.title))` |
| `seen.urls[url] = today; seen.roles.push(...)` | `markSeen(job)` |
| `saveSeen(seen)` | `recordRun({ scanned, parked, failed, newJobs: newJobs.length })` |

Also removed: `SEEN_PATH` constant, `loadSeen()` function, `saveSeen()` function, `const seen = ...`, `const today = ...`.
Narrowed `fs` import to `readdirSync` only (from `node:fs`).

### Task 2 — Create migrate-seen.mjs (commit: 9e23639)

One-time idempotent migration script: reads `data/seen.json` and bulk-imports into `data/jobs.db` via `INSERT OR IGNORE`.

Two-phase approach:
1. **URL phase** — imports real ATS URL entries (so `hasSeen(url)` returns true for historical jobs)
2. **Role phase** — imports role entries as synthetic-URL rows (`role:{company}:{title}`) so `seenRoles(company)` returns prior titles for fuzzy dedup even before scan has re-seen those companies

## Two-Run Dedup Proof

Both runs executed against live ATS feeds after deleting `data/jobs.db`:

**Run 1:**
```
📊 scanned 16 · parked 6 · failed 0 · 7 new jobs
  • Bridgewater — 2027 Investment Associate Intern   [New York City]
  • Morgan Stanley — Intern - Bilingual Eglish/Mandarin  [Pasadena, California, United States of America]
  • Morgan Stanley — Intern  [Pasadena, California, United States of America]
  • Morgan Stanley — Intern - Bilingual English/Spanish  [Pasadena, California, United States of America]
  • Morgan Stanley — Real Assets Sustainability - Investment Management - Off-Cycle Intern  [New York, New York, United States of America]
  • Citi — Part-Time (20 Hours) Universal Banker - Co-Op City Branch  [Bronx New York United States]
  • DoorDash — AI Research Fellowship, (Summer and Fall 2026)  [San Francisco, CA]
```

**Run 2:**
```
📊 scanned 16 · parked 6 · failed 0 · 0 new jobs
```

Run 2 shows 0 new jobs — dedup persisted across process restarts via SQLite.

## migrate-seen.mjs Idempotency Proof

With existing `data/seen.json` (7 URLs + 7 roles):

**First run:**
```
Migrated 14 record(s) from data/seen.json → data/jobs.db
```

**Second run (immediately after):**
```
0 records imported (all already present — idempotent run).
```

If `data/seen.json` does not exist:
```
data/seen.json not found — nothing to migrate.
```
(exits 0 — graceful handling confirmed)

## All Five STORE Requirements

| Req | Status | Verification |
|---|---|---|
| STORE-01 | PASS | `data/jobs.db` exists; schema init OK |
| STORE-02 | PASS | Second `node scan.mjs` → "0 new jobs" |
| STORE-03 | PASS | `seenRoles(job.company)` query in scan.mjs (not in-memory array) |
| STORE-04 | PASS | 3 runs recorded in `runs` table after verification session |
| STORE-05 | PASS | migrate-seen.mjs: 14 imported first run, 0 second run |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all storage paths wired to real SQLite data.
