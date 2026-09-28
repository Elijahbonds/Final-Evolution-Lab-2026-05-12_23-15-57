export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { clientKeyFromHeaders } from '@/lib/rate-limit';
import { submitInquiry } from '@/lib/creator/inquiry';
import { creatorStoreFromEnv } from '@/lib/creator/creatorStore.firestore';

/**
 * POST /api/creator/inquiry
 * Public "Work with us" intake. Validated server-side, honeypot, per-IP rate limit. Answers 201, 400 or 429.
 * Stores a salted IP hash, never the IP. No auto-reply.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await submitInquiry(body, clientKeyFromHeaders(req.headers), { store: creatorStoreFromEnv() });
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
