# Roadmap: job-board-aggregator

## Overview

A brownfield CLI daemon with a working scanner core. This roadmap hardens that
core, migrates the flat-JSON dedup store to SQLite, wires unattended scheduling,
enriches notifications with digest batching and email, then seals the project
with documentation and an end-to-end test. Each phase delivers a coherent,
verifiable capability on top of what came before.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Scanner Hardening** - Make the existing scanner robust: error isolation, retries, run summary, parked boards, Workday banks (completed 2026-06-28)
- [x] **Phase 2: SQLite Storage** - Replace data/seen.json with a durable SQLite store for jobs, dedup, and run history (completed 2026-06-28)
- [x] **Phase 3: Scheduling** - Wire unattended cron + GitHub Actions execution with incremental-only notifications (completed 2026-06-28)
- [x] **Phase 4: Notifications** - Digest batching, email channel, graceful degradation, sent-log dedup guard (completed 2026-06-28)
- [ ] **Phase 5: Config, Docs & Test** - Operator-ready README, config examples, and a passing end-to-end test suite

## Phase Details

### Phase 1: Scanner Hardening
**Goal**: The scanner runs reliably across all boards even when individual boards fail
**Depends on**: Nothing (builds on existing working core)
**Requirements**: SCAN-01, SCAN-02, SCAN-03, SCAN-04, SCAN-05
**Success Criteria** (what must be TRUE):
  1. A board whose HTTP request errors or times out does not crash the process — remaining boards complete and results are returned
  2. Boards returning 5xx or rate-limit responses are retried with exponential backoff before being counted as failed
  3. Each run prints a summary line: boards scanned / parked / failed and count of new jobs found
  4. Boards configured with `enabled: false` appear in the summary as parked and are never fetched
  5. Morgan Stanley and Citi Workday providers return live job listings; GS/JPM/Citadel entries carry inline comments documenting them as parked pending Avature/Oracle providers
**Plans**: 1 plan

Plans:
- [x] 01-01-PLAN.md — Add HTTP retry/backoff layer + parked counter + summary line

### Phase 2: SQLite Storage
**Goal**: Job dedup and run history persist durably in SQLite across process restarts
**Depends on**: Phase 1
**Requirements**: STORE-01, STORE-02, STORE-03, STORE-04, STORE-05
**Success Criteria** (what must be TRUE):
  1. Running the scanner twice against the same source data produces zero notifications on the second run
  2. Fuzzy same-company role dedup catches reposts seen in prior runs, not only the current in-memory batch
  3. Each completed scan writes a timestamped run record (boards tried, new jobs found) readable from the DB
  4. Running the migration script once imports all URL entries from data/seen.json into the DB with no duplicates introduced
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Create db.mjs (node:sqlite storage module) + gitignore + engines bump
- [x] 02-02-PLAN.md — Wire scan.mjs to db.mjs + create migrate-seen.mjs

### Phase 3: Scheduling
**Goal**: Scans run unattended on a regular interval without operator intervention
**Depends on**: Phase 2
**Requirements**: SCHED-01, SCHED-02, SCHED-03
**Success Criteria** (what must be TRUE):
  1. Running a single documented command installs a local cron entry or commits a GitHub Actions workflow that fires the scan on schedule
  2. Each scheduled run notifies only for jobs not seen in any prior run — triggering the scan immediately again produces zero notifications
  3. The scheduler setup is described in one step the operator can follow without reading source code
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md — Idempotent cron installer + GH Actions workflow (actions/cache) + scheduling docs

### Phase 4: Notifications
**Goal**: Notifications are batched, multi-channel, and protected against duplicate sends
**Depends on**: Phase 3
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04
**Success Criteria** (what must be TRUE):
  1. A scan finding 5 new jobs sends exactly 1 notification (digest), not 5 separate pings
  2. Setting NOTIFY_EMAIL delivers the digest to that address; Discord webhook fires independently if DISCORD_WEBHOOK is set
  3. Running with neither DISCORD_WEBHOOK nor NOTIFY_EMAIL set logs the digest to stdout and exits cleanly without throwing
  4. A job notified in one run is never re-notified in a subsequent run even if it re-appears in the source feed
**Plans**: 1 plan

Plans:
- [x] 04-01-PLAN.md — Notification dispatcher (Discord + Resend email + stdout fallback) + notified_at dup guard + unit tests

### Phase 5: Config, Docs & Test
**Goal**: Any operator can set up and run the daemon end-to-end from only the README
**Depends on**: Phase 4
**Requirements**: DOCS-01, DOCS-02, TEST-01
**Success Criteria** (what must be TRUE):
  1. README provides a sequential path from git clone to first scheduled notification without needing to read source code
  2. Every configurable value (boards, filters, channels, schedule interval) has a documented example with valid defaults
  3. The test command passes with stubbed network, exercising the full fetch → filter → dedup → notify pipeline against a temp SQLite DB
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scanner Hardening | 1/1 | Complete    | 2026-06-28 |
| 2. SQLite Storage | 0/2 | Complete    | 2026-06-28 |
| 3. Scheduling | 1/1 | Complete    | 2026-06-28 |
| 4. Notifications | 1/1 | Complete    | 2026-06-28 |
| 5. Config, Docs & Test | 0/TBD | Not started | - |
