import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../lib/config.js';
import { getRules } from '../../lib/rules.js';
import { pricing } from '../../lib/pricing.js';
import { MemoryStore } from '../../lib/store.js';
import { buildDeps } from '../../lib/deps.js';
import { handleAnalyze } from '../../lib/analyzeRequest.js';
import { createFakeClaude } from './fakeClaude.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const rules = getRules();
export { pricing };

export function sample(name) {
  return fs.readFileSync(path.join(ROOT, 'samples', name), 'utf8');
}

export function testConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    MONTHLY_BUDGET_USD: '5',
    BOT_CHECK_ENABLED: 'false',
    ...overrides,
  });
}

// Everything the app needs, with simulated Claude and in-memory storage.
// A controllable clock lets tests move time forward.
export function makeDeps({ env = {}, fake = {}, store, clock } = {}) {
  const config = testConfig(env);
  const time = clock || { t: Date.parse('2026-11-12T12:00:00Z') };
  const now = () => time.t;
  const s = store === undefined ? new MemoryStore({ now }) : store;
  const client = createFakeClaude({ rules: rules.rules, ...fake });
  const deps = buildDeps({ config, store: s, client, now });
  return { ...deps, clock: time };
}

export function jsonRequest(body, headers = {}) {
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export async function analyze(deps, body, { ip = '203.0.113.7', fetchOptions } = {}) {
  return handleAnalyze(jsonRequest(body), { deps, ip, fetchOptions });
}
