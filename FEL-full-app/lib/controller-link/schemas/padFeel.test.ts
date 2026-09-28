// MUSIC-SUITE P5 (2026-09-25), phone-mpc — the phone's pad feel (padFeel.ts): the velocity rule ("where supported … never
// invent it"), the buzz ("iOS Safari has no vibrate — say so, no fake"), and what a press sends. The page that uses them
// is pinned unchanged for every other mode in components/controller-link/controller-page.test.tsx.
import { describe, expect, it, vi } from 'vitest';
import {
  CONTACT_FLOOR, HIT_BUZZ_MS, MIN_VELOCITY, buzz, canBuzz, contactOf, feelLine, forceOf, freshVelocityState, hasHints, hintsOf,
  pressMessage, readVelocity, type TouchSample, type VelocityReading, type VelocityState,
} from './padFeel';
import { MODE_CONTROLLERS } from './registry';

/** Feed presses through the rule in order; the readings come back in order. */
function presses(samples: TouchSample[], s0: VelocityState = freshVelocityState()): VelocityReading[] {
  let s = s0;
  return samples.map((x) => { const r = readVelocity(s, x); s = r.state; return r; });
}
const touch = (o: Partial<TouchSample>): TouchSample => ({ pointerType: 'touch', ...o });

describe('the velocity rule: measured, or fixed — never invented', () => {
  it('a phone that reports nothing (pressure 0.5 placeholder, 1 × 1 contact) plays FIXED on every hit', () => {
    const r = presses(Array.from({ length: 20 }, () => touch({ pressure: 0.5, width: 1, height: 1 })));
    expect(r.every((x) => x.v === null && x.via === 'fixed')).toBe(true);
  });

  it('a constant force (some Android builds say 1 on every touch) is not a measurement either', () => {
    const r = presses(Array.from({ length: 10 }, () => touch({ force: 1, pressure: 1 })));
    expect(r.every((x) => x.via === 'fixed')).toBe(true);
  });

  it('a mouse has no force: its pressure (0.5 while pressed) and size are ignored', () => {
    const r = presses([{ pointerType: 'mouse', pressure: 0.5, width: 1, height: 1 }, { pointerType: 'mouse', pressure: 0.9, width: 30, height: 30 }]);
    expect(r.map((x) => x.via)).toEqual(['fixed', 'fixed']);
    expect(forceOf({ pointerType: 'mouse', pressure: 0.9 })).toBeNull();
    expect(contactOf({ pointerType: 'mouse', width: 30, height: 30 })).toBeNull();
  });

  it('FORCE once it has varied: the first press is fixed, the next differing one is measured (sqrt, floored)', () => {
    const r = presses([touch({ pressure: 0.3 }), touch({ pressure: 0.64 }), touch({ pressure: 0.01 }), touch({ pressure: 1 })]);
    expect(r[0]).toMatchObject({ v: null, via: 'fixed' });
    expect(r[1].via).toBe('force');
    expect(r[1].v).toBeCloseTo(0.8, 9);                          // sqrt(0.64): a firm press is loud, not 0.64
    expect(r[2].v).toBe(MIN_VELOCITY);                           // sqrt(0.01) = 0.1 → floored: a feather is still heard
    expect(r[3].v).toBe(1);
  });

  it('Touch.force wins over PointerEvent.pressure when both are there', () => {
    expect(forceOf(touch({ force: 0.25, pressure: 0.5 }))).toBe(0.25);
    expect(forceOf(touch({ force: 0, pressure: 0.4 }))).toBe(0.4);   // force 0 = "not reported"
  });

  it('a wobble under FORCE_VARY_MIN is not variation', () => {
    const r = presses([touch({ pressure: 0.5 }), touch({ pressure: 0.51 }), touch({ pressure: 0.505 })]);
    expect(r.every((x) => x.via === 'fixed')).toBe(true);
  });

  it('CONTACT SIZE as the proxy only when force never varied and the size does: relative to the session, CONTACT_FLOOR..1', () => {
    const r = presses([
      touch({ pressure: 0.5, width: 20, height: 20 }),
      touch({ pressure: 0.5, width: 40, height: 40 }),
      touch({ pressure: 0.5, width: 30, height: 30 }),
      touch({ pressure: 0.5, width: 20, height: 20 }),
    ]);
    expect(r[0].via).toBe('fixed');                              // one size is not a spread
    expect(r.slice(1).map((x) => x.via)).toEqual(['contact', 'contact', 'contact']);
    expect(r[1].v).toBe(1);                                      // the biggest so far
    expect(r[2].v).toBeCloseTo(CONTACT_FLOOR + (1 - CONTACT_FLOOR) * 0.5, 9);
    expect(r[3].v).toBe(CONTACT_FLOOR);                          // the smallest still plays
  });

  it('Touch radii are read before PointerEvent width/height, and 1 × 1 (the spec\'s "cannot measure") never spreads', () => {
    expect(contactOf(touch({ radiusX: 10, radiusY: 14, width: 1, height: 1 }))).toBe(12);
    expect(contactOf(touch({ width: 24, height: 16 }))).toBe(10);
    const r = presses([touch({ width: 1, height: 1 }), touch({ width: 1, height: 1 })]);
    expect(r.map((x) => x.via)).toEqual(['fixed', 'fixed']);
  });

  it('force that varies is preferred to contact that varies', () => {
    const r = presses([touch({ pressure: 0.2, width: 10, height: 10 }), touch({ pressure: 0.8, width: 40, height: 40 })]);
    expect(r[1].via).toBe('force');
  });

  it('the rule is pure: the state given is not changed', () => {
    const s = freshVelocityState();
    const snap = JSON.stringify(s);
    readVelocity(s, touch({ pressure: 0.7 }));
    expect(JSON.stringify(s)).toBe(snap);
  });
});

describe('what a press sends', () => {
  const pad = { action: 'pad_4', label: '5' };
  it('no hint (every other mode): the bare action, exactly as before', () => {
    expect(pressMessage(pad, undefined, { v: 0.9, via: 'force' })).toEqual(['pad_4']);
    expect(pressMessage(pad, {}, null)).toEqual(['pad_4']);
  });
  it('velocity hint + a measured velocity: { v, via } rides along', () => {
    expect(pressMessage(pad, { velocity: true }, { v: 0.73219, via: 'force' })).toEqual(['pad_4', { v: 0.732, via: 'force' }]);
    expect(pressMessage(pad, { velocity: true }, { v: 0.5, via: 'contact' })).toEqual(['pad_4', { v: 0.5, via: 'contact' }]);
  });
  it('velocity hint but nothing measured: the bare action (the host plays its fixed level — no invented number)', () => {
    expect(pressMessage(pad, { velocity: true }, { v: null, via: 'fixed' })).toEqual(['pad_4']);
  });
  it('a hold button keeps its :down, whatever the hints', () => {
    expect(pressMessage({ action: 'charge', label: 'RUN', hold: true }, { velocity: true, haptics: true }, { v: 1, via: 'force' })).toEqual(['charge:down']);
  });
});

describe('haptics: a buzz where the phone has one, the truth where it does not', () => {
  it('buzzes HIT_BUZZ_MS (10–15 ms) once per hit where navigator.vibrate exists (Android)', () => {
    const vibrate = vi.fn(() => true);
    expect(HIT_BUZZ_MS).toBeGreaterThanOrEqual(10);
    expect(HIT_BUZZ_MS).toBeLessThanOrEqual(15);
    expect(buzz({ vibrate })).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(HIT_BUZZ_MS);
  });
  it('iOS Safari has no navigator.vibrate: no buzz, no throw, and canBuzz says so', () => {
    expect(canBuzz({})).toBe(false);
    expect(buzz({})).toBe(false);
    expect(buzz(null)).toBe(false);
    expect(buzz({ vibrate: () => { throw new Error('blocked'); } })).toBe(false);   // a refusal never breaks the hit
  });
  it('the feel line says what this phone does — including that it cannot buzz', () => {
    expect(feelLine(undefined, { buzz: true }, null)).toBeNull();
    expect(feelLine({ haptics: true, velocity: true }, { buzz: false }, 'fixed')).toBe('no buzz on this phone (its browser has no vibration — iPhones never do) · fixed velocity (this phone reports no pressure)');
    expect(feelLine({ haptics: true, velocity: true }, { buzz: true }, 'force')).toBe('buzz on each hit · velocity: how hard you press');
    expect(feelLine({ haptics: true }, { buzz: null }, null)).toBeNull();          // not known yet (a server render): says nothing
  });
});

describe('the hints are opt-in: only the Flip asks', () => {
  it('no mode but music_flip sets a hint (every other controller renders as it did)', () => {
    for (const [id, c] of Object.entries(MODE_CONTROLLERS)) {
      const h = hintsOf(c.schemas);
      if (id === 'music_flip') expect(h).toEqual({ haptics: true, velocity: true, compact: true });
      else expect(hasHints(h), id).toBe(false);
    }
  });
});
