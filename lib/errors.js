// Errors that carry a friendly message for the visitor, plus whether they can
// try again right away. See "When an analysis fails" in PLAN.md.
//   retry: 'now'        -> they can try again immediately
//          'wait'       -> they must wait retryAfterSeconds (a countdown is shown)
//          'next_month' -> the monthly limit is reached
export class UserError extends Error {
  constructor(code, message, { status = 400, retry = 'now', retryAfterSeconds, title } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retry = retry;
    this.title = title || 'Couldn\'t run the analysis';
    if (retryAfterSeconds !== undefined) this.retryAfterSeconds = retryAfterSeconds;
  }
}

const minutes = (secs) => {
  const m = Math.round(secs / 60);
  return secs >= 120 ? `${m} minutes` : secs >= 60 ? '1 minute' : `${secs} seconds`;
};

export const messages = {
  invalidUrl: 'That doesn\'t look like a web address. Please enter a full link, like https://example.com/privacy.',
  blockedUrl: 'That address can\'t be checked. Only public websites on the standard web ports are allowed.',
  fetchFailed: 'We couldn\'t load that page. The site may be down or blocking automated requests. Try copying the text and pasting it instead.',
  fetchTimeout: 'That page took too long to load. Try again later, or copy the text and paste it instead.',
  fetchBlocked: 'That site refused our request (it may block automated tools). Try copying the policy text and pasting it instead.',
  notFound: 'That page wasn\'t found (error 404). Please check the link.',
  tooLarge: 'That page is too large to read. Try copying just the policy text and pasting it instead.',
  unsupportedType: 'That link isn\'t a regular web page (it may be a PDF or a file). Try copying the text and pasting it instead.',
  emptyPage: 'We couldn\'t find readable text on that page. It may need JavaScript to show its content. Try copying the text and pasting it instead.',
  tooShort: (min, got) => `That's too short to analyze (${got.toLocaleString('en-US')} characters; at least ${min.toLocaleString('en-US')} needed). Please paste the full policy or terms text.`,
  tooLong: (max, got) => got
    ? `That text is too long: ${got.toLocaleString('en-US')} characters, and the limit is ${max.toLocaleString('en-US')}. Try pasting one section at a time.`
    : `That text is too long (the limit is ${max.toLocaleString('en-US')} characters). Try pasting one section at a time.`,
  rateLimited: (secs) => `You can run one analysis every ${minutes(secs)}. You can start another when the timer runs out.`,
  busy: 'We\'re busy, please try again shortly.',
  budget: 'This month\'s analysis limit has been reached. Please try again next month.',
  aiUnavailable: 'The analysis service had a problem and nothing was charged. You can try again now.',
  aiFailedAfterCharge: 'Something went wrong after part of the analysis had already been paid for. To protect the site\'s budget, please wait before trying again.',
  serviceUnavailable: 'The service is temporarily unavailable. Please try again in a few minutes.',
  botCheck: 'Please complete the "I\'m not a robot" check and try again.',
  password: 'That password isn\'t right.',
  badRequest: 'Something about that request wasn\'t right. Please reload the page and try again.',
};

export const titles = {
  input: 'Please check what you entered',
  page: 'We couldn\'t read that page',
  wait: 'Please wait a moment',
  limit: 'Monthly limit reached',
  service: 'Something went wrong',
};
