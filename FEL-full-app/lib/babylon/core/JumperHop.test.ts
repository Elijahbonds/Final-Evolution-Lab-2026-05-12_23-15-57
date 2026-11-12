// lane/h3-handler (#314 port, core/JumperHop): the jump shot's hop — the load on the floor, the apex just after the release frame, a body's
// own air time, a hang (not a loop) on a late release. And THE RELEASE IS NEVER MOVED: the clip's release key lands at the same moment of
// the rise with the hop and the hang on or off (the meter, its green and its grades are ShotWindow's, untouched — ShotWindow.test).
import { afterEach, describe, expect, it } from 'vitest';
import { jumperHop, jumperHopY, legacyHopY, JumperRise, JUMPER_G, JUMPER_APEX_AFTER_RELEASE_SEC, JUMPER_MIN_LOAD_SEC, JUMPER_HANG_SCALE, LEGACY_LAND_AFTER_RISE_SEC } from './JumperHop';
import { syncedShotSpeed, RELEASE_FRAME_01 } from './BallHandling';
import { openFeel, closeFeel } from '../../../tests/helpers/feelOverrides';

const APEX = 0.3;   // the modes' JUMPER_HOP_APEX (unchanged)
const DT = 1 / 60;
afterEach(() => closeFeel());

describe('the hop (jumperHop, #314)', () => {
  for (const [label, rise] of [['open', 0.72], ['contested', 0.5]] as const) {
    it(`${label} (rise ${rise} s, green at 0.62): the load on the floor, the apex just after the release, a body's own air time`, () => {
      const h = jumperHop(rise, 0.62, APEX);
      expect(h.releaseSec).toBeCloseTo(0.62 * rise, 9);
      expect(h.apexSec - h.releaseSec).toBeCloseTo(JUMPER_APEX_AFTER_RELEASE_SEC, 9);   // the ball leaves at the top, a hair before it
      expect(h.takeoffSec).toBeGreaterThanOrEqual(JUMPER_MIN_LOAD_SEC);                  // the dip happens on the floor
      expect(h.airSec).toBeCloseTo(2 * Math.sqrt(2 * APEX / JUMPER_G), 9);                // 0.49 s for 0.30 m
      expect(jumperHopY(h, h.takeoffSec * 0.5)).toBe(0);
      expect(jumperHopY(h, h.apexSec)).toBeCloseTo(APEX, 6);
      expect(jumperHopY(h, h.landSec + 0.01)).toBe(0);
      let prev = 0; for (let t = h.takeoffSec; t <= h.apexSec; t += 0.005) { const y = jumperHopY(h, t); expect(y).toBeGreaterThanOrEqual(prev - 1e-9); prev = y; }
    });
  }
  it('a release too early for the load leaves the floor after the load and keeps the air time (the apex later)', () => {
    const h = jumperHop(0.3, 0.3, APEX);   // release at 0.09 s
    expect(h.takeoffSec).toBe(JUMPER_MIN_LOAD_SEC);
    expect(h.landSec - h.takeoffSec).toBeCloseTo(h.airSec, 9);
  });
  it('TUNED (flagged): the air time 0.88–1.02 s → 0.49 s; the knob off is the old sine exactly', () => {
    for (const rise of [0.56, 0.6, 0.7]) {
      const on = new JumperRise(rise, 0.62, APEX, 1);
      expect(on.airSec).toBeCloseTo(0.4946, 3);
      openFeel({ 'hoops.jumperHopOn': 0 });
      const off = new JumperRise(rise, 0.62, APEX, 1); closeFeel();
      expect(off.airSec).toBeCloseTo(rise + LEGACY_LAND_AFTER_RISE_SEC, 9);
      for (let t = DT; t < off.landSec; t += DT) expect(off.step(DT, false).y).toBeCloseTo(Math.max(0, Math.sin(Math.min(1, t / (rise + 0.32)) * Math.PI) * APEX), 9);
      expect(legacyHopY(rise, APEX, rise + 0.32)).toBeLessThan(1e-9);
    }
  });
});

/** The mode's rise, played out: the clip held at `sync` from the rise's start, the hang's new pace applied the frame it comes. When does the
 *  clip reach its release key (RELEASE_FRAME_01 of its length)? `releaseAt`: when the player lets go (the 'load' window ends), s. */
function releaseKeyAt(knobs: Record<string, number> | null, riseSec: number, green: number, releaseAt: number, clipSec = 1.1): { keyAt: number; hangAt: number | null; sync: number } {
  if (knobs) openFeel(knobs);
  const sync = syncedShotSpeed(clipSec, riseSec, green, RELEASE_FRAME_01);   // the mode's own line, untouched
  const rise = new JumperRise(riseSec, green, APEX, sync);
  let clipT = 0, scale = sync, keyAt = -1, hangAt: number | null = null, t = 0;
  for (let i = 0; i < 200; i++) {
    t += DT; clipT += scale * DT;
    if (keyAt < 0 && clipT >= RELEASE_FRAME_01 * clipSec) keyAt = t;
    const f = rise.step(DT, t < releaseAt);
    if (f.clipScale !== null) { scale = f.clipScale; hangAt = t; }
    if (f.land) break;
  }
  closeFeel();
  return { keyAt, hangAt, sync };
}

describe('the release is never moved (the timing windows and the release frame)', () => {
  const cases = [[0.72, 0.62], [0.5, 0.62], [0.6, 0.55]] as const;
  for (const [rise, green] of cases) {
    it(`rise ${rise} s, green ${green}: the clip's release key lands on the green — the same frame with the hop / the hang on or off`, () => {
      const ref = releaseKeyAt({ 'hoops.jumperHopOn': 0, 'hoops.jumperHangOn': 0 }, rise, green, 9);   // the old rise exactly
      expect(ref.keyAt).toBeCloseTo(green * rise, 1);
      for (const knobs of [null, { 'hoops.jumperHangOn': 0 }, { 'hoops.jumperHopOn': 0 }]) {
        for (const releaseAt of [green * rise - 0.1, green * rise, green * rise + 0.15, 9]) {   // early, on the green, late, never (held)
          const r = releaseKeyAt(knobs, rise, green, releaseAt);
          expect(r.sync).toBe(ref.sync);                     // the clip's pace: syncedShotSpeed's, as before
          expect(r.keyAt).toBe(ref.keyAt);                   // the release key: the same frame
          if (r.hangAt !== null) expect(r.hangAt).toBeGreaterThanOrEqual(r.keyAt);   // a hang only ever starts once the key is reached
        }
      }
    });
  }
  it('the hang: a late release holds the set point at JUMPER_HANG_SCALE of the pace; an on-time one never hangs', () => {
    const late = releaseKeyAt(null, 0.72, 0.62, 9);
    expect(late.hangAt).not.toBeNull();
    const r = new JumperRise(0.72, 0.62, APEX, 1.3); let s: number | null = null;
    for (let t = DT; t < 0.7; t += DT) { const f = r.step(DT, true); if (f.clipScale !== null) s = f.clipScale; }
    expect(s).toBeCloseTo(1.3 * JUMPER_HANG_SCALE, 9);
    expect(releaseKeyAt(null, 0.72, 0.62, 0.62 * 0.72 - DT).hangAt).toBeNull();
  });
  it('the body is at its top as the ball leaves: within 1 cm of the apex on a green release, still rising to it', () => {
    for (const [rise, green] of cases) {
      const h = jumperHop(rise, green, APEX);
      expect(APEX - jumperHopY(h, h.releaseSec)).toBeLessThan(0.01);
      expect(jumperHopY(h, h.releaseSec + 0.01)).toBeGreaterThan(jumperHopY(h, h.releaseSec));
    }
  });
});
