import { describe, expect, it } from 'vitest';
import { entryNote } from './ledger-history';
import { reasonLabel } from '@/lib/wallet/reason-labels';

// Owner decision 2026-09-24: a refund of a purchase that delivered nothing says so in the wallet history, for good. The
// row's label comes from its reason code; the note under it is the same sentence the one-time toast showed.
describe('the wallet history row of a dead-buy refund', () => {
  const note = "We refunded 300 coins for Nexus Visor: it didn't deliver anything. Sorry about that.";

  it('reads as a refund, with the reason in plain words under it', () => {
    expect(reasonLabel('DEAD_BUY_REFUND')).toEqual({ label: 'Refund: it delivered nothing', kind: 'refund' });
    expect(entryNote({ metadata: { refundOf: 'row_1', note } })).toBe(note);
  });

  it('shows nothing extra for a row without a note', () => {
    expect(entryNote({ metadata: { skuId: 'cap_nexus', quantity: 1 } })).toBeNull();
    expect(entryNote({ metadata: null })).toBeNull();
    expect(entryNote({})).toBeNull();
    expect(entryNote({ metadata: { note: '   ' } })).toBeNull();
    expect(entryNote({ metadata: { note: 42 } })).toBeNull();
  });
});
