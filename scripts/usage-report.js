// Prints AI usage and estimated cost: each day this month, and each month.
// Usage: npm run usage
import { loadConfig } from '../src/config.js';
import { UsageStore, utcMonth } from '../src/lib/usageStore.js';

const config = loadConfig({ ...process.env, NODE_ENV: 'development' });
const store = new UsageStore(config.dataDir);
const days = store.days();
const month = utcMonth();
const money = (n) => `$${n.toFixed(4)}`;

console.log(`AI usage (UTC dates). Monthly limit in the app: $${config.monthlyBudgetUsd}\n`);
console.log(`This month (${month}):`);
console.log('  Day         Analyses  Requests  Input tok   Output tok  Cost');
for (const [day, d] of days.filter(([k]) => k.startsWith(month))) {
  console.log(`  ${day}  ${String(d.analyses).padStart(8)}  ${String(d.requests).padStart(8)}  ${String(d.inputTokens).padStart(9)}  ${String(d.outputTokens).padStart(10)}  ${money(d.costUsd)}`);
}
const spent = store.monthSpendUsd(month);
const pct = config.monthlyBudgetUsd > 0 ? Math.round((spent / config.monthlyBudgetUsd) * 100) : 0;
console.log(`  Total so far: ${money(spent)} (${pct}% of the app limit)`);
if (spent >= 16) console.log('  NOTE: Spend has reached $16 (80% of the $20 budget). Check for abuse or unexpected traffic.');

const months = new Map();
for (const [day, d] of days) {
  const m = day.slice(0, 7);
  const t = months.get(m) || { analyses: 0, costUsd: 0 };
  t.analyses += d.analyses;
  t.costUsd += d.costUsd;
  months.set(m, t);
}
console.log('\nBy month:');
for (const [m, t] of months) console.log(`  ${m}  ${String(t.analyses).padStart(6)} analyses  ${money(t.costUsd)}`);
if (!days.length) console.log('  No usage recorded yet.');
