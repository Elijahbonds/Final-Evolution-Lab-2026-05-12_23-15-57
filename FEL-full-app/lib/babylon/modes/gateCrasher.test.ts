import { describe, it, expect } from 'vitest';
import {
  GATE_HALF_WIDTH, POLE_BRUSH_M, crashTarget, crashChip, crashGoal, judgeGate, resolveSolids, solidTop, OVER_M, RIDER_RADIUS,
  wipeRoll, WIPE_SEC, WIPE_ROLL_MAX, carveSpeed01, treeline, edgePoles, rampUnder, kickerPop, type RideSolid,
} from './gateCrasher';
import { SNOW_VENUES } from '../nexus/boardVenues';
import { SNOW_CROWD, CROWD_INSET_M, SNOW_SLOPE } from './snowSlope';
import {
  snowBank, SNOW_CARVE_MAX, rockSpots, racingLineX, rockOutcome, ROCK_WIPE_SPEED, ROCK_LINE_CLEAR_M, ROCK_GATE_CLEAR_M,
  airLeftSec, SNOW_GRAVITY, shortenToAir, fitsAirLeft, motionSec, MIN_GRAB_SEC, timeBonus, TIME_BONUS_MAX, TIME_PAR_SEC,
  stallAction, STALL_NUDGE_SEC, STALL_END_SEC, RUN_CAP_SEC, airShadow,
} from './gateCrasher';
import { SNOW_TRICKS } from '../core/BoardTricks';
import { SLALOM_GATES, slalomGateX, slalomGateDist, PISTE_HALF_WIDTH } from './rideWorlds';

describe('the gate verdict (GATE-CRASHER-MAJOR)', () => {
  const gate = { x: 3.2, z: 100 };
  it('credits a gate only when the rider crossed BETWEEN the poles', () => {
    // the baseline's three dishonest credits: 0.10, 0.14 and 0.29 m outside a pole
    for (const off of [2.0, 2.04, 2.19]) {
      const v = judgeGate({ x: gate.x - off, z: 99.8 }, { x: gate.x - off, z: 100.1 }, gate);
      expect(v.crossed && v.hit, `credited ${off} m from the centre, poles at ${GATE_HALF_WIDTH}`).toBe(false);
    }
    for (const off of [0, 0.9, 1.6, -1.65]) {
      const v = judgeGate({ x: gate.x + off, z: 99.8 }, { x: gate.x + off, z: 100.1 }, gate);
      expect(v.crossed && v.hit, `missed ${off} m from the centre`).toBe(true);
    }
  });
  it('judges at the crossing point, not at the frame', () => {
    // a fast diagonal frame: outside the pole before the line, inside after it — crossed exactly at 1.7 − 0.3·(mid)
    const v = judgeGate({ x: 3.2 + 2.2, z: 99 }, { x: 3.2 + 1.0, z: 101 }, gate);
    expect(v.crossed).toBe(true);
    if (v.crossed) { expect(v.dx).toBeCloseTo(1.6, 5); expect(v.hit).toBe(true); expect(v.brush).toBe(true); }
    // and the old rule's 0.3 m early judgement is gone: 0.2 m short of the line is not a crossing yet
    expect(judgeGate({ x: 3.2, z: 99.5 }, { x: 3.2, z: 99.8 }, gate).crossed).toBe(false);
  });
  it('whips the pole a body brushes, on either side of it', () => {
    for (const off of [GATE_HALF_WIDTH - POLE_BRUSH_M + 0.05, GATE_HALF_WIDTH + POLE_BRUSH_M - 0.05]) {
      const v = judgeGate({ x: gate.x + off, z: 99.9 }, { x: gate.x + off, z: 100.05 }, gate);
      expect(v.crossed && v.brush).toBe(true);
    }
    const clean = judgeGate({ x: gate.x, z: 99.9 }, { x: gate.x, z: 100.05 }, gate);
    expect(clean.crossed && clean.brush).toBe(false);
  });
});

describe('the win, said out loud', () => {
  it('is half the gates, rounded up', () => {
    expect(crashTarget(30)).toBe(15);
    expect(crashTarget(29)).toBe(15);
    expect(crashTarget(1)).toBe(1);
  });
  it('names the target before the run and the verdict once it is reached', () => {
    expect(crashGoal(30)).toMatch(/15 OF 30 GATES/);
    expect(crashChip(4, 30)).toBe('WIN AT 15 · 11 TO GO');
    expect(crashChip(15, 30)).toBe('GATE CRASHER ✓');
  });
});

describe('the solids: nothing on the mountain is ridden through', () => {
  const box: RideSolid = { kind: 'box', tag: 'snow_box', x0: -1, x1: 1, z0: 10, z1: 20, y0: 1, slope: 0, h: 1, ramp: false };
  it('keeps a body under the deck out of the footprint, and names the face it met', () => {
    const r = resolveSolids({ x: -1.1, z: 15 }, 0, [box]);
    expect(r.x).toBeCloseTo(-1 - RIDER_RADIUS, 6);
    expect(r.contact).toMatchObject({ nx: -1, nz: 0, tag: 'snow_box' });
    const end = resolveSolids({ x: 0, z: 9.9 }, 0, [box]);
    expect(end.z).toBeCloseTo(10 - RIDER_RADIUS, 6);
    expect(end.contact).toMatchObject({ nx: 0, nz: -1 });
  });
  it('leaves a body riding the deck, or flying over it, alone', () => {
    expect(resolveSolids({ x: 0, z: 15 }, 2 - OVER_M + 0.01, [box]).contact).toBeNull();
    expect(resolveSolids({ x: 0, z: 15 }, 3, [box]).contact).toBeNull();
  });
  it('lets a ramp be ridden on from its uphill end, and blocks its high side', () => {
    const ramp: RideSolid = { ...box, ramp: true, h: 2 };
    expect(solidTop(ramp, 10)).toBeCloseTo(1, 6);
    expect(solidTop(ramp, 20)).toBeCloseTo(3, 6);
    expect(resolveSolids({ x: 0, z: 10.2 }, 1, [ramp]).contact).toBeNull();          // on at the toe
    expect(resolveSolids({ x: 0.9, z: 19 }, 1, [ramp]).contact).not.toBeNull();       // into the side at the lip
  });
  it('rounds a post (a pylon, a rock, a spectator) off the way the body met it', () => {
    const post: RideSolid = { kind: 'post', tag: 'pylon', x: 0, z: 0, r: 0.2, y0: 0, h: 5 };
    const r = resolveSolids({ x: 0.3, z: 0.1 }, 0, [post]);
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(0.2 + RIDER_RADIUS, 6);
    expect(r.contact!.nx).toBeGreaterThan(0.9);
    // a rock is cleared by a body high enough over it
    const rock: RideSolid = { kind: 'post', tag: 'rock', x: 0, z: 0, r: 0.85, y0: 0, h: 0.8 };
    expect(resolveSolids({ x: 0.3, z: 0 }, 0.6, [rock]).contact).toBeNull();
    expect(resolveSolids({ x: 0.3, z: 0 }, 0.1, [rock]).contact).not.toBeNull();
  });
  it('never leaves a body inside after the push (a wall cannot pin a rider it has swallowed)', () => {
    const wall: RideSolid = { kind: 'box', tag: 'snow_wallride', x0: -0.3, x1: 0.3, z0: 0, z1: 14, y0: 0, slope: -0.22, h: 3, ramp: false };
    for (let x = -0.6; x <= 0.6; x += 0.05) for (let z = -0.3; z <= 14.3; z += 0.7) {
      const r = resolveSolids({ x, z }, -3, [wall]);
      const inside = r.x > wall.x0 - RIDER_RADIUS + 1e-6 && r.x < wall.x1 + RIDER_RADIUS - 1e-6 && r.z > wall.z0 - RIDER_RADIUS + 1e-6 && r.z < wall.z1 + RIDER_RADIUS - 1e-6;
      expect(inside, `(${x.toFixed(2)}, ${z.toFixed(2)}) still inside`).toBe(false);
    }
  });
});

describe('the wipeout reads as a fall', () => {
  it('slams him over fast, holds him in the snow, and brings him back to level', () => {
    expect(wipeRoll(0)).toBe(0);
    expect(wipeRoll(0.22)).toBeCloseTo(WIPE_ROLL_MAX, 6);          // on his side in a fifth of a second
    expect(wipeRoll(0.5)).toBe(WIPE_ROLL_MAX);
    expect(wipeRoll(WIPE_SEC - 0.001)).toBeLessThan(0.01);          // up again, no step into the ride bank
    expect(wipeRoll(WIPE_SEC)).toBe(0);
    expect(WIPE_ROLL_MAX).toBeGreaterThan(1);                         // past 57°: not a lean, a fall
    // no frame-to-frame jump bigger than a 60 fps slam allows once he is going down
    let prev = 0, worst = 0;
    for (let t = 1 / 60; t < WIPE_SEC; t += 1 / 60) { const r = wipeRoll(t); worst = Math.max(worst, Math.abs(r - prev)); prev = r; }
    expect(worst).toBeLessThan(0.2);
  });
});

describe('the carve reads on the edge', () => {
  it('banks against the cruise pace, so a gate-speed carve is on its edge', () => {
    expect(carveSpeed01(13.4, 13.4)).toBe(1);
    expect(carveSpeed01(9, 13.4)).toBeGreaterThan(0.6);
    expect(carveSpeed01(0, 13.4)).toBe(0);
  });
});

describe('the treeline and the edge', () => {
  const RUN = 678;
  it('lines the whole run, outside the groom, on every venue that has trees', () => {
    for (const v of SNOW_VENUES) {
      const t = treeline(v.bound, RUN, v.trees ?? 22);
      if (!(v.trees ?? 22)) { expect(t).toEqual([]); continue; }
      expect(Math.max(...t.map((s) => s.dist)), v.id).toBeGreaterThan(RUN - 40);          // the bottom of the mountain too
      for (const s of t) expect(Math.abs(s.x), `${v.id} tree at ${s.x.toFixed(1)}`).toBeGreaterThan(v.bound + 1);   // never inside the clamp
      // no stretch of the run longer than 40 m without a tree beside it
      const ds = t.map((s) => s.dist).sort((a, b) => a - b);
      for (let i = 1; i < ds.length; i++) expect(ds[i] - ds[i - 1], `${v.id} gap at ${ds[i - 1]}`).toBeLessThan(40);
    }
  });
  it('keeps the crowd between the edge poles and the racing line', () => {
    for (const v of SNOW_VENUES) {
      const poles = edgePoles(v.bound, RUN);
      expect(poles.every((p) => Math.abs(p.x) === v.bound - 0.5)).toBe(true);
      expect(v.bound - CROWD_INSET_M + 1.4).toBeLessThan(v.bound - 1);                    // the crowd stands inside the clamp
      expect(SNOW_CROWD.length).toBeGreaterThan(0);
    }
  });
});

describe('the kicker throws you', () => {
  const kicker: RideSolid = { kind: 'box', tag: 'snow_kicker', x0: -3, x1: 3, z0: 0, z1: 7, y0: 0, slope: -0.22, h: 1.9, ramp: true };
  it('finds the ramp under a body riding it, and not one beside it or over it', () => {
    expect(rampUnder([kicker], 0, 6.5, solidTop(kicker, 6.5))).toBe(kicker);
    expect(rampUnder([kicker], 4, 6.5, solidTop(kicker, 6.5))).toBeNull();
    expect(rampUnder([kicker], 0, 6.5, solidTop(kicker, 6.5) + 1)).toBeNull();
  });
  it('pops harder off a steeper ramp and at more speed, never down', () => {
    expect(kickerPop(11, kicker)).toBeGreaterThan(2);
    expect(kickerPop(14, kicker)).toBeGreaterThan(kickerPop(11, kicker));
    expect(kickerPop(0, kicker)).toBe(0);
    expect(kickerPop(11, { ...kicker, ramp: false })).toBe(0);
  });
});

// ── GATE-CRASHER-POLISH-2 (2026-09-28) ─────────────────────────────────────────────────────────────────────────────────────
const byId = (id: string) => SNOW_TRICKS.find((t) => t.id === id)!;
const course = Array.from({ length: SLALOM_GATES }, (_, i) => ({ x: slalomGateX(i), dist: slalomGateDist(i) }));

describe('GC-5 the carve lays the rider over', () => {
  it('a committed carve at cruise is the full 38°, half a lean already past 20°, and a straight line is upright', () => {
    expect(Math.abs(snowBank(1, 1))).toBeCloseTo(SNOW_CARVE_MAX, 6);
    expect(SNOW_CARVE_MAX * 180 / Math.PI).toBeCloseTo(38, 6);
    expect(Math.abs(snowBank(0.5, 1)) * 180 / Math.PI).toBeGreaterThan(20);
    expect(snowBank(0, 1)).toBe(-0);
    expect(Math.abs(snowBank(1, 0))).toBe(0);                      // no speed, no bank
  });
  it('keeps the board stack\'s sign: a right lean is a negative roll', () => {
    expect(snowBank(0.6, 0.9)).toBeLessThan(0);
    expect(snowBank(-0.6, 0.9)).toBeGreaterThan(0);
  });
});

describe('GC-1 the rocks stay off the gate line', () => {
  const spans = SNOW_SLOPE.map((f) => ({ x0: f.lateral * PISTE_HALF_WIDTH - f.width / 2, x1: f.lateral * PISTE_HALF_WIDTH + f.width / 2, d0: f.dist, d1: f.dist + f.length }));
  const rocks = rockSpots(course, spans, PISTE_HALF_WIDTH);
  it('the racing line runs from the start through every gate centre', () => {
    for (const g of course) expect(racingLineX(course, g.dist)).toBeCloseTo(g.x, 6);
    expect(racingLineX(course, 0)).toBe(0);
    expect(racingLineX(course, 28)).toBeCloseTo((course[0].x + course[1].x) / 2, 6);
  });
  it('the eye\'s rock (gate 0 → 1, x 1.0 z 24.8) is gone from the line, and every rock clears it and the gates', () => {
    expect(rocks).toHaveLength(8);
    for (const r of rocks) {
      expect(Math.abs(r.x - racingLineX(course, r.dist)), `rock at ${r.dist} m`).toBeGreaterThanOrEqual(ROCK_LINE_CLEAR_M - 1e-9);
      for (const g of course) expect(Math.abs(g.dist - r.dist), `rock at ${r.dist} m vs gate at ${g.dist}`).toBeGreaterThanOrEqual(ROCK_GATE_CLEAR_M - 1e-9);
      expect(Math.abs(r.x)).toBeLessThanOrEqual(PISTE_HALF_WIDTH - 3);
      for (const f of spans) expect(r.x > f.x0 - 1.6 && r.x < f.x1 + 1.6 && r.dist > f.d0 - 1.6 && r.dist < f.d1 + 1.6, `rock ${r.x},${r.dist} on a feature`).toBe(false);
    }
    const first = rocks[0];
    expect(Math.hypot(first.x - 1.0, first.dist - 26)).toBeGreaterThan(3);
  });
  it('walking pace is a stumble, speed is the wipeout', () => {
    expect(rockOutcome(2.4)).toBe('stumble');    // the eye's hit
    expect(rockOutcome(0.8)).toBe('stumble');    // the 9096d7cf re-hit
    expect(rockOutcome(ROCK_WIPE_SPEED)).toBe('wipe');
    expect(rockOutcome(13)).toBe('wipe');
  });
});

describe('GC-2 a trick the air can finish', () => {
  it('the air left is ballistic over snow that falls away', () => {
    expect(airLeftSec(0, 0)).toBe(0);
    expect(airLeftSec(0, 7.75)).toBeCloseTo((2 * 7.75) / SNOW_GRAVITY, 6);             // a flat pop: 1.1 s
    expect(airLeftSec(0, 7.75, 2)).toBeGreaterThan(airLeftSec(0, 7.75));              // the pitched piste keeps him up
    expect(airLeftSec(1.2, -3)).toBeGreaterThan(0);                                    // on the way down, still above the snow
    expect(airLeftSec(0.05, -6)).toBeLessThan(0.05);
  });
  it('a 720 with a fifth of a second left is not thrown — the eye\'s `bail 720 0.23` and `bail RODEO 540 0.25`', () => {
    expect(shortenToAir(byId('snow720'), 0.2)).toBeNull();
    expect(shortenToAir(byId('rodeo'), 0.25)).toBeNull();
  });
  it('a spin that cannot finish is thrown as the biggest one that can (SSX): the flip family first', () => {
    const left = motionSec(byId('snow540')) + 0.1;
    expect(fitsAirLeft(byId('snow720'), left)).toBe(false);
    expect(shortenToAir(byId('snow720'), left)?.id).toBe('snow540');
    expect(shortenToAir(byId('cork720'), left)?.id).toBe('snow540');
    const only360 = motionSec(byId('snow360')) + 0.08;
    expect(shortenToAir(byId('snow720'), only360)?.id).toBe('snow360');
    expect(shortenToAir(byId('snow720'), 2)?.id).toBe('snow720');                         // the air holds it: the trick asked for
  });
  it('every trick the shortener throws finishes in the air it was given', () => {
    for (let left = 0.2; left <= 1.6; left += 0.05) for (const t of SNOW_TRICKS.filter((x) => x.kind === 'air')) {
      const got = shortenToAir(t, left);
      if (got) expect(motionSec(got), `${t.id} at ${left.toFixed(2)} s → ${got.id}`).toBeLessThan(left);
    }
  });
  it('a grab needs one clean hold; nothing shorter replaces it', () => {
    expect(shortenToAir(byId('indy_snow'), MIN_GRAB_SEC + 0.1)?.id).toBe('indy_snow');
    expect(shortenToAir(byId('indy_snow'), MIN_GRAB_SEC - 0.05)).toBeNull();
  });
});

describe('GC-9 the time bonus curve keeps the Arena ceiling', () => {
  it('pays for a good run and a run with a fall, and is gone by 90 s', () => {
    expect(timeBonus(59)).toBe(310);            // was 10
    expect(timeBonus(64)).toBe(260);            // was 0 (the eye's "+0 TIME")
    expect(timeBonus(TIME_PAR_SEC)).toBe(300);
    expect(timeBonus(90)).toBe(0);
    expect(timeBonus(120)).toBe(0);
  });
  it('never pays more than the mirrored ceiling, and is monotone', () => {
    let prev = Infinity;
    for (let t = 0; t <= 200; t += 0.25) { const b = timeBonus(t); expect(b).toBeLessThanOrEqual(TIME_BONUS_MAX); expect(b).toBeLessThanOrEqual(prev); prev = b; }
    expect(timeBonus(0)).toBe(TIME_BONUS_MAX);
    expect(TIME_BONUS_MAX).toBe(600);
  });
});

describe('GC-F1 a stalled run ends', () => {
  it('rides, then nudges, then ends; and nothing outlives the cap', () => {
    expect(stallAction(0, 10)).toBe('ride');
    expect(stallAction(STALL_NUDGE_SEC, 10)).toBe('nudge');
    expect(stallAction(STALL_END_SEC, 10)).toBe('end');
    expect(stallAction(0, RUN_CAP_SEC)).toBe('end');
    expect(STALL_END_SEC).toBeGreaterThan(STALL_NUDGE_SEC * 3);   // three nudges before it gives up
  });
});

describe('GC-6 the air shadow', () => {
  it('is the ground shadow on the snow, fainter and wider with height, gone high up', () => {
    const g = airShadow(0), mid = airShadow(1.5), hi = airShadow(5);
    expect(g.alpha).toBeGreaterThan(mid.alpha);
    expect(mid.scale).toBeGreaterThan(g.scale);
    expect(hi.alpha).toBe(0);
    expect(g.alpha).toBeLessThanOrEqual(0.3);
  });
});
