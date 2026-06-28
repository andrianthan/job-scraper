# Phase 5: Config, Docs & Test - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Make the daemon operable from the README alone, document every configurable
value, and add an end-to-end test covering fetch → filter → dedup → notify with
stubbed network against a temp SQLite DB.

In scope: README rewrite, config documentation, .env.example, one e2e test, and
a tiny scan.mjs refactor to make it importable for testing.
Out of scope: new features. This is the closeout phase.
</domain>

<decisions>
## Implementation Decisions

### Locked
- **Make scan.mjs testable:** export `main()` and guard the auto-run so it only
  executes when run directly, e.g.
  `if (import.meta.url === pathToFileURL(process.argv[1]).href) main()...`.
  This lets the e2e test import `main` and drive the whole pipeline.
- **e2e test stubs network, not logic:** stub `globalThis.fetch` to return canned
  ATS JSON for ≥2 boards (one Greenhouse-shaped, one Ashby/Workday-shaped), set
  `DB_PATH` to a temp file, and stub the notify transport via `_setFetch` (or
  set no channels and assert the stdout digest). Assert: first run detects the
  seeded intern-title jobs, notify fires once; second run → 0 new (DB dedup).
- **Run via `node --test`** (built-in test runner) — ZERO npm deps. Add an npm
  script `"test": "node --test"` (discovers test/*.test.mjs).
- Keep the existing 04 notify test passing.

### Claude's Discretion
- README structure, exact wording, .env.example contents (must list DISCORD_WEBHOOK_URL,
  NOTIFY_EMAIL, RESEND_API_KEY, NOTIFY_EMAIL_FROM).
- Whether the e2e test seeds canned jobs whose titles pass the intern gate (it
  MUST, so jobs survive filtering — use titles like "Finance Summer Analyst Intern").
- Whether to consolidate scheduling docs (Phase 3 wrote docs/SCHEDULING.md — link
  it from README rather than duplicating).
</decisions>

<code_context>
## Existing Code Insights

- `scan.mjs` — currently runs `main()` unconditionally at file end; refactor to
  export main + direct-run guard. main() already returns newJobs.
- `db.mjs` — honors `DB_PATH` env override + `_closeDb()` (added in Phase 4) —
  use these for an isolated temp DB in the test.
- `notify.mjs` — `_setFetch(fn)` test hook + stdout fallback already exist.
- `portals.config.mjs` — config the README must document (boards, titleFilter,
  locationFilter).
- `test/notify.test.mjs` — existing 8 passing tests; keep green.
- `docs/SCHEDULING.md` — link from README.
- README.md already exists (lifted-core version) — rewrite/extend for operator path.

Codebase context refined during plan-phase research.
</code_context>

<specifics>
## Specific Ideas

- DOCS-01: README sequential path: clone → (Node 22+ note) → edit portals.config.mjs
  → set channel env (or none) → `node scan.mjs` first run → `npm run schedule:install`
  (or push for GH Actions) → first scheduled notification. No source reading needed.
- DOCS-02: a config reference table — every value with example + default. Add
  `.env.example`.
- TEST-01: `npm test` (node --test) green, including the new e2e test exercising
  the full pipeline against canned feeds + temp DB, asserting only-new-jobs notify.
</specifics>

<deferred>
## Deferred Ideas

None — discuss skipped. (Live Discord/email delivery still needs real creds — an
operator step, documented; the test uses stubs.)
</deferred>
