// test/push-csv.test.mjs — Phase 7 push-csv.mjs acceptance suite.
// Run: node --test test/push-csv.test.mjs  (or `npm test` for full suite)
// Tests inject a fake _runGit via pushCsv's 3rd arg — NO real git calls.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const { pushCsv } = await import('../scripts/push-csv.mjs');

// ── Test helpers ────────────────────────────────────────────────────────────
function fakeJob(overrides = {}) {
  return {
    url: `https://example.com/${randomUUID()}`,
    company: 'Acme Co',
    title: 'Finance Intern',
    location: 'New York',
    source: 'greenhouse',
    ...overrides,
  };
}

function fakeJobs(n) {
  return Array.from({ length: n }, () => fakeJob());
}

// Fake _runGit: records every call, returns configurable responses.
// `diffQuiet` controls whether `git diff --quiet` exits 0 or 1.
// `failOn` is an array of git subcommands that should return non-zero exit.
function makeFakeRunGit({ diffQuiet = 1, failOn = [] } = {}) {
  const calls = [];
  const fake = (args, opts = {}) => {
    calls.push({ args, opts });
    const subcommand = args[0];
    if (failOn.includes(subcommand)) {
      return { status: 1, stdout: Buffer.from(''), stderr: Buffer.from(`fake ${subcommand} failed`) };
    }
    if (subcommand === 'diff') {
      return diffQuiet === 0
        ? { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') }
        : { status: 1, stdout: Buffer.from(''), stderr: Buffer.from('') };
    }
    // config / add / commit / push — all succeed by default.
    return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') };
  };
  return { fake, calls };
}

const tmpDirs = [];
afterEach(async () => {
  for (const d of tmpDirs) await rm(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function tmpJobsDataDir() {
  const dir = join(tmpdir(), `push-csv-test-${randomUUID()}`);
  tmpDirs.push(dir);
  return dir;
}

// ── 1. command construction ────────────────────────────────────────────────
describe('pushCsv: command construction', () => {
  test('invokes git config user.name and user.email with bot identity', async () => {
    const dir = tmpJobsDataDir();
    await mkdir(dir, { recursive: true });
    const { fake, calls } = makeFakeRunGit({ diffQuiet: 1 });

    const result = await pushCsv({
      jobs: fakeJobs(2),
      env: { GH_TOKEN: 'ghp_test_token', CSV_PATH: join(dir, 'jobs.csv') },
      _runGit: fake,
    });

    assert.equal(result.ok, true);
    assert.equal(result.committed, true);
    assert.equal(result.pushed, true);

    const configName = calls.find((c) => c.args[0] === 'config' && c.args[1] === 'user.name');
    const configEmail = calls.find((c) => c.args[0] === 'config' && c.args[1] === 'user.email');
    assert.ok(configName, 'git config user.name was called');
    assert.equal(configName.args[2], 'github-actions[bot]');
    assert.ok(configEmail, 'git config user.email was called');
    assert.equal(configEmail.args[2], '41898282+github-actions[bot]@users.noreply.github.com');
  });

  test('invokes git add jobs.csv with the correct basename', async () => {
    const dir = tmpJobsDataDir();
    await mkdir(dir, { recursive: true });
    const { fake, calls } = makeFakeRunGit({ diffQuiet: 1 });

    const result = await pushCsv({
      jobs: fakeJobs(1),
      env: { GH_TOKEN: 'ghp_test_token', CSV_PATH: join(dir, 'jobs.csv') },
      _runGit: fake,
    });

    assert.equal(result.ok, true);
    const addCall = calls.find((c) => c.args[0] === 'add');
    assert.ok(addCall, 'git add was called');
    assert.equal(addCall.args[1], 'jobs.csv');
  });

  test('invokes git commit with chore(csv) message and [skip ci] tag', async () => {
    const dir = tmpJobsDataDir();
    await mkdir(dir, { recursive: true });
    const { fake, calls } = makeFakeRunGit({ diffQuiet: 1 });

    const result = await pushCsv({
      jobs: fakeJobs(2),
      env: { GH_TOKEN: 'ghp_test_token', CSV_PATH: join(dir, 'jobs.csv') },
      _runGit: fake,
    });

    assert.equal(result.ok, true);
    const commitCall = calls.find((c) => c.args[0] === 'commit');
    assert.ok(commitCall, 'git commit was called');
    const msg = commitCall.args[2] || '';
    assert.ok(msg.includes('chore(csv): append 2 new jobs'), `commit msg: ${msg}`);
    assert.ok(msg.includes('[skip ci]'), `commit msg has [skip ci]: ${msg}`);
  });

  test('invokes git push with PAT-in-URL to default jobs-data repo', async () => {
    const dir = tmpJobsDataDir();
    await mkdir(dir, { recursive: true });
    const { fake, calls } = makeFakeRunGit({ diffQuiet: 1 });

    const result = await pushCsv({
      jobs: fakeJobs(1),
      env: { GH_TOKEN: 'ghp_test_token', CSV_PATH: join(dir, 'jobs.csv') },
      _runGit: fake,
    });

    assert.equal(result.ok, true);
    const pushCall = calls.find((c) => c.args[0] === 'push');
    assert.ok(pushCall, 'git push was called');
    assert.ok(
      pushCall.args[1].includes('https://x-access-token:ghp_test_token@github.com/andrianthan/jobs-data.git'),
      `push URL: ${pushCall.args[1]}`
    );
    assert.equal(pushCall.args[2], 'HEAD:main');
  });
});

// ── 2. no-diff skip ────────────────────────────────────────────────────────
describe('pushCsv: no-diff skip', () => {
  test('git diff --quiet exits 0 → no commit, no push', async () => {
    const dir = tmpJobsDataDir();
    await mkdir(dir, { recursive: true });
    // Pre-populate CSV so fileExistedBefore=true (skip-path requires it).
    await writeFile(join(dir, 'jobs.csv'), 'pre-existing', 'utf8');
    const { fake, calls } = makeFakeRunGit({ diffQuiet: 0 });

    const result = await pushCsv({
      jobs: fakeJobs(2),
      env: { GH_TOKEN: 'ghp_test_token', CSV_PATH: join(dir, 'jobs.csv') },
      _runGit: fake,
    });

    assert.equal(result.ok, true);
    assert.equal(result.committed, false);
    assert.equal(result.pushed, false);
    assert.ok(!calls.some((c) => c.args[0] === 'commit'), 'git commit NOT called');
    assert.ok(!calls.some((c) => c.args[0] === 'push'), 'git push NOT called');
  });

  test('git diff --quiet exits 1 (changes present) → proceeds to commit + push', async () => {
    const dir = tmpJobsDataDir();
    await mkdir(dir, { recursive: true });
    const { fake, calls } = makeFakeRunGit({ diffQuiet: 1 });

    const result = await pushCsv({
      jobs: fakeJobs(1),
      env: { GH_TOKEN: 'ghp_test_token', CSV_PATH: join(dir, 'jobs.csv') },
      _runGit: fake,
    });

    assert.equal(result.ok, true);
    assert.equal(result.committed, true);
    assert.equal(result.pushed, true);
    assert.ok(calls.some((c) => c.args[0] === 'commit'));
    assert.ok(calls.some((c) => c.args[0] === 'push'));
  });
});

// ── 3. missing GH_TOKEN ────────────────────────────────────────────────────
describe('pushCsv: missing GH_TOKEN', () => {
  test('returns { ok: false, error: /GH_TOKEN not set/ } and never invokes git', async () => {
    const dir = tmpJobsDataDir();
    await mkdir(dir, { recursive: true });
    const { fake, calls } = makeFakeRunGit({ diffQuiet: 1 });

    const result = await pushCsv({
      jobs: fakeJobs(2),
      env: { CSV_PATH: join(dir, 'jobs.csv') },
      _runGit: fake,
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /GH_TOKEN not set/);
    assert.equal(calls.length, 0, 'no git commands invoked when GH_TOKEN missing');
  });

  test('CLI mode with empty env exits 1 and prints GH_TOKEN message to stderr', async () => {
    const jobsPath = join(tmpdir(), `push-csv-cli-jobs-${randomUUID()}.json`);
    await writeFile(jobsPath, JSON.stringify(fakeJobs(1)), 'utf8');
    try {
      // Use spawnSync to invoke the CLI with empty env (only PATH survives).
      const result = spawnSync('node', ['scripts/push-csv.mjs', jobsPath], {
        env: { PATH: process.env.PATH },
        encoding: 'utf8',
      });
      assert.equal(result.status, 1, `expected exit 1, got ${result.status}; stderr=${result.stderr}`);
      assert.match(result.stderr, /GH_TOKEN not set/);
    } finally {
      await rm(jobsPath, { force: true });
    }
  });
});

// ── 4. JOBS_DATA_REPO default + override ───────────────────────────────────
describe('pushCsv: JOBS_DATA_REPO default + override', () => {
  test('unset JOBS_DATA_REPO → defaults to andrianthan/jobs-data and logs warning', async () => {
    const dir = tmpJobsDataDir();
    await mkdir(dir, { recursive: true });
    const { fake, calls } = makeFakeRunGit({ diffQuiet: 1 });

    const stderrWrites = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk) => { stderrWrites.push(String(chunk)); return true; };

    try {
      const result = await pushCsv({
        jobs: fakeJobs(1),
        env: { GH_TOKEN: 'ghp_t', CSV_PATH: join(dir, 'jobs.csv') },
        _runGit: fake,
      });
      assert.equal(result.ok, true);
    } finally {
      process.stderr.write = origWrite;
    }

    const stderrJoined = stderrWrites.join('');
    assert.match(stderrJoined, /defaulting to andrianthan\/jobs-data/);

    const pushCall = calls.find((c) => c.args[0] === 'push');
    assert.ok(pushCall.args[1].includes('andrianthan/jobs-data'), `push URL uses default: ${pushCall.args[1]}`);
  });

  test('env.JOBS_DATA_REPO = "myfork/jobs-data" → push URL uses myfork', async () => {
    const dir = tmpJobsDataDir();
    await mkdir(dir, { recursive: true });
    const { fake, calls } = makeFakeRunGit({ diffQuiet: 1 });

    const result = await pushCsv({
      jobs: fakeJobs(1),
      env: { GH_TOKEN: 'ghp_t', JOBS_DATA_REPO: 'myfork/jobs-data', CSV_PATH: join(dir, 'jobs.csv') },
      _runGit: fake,
    });

    assert.equal(result.ok, true);
    const pushCall = calls.find((c) => c.args[0] === 'push');
    assert.ok(pushCall.args[1].includes('myfork/jobs-data'), `push URL: ${pushCall.args[1]}`);
  });
});

// ── 5. appendRows error propagation ────────────────────────────────────────
describe('pushCsv: appendRows error propagation', () => {
  test('when appendRows throws (simulated via missing parent dir + read-only), returns error', async () => {
    // Point CSV_PATH at a path inside a non-existent dir — appendRows will fail on
    // atomicWrite when it tries to writeFile in the missing directory.
    const dir = join(tmpdir(), `push-csv-test-doesnotexist-${randomUUID()}`, 'subdir', 'jobs.csv');
    const { fake } = makeFakeRunGit({ diffQuiet: 1 });

    const result = await pushCsv({
      jobs: fakeJobs(2),
      env: { GH_TOKEN: 'ghp_t', CSV_PATH: dir },
      _runGit: fake,
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /appendRows failed/);
  });
});

// ── 6. cold start ──────────────────────────────────────────────────────────
describe('pushCsv: cold start', () => {
  test('when CSV file does not exist, pushCsv still proceeds to commit + push', async () => {
    const dir = tmpJobsDataDir();
    await mkdir(dir, { recursive: true });
    // Do NOT pre-create jobs.csv — writer will create it.
    const { fake, calls } = makeFakeRunGit({ diffQuiet: 1 });

    const result = await pushCsv({
      jobs: fakeJobs(1),
      env: { GH_TOKEN: 'ghp_t', CSV_PATH: join(dir, 'jobs.csv') },
      _runGit: fake,
    });

    assert.equal(result.ok, true);
    assert.equal(result.committed, true);
    assert.equal(result.pushed, true);

    const addCall = calls.find((c) => c.args[0] === 'add');
    assert.ok(addCall, 'git add was called for the newly-created file');
    assert.equal(addCall.args[1], 'jobs.csv');
    assert.ok(calls.some((c) => c.args[0] === 'commit'), 'commit was called');
    assert.ok(calls.some((c) => c.args[0] === 'push'), 'push was called');
  });
});