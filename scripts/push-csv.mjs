#!/usr/bin/env node
// scripts/push-csv.mjs — Phase 7 GH Actions bot CSV push helper.
// Zero npm deps. Reads new jobs from a JSON file (or stdin path argv),
// appends them to the CSV file via csv-writer.mjs, then commits and pushes
// the result to the jobs-data repo using a configured GH_TOKEN.
//
// Decisions referenced from .planning/phases/07-gh-actions-bot-integration/07-CONTEXT.md:
//   D-03 — push auth (PAT in URL)
//   D-04 — commit identity (github-actions[bot])
//   D-05 — commit message + run URL embed + [skip ci]
//   D-06 — no-change skip (git diff --quiet)
//   D-07 — cold-start handling (writer writes header on missing file)
//   D-08 — helper API (pushCsv({ jobs, env }))
//   D-09 — failure surfacing (exit 1 + clear stderr)
//   D-11 — env wiring (GH_TOKEN, JOBS_DATA_REPO, CSV_PATH, GITHUB_RUN_URL)

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRows } from '../csv-writer.mjs';

// ── runGit: thin wrapper over spawnSync for testability ─────────────────────
// Production path uses default runGit. Tests inject a fake via the
// optional 3rd arg of pushCsv to record calls + return canned responses.
export function runGit(args, opts = {}) {
  return spawnSync('git', args, { stdio: 'pipe', ...opts });
}

// ── pushCsv: public helper API (D-08) ────────────────────────────────────────
// Returns { ok, rowsAppended, totalRows, committed, pushed, error? }.
// `env` is a process.env-like object (defaults to process.env).
// `_runGit` is an optional injectable dependency for tests.
export async function pushCsv({ jobs, env = process.env, _runGit = runGit } = {}) {
  // 1. Resolve JOBS_DATA_REPO with default (D-11).
  const jobsDataRepo = env.JOBS_DATA_REPO || 'andrianthan/jobs-data';
  if (!env.JOBS_DATA_REPO) {
    process.stderr.write('CSV push: JOBS_DATA_REPO not set, defaulting to andrianthan/jobs-data\n');
  }

  // 2. Check GH_TOKEN — exit before any git call (D-09).
  if (!env.GH_TOKEN) {
    const msg = 'GH_TOKEN not set -- skipping CSV push (this is expected for local dev)';
    return { ok: false, error: msg };
  }

  // 3. Resolve CSV_PATH.
  const csvPath = env.CSV_PATH || './jobs-data/jobs.csv';

  // Track whether the file existed before appendRows ran.
  let fileExistedBefore = false;
  try {
    await readFile(csvPath, 'utf8');
    fileExistedBefore = true;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  // 4. Call appendRows() from csv-writer.mjs.
  let rowsAppended;
  let totalRows;
  try {
    const result = await appendRows(jobs, { filePath: csvPath });
    rowsAppended = result.rowsAppended;
    totalRows = result.totalRows;
  } catch (err) {
    return { ok: false, error: `appendRows failed: ${err.message}` };
  }

  // 5. No-change skip when file existed before AND nothing was appended (D-06).
  if (rowsAppended === 0 && fileExistedBefore) {
    process.stderr.write('CSV push: 0 new jobs to append\n');
    return { ok: true, rowsAppended: 0, totalRows, committed: false, pushed: false };
  }

  // 6. Cold start proceeds even with 0 rows (writer wrote header + separator).
  // 7. Belt-and-suspenders diff check (D-06).
  const csvBasename = basename(csvPath);
  const jobsDataDir = isAbsolute(csvPath) ? dirname(csvPath) : process.cwd();
  const diffResult = _runGit(
    ['diff', '--quiet', 'HEAD', '--', csvBasename],
    { cwd: jobsDataDir, stdio: 'pipe' }
  );
  if (diffResult.status === 0) {
    process.stderr.write('CSV push: no changes, skipping\n');
    return { ok: true, rowsAppended, totalRows, committed: false, pushed: false };
  }

  // 8. Set bot identity (D-04).
  _runGit(
    ['config', 'user.name', 'github-actions[bot]'],
    { cwd: jobsDataDir, stdio: 'inherit' }
  );
  _runGit(
    ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'],
    { cwd: jobsDataDir, stdio: 'inherit' }
  );

  // 9. git add jobs.csv.
  const addResult = _runGit(
    ['add', csvBasename],
    { cwd: jobsDataDir, stdio: 'inherit' }
  );
  if (addResult.status !== 0) {
    return { ok: false, error: `git add failed with exit ${addResult.status}`, rowsAppended, totalRows, committed: false, pushed: false };
  }

  // 10/11. Build commit message (D-05) and commit.
  const runUrl = env.GITHUB_RUN_URL || 'local run';
  const commitMsg = `chore(csv): append ${rowsAppended} new jobs [skip ci]\n\nTriggered by: ${runUrl}`;
  const commitResult = _runGit(
    ['commit', '-m', commitMsg],
    { cwd: jobsDataDir, stdio: 'inherit' }
  );
  if (commitResult.status !== 0) {
    return { ok: false, error: `git commit failed with exit ${commitResult.status}`, rowsAppended, totalRows, committed: false, pushed: false };
  }

  // 12. git push with PAT-in-URL (D-03). URL-encode the token for special chars.
  const encodedToken = encodeURIComponent(env.GH_TOKEN);
  const pushUrl = `https://x-access-token:${encodedToken}@github.com/${jobsDataRepo}.git`;
  const pushResult = _runGit(
    ['push', pushUrl, 'HEAD:main'],
    { cwd: jobsDataDir, stdio: 'inherit' }
  );
  if (pushResult.status !== 0) {
    return { ok: false, error: `git push failed with exit ${pushResult.status}`, rowsAppended, totalRows, committed: true, pushed: false };
  }

  // 14. Success.
  return { ok: true, rowsAppended, totalRows, committed: true, pushed: true };
}

// ── CLI mode ──────────────────────────────────────────────────────────────────
// Run as: node scripts/push-csv.mjs <path-to-jobs.json>
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stderr.write('usage: node scripts/push-csv.mjs <path-to-jobs.json>\n');
    process.exitCode = 1;
    return;
  }
  const jobsPath = args[0];
  let jobs;
  try {
    const text = await readFile(jobsPath, 'utf8');
    jobs = JSON.parse(text);
  } catch (err) {
    process.stderr.write(`CSV push: failed to read jobs JSON: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }
  const result = await pushCsv({ jobs, env: process.env });
  if (!result.ok) {
    process.stderr.write(`CSV push: ${result.error}\n`);
    process.exitCode = 1;
  } else {
    process.stderr.write(`CSV push: ${result.rowsAppended} new rows, total ${result.totalRows}, pushed=${result.pushed}\n`);
  }
}

// Detect CLI invocation: process.argv[1] must point to this file.
function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    const argvUrl = fileURLToPath(`file://${process.argv[1]}`);
    return import.meta.url === argvUrl || argvUrl.endsWith('push-csv.mjs');
  } catch {
    return false;
  }
}

if (isMainModule()) {
  await main();
}