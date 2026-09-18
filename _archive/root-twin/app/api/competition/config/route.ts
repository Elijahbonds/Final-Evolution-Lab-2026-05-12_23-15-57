export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { isRealMoneyCompetitionEnabled, FEATURE_DISABLED } from '@/lib/flags';
import {
  DEFAULT_RAKE_PERCENT,
  MIN_ENTRY_FEE_CENTS,
  MAX_ENTRY_FEE_CENTS,
  SCORE_DUEL_EXPIRY_HOURS,
  SKILL_GAME_STATE_ALLOWLIST,
  MIN_AGE_YEARS,
  MIN_DEPOSIT_CENTS,
  MAX_DEPOSIT_CENTS,
  MIN_WITHDRAW_CENTS,
  MAX_WITHDRAW_CENTS,
} from '@/lib/competition';

/**
 * GET /api/competition/config
 * Returns the competition configuration for the client UI.
 */
export async function GET() {
  if (!isRealMoneyCompetitionEnabled()) {
    return NextResponse.json(FEATURE_DISABLED, { status: 403 });
  }

  return NextResponse.json({
    rakePercent: DEFAULT_RAKE_PERCENT,
    minEntryFeeCents: MIN_ENTRY_FEE_CENTS,
    maxEntryFeeCents: MAX_ENTRY_FEE_CENTS,
    scoreDuelExpiryHours: SCORE_DUEL_EXPIRY_HOURS,
    allowedStates: Array.from(SKILL_GAME_STATE_ALLOWLIST),
    minAge: MIN_AGE_YEARS,
    deposit: { minCents: MIN_DEPOSIT_CENTS, maxCents: MAX_DEPOSIT_CENTS },
    withdraw: { minCents: MIN_WITHDRAW_CENTS, maxCents: MAX_WITHDRAW_CENTS },
  });
}
