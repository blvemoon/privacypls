// One AI analysis per visitor per interval.
// The visitor is identified by a keyed hash (HMAC-SHA256) of their IP address.
// The key is random, lives only in memory, and is replaced every few hours, so
// the hashes can't be linked to an IP later. Nothing is written to disk, and
// each entry is forgotten as soon as its interval is over.
import crypto from 'node:crypto';

const KEY_LIFETIME_MS = 6 * 60 * 60 * 1000;

export class RateLimiter {
  constructor({ intervalSeconds, now = () => Date.now() }) {
    this.intervalMs = intervalSeconds * 1000;
    this.now = now;
    this.entries = new Map();
    this.#rotateKey();
  }

  #rotateKey() {
    this.key = crypto.randomBytes(32);
    this.keyCreated = this.now();
    // Old hashes can't be matched to the new key, so drop them.
    this.entries.clear();
  }

  idFor(ip) {
    if (this.now() - this.keyCreated > KEY_LIFETIME_MS) this.#rotateKey();
    return crypto.createHmac('sha256', this.key).update(String(ip || 'unknown')).digest('base64url');
  }

  #sweep() {
    const t = this.now();
    for (const [id, until] of this.entries) if (until <= t) this.entries.delete(id);
  }

  // Seconds the visitor must wait, or 0 if they may go ahead.
  waitSeconds(id) {
    if (this.intervalMs <= 0) return 0;
    const until = this.entries.get(id);
    const t = this.now();
    if (!until || until <= t) return 0;
    return Math.ceil((until - t) / 1000);
  }

  // Called when an AI analysis actually starts.
  mark(id) {
    if (this.intervalMs <= 0) return;
    this.#sweep();
    this.entries.set(id, this.now() + this.intervalMs);
  }

  // Called if the analysis fails for a reason that isn't the visitor's doing
  // (for example, the AI service is down), so they can retry straight away.
  unmark(id) {
    this.entries.delete(id);
  }

  size() {
    this.#sweep();
    return this.entries.size;
  }
}
