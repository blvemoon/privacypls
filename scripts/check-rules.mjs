// Checks config/rules.json for mistakes. Usage: npm run check-rules
import { getRules } from '../lib/rules.js';

try {
  const { rules, goodSigns } = getRules();
  console.log(`OK: ${rules.length} rules and ${goodSigns.length} good signs.`);
  for (const r of rules) console.log(`  [${r.severity}${r.escalation ? ` -> ${r.escalation.to}` : ''}] ${r.name}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
