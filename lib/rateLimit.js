// One AI analysis per visitor per interval, shared across all copies of the app.
//
// The visitor is identified by a keyed hash (HMAC-SHA256) of their IP address.
// The key mixes the secret setting with the current 6-hour period, so hashes
// change every 6 hours and can't be linked back to an IP later. Each entry is
// stored in Redis with an automatic expiry equal to the waiting time.
import crypto from 'node:crypto';
import { UserError, messages, titles } from './errors.js';
import { keys, safely } from './store.js';

const PERIOD_MS = 6 * 60 * 60 * 1000;

export class RateLimiter {
  constructor({ store, secret, intervalSeconds, deployment, now = () => Date.now() }) {
    this.store = store;
    this.secret = secret;
    this.intervalSeconds = intervalSeconds;
    this.deployment = deployment;
    this.now = now;
  }

  idFor(ip) {
    const period = Math.floor(this.now() / PERIOD_MS);
    return crypto.createHmac('sha256', `${this.secret}:${period}`).update(String(ip || 'unknown')).digest('base64url').slice(0, 32);
  }

  #key(id) {
    return keys.rateLimit(this.deployment, id);
  }

  waitError(seconds) {
    return new UserError('rate_limited', messages.rateLimited(this.intervalSeconds), {
      status: 429, retry: 'wait', retryAfterSeconds: Math.max(1, seconds), title: titles.wait,
    });
  }

  // Claims the visitor's slot, or throws "please wait" with the time left.
  async claim(id) {
    const key = this.#key(id);
    const ok = await safely(() => this.store.setIfAbsent(key, 1, this.intervalSeconds));
    if (ok) return;
    const left = await safely(() => this.store.ttl(key));
    throw this.waitError(left || this.intervalSeconds);
  }

  // Gives the slot back (used when nothing was spent).
  async release(id) {
    await safely(() => this.store.del(this.#key(id)));
  }

  async secondsLeft(id) {
    return safely(() => this.store.ttl(this.#key(id)));
  }
}
