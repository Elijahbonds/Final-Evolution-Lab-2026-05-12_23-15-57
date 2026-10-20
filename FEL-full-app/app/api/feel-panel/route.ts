/**
 * GET /api/feel-panel — may this user open the feel panel? (feel-panel lane, owner 2026-10-20; docs/FEEL-PANEL.md)
 *
 * { enabled: true } only when the server flag FEEL_PANEL_ENABLED is on (lib/flags.ts, default OFF) AND the session's user is an
 * admin by the repo's one admin check, requireAdmin() (role === 'admin'; owner and coach are not admins there). Anything else is
 * { enabled: false }: 404 while the flag is off — checked first, so the flag-off answer reads no session — and 403 otherwise.
 * The client (components/feel/feel-panel.tsx) opens nothing and applies no override until it reads `enabled: true`.
 */
import { NextResponse } from 'next/server';
import { isFeelPanelEnabled } from '@/lib/flags';
import { requireAdmin } from '@/lib/admin/requireAdmin';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  if (!isFeelPanelEnabled()) return NextResponse.json({ enabled: false }, { status: 404, headers: NO_STORE });
  if (!(await requireAdmin())) return NextResponse.json({ enabled: false }, { status: 403, headers: NO_STORE });
  return NextResponse.json({ enabled: true }, { headers: NO_STORE });
}
