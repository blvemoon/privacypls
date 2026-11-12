// Minimal logger. RULE: never pass submitted text, URLs, IP addresses, or
// anything else that could identify a visitor or what they looked up.
// Log event names and numbers only.
function write(level, event, fields = {}) {
  if (process.env.NODE_ENV === 'test' && !process.env.LOG_IN_TESTS) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const log = {
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields),
};
