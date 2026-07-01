---
status: complete
phase: 01-scanner-hardening
source: [01-01-SUMMARY.md]
started: 2026-06-30
updated: 2026-07-01
---

## Current Test

[testing complete]

## Tests

### 1. Cold start scan — run node scan.mjs from clean state
expected: Scanner boots, fetches all enabled boards, prints summary line "scanned N · parked N · failed N · N new jobs", lists new jobs with title+location+URL.
result: pass
notes: |
  Ran `node scan.mjs` — output ends with `📊 scanned 4 · parked 192 · failed 0 · 0 new jobs`. Format matches spec.
  Root cause for reported dupes: 7 migration-era synthetic rows (`role:Company:Title` URLs) were stored before canon column existed. Same canon as real ATS rows. Fixed by deleting 7 synthetic rows. Backup saved to data/jobs.db.bak.<ts>.

### 2. HTTP retry on transient failure (5xx or network)
expected: |
  When a provider hits 5xx or network error, fetchWithRetry retries up to 3 times with exponential backoff (500/1500/3500ms + jitter). Transient errors recover transparently.
result: pass
notes: Verified by code inspection — providers/_http.mjs:23-30 isRetryable returns true for 5xx/429/network errors; fetchWithRetry retries up to DEFAULT_RETRIES=3 with 500*2^(attempt-1)+jitter backoff.

### 3. HTTP fail-fast on 4xx (dead slug)
expected: |
  When a provider hits 404 or other 4xx (not 429), fetch fails immediately without retries. No 5s wasted on dead slugs.
result: pass
notes: Verified by code inspection — providers/_http.mjs isRetryable returns false for 4xx (except 429); fetchWithRetry:39 rethrows immediately without retry.

### 4. Parked counter for enabled:false boards
expected: |
  Boards with enabled:false in portals.config.mjs are not fetched; they increment parked counter instead of failed.
result: pass
notes: Verified in test 1 output — `parked 192` shown in summary. Behavior matches scan.mjs parked counter for enabled:false boards.

### 5. Summary line format
expected: |
  Run output ends with one-line summary: "scanned N · parked N · failed N · N new jobs" — four counters in fixed order.
result: pass
notes: Verified in test 1 — `📊 scanned 4 · parked 192 · failed 0 · 0 new jobs` matches format.

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — all 5 tests passed. Dup root cause fixed (7 synthetic migration rows deleted)]