// Shows AI usage and estimated cost per day this month, and this month's total
// against your limit. Reads the live database.
//
// Setup (once): npm i -g vercel && vercel link && vercel env pull .env.local
// Then:         npm run usage
import { loadConfig } from '../lib/config.js';
import { createStore } from '../lib/store.js';
import { Budget, MICROS, utcMonth } from '../lib/budget.js';
import { Usage } from '../lib/usage.js';

const config = loadConfig({ ...process.env, VERCEL: '', NODE_ENV: 'development', BOT_CHECK_ENABLED: 'false' });
const store = createStore({ ...config, useMemoryStore: false });
if (!store) {
  console.error('No database settings found. Run "vercel env pull .env.local" first (see docs/DEPLOY.md).');
  process.exit(1);
}
const budget = new Budget({ store, limitUsd: config.monthlyBudgetUsd });
const usage = new Usage({ store });
const month = utcMonth();
const money = (n) => `$${n.toFixed(4)}`;

console.log(`AI usage for ${month} (UTC dates)\n`);
console.log('  Day         Analyses  Requests  Input tok   Output tok  Cost');
const today = new Date();
for (let d = 1; d <= today.getUTCDate(); d += 1) {
  const day = `${month}-${String(d).padStart(2, '0')}`;
  const t = await usage.day(day);
  if (!t.requests && !t.analyses) continue;
  console.log(`  ${day}  ${String(t.analyses || 0).padStart(8)}  ${String(t.requests || 0).padStart(8)}  ${String(t.inputTokens || 0).padStart(9)}  ${String(t.outputTokens || 0).padStart(10)}  ${money(t.costUsd)}`);
}
const spent = (await budget.spentMicros(month)) / MICROS;
console.log(`\n  Spending counted against the limit this month: ${money(spent)}`);
if (config.monthlyBudgetUsd) {
  const pct = Math.round((spent / config.monthlyBudgetUsd) * 100);
  console.log(`  Limit (MONTHLY_BUDGET_USD): $${config.monthlyBudgetUsd} -> ${pct}% used`);
  if (pct >= 80) console.log('  NOTE: 80% or more of the limit is used. Check for abuse or unexpected traffic.');
} else {
  console.log('  MONTHLY_BUDGET_USD is not set in .env.local, so the live site refuses analyses until it is set in Vercel.');
}
