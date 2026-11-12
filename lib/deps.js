// Builds the app's parts once per running copy. Tests replace them with
// setDepsForTesting() (simulated Claude, in-memory storage).
import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from './config.js';
import { getRules } from './rules.js';
import { pricing, priceFor } from './pricing.js';
import { createStore } from './store.js';
import { Budget } from './budget.js';
import { Usage } from './usage.js';
import { RateLimiter } from './rateLimit.js';
import { createBotCheck } from './botCheck.js';
import { createAnalyzer } from './analyzer.js';
import { log } from './log.js';

export function buildDeps({ config, store, client, now } = {}) {
  const rules = getRules();
  for (const m of config.allowedModels) priceFor(pricing, m);
  const budget = new Budget({ store, limitUsd: config.monthlyBudgetUsd, now: now ? () => new Date(now()) : undefined });
  const usage = new Usage({ store, now: now ? () => new Date(now()) : undefined });
  const rateLimiter = new RateLimiter({ store, secret: config.hashSecret, intervalSeconds: config.rateLimitSeconds, deployment: config.deployment, now });
  const botCheck = createBotCheck({ enabled: config.botCheckEnabled, secret: config.hashSecret, cost: config.altchaCost, store, deployment: config.deployment });
  const analyzer = createAnalyzer({ client, rules, pricing, usage, budget, config });
  return { config, store, rules, budget, usage, rateLimiter, botCheck, analyzer, client };
}

let deps;
export function getDeps() {
  if (!deps) {
    const config = getConfig();
    const store = createStore(config);
    if (!store) log.warn('no_storage', { hint: 'Connect Upstash Redis. Analyses are refused until then.' });
    if (!config.monthlyBudgetUsd) log.warn('no_budget', { hint: 'Set MONTHLY_BUDGET_USD. Analyses are refused until then.' });
    if (!config.anthropicApiKey) log.warn('no_api_key', { hint: 'Set ANTHROPIC_API_KEY.' });
    const client = new Anthropic({ apiKey: config.anthropicApiKey || 'missing-key' });
    deps = buildDeps({ config, store, client });
  }
  return deps;
}

export function setDepsForTesting(d) {
  deps = d;
}
