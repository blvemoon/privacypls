// Starts the app. Run with: npm start (reads settings from .env)
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { loadRules } from './lib/rules.js';
import { loadPricing, priceFor } from './lib/pricing.js';
import { UsageStore } from './lib/usageStore.js';
import { Budget } from './lib/budget.js';
import { RateLimiter } from './lib/rateLimit.js';
import { createBotCheck } from './lib/botCheck.js';
import { createAnalyzer } from './lib/analyzer.js';
import { log } from './lib/log.js';

function start() {
  const config = loadConfig();
  const rules = loadRules(config.rulesFile);
  const pricing = loadPricing(config.pricingFile);
  for (const m of config.allowedModels) priceFor(pricing, m);

  const usage = new UsageStore(config.dataDir);
  const budget = new Budget({ store: usage, limitUsd: config.monthlyBudgetUsd });
  const rateLimiter = new RateLimiter({ intervalSeconds: config.rateLimitSeconds });
  const botCheck = createBotCheck({ enabled: config.botCheckEnabled, hmacSecret: config.altchaHmacSecret, cost: config.altchaCost });
  const client = new Anthropic({ apiKey: config.anthropicApiKey || 'missing-key' });
  const analyzer = createAnalyzer({ client, rules, pricing, usage, budget, config });

  if (!config.anthropicApiKey) log.warn('no_api_key', { hint: 'Set ANTHROPIC_API_KEY. Analyses will fail until then.' });
  if (!config.botCheckEnabled) log.warn('bot_check_off', { hint: 'BOT_CHECK_ENABLED=false. Turn it on before sharing the site.' });

  const app = createApp({ config, analyzer, budget, usage, rateLimiter, botCheck });
  const server = app.listen(config.port, config.host, () => {
    log.info('started', {
      port: config.port,
      model: config.model,
      rules: rules.rules.length,
      monthlyBudgetUsd: config.monthlyBudgetUsd,
      spentThisMonthUsd: usage.monthSpendUsd(),
      passwordGate: Boolean(config.accessPassword),
    });
  });
  // Give slow AI responses room, but don't hold connections forever.
  server.requestTimeout = config.aiTimeoutMs * 3 + config.fetchTimeoutMs + 10000;

  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

try {
  start();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
