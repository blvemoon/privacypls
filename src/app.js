// Builds the Express app. Everything it needs is passed in, so tests can swap
// in a simulated Claude client.
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { ROOT_DIR } from './config.js';
import { safeFetch, normalizeUserUrl } from './lib/safeFetch.js';
import { extractFromResponse, cleanText } from './lib/extract.js';
import { UserError, messages } from './lib/errors.js';
import { log } from './lib/log.js';
import { homePage, privacyPage, aboutPage, feedbackPage, notFoundPage, errorPage } from './views/pages.js';

function samePassword(given, expected) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

export function createApp({ config, analyzer, budget, usage, rateLimiter, botCheck, fetchOptions = {} }) {
  const app = express();
  app.disable('x-powered-by');
  // The app runs behind Nginx on the same machine; trust it for the visitor IP.
  app.set('trust proxy', 'loopback');

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: config.isProduction ? { maxAge: 15552000 } : false,
  }));
  app.use((req, res, next) => {
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    next();
  });

  app.use('/static', express.static(path.join(ROOT_DIR, 'public'), { maxAge: config.isProduction ? '1h' : 0 }));
  app.use('/vendor/altcha', express.static(path.join(ROOT_DIR, 'node_modules/altcha/dist/external'), { maxAge: '1d' }));
  app.use('/vendor/altcha/workers', express.static(path.join(ROOT_DIR, 'node_modules/altcha/dist/workers'), { maxAge: '1d' }));

  const page = (render) => (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('html').send(render(config));
  };
  app.get('/', page(homePage));
  app.get('/privacy', page(privacyPage));
  app.get('/about', page(aboutPage));
  app.get('/feedback', (req, res, next) => (config.feedback ? page(feedbackPage)(req, res) : next()));

  // For an uptime monitor. Reveals nothing sensitive.
  app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'ok' });
  });

  app.get('/api/challenge', botCheck.challengeHandler);

  let active = 0;

  app.post('/api/analyze', express.json({ limit: '2mb' }), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (active >= config.maxConcurrentAnalyses) {
      return sendError(res, new UserError('busy', messages.busy, { status: 503, retryAfterSeconds: 30 }));
    }
    active += 1;
    let visitorId = null;
    let marked = false;
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const mode = body.mode === 'text' ? 'text' : body.mode === 'url' ? 'url' : null;
      if (!mode) throw new UserError('bad_request', messages.badRequest);

      // Honeypot: people never see this field. Answer like a failed bot check.
      if (typeof body.website === 'string' && body.website.trim() !== '') {
        log.info('honeypot_triggered');
        throw new UserError('bot_check', messages.botCheck);
      }
      if (config.accessPassword && !samePassword(body.password, config.accessPassword)) {
        throw new UserError('password', messages.password, { status: 401 });
      }
      // Cheap checks first, so a bad link doesn't spend the visitor's bot-check answer.
      let url = null;
      let pastedText = null;
      if (mode === 'url') {
        url = normalizeUserUrl(body.url, fetchOptions.allowHosts);
      } else {
        pastedText = cleanText(typeof body.text === 'string' ? body.text : '');
        checkLength(pastedText, config);
      }

      await botCheck.verify(body.altcha);

      visitorId = rateLimiter.idFor(req.ip);
      const wait = rateLimiter.waitSeconds(visitorId);
      if (wait > 0) {
        throw new UserError('rate_limited', messages.rateLimited(config.rateLimitSeconds), { status: 429, retryAfterSeconds: wait });
      }
      if (budget.isExhausted()) throw new UserError('budget', messages.budget, { status: 503 });

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
        if (text.length < config.minTextChars) throw new UserError('empty_page', messages.emptyPage, { status: 422 });
        checkLength(text, config);
        source = { kind: 'url', url: page.finalUrl, title: extracted.title };
      }
      source.chars = text.length;

      rateLimiter.mark(visitorId);
      marked = true;
      const result = await analyzer.analyze(text);
      usage.countAnalysis();
      log.info('analysis_done', {
        source: source.kind,
        parts: result.stats.parts,
        flags: result.flags.length,
        dropped: result.stats.droppedFlags,
        inputTokens: result.stats.inputTokens,
        outputTokens: result.stats.outputTokens,
        costUsd: result.stats.costUsd,
      });
      return res.json({
        riskLevel: result.riskLevel,
        summary: result.summary,
        flags: result.flags,
        source,
        droppedFlags: result.stats.droppedFlags,
        parts: result.stats.parts,
      });
    } catch (err) {
      // If the failure wasn't the visitor's doing, let them try again right away.
      if (marked && err instanceof UserError && ['ai_unavailable', 'ai_bad_output', 'budget', 'busy'].includes(err.code)) {
        rateLimiter.unmark(visitorId);
      }
      if (!(err instanceof UserError)) log.error('analyze_failed', { kind: err && err.name ? err.name : 'Error', message: safeMessage(err) });
      return sendError(res, err);
    } finally {
      active -= 1;
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((req, res) => res.status(404).type('html').send(notFoundPage(config)));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      return sendError(res, new UserError('too_long', messages.tooLong(config.maxTextChars), { status: 413 }));
    }
    if (err && err.type === 'entity.parse.failed') return sendError(res, new UserError('bad_request', messages.badRequest));
    log.error('unhandled_error', { kind: err && err.name ? err.name : 'Error', message: safeMessage(err) });
    if (req.path.startsWith('/api')) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return res.status(500).type('html').send(errorPage(config));
  });

  return app;
}

function checkLength(text, config) {
  if (text.length < config.minTextChars) throw new UserError('too_short', messages.tooShort);
  if (text.length > config.maxTextChars) throw new UserError('too_long', messages.tooLong(config.maxTextChars), { status: 413 });
}

// Error messages from libraries can include a URL; strip anything URL-like
// so it never lands in the logs.
function safeMessage(err) {
  return String(err && err.message ? err.message : err).replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]').slice(0, 300);
}

function sendError(res, err) {
  if (err instanceof UserError) {
    if (err.retryAfterSeconds) res.set('Retry-After', String(err.retryAfterSeconds));
    return res.status(err.status).json({ error: err.message, code: err.code, retryAfterSeconds: err.retryAfterSeconds });
  }
  return res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'server_error' });
}
