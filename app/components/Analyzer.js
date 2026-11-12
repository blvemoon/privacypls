'use client';
// The analyzer form, the results, and the dialog shown when something fails.
// Text from the server (including quotes from policies) is always rendered as
// plain text by React, so a policy can't inject markup into the page.
import { useCallback, useEffect, useRef, useState } from 'react';

const RISK_CLASS = { High: 'risk-high', Medium: 'risk-medium', Low: 'risk-low' };

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export default function Analyzer({ botCheckEnabled, passwordRequired, maxTextChars, minTextChars, rateLimitSeconds, donationUrl }) {
  const [mode, setMode] = useState('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null); // { title, error, retry, until }
  const [waitUntil, setWaitUntil] = useState(0); // the Analyze button stays off until then
  const [botReady, setBotReady] = useState(!botCheckEnabled);

  const formRef = useRef(null);
  const honeypotRef = useRef(null);
  const widgetHost = useRef(null);
  const widgetRef = useRef(null);
  const dialogRef = useRef(null);
  const resultsTitle = useRef(null);
  const tabRefs = { url: useRef(null), text: useRef(null) };

  const now = useNow(waitUntil > Date.now() || Boolean(failure?.until));
  const secondsLeft = Math.max(0, Math.ceil((waitUntil - now) / 1000));
  const waiting = secondsLeft > 0;

  // Set up the bot check once the ALTCHA script (served by this site) has loaded.
  useEffect(() => {
    if (!botCheckEnabled) return undefined;
    let cancelled = false;
    customElements.whenDefined('altcha-widget').then(() => {
      if (cancelled || widgetRef.current || !widgetHost.current) return;
      const workerUrl = '/vendor/altcha/workers/pbkdf2.js';
      if (globalThis.$altcha?.algorithms) {
        for (const alg of ['PBKDF2/SHA-256', 'PBKDF2/SHA-384', 'PBKDF2/SHA-512']) {
          globalThis.$altcha.algorithms.set(alg, () => new Worker(workerUrl));
        }
      }
      const w = document.createElement('altcha-widget');
      w.setAttribute('challenge', '/api/challenge');
      w.setAttribute('name', 'altcha');
      w.setAttribute('auto', 'onfocus');
      w.setAttribute('configuration', JSON.stringify({ hideFooter: true, hideLogo: true }));
      widgetHost.current.appendChild(w);
      widgetRef.current = w;
      setBotReady(true);
    });
    return () => { cancelled = true; };
  }, [botCheckEnabled]);

  // Open or close the failure dialog.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (failure && !d.open) d.showModal();
    if (!failure && d.open) d.close();
  }, [failure]);

  const selectTab = useCallback((next, focus) => {
    setMode(next);
    if (focus) tabRefs[next].current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function botPayload() {
    const input = formRef.current?.querySelector('input[name="altcha"]');
    return input ? input.value : '';
  }

  function showFailure(data) {
    const retry = data.retry || 'now';
    const until = retry === 'wait' && data.retryAfterSeconds ? Date.now() + data.retryAfterSeconds * 1000 : 0;
    if (until) setWaitUntil(until);
    setFailure({
      title: data.title || 'Couldn\'t run the analysis',
      error: data.error || 'Something went wrong. Please try again.',
      retry,
      until,
    });
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (busy || waiting) return;
    if (mode === 'url' && !url.trim()) {
      showFailure({ title: 'Please check what you entered', error: 'Please enter a link to a privacy policy or terms page.', retry: 'now' });
      return;
    }
    if (mode === 'text' && text.trim().length < minTextChars) {
      showFailure({
        title: 'Please check what you entered',
        error: `That's too short to analyze (${text.trim().length.toLocaleString('en-US')} characters; at least ${minTextChars.toLocaleString('en-US')} needed). Please paste the full policy or terms text.`,
        retry: 'now',
      });
      return;
    }
    setBusy(true);
    try {
      let altcha;
      if (botCheckEnabled) {
        if (!botPayload() && widgetRef.current) {
          setStatus('Running the bot check…');
          await widgetRef.current.verify();
        }
        altcha = botPayload();
        if (!altcha) {
          showFailure({ title: 'Please check what you entered', error: 'Please complete the "I\'m not a robot" check.', retry: 'now' });
          return;
        }
      }
      setStatus(mode === 'url' ? 'Reading the page and analyzing… this can take up to a minute.' : 'Analyzing… this can take up to a minute.');
      setResult(null);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          url: mode === 'url' ? url.trim() : undefined,
          text: mode === 'text' ? text : undefined,
          website: honeypotRef.current?.value || '',
          password: passwordRequired ? password : undefined,
          altcha,
        }),
      });
      let data = null;
      try { data = await res.json(); } catch { /* handled below */ }
      setStatus('');
      if (!res.ok || !data) {
        showFailure(data || { error: 'Something went wrong. Please try again.', retry: 'now' });
        return;
      }
      setResult(data);
      setWaitUntil(Date.now() + (data.nextAnalysisInSeconds || rateLimitSeconds) * 1000);
      requestAnimationFrame(() => {
        resultsTitle.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        resultsTitle.current?.focus({ preventScroll: true });
      });
    } catch {
      setStatus('');
      showFailure({ title: 'Something went wrong', error: 'Couldn\'t reach the server. Check your connection and try again.', retry: 'now' });
    } finally {
      setBusy(false);
      if (widgetRef.current && typeof widgetRef.current.reset === 'function') widgetRef.current.reset();
    }
  }

  const minutesLabel = rateLimitSeconds >= 120 ? `${Math.round(rateLimitSeconds / 60)} minutes` : `${rateLimitSeconds} seconds`;
  const failureSecondsLeft = failure?.until ? Math.max(0, Math.ceil((failure.until - now) / 1000)) : 0;

  let buttonLabel = 'Analyze';
  if (busy) buttonLabel = 'Analyzing…';
  else if (waiting) buttonLabel = `Next analysis in ${formatClock(secondsLeft)}`;

  return (
    <>
      <form ref={formRef} className="card" noValidate onSubmit={onSubmit}>
        <div className="tabs" role="tablist" aria-label="What do you want to check?">
          {[['url', 'Website link'], ['text', 'Paste text']].map(([key, label]) => (
            <button
              key={key}
              ref={tabRefs[key]}
              type="button"
              role="tab"
              id={`tab-${key}`}
              aria-controls={`panel-${key}`}
              aria-selected={mode === key}
              tabIndex={mode === key ? 0 : -1}
              className={`tab${mode === key ? ' active' : ''}`}
              onClick={() => selectTab(key)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  selectTab(mode === 'url' ? 'text' : 'url', true);
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div id="panel-url" role="tabpanel" aria-labelledby="tab-url" className="panel" hidden={mode !== 'url'}>
          <label htmlFor="url">Link to a privacy policy or terms page</label>
          <input id="url" name="url" type="url" inputMode="url" placeholder="https://example.com/privacy" autoComplete="off" spellCheck="false" value={url} onChange={(e) => setUrl(e.target.value)} />
          <p className="hint">Some sites block automated reading or only show text with JavaScript. If that happens, paste the text instead.</p>
        </div>

        <div id="panel-text" role="tabpanel" aria-labelledby="tab-text" className="panel" hidden={mode !== 'text'}>
          <label htmlFor="text">Policy or terms text</label>
          <textarea id="text" name="text" rows={12} maxLength={maxTextChars} placeholder="Paste the full text here" value={text} onChange={(e) => setText(e.target.value)} />
          <p className="hint">{text.length.toLocaleString('en-US')} / {maxTextChars.toLocaleString('en-US')} characters</p>
        </div>

        {/* Honeypot: hidden from people, sometimes filled in by bots. */}
        <div className="hp" aria-hidden="true">
          <label htmlFor="website">Leave this field empty</label>
          <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" ref={honeypotRef} defaultValue="" />
        </div>

        {passwordRequired ? (
          <div className="field">
            <label htmlFor="password">Access password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="hint">This tool is in private testing.</p>
          </div>
        ) : null}

        {botCheckEnabled ? <div className="field" ref={widgetHost} id="bot-check" /> : null}

        <div className="actions">
          <button type="submit" className="primary" disabled={busy || waiting || !botReady} aria-live="polite">{buttonLabel}</button>
          <a className="submission-link" href="/privacy">How we handle your submission</a>
        </div>
        <p className="hint">One analysis every {minutesLabel} per visitor. Results take up to a minute.</p>
        <p className="coming-soon"><span className="badge">Coming soon</span> Deeper analysis with Claude Sonnet, a more capable model.</p>
      </form>

      <div className="status" role="status" aria-live="polite">{status}</div>

      {result ? (
        <section className="results" aria-labelledby="results-title">
          <h2 id="results-title" ref={resultsTitle} tabIndex={-1}>Results</h2>
          <div className="disclaimer" role="note">
            <strong>These are potential flags, not legal advice.</strong> They are AI-generated and may be wrong or incomplete. This tool is a quick first pass, so there may be other risks it doesn&apos;t catch. Read the full document before you rely on it.
          </div>
          <div className="risk-row">
            <div className={`risk ${RISK_CLASS[result.riskLevel] || ''}`}>
              <span className="risk-label">Overall risk</span>
              <span className="risk-value">{result.riskLevel}</span>
            </div>
            <p className="source-line">
              {result.source.kind === 'url'
                ? `Analyzed ${result.source.title ? `"${result.source.title}" ` : ''}(${result.source.chars.toLocaleString('en-US')} characters)`
                : `Analyzed your pasted text (${result.source.chars.toLocaleString('en-US')} characters)`}
              {result.parts > 1 ? ` in ${result.parts} parts` : ''}
            </p>
          </div>
          <p className="summary">{result.summary}</p>
          {result.flags.length ? (
            <>
              <h3>Flagged language</h3>
              <ol className="flags">
                {result.flags.map((f, i) => (
                  <li key={`${f.ruleId}-${i}`} className={`flag sev-${f.severity.toLowerCase()}`}>
                    <div className="flag-head">
                      <span className={`pill sev-${f.severity.toLowerCase()}`}>{f.severity} severity</span>
                      <h4 className="flag-rule">{f.ruleName}</h4>
                      <span className="confidence">{f.confidence} confidence</span>
                    </div>
                    <blockquote className="flag-quote">{f.quote}</blockquote>
                    <p className="flag-why">{f.explanation}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="no-flags">No language matching our red-flag rules was found. That doesn&apos;t guarantee the document is harmless.</p>
          )}
          {result.droppedFlags ? (
            <p className="hint">{result.droppedFlags} possible flag{result.droppedFlags === 1 ? ' was' : 's were'} left out because the quote couldn&apos;t be matched exactly to the text.</p>
          ) : null}
          {donationUrl ? (
            <p className="support-note">Found this useful? <a href={donationUrl} target="_blank" rel="noopener noreferrer">Help cover running costs ↗</a> (optional).</p>
          ) : null}
        </section>
      ) : null}

      <dialog
        ref={dialogRef}
        className={`notice notice-${failure?.retry || 'now'}`}
        aria-labelledby="notice-title"
        aria-describedby="notice-body"
        onClose={() => setFailure(null)}
      >
        {failure ? (
          <form method="dialog">
            <h2 id="notice-title">{failure.title}</h2>
            <p id="notice-body">{failure.error}</p>
            <p className="notice-retry">
              {failure.retry === 'now' ? 'You can try again now.' : null}
              {failure.retry === 'wait'
                ? (failureSecondsLeft > 0 ? <>You can try again in <strong>{formatClock(failureSecondsLeft)}</strong>.</> : 'You can try again now.')
                : null}
              {failure.retry === 'next_month' ? 'New analyses will be available at the start of next month (UTC).' : null}
            </p>
            <div className="notice-actions">
              <button type="submit" className="primary" autoFocus>OK</button>
            </div>
          </form>
        ) : null}
      </dialog>
    </>
  );
}
