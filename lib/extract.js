// Turns a web page into readable plain text, keeping paragraph breaks.
import * as cheerio from 'cheerio';

const REMOVE = [
  'script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'template', 'object', 'embed',
  'nav', 'header', 'footer', 'aside', 'form', 'button', 'select', 'input', 'textarea',
  '[hidden]', '[aria-hidden="true"]', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
].join(',');

const BLOCKS = 'p,div,section,article,main,li,ul,ol,dl,dt,dd,h1,h2,h3,h4,h5,h6,tr,table,blockquote,pre,address,figure,figcaption,details,summary';

export function cleanText(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function textOf($, root) {
  root.find('br').replaceWith('\n');
  root.find(BLOCKS).each((_, el) => {
    $(el).prepend('\n');
    $(el).append('\n');
  });
  root.find('td,th').each((_, el) => { $(el).append(' '); });
  return cleanText(root.text());
}

// Returns { title, text }.
export function extractFromHtml(html) {
  const $ = cheerio.load(html);
  const title = cleanText($('title').first().text()).slice(0, 300);
  $(REMOVE).remove();

  // Prefer the main content area when the page marks one and it has real text.
  const candidates = ['main', '[role="main"]', 'article', '#content', '.content'];
  for (const sel of candidates) {
    const el = $(sel).first();
    if (el.length) {
      const text = textOf($, el.clone());
      if (text.length >= 500) return { title, text };
    }
  }
  const body = $('body').length ? $('body') : $.root();
  return { title, text: textOf($, body) };
}

export function extractFromResponse({ contentType, text }) {
  const mime = String(contentType || '').split(';')[0].trim();
  if (mime === 'text/plain') return { title: '', text: cleanText(text) };
  return extractFromHtml(text);
}
