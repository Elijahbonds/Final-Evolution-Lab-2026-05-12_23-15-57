// STORE-TERMS-3 (h): the terms_version read-back. The version saved on a checkout's Stripe metadata is read
// back at fulfilment (webhook.ts) and during reconcile (reconcile.ts) and LOGGED — a paid session or
// subscription with a missing or old terms_version STILL fulfils exactly as today (a log, never a block).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STORE_TERMS_VERSION } from '@/lib/store-terms';
import { termsVersionStatus } from '@/lib/coach-store/webhook';

const webhookSrc = readFileSync('lib/coach-store/webhook.ts', 'utf8');
const reconcileSrc = readFileSync('lib/coach-store/reconcile.ts', 'utf8');

describe('STORE-TERMS-3 (h): terms_version read-back — a log, never a block', () => {
  it('termsVersionStatus classifies current / old / missing', () => {
    expect(termsVersionStatus({ terms_version: STORE_TERMS_VERSION })).toBe('current');
    expect(termsVersionStatus({ terms_version: 'store-terms-OLD' })).toBe('old');
    expect(termsVersionStatus({})).toBe('missing');
    expect(termsVersionStatus({ terms_version: '' })).toBe('missing');
    expect(termsVersionStatus(null)).toBe('missing');
    expect(termsVersionStatus(undefined)).toBe('missing');
  });

  it('webhook.ts reads back and logs the terms_version at fulfilment (source)', () => {
    expect(webhookSrc).toContain('export function termsVersionStatus');
    expect(webhookSrc).toContain('terms_version read-back');
    expect(webhookSrc).toContain('logTermsVersionReadBack(');
  });

  it('reconcile.ts reads back and logs the terms_version for a paid session (source)', () => {
    expect(reconcileSrc).toContain('termsVersionStatus');
    expect(reconcileSrc).toContain('terms_version read-back');
  });

  it('the read-back never blocks fulfilment (no throw / no non-fulfil branch on the status)', () => {
    // The read-back is a console.warn plus a returned status; it never gates postSale/fulfil.
    expect(webhookSrc).not.toMatch(/termsVersionStatus[^;]*return '(noop|refund_due)'/);
    // And a missing/old version does not raise a 409 or an error path in fulfilment.
    expect(webhookSrc).not.toMatch(/terms_version[^]*409/);
  });
});
