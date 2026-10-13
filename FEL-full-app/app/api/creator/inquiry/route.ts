export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { clientKeyFromHeaders } from '@/lib/rate-limit';
import { submitInquiry } from '@/lib/creator/inquiry';
import { saveInquiry, type RawDb } from '@/lib/creator/inquiryStore';

/**
 * POST /api/creator/inquiry
 * Public "Work with us" intake. Validated server-side, honeypot, per-IP rate limit. Answers 201, 400, 429, or 503
 * `inquiries_unavailable` until the CreatorInquiry table exists (prisma/pending/2026-10-13-creator-inquiry.sql).
 * Stores no IP address or IP hash. No auto-reply.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await submitInquiry(body, clientKeyFromHeaders(req.headers), {
    save: (record) => saveInquiry(prisma as unknown as RawDb, record),
  });
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}
