import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeForMatch, quoteAppearsIn } from '../src/lib/quotes.js';
import { chunkText } from '../src/lib/chunk.js';
import { validateRules, allowedSeverities } from '../src/lib/rules.js';
import { costUsd, estimateCostUsd } from '../src/lib/pricing.js';
import { extractFromHtml, cleanText } from '../src/lib/extract.js';
import { UsageStore } from '../src/lib/usageStore.js';
import { Budget } from '../src/lib/budget.js';
import { RateLimiter } from '../src/lib/rateLimit.js';
import { loadConfig } from '../src/config.js';
import { rules, pricing, tempDir } from './helpers/setup.js';

test('quotes: exact match ignoring case, spacing, and curly quotes', () => {
  const src = normalizeForMatch('We may sell your “personal\n  information” to third‑party advertisers.');
  assert.ok(quoteAppearsIn('we may sell your "personal information" to third-party advertisers.', src));
  assert.ok(quoteAppearsIn('"We may sell your “personal information”"', src));
});

test('quotes: rejects invented or reworded text', () => {
  const src = normalizeForMatch('We may share your data with service providers.');
  assert.equal(quoteAppearsIn('We may sell your data to advertisers.', src), false);
  assert.equal(quoteAppearsIn('We may share your data with partners.', src), false);
  assert.equal(quoteAppearsIn('share', src), false, 'too short to be meaningful');
});

test('quotes: shortened quotes must keep both parts in order', () => {
  const src = normalizeForMatch('We may share your data with service providers, affiliates, and advertising partners worldwide.');
  assert.ok(quoteAppearsIn('We may share your data … advertising partners worldwide', src));
  assert.equal(quoteAppearsIn('advertising partners worldwide ... We may share your data', src), false);
});

test('chunk: short text stays whole; long text splits under the limit with overlap', () => {
  assert.deepEqual(chunkText('short', 100), ['short']);
  const para = 'This is a sentence about data. '.repeat(40);
  const text = Array.from({ length: 10 }, (_, i) => `Section ${i}. ${para}`).join('\n\n');
  const parts = chunkText(text, 3000, 200);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 3000, `part length ${p.length}`);
  assert.ok(parts[parts.length - 1].includes('Section 9.'));
  // Every sentence of the original appears in some part.
  for (let i = 0; i < 10; i += 1) assert.ok(parts.some((p) => p.includes(`Section ${i}.`)));
});

test('rules: the shipped rules file is valid and every escalation is allowed', () => {
  assert.equal(rules.rules.length, 15);
  const tracking = rules.byId.get('tracking-profiling');
  assert.deepEqual(allowedSeverities(tracking).sort(), ['High', 'Medium']);
  assert.deepEqual(allowedSeverities(rules.byId.get('cross-border')), ['Low']);
});

test('rules: validation catches common mistakes', () => {
  const { problems } = validateRules({ rules: [
    { id: 'ok-rule', name: 'Ok', lookFor: 'x', severity: 'High' },
    { id: 'ok-rule', name: 'Dup', lookFor: 'x', severity: 'High' },
    { id: 'Bad Id', name: 'Bad', lookFor: 'x', severity: 'Severe' },
    { id: 'no-look', name: 'No look', severity: 'Low', escalation: { to: 'Huge' } },
  ] });
  assert.ok(problems.some((p) => p.includes('used twice')));
  assert.ok(problems.some((p) => p.includes('lowercase')));
  assert.ok(problems.some((p) => p.includes('severity')));
  assert.ok(problems.some((p) => p.includes('lookFor')));
  assert.ok(problems.some((p) => p.includes('escalation')));
});

test('pricing: Haiku cost, and the higher rate above 100k prompt tokens', () => {
  assert.equal(costUsd(pricing, 'claude-haiku-5-5', 8000, 1500).toFixed(6), '0.001550');
  assert.equal(costUsd(pricing, 'claude-haiku-5-5', 120000, 1000).toFixed(6), (120000 * 0.5 / 1e6 + 1000 * 2.5 / 1e6).toFixed(6));
  assert.equal(costUsd(pricing, 'claude-sonnet-5-5', 8000, 1500).toFixed(4), '0.0310');
  assert.ok(estimateCostUsd(pricing, 'claude-haiku-5-5', 30000, 4000) > costUsd(pricing, 'claude-haiku-5-5', 7500, 1500));
  assert.throws(() => costUsd(pricing, 'unknown-model', 1, 1), /No price/);
});

test('extract: keeps paragraph text, drops scripts, menus and footers', () => {
  const html = `<html><head><title> Example Privacy </title><script>var secret = 1;</script></head>
    <body><nav>Home | Shop</nav><main><h1>Privacy Policy</h1><p>We collect   your email.</p>
    <ul><li>Item one</li><li>Item two</li></ul><p>Line<br>break</p></main><footer>© Example</footer></body></html>`;
  const { title, text } = extractFromHtml(html);
  assert.equal(title, 'Example Privacy');
  assert.ok(text.includes('We collect your email.'));
  assert.ok(text.includes('Item one\n'));
  assert.ok(text.includes('Line\nbreak'));
  assert.ok(!text.includes('secret'));
  assert.ok(!text.includes('Home | Shop'));
  assert.ok(!text.includes('©'));
  assert.equal(cleanText('  a \n\n\n\n b  '), 'a\n\nb');
});

test('usage store: records totals per day and survives a restart', () => {
  const dir = tempDir();
  const store = new UsageStore(dir);
  store.record({ model: 'claude-haiku-5-5', inputTokens: 1000, outputTokens: 200, costUsd: 0.0002 });
  store.record({ model: 'claude-haiku-5-5', inputTokens: 1000, outputTokens: 200, costUsd: 0.0002 });
  store.countAnalysis();
  const again = new UsageStore(dir);
  assert.equal(again.monthSpendUsd(), 0.0004);
  const [[, day]] = again.days();
  assert.equal(day.requests, 2);
  assert.equal(day.analyses, 1);
});

test('budget: reservations stop concurrent requests from overspending', () => {
  const store = new UsageStore(tempDir());
  const budget = new Budget({ store, limitUsd: 0.01 });
  const release1 = budget.reserve(0.006);
  assert.throws(() => budget.reserve(0.006), (err) => err.code === 'budget');
  release1();
  const release2 = budget.reserve(0.006);
  release2();
  store.record({ model: 'claude-haiku-5-5', inputTokens: 1, outputTokens: 1, costUsd: 0.01 });
  assert.ok(budget.isExhausted());
});

test('rate limiter: one analysis per interval, ids are not raw IPs, entries expire', () => {
  let now = 1_000_000;
  const rl = new RateLimiter({ intervalSeconds: 120, now: () => now });
  const id = rl.idFor('203.0.113.9');
  assert.ok(!id.includes('203'));
  assert.equal(id, rl.idFor('203.0.113.9'));
  assert.notEqual(id, rl.idFor('203.0.113.10'));
  assert.equal(rl.waitSeconds(id), 0);
  rl.mark(id);
  assert.equal(rl.waitSeconds(id), 120);
  now += 119_000;
  assert.equal(rl.waitSeconds(id), 1);
  now += 1_000;
  assert.equal(rl.waitSeconds(id), 0);
  assert.equal(rl.size(), 0, 'expired entries are removed');
  rl.mark(id);
  rl.unmark(id);
  assert.equal(rl.waitSeconds(id), 0);
});

test('config: production refuses to start without the API key and bot-check secret', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /ANTHROPIC_API_KEY[\s\S]*ALTCHA_HMAC_SECRET/);
  const ok = loadConfig({ NODE_ENV: 'production', ANTHROPIC_API_KEY: 'k', ALTCHA_HMAC_SECRET: 'x'.repeat(40) });
  assert.equal(ok.model, 'claude-haiku-5-5');
  assert.equal(ok.monthlyBudgetUsd, 18);
  assert.equal(ok.rateLimitSeconds, 120);
  assert.throws(() => loadConfig({ RATE_LIMIT_SECONDS: 'soon' }), /RATE_LIMIT_SECONDS/);
  assert.throws(() => loadConfig({ DONATION_URL: 'http://insecure.example' }), /https/);
  assert.equal(loadConfig({ FEEDBACK_CONTACT: 'me@example.com' }).feedback.href, 'mailto:me@example.com');
});
