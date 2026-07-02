# Phase 6: CSV Writer & Format - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning
**Mode:** Conversational (user delegated all 4 gray areas to Claude — captured as locked decisions below)

<domain>
## Phase Boundary

Build a pure CSV-writer module that appends new jobs to a GitHub-flavored
markdown-table CSV in a stable, testable format. Phase 6 is the module + tests
only; GH Actions commit/push wiring is Phase 7; notify-channel switchover (CSV
URL replaces `#job-board` embeds) is Phase 8; operator docs is Phase 9.

In scope:
- `csv-writer.mjs` module: `appendRows(jobs, opts)` + `parseRows(csv)` (or
  equivalent read-back function for round-trip tests)
- Header line exactly: `Date Added, Company, Role, Location, URL, Source, Age, Application`
- Unit tests covering: append-exactly-N, no-duplicate-append, append-only, parser
  round-trip, escape rules (pipes/commas/quotes/newlines)
- File path resolved via `CSV_PATH` env (default `./data/jobs.csv` for local
  dev/test — Phase 7 swaps in jobs-data repo path)

Out of scope:
- GH Actions bot commit/push
- Notifying `#job-board` channel of URL
- Removing existing per-company Discord embeds
- README documentation for operator setup
- jobs-data repo creation (operator step, not code)
</domain>

<decisions>
## Implementation Decisions

### Locked

- **D-01 (column schema):** Header line is exactly
  `Date Added, Company, Role, Location, URL, Source, Age, Application` — eight
  columns, in this order, header must appear on the first row of the file. No
  leading comments, no metadata block. Locks the on-disk contract for Phase 7's
  raw URL and Phase 9's documentation.

- **D-02 (file path):** Resolved via `process.env.CSV_PATH` with fallback to
  `./data/jobs.csv` for local dev and tests. Phase 7 (GH Actions) sets this env
  to point inside the jobs-data repo checkout. Module does NOT touch the DB at
  module load — `appendRows` receives an explicit `filePath` option that
  defaults to the env-resolved path. This makes tests trivial (pass a tmp path).

- **D-03 (writer API):** Single public function
  `appendRows(jobs, { filePath, now = Date.now() } = {}) → { rowsAppended,
  totalRows }`. `filePath` defaults to env-resolved path. `now` is injectable
  for deterministic tests. Reads existing file, parses rows, filters out any
  job whose URL already appears in file, writes header (only if file missing
  OR existing file has no data rows), appends the new rows, writes back
  atomically (write-to-temp + rename so a partial write can't corrupt the file
  on crash). Returns `rowsAppended` (= N) and `totalRows` for the caller's
  logging.

- **D-04 (parse helper for tests + future re-imports):** Companion exported
  `parseRows(csvText) → Job[]` that returns `{ url, company, title, location,
  source, postedAt?, dateAdded }` for every row after the header. Splits on
  pipe chars NOT inside a code-span (backtick or escaped). Round-trip test
  (CS-04) constructs rows → writes → parses → asserts equality on URL+title
  set (other columns tolerate formatting). Parser is module-internal but
  exported so Phase 8 (and tests) can reuse it.

- **D-05 (dedup boundary — DB is source of truth):** Writer's "have I seen this
  URL already" check is purely on the file's existing content, NOT the DB. The
  scanning layer (`scan.mjs`) already filters new jobs via `hasSeen` before
  passing them to `appendRows` — passing the same URL twice from `scan.mjs`
  never happens in practice. Writer-level file check is a belt-and-suspenders
  safety net: if someone calls `appendRows` directly with duplicates, no row
  is written twice. If DB is deleted but CSV remains, the file-check still
  prevents re-append — but the DB-rebuild re-fetches everything and writes
  fresh rows below the existing ones. Acceptable: rebuild from a fresh DB is
  rare and explicit.

- **D-06 (escape rules):** GH-flavored markdown table rules — for every field
  before it goes in a cell:
  - Escape `|` as `\|` (mandatory for the table to render)
  - Escape `\n` as a literal space (newlines break rows)
  - Strip or escape unmatched `\`` backticks so they don't activate code spans
  - For the `Application` column only: also strip `\r`, control chars, and
    collapse internal whitespace to a single space
  - Do NOT escape commas — commas are fine inside table cells (only the pipe
    is the column separator)
  - Do NOT quote-wrap — GH-flavored tables render fine without quotes as long
    as pipes are escaped

- **D-07 (column value derivation):**
  - **Date Added**: ISO date string `YYYY-MM-DD` from `now` (the inject
    param). A row is stamped the day it was appended, not the day the job
    was posted — preserves CSV as "append history".
  - **Company**: `job.company`
  - **Role**: `job.title`
  - **Location**: `job.location` (empty string if missing — renders as empty
    cell)
  - **URL**: `job.url`
  - **Source**: `job.source` (provider id; set by `scan.mjs` line 221)
  - **Age**: human-readable string of how old the posting is at append time,
    e.g. `"3h"`, `"2d"`, `"12d"`, `"unknown"` if no `postedAt`. Compute via
    `(now - job.postedAt)` formatted by a tiny helper. Matches the operator's
    mental model from the live `notify.mjs` summary lines.
  - **Application**: render hint when `job.fallbackUrl` is set and `job.url`
    is missing or differs — value is `↪ via <hostname>` (mirrors
    `applyLink()` in `notify.mjs:30`). Empty string when `job.url` exists
    normally — operator reads URL column instead. Keeps the column useful
    without duplicating the URL.

- **D-08 (test suite layout):** New file `test/csv-writer.test.mjs` (added to
  existing `npm test` discover pattern — zero new test infra). Uses
  `node:test` + `node:assert/strict` like the other 11 suites. Each test
  writes to a `tmpdir()` path so suites run in parallel without collision.
  No network, no DB. Inject `now` for deterministic Date / Age columns.
  Cover: header-on-empty, append-N, idempotent re-run, escape rules
  (pipes / newlines / backticks in real fields), parse round-trip, missing
  file (cold start).

### Folded Todos

None — no pending todos for this milestone.

</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### Project context
- `.planning/PROJECT.md` — current milestone section (v1.1 CSV-as-Notification)
  defines file location (`andrianthan/jobs-data` repo), pinned-message
  behavior, and CSV-vs-embeds swap
- `.planning/REQUIREMENTS.md` §v1.1 CSV-as-Notification — CSV-02 (format),
  CSV-06 (append-only), CSV-09 (round-trip test) are Phase 6's reqs
- `.planning/ROADMAP.md` §Phase 6 success criteria — defines exactly what
  "ready" means (N rows in, N rows out; append-only; round-trip; escape)

### Codebase integration points
- `scan.mjs` line 221 — sets `job.source = providerId` so the writer receives
  a populated Source field
- `scan.mjs` lines 268-295 — `--notify` block is where Phase 8 will splice
  in a call to `appendRows` (Phase 6 only writes the module — no scan.mjs
  edits in this phase)
- `notify.mjs:30` — `applyLink(job)` is the pre-existing URL-with-fallback
  helper; Phase 6 mirrors its hostname logic for the Application column but
  does NOT import it (avoid coupling; module stays self-contained)
- `db.mjs` — writer has zero DB dependency by design (D-05); tests should
  also avoid touching the DB
- `test/notify.test.mjs:11-22` — existing test-fixture pattern (tmpdir +
  unique filename, env-var setup before import) that Phase 6 tests follow

### External specs

- **GitHub Flavored Markdown tables** — define the table dialect (pipe
  separators, `---` separator row, escape rules). The actual rendered
  semantics are in the GFM spec at
  https://github.github.com/gfm/#tables-extension- but the escape rules used
  here are the standard subset already noted in
  `data/jobs.csv` references elsewhere in the codebase.

No other external specs — phase is fully captured by the references above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- `notify.mjs:30` `applyLink(job)` — fallback-aware URL helper. Phase 6
  duplicates the hostname-extraction logic (~3 lines) rather than importing,
  to keep `csv-writer.mjs` a leaf module with zero internal dependencies
- `test/notify.test.mjs:11-22` — test-fixture idiom (tmpdir + uuid + env
  setup BEFORE import) that Phase 6 tests copy
- `data/` directory already exists (created by `openDb()` in `db.mjs:28`)
  and is gitignored — `CSV_PATH` default of `./data/jobs.csv` lands there
  safely for local dev

### Established patterns
- Module pattern: ESM with named exports, single file per concern, zero npm
  deps (matches `notify.mjs`, `db.mjs`, `db-ttl.test.mjs`)
- Test pattern: `node:test` + `node:assert/strict`, parallel-safe via unique
  tmp paths, env-vars set before dynamic `import()` (test/notify.test.mjs)
- Atomic-writes pattern: write-to-temp + rename is the canonical Node fs
  pattern for crash-safe writes; no existing helper, implemented inline

### Integration points
- Phase 7 will import `csv-writer.mjs`, set `CSV_PATH` env to the jobs-data
  repo clone path, then call `appendRows(unnotified, { filePath })` and
  `git add + commit + push` the resulting file
- Phase 8 will wire `appendRows` into the `--notify` block in `scan.mjs`
  when `CSV_URL` is configured; `appendRows` runs BEFORE `notify()` so the
  CSV reflects every new job regardless of which channels are active
- Phase 9 README: documents `CSV_PATH`, the eight column meanings, and the
  operator's role (manually create `andrianthan/jobs-data` repo once)

</code_context>

<specifics>
## Specific Ideas

- Treat the CSV file as the durable record, the DB as runtime cache. If the
  operator ever needs to replay history (lost DB, want to start a new
  aggregation), `parseRows(jobs.csv)` returns the complete set in insertion
  order — the parser is exposed for exactly this reason.
- Daily file/date partitioning was considered and rejected: complicates raw
  URL, breaks Phase 8's "one URL" requirement, splits data operators have to
  browse. Single accumulating file is simpler and meets "archive" need for
  typical scan volumes (~200 new jobs/day cap).
- Atomic rename target: `${filePath}.tmp-${randomUUID()}`. Avoid `fs.rename`
  cross-device pitfalls by using `fs.rename` (same-fs only is fine for local
  dev; GH Actions job-data checkout is also same-fs).

</specifics>

<deferred>
## Deferred Ideas

- **Per-source CSV files** (one markdown table per provider) — adds operator
  navigation, breaks Phase 8's pinned-URL model. Rejected for v1.1.
- **Splitting "Application" into a separate `Original URL | Apply via`
  columns** — adds two columns and changes schema. Rejected; Application
  hint stays as single column with empty string when not needed.
- **Old-row pruning** (drop rows where Age > some threshold) — contradicts
  CSV-06 ("append-only, never truncated") and operator-archival need. Out of
  scope.
- **JSON sibling file** (`jobs.json` alongside `jobs.csv` for machine
  consumers) — separate capability; would be its own phase if Phase 7's bot
  grew additional steps.

</deferred>

---

*Phase: 06-csv-writer-format*
*Context gathered: 2026-07-01*
