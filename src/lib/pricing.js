// Works out the cost of a request from token counts and config/pricing.json.
import fs from 'node:fs';

export function loadPricing(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data || typeof data.models !== 'object') throw new Error(`Pricing file ${file} must have a "models" object.`);
  return data.models;
}

export function priceFor(pricing, model) {
  const p = pricing[model];
  if (!p) throw new Error(`No price is set for model "${model}" in the pricing file. Add it before using this model.`);
  return p;
}

// Input tokens include everything sent in the prompt (cache reads/writes are
// not used by this app).
export function costUsd(pricing, model, inputTokens, outputTokens) {
  const p = priceFor(pricing, model);
  const long = p.longPromptThreshold && inputTokens > p.longPromptThreshold;
  const inRate = long ? p.longPromptInput : p.input;
  const outRate = long ? p.longPromptOutput : p.output;
  return (inputTokens * inRate + outputTokens * outRate) / 1_000_000;
}

// Rough upper estimate used to reserve budget before a call. Assumes about
// 3 characters per token (deliberately pessimistic) plus the full output allowance.
export function estimateCostUsd(pricing, model, promptChars, maxOutputTokens) {
  const inputTokens = Math.ceil(promptChars / 3);
  return costUsd(pricing, model, inputTokens, maxOutputTokens);
}
