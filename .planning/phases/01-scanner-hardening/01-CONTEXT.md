# Phase 1: Scanner Hardening - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

The scanner runs reliably across all boards even when individual boards fail.
Scope: error isolation per board, retry-with-backoff for transient failures, a
run summary line, parked-board reporting, and confirming the Workday banks
(Morgan Stanley, Citi) are wired while GS/JPM/Citadel stay documented as parked.

In scope: scan.mjs orchestration robustness, providers/_http.mjs retry/backoff,
portals.config.mjs parked annotations.
Out of scope: SQLite (Phase 2), scheduling (Phase 3), notifications (Phase 4).
</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion — discuss skipped. Guidance:
- Keep zero-dependency (native fetch, node builtins).
- Retry only idempotent GET/POST list calls on 5xx / 429 / network errors;
  cap retries (e.g. 2-3) with exponential backoff + jitter. Do NOT retry 4xx
  (other than 429) — a 404 is a dead slug, not transient.
- Per-board failures must be caught so one bad board never aborts the run
  (scan.mjs already wraps fetch in try/catch — verify + strengthen).
- Summary line already partially exists; ensure it reports scanned/parked/failed/new.
</decisions>

<code_context>
## Existing Code Insights

- `scan.mjs` — orchestrator; already try/catches per board, prints a 📊 summary.
- `providers/_http.mjs` — shared `fetchWithTimeout`/`fetchJson`; central place to
  add retry/backoff so every provider benefits.
- `providers/ashby.mjs` — already does its own backoff+jitter retry (model to follow).
- `portals.config.mjs` — has `enabled:false` parked entries (GS/JPM/Citadel/etc).
- `verify-slugs.mjs` — probes boards live/dead; useful for SCAN-05 verification.

Codebase context refined during plan-phase research.
</code_context>

<specifics>
## Specific Ideas

- SCAN-05: Morgan Stanley (`ms.wd5/External`) and Citi (`citi.wd5/2`) already
  verified live (~1000 each, Workday cap). Just confirm + keep parked comments
  on GS/JPM/Citadel/Two Sigma/McKinsey.
</specifics>

<deferred>
## Deferred Ideas

None — discuss skipped.
</deferred>
