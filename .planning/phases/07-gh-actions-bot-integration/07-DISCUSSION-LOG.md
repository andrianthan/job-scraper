# Phase 7: GH Actions Bot Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 7-gh-actions-bot-integration
**Mode:** Auto (--auto) — no user interaction; all decisions auto-resolved to recommended defaults

**Areas discussed:** 8 (D-01 through D-08 in CONTEXT.md)

---

## Workflow Extension Point (D-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing `.github/workflows/scan.yml` | Add steps after "Run scan" in the current workflow | ✓ |
| Create new `.github/workflows/csv-push.yml` | Separate workflow triggered by `workflow_run` | |

**User's choice:** Extend existing workflow (--auto default — simpler, no new
trigger surface).

**Notes:** A `workflow_run` trigger would also work and would decouple the CSV
push from the scan, but introduces a second secret-binding surface and a
delay (~30s). Direct extension in the same job is the lighter pattern.

---

## jobs-data Repo Strategy (D-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Separate repo `andrianthan/jobs-data` | Operator creates once; CSV lives at root | ✓ |
| Subdirectory `csv/` in this repo | No second repo; CSV lives in this repo's history | |

**User's choice:** Separate repo (--auto default — per PROJECT.md locked).

**Notes:** Subdirectory option would bloat this repo's git history with the
CSV (a few KB per row × ~200 rows/day = ~60 MB/year).

---

## Push Auth (D-03)

| Option | Description | Selected |
|--------|-------------|----------|
| `GH_TOKEN` PAT secret | Classic or fine-grained PAT stored in this repo's secrets | ✓ |
| SSH deploy key in jobs-data | Operator adds a public key to jobs-data, private key as secret | |
| GITHUB_TOKEN (workflow's default) | Auto-provided; no scope on jobs-data | |

**User's choice:** `GH_TOKEN` PAT (--auto default — GITHUB_TOKEN cannot push
to a different repo, deploy keys are heavier operator-setup).

**Notes:** GITHUB_TOKEN's lack of cross-repo scope is a common stumbling
block. PAT with `contents:write` on jobs-data only (fine-grained) is the
principle-of-least-privilege answer.

---

## Commit Identity (D-04)

| Option | Description | Selected |
|--------|-------------|----------|
| `github-actions[bot]` (default) | No setup; comes for free with `actions/checkout@v4` | ✓ |
| Custom bot account | Operator creates a bot GitHub account, configures in YAML | |

**User's choice:** GitHub Actions bot (--auto default — zero-config, identity
already trusted).

**Notes:** Custom bot would allow a custom avatar / name in jobs-data
contributors list but is unnecessary for v1.1.

---

## Commit Message (D-05)

| Option | Description | Selected |
|--------|-------------|----------|
| `chore(csv): append N new jobs [skip ci]` with run URL | Action-y, traceable, skips re-trigger | ✓ |
| Plain `Update jobs.csv` | Minimal but no traceability | |
| `data: N new jobs` (Conventional Commits) | Standard CC tag, but doesn't embed count | |

**User's choice:** Custom with run URL (--auto default — the traceback is
the most useful part of the message).

**Notes:** `[skip ci]` is critical: if jobs-data ever gets its own workflow
(even just a status check), it would re-trigger the scan in this repo,
creating a loop.

---

## No-Change Skip (D-06)

| Option | Description | Selected |
|--------|-------------|----------|
| `git diff --quiet HEAD -- jobs.csv` → skip commit if exit 0 | Standard, zero-cost | ✓ |
| Always commit (allow empty) | Simpler but spams jobs-data history | |
| Compute hash of new content vs last commit | Avoids git but more code | |

**User's choice:** git diff (--auto default — git's the source of truth for
"did the file change", and it's free).

**Notes:** Empty commits on a 4h cron would produce 6 empty commits/day,
~2200/year, making the history useless.

---

## Cold-Start Handling (D-07)

| Option | Description | Selected |
|--------|-------------|----------|
| `appendRows` already handles ENOENT → write header + rows | Phase 6 D-03 covers this | ✓ |
| Special-case first-run with explicit file creation | Redundant code | |

**User's choice:** Writer handles it (--auto default — no Phase 7 code
needed; Phase 6 D-03 already covers it).

**Notes:** This is the payoff of Phase 6's careful design — the writer is
the single source of truth for "does the file exist?" and Phase 7 doesn't
re-implement that.

---

## Failure Surfacing (D-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Exit 1 with `console.error` + clear message; workflow `if: always()` | Standard, matches scan.mjs pattern | ✓ |
| Silent skip on error (log warning, exit 0) | Hides operator config bugs | |
| Retry with backoff | More complex, masks root cause | |

**User's choice:** Loud failure (--auto default — ROADMAP CSV-03 #3
explicitly requires this).

**Notes:** Silent failure is the most common ops disaster — operator
thinks the bot is working, jobs-data is stale for weeks.

---

## Test Approach (D-10)

| Option | Description | Selected |
|--------|-------------|----------|
| Mocked `git` subprocess for unit tests | Fast, deterministic, covers command construction | ✓ |
| Integration test against real test repo | Heavy; requires test PAT; flaky in CI | |
| Hand-validate YAML only | Brittle to workflow edits | |

**User's choice:** Mocked unit tests (--auto default — matches the project's
zero-deps + node:test pattern, avoids test PAT setup).

**Notes:** Hand-validation is also done in planning, but automated tests
catch regressions in the helper when it's refactored.

---

## Claude's Discretion

- Exact data-handoff shape between scan step and helper (file path vs
  stdin vs env) — planner picks.
- Helper uses `node:child_process.spawn` exclusively (zero-dep rule).
- Error message wording — just needs to be clear.
- Concurrency group for jobs-data (D-13) — Claude recommends extending the
  existing `job-scan` group to also cover CSV push, OR adding
  `git pull --rebase` in the helper. Planner decides based on simplicity
  tradeoff.

## Deferred Ideas

See CONTEXT.md `<deferred>` section — multi-CSV, PR-based workflow, bot
comments, GPG signing, webhooks all noted for future phases.
