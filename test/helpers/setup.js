import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, ROOT_DIR } from '../../src/config.js';
import { loadRules } from '../../src/lib/rules.js';
import { loadPricing } from '../../src/lib/pricing.js';
import { UsageStore } from '../../src/lib/usageStore.js';
import { Budget } from '../../src/lib/budget.js';
import { RateLimiter } from '../../src/lib/rateLimit.js';
import { createBotCheck } from '../../src/lib/botCheck.js';
import { createAnalyzer } from '../../src/lib/analyzer.js';
import { createApp } from '../../src/app.js';
import { createFakeClaude } from './fakeClaude.js';

export const rules = loadRules(path.join(ROOT_DIR, 'config/rules.json'));
export const pricing = loadPricing(path.join(ROOT_DIR, 'config/pricing.json'));

export function sample(name) {
  return fs.readFileSync(path.join(ROOT_DIR, 'samples', name), 'utf8');
}

export function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'privacypls-test-'));
}

export function testConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: tempDir(),
    BOT_CHECK_ENABLED: 'false',
    ...overrides,
  });
}

export function buildDeps({ env = {}, fake = {}, fetchOptions } = {}) {
  const config = testConfig(env);
  const usage = new UsageStore(config.dataDir);
  const budget = new Budget({ store: usage, limitUsd: config.monthlyBudgetUsd });
  const rateLimiter = new RateLimiter({ intervalSeconds: config.rateLimitSeconds });
  const botCheck = createBotCheck({ enabled: config.botCheckEnabled, hmacSecret: config.altchaHmacSecret, cost: config.altchaCost });
  const client = createFakeClaude({ rules: rules.rules, ...fake });
  const analyzer = createAnalyzer({ client, rules, pricing, usage, budget, config });
  const app = createApp({ config, analyzer, budget, usage, rateLimiter, botCheck, fetchOptions });
  return { config, usage, budget, rateLimiter, botCheck, client, analyzer, app };
}

// Starts the app on a random local port. Returns { url, close }.
export async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

export async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, headers: res.headers, body: await res.json() };
}
