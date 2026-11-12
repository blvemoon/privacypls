// Fetches a public web page safely.
// - Only http/https on the standard ports (80/443), no usernames/passwords in links.
// - Every address the hostname resolves to must be public. Private, loopback,
//   link-local (including cloud metadata 169.254.169.254), multicast and other
//   special ranges are refused. The check runs on the address actually used for
//   the connection, so DNS tricks can't swap in a private address afterwards.
// - Redirects are followed by hand (up to a limit) and every hop is re-checked.
// - One overall timeout, and a size cap on both the raw and the decompressed body.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import zlib from 'node:zlib';
import ipaddr from 'ipaddr.js';
import { UserError, messages } from './errors.js';

const USER_AGENT = 'privacypls.io/1.0 (+https://privacypls.io/about; reads privacy policies on request)';
const NO_HOSTS = new Set();
const ACCEPTED_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain'];

export function isPublicAddress(address) {
  if (!ipaddr.isValid(address)) return false;
  let ip = ipaddr.parse(address);
  if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
  return ip.range() === 'unicast';
}

// Turns what the visitor typed into a checked URL object, or throws a UserError.
export function normalizeUserUrl(input, allowHosts = NO_HOSTS) {
  let raw = String(input || '').trim();
  if (!raw || raw.length > 2048) throw new UserError('invalid_url', messages.invalidUrl);
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UserError('invalid_url', messages.invalidUrl);
  }
  checkUrlShape(url, allowHosts);
  url.hash = '';
  return url;
}

function checkUrlShape(url, allowHosts = NO_HOSTS) {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (allowHosts.has(host) && (url.protocol === 'http:' || url.protocol === 'https:')) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UserError('blocked_url', messages.blockedUrl);
  }
  if (url.username || url.password) throw new UserError('blocked_url', messages.blockedUrl);
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new UserError('blocked_url', messages.blockedUrl);
  }
  if (!host) throw new UserError('invalid_url', messages.invalidUrl);
  if (ipaddr.isValid(host)) {
    // A literal IP address skips DNS, so check it here.
    if (!isPublicAddress(host)) throw new UserError('blocked_url', messages.blockedUrl);
  } else if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new UserError('blocked_url', messages.blockedUrl);
  }
}

function makeLookup(allowHosts) {
  return (hostname, options, callback) => {
    const allowPrivate = allowHosts.has(hostname);
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err);
      if (!addresses.length || (!allowPrivate && addresses.some((a) => !isPublicAddress(a.address)))) {
        const e = new Error('Address not allowed');
        e.code = 'EBLOCKED';
        return callback(e);
      }
      if (options && options.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

function charsetFrom(contentType, head) {
  const m = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType || '');
  if (m) return m[1];
  const meta = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head);
  return meta ? meta[1] : 'utf-8';
}

function decode(buffer, contentType) {
  const head = buffer.subarray(0, 4096).toString('latin1');
  const charset = charsetFrom(contentType, head);
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function requestOnce(url, { signal, maxBytes, allowHosts }) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'GET',
      signal,
      lookup: makeLookup(allowHosts),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.8',
      },
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ redirect: res.headers.location, status });
      }
      if (status === 404 || status === 410) {
        res.resume();
        return reject(new UserError('not_found', messages.notFound, { status: 422 }));
      }
      if (status === 401 || status === 403 || status === 429 || status === 451) {
        res.resume();
        return reject(new UserError('fetch_blocked', messages.fetchBlocked, { status: 422 }));
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return reject(new UserError('fetch_failed', messages.fetchFailed, { status: 422 }));
      }
      const contentType = String(res.headers['content-type'] || '').toLowerCase();
      const mime = contentType.split(';')[0].trim();
      if (mime && !ACCEPTED_TYPES.includes(mime)) {
        res.resume();
        return reject(new UserError('unsupported_type', messages.unsupportedType, { status: 422 }));
      }
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) {
        res.destroy();
        return reject(new UserError('too_large', messages.tooLarge, { status: 422 }));
      }

      const encoding = String(res.headers['content-encoding'] || '').toLowerCase().trim();
      let stream = res;
      if (encoding === 'gzip' || encoding === 'x-gzip') stream = res.pipe(zlib.createGunzip());
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
      else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

      const chunks = [];
      let total = 0;
      let done = false;
      const fail = (err) => {
        if (done) return;
        done = true;
        res.destroy();
        reject(err);
      };
      stream.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) return fail(new UserError('too_large', messages.tooLarge, { status: 422 }));
        chunks.push(chunk);
      });
      stream.on('end', () => {
        if (done) return;
        done = true;
        resolve({ status, contentType, body: Buffer.concat(chunks) });
      });
      stream.on('error', () => fail(new UserError('fetch_failed', messages.fetchFailed, { status: 422 })));
      res.on('error', () => fail(new UserError('fetch_failed', messages.fetchFailed, { status: 422 })));
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

// Returns { finalUrl, contentType, text }. Throws UserError with a friendly message.
// `allowHosts` exists only for automated tests: a set of exact hostnames (like
// "127.0.0.1") that skip the address checks so a local test server can be used.
// The app never sets it.
export async function safeFetch(input, {
  timeoutMs = 10000,
  maxBytes = 2 * 1024 * 1024,
  maxRedirects = 5,
  allowHosts = NO_HOSTS,
} = {}) {
  let url = input instanceof URL ? new URL(input) : normalizeUserUrl(input);
  checkUrlShape(url, allowHosts);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      let result;
      try {
        result = await requestOnce(url, { signal: controller.signal, maxBytes, allowHosts });
      } catch (err) {
        if (err instanceof UserError) throw err;
        if (controller.signal.aborted) throw new UserError('fetch_timeout', messages.fetchTimeout, { status: 422 });
        if (err && err.code === 'EBLOCKED') throw new UserError('blocked_url', messages.blockedUrl);
        throw new UserError('fetch_failed', messages.fetchFailed, { status: 422 });
      }
      if (result.redirect) {
        let next;
        try {
          next = new URL(result.redirect, url);
        } catch {
          throw new UserError('fetch_failed', messages.fetchFailed, { status: 422 });
        }
        checkUrlShape(next, allowHosts);
        next.hash = '';
        url = next;
        continue;
      }
      return { finalUrl: url.toString(), contentType: result.contentType, text: decode(result.body, result.contentType) };
    }
    throw new UserError('fetch_failed', messages.fetchFailed, { status: 422 });
  } finally {
    clearTimeout(timer);
  }
}
