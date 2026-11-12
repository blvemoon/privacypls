// Shared page shell: head, header with theme toggle, footer with the privacy,
// about, feedback (when on) and support (when on) links.
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function layout(config, { title, description = '', body, scripts = [], styles = [], bodyAttrs = '' }) {
  const fullTitle = title ? `${title} · ${config.siteName}` : config.siteName;
  const feedbackLink = config.feedback ? '<a href="/feedback">Feedback</a>' : '';
  const donateLink = config.donationUrl
    ? `<a href="${esc(config.donationUrl)}" target="_blank" rel="noopener noreferrer">Support this project ↗</a>`
    : '';
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || 'Paste a privacy policy or terms of service, or enter a link, and see potential red flags with exact quotes.')}">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark light">
<script src="/static/js/theme.js"></script>
<link rel="stylesheet" href="/static/css/style.css">
${styles.map((s) => `<link rel="stylesheet" href="${esc(s)}">`).join('\n')}
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body ${bodyAttrs}>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">◆</span> ${esc(config.siteName)}</a>
    <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Switch to light mode">Light mode</button>
  </div>
</header>
<main id="main" class="wrap">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-row">
    <nav aria-label="Footer">
      <a href="/privacy">Privacy policy</a>
      <a href="/about">About</a>
      ${feedbackLink}
      ${donateLink}
    </nav>
    <p class="fine">Results are AI-generated potential flags, not legal advice.</p>
  </div>
</footer>
${scripts.map((s) => `<script type="module" src="${esc(s)}"></script>`).join('\n')}
</body>
</html>`;
}
