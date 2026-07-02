# Roadmap: job-board-aggregator

## Overview

v1.0 shipped a working CLI daemon (scanner hardening, SQLite storage,
scheduling, notifications, config/docs/test). v1.1 replaces per-company Discord
embeds in `#job-board` with a single, auto-updating CSV hosted in a separate
GitHub repo — pinned message with live raw URL, never re-sent. Field channels
keep their embeds. This roadmap delivers that capability across four phases:
CSV writer/format, GH Actions bot integration, channel switchover, and docs.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Scanner Hardening** - Make the existing scanner robust: error isolation, retries, run summary, parked boards, Workday banks (completed 2026-06-28)
- [x] **Phase 2: SQLite Storage** - Replace data/seen.json with a durable SQLite store for jobs, dedup, and run history (completed 2026-06-28)
- [x] **Phase 3: Scheduling** - Wire unattended cron + GitHub Actions execution with incremental-only notifications (completed 2026-06-28)
- [x] **Phase 4: Notifications** - Digest batching, email channel, graceful degradation, sent-log dedup guard (completed 2026-06-28)
- [x] **Phase 5: Config, Docs & Test** - Operator-ready README, config examples, and a passing end-to-end test suite (completed 2026-06-28)
- [ ] **Phase 6: CSV Writer & Format** - Append-only markdown-table CSV writer with GH-flavored column schema and unit tests
- [ ] **Phase 7: GH Actions Bot Integration** - Auto-commit/push the CSV to `andrianthan/jobs-data` on each scan via configured GH_TOKEN
- [ ] **Phase 8: #job-board Channel Switchover** - Replace per-company embeds with one pinned raw-URL message; field channels untouched
- [ ] **Phase 9: CSV Channel Documentation** - README section covering jobs-data repo creation, GH_TOKEN config, and pinned-message setup

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
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md — scan.mjs testability refactor (export main + guard) + e2e test + npm test script
- [x] 05-02-PLAN.md — README operator-path rewrite + config reference table + .env.example

### Phase 6: CSV Writer & Format
**Goal**: New jobs are appended to a GH-flavored markdown CSV in a stable, testable format
**Depends on**: Phase 5
**Requirements**: CSV-02, CSV-06, CSV-09
**Success Criteria** (what must be TRUE):
  1. A scan that finds N new jobs writes exactly N new rows to the CSV file under a header line: Date Added, Company, Role, Location, URL, Source, Age, Application
  2. Running two consecutive scans with the same input produces zero new rows on the second pass (no duplicate append)
  3. Re-running the scan with one new job adds one row at the bottom — prior rows remain untouched (append-only, never truncated)
  4. The CSV passes a parser round-trip test: reading the file back yields the same jobs in the same order
  5. Pipe characters, commas, and quotes inside job fields are properly escaped so the table renders correctly on GitHub
**Plans**: 1 plan

Plans:
- [ ] 06-01-PLAN.md — csv-writer.mjs (appendRows + parseRows) + test/csv-writer.test.mjs (7 describe blocks)

### Phase 7: GH Actions Bot Integration
**Goal**: Each scan run commits and pushes the CSV to `andrianthan/jobs-data` via GH Actions bot
**Depends on**: Phase 6
**Requirements**: CSV-03
**Success Criteria** (what must be TRUE):
  1. The GH Actions workflow checks out the `andrianthan/jobs-data` repo, runs the scan, writes the CSV, commits it with a `[skip ci]` message, and pushes back to the same branch using the configured `GH_TOKEN`
  2. When no new jobs are found, the workflow exits cleanly without committing an empty-change diff
  3. The workflow fails loudly (non-zero exit) if `GH_TOKEN` or the target repo is misconfigured, rather than silently swallowing the error
  4. After a successful run, the raw URL `https://raw.githubusercontent.com/andrianthan/jobs-data/main/jobs.csv` returns the updated file
**Plans**: TBD

### Phase 8: #job-board Channel Switchover
**Goal**: `#job-board` posts a single pinned raw-URL message; per-company embeds gone; field channels and email preserved
**Depends on**: Phase 7
**Requirements**: CSV-01, CSV-04, CSV-05, CSV-07
**Success Criteria** (what must be TRUE):
  1. Setting `CSV_URL` (the raw URL) makes the `#job-board` channel post exactly one message containing that URL — the message is posted on first run only and never re-sent
  2. Subsequent runs do not re-post to `#job-board` even when new jobs are added to the CSV
  3. `#job-board` no longer renders per-company group embeds (CSV replaces them); field channels (`#finance-pings`, etc.) still receive per-company embeds on new jobs
  4. Email digests still respect `MAX_NOTIFY_PER_COMPANY` (default 5) and the cap=40 grouping; field-channel embeds ignore the per-company cap
  5. Re-running the scan with zero new jobs does not post anything to `#job-board` and does not send a duplicate email
**Plans**: TBD

### Phase 9: CSV Channel Documentation
**Goal**: README documents the CSV channel setup so the operator can reproduce it without reading source
**Depends on**: Phase 8
**Requirements**: CSV-08
**Success Criteria** (what must be TRUE):
  1. README has a CSV Channel Setup section that walks through: create `andrianthan/jobs-data` repo, add `GH_TOKEN` secret, set `CSV_URL` env, pin the message in `#job-board`
  2. The section includes an example CSV URL and an example pinned-message content
  3. `.env.example` lists `CSV_URL`, `GH_TOKEN`, and `JOBS_DATA_REPO` with inline comments
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Scanner Hardening | 1/1 | Complete    | 2026-06-28 |
| 2. SQLite Storage | 2/2 | Complete    | 2026-06-28 |
| 3. Scheduling | 1/1 | Complete    | 2026-06-28 |
| 4. Notifications | 1/1 | Complete    | 2026-06-28 |
| 5. Config, Docs & Test | 2/2 | Complete    | 2026-06-28 |
| 6. CSV Writer & Format | 0/? | Not started | - |
| 7. GH Actions Bot Integration | 0/? | Not started | - |
| 8. #job-board Channel Switchover | 0/? | Not started | - |
| 9. CSV Channel Documentation | 0/? | Not started | - |