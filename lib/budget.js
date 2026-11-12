// The monthly AI spending limit. See "The monthly limit" in PLAN.md.
//
// - No limit configured -> every analysis is refused (never "unlimited").
// - Before each AI call, the worst-case cost is reserved in one indivisible
//   step: "add this, but only if the total stays under the limit". Requests on
//   different copies of the app can't both slip under the line.
// - After the call, the reservation is swapped for the real cost. If the app
//   crashes in between, the reservation stays counted (over-count, never under).
// - The total is shared by every deployment (live site, previews, scripts).
import { UserError, messages, titles } from './errors.js';
import { keys, safely } from './store.js';

export const MICROS = 1_000_000;
const SPEND_TTL_SECONDS = 400 * 24 * 60 * 60;

export const toMicros = (usd) => Math.ceil(usd * MICROS);
export const utcMonth = (date = new Date()) => date.toISOString().slice(0, 7);

function limitError() {
  return new UserError('budget', messages.budget, { status: 503, retry: 'next_month', title: titles.limit });
}

export class Budget {
  constructor({ store, limitUsd, now = () => new Date() }) {
    this.store = store;
    this.limitMicros = limitUsd == null ? null : toMicros(limitUsd);
    this.now = now;
  }

  isConfigured() {
    return this.store !== null && this.limitMicros !== null && this.limitMicros > 0;
  }

  async spentMicros(month = utcMonth(this.now())) {
    return safely(() => this.store.getInt(keys.spend(month)));
  }

  // Cheap early check, before any work is done.
  async assertAvailable() {
    if (!this.isConfigured()) throw limitError();
    if ((await this.spentMicros()) >= this.limitMicros) throw limitError();
  }

  // Reserves the worst-case cost. Returns { settle(actualUsd), release() }.
  async reserve(worstCaseUsd) {
    if (!this.isConfigured()) throw limitError();
    const micros = Math.max(1, toMicros(worstCaseUsd));
    const key = keys.spend(utcMonth(this.now()));
    const { ok } = await safely(() => this.store.reserve(key, micros, this.limitMicros, SPEND_TTL_SECONDS));
    if (!ok) throw limitError();
    let done = false;
    return {
      micros,
      // Swap the reservation for the real cost.
      settle: async (actualUsd) => {
        if (done) return;
        done = true;
        await safely(() => this.store.incrBy(key, toMicros(actualUsd) - micros));
      },
      // The call failed before Anthropic charged anything: give it all back.
      release: async () => {
        if (done) return;
        done = true;
        await safely(() => this.store.incrBy(key, -micros));
      },
    };
  }
}
