import { layout, esc } from './layout.js';

export function homePage(config) {
  const minutes = config.rateLimitSeconds >= 120
    ? `${Math.round(config.rateLimitSeconds / 60)} minutes`
    : `${config.rateLimitSeconds} seconds`;
  const passwordField = config.accessPassword ? `
      <div class="field">
        <label for="password">Access password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <p class="hint">This tool is in private testing.</p>
      </div>` : '';
  const donate = config.donationUrl
    ? `<p class="support-note">Found this useful? <a href="${esc(config.donationUrl)}" target="_blank" rel="noopener noreferrer">Help cover running costs ↗</a> (optional).</p>`
    : '';

  const body = `
<section class="intro">
  <h1>Spot red flags in privacy policies and terms</h1>
  <p class="lede">Enter a link or paste the text. We'll point out potentially concerning language, quote it exactly, and explain why it might matter.</p>
</section>

<form id="analyze-form" class="card" novalidate>
  <div class="tabs" role="tablist" aria-label="What do you want to check?">
    <button type="button" role="tab" id="tab-url" aria-controls="panel-url" aria-selected="true" class="tab active">Website link</button>
    <button type="button" role="tab" id="tab-text" aria-controls="panel-text" aria-selected="false" class="tab" tabindex="-1">Paste text</button>
  </div>

  <div id="panel-url" role="tabpanel" aria-labelledby="tab-url" class="panel">
    <label for="url">Link to a privacy policy or terms page</label>
    <input id="url" name="url" type="url" inputmode="url" placeholder="https://example.com/privacy" autocomplete="off" spellcheck="false">
    <p class="hint">Some sites block automated reading or only show text with JavaScript. If that happens, paste the text instead.</p>
  </div>

  <div id="panel-text" role="tabpanel" aria-labelledby="tab-text" class="panel" hidden>
    <label for="text">Policy or terms text</label>
    <textarea id="text" name="text" rows="12" maxlength="${config.maxTextChars}" placeholder="Paste the full text here"></textarea>
    <p class="hint"><span id="char-count">0</span> / ${config.maxTextChars.toLocaleString('en-US')} characters</p>
  </div>

  <div class="hp" aria-hidden="true">
    <label for="website">Leave this field empty</label>
    <input id="website" name="website" type="text" tabindex="-1" autocomplete="off">
  </div>
  ${passwordField}

  <div class="field" id="bot-check"${config.botCheckEnabled ? '' : ' hidden'}></div>

  <div class="actions">
    <button type="submit" id="submit" class="primary">Analyze</button>
    <a class="submission-link" href="/privacy">How we handle your submission</a>
  </div>
  <p class="hint">One analysis every ${esc(minutes)} per visitor. Results take up to a minute.</p>
  <p class="coming-soon"><span class="badge">Coming soon</span> Deeper analysis with Claude Sonnet, a more capable model.</p>
</form>

<div id="status" class="status" role="status" aria-live="polite"></div>

<section id="results" class="results" hidden aria-labelledby="results-title">
  <h2 id="results-title">Results</h2>
  <div class="disclaimer" role="note">
    <strong>These are potential flags, not legal advice.</strong> They are AI-generated and may be wrong or incomplete. This tool is a quick first pass, so there may be other risks it doesn't catch. Read the full document before you rely on it.
  </div>
  <div class="risk-row">
    <div id="risk" class="risk"></div>
    <p id="source-line" class="source-line"></p>
  </div>
  <p id="summary" class="summary"></p>
  <h3 id="flags-title">Flagged language</h3>
  <ol id="flags" class="flags"></ol>
  <p id="no-flags" class="no-flags" hidden>No language matching our red-flag rules was found. That doesn't guarantee the document is harmless.</p>
  <p id="dropped-note" class="hint" hidden></p>
  ${donate}
</section>
`;
  return layout(config, {
    title: '',
    body,
    styles: config.botCheckEnabled ? ['/vendor/altcha/altcha.css'] : [],
    scripts: [...(config.botCheckEnabled ? ['/vendor/altcha/altcha.js'] : []), '/static/js/app.js'],
    bodyAttrs: `data-bot-check="${config.botCheckEnabled ? 'on' : 'off'}" data-max-chars="${config.maxTextChars}" data-min-chars="${config.minTextChars}"`,
  });
}

export function privacyPage(config) {
  const feedback = config.feedback
    ? `<p>You can contact me at <a href="${esc(config.feedback.href)}"${config.feedback.kind === 'link' ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(config.feedback.value)}</a>. If you use a form or email service, that service handles your message under its own policies.</p>`
    : '<p>A contact option isn\'t available yet. This page will be updated when one is added.</p>';
  const donation = config.donationUrl
    ? `<p>The "Support this project" link goes to <a href="${esc(config.donationUrl)}" target="_blank" rel="noopener noreferrer">a donation page</a> on another site. Anything you do there is handled by that site and its payment providers under their own policies. Nothing about donations is shared with this site beyond what the donation service shows its account holder.</p>`
    : '';
  const gate = config.accessPassword
    ? '<p>While the tool is in private testing, an access password is checked with each analysis request. It isn\'t stored.</p>'
    : '';
  const body = `
<article class="prose">
<h1>Privacy policy</h1>
<p class="fine">Last updated: ${esc(config.privacyLastUpdated)}</p>
<p>${esc(config.siteName)} is a small independent tool. This page explains, in plain English, exactly what happens to what you submit. The short version: <strong>we don't store what you submit, we don't use cookies, and we don't track you.</strong></p>

<h2>What you submit</h2>
<p>When you click Analyze, the text you pasted, or the text of the page at the link you entered, is sent to our server and then to Anthropic's API, where Claude (an AI model) analyzes it. When the result comes back, we send it to your browser and discard the text and the link. They are not saved to a database, a file, or our logs.</p>
<p>If you enter a link, our server fetches that page itself. The website you link to sees a request from our server, not from your device.</p>
<p>Don't paste anything personal or confidential, like your own account details. The tool is meant for public documents.</p>

<h2>Anthropic</h2>
<p>Anthropic processes the submitted text to produce the analysis. How Anthropic handles data sent to its API is described in <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">Anthropic's privacy policy</a>.</p>

<h2>What we do store</h2>
<p>To keep running costs under control, we keep daily totals of how many analyses ran, how many AI "tokens" they used, and the estimated cost. These totals contain no text, no links, and nothing about who ran them.</p>

<h2>Rate limiting and bot protection</h2>
<p>To stop abuse, each visitor can run one analysis every few minutes. To do this, our app turns your IP address into a scrambled code using a secret key that changes every few hours. The code is kept only in the server's memory and is deleted when your waiting period ends. Your IP address itself is not stored by the app.</p>
<p>Our web server also limits how fast requests can arrive. It tracks visitor addresses in memory for this, and its logs are set up to record no IP addresses and no links you look up.</p>
<p>Before each analysis, your browser solves a small puzzle that is hard for bots to do in bulk (this is ALTCHA, which runs entirely on this site; no outside service is contacted). There is also a hidden form field that people never fill in but some bots do.</p>
${gate}
<h2>Cookies, tracking and analytics</h2>
<p>This site sets no cookies. It loads no advertising, no third-party trackers, and no analytics. If we add simple visitor counts in the future, they will be cookie-free and self-hosted, and this page will be updated first.</p>
<p>If you switch between dark and light mode, your choice is saved in your own browser's storage so the site remembers it. It is never sent to us.</p>

<h2>Hosting</h2>
<p>The site runs on a server rented from DreamHost. Like any hosting company, DreamHost may keep standard infrastructure records (for example, network and security logs) under <a href="https://www.dreamhost.com/legal/privacy-policy/" target="_blank" rel="noopener noreferrer">its own policies</a>.</p>

<h2>Links that leave this site</h2>
${donation}
<p>Links to Anthropic, DreamHost, and other sites open those sites, which have their own privacy policies.</p>

<h2>Contact</h2>
${feedback}

<h2>Changes</h2>
<p>If what the site does changes, this page will be updated first, and the date at the top will change.</p>
</article>`;
  return layout(config, { title: 'Privacy policy', description: `How ${config.siteName} handles your submission.`, body });
}

export function aboutPage(config) {
  const support = config.donationUrl
    ? `<p>The tool costs money to run (AI analysis and hosting). If it's useful to you, you can <a href="${esc(config.donationUrl)}" target="_blank" rel="noopener noreferrer">chip in to help cover those costs ↗</a>. It's entirely optional, but greatly appreciated! Donations don't unlock anything, and this isn't a charity, so donations aren't tax-deductible.</p>`
    : '<p>The tool costs money to run (AI analysis and hosting).</p>';
  const body = `
<article class="prose">
<h1>About ${esc(config.siteName)}</h1>
<p>This is an independent project. It uses AI to flag potentially concerning language in privacy policies and terms of service. It can make mistakes, and it is not legal advice. Text you submit is sent to an AI provider (Anthropic) for analysis and is not stored by this site.</p>
<p>It's meant as a quick first pass for individuals, not a replacement for reading the document, and not for commercial or legal use. Every flag includes the exact words it's based on, so you can check it yourself.</p>
${support}
<h2>How it works</h2>
<ol>
<li>You enter a link (we fetch the page) or paste the text.</li>
<li>Claude, an AI model by Anthropic, checks the text against a list of red-flag rules, like data being sold, AI training on your data, forced arbitration, or hard-to-cancel subscriptions.</li>
<li>We check every quote against the original text and drop any that don't match.</li>
<li>You get an overall risk level, a short summary, and each flag with its quote and explanation.</li>
</ol>
<p>See the <a href="/privacy">privacy policy</a> for exactly what happens to your submission.</p>
</article>`;
  return layout(config, { title: 'About', body });
}

export function feedbackPage(config) {
  const f = config.feedback;
  const body = `
<article class="prose">
<h1>Feedback</h1>
<p>Found a wrong flag, a missed one, or a bug? I'd like to hear about it.</p>
<p><a class="button-link" href="${esc(f.href)}"${f.kind === 'link' ? ' target="_blank" rel="noopener noreferrer"' : ''}>${f.kind === 'email' ? `Email ${esc(f.value)}` : 'Open the feedback form ↗'}</a></p>
<p class="fine">Please don't include personal information you don't want to share. See the <a href="/privacy">privacy policy</a>.</p>
</article>`;
  return layout(config, { title: 'Feedback', body });
}

export function notFoundPage(config) {
  return layout(config, {
    title: 'Page not found',
    body: '<article class="prose"><h1>Page not found</h1><p>That page doesn\'t exist. <a href="/">Go to the analyzer</a>.</p></article>',
  });
}

export function errorPage(config) {
  return layout(config, {
    title: 'Something went wrong',
    body: '<article class="prose"><h1>Something went wrong</h1><p>Please try again in a moment. <a href="/">Go to the analyzer</a>.</p></article>',
  });
}
