import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const ENV_EXAMPLE = readFileSync('.env.example', 'utf8');

const DEPLOYMENT_ENV_VARS = [
  'ABACUS_ENABLED',
  'ARENA_RECLAIM_SECRET',
  'COACH_REVIEWS_BUCKET',
  'COACH_REVIEW_UPLOADS_ENABLED',
  'COACH_STORE_COACH_USER_IDS',
  'COACH_STORE_ENABLED',
  'COACH_STORE_LIVE',
  'COACH_STORE_PAYMENTS_ENABLED',
  'COACH_STORE_RECONCILE_SECRET',
  'FACE_SCAN_ENABLED',
  'FEL_TEST_ACCOUNTS',
  'K_REVISION',
  'LIVE_STREAM_SCHEDULE_ENABLED',
  'NEXT_PUBLIC_FEL_BODY_RIDE',
  'NEXT_PUBLIC_JOIN_LAB_ENABLED',
  'PAYOUTS_ENABLED',
  'RETENTION_CRON_SECRET',
  'VERCEL_GIT_COMMIT_SHA',
  'VIRTUAL_PURCHASES_ENABLED',
] as const;

describe('.env.example operational coverage', () => {
  it('documents every fail-closed production flag, job secret, and deploy metadata handoff named by readiness', () => {
    for (const name of DEPLOYMENT_ENV_VARS) {
      expect(ENV_EXAMPLE, `${name} is missing from .env.example`).toContain(`${name}=`);
    }
  });

  it('does not resurrect the retired separate Stripe key for books', () => {
    expect(ENV_EXAMPLE).not.toContain('STRIPE_BOOKS_SECRET_KEY');
  });
});
