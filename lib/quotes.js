// Checks that a quote returned by the model really appears in the source text.
// Matching ignores case, whitespace differences, and curly-vs-straight quotes
// and dashes, but otherwise requires the exact words.
export function normalizeForMatch(s) {
  return String(s)
    .normalize('NFKC')
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Returns true when every part of the quote (split on "..." if the model
// shortened it) appears in the source, in order.
export function quoteAppearsIn(quote, normalizedSource) {
  const q = normalizeForMatch(quote).replace(/^["']+|["']+$/g, '').trim();
  if (q.length < 8) return false;
  const parts = q.split(/\s*\.\.\.\s*|\s*\[\.\.\.\]\s*/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return false;
  if (parts.length > 1 && parts.some((p) => p.length < 8)) return false;
  let from = 0;
  for (const part of parts) {
    const idx = normalizedSource.indexOf(part, from);
    if (idx === -1) return false;
    from = idx + part.length;
  }
  return true;
}
