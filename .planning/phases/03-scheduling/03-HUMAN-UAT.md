---
status: partial
phase: 03-scheduling
source: [03-VERIFICATION.md]
started: 2026-06-28
updated: 2026-06-28
---

## Current Test

[awaiting human testing — requires pushing repo to GitHub + adding DISCORD_WEBHOOK_URL secret]

## Tests

### 1. Live scheduled run — end-to-end incremental behavior
expected: First scheduled/dispatched run posts new jobs to Discord; an immediate second run posts zero (DB cache dedup works across CI runs).
result: [pending]

steps:
1. Push repo to GitHub (workflow .github/workflows/scan.yml already committed)
2. Settings → Secrets and variables → Actions → add DISCORD_WEBHOOK_URL
3. Actions → Job Board Scan → Run workflow (first trigger) → expect Discord pings
4. Trigger again immediately → expect zero Discord pings

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
