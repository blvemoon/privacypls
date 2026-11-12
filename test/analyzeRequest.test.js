// The full "Analyze" request, including the retry rules from PLAN.md.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { makeDeps, analyze, jsonRequest, sample } from './helpers/setup.js';
import { handleAnalyze } from '../lib/analyzeRequest.js';
import { keys } from '../lib/store.js';

const concerning = sample('01-concerning-social-app.txt');
const benign = sample('04-benign-bakery.txt');

test('success: concerning text is High with quotes; the visitor then waits the interval', async () => {
  const d = makeDeps();
  const res = await analyze(d, { mode: 'text', text: concerning, website: '' });
  assert.equal(res.status, 200);
  assert.equal(res.body.riskLevel, 'High');
  assert.ok(res.body.flags.length > 0);
  assert.equal(res.body.nextAnalysisInSeconds, 120);
  assert.equal(res.body.stats, undefined, 'cost details are not sent to visitors');
  const again = await analyze(d, { mode: 'text', text: benign });
  assert.equal(again.status, 429);
  assert.equal(again.body.retry, 'wait');
  assert.equal(again.body.retryAfterSeconds, 120);
  assert.equal(d.client.calls.length, 1);
});

test('success: benign text is Low', async () => {
  const res = await analyze(makeDeps(), { mode: 'text', text: benign });
  assert.equal(res.body.riskLevel, 'Low');
  assert.equal(res.body.flags.length, 0);
});

test('input mistakes: retry now, no wait, nothing spent', async () => {
  const d = makeDeps({ env: { ACCESS_PASSWORD: 'open-sesame' } });
  const cases = [
    [{ mode: 'text', text: 'too short', password: 'open-sesame' }, 'too_short'],
    [{ mode: 'text', text: 'a'.repeat(150001), password: 'open-sesame' }, 'too_long'],
    [{ mode: 'url', url: 'http://localhost:22/', password: 'open-sesame' }, 'blocked_url'],
    [{ mode: 'url', url: 'not a link at all', password: 'open-sesame' }, 'invalid_url'],
    [{ mode: 'text', text: benign, password: 'wrong' }, 'password'],
    [{ mode: 'text', text: benign, website: 'spam', password: 'open-sesame' }, 'bot_check'],
    [{ mode: 'pdf', password: 'open-sesame' }, 'bad_request'],
  ];
  for (const [body, code] of cases) {
    const res = await analyze(d, body);
    assert.equal(res.body.code, code, JSON.stringify(body).slice(0, 60));
    assert.equal(res.body.retry, 'now', code);
    assert.ok(res.body.title && res.body.error, 'dialog has a title and a message');
  }
  assert.equal(d.client.calls.length, 0);
  const ok = await analyze(d, { mode: 'text', text: benign, password: 'open-sesame' });
  assert.equal(ok.status, 200, 'no wait was imposed by the mistakes above');
});

test('too-long text message states the limit and the length', async () => {
  const res = await analyze(makeDeps(), { mode: 'text', text: 'a'.repeat(150001) });
  assert.match(res.body.error, /150,001 characters, and the limit is 150,000/);
});

test('AI down before anything was spent: retry now, slot given back', async () => {
  const d = makeDeps({ fake: { failWith: 500 } });
  const first = await analyze(d, { mode: 'text', text: benign });
  assert.equal(first.body.code, 'ai_unavailable');
  assert.equal(first.body.retry, 'now');
  const second = await analyze(d, { mode: 'text', text: benign });
  assert.equal(second.body.code, 'ai_unavailable', 'not rate limited');
});

test('failure after money was spent: the visitor waits, with a countdown', async () => {
  const d = makeDeps({ fake: { noTool: true } });
  const res = await analyze(d, { mode: 'text', text: benign });
  assert.equal(res.body.code, 'ai_failed_after_charge');
  assert.equal(res.body.retry, 'wait');
  assert.equal(res.body.retryAfterSeconds, 120);
  const again = await analyze(d, { mode: 'text', text: benign });
  assert.equal(again.body.code, 'rate_limited');
});

test('monthly limit: not set, or reached -> "next month", and no AI call', async () => {
  const unset = makeDeps({ env: { MONTHLY_BUDGET_USD: '' } });
  const a = await analyze(unset, { mode: 'text', text: benign });
  assert.equal(a.body.code, 'budget');
  assert.equal(a.body.retry, 'next_month');
  assert.equal(unset.client.calls.length, 0);

  const tiny = makeDeps({ env: { MONTHLY_BUDGET_USD: '0.0001' } });
  const b = await analyze(tiny, { mode: 'text', text: benign });
  assert.equal(b.body.code, 'budget');
  assert.equal(tiny.client.calls.length, 0);
  const c = await analyze(tiny, { mode: 'text', text: benign });
  assert.equal(c.body.code, 'budget', 'the visitor was not also rate limited');
});

test('no storage configured, or storage down: refuse, never run unprotected', async () => {
  const none = makeDeps({ store: null });
  const a = await analyze(none, { mode: 'text', text: benign });
  assert.equal(a.status, 503);
  assert.equal(none.client.calls.length, 0);

  const d = makeDeps();
  d.store.failing = true;
  const b = await analyze(d, { mode: 'text', text: benign });
  assert.equal(b.body.code, 'service_unavailable');
  assert.equal(b.body.retry, 'now');
  assert.equal(d.client.calls.length, 0);
});

test('too many at once: "busy" with a short wait; the visitor keeps no penalty', async () => {
  const d = makeDeps({ env: { MAX_CONCURRENT_ANALYSES: '1' } });
  await d.store.acquireSlot(keys.slots(d.config.deployment), 1, 360); // someone else is mid-analysis
  const res = await analyze(d, { mode: 'text', text: benign });
  assert.equal(res.body.code, 'busy');
  assert.equal(res.body.retry, 'wait');
  assert.equal(res.body.retryAfterSeconds, 30);
  await d.store.releaseSlot(keys.slots(d.config.deployment));
  const ok = await analyze(d, { mode: 'text', text: benign });
  assert.equal(ok.status, 200, 'busy did not use up their rate limit');
});

test('two requests at the same moment from one visitor: only one runs', async () => {
  const d = makeDeps();
  const [a, b] = await Promise.all([analyze(d, { mode: 'text', text: benign }), analyze(d, { mode: 'text', text: benign })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 429]);
  assert.equal(d.client.calls.length, 1);
});

test('different visitors are limited separately; previews share the spending total', async () => {
  const store = (await import('../lib/store.js')).MemoryStore;
  const shared = new store();
  const prod = makeDeps({ store: shared, env: { VERCEL_ENV: 'production', HASH_SECRET: 'p'.repeat(40) } });
  const preview = makeDeps({ store: shared, env: { VERCEL_ENV: 'preview', HASH_SECRET: 'p'.repeat(40) } });
  assert.equal((await analyze(prod, { mode: 'text', text: benign }, { ip: '198.51.100.1' })).status, 200);
  assert.equal((await analyze(prod, { mode: 'text', text: benign }, { ip: '198.51.100.2' })).status, 200);
  assert.equal((await analyze(preview, { mode: 'text', text: benign }, { ip: '198.51.100.1' })).status, 200);
  const prodSpent = await prod.budget.spentMicros();
  const previewSpent = await preview.budget.spentMicros();
  assert.equal(prodSpent, previewSpent, 'one shared total');
  assert.ok(prodSpent > 0);
});

test('oversized or malformed request bodies get friendly messages', async () => {
  const d = makeDeps();
  const big = await handleAnalyze(jsonRequest({ mode: 'text', text: 'a'.repeat(3 * 1024 * 1024) }), { deps: d, ip: '1.2.3.4' });
  assert.equal(big.body.code, 'too_long');
  const bad = await handleAnalyze(jsonRequest('{not json'), { deps: d, ip: '1.2.3.4' });
  assert.equal(bad.body.code, 'bad_request');
});

test('bot check: required when on, single-use, and a solved puzzle passes', async () => {
  const d = makeDeps({ env: { BOT_CHECK_ENABLED: 'true', HASH_SECRET: 'x'.repeat(40), ALTCHA_COST: '100' } });
  assert.equal((await analyze(d, { mode: 'text', text: benign })).body.code, 'bot_check');
  const forged = Buffer.from('{"challenge":{},"solution":{}}').toString('base64');
  assert.equal((await analyze(d, { mode: 'text', text: benign, altcha: forged })).body.code, 'bot_check');

  const challenge = await d.botCheck.newChallenge();
  const solution = await solveChallenge({ challenge, deriveKey });
  const altcha = Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
  const ok = await analyze(d, { mode: 'text', text: benign, altcha }, { ip: '198.51.100.9' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const replay = await analyze(d, { mode: 'text', text: benign, altcha }, { ip: '198.51.100.10' });
  assert.equal(replay.body.code, 'bot_check', 'the same answer cannot be reused');
});

let pageServer;
let pageBase;
before(async () => {
  pageServer = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/empty') return res.end('<html><body><div id="app"></div><script>render()</script></body></html>');
    if (req.url === '/missing') { res.statusCode = 404; return res.end(); }
    const paras = concerning.split('\n').map((l) => `<p>${l}</p>`).join('');
    return res.end(`<html><head><title>Chatterly Privacy</title></head><body><main>${paras}</main></body></html>`);
  });
  await new Promise((r) => pageServer.listen(0, '127.0.0.1', r));
  pageBase = `http://127.0.0.1:${pageServer.address().port}`;
});
after(() => new Promise((r) => pageServer.close(r)));

test('URL mode: fetched, extracted and analyzed; page problems are "retry now"', async () => {
  const fetchOptions = { allowHosts: new Set(['127.0.0.1']) };
  const d = makeDeps();
  const ok = await analyze(d, { mode: 'url', url: `${pageBase}/policy` }, { fetchOptions });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.source.title, 'Chatterly Privacy');

  const d2 = makeDeps();
  const empty = await analyze(d2, { mode: 'url', url: `${pageBase}/empty` }, { fetchOptions });
  assert.equal(empty.body.code, 'empty_page');
  assert.equal(empty.body.retry, 'now');
  const missing = await analyze(d2, { mode: 'url', url: `${pageBase}/missing` }, { fetchOptions });
  assert.equal(missing.body.code, 'not_found');
  assert.equal(missing.body.retry, 'now');
  assert.equal(d2.client.calls.length, 0);
  const after = await analyze(d2, { mode: 'url', url: `${pageBase}/policy` }, { fetchOptions });
  assert.equal(after.status, 200, 'page problems did not cost a wait');
});
