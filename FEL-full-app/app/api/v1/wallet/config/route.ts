export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { purchasesEnabledFromEnv } from '@/lib/wallet/purchases';

/**
 * GET /api/v1/wallet/config
 * Tiny public flag so the store UI knows whether real-money coin purchases are
 * currently available (Stripe configured) without exposing any secret.
 */
export async function GET() {
  // FEATURES-UX-SHOP: the same helper the checkout routes and the wallet page read — one flag, one copy.
  return NextResponse.json({ purchasesEnabled: purchasesEnabledFromEnv() });
}
