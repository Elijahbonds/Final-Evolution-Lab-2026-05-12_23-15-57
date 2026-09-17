// Does a max handle actually feel different, and is the difference EARNED?
//
// These tests are written against the owner's brief rather than the implementation: a baseline scan owns
// a crossover and nothing fancy; a maxed one owns the whole vocabulary, chains it, and puts people on
// the floor. And the gate runs off the same PRQ attributes the subscription protects, because that is
// what makes the upgrade legible.

import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  MOVE_HANDLE, BASELINE_HANDLE, CHAIN_IDLE,
  hasMove, movesFor, handleFrom, chainWindowSec, tightness,
  canChain, pushChain, tickChain, chainTier, ankleBreakOdds, isHardBreak, gathersIntoShot,
  moveFromContext, MAX_CHAIN, chainSpent,
  type ChainState,
  resolveHandleMove,
  type DefenderRead,
  offTheHeadOdds,
  offTheHeadLoose,
  OFF_THE_HEAD_RANGE,
  type MoveRead,
  moveDanger,
  moveImpulse,
  movesTheBody,
  MOVE_CLIP, moveClip, ANKLE_STUMBLE_CLIP, ANKLE_SLIP_CLIP, type HandleMove,
} from './HandleSystem';

const MAX = 100;

describe('the vocabulary is the upgrade', () => {
  it('a baseline scan owns the basics and none of the flash', () => {
    expect(hasMove('crossover', BASELINE_HANDLE)).toBe(true);
    expect(hasMove('hesi', BASELINE_HANDLE)).toBe(true);
    expect(hasMove('shammgod', BASELINE_HANDLE)).toBe(false);
    expect(hasMove('snatch_back', BASELINE_HANDLE)).toBe(false);
    expect(hasMove('double_cross', BASELINE_HANDLE)).toBe(false);
  });

  it('a maxed handle owns everything', () => {
    const all = movesFor(MAX);
    expect(all).toContain('shammgod');
    expect(all.length).toBe(Object.keys(MOVE_HANDLE).length);
  });

  it('every upgrade step adds strictly more than it takes away', () => {
    // the move set must only ever GROW with handle: a gate that swapped moves would feel like a
    // sidegrade rather than a reward
    let prev = movesFor(0).length;
    for (let h = 5; h <= 100; h += 5) {
      const n = movesFor(h).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it('the top of the vocabulary is genuinely out of reach at baseline', () => {
    const locked = (Object.keys(MOVE_HANDLE) as (keyof typeof MOVE_HANDLE)[])
      .filter((m) => MOVE_HANDLE[m] > BASELINE_HANDLE);
    expect(locked.length).toBeGreaterThanOrEqual(4);
  });
});

describe('handle comes out of the PRQ scan, not a cosmetic stat', () => {
  it('a default scan sits at the baseline', () => {
    expect(handleFrom({})).toBeCloseTo(BASELINE_HANDLE, 5);
  });

  it('agility moves it most — a handle is mostly hands and feet', () => {
    const byAgility = handleFrom({ agility: 90 });
    const byFlex = handleFrom({ flexibility: 90 });
    const byMental = handleFrom({ mental: 90 });
    expect(byAgility).toBeGreaterThan(byFlex);
    expect(byFlex).toBeGreaterThan(byMental);
  });

  it('upgrading the scan is what unlocks the flash — the subscription link', () => {
    // this is the thing a subscriber keeps: not a number, a move
    const before = handleFrom({ agility: 50, flexibility: 50, mental: 50 });
    const after = handleFrom({ agility: 95, flexibility: 90, mental: 85 });
    expect(hasMove('snatch_back', before)).toBe(false);
    expect(hasMove('snatch_back', after)).toBe(true);
  });

  it('it never leaves 0..100 however absurd the scan', () => {
    expect(handleFrom({ agility: 500, flexibility: 500, mental: 500 })).toBeLessThanOrEqual(100);
    expect(handleFrom({ agility: -90, flexibility: -90, mental: -90 })).toBeGreaterThanOrEqual(0);
  });
});

describe('moves CHAIN — the Street half of the brief', () => {
  const state = (over: Partial<ChainState> = {}): ChainState => ({ ...CHAIN_IDLE, ...over });

  it('opening a chain is always allowed if you own the move', () => {
    expect(canChain('crossover', CHAIN_IDLE, BASELINE_HANDLE)).toBe(true);
  });

  it('a second DIFFERENT move inside the window chains', () => {
    const s = state({ last: 'crossover', since: 0.1, length: 1 });
    expect(canChain('between_legs', s, MAX)).toBe(true);
    expect(pushChain('between_legs', s, MAX).length).toBe(2);
  });

  it('the SAME move twice is not a combo — a spammed crossover must not read as one', () => {
    const s = state({ last: 'crossover', since: 0.1, length: 1 });
    expect(canChain('crossover', s, MAX)).toBe(false);
  });

  it('outside the window the chain is over and the next move STARTS a new one', () => {
    const s = state({ last: 'crossover', since: 2.0, length: 2 });
    expect(canChain('between_legs', s, MAX)).toBe(false);
    expect(pushChain('between_legs', s, MAX).length).toBe(1);
  });

  it('a max handle can string three together where a baseline handle cannot', () => {
    // the same real-time gap between presses: one player chains, the other does not
    // a gap that sits BETWEEN the two windows: inside max's, outside baseline's
    const gap = 0.55;
    const maxS = pushChain('crossover', CHAIN_IDLE, MAX);
    const baseS = pushChain('crossover', CHAIN_IDLE, BASELINE_HANDLE);
    expect(canChain('between_legs', { ...maxS, since: gap }, MAX)).toBe(true);
    expect(canChain('between_legs', { ...baseS, since: gap }, BASELINE_HANDLE)).toBe(false);
  });

  it('the chain clock expires on its own', () => {
    let s = pushChain('crossover', CHAIN_IDLE, MAX);
    for (let i = 0; i < 60; i++) s = tickChain(s, 1 / 60, MAX);
    expect(s.last).toBeNull();
    expect(s.length).toBe(0);
  });

  it('three deep is a highlight, two is a combo, one is just a move', () => {
    expect(chainTier(1)).toBe('single');
    expect(chainTier(2)).toBe('combo');
    expect(chainTier(3)).toBe('highlight');
    expect(chainTier(5)).toBe('highlight');
  });
});

describe('ankle breakers', () => {
  const read = (over: Partial<Parameters<typeof ankleBreakOdds>[0]> = {}) => ankleBreakOdds({
    chainLength: 1, handle: BASELINE_HANDLE, defenderClosing: false, defenderSet: false, ...over,
  });

  it('a SET defender is nearly unbreakable — sitting down on defence has to work', () => {
    expect(read({ defenderSet: true, chainLength: 3, handle: MAX })).toBeLessThan(0.1);
  });

  it('a CLOSING defender is the one you break — that is the read', () => {
    expect(read({ defenderClosing: true })).toBeGreaterThan(read({ defenderClosing: false }));
  });

  it('chain depth matters more than anything else — it is the skill expression', () => {
    const one = read({ chainLength: 1 });
    const three = read({ chainLength: 3 });
    expect(three).toBeGreaterThan(one * 2.5);
  });

  it('a single crossover rarely breaks anybody', () => {
    expect(read({ chainLength: 1 })).toBeLessThan(0.2);
  });

  it('a three-move chain at a real handle looks inevitable', () => {
    expect(read({ chainLength: 3, handle: MAX, defenderClosing: true })).toBeGreaterThan(0.7);
  });

  it('the odds never reach certainty — defence is never pointless', () => {
    expect(read({ chainLength: 9, handle: 100, defenderClosing: true })).toBeLessThan(1);
  });

  it('only a deep chain at a real handle puts him on the FLOOR; anything less is a stagger', () => {
    // "ankle breakers" means he goes down. A stumble is not one — but if every break floored a body the
    // floor moment would stop meaning anything
    expect(isHardBreak(3, MAX)).toBe(true);
    expect(isHardBreak(1, MAX)).toBe(false);
    expect(isHardBreak(3, BASELINE_HANDLE)).toBe(false);
  });
});

describe('the 2K half: nothing here is free', () => {
  it('a low handle rides the ball loose and high, a max handle keeps it low and tight', () => {
    expect(tightness(0)).toBeLessThan(tightness(BASELINE_HANDLE));
    expect(tightness(BASELINE_HANDLE)).toBeLessThan(tightness(MAX));
    expect(tightness(MAX)).toBeLessThanOrEqual(1);
  });

  it('the chain window grows with the handle but stays tight at the bottom', () => {
    expect(chainWindowSec(0)).toBeLessThan(chainWindowSec(MAX));
    expect(chainWindowSec(0)).toBeLessThan(0.25);
  });

  it('a max window CLEARS the real move cadence, or the top of the tree is unreachable', () => {
    // measured: the dribble controller commits a crossover about every 0.6 s, so at a 0.52 s window a
    // maxed handle capped at a two-move chain in every probe run and the hard ankle break could never fire
    const MEASURED_MOVE_CADENCE_SEC = 0.6;
    expect(chainWindowSec(MAX)).toBeGreaterThan(MEASURED_MOVE_CADENCE_SEC);
    // but it must never be so long that a baseline handle backs into combos it did not earn
    expect(chainWindowSec(BASELINE_HANDLE)).toBeLessThan(MEASURED_MOVE_CADENCE_SEC);
  });
});

describe('spin move gathers', () => {
  it('a spin flows into the shot gather instead of dead-ending', () => {
    expect(gathersIntoShot('spin')).toBe(true);
  });

  it('and so do the other moves whose exit faces the rim', () => {
    expect(gathersIntoShot('snatch_back')).toBe(true);
    expect(gathersIntoShot('hesi')).toBe(true);
  });

  it('a crossover does not — it beats a man sideways, it does not set your feet', () => {
    expect(gathersIntoShot('crossover')).toBe(false);
    expect(gathersIntoShot('between_legs')).toBe(false);
  });
});

describe('one flick, different moves — the vocabulary needs no new buttons', () => {
  const read = (over: Partial<Parameters<typeof moveFromContext>[0]> = {}) => ({
    speed01: 0.5, retreating: false, pressured: false, last: null, ...over,
  });

  it('a baseline handle reaches only for the BASICS, never the flash', () => {
    // between-the-legs unlocks at 45 and baseline is 50, so a fresh scan legitimately owns it — it is a
    // basic move, not a highlight. What baseline must never produce is the earned vocabulary.
    const flash = ['behind_back', 'double_cross', 'snatch_back', 'shammgod', 'spin'];
    for (const o of [{ speed01: 0.1, pressured: true }, { retreating: true }, { speed01: 0.9, pressured: true }]) {
      expect(flash).not.toContain(moveFromContext(read(o), BASELINE_HANDLE));
    }
  });

  it('the SAME situation gives a maxed handle a better move than a baseline one', () => {
    const situation = read({ speed01: 0.9, pressured: true });
    expect(moveFromContext(situation, MAX)).toBe('snatch_back');
    expect(moveFromContext(situation, BASELINE_HANDLE)).not.toBe('snatch_back');
  });

  it('standing still under pressure at a real handle puts it through the legs', () => {
    expect(moveFromContext(read({ speed01: 0.1, pressured: true }), MAX)).toBe('between_legs');
  });

  it('backing out goes behind the back, away from the trailing hand', () => {
    expect(moveFromContext(read({ retreating: true }), MAX)).toBe('behind_back');
  });

  it('full speed into a body is the snatch-back', () => {
    expect(moveFromContext(read({ speed01: 0.9, pressured: true }), MAX)).toBe('snatch_back');
  });

  it('it never returns the move you just did — that is what lets a chain build', () => {
    // the measured failure: only crossover and hesi were bound, so every chain was depth 1 forever
    for (const last of ['between_legs', 'behind_back', 'double_cross', 'snatch_back'] as const) {
      const got = moveFromContext(read({ last, speed01: 0.6, pressured: true, retreating: true }), MAX);
      expect(got).not.toBe(last);
    }
  });

  it('it only ever returns a move you actually own', () => {
    for (const h of [0, 30, 50, 70, 90, 100]) {
      const got = moveFromContext(read({ speed01: 0.8, pressured: true, retreating: true, last: 'crossover' }), h);
      expect(hasMove(got, h) || got === 'crossover').toBe(true);
    }
  });

  it('a mid-chain move at speed escalates to the double cross', () => {
    expect(moveFromContext(read({ last: 'crossover', speed01: 0.6 }), MAX)).toBe('double_cross');
  });
});

describe('a chain is spent eventually — a combo, not a treadmill', () => {
  it('a chain cannot run past the cap however fast the inputs come', () => {
    // measured without a cap: a maxed handle reached an EIGHTEEN-move chain, which made the hard ankle
    // break continuous instead of special
    let s = { ...CHAIN_IDLE };
    const cycle = ['crossover', 'hesi', 'double_cross'] as const;
    for (let i = 0; i < 40; i++) s = pushChain(cycle[i % 3], { ...s, since: 0.05 }, MAX);
    expect(s.length).toBeLessThanOrEqual(MAX_CHAIN);
  });

  /** Exactly MAX_CHAIN distinct-enough links, which lands the chain on the cap. */
  const runToCap = () => {
    let s = { ...CHAIN_IDLE };
    const cycle = ['crossover', 'hesi', 'double_cross'] as const;
    for (let i = 0; i < MAX_CHAIN; i++) s = pushChain(cycle[i % 3], { ...s, since: 0.05 }, MAX);
    return s;
  };

  it('the cap is reachable, so the highlight tier is real content', () => {
    const s = runToCap();
    expect(s.length).toBe(MAX_CHAIN);
    expect(chainSpent(s)).toBe(true);
    expect(chainTier(s.length)).toBe('highlight');
  });

  it('a spent chain starts over rather than sticking at the cap', () => {
    const after = pushChain('crossover', { ...runToCap(), since: 0.05 }, MAX);
    expect(after.length).toBe(1);
  });
});

// ── ONE DECISION, TWO MODES (2026-09-13) ─────────────────────────────────────────────────────────────────
//
// `resolveHandleMove` exists because the 60 lines that assembled these primitives lived inside 1v1 and
// nowhere else — 3v3's crossover only switched hands, so a chain could not exist there and the ankles could
// never break. The decision is shared now and each mode renders it. These tests are what stop the two
// modes drifting apart again.

describe('resolveHandleMove', () => {
  const ON_HIM: DefenderRead = { present: true, closing: true, set: false, within: true };
  const never = () => 1;      // the roll never beats the odds
  const always = () => 0;     // the roll always beats them

  it('a move you do not own does nothing and does not touch the chain', () => {
    const r = resolveHandleMove('shammgod', { ...CHAIN_IDLE }, BASELINE_HANDLE, ON_HIM, always);
    expect(r.owned).toBe(false);
    expect(r.chain.length).toBe(0);
    expect(r.broke).toBe('none');
  });

  it('a move you DO own extends the chain', () => {
    const r = resolveHandleMove('crossover', { ...CHAIN_IDLE }, BASELINE_HANDLE, ON_HIM, never);
    expect(r.owned).toBe(true);
    expect(r.chain.length).toBe(1);
    expect(r.restarted).toBe(false);
  });

  it('A REPEAT RESTARTS RATHER THAN BEING EATEN — the input always does something', () => {
    const first = resolveHandleMove('crossover', { ...CHAIN_IDLE }, 90, ON_HIM, never);
    const again = resolveHandleMove('crossover', first.chain, 90, ON_HIM, never);
    expect(again.owned).toBe(true);
    expect(again.restarted).toBe(true);
    expect(again.chain.length).toBe(1);       // a new chain, not a refusal and not a deepening
  });

  it('depth is the skill: a chain builds toward the tiers', () => {
    let c = { ...CHAIN_IDLE };
    const tiers: string[] = [];
    for (const m of ['crossover', 'between_legs', 'behind_back'] as const) {
      const r = resolveHandleMove(m, c, 90, ON_HIM, never);
      c = r.chain; tiers.push(r.tier);
    }
    expect(tiers[0]).toBe('single');
    expect(tiers[tiers.length - 1]).not.toBe('single');
  });

  it('YOU CANNOT BREAK A MAN YOU ARE NOWHERE NEAR, however deep the chain', () => {
    const far = { ...ON_HIM, within: false };
    let c = { ...CHAIN_IDLE };
    for (const m of ['crossover', 'between_legs', 'behind_back'] as const) {
      const r = resolveHandleMove(m, c, 95, far, always);
      c = r.chain;
      expect(r.broke).toBe('none');
      expect(r.odds).toBe(0);
    }
    expect(c.length).toBe(3);                 // the chain still counted
  });

  it('nor one who is already down', () => {
    const cooked = { ...ON_HIM, present: false };
    const r = resolveHandleMove('crossover', { ...CHAIN_IDLE }, 95, cooked, always);
    expect(r.broke).toBe('none');
    expect(r.chain.length).toBe(1);
  });

  it('a lucky roll on a single crossover shakes him; it takes DEPTH to put him down', () => {
    const single = resolveHandleMove('crossover', { ...CHAIN_IDLE }, 95, ON_HIM, always);
    expect(single.broke).toBe('shook');

    let c = { ...CHAIN_IDLE };
    let last = single;
    for (const m of ['crossover', 'between_legs', 'behind_back', 'spin'] as const) {
      last = resolveHandleMove(m, c, 95, ON_HIM, always); c = last.chain;
    }
    expect(last.broke).toBe('hard');
  });

  it('a closing defender is easier to break than a set one', () => {
    const closing = resolveHandleMove('crossover', { ...CHAIN_IDLE }, 90, { present: true, closing: true, set: false, within: true }, never);
    const planted = resolveHandleMove('crossover', { ...CHAIN_IDLE }, 90, { present: true, closing: false, set: true, within: true }, never);
    expect(closing.odds).toBeGreaterThan(planted.odds);
  });

  it('the odds are always a probability, never a certainty and never negative', () => {
    for (const h of [0, 50, 75, 100]) {
      let c = { ...CHAIN_IDLE };
      for (const m of ['crossover', 'between_legs', 'behind_back', 'spin'] as const) {
        const r = resolveHandleMove(m, c, h, ON_HIM, never); c = r.chain;
        expect(r.odds, `handle ${h} ${m}`).toBeGreaterThanOrEqual(0);
        expect(r.odds, `handle ${h} ${m}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('THE GATE IS THE UPGRADE: a low handle simply cannot reach the deep moves', () => {
    for (const m of ['double_cross', 'snatch_back', 'shammgod'] as const) {
      expect(resolveHandleMove(m, { ...CHAIN_IDLE }, BASELINE_HANDLE, ON_HIM, always).owned, m).toBe(false);
    }
  });
});

// ── STREET MOVES, AND THE DEAD ONE (owner, 2026-09-13) ───────────────────────────────────────────────────
//
// Owner asked about between-the-legs, behind-the-back, the shammgod, slip-and-slide, the yo-yo and off the
// head. Checking turned up a hole: `shammgod` was priced at handle 88, named in `gathersIntoShot`, and
// NOTHING could produce it — not a candidate in `moveFromContext`, not called directly by either mode. A
// player who earned an 88 handle had bought a move that could not fire.
//
// The test that matters most here is the sweep: EVERY move in the table must be reachable by some read.

describe('every move in the vocabulary can actually happen', () => {
  const READS: MoveRead[] = [
    { speed01: 0.0, retreating: false, pressured: false, last: null },
    { speed01: 0.2, retreating: false, pressured: true, last: null },
    { speed01: 0.2, retreating: false, pressured: false, last: null },
    { speed01: 0.5, retreating: false, pressured: false, last: 'crossover' },
    { speed01: 0.5, retreating: true, pressured: false, last: null },
    { speed01: 0.8, retreating: false, pressured: true, last: 'crossover' },
    { speed01: 0.6, retreating: false, pressured: false, last: 'crossover', chainLength: 2 },
    { speed01: 0.4, retreating: false, pressured: true, last: 'hesi' },
    { speed01: 0.4, retreating: false, pressured: false, last: 'hesi' },
    { speed01: 0.2, retreating: false, pressured: true, last: 'crossover', chainLength: 2, inHisChest: true },
    { speed01: 0.8, retreating: false, pressured: true, last: null },          // snatch_back: no `last`, or double_cross outranks it
    // The plain crossover at a max handle is genuinely hard to reach — something better nearly always
    // applies, which is correct (why would a 100-handle player throw a basic cross?). It needs the gap:
    // jogging, unpressured, nothing behind it.
    { speed01: 0.4, retreating: false, pressured: false, last: null },
  ];

  it('NO MOVE IS DEAD — each one is produced by some situation at a full handle', () => {
    const produced = new Set(READS.map((r) => moveFromContext(r, 100)));
    // Two moves are produced by their OWN input rather than by the situational read: `spin` (the spin
    // machinery) and `hesi` (the pull-back plant, `doMove(ctx, 'hesi')`). Everything else has to be
    // reachable from a read, or it is priced vocabulary a player can never actually use.
    const expected = (Object.keys(MOVE_HANDLE) as HandleMove[]).filter((m) => m !== 'spin' && m !== 'hesi');
    const missing = expected.filter((m) => !produced.has(m));
    expect(missing, `unreachable: ${missing.join(', ')}`).toEqual([]);
  });

  it('specifically: the shammgod, which could not fire before today', () => {
    const deep = moveFromContext({ speed01: 0.6, retreating: false, pressured: false, last: 'crossover', chainLength: 2 }, 100);
    expect(deep).toBe('shammgod');
  });

  it('and it is a FINISHER — shallow in a chain it is not offered', () => {
    const shallow = moveFromContext({ speed01: 0.6, retreating: false, pressured: false, last: 'crossover', chainLength: 0 }, 100);
    expect(shallow).not.toBe('shammgod');
  });
});

describe('off the hesi', () => {
  it('he bit the stop → slip and slide past his hip', () => {
    expect(moveFromContext({ speed01: 0.4, retreating: false, pressured: true, last: 'hesi' }, 100)).toBe('slip_slide');
  });

  it('he did not → show it and keep it', () => {
    expect(moveFromContext({ speed01: 0.4, retreating: false, pressured: false, last: 'hesi' }, 100)).toBe('in_and_out');
  });

  it('a hesi at a BASELINE handle still leads somewhere', () => {
    // slip_slide is 68 and out of reach, but in_and_out is priced at 40 — deliberately BELOW baseline, so
    // the first thing a fresh scan learns past the basics is the one that comes off a hesitation
    const m = moveFromContext({ speed01: 0.4, retreating: false, pressured: true, last: 'hesi' }, BASELINE_HANDLE);
    expect(m).toBe('in_and_out');
    expect(MOVE_HANDLE.in_and_out).toBeLessThanOrEqual(BASELINE_HANDLE);
  });
});

describe('the reads read', () => {
  it('space and no hurry is the yo-yo; a body on you is not', () => {
    expect(moveFromContext({ speed01: 0.2, retreating: false, pressured: false, last: null }, 100)).toBe('yoyo');
    expect(moveFromContext({ speed01: 0.2, retreating: false, pressured: true, last: null }, 100)).toBe('between_legs');
  });

  it('THE GATE STILL HOLDS — a baseline handle gets the basics and nothing else, from any read', () => {
    for (const r of [
      { speed01: 0.2, retreating: false, pressured: false, last: null },
      { speed01: 0.8, retreating: false, pressured: true, last: 'crossover' as const, chainLength: 3 },
      { speed01: 0.2, retreating: false, pressured: true, last: 'crossover' as const, chainLength: 2, inHisChest: true },
    ]) {
      const m = moveFromContext(r, BASELINE_HANDLE);
      expect(MOVE_HANDLE[m], m).toBeLessThanOrEqual(BASELINE_HANDLE);
    }
  });

  it('and it never returns the move you just did', () => {
    for (const last of Object.keys(MOVE_HANDLE) as HandleMove[]) {
      const m = moveFromContext({ speed01: 0.5, retreating: false, pressured: true, last, chainLength: 2, inHisChest: true }, 100);
      if (m !== 'crossover') expect(m, `after ${last}`).not.toBe(last);
    }
  });
});

describe('OFF THE HEAD is the only move that can cost you the ball', () => {
  const close = { handle: 100, dist: 0.9, facingCos: 0.8, defenderSpeed: 0 };

  it('chest to chest and facing you: it is on', () => {
    expect(offTheHeadOdds(close)).toBeGreaterThan(0.5);
  });

  it('out of range: not a move, zero odds — never a "try anyway"', () => {
    expect(offTheHeadOdds({ ...close, dist: OFF_THE_HEAD_RANGE + 0.2 })).toBe(0);
  });

  it('turned away: you do not throw it off the back of his head', () => {
    expect(offTheHeadOdds({ ...close, facingCos: -0.5 })).toBe(0);
  });

  it('a moving target is worse', () => {
    expect(offTheHeadOdds({ ...close, defenderSpeed: 2.5 })).toBeLessThan(offTheHeadOdds(close));
  });

  it('a bigger handle is better, but it is NEVER a certainty', () => {
    expect(offTheHeadOdds({ ...close, handle: 100 })).toBeGreaterThan(offTheHeadOdds({ ...close, handle: 92 }));
    expect(offTheHeadOdds({ ...close, handle: 100 })).toBeLessThan(1);
  });

  it('AND WHEN IT MISSES THE BALL IS BEHIND HIM — the worst place for you', () => {
    const dir = offTheHeadLoose(new Vector3(0, 0, 0), new Vector3(0, 0, 2));
    expect(dir.z).toBeCloseTo(1, 6);          // past him, away from me
    expect(dir.length()).toBeCloseTo(1, 6);
  });

  it('a move that is pure upside at the top of a progression is a dominant strategy, so this one is not', () => {
    // it is the most expensive move in the table AND the only one with a failure mode
    expect(MOVE_HANDLE.off_the_head).toBeGreaterThanOrEqual(Math.max(...Object.values(MOVE_HANDLE)));
    expect(offTheHeadOdds(close)).toBeLessThan(1);
  });
});

// ── WHICH MOVE YOU THREW HAS TO MATTER (2026-09-13) ──────────────────────────────────────────────────────
//
// `ankleBreakOdds` took no move. A yo-yo and a shammgod at the same chain depth broke ankles identically,
// so past the gate the whole vocabulary was cosmetic: earning handle 88 bought a move that did exactly what
// the free one did. Danger is derived from MOVE_HANDLE so a move's cost and its payoff cannot disagree.

describe('moveDanger', () => {
  it('a plain crossover is the baseline', () => {
    expect(moveDanger('crossover')).toBe(1);
  });

  it('and everything you have to earn is worth more than it', () => {
    for (const m of Object.keys(MOVE_HANDLE) as HandleMove[]) {
      if (MOVE_HANDLE[m] === 0) continue;
      expect(moveDanger(m), m).toBeGreaterThan(moveDanger('crossover'));
    }
  });

  it('DANGER TRACKS PRICE EXACTLY — one number, not two opinions', () => {
    const moves = (Object.keys(MOVE_HANDLE) as HandleMove[]).sort((a, b) => MOVE_HANDLE[a] - MOVE_HANDLE[b]);
    for (let i = 1; i < moves.length; i++) {
      const cheaper = moves[i - 1], dearer = moves[i];
      if (MOVE_HANDLE[cheaper] === MOVE_HANDLE[dearer]) continue;
      expect(moveDanger(dearer), `${dearer} vs ${cheaper}`).toBeGreaterThan(moveDanger(cheaper));
    }
  });

  it('an unnamed move is a plain one — old callers keep the odds they had', () => {
    expect(moveDanger(undefined)).toBe(1);
  });
});

describe('the odds respect the move', () => {
  const read = { chainLength: 2, handle: 95, defenderClosing: true, defenderSet: false };

  it('a shammgod is more dangerous than a crossover from the same spot', () => {
    expect(ankleBreakOdds({ ...read, move: 'shammgod' }))
      .toBeGreaterThan(ankleBreakOdds({ ...read, move: 'crossover' }));
  });

  it('but a SET defender is still barely breakable, whatever you throw', () => {
    const set = { ...read, defenderSet: true };
    expect(ankleBreakOdds({ ...set, move: 'shammgod' })).toBe(ankleBreakOdds({ ...set, move: 'crossover' }));
    expect(ankleBreakOdds({ ...set, move: 'shammgod' })).toBeLessThan(0.1);
  });

  it('and nothing is ever a certainty', () => {
    for (const m of Object.keys(MOVE_HANDLE) as HandleMove[]) {
      const o = ankleBreakOdds({ chainLength: 4, handle: 100, defenderClosing: true, defenderSet: false, move: m });
      expect(o, m).toBeLessThanOrEqual(0.92);
      expect(o, m).toBeGreaterThan(0);
    }
  });

  it('the resolver passes the move through, so this is live and not just a helper', () => {
    const on = { present: true, closing: true, set: false, within: true };
    const cheap = resolveHandleMove('crossover', { ...CHAIN_IDLE }, 100, on, () => 1);
    const dear = resolveHandleMove('snatch_back', { ...CHAIN_IDLE }, 100, on, () => 1);
    expect(dear.odds).toBeGreaterThan(cheap.odds);
  });
});

// ── A MOVE NAMED FOR A MOVEMENT SHOULD MOVE YOU (2026-09-13) ─────────────────────────────────────────────
//
// Every handle move produced the same body: a chain link, a whoosh, a roll. `slip_slide` is literally named
// for going past his hip and left you standing still.

describe('moveImpulse', () => {
  it('THE FAKES MOVE YOU NOTHING — that is what makes them lies', () => {
    for (const m of ['hesi', 'yoyo', 'in_and_out'] as const) {
      expect(movesTheBody(m), m).toBe(false);
    }
  });

  it('and the evasions do', () => {
    for (const m of ['slip_slide', 'behind_back', 'double_cross', 'crossover', 'between_legs'] as const) {
      expect(movesTheBody(m), m).toBe(true);
    }
  });

  it('slip and slide is the most SIDEWAYS thing in the vocabulary — it goes past his hip', () => {
    const slip = moveImpulse('slip_slide');
    expect(slip.lateral).toBeGreaterThan(slip.forward);
    for (const m of ['crossover', 'behind_back', 'between_legs', 'double_cross'] as const) {
      expect(slip.lateral, m).toBeGreaterThan(moveImpulse(m).lateral);
    }
  });

  it('a shammgod goes FORWARD — you push it out and go', () => {
    const sham = moveImpulse('shammgod');
    expect(sham.forward).toBeGreaterThan(sham.lateral);
    expect(sham.forward).toBeGreaterThan(0);
  });

  it('a snatch-back goes BACKWARD — the ball and the body both come back', () => {
    expect(moveImpulse('snatch_back').forward).toBeLessThan(0);
  });

  it('the moves with their own resolution paths add no impulse of their own', () => {
    // `spin` has the spin machinery and `off_the_head` throws the ball; a second impulse here would
    // fight whatever those are already doing to the body
    expect(movesTheBody('spin')).toBe(false);
    expect(movesTheBody('off_the_head')).toBe(false);
  });

  it('no impulse is large enough to read as a teleport', () => {
    for (const m of Object.keys(MOVE_HANDLE) as HandleMove[]) {
      const i = moveImpulse(m);
      expect(Math.hypot(i.forward, i.lateral), m).toBeLessThan(4);
    }
  });
});

// ── THE BODY FOR EACH MOVE (2026-09-16) ────────────────────────────────────────────────────────────────────────
describe('MOVE_CLIP', () => {
  it('every move in the vocabulary is accounted for — a new one cannot be added and silently left bodiless', () => {
    // This is the test that would have caught the original fault: twelve moves, three clips, and the tree playing
    // `bball_crossover_left` for all of them. A move is either given a clip here or explicitly marked null.
    for (const move of Object.keys(MOVE_HANDLE) as HandleMove[]) {
      expect(MOVE_CLIP).toHaveProperty(move);
    }
  });

  it('the sided moves name a different clip for each side — that was the bug, on the crossover itself', () => {
    for (const move of ['crossover', 'in_and_out', 'between_legs', 'behind_back', 'double_cross', 'shammgod'] as HandleMove[]) {
      const l = moveClip(move, 'left'), r = moveClip(move, 'right');
      expect(l).toBeTruthy(); expect(r).toBeTruthy();
      expect(l).not.toBe(r);
    }
  });

  it('the sideless ones give the same clip either way, and the mode-owned ones give none', () => {
    for (const move of ['hesi', 'yoyo', 'snatch_back'] as HandleMove[]) {
      expect(moveClip(move, 'left')).toBe(moveClip(move, 'right'));
      expect(moveClip(move, 'left')).toBeTruthy();
    }
    // a spin turns the whole body and an off-the-head throws the ball at somebody: the modes render those
    expect(moveClip('spin', 'left')).toBeNull();
    expect(moveClip('off_the_head', 'left')).toBeNull();
  });

  it('every clip named here is a basketball clip, not a borrowed karate one', () => {
    for (const move of Object.keys(MOVE_HANDLE) as HandleMove[]) {
      const c = moveClip(move, 'right');
      if (c) expect(c).toMatch(/^bball_/);
    }
    expect(ANKLE_STUMBLE_CLIP).toMatch(/^bball_/);   // it was karate_hit_react
    expect(ANKLE_SLIP_CLIP).toMatch(/^bball_/);      // and karate_knockdown
  });
});
