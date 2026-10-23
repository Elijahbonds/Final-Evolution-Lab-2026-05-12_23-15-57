/**
 * GET /api/feel-panel — may this user open the feel panel? (feel-panel lane, owner 2026-10-20; docs/FEEL-PANEL.md)
 *
 * { enabled: true } only when the server flag FEEL_PANEL_ENABLED is on (lib/flags.ts, default OFF) AND the session's user is
 *   - on FEEL_PANEL_USERS, a comma list of User ids in the server env (owner decision 2026-10-20: a NARROW permission that opens
 *     the feel panel only — no role, no schema change, no database write), or
 *   - an admin by the repo's existing check, requireAdmin() (role === 'admin').
 * Anything else is { enabled: false }. The flag is checked first, so the flag-off answer reads no session. Every answer is a 200:
 * the panel's container asks on every /play visit, for every player, and a 403/404 there would be a red network line in each
 * player's console (and a "missing" line in scripts/probes/_all-modes-errors.mts). The client (components/feel-panel/feel-panel.tsx)
 * opens nothing and applies no override until it reads `enabled: true`.
 */
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isFeelPanelEnabled, isFeelPanelUser } from '@/lib/flags';
import { requireAdmin } from '@/lib/admin/requireAdmin';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const answer = (enabled: boolean) => NextResponse.json({ enabled }, { headers: NO_STORE });

export async function GET() {
  if (!isFeelPanelEnabled()) return answer(false);
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return answer(false);
  if (isFeelPanelUser(userId)) return answer(true);
  return answer(Boolean(await requireAdmin()));
}
