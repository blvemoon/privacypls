// Bot check using ALTCHA (self-hosted proof of work).
// The visitor's browser solves a small puzzle; the server checks the answer.
// No third-party service is contacted, and no cookies are set.
import { create } from 'altcha-lib/frameworks/express';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { UserError, messages } from './errors.js';

const CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_USED_IDS = 50000;

// Remembers recently used challenges so each answer can be used only once.
// Memory only; entries are dropped once the challenge would have expired anyway.
class UsedChallenges {
  constructor() { this.map = new Map(); }

  #sweep() {
    const t = Date.now();
    for (const [k, exp] of this.map) {
      if (exp > t && this.map.size < MAX_USED_IDS) break;
      this.map.delete(k);
    }
  }

  get(key) { return this.map.has(key); }

  set(key) { this.setIfAbsent(key); }

  setIfAbsent(key) {
    this.#sweep();
    if (this.map.has(key)) return false;
    this.map.set(key, Date.now() + CHALLENGE_LIFETIME_MS);
    return true;
  }
}

export function createBotCheck({ enabled, hmacSecret, cost }) {
  if (!enabled) {
    return {
      enabled: false,
      challengeHandler: (req, res) => res.status(404).json({ error: 'Bot check is turned off.' }),
      async verify() {},
    };
  }
  const keySecret = `${hmacSecret}:keys`;
  const store = new UsedChallenges();
  const altcha = create({
    deriveKey,
    hmacSignatureSecret: hmacSecret,
    hmacKeySignatureSecret: keySecret,
    store,
    createChallengeParameters: () => ({
      algorithm: 'PBKDF2/SHA-256',
      cost,
      counter: 2000 + Math.floor(Math.random() * 4000),
      expiresAt: new Date(Date.now() + CHALLENGE_LIFETIME_MS),
    }),
  });

  return {
    enabled: true,
    challengeHandler: (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      return altcha.challengeHandler(req, res, next);
    },
    async verify(payload) {
      if (!payload || typeof payload !== 'string' || payload.length > 10000) {
        throw new UserError('bot_check', messages.botCheck, { status: 400 });
      }
      const result = await altcha.verify(payload, deriveKey, hmacSecret, keySecret, store);
      if (result.error) throw new UserError('bot_check', messages.botCheck, { status: 400 });
    },
  };
}
