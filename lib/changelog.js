// Loads and checks the public change log (config/changelog.json), which the
// /changelog page is built from. The build fails if the file has a mistake
// (see scripts/check-changelog.mjs), so a bad entry never reaches the site.
//
// Versions follow semantic versioning: fixes add 1 to the last number
// (0.0.2 -> 0.0.3), bigger features or milestones add 1 to the middle number
// and reset the last (0.0.3 -> 0.1.0). The public release is 1.0.0.
import changelogFile from '../config/changelog.json' with { type: 'json' };

// Display order on the page. Keys are what the data file uses.
export const CATEGORIES = [
  { key: 'newFeatures', label: 'New features' },
  { key: 'ui', label: 'UI' },
  { key: 'qualityOfLife', label: 'Quality of life' },
  { key: 'riskScore', label: 'Risk score changes' },
  { key: 'bugFixes', label: 'Bug fixes' },
  { key: 'underTheHood', label: 'Under the hood' },
];
const CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key));

const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_SUMMARY_CHARS = 80;

export function parseVersion(v) {
  const m = typeof v === 'string' ? VERSION_RE.exec(v) : null;
  return m ? m.slice(1).map(Number) : null;
}

// True when `next` is exactly one step after `prev`.
export function isNextVersion(prev, next) {
  const [a, b, c] = prev;
  const [x, y, z] = next;
  if (x === a && y === b && z === c + 1) return true;          // fix
  if (x === a && y === b + 1 && z === 0) return true;          // feature or milestone
  if (x === a + 1 && y === 0 && z === 0) return true;          // major release (1.0.0)
  return false;
}

function isRealDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateChangelog(data) {
  const problems = [];
  if (!data || typeof data !== 'object' || !Array.isArray(data.entries) || data.entries.length === 0) {
    return { problems: ['The file must contain an "entries" list with at least one entry.'] };
  }
  const entries = data.entries;
  entries.forEach((e, i) => {
    const where = `Entry #${i + 1}${e && e.version ? ` (version ${e.version})` : ''}`;
    if (!e || typeof e !== 'object') { problems.push(`${where} must be an object.`); return; }
    if (!parseVersion(e.version)) problems.push(`${where}: "version" must look like 0.0.2.`);
    if (!isRealDate(e.date)) problems.push(`${where}: "date" must be a real date written as YYYY-MM-DD.`);
    if (typeof e.summary !== 'string' || !e.summary.trim()) problems.push(`${where}: "summary" is missing.`);
    else if (e.summary.length > MAX_SUMMARY_CHARS) problems.push(`${where}: "summary" must be ${MAX_SUMMARY_CHARS} characters or fewer.`);
    if (!e.changes || typeof e.changes !== 'object' || Array.isArray(e.changes)) {
      problems.push(`${where}: "changes" must group bullets by category.`);
      return;
    }
    const keys = Object.keys(e.changes);
    if (keys.length === 0) problems.push(`${where}: list at least one change.`);
    for (const k of keys) {
      if (!CATEGORY_KEYS.has(k)) {
        problems.push(`${where}: unknown category "${k}". Use one of: ${[...CATEGORY_KEYS].join(', ')}.`);
        continue;
      }
      const bullets = e.changes[k];
      if (!Array.isArray(bullets) || bullets.length === 0 || bullets.some((b) => typeof b !== 'string' || !b.trim())) {
        problems.push(`${where}: "${k}" must be a non-empty list of bullet points.`);
      }
    }
  });

  // Newest first: each entry must be exactly one version step after the one below it.
  for (let i = 0; i < entries.length - 1; i++) {
    const newer = entries[i];
    const older = entries[i + 1];
    const nv = parseVersion(newer?.version);
    const ov = parseVersion(older?.version);
    if (nv && ov && !isNextVersion(ov, nv)) {
      problems.push(`Version ${newer.version} doesn't follow ${older.version}. Entries go newest first, one step at a time (for example 0.0.2 -> 0.0.3, or 0.0.3 -> 0.1.0).`);
    }
    if (isRealDate(newer?.date) && isRealDate(older?.date) && newer.date < older.date) {
      problems.push(`Version ${newer.version} is dated before version ${older.version}.`);
    }
  }
  const oldest = entries[entries.length - 1];
  if (oldest && oldest.version !== '0.0.1') problems.push('The oldest entry must be version 0.0.1.');
  return { problems };
}

// Formats 2026-11-14 as "Nov 14, 2026" (no time zone shifts).
export function formatDate(s) {
  return new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

export function buildChangelog(data) {
  const { problems } = validateChangelog(data);
  if (problems.length) throw new Error(`The change log has problems:\n- ${problems.join('\n- ')}`);
  return data.entries.map((e) => ({
    version: e.version,
    date: e.date,
    dateLabel: formatDate(e.date),
    summary: e.summary,
    groups: CATEGORIES.filter((c) => e.changes[c.key]).map((c) => ({ key: c.key, label: c.label, items: [...e.changes[c.key]] })),
  }));
}

let cached;
export function getChangelog() {
  if (!cached) cached = buildChangelog(changelogFile);
  return cached;
}
