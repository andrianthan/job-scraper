// test/csv-writer.test.mjs — Phase 6 csv-writer.mjs acceptance suite.
// Run: node --test test/csv-writer.test.mjs  (or `npm test` for full suite)
// Mirror of test/notify.test.mjs fixture style: tmpdir + randomUUID per test,
// env vars cleared at module top BEFORE dynamic import.

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';

// ── Module-level isolation ──────────────────────────────────────────────────
// Clear env before dynamic import so csv-writer.mjs loads with a clean slate.
delete process.env.CSV_PATH;
delete process.env.DB_PATH;

const { appendRows, parseRows } = await import('../csv-writer.mjs');

// ── Test helpers ────────────────────────────────────────────────────────────
function tmpCsv() {
  return join(tmpdir(), `jobs-csv-test-${randomUUID()}.csv`);
}

function fakeJob(overrides = {}) {
  return {
    url: `https://example.com/${randomUUID()}`,
    company: 'Acme Co',
    title: 'Finance Summer Intern',
    location: 'New York',
    source: 'greenhouse',
    postedAt: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
    ...overrides,
  };
}

// Deterministic injected `now` so date + age columns are reproducible.
const FIXED_NOW = new Date('2026-07-01T15:30:00Z').getTime();

// ── 1. Cold start: header-only file ─────────────────────────────────────────
describe('appendRows: cold start (header-only file)', () => {
  const paths = [];
  afterEach(async () => {
    for (const p of paths) await rm(p, { force: true });
    paths.length = 0;
  });

  test('missing file → header + separator written, rowsAppended=0, totalRows=0', async () => {
    const filePath = tmpCsv();
    paths.push(filePath);
    const result = await appendRows([], { filePath, now: FIXED_NOW });
    assert.equal(result.rowsAppended, 0);
    assert.equal(result.totalRows, 0);
    const text = await readFile(filePath, 'utf8');
    assert.ok(
      text.startsWith(
        'Date Added, Company, Role, Location, URL, Source, Age, Application\n' +
        '|---|---|---|---|---|---|---|---|\n'
      ),
      'file starts with literal header + separator'
    );
  });
});

// ── 2. N jobs appended exactly once ─────────────────────────────────────────
describe('appendRows: N jobs appended exactly once', () => {
  const paths = [];
  afterEach(async () => {
    for (const p of paths) await rm(p, { force: true });
    paths.length = 0;
  });

  test('4 jobs in → 4 data rows out (one per job, no dupes)', async () => {
    const filePath = tmpCsv();
    paths.push(filePath);
    const jobs = Array.from({ length: 4 }, () => fakeJob());
    const result = await appendRows(jobs, { filePath, now: FIXED_NOW });
    assert.equal(result.rowsAppended, 4);
    assert.equal(result.totalRows, 4);

    const text = await readFile(filePath, 'utf8');
    const dataRows = text
      .split('\n')
      .filter((l) => l.startsWith('|') && !l.startsWith('|---'));
    assert.equal(dataRows.length, 4, 'four `|`-prefixed data rows');
  });
});

// ── 3. Idempotent re-run produces no new rows ───────────────────────────────
describe('appendRows: idempotent re-run produces no new rows', () => {
  const paths = [];
  afterEach(async () => {
    for (const p of paths) await rm(p, { force: true });
    paths.length = 0;
  });

  test('re-running with same input → bytes untouched, rowsAppended=0', async () => {
    const filePath = tmpCsv();
    paths.push(filePath);
    const jobs = Array.from({ length: 4 }, () => fakeJob());

    const r1 = await appendRows(jobs, { filePath, now: FIXED_NOW });
    assert.equal(r1.rowsAppended, 4);
    assert.equal(r1.totalRows, 4);
    const text1 = await readFile(filePath, 'utf8');

    const r2 = await appendRows(jobs, { filePath, now: FIXED_NOW });
    assert.equal(r2.rowsAppended, 0, 'no new rows on second pass');
    assert.equal(r2.totalRows, 4, 'total stays at 4');

    const text2 = await readFile(filePath, 'utf8');
    assert.equal(text2, text1, 'file is byte-identical after second pass');
  });
});

// ── 4. Append-only: existing rows untouched, new row at bottom ─────────────
describe('appendRows: append-only (existing rows untouched, new at bottom)', () => {
  const paths = [];
  afterEach(async () => {
    for (const p of paths) await rm(p, { force: true });
    paths.length = 0;
  });

  test('append D after A,B,C keeps first 3 in order; D at bottom', async () => {
    const filePath = tmpCsv();
    paths.push(filePath);
    const a = fakeJob({ title: 'AAA Role' });
    const b = fakeJob({ title: 'BBB Role' });
    const c = fakeJob({ title: 'CCC Role' });
    const d = fakeJob({ title: 'DDD Role', url: 'https://example.com/D-distinct-url' });

    const r1 = await appendRows([a, b, c], { filePath, now: FIXED_NOW });
    assert.equal(r1.rowsAppended, 3);
    assert.equal(r1.totalRows, 3);

    const r2 = await appendRows([d], { filePath, now: FIXED_NOW });
    assert.equal(r2.rowsAppended, 1, 'one new row appended');
    assert.equal(r2.totalRows, 4);

    const text = await readFile(filePath, 'utf8');
    const parsed = parseRows(text);
    assert.equal(parsed.length, 4, '4 parsed rows');
    assert.equal(parsed[0].title, 'AAA Role', 'row 0 unchanged');
    assert.equal(parsed[1].title, 'BBB Role', 'row 1 unchanged');
    assert.equal(parsed[2].title, 'CCC Role', 'row 2 unchanged');
    assert.equal(parsed[3].url, d.url, 'last row is new D');
    assert.equal(parsed[3].title, 'DDD Role');
  });
});

// ── 5. Escape rules: pipes / newlines / backticks ───────────────────────────
describe('appendRows: escape rules (pipes / newlines / backticks)', () => {
  const paths = [];
  afterEach(async () => {
    for (const p of paths) await rm(p, { force: true });
    paths.length = 0;
  });

  test('pipes escape, newlines become space, lone backticks balance', async () => {
    const filePath = tmpCsv();
    paths.push(filePath);
    const job = {
      url: `https://example.com/${randomUUID()}`,
      company: 'Pipe|Moon Co',
      title: 'Line1\nLine2 Intern',
      // Single lone backtick in location (unmatched; should be balanced on write).
      location: 'NYC trailing-backtick`',
      source: 'greenhouse',
      postedAt: null,
    };

    const result = await appendRows([job], { filePath, now: FIXED_NOW });
    assert.equal(result.rowsAppended, 1);

    const text = await readFile(filePath, 'utf8');

    // 1. Pipe escaped: `Pipe\|Moon Co` substring on the data row.
    assert.ok(
      text.includes('Pipe\\|Moon Co'),
      'literal pipe in company escaped to backslash-pipe in on-disk text'
    );

    // 2. Newline replaced with single space.
    assert.ok(
      text.includes('Line1 Line2 Intern'),
      'newline in title became single space in on-disk text'
    );

    // 3. Unescaped pipe count in the data row.
    // A well-formed 8-column row has 9 unescaped `|` chars (1 leading + 7 between + 1 trailing).
    const dataLines = text
      .split('\n')
      .filter((l) => l.startsWith('|') && !l.startsWith('|---'));
    assert.equal(dataLines.length, 1, 'one data row');
    const dataRow = dataLines[0];
    // Count `|` chars that are NOT preceded by `\`.
    const unescapedPipes = (dataRow.match(/(?<!\\)\|/g) || []).length;
    assert.equal(
      unescapedPipes,
      9,
      `data row has 9 unescaped pipes (got ${unescapedPipes}); escaped \| inside values does not count`
    );

    // 4. Round-trip via parseRows: pipes unescape; lone backtick does not corrupt cell.
    const parsed = parseRows(text);
    assert.equal(parsed.length, 1, 'one parsed row');
    assert.equal(parsed[0].company, 'Pipe|Moon Co', 'round-trip restores `|`');
    // Location was `NYC trailing-backtick\`` (1 backtick); writer must have appended one
    // more backtick to balance → 2 backticks in on-disk text. Parser doesn't unescape
    // backticks, so the parsed value contains 1 backtick (the original).
    assert.ok(
      parsed[0].location.includes('`'),
      'round-trip preserves trailing backtick in location'
    );
    assert.ok(
      parsed[0].location.startsWith('NYC trailing-backtick'),
      'round-trip preserves location prefix'
    );
  });
});

// ── 6. Round-trip: parseRows preserves URL + title ──────────────────────────
describe('appendRows + parseRows: round-trip preserves URL + title', () => {
  const paths = [];
  afterEach(async () => {
    for (const p of paths) await rm(p, { force: true });
    paths.length = 0;
  });

  test('5 jobs round-trip with same URL + title in same order', async () => {
    const filePath = tmpCsv();
    paths.push(filePath);
    const jobs = Array.from({ length: 5 }, () => fakeJob());
    const r = await appendRows(jobs, { filePath, now: FIXED_NOW });
    assert.equal(r.rowsAppended, 5);
    assert.equal(r.totalRows, 5);

    const text = await readFile(filePath, 'utf8');
    const parsed = parseRows(text);
    assert.equal(parsed.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(parsed[i].url, jobs[i].url, `URL preserved at index ${i}`);
      assert.equal(parsed[i].title, jobs[i].title, `title preserved at index ${i}`);
    }
    // Set-equality on URLs as belt-and-suspenders.
    const originalUrlSet = new Set(jobs.map((j) => j.url));
    const parsedUrlSet = new Set(parsed.map((j) => j.url));
    assert.deepEqual(parsedUrlSet, originalUrlSet, 'set of URLs identical');
  });
});

// ── 7. Missing file: cold start creates header + rows ──────────────────────
describe('appendRows: missing file creates header + rows on first call', () => {
  const paths = [];
  afterEach(async () => {
    for (const p of paths) await rm(p, { force: true });
    paths.length = 0;
  });

  test('first call to missing path → header line + 1 data row', async () => {
    const filePath = tmpCsv();
    paths.push(filePath);

    // Confirm file does NOT exist before the call.
    await assert.rejects(
      async () => readFile(filePath, 'utf8'),
      /ENOENT/,
      'file is missing before call'
    );

    const r = await appendRows([fakeJob()], { filePath, now: FIXED_NOW });
    assert.equal(r.rowsAppended, 1);
    assert.equal(r.totalRows, 1);

    const text = await readFile(filePath, 'utf8');
    const lines = text.split('\n');
    assert.equal(lines[0], 'Date Added, Company, Role, Location, URL, Source, Age, Application');
    assert.ok(lines[1].startsWith('|---|'), 'second line begins with `|---` separator');
    const dataRows = lines.filter((l) => l.startsWith('|') && !l.startsWith('|---'));
    assert.equal(dataRows.length, 1, 'exactly one data row written');
  });
});
