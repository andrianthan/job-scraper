---
phase: 05-config-docs-test
plan: 02
subsystem: docs
tags: [readme, documentation, operator-path, env-config]
dependency_graph:
  requires: []
  provides: [operator-setup-path, config-reference-table, env-template]
  affects: [README.md, .env.example]
tech_stack:
  added: []
  patterns: [markdown-operator-guide, env-example-template]
key_files:
  created:
    - .env.example
  modified:
    - README.md
decisions:
  - "README rewrite links to docs/SCHEDULING.md rather than duplicating scheduling content"
  - "DB_PATH env var included in config reference table alongside the four channel vars"
  - ".gitignore already had .env on its own line — no change needed"
metrics:
  duration: 2 minutes
  completed: "2026-06-28T22:22:55Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 5 Plan 2: README Operator Path + .env.example Summary

**One-liner:** README rewritten as a clone-to-first-notification operator guide with a 12-row config reference table; `.env.example` created listing all four channel env vars.

## What Was Built

### Task 1 — README.md rewrite (commit `8027db1`)

Replaced the old developer-focused README with a sequential operator setup path covering:

1. Clone
2. Node 22+ prerequisite (with `node --version` check)
3. Edit `portals.config.mjs` board list + `npm run verify` slug check
4. Copy `.env.example` to `.env`, configure notification channel
5. First run (`node scan.mjs` / `node scan.mjs --notify`)
6. Schedule via `npm run schedule:install` (local cron) or GitHub Actions

Added a **Configuration Reference** table with 12 rows covering every configurable value: `trackedCompanies`, `titleFilter.positive`, `titleFilter.negative`, `locationFilter.alwaysAllow`, `locationFilter.allow`, `locationFilter.block`, `DISCORD_WEBHOOK_URL`, `NOTIFY_EMAIL`, `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`, schedule interval, and `DB_PATH`. Each row includes example and default.

Updated "How it works" diagram to reference `data/jobs.db` (SQLite) instead of the old `data/seen.json` flat store.

### Task 2 — .env.example creation (commit `24cb0d0`)

Created `.env.example` at project root with all four channel env vars (`DISCORD_WEBHOOK_URL`, `NOTIFY_EMAIL`, `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`), each with a comment explaining its purpose and how to obtain it.

Verified `.gitignore` already excludes `.env` on its own line (`^\.env$`) and does not exclude `.env.example`.

## Deviations from Plan

None — plan executed exactly as written. `.gitignore` already had the correct `.env` exclusion, so no file modification was required.

## Verification Results

All plan acceptance criteria passed:

- `grep '## Setup' README.md` — found
- `grep '## Configuration Reference' README.md` — found
- `grep 'portals.config.mjs' README.md` — 9 matches (requirement: ≥3)
- `grep 'SCHEDULING.md' README.md` — found
- `grep 'DISCORD_WEBHOOK_URL' README.md` — found
- `grep 'NOTIFY_EMAIL' README.md` — found
- `grep 'RESEND_API_KEY' README.md` — found
- `grep '\.env\.example' README.md` — found (setup step 4)
- `grep 'node scan.mjs --notify' README.md` — found
- `grep 'schedule:install' README.md` — found
- All four vars in `.env.example` — confirmed
- `grep '^\.env$' .gitignore` — found (line 4)
- `.env.example` not in `.gitignore` — confirmed

## Known Stubs

None. All documentation references real, verified commands, file names, and env var names confirmed against `notify.mjs`, `package.json`, `portals.config.mjs`, and `docs/SCHEDULING.md`.
