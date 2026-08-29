export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

/**
 * GET /api/v1/wallet/config
 * Tiny public flag so the store UI knows whether real-money coin purchases are
 * currently available (Stripe configured) without exposing any secret.
 */
export async function GET() {
  return NextResponse.json({ purchasesEnabled: Boolean(process.env.STRIPE_SECRET_KEY) });
}
