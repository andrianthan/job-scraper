---
phase: 03-scheduling
plan: 01
subsystem: infra
tags: [cron, github-actions, scheduling, posix-sh, actions-cache, sqlite]

# Dependency graph
requires:
  - phase: 02-sqlite-storage
    provides: data/jobs.db dedup store that must persist across cron/CI runs
provides:
  - Idempotent local cron installer (scripts/install-cron.sh) with npm alias
  - GitHub Actions hourly workflow (.github/workflows/scan.yml) with actions/cache DB persistence
  - Operator-facing scheduling docs (docs/SCHEDULING.md) covering both paths in one step each
affects: [04-notifications, 05-docs-and-cleanup]

# Tech tracking
tech-stack:
  added: [POSIX sh (install-cron.sh), GitHub Actions (actions/cache@v4, actions/checkout@v4, actions/setup-node@v4)]
  patterns:
    - Idempotent cron install via grep-qF guard before crontab append
    - Rolling cache key strategy (unique run_id key + prefix restore-keys) for ephemeral CI DB persistence

key-files:
  created:
    - scripts/install-cron.sh
    - .github/workflows/scan.yml
    - docs/SCHEDULING.md
  modified:
    - package.json

key-decisions:
  - "Idempotency implemented with grep -qF 'cd $PROJ_DIR && node scan.mjs' — guards on project directory + binary, prevents duplicates even if operator reruns"
  - "GH Actions cache key strategy: unique key per run_id (always miss → always save) + prefix restore-keys (picks up latest snapshot) — rolling incremental chain"
  - "actions/cache post step saves automatically — no explicit save step needed, keeps workflow simple"

patterns-established:
  - "POSIX sh install scripts: set -e, derive PROJ_DIR via cd dirname, idempotency guard first"
  - "GH Actions DB caching: restore before scan, mkdir -p data guard, unique key for guaranteed save"

requirements-completed: [SCHED-01, SCHED-02, SCHED-03]

# Metrics
duration: 2min
completed: 2026-06-28
---

# Phase 3 Plan 01: Scheduling Summary

**Idempotent hourly cron installer + GitHub Actions workflow with rolling actions/cache DB persistence — both paths invoke `node scan.mjs --notify`**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-28T21:42:35Z
- **Completed:** 2026-06-28T21:44:14Z
- **Tasks:** 3
- **Files modified:** 4 (3 created + package.json updated)

## Accomplishments

- `scripts/install-cron.sh` (POSIX sh): installs `0 * * * * cd <dir> && node scan.mjs --notify` into crontab with `grep -qF` idempotency guard; `npm run schedule:install` is the one-command operator interface
- `.github/workflows/scan.yml`: hourly `schedule:` cron + `workflow_dispatch`, restores `data/jobs.db` from `actions/cache@v4` before scan and saves updated DB via rolling unique-key strategy, injects `DISCORD_WEBHOOK_URL` from repo secrets
- `docs/SCHEDULING.md`: one-step setup for both paths, explains incremental cache behavior and secret setup

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scripts/install-cron.sh and add schedule:install npm alias** - `f14e107` (feat)
2. **Task 2: Create .github/workflows/scan.yml** - `b1f8a58` (feat)
3. **Task 3: Create docs/SCHEDULING.md** - `8d4b679` (docs)

**Plan metadata:** _(final commit hash will be recorded after SUMMARY + state commit)_

## Files Created/Modified

- `scripts/install-cron.sh` — POSIX sh idempotent cron installer; hourly schedule; grep-qF guard
- `.github/workflows/scan.yml` — GH Actions scheduled workflow; actions/cache for data/jobs.db; node scan.mjs --notify
- `docs/SCHEDULING.md` — operator setup guide; both cron and CI paths; one step each
- `package.json` — added `"schedule:install": "sh scripts/install-cron.sh"` script alias

## Verification Output (Real Command Output)

```
====== TASK 1 — install-cron.sh ======
sh -n syntax check:          PASS
grep-qF guard present:       PASS
0 * * * * pattern:           PASS
node scan.mjs --notify:      PASS
package.json schedule:install: PASS

====== TASK 2 — scan.yml ======
actions/cache present:       PASS
schedule: trigger:           PASS
data/jobs.db cache path:     PASS
restore-keys present:        PASS
node scan.mjs --notify:      PASS

====== TASK 3 — SCHEDULING.md ======
file exists:                 PASS
npm run schedule:install:    PASS
crontab -l verify step:      PASS

====== All checks passed ======
```

## Decisions Made

- Idempotency guard uses `grep -qF "cd $PROJ_DIR && node scan.mjs"` — anchors on project directory to allow multiple independent project installs on the same machine without false positives
- Cache key `jobs-db-v1-${{ github.run_id }}` is always unique so actions/cache always saves (cache miss → post-step save); `restore-keys: jobs-db-v1-` is a prefix match that picks up the most recent saved snapshot — creates a rolling incremental chain without needing an explicit save step
- `mkdir -p data` guard added before the scan step so fresh checkouts don't fail if the data/ directory doesn't exist

## Deviations from Plan

None - plan executed exactly as written. All three tasks implemented per spec, all acceptance gate checks pass.

## Issues Encountered

None.

## User Setup Required

**For local cron path:**
- Add `DISCORD_WEBHOOK_URL` to shell profile (`~/.zshrc` or `~/.bashrc`) so cron environment can read it
- Run `npm run schedule:install` once

**For GitHub Actions path:**
- Add `DISCORD_WEBHOOK_URL` as a repository secret in Settings → Secrets and variables → Actions

Both paths are documented in `docs/SCHEDULING.md`.

## Next Phase Readiness

- Scheduling infrastructure complete; Phase 4 (notifications / email channel) can proceed
- `node scan.mjs --notify` is invoked by both paths; Phase 4 can extend notify.mjs without touching scheduling
- No blockers

---
*Phase: 03-scheduling*
*Completed: 2026-06-28*
