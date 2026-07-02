# Requirements — job-board-aggregator (v1: CLI daemon)

REQ-IDs map to exactly one phase (see Traceability, filled by roadmap).

## Validated (existing code)

- ✓ **CORE-00**: Fetch + normalize postings from Greenhouse/Lever/Ashby/Workday
- ✓ **CORE-00b**: Title (intern gate) + location filtering, URL + fuzzy dedup
- ✓ **CORE-00c**: Discord webhook push; live-board verification

## v1 Requirements

### Scanner Hardening
- [x] **SCAN-01**: A failing/timeouted board is isolated — its error is logged and the run continues over all other boards
- [x] **SCAN-02**: Transient HTTP failures (5xx, network, rate-limit) retry with backoff before being counted as failed
- [x] **SCAN-03**: Each run prints a summary: boards scanned / skipped / failed and count of new jobs
- [x] **SCAN-04**: Disabled (`enabled:false`) boards are skipped by the scan but reported as parked
- [x] **SCAN-05**: Workday banks (Morgan Stanley, Citi) are wired and verified live; GS/JPM/Citadel documented as parked pending Avature/Oracle providers

### Storage
- [x] **STORE-01**: Job postings persist in a SQLite database (replacing data/seen.json)
- [x] **STORE-02**: Dedup is enforced by the DB — a job URL already seen is never re-emitted across runs
- [x] **STORE-03**: Fuzzy same-company role dedup is preserved against stored history
- [x] **STORE-04**: Each scan run is recorded (timestamp, counts) for run history
- [x] **STORE-05**: A one-time migration imports any existing data/seen.json into the DB

### Scheduling
- [x] **SCHED-01**: The scan runs unattended on an interval via a scheduler (cron and/or GitHub Actions)
- [x] **SCHED-02**: Scheduled runs are incremental — only genuinely new postings trigger notifications
- [x] **SCHED-03**: A documented one-command setup brings the scheduler up (local cron entry or committed CI workflow)

### Notifications
- [x] **NOTIF-01**: New jobs from a run are batched into a single digest notification (not one ping per job)
- [x] **NOTIF-02**: Email is supported as a notification channel alongside Discord
- [x] **NOTIF-03**: The active channel(s) are selectable via config/env; absent config degrades gracefully (logs, no crash)
- [x] **NOTIF-04**: A sent-notification log prevents re-notifying for the same job

### Config, Docs & Test
- [x] **DOCS-01**: All config (boards, filters, channels, schedule) is documented with examples
- [x] **DOCS-02**: README covers setup → first run → scheduling end to end
- [x] **TEST-01**: An end-to-end test exercises fetch → filter → dedup → notify with stubbed network and a temp DB, asserting only-new-jobs notify

## v2 (deferred)

- Multi-user accounts, per-user subscriptions, REST API
- Web dashboard
- JobSpy fallback (LinkedIn/Indeed), Firecrawl fallback (no-ATS pages)
- Avature / Oracle ATS providers (GS, JPM, Two Sigma)

## Out of Scope (v1)

- Web UI — separate milestone
- Auth / multi-tenant — single-tenant daemon
- Board scraping via HTML/headless — public ATS JSON only

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SCAN-01 | Phase 1 | Complete |
| SCAN-02 | Phase 1 | Complete |
| SCAN-03 | Phase 1 | Complete |
| SCAN-04 | Phase 1 | Complete |
| SCAN-05 | Phase 1 | Complete |
| STORE-01 | Phase 2 | Complete |
| STORE-02 | Phase 2 | Complete |
| STORE-03 | Phase 2 | Complete |
| STORE-04 | Phase 2 | Complete |
| STORE-05 | Phase 2 | Complete |
| SCHED-01 | Phase 3 | Complete |
| SCHED-02 | Phase 3 | Complete |
| SCHED-03 | Phase 3 | Complete |
| NOTIF-01 | Phase 4 | Complete |
| NOTIF-02 | Phase 4 | Complete |
| NOTIF-03 | Phase 4 | Complete |
| NOTIF-04 | Phase 4 | Complete |
| DOCS-01 | Phase 5 | Complete |
| DOCS-02 | Phase 5 | Complete |
| TEST-01 | Phase 5 | Complete |

## v1.1 Requirements

### CSV-as-Notification

- [ ] **CSV-01**: Operator can configure a GitHub-hosted CSV as the `#job-board` notification target — separate `andrianthan/jobs-data` repo, raw URL pinned in channel
- [x] **CSV-02**: Each scan appends new rows to the CSV in GH-flavored markdown table format with columns: Date Added, Company, Role, Location, URL, Source, Age, Application
- [x] **CSV-03**: CSV file is auto-committed by GH Actions bot on each scan run (writes to disk + commits + pushes via configured GH_TOKEN)
- [ ] **CSV-04**: `#job-board` channel posts ONE message with the live raw URL; message is never re-sent — only the underlying file changes
- [ ] **CSV-05**: Per-company group embeds in `#job-board` are removed (CSV replaces them); field channels keep embeds
- [x] **CSV-06**: CSV accumulates across runs (append-only, never truncated); old rows remain for archive/search
- [ ] **CSV-07**: Cap=40 / `MAX_NOTIFY_PER_COMPANY` / company-grouping apply to CSV row count and email digest, not to field-channel embeds
- [ ] **CSV-08**: README documents the CSV channel setup (create jobs-data repo, configure GH_TOKEN, pin message in #job-board)
- [x] **CSV-09**: E2E test covers CSV append behavior (rows added correctly, format stable, no duplicates within CSV)

## Traceability (v1.1)

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CSV-01 | Phase 8 | Pending |
| CSV-02 | Phase 6 | Complete |
| CSV-03 | Phase 7 | Complete |
| CSV-04 | Phase 8 | Pending |
| CSV-05 | Phase 8 | Pending |
| CSV-06 | Phase 6 | Complete |
| CSV-07 | Phase 8 | Pending |
| CSV-08 | Phase 9 | Pending |
| CSV-09 | Phase 6 | Complete |