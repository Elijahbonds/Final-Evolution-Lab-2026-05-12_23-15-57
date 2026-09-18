// BOARD-10PHASE P7 — smoothness, as the part of it a test can actually hold.
//
// The owner reported the board animations as rough. Phase 7 went looking for the cause in source and did not find
// one: all three board modes mount the posture layer, apply `angulate` so the rider counter-angles against the
// board's bank instead of rolling as one rigid piece, run the BoardTrickLayer after posture so the grab hand is
// the last word, and carry per-state crossfades plus carve hysteresis whose comment records the defect it fixed
// ("a 0.33 m hand snap per flip"). That is a worked animation layer, not a neglected one.
//
// So this phase does NOT ship a speculative fix. What it ships is the regression guard for the class of defect
// that produces visible snapping and CAN be checked without eyes: a state machine that changes its mind on
// alternating frames, or a transition with no time to blend. Whatever is actually rough on screen needs a run to
// find, and that is recorded as an open item rather than guessed at.

import { describe, expect, it } from 'vitest';
import { CARVE_ON, chooseBoardClip, type BoardAnimInput, type BoardAnimState } from './boardTree';

const base: BoardAnimInput = {
  speed01: 0.5, pushing: false, lean: 0, airborne: false, grabHeld: false,
  flipping: false, spinning: false, grinding: false, manual: false,
  landing: 'none', bailing: false,
};
const I = (o: Partial<BoardAnimInput> = {}): BoardAnimInput => ({ ...base, ...o });

/** Run the chooser as the mode does — feeding it its own previous state. */
function run(inputs: BoardAnimInput[]): BoardAnimState[] {
  let prev: BoardAnimState | null = null;
  return inputs.map((i) => { const r = chooseBoardClip(i, prev); prev = r.state; return r.state; });
}

describe('the clip chooser never flickers', () => {
  it('holds one state for an unchanging input', () => {
    // a chooser that alternates restarts the crossfade from weight 0 every frame, which IS the snap
    const states = run(Array.from({ length: 120 }, () => I({ lean: 0.2 })));
    expect(new Set(states).size).toBe(1);
  });

  it('does not oscillate on a lean sitting exactly on the carve threshold', () => {
    // the documented failure: a lean hovering on one threshold flipped the state every frame
    const states = run(Array.from({ length: 200 }, () => I({ lean: CARVE_ON })));
    expect(new Set(states).size).toBe(1);
  });

  it('does not oscillate on a lean jittering around the threshold', () => {
    const states = run(Array.from({ length: 300 }, (_, i) =>
      I({ lean: CARVE_ON + Math.sin(i * 1.7) * 0.06 })));
    let flips = 0;
    for (let i = 1; i < states.length; i++) if (states[i] !== states[i - 1]) flips++;
    // hysteresis should make this nearly still; a handful of flips over 300 frames, not hundreds
    expect(flips).toBeLessThan(6);
  });

  it('does not oscillate on speed jitter either', () => {
    const states = run(Array.from({ length: 300 }, (_, i) =>
      I({ speed01: 0.3 + Math.sin(i * 2.3) * 0.02 })));
    expect(new Set(states).size).toBeLessThanOrEqual(2);
  });

  it('crosses a real lean once and stays there', () => {
    const states = run([
      ...Array.from({ length: 30 }, () => I({ lean: 0 })),
      ...Array.from({ length: 60 }, () => I({ lean: 0.8 })),
    ]);
    let flips = 0;
    for (let i = 1; i < states.length; i++) if (states[i] !== states[i - 1]) flips++;
    expect(flips).toBe(1);
  });
});

describe('every transition has time to blend', () => {
  const STATES: BoardAnimInput[] = [
    I(), I({ pushing: true }), I({ lean: 0.9 }), I({ lean: -0.9 }), I({ tucking: true }),
    I({ popping: true }), I({ airborne: true }), I({ airborne: true, grabHeld: true }),
    I({ airborne: true, flipping: true }), I({ airborne: true, spinning: true }),
    I({ grinding: true }), I({ manual: true }), I({ landing: 'clean' }),
    I({ landing: 'sketchy' }), I({ bailing: true }), I({ celebrating: true }),
  ];

  it('gives every reachable state a non-zero crossfade', () => {
    for (const i of STATES) {
      const r = chooseBoardClip(i, null);
      expect(r.fadeSec, r.state).toBeGreaterThan(0);
    }
  });

  it('keeps even the snappiest transition long enough to read as a blend', () => {
    // 0.05 s is three frames at 60 Hz — the floor below which a crossfade is a cut
    for (const i of STATES) {
      const r = chooseBoardClip(i, null);
      expect(r.fadeSec, r.state).toBeGreaterThanOrEqual(0.05);
    }
  });

  it('fades the held, looping states more slowly than the one-shot beats', () => {
    // a cruise or a carve is a pose you live in; an ollie or a bail is an event
    const cruise = chooseBoardClip(I(), null);
    const bail = chooseBoardClip(I({ bailing: true }), null);
    expect(cruise.fadeSec).toBeGreaterThan(bail.fadeSec);
    expect(cruise.loop).toBe(true);
    expect(bail.loop).toBe(false);
  });

  it('names a clip for every state it can reach', () => {
    for (const i of STATES) {
      const r = chooseBoardClip(i, null);
      expect(r.clip, r.state).toBeTruthy();
      expect(r.clip, r.state).not.toBe('');
    }
  });

  it('never returns the ride idle for a manual, which is what made the link invisible', () => {
    const r = chooseBoardClip(I({ manual: true }), null);
    expect(r.clip).not.toBe('board_ride_idle');
  });
});
