// Errors that carry a friendly message for the visitor. Anything else is shown
// as a generic "something went wrong" message and never leaks details.
export class UserError extends Error {
  constructor(code, message, { status = 400, retryAfterSeconds } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const messages = {
  invalidUrl: 'That doesn\'t look like a web address. Please enter a full link, like https://example.com/privacy.',
  blockedUrl: 'That address can\'t be fetched. Only public websites on the standard web ports are allowed.',
  fetchFailed: 'We couldn\'t load that page. The site may be down or blocking automated requests. Try copying the text and pasting it instead.',
  fetchTimeout: 'That page took too long to load. Try again later, or copy the text and paste it instead.',
  fetchBlocked: 'That site refused our request (it may block automated tools). Try copying the policy text and pasting it instead.',
  notFound: 'That page wasn\'t found (error 404). Please check the link.',
  tooLarge: 'That page is too large to read. Try copying just the policy text and pasting it instead.',
  unsupportedType: 'That link isn\'t a regular web page (it may be a PDF or a file). Try copying the text and pasting it instead.',
  emptyPage: 'We couldn\'t find readable text on that page. It may need JavaScript to show its content. Try copying the text and pasting it instead.',
  tooShort: 'That\'s too short to analyze. Please paste the full policy or terms text.',
  tooLong: (max) => `That text is too long (the limit is about ${max.toLocaleString('en-US')} characters). Try pasting one section at a time.`,
  rateLimited: (secs) => `You can run one analysis every ${Math.ceil(secs / 60) >= 2 ? `${Math.ceil(secs / 60)} minutes` : `${secs} seconds`}. Please try again shortly.`,
  busy: 'We\'re busy, please try again shortly.',
  budget: 'This month\'s analysis limit has been reached. Please try again next month.',
  aiUnavailable: 'The analysis service is temporarily unavailable. Please try again in a few minutes.',
  aiBadOutput: 'The analysis didn\'t come back in a usable form. Please try again.',
  botCheck: 'Please complete the "I\'m not a robot" check and try again.',
  password: 'That password isn\'t right.',
  badRequest: 'Something about that request wasn\'t right. Please reload the page and try again.',
};
