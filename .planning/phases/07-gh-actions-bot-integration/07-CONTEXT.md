# Phase 7: GH Actions Bot Integration - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Mode:** Auto (--auto) — all gray areas resolved to recommended defaults

<domain>
## Phase Boundary

Wire the existing `csv-writer.mjs` (Phase 6) into a GitHub Actions workflow
that, after each scan, commits and pushes the CSV to a separate
`andrianthan/jobs-data` repo using a configured `GH_TOKEN`. The CSV writer
itself is already complete; this phase is the CI-side plumbing that moves the
file to the right repo and branch so the raw URL is stable.

In scope:
- `.github/workflows/scan.yml` (the existing one) — extend to also check out
  `andrianthan/jobs-data` after the scan, copy/write the CSV into it, commit,
  and push
- A small Node helper (e.g. `scripts/push-csv.mjs`) that does: read current
  CSV, call `appendRows()` with the unnotified jobs, then run `git add` +
  `commit --allow-empty` (or skip-if-no-diff) + `push` against the jobs-data
  checkout
- Operator config: `GH_TOKEN` and `JOBS_DATA_REPO` env (defaults to
  `andrianthan/jobs-data` per PROJECT.md)
- Unit tests for the helper: command construction, no-diff skip, GH_TOKEN
  presence check, cold-start path, error surfacing
- `.env.example` entries for `GH_TOKEN` and `JOBS_DATA_REPO`

Out of scope:
- Wiring `appendRows()` into `scan.mjs` --notify block (Phase 8)
- Removing per-company `#job-board` Discord embeds (Phase 8)
- Pinned message in `#job-board` with raw URL (Phase 8)
- README documentation of operator setup (Phase 9)
- Creating the `andrianthan/jobs-data` repo itself (operator does once)

</domain>

<decisions>
## Implementation Decisions

### Locked

- **D-01 (workflow extension point):** Extend the existing
  `.github/workflows/scan.yml` (do NOT add a second workflow). After the
  `Run scan` step, add new steps: `Checkout jobs-data repo` → `Run CSV push
  helper` → (push step is internal to the helper script, not a separate YAML
  step). One workflow, one job, sequential steps. No matrix, no second job.

- **D-02 (jobs-data repo strategy):** Separate repo, NOT a subdirectory of
  this repo. Operator creates `andrianthan/jobs-data` once (private, single
  branch `main`). The CSV lives at `jobs.csv` at the repo root. Matches
  PROJECT.md and keeps the bot repo small (no historical CSV bloat in this
  repo's git history).

- **D-03 (push auth):** `GH_TOKEN` secret (classic PAT or fine-grained with
  `contents:write` on `jobs-data` only). Configured as a repo secret in this
  repo (where the workflow lives), not in `jobs-data`. Workflow uses it as
  `git push https://x-access-token:${GH_TOKEN}@github.com/${JOBS_DATA_REPO}.git`
  -- standard pattern, no `persist-credentials` needed because the helper
  script makes a fresh `git` subprocess call.

- **D-04 (commit identity):** `github-actions[bot]`
  `<41898282+github-actions[bot]@users.noreply.github.com>` -- the default
  GitHub Actions bot identity. No custom bot account. Configured via
  `git config user.name` and `user.email` in the helper before commit. The
  workflow file must include `permissions: contents: write` at the job level
  (otherwise the bot cannot push to `jobs-data` even with a PAT -- the
  workflow's GITHUB_TOKEN has no scope there).

- **D-05 (commit message):** `chore(csv): append N new jobs [skip ci]` where
  N is the rows-appended count returned by `appendRows()`. The `[skip ci]`
  tag prevents an infinite loop where pushing to `jobs-data` triggers another
  scan in this repo (in case a workflow is ever added to `jobs-data`).
  Message also embeds the run URL (`${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}`) so the commit is traceable to the triggering workflow run.

- **D-06 (no-change skip):** Helper script runs
  `git diff --quiet HEAD -- jobs.csv` after writing. If exit 0 (no diff),
  skip the commit, log `CSV push: no changes, skipping`, exit 0. This
  prevents empty commits on every 4h schedule tick.

- **D-07 (cold-start handling):** If `jobs.csv` doesn't exist in jobs-data
  on first run, helper still works: the workflow's checkout step creates the
  repo dir, then `appendRows()` writes the header + initial rows when the
  file is absent. Push creates the file. No special-casing needed.

- **D-08 (helper script API):** `scripts/push-csv.mjs` exports
  `pushCsv({ jobs, env }) → { ok, rowsAppended, totalRows, committed, pushed, error? }`.
  The `env` parameter accepts a `process.env`-like object so tests can inject
  GH_TOKEN / JOBS_DATA_REPO / CSV_PATH without touching real env. CLI mode:
  `node scripts/push-csv.mjs <path-to-jobs-json>` reads a JSON file of jobs
  (written by the workflow via `node -e` from `scan.mjs` output) and
  executes the push. Returns non-zero exit on any failure (missing token,
  push rejection, missing repo).

- **D-09 (failure surfacing):** Any failure (missing `GH_TOKEN`, missing
  `JOBS_DATA_REPO`, `git push` rejection, `appendRows` error) exits with
  code 1 and a clear stderr line. Workflow step `Run CSV push helper` has
  `if: always()` and the job-level `if` propagates the failure. Matches
  ROADMAP CSV-03 success criteria #3: "fails loudly (non-zero exit) if
  `GH_TOKEN` or the target repo is misconfigured, rather than silently
  swallowing the error."

- **D-10 (test approach):** Mocked unit tests for the helper only -- the
  YAML itself is hand-validated (the test file is too brittle to lint YAML
  and the workflow is short). Test cases:
  - Command construction: `git add`, `git diff --quiet`, `git commit`,
    `git push` invoked in correct order with correct args
  - No-diff skip: when `git diff --quiet` returns 0, no commit + no push
  - Missing `GH_TOKEN`: exits 1 with clear stderr before any git command
  - Missing `JOBS_DATA_REPO`: defaults to `andrianthan/jobs-data` (and logs
    the default); if both unset, exits 1
  - `appendRows` error: propagates as exit 1
  - Cold start: when `jobs.csv` doesn't exist, the `git add jobs.csv` still
    works (git handles new files)

- **D-11 (env wiring):** `.env.example` adds:
  ```
  # Phase 7: GH Actions bot pushes CSV to separate jobs-data repo
  GH_TOKEN=ghp_xxx  # classic PAT or fine-grained with contents:write on jobs-data
  JOBS_DATA_REPO=andrianthan/jobs-data  # default; override only if forked
  CSV_PATH=./data/jobs.csv  # local dev path; workflow overrides to /tmp/jobs-data/jobs.csv
  ```
  Local dev: leave GH_TOKEN empty; the helper detects and exits 1 with
  "GH_TOKEN not set -- skipping CSV push (this is expected for local dev)".

- **D-12 (workflow YAML structure):** Adds to existing `scan.yml` AFTER the
  `Run scan` step:
  ```yaml
  - name: Write scan results for CSV helper
    if: always()
    run: node -e "process.stdout.write(JSON.stringify(require('./scan.mjs')))" || true
  # (actually, scan.mjs is an entry point not a module -- this step shape
  # will be resolved in planning. The intent: capture newJobs from the scan
  # step into a file the helper can read.)

  - name: Checkout jobs-data repo
    if: always()
    uses: actions/checkout@v4
    with:
      repository: ${{ env.JOBS_DATA_REPO }}
      path: jobs-data
      token: ${{ secrets.GH_TOKEN }}

  - name: Run CSV push helper
    if: always()
    env:
      GH_TOKEN: ${{ secrets.GH_TOKEN }}
      JOBS_DATA_REPO: ${{ env.JOBS_DATA_REPO }}
      CSV_PATH: ${{ github.workspace }}/jobs-data/jobs.csv
    run: node scripts/push-csv.mjs /tmp/scan-jobs.json
  ```
  The exact data-handoff shape (`/tmp/scan-jobs.json`) is a planning
  decision -- planner will figure out whether scan.mjs needs a `--emit-json`
  mode or whether the workflow re-runs scan.mjs in a way that captures
  newJobs. Likely answer: scan.mjs already supports `--json` (stdout
  emission); the workflow step writes that to `/tmp/scan-jobs.json` before
  invoking the helper. But this is a planner concern, not a context decision.

- **D-13 (concurrency / ordering):** No new `concurrency:` block. The
  existing `concurrency: { group: job-scan, cancel-in-progress: false }`
  covers the scan step. The CSV push step is fast and idempotent; if two
  runs overlap, the second push will fail with a non-fast-forward (the
  helper should detect this and `git pull --rebase` first, OR the workflow
  should add `jobs-data` to the concurrency group). **Claude's discretion
  for the planner:** add `jobs-data` to the concurrency group OR add
  `git pull --rebase` in the helper. Default for context: add to
  concurrency group (simpler).

### Claude's Discretion

- Exact data-handoff between scan step and helper (file path,
  `--json` stdout capture, or env var) -- planner picks.
- Whether helper uses `execa` / `node:child_process` / `simple-git` --
  zero-dep rule means `node:child_process.spawn` is the only option.
- Commit hash in helper logs (yes/no).
- Error message wording for missing-config cases (just needs to be clear).

### Folded Todos

None -- no pending todos for this milestone.

</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### Project context
- `.planning/PROJECT.md` §v1.1 CSV-as-Notification -- defines `andrianthan/jobs-data` repo, file location (`jobs.csv` at root), and "pinned message" model (Phase 8 owns the message, Phase 7 owns the file)
- `.planning/REQUIREMENTS.md` §CSV-03 -- "CSV file is auto-committed by GH Actions bot on each scan run"
- `.planning/ROADMAP.md` §Phase 7 success criteria -- 4 criteria: push to jobs-data, skip on no-change, fail-loud on bad config, raw URL resolves
- `.planning/phases/06-csv-writer-format/06-CONTEXT.md` -- locked decisions D-01 (8-col schema), D-02 (CSV_PATH env), D-03 (appendRows API), D-06 (escape rules) -- Phase 7 consumes these without modification

### Codebase integration points
- `csv-writer.mjs:227` -- `appendRows(jobs, { filePath, now })` is the function Phase 7's helper calls. Returns `{ rowsAppended, totalRows }` for the commit message and skip-detection
- `csv-writer.mjs:31-33` -- `resolveFilePath()` uses `process.env.CSV_PATH` with default `./data/jobs.csv`. The workflow sets `CSV_PATH` to the jobs-data checkout path
- `.github/workflows/scan.yml` -- existing workflow to EXTEND (do not create a second). Steps 1-7 (checkout, setup-node, cache, ensure data dir, setup-python, pip, Run scan) stay; add CSV push steps after "Run scan"
- `scan.mjs:268-295` -- `--notify` block is where Phase 8 will splice in `appendRows` call. Phase 7's helper reads newJobs via a JSON file written by the workflow (not via scan.mjs internals) -- keeps the two phases decoupled
- `.env.example` -- add GH_TOKEN, JOBS_DATA_REPO, CSV_PATH entries (D-11)
- `data/jobs.csv` -- the file Phase 7's helper writes to (via CSV_PATH). gitignored (it's per-run state)
- `test/notify.test.mjs:11-22` -- test fixture idiom (tmpdir + env setup before dynamic import) that Phase 7 tests copy

### External specs
- **GitHub Actions: `actions/checkout@v4` with `repository:` input** -- https://github.com/actions/checkout/blob/main/docs/INPUTS.md -- allows checking out a different repo in the same job
- **GitHub Actions bot identity** -- https://github.community/t/github-actions-bot-email-address/16931 -- the canonical email for the bot
- **`[skip ci]` in commit messages** -- https://docs.github.com/en/actions/managing-workflow-runs/skipping-workflow-runs -- standard skip syntax honored by GitHub Actions
- **Fine-grained PAT vs classic PAT** -- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens -- Phase 7 docs both options

No other external specs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets
- `csv-writer.mjs:227` `appendRows(jobs, { filePath, now })` -- already returns `{ rowsAppended, totalRows }`. Phase 7's helper imports this and passes the new jobs + a path inside the jobs-data checkout
- `csv-writer.mjs:218-222` `atomicWrite()` -- the writer handles crash-safety. Phase 7 does NOT need to re-implement; the helper just calls `appendRows()`
- `test/notify.test.mjs:11-22` -- env-var-before-import test idiom. Phase 7's helper tests follow the same pattern
- `.github/workflows/scan.yml` `actions/cache@v4` pattern (lines 31-37) -- the new `actions/checkout@v4` step for jobs-data follows the same `uses:` / `with:` shape

### Established patterns
- Zero npm deps: `csv-writer.mjs`, `notify.mjs`, `db.mjs` all use only Node built-ins. `scripts/push-csv.mjs` will too (`node:child_process.spawn`, `node:fs/promises`, `node:path`)
- YAML workflow snippets use `${{ secrets.* }}` and `${{ env.* }}` -- Phase 7 follows the same shape
- Helper scripts: `migrate-seen.mjs` is a one-shot CLI in repo root. Phase 7's `scripts/push-csv.mjs` mirrors that layout (in `scripts/` because it has a sidecar binary dependency, namely `git`)
- Error surfacing: `console.error` + `process.exitCode = 1` pattern in `scan.mjs:286-290` for notify failures. Phase 7's helper does the same

### Integration points
- The workflow's `Run scan` step outputs new jobs to stdout via `--json` (existing). Phase 7 captures that into `/tmp/scan-jobs.json` via `... | tee` or `... > /tmp/scan-jobs.json`
- The helper is invoked with `node scripts/push-csv.mjs /tmp/scan-jobs.json` and reads the file (or stdin) for new jobs
- The helper runs from `github.workspace` (default checkout dir for this repo) and `cd`s into `jobs-data/` for `git add/commit/push`

</code_context>

<specifics>
## Specific Ideas

- **The commit message as audit trail:** embedding the workflow run URL in
  every commit means an operator looking at `jobs-data` history can click
  straight to the triggering scan's logs. Critical for debugging "why did
  this job get added twice" -- the run URL is the canonical answer.
- **No `persist-credentials: false` needed in checkout step** because the
  helper uses its own `git push https://x-access-token:${GH_TOKEN}@...`
  URL with the PAT. The default checkout of this repo does NOT touch
  jobs-data, so its credentials don't matter.
- **The helper is a thin shell around `git` + `appendRows`.** Roughly 80
  lines. No async orchestration, no retry logic (GH Actions itself
  retries the job on failure via the standard `continue-on-error` /
  `retry` patterns the operator can set in YAML if they want).
- **`gh` CLI vs raw `git`:** the `gh` CLI would be cleaner (handles auth
  automatically) but adds a dependency the workflow would need to install.
  Raw `git` is already on the runner and uses the PAT directly. Stick with
  raw `git`.
- **Local dev experience:** running `node scripts/push-csv.mjs` locally
  without `GH_TOKEN` exits 1 with a helpful message. Running with a
  properly-scoped PAT against a test `andrianthan/jobs-data-staging` repo
  works end-to-end (operator can do this for a dry run).

</specifics>

<deferred>
## Deferred Ideas

- **Multi-CSV support** (one file per source provider) -- out of scope for
  v1.1, conflicts with Phase 8's "one raw URL" model.
- **PR-based workflow** (open a PR to jobs-data instead of direct push) --
  adds friction (manual review) for no v1.1 value; operator is the only
  consumer. Direct push.
- **Bot account on jobs-data that posts a comment per new row** -- belongs
  in a "Phase 7.x: jobs-data enrichment" if operator wants it. Not Phase 7.
- **Signature / GPG sign of CSV commits** -- adds complexity; the bot
  identity is already trusted (PAT-authenticated). Out of scope.
- **Webhooks for jobs-data changes** (notify this repo when someone edits
  jobs.csv manually) -- opposite data flow; out of scope.

</deferred>

---

*Phase: 07-gh-actions-bot-integration*
*Context gathered: 2026-07-02*
