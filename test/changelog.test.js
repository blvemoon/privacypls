import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateChangelog, buildChangelog, getChangelog, isNextVersion, parseVersion, formatDate } from '../lib/changelog.js';

const entry = (version, date, changes = { bugFixes: ['Fixed a thing.'] }) => ({ version, date, summary: 'Summary', changes });
const problemsFor = (entries) => validateChangelog({ entries }).problems;

test('changelog: the real file is valid and matches package.json', () => {
  const entries = getChangelog();
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(entries[0].version, pkg.version);
  assert.equal(entries.at(-1).version, '0.0.1');
});

test('changelog: version steps follow semantic versioning', () => {
  const v = parseVersion;
  assert.ok(isNextVersion(v('0.0.1'), v('0.0.2')));
  assert.ok(isNextVersion(v('0.0.9'), v('0.0.10')));
  assert.ok(isNextVersion(v('0.0.3'), v('0.1.0')));
  assert.ok(isNextVersion(v('0.4.2'), v('1.0.0')));
  assert.equal(isNextVersion(v('0.0.2'), v('0.0.4')), false);
  assert.equal(isNextVersion(v('0.0.3'), v('0.1.1')), false);
  assert.equal(isNextVersion(v('0.0.2'), v('0.0.2')), false);
  assert.equal(parseVersion('0.01'), null);
  assert.equal(parseVersion('01.0.0'), null);
});

test('changelog: accepts a good file, newest first', () => {
  assert.deepEqual(problemsFor([entry('0.1.0', '2026-12-01'), entry('0.0.2', '2026-11-14'), entry('0.0.1', '2026-11-12')]), []);
});

test('changelog: rejects gaps, repeats, wrong order, and a missing 0.0.1', () => {
  assert.ok(problemsFor([entry('0.0.3', '2026-11-20'), entry('0.0.1', '2026-11-12')]).some((p) => p.includes("doesn't follow")));
  assert.ok(problemsFor([entry('0.0.1', '2026-11-12'), entry('0.0.2', '2026-11-14')]).length > 0);
  assert.ok(problemsFor([entry('0.0.2', '2026-11-14'), entry('0.0.2', '2026-11-14'), entry('0.0.1', '2026-11-12')]).length > 0);
  assert.ok(problemsFor([entry('0.0.3', '2026-11-20'), entry('0.0.2', '2026-11-14')]).some((p) => p.includes('0.0.1')));
});

test('changelog: rejects bad dates, dates out of order, and bad categories', () => {
  assert.ok(problemsFor([entry('0.0.1', '2026-02-30')]).some((p) => p.includes('date')));
  assert.ok(problemsFor([entry('0.0.2', '2026-11-10'), entry('0.0.1', '2026-11-12')]).some((p) => p.includes('dated before')));
  assert.ok(problemsFor([entry('0.0.1', '2026-11-12', { misc: ['x'] })]).some((p) => p.includes('unknown category')));
  assert.ok(problemsFor([entry('0.0.1', '2026-11-12', { ui: [] })]).length > 0);
  assert.ok(problemsFor([entry('0.0.1', '2026-11-12', {})]).length > 0);
  assert.ok(problemsFor([{ ...entry('0.0.1', '2026-11-12'), summary: 'x'.repeat(81) }]).some((p) => p.includes('characters')));
});

test('changelog: groups follow the fixed category order and dates format without shifting', () => {
  const [e] = buildChangelog({ entries: [entry('0.0.1', '2026-11-12', { underTheHood: ['b'], newFeatures: ['a'], ui: ['c'] })] });
  assert.deepEqual(e.groups.map((g) => g.label), ['New features', 'UI', 'Under the hood']);
  assert.equal(formatDate('2026-11-12'), 'Nov 12, 2026');
  assert.equal(formatDate('2026-01-01'), 'Jan 1, 2026');
});
