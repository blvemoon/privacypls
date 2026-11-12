// GET /api/challenge: a fresh bot-check puzzle for the visitor's browser.
import { getDeps } from '../../../lib/deps.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { botCheck } = getDeps();
    if (!botCheck.enabled) return Response.json({ error: 'Bot check is turned off.' }, { status: 404 });
    return Response.json(await botCheck.newChallenge(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
