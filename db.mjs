// db.mjs — SQLite storage layer for job-board-aggregator.
// Uses the built-in node:sqlite (Node 22+, zero npm deps).
// DB file: data/jobs.db  (gitignored)

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, 'data', 'jobs.db');

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
  `);
  // Idempotent migration: add notified_at column if not already present.
  // SQLite throws if the column already exists — catch and ignore.
  try { _db.exec('ALTER TABLE jobs ADD COLUMN notified_at TEXT'); } catch { /* already present */ }
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
 * Persists a new job posting.  INSERT OR IGNORE — safe to call twice.
 * @param {{ url:string, company?:string, title?:string, location?:string, postedAt?:string }} job
 */
export function markSeen(job) {
  const db = openDb();
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(
    'INSERT OR IGNORE INTO jobs (url, company, title, location, first_seen, posted_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(job.url, job.company ?? '', job.title ?? '', job.location ?? '', today, job.postedAt ?? null);
}

/**
 * Returns stored titles for a company, used by roleFuzzyMatch in scan.mjs.
 * Excludes migration-era rows that have no title (empty string).
 * @param {string} company
 * @returns {{ title: string }[]}
 */
export function seenRoles(company) {
  const db = openDb();
  return db.prepare("SELECT title FROM jobs WHERE company = ? AND title != ''").all(company);
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
