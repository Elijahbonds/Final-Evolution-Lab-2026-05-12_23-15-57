export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUserId } from '@/lib/camp/server';
import { rateLimit } from '@/lib/rate-limit';
import { pushSettingsGet, pushSettingsSave, pushSettingsRemove, PUSH_SETTINGS_PER_HOUR, type PushSettingsDb } from '@/lib/push/settings';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/**
 * /api/push — the account's notification settings (offline-push, round 8, OFF-03). lib/push/settings.ts holds every rule.
 *   GET    → { available, publicKey, adult, coach, email: { available }, prefs: { kinds, email }, devices }
 *   POST   { kinds, email?, subscription? } → opt in (VERIFIED ADULTS ONLY: anyone else 403 adults_only, nothing written)
 *   DELETE { endpoint? } → this browser off; with no endpoint, every browser off and every kind cleared (opt out)
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return json({ error: 'unauthorized' }, 401);
  return json(await pushSettingsGet(prisma as unknown as PushSettingsDb, userId));
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return json({ error: 'unauthorized' }, 401);
  if (!rateLimit(`push-settings:${userId}`, PUSH_SETTINGS_PER_HOUR, 60 * 60 * 1000).ok) return json({ error: 'rate_limited' }, 429);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const r = await pushSettingsSave(prisma as unknown as PushSettingsDb, userId, body);
  return json(r.body, r.status);
}

export async function DELETE(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return json({ error: 'unauthorized' }, 401);
  if (!rateLimit(`push-settings:${userId}`, PUSH_SETTINGS_PER_HOUR, 60 * 60 * 1000).ok) return json({ error: 'rate_limited' }, 429);
  let body: unknown = {};
  try { body = await req.json(); } catch { /* no body: every browser off */ }
  const r = await pushSettingsRemove(prisma as unknown as PushSettingsDb, userId, body);
  return json(r.body, r.status);
}
