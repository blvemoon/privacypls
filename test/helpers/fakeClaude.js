// A simulated Claude client for tests. It mimics the Messages API shape and
// "finds" red flags with simple keyword matching, quoting sentences exactly.
// It is NOT a stand-in for real quality testing; see `npm run compare` for that.

const PATTERNS = {
  'data-sold-shared': [/\b(sell|rent)\b.*\b(information|data)\b/i, /\bshare\b.*\b(advertis|insurance|partners)/i],
  'ai-training': [/\btrain\b.*\b(ai|artificial intelligence|machine learning|models?)\b/i],
  'tracking-profiling': [/\b(fingerprint\w*|pixels?|track\w*)\b.*\b(across|profile|other websites)/i],
  'tos-arbitration': [/\barbitration\b/i],
  'tos-content-license': [/\b(perpetual|irrevocable)\b.*\blicense\b/i],
  'indefinite-retention': [/\b(as long as|indefinitely)\b/i],
  'one-sided-changes': [/\bchange\b.*\b(without notice|whenever we want|at any time without)/i, /will not notify you of changes/i],
  'vague-purpose': [/\bany business purpose\b/i],
  'sensitive-data': [/\b(biometric|heart rate|fingerprint data|gps location|precise location|call logs|text messages)\b/i],
  'hard-opt-out': [/\bnotarized\b/i, /\bdo not offer a way to opt out\b/i],
  'cross-border': [/\bany country\b/i],
  'forced-consent': [/\bby wearing\b.*\bconsent\b/i],
  'tos-auto-renewal': [/\brenews automatically\b/i, /\bnon-refundable\b/i],
  'tos-license-only': [/\brevocable\b.*\blicense\b/i],
  'tos-liability': [/\bnot responsible\b/i, /\bliability\b.*\bexceed\b/i],
};
const NEGATIONS = /\b(never|do not|don't|not)\s+(sell|rent|share|use)/i;

function sentences(doc) {
  return doc.split(/\n+|(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 10);
}

export function fakeFindings(doc, rules) {
  const flags = [];
  for (const rule of rules) {
    const patterns = PATTERNS[rule.id];
    if (!patterns) continue;
    const hit = sentences(doc).find((s) => patterns.some((p) => p.test(s)) && !NEGATIONS.test(s));
    if (!hit) continue;
    let severity = rule.severity;
    if (rule.escalation && /\bdo not offer a way to opt out\b/i.test(doc)) severity = rule.escalation.to;
    flags.push({ rule_id: rule.id, quote: hit, explanation: `This text may raise a ${rule.name.toLowerCase()} concern.`, severity, confidence: 'High' });
  }
  return flags;
}

export function createFakeClaude({ rules, failWith = null, noTool = false, extraFlags = [], usage = { input_tokens: 5000, output_tokens: 800 } } = {}) {
  const calls = [];
  return {
    calls,
    messages: {
      async create(params) {
        calls.push(params);
        if (failWith) {
          const err = new Error('simulated API failure');
          err.status = failWith;
          throw err;
        }
        if (noTool) return { content: [{ type: 'text', text: 'I cannot do that.' }], stop_reason: 'end_turn', usage };
        const toolName = params.tool_choice.name;
        if (toolName === 'write_summary') {
          return { content: [{ type: 'tool_use', name: 'write_summary', input: { summary: 'Combined summary of all parts.' } }], stop_reason: 'tool_use', usage: { input_tokens: 600, output_tokens: 80 } };
        }
        const doc = /<document>\n([\s\S]*)\n<\/document>/.exec(params.messages[0].content)[1];
        const flags = [...fakeFindings(doc, rules), ...extraFlags];
        const summary = flags.length ? 'This document contains several potentially concerning terms.' : 'This document looks reasonably protective of your privacy.';
        return { content: [{ type: 'tool_use', name: 'report_findings', input: { summary, flags } }], stop_reason: 'tool_use', usage };
      },
    },
  };
}
