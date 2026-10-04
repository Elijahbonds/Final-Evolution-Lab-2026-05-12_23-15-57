import { describe, it } from 'vitest';

/**
 * OUT OF LANE. These stay skipped on purpose. See docs/coach-store-NOTES.md.
 * B-W2: FEL_COACH / FEL_FACILITY checkout writes no Subscription row.
 * B-W3: basil removed invoice.subscription and subscription.current_period_end on the existing handlers.
 * Coach-store reads both shapes (lib/coach-store/stripeShapes.ts). This lane does not patch the old handlers.
 */
describe('out of lane', () => {
  it.skip('B-W2 FEL_COACH checkout writes a Subscription row', () => {});
  it.skip('B-W3 existing invoice handler reads parent.subscription_details', () => {});
});
