// Handles one "Analyze" request from start to finish. Kept separate from the
// Next.js route file so it can be tested directly.
//
// Order matters: cheap checks on what the visitor entered come first, so
// mistakes never cost a wait. The rate-limit slot is claimed only once the
// request is valid, and given back unless money was actually spent.
import crypto from 'node:crypto';
import { safeFetch, normalizeUserUrl } from './safeFetch.js';
import { extractFromResponse, cleanText } from './extract.js';
import { UserError, messages, titles } from './errors.js';
import { keys, safely } from './store.js';
import { log } from './log.js';

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function samePassword(given, expected) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function checkLength(text, config) {
  if (text.length < config.minTextChars) {
    throw new UserError('too_short', messages.tooShort(config.minTextChars, text.length), { title: titles.input });
  }
  if (text.length > config.maxTextChars) {
    throw new UserError('too_long', messages.tooLong(config.maxTextChars, text.length), { status: 413, title: titles.input });
  }
}

function safeMessage(err) {
  return String(err && err.message ? err.message : err).replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]').slice(0, 300);
}

export function errorBody(err) {
  if (err instanceof UserError) {
    return {
      status: err.status,
      body: {
        error: err.message,
        title: err.title,
        code: err.code,
        retry: err.retry,
        retryAfterSeconds: err.retryAfterSeconds ?? null,
      },
    };
  }
  return {
    status: 500,
    body: { error: 'Something went wrong. Please try again.', title: titles.service, code: 'server_error', retry: 'now', retryAfterSeconds: null },
  };
}

async function readJson(request, config) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new UserError('too_long', messages.tooLong(config.maxTextChars), { status: 413, title: titles.input });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new UserError('too_long', messages.tooLong(config.maxTextChars), { status: 413, title: titles.input });
  try {
    const body = JSON.parse(raw);
    return body && typeof body === 'object' ? body : {};
  } catch {
    throw new UserError('bad_request', messages.badRequest, { title: titles.service });
  }
}

// Returns { status, body } for the route to send.
export async function handleAnalyze(request, { deps, ip, fetchOptions = {} }) {
  const { config, store, budget, usage, rateLimiter, botCheck, analyzer } = deps;
  let visitorId = null;
  let claimed = false;
  let slotTaken = false;
  try {
    const body = await readJson(request, config);
    const mode = body.mode === 'text' ? 'text' : body.mode === 'url' ? 'url' : null;
    if (!mode) throw new UserError('bad_request', messages.badRequest, { title: titles.service });

    // 1. Checks on what the visitor entered (free, never cause a wait).
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      log.info('honeypot_triggered');
      throw new UserError('bot_check', messages.botCheck, { title: titles.input });
    }
    if (config.accessPassword && !samePassword(body.password, config.accessPassword)) {
      throw new UserError('password', messages.password, { status: 401, title: titles.input });
    }
    let url = null;
    let pastedText = null;
    if (mode === 'url') {
      url = normalizeUserUrl(body.url, fetchOptions.allowHosts);
    } else {
      pastedText = cleanText(typeof body.text === 'string' ? body.text : '');
      checkLength(pastedText, config);
    }

    // 2. Site-wide protections.
    if (!store) throw new UserError('service_unavailable', messages.serviceUnavailable, { status: 503, title: titles.service });
    await budget.assertAvailable();
    await botCheck.verify(body.altcha);

    // 3. The visitor's own rate limit, then the "too many at once" limit.
    visitorId = rateLimiter.idFor(ip);
    await rateLimiter.claim(visitorId);
    claimed = true;
    slotTaken = await safely(() => store.acquireSlot(keys.slots(config.deployment), config.maxConcurrentAnalyses, 360));
    if (!slotTaken) {
      throw new UserError('busy', messages.busy, { status: 503, retry: 'wait', retryAfterSeconds: config.busyRetrySeconds, title: titles.wait });
    }

    // 4. Get the text.
    let text = pastedText;
    let source = { kind: 'text', chars: 0 };
    if (mode === 'url') {
      const page = await safeFetch(url, {
        timeoutMs: config.fetchTimeoutMs,
        maxBytes: config.fetchMaxBytes,
        maxRedirects: config.fetchMaxRedirects,
        ...fetchOptions,
      });
      const extracted = extractFromResponse(page);
      text = extracted.text;
      if (text.length < config.minTextChars) throw new UserError('empty_page', messages.emptyPage, { status: 422, title: titles.page });
      checkLength(text, config);
      source = { kind: 'url', url: page.finalUrl, title: extracted.title };
    }
    source.chars = text.length;

    // 5. Analyze. The slot stays claimed: a finished analysis means a wait.
    const result = await analyzer.analyze(text);
    await usage.recordAnalysis();
    log.info('analysis_done', {
      source: source.kind,
      parts: result.stats.parts,
      flags: result.flags.length,
      dropped: result.stats.droppedFlags,
      inputTokens: result.stats.inputTokens,
      outputTokens: result.stats.outputTokens,
      costUsd: result.stats.costUsd,
    });
    const nextInSeconds = await rateLimiter.secondsLeft(visitorId).catch(() => config.rateLimitSeconds);
    return {
      status: 200,
      body: {
        riskLevel: result.riskLevel,
        summary: result.summary,
        flags: result.flags,
        source,
        droppedFlags: result.stats.droppedFlags,
        parts: result.stats.parts,
        nextAnalysisInSeconds: nextInSeconds || config.rateLimitSeconds,
      },
    };
  } catch (err) {
    let error = err;
    if (!(error instanceof UserError)) {
      log.error('analyze_failed', { kind: err && err.name ? err.name : 'Error', message: safeMessage(err) });
    }
    if (claimed) {
      const spentMoney = error instanceof UserError && error.code === 'ai_failed_after_charge';
      if (spentMoney) {
        // Keep the slot: the visitor waits the normal interval.
        const left = await rateLimiter.secondsLeft(visitorId).catch(() => 0);
        error.retryAfterSeconds = left || config.rateLimitSeconds;
      } else if (!(error instanceof UserError && error.code === 'rate_limited')) {
        await rateLimiter.release(visitorId).catch(() => {});
      }
    }
    return errorBody(error);
  } finally {
    if (slotTaken) await store.releaseSlot(keys.slots(config.deployment)).catch(() => {});
  }
}
