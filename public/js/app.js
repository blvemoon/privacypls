// Analyzer page: tabs, bot check, submit, and rendering results.
// All page text from the server is inserted with textContent (never innerHTML),
// so quotes from a policy can't inject markup.
const body = document.body;
const form = document.getElementById('analyze-form');
const submitBtn = document.getElementById('submit');
const statusEl = document.getElementById('status');
const results = document.getElementById('results');
const tabs = { url: document.getElementById('tab-url'), text: document.getElementById('tab-text') };
const panels = { url: document.getElementById('panel-url'), text: document.getElementById('panel-text') };
const textArea = document.getElementById('text');
const charCount = document.getElementById('char-count');
const botCheckOn = body.dataset.botCheck === 'on';
let mode = 'url';
let widget = null;

function selectTab(next, focus) {
  mode = next;
  for (const key of Object.keys(tabs)) {
    const on = key === next;
    tabs[key].classList.toggle('active', on);
    tabs[key].setAttribute('aria-selected', String(on));
    tabs[key].tabIndex = on ? 0 : -1;
    panels[key].hidden = !on;
  }
  if (focus) tabs[next].focus();
}
tabs.url.addEventListener('click', () => selectTab('url'));
tabs.text.addEventListener('click', () => selectTab('text'));
for (const tab of Object.values(tabs)) {
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      selectTab(mode === 'url' ? 'text' : 'url', true);
    }
  });
}

textArea.addEventListener('input', () => {
  charCount.textContent = textArea.value.length.toLocaleString('en-US');
});

// Bot check (ALTCHA). The widget and its worker are served by this site.
function setUpBotCheck() {
  if (!botCheckOn) return;
  if (!globalThis.$altcha) {
    showStatus('The bot check didn\'t load. Please reload the page.', 'error');
    return;
  }
  const workerUrl = '/vendor/altcha/workers/pbkdf2.js';
  for (const alg of ['PBKDF2/SHA-256', 'PBKDF2/SHA-384', 'PBKDF2/SHA-512']) {
    globalThis.$altcha.algorithms.set(alg, () => new Worker(workerUrl));
  }
  widget = document.createElement('altcha-widget');
  widget.setAttribute('challenge', '/api/challenge');
  widget.setAttribute('name', 'altcha');
  widget.setAttribute('auto', 'onfocus');
  widget.setAttribute('configuration', JSON.stringify({ hideFooter: true, hideLogo: true }));
  document.getElementById('bot-check').appendChild(widget);
}

function botPayload() {
  const input = form.querySelector('input[name="altcha"]');
  return input ? input.value : '';
}

function resetBotCheck() {
  if (widget && typeof widget.reset === 'function') widget.reset();
}

function showStatus(message, kind) {
  statusEl.textContent = message || '';
  statusEl.className = `status${kind ? ` ${kind}` : ''}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderResults(data) {
  const risk = document.getElementById('risk');
  risk.className = `risk risk-${data.riskLevel.toLowerCase()}`;
  risk.textContent = '';
  risk.append(el('span', 'risk-label', 'Overall risk'), el('span', 'risk-value', data.riskLevel));

  const sourceLine = document.getElementById('source-line');
  sourceLine.textContent = data.source.kind === 'url'
    ? `Analyzed ${data.source.title ? `"${data.source.title}" ` : ''}(${data.source.chars.toLocaleString('en-US')} characters)`
    : `Analyzed your pasted text (${data.source.chars.toLocaleString('en-US')} characters)`;
  if (data.parts > 1) sourceLine.textContent += ` in ${data.parts} parts`;

  document.getElementById('summary').textContent = data.summary;

  const list = document.getElementById('flags');
  list.textContent = '';
  for (const f of data.flags) {
    const item = el('li', `flag sev-${f.severity.toLowerCase()}`);
    const head = el('div', 'flag-head');
    head.append(
      el('span', `pill sev-${f.severity.toLowerCase()}`, `${f.severity} severity`),
      el('h4', 'flag-rule', f.ruleName),
      el('span', 'confidence', `${f.confidence} confidence`),
    );
    const quote = el('blockquote', 'flag-quote', f.quote);
    const why = el('p', 'flag-why', f.explanation);
    item.append(head, quote, why);
    list.append(item);
  }
  document.getElementById('flags-title').hidden = data.flags.length === 0;
  document.getElementById('no-flags').hidden = data.flags.length !== 0;

  const dropped = document.getElementById('dropped-note');
  dropped.hidden = !data.droppedFlags;
  dropped.textContent = data.droppedFlags
    ? `${data.droppedFlags} possible flag${data.droppedFlags === 1 ? ' was' : 's were'} left out because the quote couldn't be matched exactly to the text.`
    : '';

  results.hidden = false;
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('results-title').focus({ preventScroll: true });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    mode,
    url: mode === 'url' ? document.getElementById('url').value.trim() : undefined,
    text: mode === 'text' ? textArea.value : undefined,
    website: document.getElementById('website').value,
    password: document.getElementById('password') ? document.getElementById('password').value : undefined,
  };
  const minChars = Number(body.dataset.minChars);
  if (mode === 'url' && !payload.url) return showStatus('Please enter a link.', 'error');
  if (mode === 'text' && payload.text.trim().length < minChars) {
    return showStatus('Please paste the full policy or terms text.', 'error');
  }

  submitBtn.disabled = true;
  try {
    if (botCheckOn) {
      if (!botPayload() && widget) {
        showStatus('Running the bot check…');
        await widget.verify();
      }
      payload.altcha = botPayload();
      if (!payload.altcha) {
        showStatus('Please complete the "I\'m not a robot" check.', 'error');
        return;
      }
    }
    showStatus(mode === 'url' ? 'Reading the page and analyzing… this can take up to a minute.' : 'Analyzing… this can take up to a minute.');
    results.hidden = true;
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let data = null;
    try { data = await res.json(); } catch { /* handled below */ }
    if (!res.ok || !data) {
      showStatus((data && data.error) || 'Something went wrong. Please try again.', 'error');
      return;
    }
    showStatus('');
    renderResults(data);
  } catch {
    showStatus('Couldn\'t reach the server. Check your connection and try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    resetBotCheck();
  }
});

document.getElementById('results-title').tabIndex = -1;
setUpBotCheck();
