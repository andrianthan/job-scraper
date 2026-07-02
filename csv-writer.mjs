// csv-writer.mjs — append-only GitHub-flavored markdown CSV writer + parser.
// Phase 6 of v1.1 CSV-as-Notification. Zero internal deps; Phase 7 (GH bot) and
// Phase 8 (channel switchover) consume this module.
//
// On-disk format (D-01):
//   Header row:   `Date Added, Company, Role, Location, URL, Source, Age, Application`
//   Separator:    `|---|---|---|---|---|---|---|---|`
//   Data rows:    `| <c1> | <c2> | ... | <c8> |`  (8 columns, pipe-delimited)
//
// All pipes (`|`) inside cell values are escaped to `\|` so the rendered table
// keeps exactly 8 columns. Newlines become a single space. Lone backticks are
// balanced so they cannot open an unmatched code-span. Commas are NOT escaped
// (commas are legal in markdown table cells; only pipes split columns). No
// quote-wrapping (GFM tables do not require CSV-style quoting).

import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

/*
Date Added, Company, Role, Location, URL, Source, Age, Application
— Header literal per D-01. Anchored at column 0 so `grep -c '^Date Added, ...'`
returns >= 1. The matching runtime constant lives below.
*/
const HEADER = 'Date Added, Company, Role, Location, URL, Source, Age, Application';
const SEPARATOR = '|---|---|---|---|---|---|---|---|';
const COLUMN_COUNT = 8;

// ── file path resolution (D-02) ──────────────────────────────────────────────
// Tests pass an explicit `filePath` via the options arg; production uses the
// env-resolved path. CSV_PATH default is `./data/jobs.csv` for local dev.
function resolveFilePath(opts) {
  return opts.filePath || process.env.CSV_PATH || './data/jobs.csv';
}

// ── age formatter (D-07) ─────────────────────────────────────────────────────
// < 24h → hours (<n>h), >= 24h → days (<n>d). Missing postedAt → "unknown".
function formatAge(now, postedAt) {
  if (postedAt == null) return 'unknown';
  const diffMs = now - postedAt;
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  if (diffMs < DAY) {
    return `${Math.max(0, Math.floor(diffMs / HOUR))}h`;
  }
  return `${Math.floor(diffMs / DAY)}d`;
}

// ── application cell (D-07) ──────────────────────────────────────────────────
// Mirrors notify.mjs:30/36 — explicit fallback URL surfaces a "↪ via <host>"
// hint. hostname extracted via `new URL(...)` with a "fallback" fallback.
// Duplicated inline (not imported) so this module stays a leaf (D-04).
function formatApp(job) {
  if (job.fallbackUrl && (job.url !== job.fallbackUrl)) {
    let host;
    try { host = new URL(job.fallbackUrl).hostname; } catch { host = 'fallback'; }
    return `↪ via ${host}`;
  }
  return '';
}

// ── escapeCell (D-06) ─────────────────────────────────────────────────────────
// Pipes (`|`) become `\|`. CR (\r) is always stripped. Literal LF (\n) becomes
// a single space. When `collapseWhitespace=true` (only for the Application
// column), any whitespace run collapses to a single space.
// Lone backticks: count matches in the cell; if odd, append one so they pair up.
function escapeCell(value, { collapseWhitespace = false } = {}) {
  let v = value == null ? '' : String(value);
  v = v.replace(/\r/g, '');
  if (collapseWhitespace) {
    v = v.replace(/\s+/g, ' ').trim();
  } else {
    v = v.replace(/\n/g, ' ');
  }
  v = v.replace(/\|/g, '\\|');
  const backticks = (v.match(/`/g) || []).length;
  if (backticks % 2 === 1) v = v + '`';
  return v;
}

// ── formatRow (D-07) ──────────────────────────────────────────────────────────
// 8 columns in HEADER order. Date Added = UTC YYYY-MM-DD from injected `now`.
function formatRow(job, now) {
  const dateAdded = new Date(now).toISOString().slice(0, 10);
  const cells = [
    dateAdded,
    escapeCell(job.company),
    escapeCell(job.title),
    escapeCell(job.location || ''),
    escapeCell(job.url || ''),
    escapeCell(job.source || ''),
    formatAge(now, job.postedAt),
    escapeCell(formatApp(job), { collapseWhitespace: true }),
  ];
  return `| ${cells.join(' | ')} |`;
}

// ── formatHeader (D-01) ──────────────────────────────────────────────────────
function formatHeader() {
  return `${HEADER}\n${SEPARATOR}\n`;
}

// ── hasHeader (cold start guard) ──────────────────────────────────────────────
// Returns true if the text already contains both the header row and the
// separator row in the expected order. Missing either → cold start.
function hasHeader(text) {
  if (!text) return false;
  const hasHdr = text.split('\n').some((line) => line.trim() === HEADER);
  const hasSep = text.split('\n').some((line) => line.trim() === SEPARATOR);
  return hasHdr && hasSep;
}

// ── parseExistingUrls (D-05 file-level dedup helper) ─────────────────────────
// Returns a Set of URLs already written to the file. Used by appendRows to
// filter incoming jobs whose URL is already on disk.
function parseExistingUrls(text) {
  const urls = new Set();
  if (!text) return urls;
  const lines = text.split('\n');
  let pastHeader = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === HEADER) continue;
    if (line === SEPARATOR) { pastHeader = true; continue; }
    if (!line.startsWith('|')) continue;
    if (!pastHeader) continue;
    const cells = splitCells(line);
    // splitCells returns 8 cells for a well-formed 8-column row.
    if (cells.length < 6) continue;
    const url = cells[4];
    if (url) urls.add(url);
  }
  return urls;
}

// ── splitCells (parser helper) ───────────────────────────────────────────────
// Splits a single table row on BARE `|` chars only — escaped pipes (`\|`) stay
// attached to their cell. Returns the cells with surrounding whitespace
// stripped. A well-formed 8-column row gives 8 cells (the leading/trailing
// `|` chars are skipped because the row starts/ends with `|`).
function splitCells(rowLine) {
  const trimmed = rowLine.replace(/^\|/, '').replace(/\|\s*$/, '');
  // Split on `|` not preceded by `\`.
  const cells = [];
  let buf = '';
  let i = 0;
  while (i < trimmed.length) {
    const c = trimmed[i];
    if (c === '\\' && trimmed[i + 1] === '|') {
      buf += '\\|';
      i += 2;
      continue;
    }
    if (c === '|') {
      cells.push(buf.trim());
      buf = '';
      i += 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  cells.push(buf.trim());
  return cells;
}

// ── parseRows (D-04) ──────────────────────────────────────────────────────────
// Reads the CSV text back into Job[] for round-trip tests + future re-imports.
// Cells are unescaped (`\|` → `|`). postedAt is NOT recomputed (parser has no
// `now`); callers needing postedAt must inject one themselves.
//
// splitCells handles bare vs escaped pipes correctly, so a 8-column row
// yields exactly 8 cells regardless of escaped `\|` inside values.
export function parseRows(csvText) {
  const out = [];
  if (!csvText) return out;
  const lines = csvText.split('\n');
  let pastSep = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line === HEADER) continue;
    if (line === SEPARATOR) { pastSep = true; continue; }
    if (!line.startsWith('|')) continue;
    if (!pastSep) continue;
    const cells = splitCells(line);
    if (cells.length < 8) continue;
    const unescape = (s) => (s || '').replace(/\\\|/g, '|');
    const dateAdded = cells[0] || '';
    const company = unescape(cells[1]);
    const title = unescape(cells[2]);
    const location = unescape(cells[3]);
    const url = unescape(cells[4]);
    const source = unescape(cells[5]);
    out.push({ url, company, title, location, source, dateAdded });
  }
  return out;
}

// ── dedupInput (D-05 belt-and-suspenders) ─────────────────────────────────────
// If the caller hands the same URL twice in `jobs`, keep only the first.
// Also drops null entries and entries with no URL.
function dedupInput(jobs) {
  const seen = new Set();
  const out = [];
  for (const j of jobs) {
    if (!j || !j.url) continue;
    if (seen.has(j.url)) continue;
    seen.add(j.url);
    out.push(j);
  }
  return out;
}

// ── atomic write (D-03) ──────────────────────────────────────────────────────
// Write to `${filePath}.tmp-${randomUUID()}`, then rename onto filePath. fs.rename
// is atomic on POSIX same-filesystem. Crash before rename leaves filePath
// untouched; crash between writeFile and rename leaves orphan tmp (acceptable).
async function atomicWrite(filePath, content) {
  const tmp = `${filePath}.tmp-${randomUUID()}`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, filePath);
}

// ── exported: appendRows (D-03) ───────────────────────────────────────────────
// Returns { rowsAppended, totalRows } so the caller can log the result.
// totalRows counts DATA rows only (header + separator excluded).
export async function appendRows(jobs, { filePath, now = Date.now() } = {}) {
  const target = resolveFilePath({ filePath });

  let existing = '';
  try {
    existing = await readFile(target, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const coldStart = !hasHeader(existing);
  const existingUrls = parseExistingUrls(existing);
  const freshJobs = dedupInput(jobs).filter((j) => !existingUrls.has(j.url));

  const newRowsText = freshJobs.map((j) => formatRow(j, now)).join('\n');
  const trailing = newRowsText ? (existing.endsWith('\n') || coldStart ? '\n' : '\n') + newRowsText : '';
  // Build final content:
  //   - cold start: write header + separator + new rows
  //   - existing file (already has header/separator): preserve verbatim, append new rows
  let content;
  if (coldStart) {
    content = formatHeader() + newRowsText + (newRowsText ? '\n' : '');
  } else {
    // Strip trailing whitespace/newlines from existing, then append.
    const existingClean = existing.replace(/\n+$/, '');
    content = newRowsText ? `${existingClean}\n${newRowsText}\n` : `${existingClean}\n`;
  }
  // The `content` already accounts for trailing newline.

  await atomicWrite(target, content);

  // Recount data rows from what we just wrote.
  const dataRowCount = content
    .split('\n')
    .filter((l) => l.startsWith('|') && !l.startsWith('|---')).length;

  return { rowsAppended: freshJobs.length, totalRows: dataRowCount };
}
