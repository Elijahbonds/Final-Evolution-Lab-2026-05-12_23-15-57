import { describe, expect, it } from 'vitest';
import { REASON } from './reward-rules';
import { REASON_LABELS, reasonLabel } from './reason-labels';

// HOTFIX (2026-09-24): this check lived only in scripts/wallet-tests.ts, a DATABASE suite, so it ran nowhere without a Postgres —
// the Playbook's EDU_CHAPTER_COMPLETE shipped unlabelled (the ledger read "edu chapter complete") and CI's wallet-tests sat red for
// four days. It is pure, so it belongs where every run reaches it.
describe('ledger reason labels', () => {
  it('every REASON code has a human-readable ledger label', () => {
    const missing = Object.values(REASON).filter((code) => !REASON_LABELS[code as string]);
    expect(missing).toEqual([]);
  });

  it('the Playbook chapter reads as a Playbook chapter, not its code', () => {
    expect(reasonLabel(REASON.EDU_CHAPTER_COMPLETE)).toEqual({ label: 'Playbook chapter complete', kind: 'earn' });
  });

  it('an unknown code degrades to readable words rather than throwing', () => {
    expect(reasonLabel('SOME_FUTURE_CODE')).toEqual({ label: 'some future code', kind: 'earn' });
  });
});
