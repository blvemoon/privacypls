import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForMatch, quoteAppearsIn } from '../lib/quotes.js';
import { chunkText } from '../lib/chunk.js';
import { validateRules, allowedSeverities } from '../lib/rules.js';
import { costUsd, worstCaseUsd } from '../lib/pricing.js';
import { extractFromHtml, cleanText } from '../lib/extract.js';
import { loadConfig } from '../lib/config.js';
import { MemoryStore } from '../lib/store.js';
import { Budget, MICROS } from '../lib/budget.js';
import { RateLimiter } from '../lib/rateLimit.js';
import { rules, pricing } from './helpers/setup.js';

test('quotes: exact match ignoring case, spacing, and curly quotes', () => {
  const src = normalizeForMatch('We may sell your “personal\n  information” to third‑party advertisers.');
  assert.ok(quoteAppearsIn('we may sell your "personal information" to third-party advertisers.', src));
  assert.ok(quoteAppearsIn('"We may sell your “personal information”"', src));
});

test('quotes: rejects invented or reworded text', () => {
  const src = normalizeForMatch('We may share your data with service providers.');
  assert.equal(quoteAppearsIn('We may sell your data to advertisers.', src), false);
  assert.equal(quoteAppearsIn('We may share your data with partners.', src), false);
  assert.equal(quoteAppearsIn('share', src), false);
});

test('chunk: long text splits under the limit and keeps every section', () => {
  const para = 'This is a sentence about data. '.repeat(40);
  const text = Array.from({ length: 10 }, (_, i) => `Section ${i}. ${para}`).join('\n\n');
  const parts = chunkText(text, 3000, 200);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 3000);
  for (let i = 0; i < 10; i += 1) assert.ok(parts.some((p) => p.includes(`Section ${i}.`)));
});

test('rules: shipped file is valid; validation catches mistakes', () => {
  assert.equal(rules.rules.length, 15);
  assert.deepEqual(allowedSeverities(rules.byId.get('tracking-profiling')).sort(), ['High', 'Medium']);
  const { problems } = validateRules({ rules: [
    { id: 'ok-rule', name: 'Ok', lookFor: 'x', severity: 'High' },
    { id: 'ok-rule', name: 'Dup', lookFor: 'x', severity: 'High' },
    { id: 'Bad Id', name: 'Bad', lookFor: 'x', severity: 'Severe' },
  ] });
  assert.ok(problems.some((p) => p.includes('used twice')));
  assert.ok(problems.some((p) => p.includes('lowercase')));
  assert.ok(problems.some((p) => p.includes('severity')));
});

test('pricing: cost, the long-prompt rate, and the worst case is never below the real cost', () => {
  assert.equal(costUsd(pricing, 'claude-haiku-5-5', 8000, 1500).toFixed(6), '0.001550');
  assert.ok(costUsd(pricing, 'claude-haiku-5-5', 120000, 1000) > costUsd(pricing, 'claude-haiku-5-5', 99000, 1000) * 4);
  for (const counted of [100, 5000, 60000, 95000]) {
    const worst = worstCaseUsd(pricing, 'claude-haiku-5-5', counted, 4000);
    // Even if billing came in 10% above the count and used every output token:
    assert.ok(worst >= costUsd(pricing, 'claude-haiku-5-5', Math.round(counted * 1.1), 4000) - 1e-12);
  }
});

test('extract: keeps paragraph text, drops scripts, menus and footers', () => {
  const html = `<html><head><title> Example Privacy </title><script>var secret = 1;</script></head>
    <body><nav>Home | Shop</nav><main><h1>Privacy Policy</h1><p>We collect   your email.</p>
    <ul><li>Item one</li><li>Item two</li></ul></main><footer>© Example</footer></body></html>`;
  const { title, text } = extractFromHtml(html);
  assert.equal(title, 'Example Privacy');
  assert.ok(text.includes('We collect your email.'));
  assert.ok(!text.includes('secret') && !text.includes('Home | Shop') && !text.includes('©'));
  assert.equal(cleanText('  a \n\n\n\n b  '), 'a\n\nb');
});

test('config: the monthly limit has no default, and bad values mean "refuse", never "unlimited"', () => {
  assert.equal(loadConfig({}).monthlyBudgetUsd, null);
  for (const bad of ['', '0', '-5', 'eighteen', 'NaN', 'Infinity']) {
    assert.equal(loadConfig({ MONTHLY_BUDGET_USD: bad }).monthlyBudgetUsd, null, bad);
  }
  assert.equal(loadConfig({ MONTHLY_BUDGET_USD: '12.5' }).monthlyBudgetUsd, 12.5);
});

test('config: on Vercel, a missing secret stops the app and the memory store is never used', () => {
  assert.throws(() => loadConfig({ VERCEL: '1', VERCEL_ENV: 'production' }), /HASH_SECRET/);
  const c = loadConfig({ VERCEL: '1', VERCEL_ENV: 'preview', HASH_SECRET: 'x'.repeat(40), USE_MEMORY_STORE: 'true' });
  assert.equal(c.useMemoryStore, false);
  assert.equal(c.deployment, 'preview');
  assert.equal(loadConfig({ FEEDBACK_CONTACT: 'me@example.com' }).feedback.href, 'mailto:me@example.com');
  assert.throws(() => loadConfig({ DONATION_URL: 'http://insecure.example' }), /https/);
});

test('budget: not configured or no storage means refuse', async () => {
  await assert.rejects(new Budget({ store: new MemoryStore(), limitUsd: null }).assertAvailable(), (e) => e.code === 'budget' && e.retry === 'next_month');
  await assert.rejects(new Budget({ store: null, limitUsd: 5 }).reserve(0.01), (e) => e.code === 'budget');
});

test('budget: reservations can never push the total past the limit, even all at once', async () => {
  const store = new MemoryStore();
  const budget = new Budget({ store, limitUsd: 1 });
  // 50 simultaneous reservations of $0.03 against a $1 limit: at most 33 fit.
  const results = await Promise.allSettled(Array.from({ length: 50 }, () => budget.reserve(0.03)));
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  assert.equal(ok, 33);
  assert.ok((await budget.spentMicros()) <= 1 * MICROS);
});

test('budget: settle swaps in the real cost; release gives it back; crashes over-count', async () => {
  const store = new MemoryStore();
  const budget = new Budget({ store, limitUsd: 1 });
  const a = await budget.reserve(0.5);
  await a.settle(0.1);
  assert.equal(await budget.spentMicros(), 0.1 * MICROS);
  const b = await budget.reserve(0.5);
  await b.release();
  assert.equal(await budget.spentMicros(), 0.1 * MICROS);
  await budget.reserve(0.3); // never settled (simulated crash): stays counted
  assert.equal(await budget.spentMicros(), 0.4 * MICROS);
});

test('budget: a storage outage refuses instead of skipping the check', async () => {
  const store = new MemoryStore();
  store.failing = true;
  const budget = new Budget({ store, limitUsd: 1 });
  await assert.rejects(budget.reserve(0.01), (e) => e.code === 'service_unavailable');
  await assert.rejects(budget.assertAvailable(), (e) => e.code === 'service_unavailable');
});

test('budget: the total is per UTC month', async () => {
  const store = new MemoryStore();
  let date = new Date('2026-11-30T23:59:00Z');
  const budget = new Budget({ store, limitUsd: 1, now: () => date });
  const r = await budget.reserve(1);
  await r.settle(1);
  await assert.rejects(budget.reserve(0.01), (e) => e.code === 'budget');
  date = new Date('2026-12-01T00:01:00Z');
  await budget.reserve(0.01);
});

test('rate limiter: hashed ids, one claim per interval, expiry, and release', async () => {
  let now = Date.parse('2026-11-12T12:00:00Z');
  const store = new MemoryStore({ now: () => now });
  const rl = new RateLimiter({ store, secret: 's'.repeat(40), intervalSeconds: 120, deployment: 'test', now: () => now });
  const id = rl.idFor('203.0.113.9');
  assert.ok(!id.includes('203'));
  assert.notEqual(id, rl.idFor('203.0.113.10'));
  await rl.claim(id);
  await assert.rejects(rl.claim(id), (e) => e.code === 'rate_limited' && e.retry === 'wait' && e.retryAfterSeconds === 120);
  now += 119_000;
  await assert.rejects(rl.claim(id), (e) => e.retryAfterSeconds === 1);
  now += 1_000;
  await rl.claim(id);
  await rl.release(id);
  await rl.claim(id);
  // Hashes change every 6 hours.
  const later = new RateLimiter({ store, secret: 's'.repeat(40), intervalSeconds: 120, deployment: 'test', now: () => now + 6 * 3600 * 1000 });
  assert.notEqual(later.idFor('203.0.113.9'), id);
});

test('store: concurrency slots never exceed the maximum', async () => {
  const store = new MemoryStore();
  const got = await Promise.all(Array.from({ length: 10 }, () => store.acquireSlot('k', 3, 60)));
  assert.equal(got.filter(Boolean).length, 3);
  await store.releaseSlot('k');
  assert.equal(await store.acquireSlot('k', 3, 60), true);
});
