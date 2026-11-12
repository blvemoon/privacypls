// Works out the cost of a request from token counts and config/pricing.json.
import pricingFile from '../config/pricing.json' with { type: 'json' };

export const pricing = pricingFile.models;

export function priceFor(prices, model) {
  const p = prices[model];
  if (!p) throw new Error(`No price is set for model "${model}" in config/pricing.json. Add it before using this model.`);
  return p;
}

export function costUsd(prices, model, inputTokens, outputTokens) {
  const p = priceFor(prices, model);
  const long = p.longPromptThreshold && inputTokens > p.longPromptThreshold;
  const inRate = long ? p.longPromptInput : p.input;
  const outRate = long ? p.longPromptOutput : p.output;
  return (inputTokens * inRate + outputTokens * outRate) / 1_000_000;
}

// The most a request could cost: the counted input plus a 10% safety margin
// (Anthropic says counts can differ slightly from billing), plus the full
// output allowance.
export function worstCaseUsd(prices, model, countedInputTokens, maxOutputTokens) {
  return costUsd(prices, model, Math.ceil(countedInputTokens * 1.1) + 50, maxOutputTokens);
}
