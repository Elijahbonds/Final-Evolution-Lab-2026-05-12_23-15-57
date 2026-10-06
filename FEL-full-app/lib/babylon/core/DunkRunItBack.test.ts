import { describe, it, expect } from 'vitest';
import { runBackOffered, runBackReady, runBackHint, bloopLine, BLOOPER_LINES, RUN_BACK_MIN_MS, type MissKind } from './DunkRunItBack';
import { freshStakes, spendAttempt, attemptsLeft, attemptScale, ATTEMPTS_PER_DUNK, ATTEMPT_SCALE, type Stakes } from './DunkStakes';

const spent = (n: number): Stakes => { let s = freshStakes(); for (let k = 0; k < n; k++) s = spendAttempt(s); return s; };

describe('RUN IT BACK keeps the attempt rules', () => {
  it('is offered on the player\'s miss only while an attempt is left — never on a make, never on the last miss, never for the rival', () => {
    expect(runBackOffered(spent(1), false, true)).toBe(true);
    expect(runBackOffered(spent(2), false, true)).toBe(true);
    expect(runBackOffered(spent(ATTEMPTS_PER_DUNK), false, true)).toBe(false);   // the last miss is judged, as ever
    expect(runBackOffered(spent(1), true, true)).toBe(false);                    // a made dunk is never re-done
    expect(runBackOffered(spent(1), false, false)).toBe(false);                  // the rival's miss runs on his clock
  });
  it('mashed at every chance, a dunk still gets at most ATTEMPTS_PER_DUNK attempts — no free re-do on the staked card', () => {
    let s = freshStakes(), attempts = 0;
    for (;;) {
      s = spendAttempt(s); attempts++;           // the mode spends the attempt BEFORE it offers the retry
      if (!runBackOffered(s, false, true)) break;
      expect(attempts).toBeLessThan(ATTEMPTS_PER_DUNK);
    }
    expect(attempts).toBe(ATTEMPTS_PER_DUNK);
    expect(attemptsLeft(s)).toBe(0);
  });
  it('a run-back attempt is still scored at its own (lower) attempt scale — the retry is the same retry, only sooner', () => {
    expect(attemptScale(spent(2).attemptsUsed)).toBe(ATTEMPT_SCALE[1]);
    expect(attemptScale(spent(3).attemptsUsed)).toBe(ATTEMPT_SCALE[2]);
    expect(ATTEMPT_SCALE[1]).toBeLessThan(ATTEMPT_SCALE[0]);
  });
  it('reads the stakes and never writes them', () => {
    const s = Object.freeze(spent(1)) as Stakes;
    expect(() => { runBackOffered(s, false, true); runBackHint(s); }).not.toThrow();
    expect(s.attemptsUsed).toBe(1);
  });
});

describe('when a press runs it back', () => {
  it('only after the clank has read — a slam still being thrown is not a retry', () => {
    expect(runBackReady(0)).toBe(false);
    expect(runBackReady(RUN_BACK_MIN_MS - 1)).toBe(false);
    expect(runBackReady(RUN_BACK_MIN_MS)).toBe(true);
    expect(runBackReady(NaN)).toBe(false);
    expect(runBackReady(Infinity)).toBe(false);
  });
  it('is well inside the old miss beat (DunkMode MISS_BEAT_MS 1400): it saves at least 0.9 s a retried miss', () => {
    expect(1400 - RUN_BACK_MIN_MS).toBeGreaterThanOrEqual(900);
    expect(RUN_BACK_MIN_MS).toBeGreaterThanOrEqual(300);
  });
  it('the hint says what is left', () => {
    expect(runBackHint(spent(1))).toBe('A · RUN IT BACK — 2 ATTEMPTS LEFT');
    expect(runBackHint(spent(2))).toBe('A · RUN IT BACK — 1 ATTEMPT LEFT');
  });
});

describe('the blooper call', () => {
  it('every kind of miss has its own lines, in the HUD\'s capitals', () => {
    for (const k of ['prop', 'lob', 'early', 'noSlam'] as MissKind[]) {
      expect(BLOOPER_LINES[k].length).toBeGreaterThanOrEqual(2);
      for (const l of BLOOPER_LINES[k]) expect(l).toBe(l.toUpperCase());
    }
  });
  it('two misses in a row never get the same line; a bad counter is the first line, never a throw', () => {
    for (const k of ['prop', 'lob', 'early', 'noSlam'] as MissKind[]) for (let n = 0; n < 9; n++) expect(bloopLine(k, n)).not.toBe(bloopLine(k, n + 1));
    expect(bloopLine('early', NaN)).toBe(BLOOPER_LINES.early[0]);
    expect(bloopLine('nonsense' as MissKind, 1)).toBe(BLOOPER_LINES.early[1]);
  });
});
