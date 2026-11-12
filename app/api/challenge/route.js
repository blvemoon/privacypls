// GET /api/challenge: a fresh bot-check puzzle for the visitor's browser.
import { getDeps } from '../../../lib/deps.js';
import { log } from '../../../lib/log.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { botCheck } = getDeps();
    if (!botCheck.enabled) return Response.json({ error: 'Bot check is turned off.' }, { status: 404 });
    return Response.json(await botCheck.newChallenge(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    // Usually a settings problem. The message names the setting (never its
    // secret value), so it shows up in Vercel -> Logs.
    log.error('setup_problem', { message: String(err && err.message).slice(0, 200) });
    return Response.json({ error: 'Unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
