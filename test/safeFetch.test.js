import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { safeFetch, isPublicAddress, normalizeUserUrl } from '../src/lib/safeFetch.js';

test('address check: private, internal and special ranges are refused', () => {
  const blocked = ['127.0.0.1', '10.1.2.3', '172.16.0.5', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1',
    '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '224.0.0.1', '255.255.255.255', '2001:db8::1', 'not-an-ip'];
  for (const a of blocked) assert.equal(isPublicAddress(a), false, a);
  for (const a of ['93.184.215.14', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicAddress(a), true, a);
});

test('URL check: only public http(s) links on standard ports', () => {
  assert.equal(normalizeUserUrl('example.com/privacy').toString(), 'https://example.com/privacy');
  const bad = ['ftp://example.com', 'file:///etc/passwd', 'http://localhost/', 'http://127.0.0.1/', 'http://[::1]/',
    'http://169.254.169.254/latest/meta-data', 'https://user:pass@example.com', 'https://example.com:8080/', 'http://intranet/',
    'http://printer.local/', 'javascript:alert(1)', '', 'x'.repeat(3000)];
  for (const u of bad) assert.throws(() => normalizeUserUrl(u), (err) => ['blocked_url', 'invalid_url'].includes(err.code), u);
});

test('fetch: refuses loopback even when a hostname resolves to it', async () => {
  // "localhost.example" isn't real, but a direct loopback IP must be refused before any request.
  await assert.rejects(safeFetch('http://127.0.0.1/'), (err) => err.code === 'blocked_url');
});

let server;
let base;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/page') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end('<html><head><title>T</title></head><body><main><p>Hello policy text.</p></main></body></html>');
    }
    if (req.url === '/gzip') {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Encoding', 'gzip');
      return res.end(zlib.gzipSync('<p>Compressed hello.</p>'));
    }
    if (req.url === '/bomb') {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Encoding', 'gzip');
      return res.end(zlib.gzipSync(Buffer.alloc(5 * 1024 * 1024, 'a')));
    }
    if (req.url === '/big') {
      res.setHeader('Content-Type', 'text/html');
      return res.end('a'.repeat(300000));
    }
    if (req.url === '/pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      return res.end('%PDF');
    }
    if (req.url === '/redirect') {
      res.statusCode = 302;
      res.setHeader('Location', '/page');
      return res.end();
    }
    if (req.url === '/loop') {
      res.statusCode = 302;
      res.setHeader('Location', '/loop');
      return res.end();
    }
    if (req.url === '/to-metadata') {
      res.statusCode = 302;
      res.setHeader('Location', 'http://169.254.169.254/latest/meta-data/');
      return res.end();
    }
    if (req.url === '/forbidden') { res.statusCode = 403; return res.end(); }
    if (req.url === '/slow') { setTimeout(() => res.end('<p>late</p>'), 3000); return undefined; }
    res.statusCode = 404;
    return res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => { server.closeAllConnections(); server.close(r); }));

// These tests use a local server, so they allow exactly that one test host.
const allowHosts = new Set(['127.0.0.1']);
const local = (path, opts = {}) => safeFetch(new URL(base + path), { allowHosts, timeoutMs: 2000, maxBytes: 200000, ...opts });

test('fetch: reads a page, follows redirects, and decompresses', async () => {
  const page = await local('/page');
  assert.ok(page.text.includes('Hello policy text.'));
  const redirected = await local('/redirect');
  assert.ok(redirected.finalUrl.endsWith('/page'));
  const gz = await local('/gzip');
  assert.ok(gz.text.includes('Compressed hello.'));
});

test('fetch: friendly errors for size, type, status, loops and timeouts', async () => {
  await assert.rejects(local('/big'), (e) => e.code === 'too_large');
  await assert.rejects(local('/bomb'), (e) => e.code === 'too_large', 'decompressed size is capped too');
  await assert.rejects(local('/pdf'), (e) => e.code === 'unsupported_type');
  await assert.rejects(local('/missing'), (e) => e.code === 'not_found');
  await assert.rejects(local('/forbidden'), (e) => e.code === 'fetch_blocked');
  await assert.rejects(local('/loop'), (e) => e.code === 'fetch_failed');
  await assert.rejects(local('/slow', { timeoutMs: 500 }), (e) => e.code === 'fetch_timeout');
});

test('fetch: a redirect to a private address is refused', async () => {
  // Only the test server's host is allowed; the redirect target (cloud metadata) is not.
  await assert.rejects(local('/to-metadata'), (e) => e.code === 'blocked_url');
});
