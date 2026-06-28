# Phase 2: SQLite Storage - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Replace the flat `data/seen.json` dedup store with a SQLite database that
persists job postings, dedup state, and per-run history across process restarts.

In scope: a small storage module (open/init schema, record jobs, dedup queries,
run-history writes), wiring `scan.mjs` to use it instead of seen.json, and a
one-time migration importing existing seen.json.
Out of scope: scheduling (Phase 3), notifications (Phase 4), multi-user/per-user
tables (explicitly v2 — single-tenant only).
</domain>

<decisions>
## Implementation Decisions

### Locked
- **Use the built-in `node:sqlite` module** (DatabaseSync) — keeps the project
  ZERO npm dependencies. This requires Node 22+; bump `engines.node` to `>=22`
  in package.json and note it in README. Do NOT add better-sqlite3 or any dep.
- DB file lives at `data/jobs.db` (gitignore it, like seen.json).
- Preserve existing dedup semantics exactly: exact-URL dedup + fuzzy same-company
  role dedup (role-matcher.mjs). The DB is the new source of truth for "seen".

### Claude's Discretion
- Exact schema, indices, and module API. Suggested tables:
  - `jobs` (url PRIMARY KEY, company, title, location, first_seen, posted_at)
  - `runs` (id, started_at, boards_scanned, boards_parked, boards_failed, new_jobs)
- How to expose dedup: a `hasSeen(url)` + `markSeen(job)` style API, plus a
  `seenRoles(company)` query for fuzzy matching, or load role set once per run.
- Keep fuzzy-dedup performant: loading the company's prior roles per run is fine
  at this scale (low thousands of rows).
</decisions>

<code_context>
## Existing Code Insights

- `scan.mjs` — currently `loadSeen()/saveSeen()` read/write `data/seen.json`
  with shape `{ urls: {url: date}, roles: [{company,title}] }`. Replace these
  two functions + their call sites (lines ~82-90, ~96, ~116-123, ~127) with DB
  calls. Keep the rest of main() (filters, summary) intact.
- `role-matcher.mjs` — `roleFuzzyMatch(a,b)` unchanged; feed it stored roles.
- `data/seen.json` — existing store to migrate (may or may not exist at runtime).

Codebase context refined during plan-phase research.
</code_context>

<specifics>
## Specific Ideas

- STORE-05 migration: a standalone script (e.g. `migrate-seen.mjs`) that reads
  data/seen.json (if present) and inserts each url + role into the DB idempotently
  (INSERT OR IGNORE), reporting how many imported. Running it twice imports zero
  the second time.
- STORE-04: write one `runs` row at end of each scan with the summary counts.
</specifics>

<deferred>
## Deferred Ideas

None — discuss skipped. Multi-user tables are v2 (out of scope this milestone).
</deferred>
