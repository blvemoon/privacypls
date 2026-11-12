// Reads settings from environment variables. Every setting has a safe default
// except the secrets, which must be provided in production.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function str(env, name, fallback = '') {
  const v = env[name];
  return v === undefined ? fallback : String(v).trim();
}

function num(env, name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`Setting ${name} must be a number between ${min} and ${max} (got "${raw}").`);
  }
  return n;
}

function bool(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  throw new Error(`Setting ${name} must be true or false (got "${raw}").`);
}

function optionalUrl(env, name) {
  const v = str(env, name);
  if (!v) return '';
  let u;
  try {
    u = new URL(v);
  } catch {
    throw new Error(`Setting ${name} must be a full https:// link (got "${v}").`);
  }
  if (u.protocol !== 'https:') throw new Error(`Setting ${name} must start with https://`);
  return u.toString();
}

function feedbackContact(env) {
  const v = str(env, 'FEEDBACK_CONTACT');
  if (!v) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { kind: 'email', value: v, href: `mailto:${v}` };
  return { kind: 'link', value: v, href: optionalUrl(env, 'FEEDBACK_CONTACT') };
}

export function loadConfig(env = process.env) {
  const nodeEnv = str(env, 'NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';

  const config = {
    nodeEnv,
    isProduction,
    host: str(env, 'HOST', '127.0.0.1'),
    port: num(env, 'PORT', 3000, { min: 1, max: 65535 }),
    siteName: str(env, 'SITE_NAME', 'privacypls.io'),
    siteUrl: str(env, 'SITE_URL', 'https://privacypls.io'),

    // AI
    anthropicApiKey: str(env, 'ANTHROPIC_API_KEY'),
    model: str(env, 'MODEL', 'claude-haiku-5-5'),
    // Models the server will accept for a single request. Only MODEL is used by
    // the public site today; the list exists so a paid "deeper analysis" option
    // can be added later without changing the analyzer.
    allowedModels: str(env, 'ALLOWED_MODELS', 'claude-haiku-5-5,claude-sonnet-5-5')
      .split(',').map((s) => s.trim()).filter(Boolean),
    maxOutputTokens: num(env, 'MAX_OUTPUT_TOKENS', 4000, { min: 500, max: 16000 }),
    aiTimeoutMs: num(env, 'AI_TIMEOUT_SECONDS', 90, { min: 10, max: 600 }) * 1000,

    // Text limits
    maxTextChars: num(env, 'MAX_TEXT_CHARS', 150000, { min: 1000, max: 1000000 }),
    minTextChars: num(env, 'MIN_TEXT_CHARS', 200, { min: 1, max: 10000 }),
    chunkChars: num(env, 'CHUNK_CHARS', 60000, { min: 5000, max: 300000 }),

    // Fetching
    fetchTimeoutMs: num(env, 'FETCH_TIMEOUT_SECONDS', 10, { min: 2, max: 60 }) * 1000,
    fetchMaxBytes: num(env, 'FETCH_MAX_BYTES', 2 * 1024 * 1024, { min: 10000, max: 20 * 1024 * 1024 }),
    fetchMaxRedirects: num(env, 'FETCH_MAX_REDIRECTS', 5, { min: 0, max: 10 }),

    // Spend protection
    rateLimitSeconds: num(env, 'RATE_LIMIT_SECONDS', 120, { min: 0, max: 86400 }),
    monthlyBudgetUsd: num(env, 'MONTHLY_BUDGET_USD', 18, { min: 0, max: 100000 }),
    maxConcurrentAnalyses: num(env, 'MAX_CONCURRENT_ANALYSES', 3, { min: 1, max: 50 }),
    accessPassword: str(env, 'ACCESS_PASSWORD'),

    // Bot check (ALTCHA)
    botCheckEnabled: bool(env, 'BOT_CHECK_ENABLED', true),
    altchaHmacSecret: str(env, 'ALTCHA_HMAC_SECRET'),
    altchaCost: num(env, 'ALTCHA_COST', 2000, { min: 100, max: 1000000 }),

    // Links
    donationUrl: optionalUrl(env, 'DONATION_URL'),
    feedback: feedbackContact(env),

    // Storage
    dataDir: path.resolve(ROOT_DIR, str(env, 'DATA_DIR', 'data')),
    rulesFile: path.resolve(ROOT_DIR, str(env, 'RULES_FILE', 'config/rules.json')),
    pricingFile: path.resolve(ROOT_DIR, str(env, 'PRICING_FILE', 'config/pricing.json')),

    // Date shown on the privacy page. Update it whenever the policy changes.
    privacyLastUpdated: str(env, 'PRIVACY_LAST_UPDATED', 'November 12, 2026'),
  };

  if (!config.allowedModels.includes(config.model)) config.allowedModels.push(config.model);

  const problems = [];
  if (isProduction) {
    if (!config.anthropicApiKey) problems.push('ANTHROPIC_API_KEY is not set.');
    if (config.botCheckEnabled && config.altchaHmacSecret.length < 32) {
      problems.push('ALTCHA_HMAC_SECRET must be set to a random value of at least 32 characters.');
    }
  }
  if (config.botCheckEnabled && !config.altchaHmacSecret && !isProduction) {
    // Development convenience only. Production refuses to start without it (above).
    config.altchaHmacSecret = 'development-only-secret-do-not-use-in-production';
  }
  if (problems.length) {
    throw new Error(`Configuration problems:\n- ${problems.join('\n- ')}`);
  }
  return config;
}
