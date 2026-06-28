---
phase: 04-notifications
verified: 2026-06-28T00:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 4: Notifications Verification Report

**Phase Goal:** Notifications are batched, multi-channel, and protected against duplicate sends.
**Verified:** 2026-06-28
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 5 new jobs → exactly 1 digest notification per configured channel per run | VERIFIED | Test "NOTIF-01: 5 jobs with email → 1 send, not 5" asserts calls.length === 1 and passes live. notifyEmail is one POST regardless of job count. |
| 2 | NOTIFY_EMAIL + RESEND_API_KEY → email sent via POST https://api.resend.com/emails (no SMTP, no lib) | VERIFIED | notify.mjs line 67: `_fetch('https://api.resend.com/emails', ...)` with `Authorization: Bearer ${apiKey}`. Test asserts url includes resend.com/emails and Bearer header. Zero npm deps confirmed (package.json has no dependencies field). |
| 3 | DISCORD_WEBHOOK_URL or DISCORD_WEBHOOK set → Discord embed batches sent (≤10/message, still 1 digest) | VERIFIED | notify.mjs line 22: `process.env.DISCORD_WEBHOOK_URL \|\| process.env.DISCORD_WEBHOOK`; chunk(jobs, 10) splits embeds. notify.mjs line 94: same alias in dispatcher gate. |
| 4 | Neither channel configured → digest printed to stdout, process exits 0 without throwing | VERIFIED | Live smoke test: `unset` all channel vars, run notify with 1 job → printed "--- 1 new internship ---" to stdout, EXIT: 0. Test "NOTIF-03: no channels → no fetch calls (stdout only)" also asserts calls.length === 0. |
| 5 | A job notified in run N is never re-notified in run N+1 (notified_at guard) | VERIFIED | db.mjs markNotified uses `AND notified_at IS NULL` guard. Test "jobs are excluded after markNotified" asserts getUnnotified returns 0 after marking. scan.mjs calls getUnnotified(newJobs) before notify and markNotified after. |
| 6 | Both channels configured → both fire independently; one rejection does not block the other | VERIFIED | notify.mjs lines 107-116: `Promise.allSettled([hasDiscord ? notifyDiscord(jobs) : ..., hasEmail ? notifyEmail(jobs) : ...])` — allSettled ensures neither rejection propagates to block the other. Rejections are logged individually. |
| 7 | node --test test/notify.test.mjs passes with no real credentials | VERIFIED | Live run: 8 tests, 8 pass, 0 fail, 0 cancelled. No real credentials used — _setFetch injects a mock that returns `{ ok: true }`. |

**Score:** 7/7 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `db.mjs` | notified_at column, markNotified, getUnnotified, _closeDb, DB_PATH env override | VERIFIED | 128 lines. DB_PATH on line 11 (`process.env.DB_PATH \|\| ...`). ALTER TABLE try/catch on line 45. All 4 exports confirmed at lines 97, 106, 120, 97. |
| `notify.mjs` | notify dispatcher + notifyDiscord + notifyEmail + _setFetch | VERIFIED | 117 lines. All 4 exports present: _setFetch (line 9), notifyDiscord (line 21), notifyEmail (line 51), notify (line 91). Zero npm imports. |
| `scan.mjs` | Wired to notify dispatcher + getUnnotified filter + markNotified after send | VERIFIED | 137 lines. Line 16 imports getUnnotified and markNotified. Lines 125-132: notify block uses dispatcher pattern. notifyDiscord absent. |
| `test/notify.test.mjs` | Runnable proof of digest (1 send) and dup guard (0 sends) with no real creds | VERIFIED | 124 lines. 8 assertions in 2 describe blocks. Uses node:test (built-in). _setFetch hook eliminates real network. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| scan.mjs notify block | notify.mjs:notify | dynamic import + await | VERIFIED | Line 126: `const { notify } = await import('./notify.mjs');` Line 129: `await notify(unnotified);` |
| scan.mjs notify block | db.mjs:markNotified | static import | VERIFIED | Line 16: `import { ..., getUnnotified, markNotified } from './db.mjs';` Line 130: `markNotified(unnotified.map(j => j.url));` |
| notify.mjs:notifyEmail | https://api.resend.com/emails | _fetch POST with Bearer token | VERIFIED | Line 67: `_fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: \`Bearer ${apiKey}\` } })` |
| notify.mjs:notify | stdout fallback | console.log when no channels | VERIFIED | Line 99: `console.log(\`--- ${jobs.length} new internship...\`)` — reached only when hasDiscord && hasEmail are both false. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| notify.mjs:notify | jobs (parameter) | Caller (scan.mjs via getUnnotified) | Yes — filtered from real SQLite query | FLOWING |
| notify.mjs:notifyEmail | to, apiKey | process.env.NOTIFY_EMAIL, process.env.RESEND_API_KEY | Yes — runtime env; stubbed in tests via _setFetch | FLOWING |
| db.mjs:getUnnotified | row.notified_at | `SELECT notified_at FROM jobs WHERE url = ?` | Yes — real SQLite SELECT per job URL | FLOWING |
| db.mjs:markNotified | ts (ISO timestamp) | `new Date().toISOString()` → UPDATE jobs | Yes — real UPDATE with AND notified_at IS NULL guard | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 8 notify tests pass with no credentials | `node --test test/notify.test.mjs` | tests 8, pass 8, fail 0 | PASS |
| NOTIF-03: no channels → stdout digest, exit 0 | `unset` all channel vars; `node --input-type=module --eval "...await notify([...])"` | "--- 1 new internship ---" printed; EXIT: 0 | PASS |
| Resend endpoint wired | `grep "api.resend.com/emails" notify.mjs` | 2 matches (comment + call) | PASS |
| Discord alias present | `grep "DISCORD_WEBHOOK_URL \|\| process.env.DISCORD_WEBHOOK" notify.mjs` | 2 matches (notifyDiscord + dispatcher gate) | PASS |
| notifyDiscord absent from scan.mjs | `grep "notifyDiscord" scan.mjs` | no output | PASS |
| Zero npm dependencies | `cat package.json` | no "dependencies" key; no email/SMTP lib | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| NOTIF-01 | 04-01-PLAN.md | New jobs batched into single digest (not one ping per job) | SATISFIED | notifyEmail sends 1 POST regardless of job count. Test "NOTIF-01: 5 jobs with email → 1 send, not 5" passes. Discord chunks at 10 but remains 1 logical digest. |
| NOTIF-02 | 04-01-PLAN.md | Email supported as notification channel alongside Discord | SATISFIED | notifyEmail POSTs to https://api.resend.com/emails with Bearer auth. Both channels fire via Promise.allSettled when both configured. Test asserts Resend endpoint and Bearer header. |
| NOTIF-03 | 04-01-PLAN.md | Absent config degrades gracefully (logs to stdout, no crash) | SATISFIED | notify() stdout branch reached when hasDiscord && hasEmail both false. Live smoke test: EXIT: 0, digest printed. Test asserts 0 fetch calls. |
| NOTIF-04 | 04-01-PLAN.md | Sent-notification log prevents re-notifying for same job | SATISFIED | notified_at column added idempotently in openDb(). markNotified uses AND notified_at IS NULL guard. getUnnotified filters on that column. scan.mjs marks after send. Test "jobs are excluded after markNotified" asserts 0 on second call. |

---

### Anti-Patterns Found

None.

Scan summary:
- No TODO/FIXME/PLACEHOLDER/XXX comments in any of the 4 files.
- No `return null`, `return {}`, `return []` stubs in production paths. The `if (!urls.length) return;` and `if (!jobs.length) return;` guards are valid early-returns, not stubs.
- No hardcoded empty data flowing to rendering.
- Promise.allSettled properly handles channel isolation — one failure cannot silence the other.
- `_setFetch` injectable hook is a deliberate test seam, not a stub. The module default (`fetch`) is real.

---

### Human Verification Required

None for automated goals. The following is informational for production readiness (not a gap):

**Real email delivery test**
Test: Set a real RESEND_API_KEY and NOTIFY_EMAIL, then run `node scan.mjs --notify` with at least one new job.
Expected: Email arrives at recipient inbox with job list HTML.
Why human: Requires a live Resend API key and verified sender address — cannot verify without credentials.

---

### Gaps Summary

No gaps. All 7 must-haves are verified. All 4 requirements (NOTIF-01 through NOTIF-04) are satisfied. The test suite runs clean with 8/8 assertions passing live. The no-credentials fallback works exactly as specified (stdout digest, exit 0). Zero npm dependencies confirmed.

---

_Verified: 2026-06-28_
_Verifier: Claude (gsd-verifier)_
