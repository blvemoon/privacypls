// Checks config/changelog.json for mistakes, and that package.json's version
// matches the newest entry. Runs before every build, so a missing or wrong
// entry stops the deploy. Usage: npm run check-changelog
import { readFileSync } from 'node:fs';
import { getChangelog } from '../lib/changelog.js';

try {
  const entries = getChangelog();
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const latest = entries[0].version;
  if (pkg.version !== latest) {
    throw new Error(
      `package.json says version ${pkg.version}, but the newest change log entry is ${latest}. ` +
      'Every update needs a change log entry and the matching version in package.json.'
    );
  }
  console.log(`OK: change log has ${entries.length} entries; current version ${latest}.`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
