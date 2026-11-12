// Daily totals of AI usage: analyses, requests, tokens, and cost.
// Never stores submitted text, URLs, or anything about visitors.
import { keys, safely } from './store.js';
import { MICROS, toMicros } from './budget.js';
import { log } from './log.js';

const KEEP_SECONDS = 400 * 24 * 60 * 60;
export const utcDay = (date = new Date()) => date.toISOString().slice(0, 10);

export class Usage {
  constructor({ store, now = () => new Date() }) {
    this.store = store;
    this.now = now;
  }

  // Usage totals are a record, not a protection: if writing them fails, the
  // analysis still succeeds (the budget counter is what enforces the limit).
  async #add(fields) {
    try {
      await this.store.hashIncr(keys.usageDay(utcDay(this.now())), fields, KEEP_SECONDS);
    } catch {
      log.warn('usage_record_failed');
    }
  }

  async recordRequest({ model, inputTokens, outputTokens, costUsd }) {
    await this.#add({
      requests: 1,
      inputTokens,
      outputTokens,
      costMicros: toMicros(costUsd),
      [`requests:${model}`]: 1,
      [`costMicros:${model}`]: toMicros(costUsd),
    });
  }

  async recordAnalysis() {
    await this.#add({ analyses: 1 });
  }

  async day(day) {
    const h = await safely(() => this.store.hashGetAll(keys.usageDay(day)));
    return { ...h, costUsd: (h.costMicros || 0) / MICROS };
  }
}
