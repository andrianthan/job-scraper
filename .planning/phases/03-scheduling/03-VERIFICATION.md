---
phase: 03-scheduling
verified: 2026-06-28T22:05:00Z
status: human_needed
score: 5/5 must-haves verified
human_verification:
  - test: "Trigger a live scheduled run and confirm only new jobs are notified"
    expected: "On first run, all current jobs are stored. On second run immediately after, zero notifications fire (dedup working). On a subsequent run hours later with genuinely new postings, only new jobs appear."
    why_human: "Cannot wait for a real cron or GitHub Actions scheduled trigger in a static verification pass. The code paths are correct, but actual end-to-end firing requires a live environment and elapsed time."
---

# Phase 3: Scheduling Verification Report

**Phase Goal:** Scans run unattended on a regular interval without operator intervention.
**Verified:** 2026-06-28T22:05:00Z
**Status:** human_needed — all automated checks pass; one runtime behavior check requires human trigger
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `npm run schedule:install` installs an hourly cron entry invoking `node scan.mjs --notify` | VERIFIED | `package.json` `schedule:install` → `sh scripts/install-cron.sh`; script installs `0 * * * * cd $PROJ_DIR && node scan.mjs --notify` |
| 2 | Running the installer twice produces exactly one cron entry (idempotency guard) | VERIFIED | `grep -qF "cd $PROJ_DIR && node scan.mjs"` guard on line 15; exits 0 if already present |
| 3 | A committed `.github/workflows/scan.yml` exists with a `schedule:` cron trigger | VERIFIED | File exists; confirmed in commit `b1f8a58`; contains `schedule: cron: '0 * * * *'` and `workflow_dispatch` |
| 4 | GH Actions workflow restores `data/jobs.db` from cache before scanning and saves it after — cloud runs are incremental | VERIFIED | `actions/cache@v4` with `path: data/jobs.db`, `restore-keys: jobs-db-v1-`, unique key per `run_id` guarantees auto-save; `mkdir -p data` guards fresh checkout |
| 5 | `docs/SCHEDULING.md` documents both setup paths in one operator-readable step each | VERIFIED | File exists (73 lines); local path: `npm run schedule:install`; GH Actions path: add repo secret; both paths in one-step each |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/install-cron.sh` | Idempotent local cron installer (POSIX sh) | VERIFIED | 25 lines; `bash -n` exits 0; contains `grep -qF` guard, `0 * * * *`, `node scan.mjs --notify`, `crontab -l 2>/dev/null | crontab -` |
| `.github/workflows/scan.yml` | GitHub Actions scheduled workflow | VERIFIED | 35 lines; `schedule:` trigger, `actions/cache@v4`, `restore-keys`, `node scan.mjs --notify`, `DISCORD_WEBHOOK_URL` from secrets, `mkdir -p data` |
| `docs/SCHEDULING.md` | One-step operator setup documentation | VERIFIED | 73 lines; `npm run schedule:install` local path; GH Actions secret setup path; `data/jobs.db` cache explanation |
| `package.json` | Script alias `schedule:install` | VERIFIED | `"schedule:install": "sh scripts/install-cron.sh"` present; zero runtime dependencies (no `dependencies` key) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/install-cron.sh` | `crontab` | `{ crontab -l 2>/dev/null; printf ...; } \| crontab -` | WIRED | Appends to existing crontab; preserves pre-existing entries |
| `.github/workflows/scan.yml` | `data/jobs.db` | `actions/cache@v4` restore + auto-save | WIRED | `path: data/jobs.db`, `restore-keys: jobs-db-v1-` prefix match picks up latest snapshot; unique key per `run_id` ensures post-step save |
| `.github/workflows/scan.yml` | `scan.mjs` | `run: node scan.mjs --notify` | WIRED | Step "Run scan" invokes the entry point directly; `DISCORD_WEBHOOK_URL` injected from repo secret |
| `package.json` `schedule:install` | `scripts/install-cron.sh` | `sh scripts/install-cron.sh` | WIRED | Operator-facing alias confirmed in scripts block |

---

### Data-Flow Trace (Level 4)

Not applicable — artifacts are shell scripts and a YAML workflow config, not dynamic data-rendering components. No state or props to trace.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `install-cron.sh` is valid POSIX sh | `bash -n scripts/install-cron.sh` | exits 0 | PASS |
| Idempotency guard present in installer | `grep -q 'grep -qF.*scan.mjs' scripts/install-cron.sh` | match found | PASS |
| Hourly cron pattern in installer | `grep -q '0 \* \* \* \*' scripts/install-cron.sh` | match found | PASS |
| `--notify` flag in installer | `grep -q 'node scan.mjs --notify' scripts/install-cron.sh` | match found | PASS |
| `actions/cache` step in workflow | `grep -q 'uses: actions/cache' .github/workflows/scan.yml` | match found | PASS |
| `data/jobs.db` as cache path | `grep -q 'data/jobs.db' .github/workflows/scan.yml` | match found | PASS |
| `restore-keys` prefix strategy | `grep -q 'restore-keys' .github/workflows/scan.yml` | match found | PASS |
| `node scan.mjs --notify` in workflow | `grep -q 'node scan.mjs --notify' .github/workflows/scan.yml` | match found | PASS |
| `DISCORD_WEBHOOK_URL` wired from secret | `grep -q 'DISCORD_WEBHOOK_URL' .github/workflows/scan.yml` | match found | PASS |
| `workflow_dispatch` manual trigger | `grep -q 'workflow_dispatch' .github/workflows/scan.yml` | match found | PASS |
| `npm run schedule:install` in docs | `grep -q 'npm run schedule:install' docs/SCHEDULING.md` | match found | PASS |
| `crontab -l` verify step in docs | `grep -q 'crontab -l' docs/SCHEDULING.md` | match found | PASS |
| Zero runtime npm dependencies | `package.json` has no `dependencies` key | confirmed | PASS |
| Task commits exist in git history | `git show f14e107 b1f8a58 8d4b679 --stat` | all three commits found | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| SCHED-01 | 03-01-PLAN.md | Scan runs unattended on interval via scheduler (cron and/or GH Actions) | SATISFIED | Two paths: local cron via `install-cron.sh`, cloud via `scan.yml` with hourly `schedule:` trigger |
| SCHED-02 | 03-01-PLAN.md | Scheduled runs are incremental — only genuinely new postings trigger notifications | SATISFIED (static) / HUMAN for live confirm | Local path: `data/jobs.db` persists on same machine by design (Phase 2); CI path: `actions/cache` ensures DB survives ephemeral runner; runtime confirmation is human_needed |
| SCHED-03 | 03-01-PLAN.md | Documented one-command setup brings scheduler up | SATISFIED | `docs/SCHEDULING.md` provides `npm run schedule:install` for local and single-secret-add for GH Actions |

All three SCHED requirements are mapped to this phase in `REQUIREMENTS.md` and marked Complete. No orphaned requirements found.

---

### Anti-Patterns Found

None. Scanned `scripts/install-cron.sh`, `.github/workflows/scan.yml`, and `docs/SCHEDULING.md` for TODO/FIXME/placeholder/empty returns — clean.

---

### Human Verification Required

#### 1. Live Scheduled Run — End-to-End Incremental Behavior

**Test:** After setting up either schedule path, wait for (or manually trigger) at least two consecutive runs against a real Discord webhook.

**Expected:**
- First run: new jobs are fetched, stored in `data/jobs.db`, Discord notification fires with new listings.
- Second run immediately after (or `workflow_dispatch` trigger): zero new jobs, zero Discord pings — dedup DB catches all already-seen jobs.
- Third run hours later with real new postings: only the genuinely new jobs fire.

**Why human:** Cannot trigger a real cron fire or GitHub Actions `schedule:` event in a static verification pass. The code is structurally correct and wiring is complete, but actual scheduled execution requires a live environment and elapsed time.

**Manual steps for GH Actions path:**
1. Push repo to GitHub (workflow is committed at `.github/workflows/scan.yml`).
2. Add `DISCORD_WEBHOOK_URL` as a repository secret (Settings → Secrets and variables → Actions).
3. Trigger immediately via Actions → Job Board Scan → Run workflow.
4. Check Discord channel for notification output.
5. Trigger again within one minute — confirm zero notifications on second run.

**Manual steps for local cron path:**
1. Export `DISCORD_WEBHOOK_URL` in shell profile (`~/.zshrc` / `~/.bashrc`).
2. Run `npm run schedule:install`.
3. Verify with `crontab -l` — confirm one entry for this project's `scan.mjs`.
4. Wait for the next hour mark (`:00`) and check Discord + `scan.log`.

---

### Gaps Summary

No gaps. All five must-have truths are verified statically. All four artifacts exist, are substantive, and are wired. All three key links are confirmed in code. All SCHED requirement IDs have implementation evidence. Zero anti-patterns or stub patterns found.

The single human_needed item is an inherent property of scheduled execution — it cannot be proven without a real clock tick or live trigger. The static guarantees are strong: the cron script is syntactically valid, idempotent, and invokes the correct binary; the GH Actions workflow uses the correct cache strategy; both paths are documented for one-command operator setup.

---

_Verified: 2026-06-28T22:05:00Z_
_Verifier: Claude (gsd-verifier)_
