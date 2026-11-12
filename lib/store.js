// Shared storage. On Vercel this is Upstash Redis. Every operation the app
// needs is defined here, so the rest of the code never talks to Redis directly.
//
// Two versions with the same methods:
//   RedisStore  - Upstash Redis (used on Vercel)
//   MemoryStore - in-memory, for automated tests and local development only.
//                 It is refused on Vercel (see lib/config.js), because separate
//                 copies of the app would not share it.
//
// Money is stored in whole micro-dollars (1 USD = 1,000,000) so totals never
// suffer from rounding errors.
import { Redis } from '@upstash/redis';
import { UserError, messages, titles } from './errors.js';
import { log } from './log.js';

// Atomically adds `amount` to the total, but only if the result stays at or
// under `limit`. Returns [1, newTotal] on success or [0, currentTotal] if refused.
const RESERVE_SCRIPT = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local amt = tonumber(ARGV[1])
local lim = tonumber(ARGV[2])
if cur + amt > lim then return {0, cur} end
local total = redis.call('INCRBY', KEYS[1], amt)
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return {1, total}
`;

// Takes a slot if fewer than `max` are in use. The counter expires on its own
// as a safety net, in case a function stops before releasing its slot.
const ACQUIRE_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
if n > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return 0
end
return 1
`;

const RELEASE_SCRIPT = `
local n = tonumber(redis.call('GET', KEYS[1]) or '0')
if n > 0 then redis.call('DECR', KEYS[1]) end
return 1
`;

export class RedisStore {
  constructor({ url, token }) {
    this.redis = new Redis({ url, token, automaticDeserialization: false, retry: { retries: 2 } });
  }

  // Sets key only if it doesn't exist. Returns true if it was set.
  async setIfAbsent(key, value, ttlSeconds) {
    const r = await this.redis.set(key, String(value), { nx: true, ex: Math.max(1, Math.ceil(ttlSeconds)) });
    return r === 'OK';
  }

  async get(key) {
    return this.redis.get(key);
  }

  async del(key) {
    await this.redis.del(key);
  }

  // Seconds until the key expires (0 if missing or no expiry).
  async ttl(key) {
    const t = await this.redis.ttl(key);
    return t > 0 ? t : 0;
  }

  async getInt(key) {
    const v = await this.redis.get(key);
    return v === null || v === undefined ? 0 : Number(v);
  }

  async reserve(key, amount, limit, ttlSeconds) {
    const [ok, total] = await this.redis.eval(RESERVE_SCRIPT, [key], [String(amount), String(limit), String(ttlSeconds)]);
    return { ok: Number(ok) === 1, total: Number(total) };
  }

  async incrBy(key, amount, ttlSeconds) {
    const p = this.redis.pipeline();
    p.incrby(key, amount);
    if (ttlSeconds) p.expire(key, ttlSeconds);
    const [total] = await p.exec();
    return Number(total);
  }

  async hashIncr(key, fields, ttlSeconds) {
    const p = this.redis.pipeline();
    for (const [field, n] of Object.entries(fields)) if (n) p.hincrby(key, field, n);
    if (ttlSeconds) p.expire(key, ttlSeconds);
    await p.exec();
  }

  async hashGetAll(key) {
    const h = await this.redis.hgetall(key);
    if (!h) return {};
    return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Number(v)]));
  }

  async acquireSlot(key, max, ttlSeconds) {
    return Number(await this.redis.eval(ACQUIRE_SCRIPT, [key], [String(max), String(ttlSeconds)])) === 1;
  }

  async releaseSlot(key) {
    await this.redis.eval(RELEASE_SCRIPT, [key], []);
  }

  async ping() {
    return (await this.redis.ping()) === 'PONG';
  }
}

export class MemoryStore {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.data = new Map();
    this.failing = false; // tests can set this to simulate an outage
  }

  #check() {
    if (this.failing) throw new Error('simulated storage outage');
  }

  #live(key) {
    const e = this.data.get(key);
    if (!e) return undefined;
    if (e.exp && e.exp <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return e;
  }

  #put(key, value, ttlSeconds, keepExpiry = false) {
    const old = this.#live(key);
    const exp = ttlSeconds ? this.now() + ttlSeconds * 1000 : (keepExpiry && old ? old.exp : undefined);
    this.data.set(key, { value, exp });
  }

  async setIfAbsent(key, value, ttlSeconds) {
    this.#check();
    if (this.#live(key)) return false;
    this.#put(key, String(value), ttlSeconds);
    return true;
  }

  async get(key) {
    this.#check();
    const e = this.#live(key);
    return e ? e.value : null;
  }

  async del(key) {
    this.#check();
    this.data.delete(key);
  }

  async ttl(key) {
    this.#check();
    const e = this.#live(key);
    return e && e.exp ? Math.ceil((e.exp - this.now()) / 1000) : 0;
  }

  async getInt(key) {
    const v = await this.get(key);
    return v === null ? 0 : Number(v);
  }

  async reserve(key, amount, limit, ttlSeconds) {
    this.#check();
    const cur = Number(this.#live(key)?.value || 0);
    if (cur + amount > limit) return { ok: false, total: cur };
    this.#put(key, String(cur + amount), ttlSeconds);
    return { ok: true, total: cur + amount };
  }

  async incrBy(key, amount, ttlSeconds) {
    this.#check();
    const total = Number(this.#live(key)?.value || 0) + amount;
    this.#put(key, String(total), ttlSeconds, true);
    return total;
  }

  async hashIncr(key, fields, ttlSeconds) {
    this.#check();
    const h = { ...(this.#live(key)?.value || {}) };
    for (const [f, n] of Object.entries(fields)) h[f] = (h[f] || 0) + n;
    this.#put(key, h, ttlSeconds, true);
  }

  async hashGetAll(key) {
    this.#check();
    return { ...(this.#live(key)?.value || {}) };
  }

  async acquireSlot(key, max, ttlSeconds) {
    this.#check();
    const n = Number(this.#live(key)?.value || 0);
    if (n + 1 > max) return false;
    this.#put(key, String(n + 1), ttlSeconds);
    return true;
  }

  async releaseSlot(key) {
    this.#check();
    const n = Number(this.#live(key)?.value || 0);
    if (n > 0) this.#put(key, String(n - 1), 0, true);
  }

  async ping() {
    this.#check();
    return true;
  }

  // For the usage report in tests: all keys starting with a prefix.
  keys(prefix) {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix) && this.#live(k));
  }
}

export function createStore(config) {
  if (config.redisUrl && config.redisToken) return new RedisStore({ url: config.redisUrl, token: config.redisToken });
  if (config.useMemoryStore) return new MemoryStore();
  return null; // No storage configured: analyses are refused (fail closed).
}

// Key names. The monthly spending total is shared by every deployment
// (production, previews, local runs, scripts), so nothing can spend outside the
// one limit. Other keys are kept separate per deployment.
export const keys = {
  spend: (month) => `pp:spend:${month}`,
  usageDay: (day) => `pp:usage:${day}`,
  rateLimit: (env, id) => `pp:${env}:rl:${id}`,
  slots: (env) => `pp:${env}:slots`,
  botAnswer: (env, id) => `pp:${env}:altcha:${id}`,
};

// Runs a storage operation. If storage fails, the visitor gets a friendly
// "temporarily unavailable" message and nothing is spent (fail closed).
export async function safely(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof UserError) throw err;
    log.error('storage_failed', { kind: err && err.name ? err.name : 'Error' });
    throw new UserError('service_unavailable', messages.serviceUnavailable, { status: 503, retry: 'now', title: titles.service });
  }
}
