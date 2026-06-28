# Phase 3: Scheduling - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Make the scan run unattended on a regular interval. Provide a one-command way to
install a schedule, and ensure scheduled runs are incremental (dedup carries
across runs).

In scope: a local cron install path (primary) + a committed GitHub Actions
workflow (cloud alternative), plus docs for one-step setup.
Out of scope: notifications themselves (Phase 4 — but the schedule should invoke
`scan.mjs --notify` so it's ready), multi-user, web.
</domain>

<decisions>
## Implementation Decisions

### Locked
- **Two schedule paths, both documented:**
  1. **Local cron (primary)** — a single command installs a crontab entry that
     runs `node scan.mjs --notify` on an interval (default hourly). The DB
     (`data/jobs.db`) persists on the machine, so dedup is naturally incremental.
  2. **GitHub Actions (cloud alternative)** — a committed workflow
     (`.github/workflows/scan.yml`) on a `schedule:` cron trigger. Because
     `data/jobs.db` is gitignored and CI is ephemeral, the workflow MUST persist
     dedup state across runs via `actions/cache` keyed on the DB path (restore
     before scan, save after). Secrets (DISCORD_WEBHOOK_URL etc.) via repo
     secrets / env.
- Keep zero runtime npm deps. A tiny install helper script is fine (Node or sh).

### Claude's Discretion
- Install mechanism: a `schedule.mjs` (or `scripts/install-cron.sh`) that appends
  an idempotent crontab line (guard against duplicate entries — grep before add).
- Default interval (hourly recommended) and how the operator overrides it.
- Exact GH Actions cache key strategy (e.g. fixed key + restore-keys so each run
  restores the latest DB, saves updated DB).
</decisions>

<code_context>
## Existing Code Insights

- `scan.mjs` — entry point; `--notify` flag already wired to notify.mjs. The
  scheduler just needs to invoke `node scan.mjs --notify`.
- `data/jobs.db` — SQLite dedup store (gitignored). Persistence is the crux for
  SCHED-02: local cron = same machine = persists; CI = needs cache.
- `package.json` — add a script alias if helpful (e.g. `"schedule:install"`).

Codebase context refined during plan-phase research.
</code_context>

<specifics>
## Specific Ideas

- SCHED-01: one command → installs cron entry OR the committed workflow exists.
- SCHED-02: incremental proven by the DB — re-running immediately yields 0
  notifications (already true from Phase 2; the workflow must not wipe the DB).
- SCHED-03: README/docs section the operator follows in one step (full docs land
  in Phase 5, but a runnable setup note must exist here).
- The GH Actions workflow must use actions/cache to restore+save data/jobs.db so
  scheduled cloud runs don't re-notify everything each time.
</specifics>

<deferred>
## Deferred Ideas

None — discuss skipped.
</deferred>
