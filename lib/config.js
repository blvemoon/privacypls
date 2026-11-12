// Reads settings from environment variables (set in Vercel: Project ->
// Settings -> Environment Variables). Secrets have no defaults.
//
// The monthly AI spending limit is REQUIRED and has no built-in amount. If it
// is missing or invalid, the app refuses every analysis (see lib/budget.js).

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

function httpsUrl(env, name) {
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
  if (/^[^\s@/]+@[^\s@]+\.[^\s@]+$/.test(v)) return { kind: 'email', value: v, href: `mailto:${v}` };
  return { kind: 'link', value: v, href: httpsUrl(env, 'FEEDBACK_CONTACT') };
}

// Returns the monthly limit in dollars, or null when it is missing/invalid.
// null means "refuse all analyses" -- never "unlimited".
function monthlyBudget(env) {
  const raw = str(env, 'MONTHLY_BUDGET_USD');
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return null;
  return n;
}

// Which deployment this is: production, preview, or development.
function deploymentEnv(env) {
  return str(env, 'VERCEL_ENV') || (str(env, 'NODE_ENV') === 'production' ? 'production' : 'development');
}

export function loadConfig(env = process.env) {
  const deployment = deploymentEnv(env);
  const onVercel = Boolean(env.VERCEL);
  const config = {
    deployment,
    onVercel,
    isProduction: deployment === 'production',
    siteName: str(env, 'SITE_NAME', 'privacypls.io'),

    // AI
    anthropicApiKey: str(env, 'ANTHROPIC_API_KEY'),
    model: str(env, 'MODEL', 'claude-haiku-5-5'),
    allowedModels: str(env, 'ALLOWED_MODELS', 'claude-haiku-5-5,claude-sonnet-5-5')
      .split(',').map((s) => s.trim()).filter(Boolean),
    maxOutputTokens: num(env, 'MAX_OUTPUT_TOKENS', 4000, { min: 500, max: 16000 }),
    aiTimeoutMs: num(env, 'AI_TIMEOUT_SECONDS', 90, { min: 10, max: 280 }) * 1000,

    // Text limits
    maxTextChars: num(env, 'MAX_TEXT_CHARS', 150000, { min: 1000, max: 1000000 }),
    minTextChars: num(env, 'MIN_TEXT_CHARS', 200, { min: 1, max: 10000 }),
    chunkChars: num(env, 'CHUNK_CHARS', 60000, { min: 5000, max: 300000 }),

    // Fetching
    fetchTimeoutMs: num(env, 'FETCH_TIMEOUT_SECONDS', 10, { min: 2, max: 60 }) * 1000,
    fetchMaxBytes: num(env, 'FETCH_MAX_BYTES', 2 * 1024 * 1024, { min: 10000, max: 20 * 1024 * 1024 }),
    fetchMaxRedirects: num(env, 'FETCH_MAX_REDIRECTS', 5, { min: 0, max: 10 }),

    // Spend protection
    monthlyBudgetUsd: monthlyBudget(env),
    rateLimitSeconds: num(env, 'RATE_LIMIT_SECONDS', 120, { min: 10, max: 86400 }),
    busyRetrySeconds: 30,
    maxConcurrentAnalyses: num(env, 'MAX_CONCURRENT_ANALYSES', 3, { min: 1, max: 50 }),
    accessPassword: str(env, 'ACCESS_PASSWORD'),

    // Secret for visitor hashes and bot-check signing.
    hashSecret: str(env, 'HASH_SECRET'),
    botCheckEnabled: bool(env, 'BOT_CHECK_ENABLED', true),
    altchaCost: num(env, 'ALTCHA_COST', 2000, { min: 100, max: 1000000 }),

    // Links
    donationUrl: httpsUrl(env, 'DONATION_URL'),
    feedback: feedbackContact(env),

    // Storage. On Vercel, Redis is required. The in-memory store exists only
    // for local development and automated tests.
    redisUrl: str(env, 'UPSTASH_REDIS_REST_URL') || str(env, 'KV_REST_API_URL'),
    redisToken: str(env, 'UPSTASH_REDIS_REST_TOKEN') || str(env, 'KV_REST_API_TOKEN'),
    useMemoryStore: !onVercel && bool(env, 'USE_MEMORY_STORE', false),

    privacyLastUpdated: str(env, 'PRIVACY_LAST_UPDATED', 'November 12, 2026'),
  };
  if (!config.allowedModels.includes(config.model)) config.allowedModels.push(config.model);

  if (config.botCheckEnabled && config.hashSecret.length < 32) {
    if (onVercel || config.isProduction) {
      throw new Error('HASH_SECRET must be set to a random value of at least 32 characters (generate one with: openssl rand -hex 32).');
    }
    // Local development convenience only.
    config.hashSecret = config.hashSecret || 'local-development-only-secret-not-for-real-use';
  }
  if (!config.hashSecret) config.hashSecret = 'local-development-only-secret-not-for-real-use';
  return config;
}

let cached;
export function getConfig() {
  if (!cached) cached = loadConfig();
  return cached;
}
