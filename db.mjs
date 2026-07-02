// db.mjs — SQLite storage layer for job-board-aggregator.
// Uses the built-in node:sqlite (Node 22+, zero npm deps).
// DB file: data/jobs.db  (gitignored)

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonKey } from './normalize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, 'data', 'jobs.db');

// Fuzzy-match dedup window. Capping at N days prevents O(N^2) cost growth on
// large companies (Walmart 2k+ titles, PwC 4k+) and avoids false-positive
// dedup where stale roles from months ago fuzzy-match fresh repostings.
const FUZZY_DEDUP_DAYS = Number(process.env.FUZZY_DEDUP_DAYS ?? 90);

let _db = null;

/**
 * Open (or return the cached) database, initialising schema on first call.
 * Creates data/ directory if it does not exist.
 * @returns {DatabaseSync}
 */
export function openDb() {
  if (_db) return _db;
  mkdirSync(join(__dirname, 'data'), { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      url        TEXT PRIMARY KEY,
      company    TEXT NOT NULL DEFAULT '',
      title      TEXT NOT NULL DEFAULT '',
      location   TEXT NOT NULL DEFAULT '',
      first_seen TEXT NOT NULL,
      posted_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
    CREATE TABLE IF NOT EXISTS runs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at     TEXT NOT NULL,
      boards_scanned INTEGER NOT NULL DEFAULT 0,
      boards_parked  INTEGER NOT NULL DEFAULT 0,
      boards_failed  INTEGER NOT NULL DEFAULT 0,
      new_jobs       INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS feed_cache (
      url             TEXT PRIMARY KEY,
      etag            TEXT,
      last_modified   TEXT,
      picked_branch   TEXT,
      last_status     INTEGER,
      last_checked_at TEXT NOT NULL
    );
  `);
  // Idempotent migration: add cooldown_until column for per-entry scheduling.
  // SQLite throws if the column already exists — catch and ignore.
  try { _db.exec('ALTER TABLE feed_cache ADD COLUMN cooldown_until TEXT'); } catch { /* already present */ }
  // Idempotent migration: add notified_at column if not already present.
  // SQLite throws if the column already exists — catch and ignore.
  try { _db.exec('ALTER TABLE jobs ADD COLUMN notified_at TEXT'); } catch { /* already present */ }
  // Canonical dedup key (normalized company|title) — catches the same role
  // arriving from different sources/URLs (e.g. JobSpy indeed URL vs ATS URL).
  let canonAdded = false;
  try { _db.exec('ALTER TABLE jobs ADD COLUMN canon TEXT'); canonAdded = true; } catch { /* already present */ }
  _db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_canon ON jobs(canon)');
  // One-time backfill: SQLite can't run the JS normalizer, so populate canon for
  // existing rows here. Runs once (right after the column is added); subsequent
  // opens skip it because the column already exists.
  if (canonAdded) {
    const rows = _db.prepare("SELECT url, company, title FROM jobs WHERE title != ''").all();
    const upd = _db.prepare('UPDATE jobs SET canon = ? WHERE url = ?');
    for (const r of rows) {
      const k = canonKey(r.company, r.title);
      if (k) upd.run(k, r.url);
    }
  }
  return _db;
}

/**
 * Returns true if the exact URL has already been seen.
 * @param {string} url
 * @returns {boolean}
 */
export function hasSeen(url) {
  const db = openDb();
  return !!db.prepare('SELECT 1 FROM jobs WHERE url = ?').get(url);
}

/**
 * Returns true if a job with this canonical key (normalized company|title) has
 * already been seen — regardless of source or URL. Empty key never matches.
 * @param {string} canon
 * @returns {boolean}
 */
export function hasSeenCanon(canon) {
  if (!canon) return false;
  const db = openDb();
  return !!db.prepare('SELECT 1 FROM jobs WHERE canon = ?').get(canon);
}

/**
 * Persists a new job posting.  INSERT OR IGNORE — safe to call twice.
 * @param {{ url:string, company?:string, title?:string, location?:string, postedAt?:string }} job
 */
export function markSeen(job) {
  const db = openDb();
  const today = new Date().toISOString().slice(0, 10);
  const canon = canonKey(job.company ?? '', job.title ?? '');
  db.prepare(
    'INSERT OR IGNORE INTO jobs (url, company, title, location, first_seen, posted_at, canon) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(job.url, job.company ?? '', job.title ?? '', job.location ?? '', today, job.postedAt ?? null, canon || null);
}

/**
 * Returns stored titles for a company (recent only), used by roleFuzzyMatch in scan.mjs.
 * Windowed by FUZZY_DEDUP_DAYS to bound O(N^2) cost on large feeds and avoid
 * stale-repost false positives — see the FUZZY_DEDUP_DAYS comment above.
 * Excludes rows with no title.
 * @param {string} company
 * @returns {{ title: string }[]}
 */
export function seenRoles(company) {
  const db = openDb();
  return db.prepare(
    "SELECT title FROM jobs WHERE company = ? AND title != '' AND date(first_seen) >= date('now', ?)"
  ).all(company, `-${FUZZY_DEDUP_DAYS} days`);
}

/**
 * Records one scan run in the runs table.
 * @param {{ scanned:number, parked:number, failed:number, newJobs:number }} counts
 */
export function recordRun({ scanned, parked, failed, newJobs }) {
  const db = openDb();
  db.prepare(
    'INSERT INTO runs (started_at, boards_scanned, boards_parked, boards_failed, new_jobs) VALUES (?, ?, ?, ?, ?)'
  ).run(new Date().toISOString(), scanned, parked, failed, newJobs);
}

/**
 * Resets the module-level DB singleton so the next openDb() call reopens with
 * a fresh path.  Used in tests to switch DB_PATH between test cases.
 */
export function _closeDb() {
  if (_db) { _db.close(); _db = null; }
}

/**
 * Marks job URLs as notified (sets notified_at to current ISO timestamp).
 * Only updates rows where notified_at IS NULL — safe to call twice.
 * @param {string[]} urls
 */
export function markNotified(urls) {
  if (!urls.length) return;
  const db = openDb();
  const ts = new Date().toISOString();
  const stmt = db.prepare('UPDATE jobs SET notified_at = ? WHERE url = ? AND notified_at IS NULL');
  for (const url of urls) stmt.run(ts, url);
}

/**
 * Marks every unnotified job as notified — used by `scan.mjs --drain-backlog`
 * to burn a pre-existing backlog without sending anything. Returns the number of
 * rows drained. Idempotent: a second call on an empty backlog returns 0.
 * @returns {number}
 */
export function markAllNotified() {
  const db = openDb();
  const ts = new Date().toISOString();
  const r = db.prepare('UPDATE jobs SET notified_at = ? WHERE notified_at IS NULL').run(ts);
  return r.changes;
}

/**
 * Filters the provided jobs array to those not yet notified (notified_at IS NULL
 * in the DB, or not in the DB at all).
 * @param {{ url: string }[]} jobs
 * @returns {{ url: string }[]}
 */
export function getUnnotified(jobs) {
  if (!jobs.length) return [];
  const db = openDb();
  return jobs.filter(j => {
    const row = db.prepare('SELECT notified_at FROM jobs WHERE url = ?').get(j.url);
    return !row || row.notified_at === null;
  });
}

/**
 * @param {string} url
 * @returns {{ etag: string|null, last_modified: string|null, picked_branch: string|null } | null}
 */
export function getFeedCache(url) {
  const db = openDb();
  const row = db.prepare('SELECT etag, last_modified, picked_branch FROM feed_cache WHERE url = ?').get(url);
  if (!row) return null;
  return {
    etag: row.etag,
    last_modified: row.last_modified,
    picked_branch: row.picked_branch,
  };
}

/**
 * @param {string} url
 * @param {{ etag?: string|null, last_modified?: string|null, picked_branch?: string|null, last_status?: number|null }} fields
 */
export function setFeedCache(url, fields = {}) {
  const db = openDb();
  const now = new Date().toISOString();
  const allowed = ['etag', 'last_modified', 'picked_branch', 'last_status'];
  const columns = ['url', 'last_checked_at'];
  const values = [url, now];
  const updates = ['last_checked_at = excluded.last_checked_at'];

  for (const key of allowed) {
    if (!Object.hasOwn(fields, key) || fields[key] == null) continue;
    columns.push(key);
    values.push(fields[key]);
    updates.push(`${key} = excluded.${key}`);
  }

  const placeholders = columns.map(() => '?').join(', ');
  db.prepare(
    `INSERT INTO feed_cache (${columns.join(', ')}) VALUES (${placeholders})
     ON CONFLICT(url) DO UPDATE SET ${updates.join(', ')}`
  ).run(...values);
}

/**
 * @param {string} url
 * @param {number} status
 */
export function setFeedCacheStatus(url, status) {
  const db = openDb();
  db.prepare(
    `INSERT INTO feed_cache (url, last_status, last_checked_at) VALUES (?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       last_status = excluded.last_status,
       last_checked_at = excluded.last_checked_at`
  ).run(url, status, new Date().toISOString());
}

/**
 * Returns the cooldown_until ISO timestamp for a feed URL, or null when no
 * cooldown is active (never scanned OR cooldown disabled). Used by scan.mjs to
 * gate per-entry fetch calls so slow-changing boards (intern-list aggregator,
 * Workday tenants) don't get re-pinged every cron tick.
 * @param {string} url
 * @returns {string|null}
 */
export function getCooldownUntil(url) {
  const db = openDb();
  const row = db.prepare('SELECT cooldown_until FROM feed_cache WHERE url = ?').get(url);
  return row?.cooldown_until ?? null;
}

/**
 * Persists a cooldown_until timestamp for a feed URL. After a successful
 * fetch, scan.mjs calls this with `now + cooldownHours` so subsequent runs
 * skip the entry until the cooldown expires.
 * @param {string} url
 * @param {string} untilIso  ISO timestamp; pass null to clear.
 */
export function setCooldownUntil(url, untilIso) {
  const db = openDb();
  db.prepare(
    `INSERT INTO feed_cache (url, cooldown_until, last_checked_at) VALUES (?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       cooldown_until = excluded.cooldown_until,
       last_checked_at = excluded.last_checked_at`
  ).run(url, untilIso, new Date().toISOString());
}
