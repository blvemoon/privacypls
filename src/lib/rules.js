// Loads and checks config/rules.json. Fails loudly at startup if it's malformed,
// so a typo never silently disables a rule.
import fs from 'node:fs';

export const SEVERITIES = ['Low', 'Medium', 'High'];

export function validateRules(data) {
  const problems = [];
  if (!data || typeof data !== 'object') return { problems: ['The file must contain a JSON object.'] };
  if (!Array.isArray(data.rules) || data.rules.length === 0) problems.push('"rules" must be a non-empty list.');
  const ids = new Set();
  (data.rules || []).forEach((r, i) => {
    const where = `Rule #${i + 1}${r && r.name ? ` ("${r.name}")` : ''}`;
    if (!r || typeof r !== 'object') { problems.push(`${where} must be an object.`); return; }
    if (!r.id || !/^[a-z0-9-]{2,60}$/.test(r.id)) problems.push(`${where}: "id" must be lowercase letters, numbers and dashes.`);
    else if (ids.has(r.id)) problems.push(`${where}: id "${r.id}" is used twice.`);
    else ids.add(r.id);
    if (!r.name || typeof r.name !== 'string') problems.push(`${where}: "name" is missing.`);
    if (!r.lookFor || typeof r.lookFor !== 'string') problems.push(`${where}: "lookFor" is missing.`);
    if (!SEVERITIES.includes(r.severity)) problems.push(`${where}: "severity" must be High, Medium, or Low.`);
    if (r.escalation !== undefined) {
      if (!r.escalation || !SEVERITIES.includes(r.escalation.to) || typeof r.escalation.when !== 'string') {
        problems.push(`${where}: "escalation" needs "to" (High, Medium, or Low) and "when" (a description).`);
      }
    }
  });
  if (data.goodSigns !== undefined && (!Array.isArray(data.goodSigns) || data.goodSigns.some((g) => typeof g !== 'string'))) {
    problems.push('"goodSigns" must be a list of text descriptions.');
  }
  return { problems };
}

export function loadRules(file) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read the rules file (${file}): ${err.message}`);
  }
  const { problems } = validateRules(data);
  if (problems.length) throw new Error(`The rules file has problems:\n- ${problems.join('\n- ')}`);
  return {
    rules: data.rules.map((r) => ({ ...r })),
    goodSigns: data.goodSigns || [],
    byId: new Map(data.rules.map((r) => [r.id, r])),
  };
}

// The severities the model may assign for a rule: its default, plus the
// escalation target if the rule has one.
export function allowedSeverities(rule) {
  const set = new Set([rule.severity]);
  if (rule.escalation) set.add(rule.escalation.to);
  return [...set];
}
