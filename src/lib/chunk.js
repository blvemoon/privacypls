// Splits long text into pieces of at most `size` characters, breaking at
// paragraph or sentence boundaries where possible. Neighbouring pieces overlap
// slightly so a sentence cut at a boundary still appears whole in one piece.
export function chunkText(text, size, overlap = 400) {
  if (text.length <= size) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const minBreak = Math.floor(size * 0.6);
      let cut = window.lastIndexOf('\n\n');
      if (cut < minBreak) cut = window.lastIndexOf('\n');
      if (cut < minBreak) cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
      if (cut >= minBreak) end = start + cut + 1;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}
