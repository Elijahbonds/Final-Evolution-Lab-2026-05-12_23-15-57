import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ENV_EXAMPLE = readFileSync('.env.example', 'utf8');

const REQUIRED_ENV_KEYS = [
  'ABACUS_ENABLED',
  'ARENA_RECLAIM_SECRET',
  'COACH_REVIEW_UPLOADS_ENABLED',
  'COACH_REVIEWS_BUCKET',
  'COACH_STORE_BLOCKED_ADDRESS_TERMS',
  'COACH_STORE_COACH_USER_IDS',
  'COACH_STORE_ENABLED',
  'COACH_STORE_LIVE',
  'COACH_STORE_PAYMENTS_ENABLED',
  'COACH_STORE_RECONCILE_SECRET',
  'COACH_STORE_REFERRAL_SHARE_OF_FEE',
  'CREATOR_MEDIA_BUCKET',
  'CREATOR_MEDIA_PUBLIC_BUCKET',
  'FACE_SCAN_ENABLED',
  'FEL_TEST_ACCOUNTS',
  'LIVE_STREAM_SCHEDULE_ENABLED',
  'NEXT_PUBLIC_JOIN_LAB_ENABLED',
  'PAYOUTS_ENABLED',
  'RETENTION_CRON_SECRET',
  'VIRTUAL_PURCHASES_ENABLED',
] as const;

describe('.env.example production switches', () => {
  it('names every documented production switch or secret that otherwise fails closed', () => {
    for (const key of REQUIRED_ENV_KEYS) {
      expect(ENV_EXAMPLE, `${key} missing from .env.example`).toContain(key);
    }
  });

  it('does not resurrect the retired separate Stripe key for books', () => {
    expect(ENV_EXAMPLE).not.toContain('STRIPE_BOOKS_SECRET_KEY');
  });
});
