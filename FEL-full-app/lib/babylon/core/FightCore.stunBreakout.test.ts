// QA A1-03: a continuous attack string stun-locked RIVAL SENSEI (player stayed at 100 HP a whole match) because
// resolveStrike unconditionally resolved every swing against a non-controllable defender as 'hit' and re-applied
// stun — a string landing faster than stunSec could tick to 0 never let go. Lowering damage was rejected: the fix
// caps the STRING (STUN_CHAIN_BREAKOUT consecutive hits with no control regained), not the damage per hit.
//
// `breakout` defaults to false so every existing caller (and the pad-equivalence fixture, which pins resolveStrike
// byte-for-byte against a frozen pre-P7 copy) is unaffected — only KarateVSMode's main pad/keyboard duel opts in.
import { describe, expect, it } from 'vitest';
import {
  FighterState, resolveStrike, KARATE_ATTACKS, STUN_CHAIN_BREAKOUT, BREAKOUT_INVULN_SEC,
} from './FightCore';

const JAB = KARATE_ATTACKS.jab;
const DIST = 0.5;   // well inside jab.range

describe('resolveStrike breakout (QA A1-03)', () => {
  it('without breakout (every existing caller): a stunned defender always just takes the next hit — unchanged legacy behavior', () => {
    const d = new FighterState();
    d.stunSec = 1;   // already stunned, e.g. from a prior hit
    for (let i = 0; i < STUN_CHAIN_BREAKOUT + 3; i++) {
      expect(resolveStrike(JAB, DIST, d, 1000 + i)).toBe('hit');
    }
  });

  it('with breakout=true: a long unbroken string escapes on the Nth hit instead of stun-locking forever', () => {
    const d = new FighterState();
    d.stunSec = 1;   // the string's first hit already landed and stunned them
    let escapedAt = -1;
    for (let i = 0; i < STUN_CHAIN_BREAKOUT + 5 && escapedAt < 0; i++) {
      const out = resolveStrike(JAB, DIST, d, 1000 + i, undefined, undefined, true);
      if (out === 'escaped') escapedAt = i;
      else expect(out).toBe('hit');
    }
    expect(escapedAt).toBe(STUN_CHAIN_BREAKOUT - 1);   // the string's first hit set stunSec directly (not through resolveStrike), so N-1 more closes it
    expect(d.controllable).toBe(true);                  // the breakout clears stun AND stagger — free to act
    expect(d.stunChain).toBe(0);
  });

  it('an escaped defender is briefly unhittable: the very next swing inside the window whiffs, not restuns', () => {
    const d = new FighterState();
    d.stunSec = 1;
    let now = 1000;
    for (let i = 0; i < STUN_CHAIN_BREAKOUT; i++) resolveStrike(JAB, DIST, d, now++, undefined, undefined, true);
    expect(d.escapeSec).toBeGreaterThan(0);
    expect(resolveStrike(JAB, DIST, d, now, undefined, undefined, true)).toBe('stepped');
    expect(d.controllable).toBe(true);   // still free — a whiffed swing does not restun them
  });

  it('the escape window expires: after it ticks out, a fresh string can begin (and needs the full count again)', () => {
    const d = new FighterState();
    d.stunSec = 1;
    let now = 1000;
    for (let i = 0; i < STUN_CHAIN_BREAKOUT; i++) resolveStrike(JAB, DIST, d, now++, undefined, undefined, true);
    d.tick(BREAKOUT_INVULN_SEC + 0.01);
    expect(d.escapeSec).toBe(0);
    // controllable now (no active stun) — a hit here starts a brand-new potential string, resetting the chain
    expect(resolveStrike(JAB, DIST, d, now, undefined, undefined, true)).toBe('hit');
    expect(d.stunChain).toBe(0);
  });

  it('a string that never re-closes (defender recovers naturally) does not carry a partial chain into the next one', () => {
    const d = new FighterState();
    d.stunSec = 1;
    resolveStrike(JAB, DIST, d, 1000, undefined, undefined, true);   // one hit into the string, chain = 1, well under the cap
    d.tick(2);   // fully recovers on its own — the string ended before it ever closed
    expect(d.controllable).toBe(true);
    expect(resolveStrike(JAB, DIST, d, 2000, undefined, undefined, true)).toBe('hit');   // a fresh hit, not a continuation
    expect(d.stunChain).toBe(0);   // reset by the controllable branch — this fresh hit is link 1 of a NEW string
  });
});
