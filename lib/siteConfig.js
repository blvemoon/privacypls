// The settings pages need for display. Never throws: if a setting is broken,
// pages still render (analyses are refused separately, by the API).
import { loadConfig } from './config.js';

export function siteConfig() {
  try {
    const c = loadConfig();
    return {
      siteName: c.siteName,
      donationUrl: c.donationUrl,
      feedback: c.feedback,
      passwordRequired: Boolean(c.accessPassword),
      botCheckEnabled: c.botCheckEnabled,
      maxTextChars: c.maxTextChars,
      minTextChars: c.minTextChars,
      rateLimitSeconds: c.rateLimitSeconds,
      privacyLastUpdated: c.privacyLastUpdated,
    };
  } catch {
    return {
      siteName: 'privacypls.io', donationUrl: '', feedback: null, passwordRequired: false, botCheckEnabled: true,
      maxTextChars: 150000, minTextChars: 200, rateLimitSeconds: 120, privacyLastUpdated: '',
    };
  }
}
