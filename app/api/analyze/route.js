// POST /api/analyze: runs one analysis. The logic lives in lib/analyzeRequest.js.
import { getDeps } from '../../../lib/deps.js';
import { handleAnalyze, errorBody } from '../../../lib/analyzeRequest.js';
import { visitorIp } from '../../../lib/requestIp.js';
import { UserError, messages, titles } from '../../../lib/errors.js';
import { log } from '../../../lib/log.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Long documents are analyzed in parts; allow up to Vercel Hobby's maximum.
export const maxDuration = 300;

export async function POST(request) {
  let result;
  try {
    const deps = getDeps();
    result = await handleAnalyze(request, { deps, ip: visitorIp(request) });
  } catch (err) {
    // A settings problem (for example HASH_SECRET missing). Fail closed.
    log.error('setup_problem', { message: String(err && err.message).slice(0, 200) });
    result = errorBody(new UserError('service_unavailable', messages.serviceUnavailable, { status: 503, title: titles.service }));
  }
  const headers = { 'Cache-Control': 'no-store' };
  if (result.body.retry === 'wait' && result.body.retryAfterSeconds) headers['Retry-After'] = String(result.body.retryAfterSeconds);
  return Response.json(result.body, { status: result.status, headers });
}
