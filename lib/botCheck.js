// Bot check using ALTCHA (self-hosted proof of work). The visitor's browser
// solves a small puzzle; the server checks the answer. No third-party service
// is contacted and no cookies are set. Each answer can be used once: used
// answers are remembered in Redis until they would have expired anyway.
import { createChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { verify } from 'altcha-lib/frameworks/shared';
import { UserError, messages, titles } from './errors.js';
import { keys } from './store.js';

const CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;

function botError() {
  return new UserError('bot_check', messages.botCheck, { status: 400, retry: 'now', title: titles.input });
}

export function createBotCheck({ enabled, secret, cost, store, deployment }) {
  const signSecret = `${secret}:altcha-sign`;
  const keySecret = `${secret}:altcha-key`;

  return {
    enabled,

    async newChallenge() {
      return createChallenge({
        algorithm: 'PBKDF2/SHA-256',
        cost,
        counter: 2000 + Math.floor(Math.random() * 4000),
        expiresAt: new Date(Date.now() + CHALLENGE_LIFETIME_MS),
        deriveKey,
        hmacSignatureSecret: signSecret,
        hmacKeySignatureSecret: keySecret,
      });
    },

    async verify(payload) {
      if (!enabled) return;
      if (!payload || typeof payload !== 'string' || payload.length > 10000) throw botError();
      let storageFailed = false;
      const used = {
        setIfAbsent: async (id) => {
          try {
            return await store.setIfAbsent(keys.botAnswer(deployment, id), 1, CHALLENGE_LIFETIME_MS / 1000);
          } catch (err) {
            storageFailed = true;
            throw err;
          }
        },
      };
      const result = await verify(payload, deriveKey, signSecret, keySecret, used);
      if (storageFailed) {
        throw new UserError('service_unavailable', messages.serviceUnavailable, { status: 503, retry: 'now', title: titles.service });
      }
      if (result.error) throw botError();
    },
  };
}
