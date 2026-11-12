// Keeps daily totals of AI usage: number of analyses, tokens, and estimated cost.
// It NEVER stores submitted text, URLs, or anything about visitors.
//
// This is the app's data layer for spending. It is a small JSON file today.
// Milestone 2's policy cache will live in its own separate SQLite file and does
// not need to touch this module.
import fs from 'node:fs';
import path from 'node:path';

const MAX_DAYS_KEPT = 400;

export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function utcMonth(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export class UsageStore {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'usage.json');
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.data = this.#read();
  }

  #read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (parsed && typeof parsed.days === 'object') return parsed;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // A damaged file must not silently reset spending to zero, because
        // that would let the app spend past the monthly limit.
        throw new Error(`Usage file ${this.file} could not be read (${err.message}). Fix or move it before starting.`);
      }
    }
    return { days: {} };
  }

  #write() {
    const keys = Object.keys(this.data.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_DAYS_KEPT))) delete this.data.days[k];
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  // Records one finished AI request (or several merged into one analysis).
  record({ model, inputTokens, outputTokens, costUsd, analyses = 0, date = new Date() }) {
    const day = utcDay(date);
    const d = this.data.days[day] || (this.data.days[day] = { analyses: 0, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, byModel: {} });
    d.analyses += analyses;
    d.requests += 1;
    d.inputTokens += inputTokens;
    d.outputTokens += outputTokens;
    d.costUsd = round(d.costUsd + costUsd);
    const m = d.byModel[model] || (d.byModel[model] = { requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    m.requests += 1;
    m.inputTokens += inputTokens;
    m.outputTokens += outputTokens;
    m.costUsd = round(m.costUsd + costUsd);
    this.#write();
  }

  countAnalysis(date = new Date()) {
    const day = utcDay(date);
    const d = this.data.days[day] || (this.data.days[day] = { analyses: 0, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, byModel: {} });
    d.analyses += 1;
    this.#write();
  }

  monthSpendUsd(month = utcMonth()) {
    return round(Object.entries(this.data.days)
      .filter(([day]) => day.startsWith(month))
      .reduce((sum, [, d]) => sum + d.costUsd, 0));
  }

  days() {
    return Object.entries(this.data.days).sort(([a], [b]) => a.localeCompare(b));
  }
}

function round(n) {
  return Math.round(n * 1e6) / 1e6;
}
