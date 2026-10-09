// IMPROVE (2026-10-06, surf items 10-20): the pure rules SurfBreakMode's improvements feed (./surfBreak).
import { describe, expect, it } from 'vitest';
import {
  surfAirLeft, SURF_GRAVITY, SURF_GRAB, SURF_GRABS, surfGrabFor, grabFits, SURF_AIR_MOVES, neutralCutSign, pocketBar,
  POCKET_BAR_LIP_U, barrelVerdict, tubeRead, BuoyWatch, BUOY_WARN_AHEAD_M, NEAR_MISS_M, NEAR_MISS_COOLDOWN_SEC,
  BUOY_CONTACT_PAD_M, BUOY_WARN_LANE_M, TrimCoach, COACH_TEXT, COACH_MAX_SEC, swellWorth, setCall, rideCounts, SWELL_WORTH_MAX,
} from './surfBreak';
import { SURF_TRICKS, airTrickFor, basePts } from '../core/BoardTricks';
import { WAVE_PROFILES } from './surfLineup';
import { fitToAir, skateAirBudget } from './skateScore';

describe('item 10 — the air left', () => {
  it('is the fall from the height over the face at the rider\'s rise, and a face dropping away under him adds to it', () => {
    expect(surfAirLeft(0, 0)).toBe(0);
    const h = 1.2;
    expect(surfAirLeft(h, 0)).toBeCloseTo(Math.sqrt((2 * h) / SURF_GRAVITY), 6);
    expect(surfAirLeft(h, 0, 2)).toBeGreaterThan(surfAirLeft(h, 0));
    expect(surfAirLeft(0, 7)).toBeCloseTo((2 * 7) / SURF_GRAVITY, 6);
  });
  it('a Y with 0.05 s left throws nothing (it threw a full air and graded it a bail); with the whole air it throws the held one', () => {
    const pick = (b: number) => airTrickFor('surf', 'down', 'Y', b);
    expect(fitToAir(pick, skateAirBudget(0.9, 0.05), 0.05)).toBeNull();
    expect(fitToAir(pick, skateAirBudget(0.1, 1.2), 1.2)?.id).toBe('rodeo');
    // late in the air the rodeo steps down to a shorter air the time left can still finish
    const late = fitToAir(pick, skateAirBudget(0.7, 0.45), 0.45);
    expect(late).not.toBeNull();
    expect(late!.id).not.toBe('rodeo');
  });
});

describe('item 18 — the named grabs', () => {
  it('X across is the RAIL GRAB, up / down the SLOB, bare the plain GRAB', () => {
    expect(surfGrabFor('left')?.label).toBe('RAIL GRAB');
    expect(surfGrabFor('right')?.label).toBe('RAIL GRAB');
    expect(surfGrabFor('up')?.label).toBe('SLOB GRAB');
    expect(surfGrabFor('down')?.label).toBe('SLOB GRAB');
    expect(surfGrabFor(null)).toBeNull();
  });
  it('are grabs (no turn) with their own shapes, paying more than the plain grab (90)', () => {
    for (const g of SURF_GRABS) {
      expect(g.spinDeg + g.flipDeg).toBe(0);
      expect(g.clip).toBe('board_grab');
      expect(g.grab).not.toBe(SURF_GRAB.grab);
      expect(basePts(g)).toBeGreaterThan(90);
    }
    expect(new Set(SURF_GRABS.map((g) => g.grab)).size).toBe(SURF_GRABS.length);
    expect(SURF_AIR_MOVES.length).toBe(SURF_TRICKS.filter((t) => t.kind === 'air').length + SURF_GRABS.length);
  });
  it('a grab the air cannot hold clean is refused', () => {
    expect(grabFits(SURF_GRAB, 0.2)).toBe(false);
    expect(grabFits(SURF_GRAB, 0.6)).toBe(true);
  });
});

describe('item 16 — the neutral cutback turns back toward the curl', () => {
  it('against the heading across the wave', () => {
    expect(neutralCutSign(Math.PI / 2, 0, 0)).toBe(-1);       // heading +x → swing back toward −x
    expect(neutralCutSign(-Math.PI / 2, 0, 0)).toBe(1);
  });
  it('straight down the line: against the drift, else back to the middle of the break — never always right', () => {
    expect(neutralCutSign(0, 3, 0)).toBe(-1);
    expect(neutralCutSign(0, -3, 0)).toBe(1);
    expect(neutralCutSign(0, 0, 20)).toBe(-1);
    expect(neutralCutSign(0, 0, -20)).toBe(1);
  });
});

describe('item 12 — the pocket bar', () => {
  const POCKET = { min: 1, max: 9 }, FACE = 9;
  it('runs 0 at the wipe line to 100 at the bottom of the face, with the scored band on the same scale', () => {
    expect(pocketBar(POCKET_BAR_LIP_U, POCKET, FACE).pos).toBe(0);
    expect(pocketBar(FACE, POCKET, FACE).pos).toBe(100);
    expect(pocketBar(30, POCKET, FACE).pos).toBe(100);       // the flat
    expect(pocketBar(-3, POCKET, FACE).pos).toBe(0);
    const b = pocketBar(5, POCKET, FACE);
    expect(b.lo).toBe(16); expect(b.hi).toBe(100);
    expect(b.pos).toBeGreaterThan(b.lo); expect(b.pos).toBeLessThan(b.hi);
  });
  it('moves in steps, so the HUD hears about it when it moves and not every frame', () => {
    expect(pocketBar(3.1, POCKET, FACE).pos).toBe(pocketBar(3.15, POCKET, FACE).pos);
    expect(pocketBar(3, POCKET, FACE).pos % 2).toBe(0);
  });
});

describe('item 13 — the tube', () => {
  it('banks past the hold when worked, says so when ridden hands-off, and is nothing when short', () => {
    expect(barrelVerdict(1.2, 1.2, 1.5, 0.35)).toBe('short');
    expect(barrelVerdict(2, 0.5, 1.5, 0.35)).toBe('unworked');
    expect(barrelVerdict(2, 0.7, 1.5, 0.35)).toBe('banked');
  });
  it('the meter reads the seconds and whether the share is met', () => {
    expect(tubeRead(1.04, 0.5, 0.35)).toEqual({ tube: 1, tubeOk: true });
    expect(tubeRead(1.6, 0.2, 0.35)).toEqual({ tube: 1.6, tubeOk: false });
  });
});

describe('item 14 — the buoys: called in the line, a close pass pays', () => {
  const B = [{ x: 0, z: 20, radius: 0.9 }];
  const contact = 0.9 + BUOY_CONTACT_PAD_M;
  /** ride straight down the line at `x` from z 0 to 30 at 5 m/s, collecting the events */
  const pass = (w: BuoyWatch, x: number, from = 0, to = 30) => {
    const evs: string[] = [];
    for (let z = from; z <= to; z += 5 / 60) for (const e of w.update(1 / 60, x, z, B)) evs.push(e.kind);
    return evs;
  };
  it('a buoy in the lane ahead is lit and warned once; one off the lane is not', () => {
    const w = new BuoyWatch();
    expect(w.update(0.016, 0.5, 20 - BUOY_WARN_AHEAD_M - 1, B)).toEqual([]);
    expect(w.update(0.016, 0.5, 20 - BUOY_WARN_AHEAD_M + 1, B).map((e) => e.kind)).toEqual(['warn']);
    expect(w.lit(0)).toBe(true);
    expect(w.update(0.016, 0.5, 15, B)).toEqual([]);         // once
    const far = new BuoyWatch();
    expect(pass(far, 8)).toEqual([]);
    expect(far.lit(0)).toBe(false);
  });
  it('a pass inside NEAR_MISS_M of contact is a near miss; a wide pass is not; a hit never is', () => {
    expect(pass(new BuoyWatch(), contact + NEAR_MISS_M * 0.5)).toEqual(['warn', 'nearMiss']);
    expect(pass(new BuoyWatch(), contact + NEAR_MISS_M + 0.3)).not.toContain('nearMiss');   // (still in the lane: warned)
    expect(pass(new BuoyWatch(), contact + BUOY_WARN_LANE_M + 0.3)).toEqual([]);
    expect(pass(new BuoyWatch(), contact - 0.2)).toEqual(['warn']);
  });
  it('the cooldown holds back a second near miss; reset() (a respawn) approaches afresh', () => {
    const w = new BuoyWatch();
    const x = contact + 0.5;
    expect(pass(w, x)).toEqual(['warn', 'nearMiss']);
    w.reset();
    expect(pass(w, x, 0, 30)).toEqual(['warn', 'nearMiss']);   // the reset also cleared the cooldown
    // a lap wrap (the rider 140 m back) approaches afresh, but inside the cooldown the pass is not paid twice
    const v = new BuoyWatch();
    expect(pass(v, x, 0, 21.5)).toEqual(['warn', 'nearMiss']);
    const evs: string[] = [];
    for (const z of [-120, 8, 19, 22]) for (const e of v.update(0.1, x, z, B)) evs.push(e.kind);
    expect(evs).toEqual(['warn']);
    expect(NEAR_MISS_COOLDOWN_SEC).toBeGreaterThan(0.4);
  });
});

describe('item 19 — the first wave teaches the trim and the pump', () => {
  it('climb, then drop, then two pumps — each held a moment — then it is done', () => {
    const c = new TrimCoach();
    expect(c.text).toBe(COACH_TEXT.climb);
    expect(c.update(0.1, 0.9, 0)).toBeNull();
    let said: string | null = null;
    for (let i = 0; i < 5 && !said; i++) said = c.update(0.1, 0.9, 0);
    expect(said).toBe(COACH_TEXT.drop);
    expect(c.update(0.5, 0.9, 0)).toBeNull();                // climbing again does not advance the drop
    said = null;
    for (let i = 0; i < 5 && !said; i++) said = c.update(0.1, -0.9, 0);
    expect(said).toBe(COACH_TEXT.pump);
    expect(c.update(0.1, 0, 1)).toBeNull();
    expect(c.update(0.1, 0, 2)).toBe('');
    expect(c.step).toBe('done');
    expect(c.update(0.1, 0.9, 3)).toBeNull();
  });
  it('a flick does not count, the lesson ends on its own, and finish() clears it once', () => {
    const c = new TrimCoach();
    expect(c.update(0.05, 0.9, 0)).toBeNull();
    expect(c.update(0.05, 0, 0)).toBeNull();
    expect(c.step).toBe('climb');
    expect(c.update(COACH_MAX_SEC + 1, 0, 0)).toBe('');
    const d = new TrimCoach();
    expect(d.finish()).toBe('');
    expect(d.finish()).toBeNull();
  });
});

describe('items 9 / 20 — the swell', () => {
  it('its worth multiplies (1.0 / 1.35 / 1.8), clamped to the table, and the set is called with it', () => {
    expect(WAVE_PROFILES.map(swellWorth)).toEqual([1, 1.35, 1.8]);
    expect(Math.max(...WAVE_PROFILES.map((p) => p.worth))).toBe(SWELL_WORTH_MAX);
    expect(swellWorth({ worth: 9 })).toBe(SWELL_WORTH_MAX);
    expect(swellWorth({ worth: Number.NaN })).toBe(1);
    expect(swellWorth(null)).toBe(1);
    expect(WAVE_PROFILES.map(setCall)).toEqual(['SET: RUNNER ×1.0', 'SET: WEDGE ×1.35', 'SET: CAVE ×1.8']);
  });
  it('a ride is judged when it was one', () => {
    expect(rideCounts(0, 0, 1)).toBe(false);
    expect(rideCounts(1, 0, 0.2)).toBe(true);
    expect(rideCounts(0, 0.4, 0.5)).toBe(true);
    expect(rideCounts(0, 0, 3)).toBe(true);
  });
});
