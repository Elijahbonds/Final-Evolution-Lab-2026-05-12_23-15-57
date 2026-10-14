// QA-H6 (hoops grade 0d16f5dd): mashing keys on the 1v1 card during the celebration navigated off to the hub before PLAY
// AGAIN could be pressed. B now skips the reveal while it runs and leaves only once it has finished and sat still.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { backIntent, BACK_SETTLE_MS, ARM_MS, initialReveal, revealReducer } from './reveal';

describe('QA-H6: a stray B during the celebration never leaves the card', () => {
  const total = 4;
  const running = initialReveal(false);
  const done = revealReducer(running, { type: 'skip' } as never);
  it('before ARM_MS: nothing', () => {
    expect(backIntent(running, total, ARM_MS - 1, null)).toBe('ignore');
  });
  it('while the beats are still coming: B skips, like A', () => {
    expect(backIntent(running, total, ARM_MS, null)).toBe('skip');
  });
  it('just finished (a mash that skipped it): still nothing for BACK_SETTLE_MS', () => {
    expect(backIntent(done, total, 5000, 0)).toBe('ignore');
    expect(backIntent(done, total, 5000, BACK_SETTLE_MS - 1)).toBe('ignore');
  });
  it('finished and settled: B leaves', () => {
    expect(backIntent(done, total, 5000, BACK_SETTLE_MS)).toBe('leave');
  });
  it('the card routes back through backIntent, timing the settle from when the reveal finished', () => {
    const s = readFileSync(join(__dirname, 'end-screen.tsx'), 'utf8');
    expect(s).toMatch(/const b = backIntent\(rvRef\.current, stepsLen\.current, since, doneAt\.current === null \? null : now\(\) - doneAt\.current\);/);
    expect(s).not.toMatch(/if \(since >= ARM_MS\) navRef\.current\(exitHref\)/);
  });
});
