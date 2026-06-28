#!/usr/bin/env node
// One-time migration: imports data/seen.json → data/jobs.db.
// Idempotent — INSERT OR IGNORE — safe to run multiple times.
//
//   node migrate-seen.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEEN_PATH = join(__dirname, 'data', 'seen.json');

if (!existsSync(SEEN_PATH)) {
  console.log('data/seen.json not found — nothing to migrate.');
  process.exit(0);
}

let seen;
try {
  seen = JSON.parse(readFileSync(SEEN_PATH, 'utf-8'));
} catch (e) {
  console.error(`Failed to parse data/seen.json: ${e.message}`);
  process.exit(1);
}

const db = openDb();
let imported = 0;

// Phase 1: URL entries — exact-URL dedup rows (company/title may be empty).
const insertUrl = db.prepare(
  "INSERT OR IGNORE INTO jobs (url, company, title, location, first_seen) VALUES (?, '', '', '', ?)"
);
for (const [url, date] of Object.entries(seen.urls ?? {})) {
  const { changes } = insertUrl.run(url, typeof date === 'string' ? date : new Date().toISOString().slice(0, 10));
  imported += changes;
}

// Phase 2: Role entries — fuzzy-dedup rows keyed by synthetic URL so they
// persist as seenRoles() results without clobbering real URL rows.
const insertRole = db.prepare(
  "INSERT OR IGNORE INTO jobs (url, company, title, location, first_seen) VALUES (?, ?, ?, '', ?)"
);
const today = new Date().toISOString().slice(0, 10);
for (const role of (seen.roles ?? [])) {
  const syntheticUrl = `role:${role.company ?? ''}:${role.title ?? ''}`;
  const { changes } = insertRole.run(syntheticUrl, role.company ?? '', role.title ?? '', today);
  imported += changes;
}

if (imported === 0) {
  console.log('0 records imported (all already present — idempotent run).');
} else {
  console.log(`Migrated ${imported} record(s) from data/seen.json → data/jobs.db`);
}
