// Runs every sample in samples/ through Haiku and Sonnet and prints the flags,
// quotes, misses, over-flags, and cost of each. Uses the real API (costs money:
// roughly $0.02 for Haiku and $0.35 for Sonnet across all 8 samples).
//
// Usage:  npm run compare                 (both models)
//         npm run compare -- --haiku      (Haiku only)
//         npm run compare -- --only 06    (one sample)
//
// Setup (once): npm i -g vercel && vercel link && vercel env pull .env.local
//
// Spending here goes through the same monthly limit and usage totals as the
// live site, so nothing is spent outside the limit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../lib/config.js';
import { createStore } from '../lib/store.js';
import { buildDeps } from '../lib/deps.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const config = loadConfig({ ...process.env, VERCEL: '', NODE_ENV: 'development', BOT_CHECK_ENABLED: 'false' });
if (!config.anthropicApiKey) {
  console.error('Set ANTHROPIC_API_KEY first: run "vercel env pull .env.local" (see docs/DEPLOY.md).');
  process.exit(1);
}
const store = createStore({ ...config, useMemoryStore: false });
if (!store || !config.monthlyBudgetUsd) {
  console.error('This script spends real money, so it uses the same spending limit as the site.');
  console.error('Run "vercel env pull .env.local" so it has the database settings and MONTHLY_BUDGET_USD.');
  process.exit(1);
}
const models = args.includes('--haiku') ? ['claude-haiku-5-5']
  : args.includes('--sonnet') ? ['claude-sonnet-5-5']
    : ['claude-haiku-5-5', 'claude-sonnet-5-5'];
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const deps = buildDeps({
  config: { ...config, allowedModels: [...new Set([...config.allowedModels, ...models])] },
  store,
  client: new Anthropic({ apiKey: config.anthropicApiKey }),
});
const { analyzer, rules } = deps;

const expected = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'samples/expected.json'), 'utf8')).samples
  .filter((s) => !only || s.file.startsWith(only));

const totals = Object.fromEntries(models.map((m) => [m, { cost: 0, misses: 0, highMisses: 0, overFlags: 0, riskMatches: 0, dropped: 0 }]));

for (const s of expected) {
  const text = fs.readFileSync(path.join(ROOT_DIR, 'samples', s.file), 'utf8');
  console.log(`\n${'='.repeat(78)}\n${s.file}  (${s.kind}; expected risk ${s.expectRisk})${s.note ? `\n${s.note}` : ''}`);
  for (const model of models) {
    const t = totals[model];
    let r;
    try {
      r = await analyzer.analyze(text, { model });
    } catch (err) {
      console.log(`\n  ${model}: FAILED (${err.message})`);
      continue;
    }
    const found = new Set(r.flags.map((f) => f.ruleId));
    const misses = s.mustFlag.filter((id) => !found.has(id));
    const highMisses = misses.filter((id) => rules.byId.get(id).severity === 'High');
    const over = s.mustNotFlag.filter((id) => found.has(id));
    t.cost += r.stats.costUsd;
    t.misses += misses.length;
    t.highMisses += highMisses.length;
    t.overFlags += over.length;
    t.dropped += r.stats.droppedFlags;
    if (r.riskLevel === s.expectRisk) t.riskMatches += 1;

    console.log(`\n  ${model}: risk ${r.riskLevel}${r.riskLevel === s.expectRisk ? '' : ` (expected ${s.expectRisk})`}, ${r.flags.length} flags, $${r.stats.costUsd.toFixed(5)} (${r.stats.inputTokens} in / ${r.stats.outputTokens} out)`);
    console.log(`  Summary: ${r.summary}`);
    for (const f of r.flags) {
      console.log(`   - [${f.severity}/${f.confidence}] ${f.ruleName}\n       "${f.quote}"\n       ${f.explanation}`);
    }
    if (misses.length) console.log(`  MISSED: ${misses.join(', ')}${highMisses.length ? `  (High-severity misses: ${highMisses.join(', ')})` : ''}`);
    if (over.length) console.log(`  OVER-FLAGGED: ${over.join(', ')}`);
    if (r.stats.droppedFlags) console.log(`  Dropped ${r.stats.droppedFlags} flag(s) whose quotes didn't match the text.`);
  }
}

console.log(`\n${'='.repeat(78)}\nTotals across ${expected.length} samples`);
for (const model of models) {
  const t = totals[model];
  console.log(`  ${model}: cost $${t.cost.toFixed(4)}, risk matched ${t.riskMatches}/${expected.length}, missed ${t.misses} (High: ${t.highMisses}), over-flagged ${t.overFlags}, unverifiable quotes dropped ${t.dropped}`);
}
console.log('\nThe brief treats these as serious Haiku problems: repeatedly missing High-severity flags,');
console.log('explanations that don\'t match the quote (read them above), or over-flagging the good signs.');
