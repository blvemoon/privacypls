import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { buildDeps, listen, postJson, sample } from './helpers/setup.js';

const concerning = sample('01-concerning-social-app.txt');
const benign = sample('04-benign-bakery.txt');

async function withApp(opts, fn) {
  const deps = buildDeps(opts);
  const srv = await listen(deps.app);
  try {
    await fn(srv.url, deps);
  } finally {
    await srv.close();
  }
}

test('pages: home, privacy and about load; feedback is hidden until a contact is set', async () => {
  await withApp({}, async (url) => {
    const home = await (await fetch(`${url}/`)).text();
    assert.match(home, /How we handle your submission/);
    assert.match(home, /href="\/privacy"/);
    assert.match(home, /data-theme="dark"/);
    assert.match(home, /Deeper analysis with Claude Sonnet/);
    assert.ok(!home.includes('Support this project'), 'no donation link when DONATION_URL is empty');
    assert.ok(!home.includes('href="/feedback"'));
    const privacy = await fetch(`${url}/privacy`);
    assert.equal(privacy.status, 200);
    const privacyText = await privacy.text();
    assert.match(privacyText, /anthropic\.com\/legal\/privacy/);
    assert.match(privacyText, /sets no cookies/);
    assert.equal((await fetch(`${url}/about`)).status, 200);
    assert.equal((await fetch(`${url}/feedback`)).status, 404);
    assert.deepEqual(await (await fetch(`${url}/health`)).json(), { status: 'ok' });
    const res = await fetch(`${url}/`);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('set-cookie'), null, 'no cookies');
  });
  await withApp({ env: { FEEDBACK_CONTACT: 'hello@example.com', DONATION_URL: 'https://ko-fi.com/example' } }, async (url) => {
    const home = await (await fetch(`${url}/`)).text();
    assert.match(home, /href="\/feedback"/);
    assert.match(home, /ko-fi\.com\/example/);
    const feedback = await (await fetch(`${url}/feedback`)).text();
    assert.match(feedback, /mailto:hello@example\.com/);
  });
});

test('analyze: pasted concerning text comes back High with flags and quotes', async () => {
  await withApp({}, async (url) => {
    const res = await postJson(`${url}/api/analyze`, { mode: 'text', text: concerning, website: '' });
    assert.equal(res.status, 200);
    assert.equal(res.body.riskLevel, 'High');
    assert.ok(res.body.flags.length > 0);
    assert.equal(res.body.source.kind, 'text');
    for (const f of res.body.flags) {
      assert.ok(f.quote && f.explanation && f.severity && f.confidence && f.ruleName);
    }
    assert.equal(res.body.stats, undefined, 'cost details are not sent to visitors');
  });
});

test('analyze: pasted benign text comes back Low', async () => {
  await withApp({}, async (url) => {
    const res = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign });
    assert.equal(res.status, 200);
    assert.equal(res.body.riskLevel, 'Low');
    assert.equal(res.body.flags.length, 0);
  });
});

test('analyze: rate limit allows one analysis per interval per visitor', async () => {
  await withApp({ env: { RATE_LIMIT_SECONDS: '120' } }, async (url, deps) => {
    assert.equal((await postJson(`${url}/api/analyze`, { mode: 'text', text: benign })).status, 200);
    const second = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign });
    assert.equal(second.status, 429);
    assert.equal(second.body.code, 'rate_limited');
    assert.ok(Number(second.headers.get('retry-after')) > 100);
    assert.match(second.body.error, /2 minutes/);
    assert.equal(deps.client.calls.length, 1, 'the second request never reached the AI');
  });
});

test('analyze: AI outage does not use up the visitor\'s rate limit', async () => {
  await withApp({ fake: { failWith: 500 } }, async (url) => {
    const first = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign });
    assert.equal(first.status, 503);
    assert.equal(first.body.code, 'ai_unavailable');
    const again = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign });
    assert.equal(again.body.code, 'ai_unavailable', 'not rate limited');
  });
});

test('analyze: honeypot, password gate, and input checks', async () => {
  await withApp({ env: { ACCESS_PASSWORD: 'open-sesame' } }, async (url, deps) => {
    const bot = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign, website: 'http://spam.example', password: 'open-sesame' });
    assert.equal(bot.body.code, 'bot_check');
    const wrong = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign, password: 'nope' });
    assert.equal(wrong.status, 401);
    const short = await postJson(`${url}/api/analyze`, { mode: 'text', text: 'too short', password: 'open-sesame' });
    assert.equal(short.body.code, 'too_short');
    const long = await postJson(`${url}/api/analyze`, { mode: 'text', text: 'a'.repeat(150001), password: 'open-sesame' });
    assert.equal(long.body.code, 'too_long');
    const badMode = await postJson(`${url}/api/analyze`, { mode: 'pdf', password: 'open-sesame' });
    assert.equal(badMode.body.code, 'bad_request');
    const badUrl = await postJson(`${url}/api/analyze`, { mode: 'url', url: 'http://localhost:22/', password: 'open-sesame' });
    assert.equal(badUrl.body.code, 'blocked_url');
    assert.equal(deps.client.calls.length, 0);
    const ok = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign, password: 'open-sesame' });
    assert.equal(ok.status, 200);
    const home = await (await fetch(`${url}/`)).text();
    assert.match(home, /Access password/);
  });
});

test('analyze: monthly limit reached shows the friendly message', async () => {
  await withApp({ env: { MONTHLY_BUDGET_USD: '0' } }, async (url, deps) => {
    const res = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign });
    assert.equal(res.status, 503);
    assert.match(res.body.error, /monthly|month/i);
    assert.equal(deps.client.calls.length, 0);
  });
});

test('analyze: too many at once gets "We\'re busy"', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  await withApp({ env: { MAX_CONCURRENT_ANALYSES: '1', RATE_LIMIT_SECONDS: '0' } }, async (url, deps) => {
    const original = deps.client.messages.create;
    deps.client.messages.create = async (p) => { await gate; return original(p); };
    const first = postJson(`${url}/api/analyze`, { mode: 'text', text: benign });
    await new Promise((r) => setTimeout(r, 100));
    const second = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign });
    assert.equal(second.status, 503);
    assert.match(second.body.error, /busy/);
    release();
    assert.equal((await first).status, 200);
  });
});

let pageServer;
let pageBase;
before(async () => {
  pageServer = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/empty') return res.end('<html><body><div id="app"></div><script>render()</script></body></html>');
    const paras = concerning.split('\n').map((l) => `<p>${l}</p>`).join('');
    return res.end(`<html><head><title>Chatterly Privacy</title></head><body><nav>Menu</nav><main>${paras}</main></body></html>`);
  });
  await new Promise((r) => pageServer.listen(0, '127.0.0.1', r));
  pageBase = `http://127.0.0.1:${pageServer.address().port}`;
});
after(() => new Promise((r) => pageServer.close(r)));

test('analyze: a URL is fetched, its text extracted and analyzed', async () => {
  await withApp({ fetchOptions: { allowHosts: new Set(['127.0.0.1']) } }, async (url) => {
    const res = await postJson(`${url}/api/analyze`, { mode: 'url', url: `${pageBase}/policy` });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.riskLevel, 'High');
    assert.equal(res.body.source.kind, 'url');
    assert.equal(res.body.source.title, 'Chatterly Privacy');
  });
  await withApp({ fetchOptions: { allowHosts: new Set(['127.0.0.1']) } }, async (url, deps) => {
    const res = await postJson(`${url}/api/analyze`, { mode: 'url', url: `${pageBase}/empty` });
    assert.equal(res.body.code, 'empty_page');
    assert.match(res.body.error, /pasting it instead/);
    assert.equal(deps.client.calls.length, 0);
  });
});

test('bot check: required when on, single-use, and a solved puzzle passes', async () => {
  await withApp({ env: { BOT_CHECK_ENABLED: 'true', ALTCHA_HMAC_SECRET: 'x'.repeat(40), ALTCHA_COST: '100' } }, async (url) => {
    const missing = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign });
    assert.equal(missing.body.code, 'bot_check');
    const forged = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign, altcha: Buffer.from('{"challenge":{},"solution":{}}').toString('base64') });
    assert.equal(forged.body.code, 'bot_check');

    const challenge = await (await fetch(`${url}/api/challenge`)).json();
    const solution = await solveChallenge({ challenge, deriveKey });
    const altcha = Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
    const ok = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign, altcha });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const replay = await postJson(`${url}/api/analyze`, { mode: 'text', text: benign, altcha });
    assert.equal(replay.body.code, 'bot_check', 'the same answer cannot be reused');
  });
});
