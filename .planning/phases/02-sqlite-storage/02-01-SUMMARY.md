---
phase: 02-sqlite-storage
plan: "01"
subsystem: database
tags: [sqlite, node-sqlite, dedup, storage, esm]

# Dependency graph
requires: []
provides:
  - db.mjs with openDb/hasSeen/markSeen/seenRoles/recordRun API
  - data/jobs.db schema (jobs + runs tables)
  - Zero-dep SQLite storage layer using node:sqlite built-in
affects: [02-02-scan-wiring, 02-03-migration]

# Tech tracking
tech-stack:
  added: [node:sqlite (built-in, Node 22+)]
  patterns:
    - Singleton DB handle via module-level _db cache
    - INSERT OR IGNORE for idempotent dedup inserts
    - Lazy openDb() — opens on first call, cached thereafter

key-files:
  created: [db.mjs]
  modified: [.gitignore, package.json, scan.mjs]

key-decisions:
  - "node:sqlite (DatabaseSync) chosen over better-sqlite3 — preserves zero npm deps"
  - "Singleton _db pattern: openDb() cached at module level, safe for single-process use"
  - "seenRoles() filters empty titles to handle future migration-era rows cleanly"

patterns-established:
  - "Storage pattern: hasSeen/markSeen/seenRoles are the dedup API surface (not loadSeen/saveSeen)"
  - "DB lives in data/jobs.db, gitignored alongside data/seen.json"

requirements-completed: [STORE-01, STORE-02, STORE-03, STORE-04]

# Metrics
duration: 2min
completed: 2026-06-28
---

# Phase 2 Plan 01: SQLite Storage Module Summary

**Built-in node:sqlite (DatabaseSync) storage module with jobs + runs schema, five-function API, zero npm deps — replaces data/seen.json as the dedup source of truth**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-28T21:19:07Z
- **Completed:** 2026-06-28T21:20:58Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created db.mjs — full SQLite storage module using `node:sqlite` built-in (Node 22+, zero npm deps added)
- Implemented all five required exports: `openDb`, `hasSeen`, `markSeen`, `seenRoles`, `recordRun`
- Schema: `jobs` table (url PK, company, title, location, first_seen, posted_at) + `runs` table with company index
- Bumped package.json engines.node to `>=22` and gitignored `data/jobs.db`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create db.mjs — storage module** - `85352dc` (feat)
2. **Task 2: Update .gitignore and bump package.json engines.node** - `4813ec4` (chore)

**Plan metadata:** (docs commit follows)

## Real Verification Output

```
$ node --version
v25.6.1

$ node --input-type=module -e "
import { openDb, hasSeen, markSeen, seenRoles, recordRun } from './db.mjs';
const db = openDb();
markSeen({ url: 'https://verify.test/v01', company: 'VerifyCo', title: 'Data Intern', location: 'NYC' });
if (!hasSeen('https://verify.test/v01')) throw new Error('hasSeen returned false for inserted URL');
if (hasSeen('https://verify.test/MISS')) throw new Error('hasSeen false-positive');
const roles = seenRoles('VerifyCo');
if (!roles.some(r => r.title === 'Data Intern')) throw new Error('seenRoles missing row');
recordRun({ scanned: 2, parked: 1, failed: 0, newJobs: 1 });
const run = db.prepare('SELECT * FROM runs ORDER BY id DESC').get();
if (run.new_jobs !== 1 || run.boards_scanned !== 2) throw new Error('runs row wrong');
console.log('PASS: all db.mjs assertions passed');
console.log('seenRoles result:', JSON.stringify(roles));
console.log('runs row:', JSON.stringify(run));
"

(node:49791) ExperimentalWarning: SQLite is an experimental feature and might change at any time
PASS: all db.mjs assertions passed
seenRoles result: [{"title":"Data Intern"}]
runs row: {"id":1,"started_at":"2026-06-28T21:19:42.301Z","boards_scanned":2,"boards_parked":1,"boards_failed":0,"new_jobs":1}
```

## Files Created/Modified
- `db.mjs` - SQLite storage module: openDb/hasSeen/markSeen/seenRoles/recordRun
- `.gitignore` - Added `data/jobs.db`
- `package.json` - engines.node bumped from `>=18` to `>=22`
- `scan.mjs` - Updated Node version comment from "Node 18+" to "Node 22+"

## Decisions Made
- Used `node:sqlite` (DatabaseSync) built-in rather than better-sqlite3 — keeps the project at zero npm deps
- Singleton `_db` pattern: module-level `let _db = null` with lazy init in `openDb()`, safe for single-process CLI use
- `seenRoles()` excludes empty-title rows (`title != ''`) to cleanly handle migration-era rows with no title metadata
- `INSERT OR IGNORE` in `markSeen()` makes it safe to call twice (idempotent)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
- `db.mjs` exports the exact five functions Plan 02 will import: `openDb`, `hasSeen`, `markSeen`, `seenRoles`, `recordRun`
- Schema matches the shape expected by `scan.mjs` (Plan 02 wires these in place of `loadSeen/saveSeen`)
- Migration script (Plan 03) can call `markSeen()` idempotently for each row from `data/seen.json`

---
*Phase: 02-sqlite-storage*
*Completed: 2026-06-28*
