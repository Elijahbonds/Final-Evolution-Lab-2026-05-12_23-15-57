// MOVEMENT PLAY P8 (2026-09-26): the READY screen's stance line (rideStance) and the store's stance writer (sessionStore
// setStance): asked while the stance is held (the ring), REGULAR / GOOFY once the lead is measured, the square fallback
// after 3 s facing; written only for a row that steers with the carve, and only on a change (the ring in tenths).
import { describe, it, expect, afterEach } from 'vitest';
import { stanceLine, STANCE_ASK, STANCE_REGULAR, STANCE_GOOFY, STANCE_SQUARE } from './rideStance';
import { sessionStore, stanceOnMount, type SessionWriter } from '@/lib/babylon/core/sessionStore';
import { RIDE_ROWS_ON } from '@/lib/input/rideProfiles';
import { BODY_PROFILES } from '@/lib/input/bodyProfiles';
import { NO_RIDE, type RideRead } from '@/lib/pose/rideReader';

// the table's rows by key, with the ride switch on for the kart and the plane (as the probe grades them)
const ROW = Object.fromEntries([...Object.values(BODY_PROFILES), ...RIDE_ROWS_ON].map((p) => [p.key, p]));
const side = (lead: 'L' | 'R') => ({ kind: 'side' as const, lead, yawDeg: lead === 'L' ? -45 : 45, n: { x: 0, z: 1 }, b: { x: 1, z: 0 }, neutral: 0, t: 0 });
const ride = (o: Partial<RideRead>): RideRead => ({ ...NO_RIDE, ...o } as RideRead);

describe('stanceLine', () => {
  it('no stance view (not a carve-steered board game): no line — the READY line stays the plain one', () => {
    expect(stanceLine(undefined)).toBeNull();
    expect(stanceLine(null)).toBeNull();
  });
  it('held: the ask, with the ring; taken: REGULAR for a left lead, GOOFY for a right lead; the square fallback says side-on works best', () => {
    expect(stanceLine({ kind: null, lead: null, hold01: 0.4 })).toEqual({ id: 'ask', text: STANCE_ASK, ring: 0.4 });
    expect(stanceLine({ kind: 'side', lead: 'L', hold01: 1 })).toEqual({ id: 'regular', text: STANCE_REGULAR, ring: null });
    expect(stanceLine({ kind: 'side', lead: 'R', hold01: 1 })).toEqual({ id: 'goofy', text: STANCE_GOOFY, ring: null });
    expect(stanceLine({ kind: 'square', lead: null, hold01: 1 })).toEqual({ id: 'square', text: STANCE_SQUARE, ring: null });
  });
  it('the words the plan gives (PLAN-P8 §3.2): lead shoulder to the screen; left foot forward is regular', () => {
    expect(STANCE_ASK).toMatch(/side-on, lead shoulder to the screen/);
    expect(STANCE_REGULAR).toMatch(/^REGULAR \(left foot forward\)/);
    expect(STANCE_GOOFY).toMatch(/^GOOFY \(right foot forward\)/);
  });
});

describe('sessionStore.setStance', () => {
  let w: SessionWriter | null = null;
  afterEach(() => { w?.unmount(); w = null; });
  const mount = (key: string) => (w = sessionStore.mount({ modeId: key, key, lines: [], drives: true, later: 'P8' }));

  it('a carve row: the ring in tenths (a new snapshot only when it moves a tenth), then the stance taken', () => {
    const wr = mount('skateboard');
    let n = 0;
    const off = sessionStore.subscribe(() => n++);
    wr.setStance(ROW.skateboard, ride({ stanceHold01: 0.31 }));
    expect(sessionStore.view().stance).toEqual({ kind: null, lead: null, hold01: 0.3 });
    wr.setStance(ROW.skateboard, ride({ stanceHold01: 0.37 }));
    expect(n).toBe(1);
    wr.setStance(ROW.skateboard, ride({ stanceHold01: 0.41 }));
    expect(n).toBe(2);
    wr.setStance(ROW.skateboard, ride({ stance: side('R'), stanceHold01: 1 }));
    expect(sessionStore.view().stance).toEqual({ kind: 'side', lead: 'R', hold01: 1 });
    off();
  });
  it('not a carve row (big air, sprint, the kart): nothing written; a stale writer writes nothing', () => {
    for (const k of ['bigair', 'sprint', 'velocitykart', 'freerun']) {
      const wr = mount(k);
      wr.setStance(ROW[k], ride({ stance: side('L'), stanceHold01: 1 }));
      expect(sessionStore.view().stance, k).toBeUndefined();
      wr.unmount(); w = null;
    }
    const old = mount('skateboard');
    const cur = sessionStore.mount({ modeId: 'surf', key: 'surf', lines: [], drives: true, later: 'P8' });
    old.setStance(ROW.skateboard, ride({ stance: side('L') }));
    expect(sessionStore.view().stance).toBeUndefined();
    cur.unmount();
  });
});

describe('stanceOnMount (R-F1): the mount\'s own snapshot carries the stance ask, only for a carve row', () => {
  let w: SessionWriter | null = null;
  afterEach(() => { w?.unmount(); w = null; });
  it('a carve row asks at mount (one snapshot, no extra write); any other row has none', () => {
    expect(stanceOnMount(ROW.skateboard)).toEqual({ kind: null, lead: null, hold01: 0 });
    for (const k of ['bigair', 'sprint', 'velocitykart', 'aeroaces', 'freerun', 'dunk']) expect(stanceOnMount(ROW[k] ?? { bindings: [] } as never), k).toBeUndefined();
    let n = 0;
    const off = sessionStore.subscribe(() => n++);
    w = sessionStore.mount({ modeId: 'skateboard', key: 'skateboard', lines: [], drives: true, later: 'P8', stance: stanceOnMount(ROW.skateboard) });
    expect(n).toBe(1);
    expect(sessionStore.view().stance).toEqual({ kind: null, lead: null, hold01: 0 });
    w.unmount(); w = null;
    w = sessionStore.mount({ modeId: 'bigair', key: 'bigair', lines: [], drives: true, later: 'P8', stance: stanceOnMount(ROW.bigair) });
    expect(sessionStore.view().stance).toBeUndefined();
    expect('stance' in sessionStore.view()).toBe(false);
    off();
  });
});
