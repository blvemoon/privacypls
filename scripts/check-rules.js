// Checks config/rules.json for mistakes without starting the app.
// Usage: npm run check-rules
import { loadRules } from '../src/lib/rules.js';
import { loadConfig } from '../src/config.js';

try {
  const config = loadConfig({ ...process.env, NODE_ENV: 'development' });
  const { rules, goodSigns } = loadRules(config.rulesFile);
  console.log(`OK: ${rules.length} rules and ${goodSigns.length} good signs.`);
  for (const r of rules) {
    console.log(`  [${r.severity}${r.escalation ? ` -> ${r.escalation.to}` : ''}] ${r.name}`);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
