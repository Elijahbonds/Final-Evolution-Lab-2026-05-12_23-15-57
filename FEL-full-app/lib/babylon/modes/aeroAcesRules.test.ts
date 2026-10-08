// IMPROVE (2026-10-06): the Aero Aces owner-picked improvements' pure rules (aeroAcesRules.ts).
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  BannerSlot, BANNER_PRIO, racerPlace, incomingThreat, threatWords, neutralRoll, NEUTRAL_ROLL, newRecover, stepRecover,
  WRONG_WAY_RESPAWN_SEC, NO_PROGRESS_RESPAWN_SEC, aeroScore, AERO_SCORE_MAX, mapFrame, toMap, mapPath, mapDots, MAP_BOX,
  flyoverPose, FLYOVER_SEC, aeroGhostKey, raceProgress, hudDue, AERO_HUD_HZ, ROLL_CUE_SEC, ROLL_PROTECT_SEC,
} from './aeroAcesRules';
import { aeroCircuits, pointAlong } from '../racing/aeroCircuits';
import { MISSILE_SPEED, type Missile } from '../racing/AeroItems';
import { MODE_SCORE_RULES } from '@/lib/sessions/modeScoreRules';

const missile = (o: Partial<Missile> & { pos: Vector3; dir: Vector3 }): Missile => ({ homing: false, life: 3, owner: 1, target: null, ...o });

describe('#4 the banner is ranked', () => {
  it('a lower message never covers a higher one still on screen; equal or higher replaces it', () => {
    const b = new BannerSlot();
    expect(b.say('VOSS FIRED — ROLL TO DODGE', 0.9, BANNER_PRIO.threat)).toBe(true);
    expect(b.say('BUMPED KEELE', 0.5)).toBe(false);
    expect(b.say('ZIP!', 0.6, BANNER_PRIO.info)).toBe(false);
    expect(b.say('LAP 2', 1.1, BANNER_PRIO.event)).toBe(false);
    expect(b.text).toBe('VOSS FIRED — ROLL TO DODGE');
    expect(b.say('WRONG WAY', 0.8, BANNER_PRIO.threat)).toBe(true);
    expect(b.say('1ST PLACE', 2.4, BANNER_PRIO.final)).toBe(true);
    expect(b.text).toBe('1ST PLACE');
  });
  it('once it times out, anything shows again and the slot reads idle', () => {
    const b = new BannerSlot();
    b.say('WRONG WAY', 0.8, BANNER_PRIO.threat);
    expect(b.idle).toBe(false);
    b.tick(0.5); expect(b.text).toBe('WRONG WAY');
    b.tick(0.31); expect(b.text).toBe(''); expect(b.idle).toBe(true);
    expect(b.say('BUMPED', 0.5)).toBe(true);
  });
});

describe('#2 a rival draws by its own place', () => {
  it('counts the player and the other rivals ahead, never itself', () => {
    const field = [{ dist: 100 }, { dist: 50 }, { dist: 75 }];
    expect(racerPlace(100, 10, field, 0)).toBe(1);
    expect(racerPlace(50, 10, field, 1)).toBe(3);
    expect(racerPlace(50, 60, field, 1)).toBe(4);   // the player is ahead too
    expect(racerPlace(75, 200, field, 2)).toBe(3);
  });
});

describe('#3 the missile warning', () => {
  const pos = new Vector3(0, 20, 0);
  it('a homing missile locked on the player, behind, closing: seconds out, BEHIND, then ROLL NOW inside the window', () => {
    // plane flies +z at 30 m/s; the missile is 64 m behind on the same line, flying +z at MISSILE_SPEED
    const m = missile({ pos: new Vector3(0, 20, -64), dir: new Vector3(0, 0, 1), homing: true, target: 0 });
    const t = incomingThreat([m], 0, pos, 0, 30)!;
    expect(t.side).toBe('BEHIND');
    expect(t.tti).toBeCloseTo(64 / (MISSILE_SPEED - 30), 3);
    expect(t.rollNow).toBe(false);
    expect(threatWords(t)).toBe(`MISSILE ${t.tti.toFixed(1)}s`);
    const close = missile({ pos: new Vector3(0, 20, -15), dir: new Vector3(0, 0, 1), homing: true, target: 0 });
    const n = incomingThreat([close], 0, pos, 0, 30)!;
    expect(n.tti).toBeLessThanOrEqual(ROLL_CUE_SEC);
    expect(n.rollNow).toBe(true);
    expect(threatWords(n)).toBe('ROLL NOW');
  });
  it('the cue lands a press inside the roll\'s protection: cue window ≤ how long the roll protects', () => {
    expect(ROLL_CUE_SEC).toBeLessThanOrEqual(ROLL_PROTECT_SEC + 0.15);   // a ~0.1–0.15 s thumb still lands it
  });
  it('ignores the player\'s own missiles, missiles locked on someone else, and straight shots that miss or recede', () => {
    const own = missile({ pos: new Vector3(0, 20, -30), dir: new Vector3(0, 0, 1), owner: 0 });
    const other = missile({ pos: new Vector3(0, 20, -30), dir: new Vector3(0, 0, 1), homing: true, target: 3 });
    const wide = missile({ pos: new Vector3(40, 20, -30), dir: new Vector3(0, 0, 1) });
    const away = missile({ pos: new Vector3(0, 20, -30), dir: new Vector3(0, 0, -1) });
    const far = missile({ pos: new Vector3(0, 20, -400), dir: new Vector3(0, 0, 1), homing: true, target: 0 });
    expect(incomingThreat([own, other, wide, away, far], 0, pos, 0, 30)).toBeNull();
    expect(threatWords(null)).toBe('');
  });
  it('a straight shot on the line is a threat; the side follows the plane\'s heading', () => {
    // heading +x (π/2): a missile at −z is on the plane's LEFT... right of +x is −z, so it is on the RIGHT
    const m = missile({ pos: new Vector3(0, 20, -12), dir: new Vector3(0, 0, 1) });
    const t = incomingThreat([m], 0, pos, Math.PI / 2, 0)!;
    expect(t.side).toBe('RIGHT');
    expect(t.lateral).toBeGreaterThan(0);
  });
  it('the nearest in time wins', () => {
    const a = missile({ pos: new Vector3(0, 20, -60), dir: new Vector3(0, 0, 1), homing: true, target: 0 });
    const b = missile({ pos: new Vector3(0, 20, -30), dir: new Vector3(0, 0, 1), homing: true, target: 0 });
    expect(incomingThreat([a, b], 0, pos, 0, 30)!.tti).toBeCloseTo(30 / (MISSILE_SPEED - 30), 3);
  });
});

describe('#9 the neutral-stick roll', () => {
  it('rolls away from the threat, and with none always the same way', () => {
    expect(neutralRoll(6)).toBe('roll_left');
    expect(neutralRoll(-6)).toBe('roll_right');
    expect(neutralRoll(null)).toBe(NEUTRAL_ROLL);
    expect(neutralRoll(0.1)).toBe(NEUTRAL_ROLL);
    // the old rule alternated on the stunt count; this one is the same every press
    expect(new Set(Array.from({ length: 5 }, () => neutralRoll(null))).size).toBe(1);
  });
});

describe('#10 wrong way and stuck put the plane back', () => {
  const run = (sec: number, live: (t: number) => { wrongWay: boolean; dist: number; exempt: boolean }) => {
    let s = newRecover(0); let t = 0; let at: number | null = null;
    while (t < sec) { const r = stepRecover(s, 1 / 60, live(t)); s = r.state; t += 1 / 60; if (r.respawn && at === null) at = t; }
    return { at, s };
  };
  it('wrong way for WRONG_WAY_RESPAWN_SEC respawns at the best distance earned', () => {
    const { at, s } = run(5, (t) => ({ wrongWay: true, dist: 100 - t * 30, exempt: false }));
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThan(WRONG_WAY_RESPAWN_SEC - 0.05);
    expect(at!).toBeLessThan(WRONG_WAY_RESPAWN_SEC + 0.1);
    expect(s.bestDist).toBe(100);   // the furthest it got, never where it turned back to
  });
  it('no new ground for NO_PROGRESS_RESPAWN_SEC (circling) respawns; flying the course never does', () => {
    const circling = run(8, (t) => ({ wrongWay: false, dist: 50 + Math.sin(t) * 1.5, exempt: false }));
    expect(circling.at).not.toBeNull();
    expect(circling.at!).toBeGreaterThan(NO_PROGRESS_RESPAWN_SEC - 0.05);
    expect(run(30, (t) => ({ wrongWay: false, dist: t * 30, exempt: false })).at).toBeNull();
  });
  it('a stunt or a spin holds the clocks — a loop faces back for its own length and is not punished', () => {
    expect(run(10, (t) => ({ wrongWay: true, dist: 10, exempt: t < 9.5 })).at).toBeNull();
  });
});

describe('#8 the score', () => {
  it('pays place and bananas as before, plus stunts, the best chain and the medal', () => {
    const r = aeroScore({ place: 1, finished: true, bananas: 6, stunts: 12, bestChain: 870, medal: 'silver' });
    expect(r).toEqual({ total: 1000 + 60 + 60 + 87 + 120, placePts: 1000, bananaPts: 60, stuntPts: 60, chainPts: 87, medalPts: 120 });
    // the old formula is the floor of the new one
    expect(aeroScore({ place: 3, finished: true, bananas: 4, stunts: 0, bestChain: 0, medal: 'none' }).total).toBe(550 + 40);
  });
  it('an unfinished race earns no medal; garbage counts are zero; every term is capped', () => {
    expect(aeroScore({ place: 2, finished: false, bananas: 3, stunts: 1, bestChain: 0, medal: 'gold' }).medalPts).toBe(0);
    expect(aeroScore({ place: Number.NaN, finished: true, bananas: -4, stunts: Infinity, bestChain: -1, medal: 'none' }).total).toBe(0);
    const max = aeroScore({ place: 1, finished: true, bananas: 99, stunts: 999, bestChain: 1e9, medal: 'gold' });
    expect(max.total).toBe(AERO_SCORE_MAX);
  });
  it('the most a race can pay stays under the server\'s measured aeroAces row (no honest run is refused)', () => {
    const row = MODE_SCORE_RULES.aeroAces;
    expect(row).toBeTruthy();
    expect(AERO_SCORE_MAX).toBeLessThanOrEqual(row.maxScore);
    // the fastest gold any circuit allows still sits under the pace rule
    const fastest = Math.min(...aeroCircuits().map((c) => c.course.gold)) * 0.6;
    expect(AERO_SCORE_MAX / fastest).toBeLessThanOrEqual(row.maxScorePerSecond);
  });
});

describe('#6 the course strip', () => {
  it('fits every circuit into the box with its margin, north up, and draws a closed path', () => {
    for (const c of aeroCircuits()) {
      const f = mapFrame(c.line.pts);
      for (const p of c.line.pts) {
        const [x, y] = toMap(f, p.x, p.z);
        expect(x).toBeGreaterThanOrEqual(5.9); expect(x).toBeLessThanOrEqual(MAP_BOX - 5.9);
        expect(y).toBeGreaterThanOrEqual(5.9); expect(y).toBeLessThanOrEqual(MAP_BOX - 5.9);
      }
      const path = mapPath(c.line, f);
      expect(path.startsWith('M')).toBe(true);
      expect(path.endsWith('Z')).toBe(true);
      expect(path.split('L').length).toBeGreaterThan(60);
      expect(path.length).toBeLessThan(2400);   // sent once, but small
    }
    const f = mapFrame([{ x: 0, z: 0 }, { x: 0, z: 100 }]);
    expect(toMap(f, 0, 100)[1]).toBeLessThan(toMap(f, 0, 0)[1]);   // +z is up the map
    expect(mapDots(f, [{ x: 0, z: 0 }, { x: 0, z: 100 }]).split(';')).toHaveLength(2);
  });
});

describe('#11 the flyover', () => {
  it('starts at the grid, sweeps the whole lap above the line, ends on time, and looks down the course', () => {
    const c = aeroCircuits()[0];
    const start = flyoverPose(c.line, 0);
    const mid = flyoverPose(c.line, FLYOVER_SEC / 2);
    const end = flyoverPose(c.line, FLYOVER_SEC);
    expect(start.done).toBe(false);
    expect(end.done).toBe(true);
    const at0 = pointAlong(c.line, 0).pos, atMid = pointAlong(c.line, c.line.length / 2).pos;
    expect(Vector3.Distance(start.pos, at0)).toBeLessThan(80);
    expect(Vector3.Distance(mid.pos, atMid)).toBeLessThan(80);   // smoothstep: halfway in time is halfway round
    for (const p of [start, mid]) {
      expect(p.pos.y).toBeGreaterThan(p.target.y);   // above, looking down the line
      expect(Number.isFinite(p.pos.x + p.target.z)).toBe(true);
    }
  });
});

describe('#1 #14 small pins', () => {
  it('the ghost is keyed apart from the kart, and progress is the whole race 0..1', () => {
    expect(aeroGhostKey('redrock-canyon')).toBe('aero:redrock-canyon');
    expect(raceProgress(-12, 1800, 3)).toBe(0);
    expect(raceProgress(2700, 1800, 3)).toBeCloseTo(0.5);
    expect(raceProgress(99999, 1800, 3)).toBe(1);
  });
  it('the HUD goes on a discrete change at once, else at AERO_HUD_HZ', () => {
    expect(hudDue('a', 'b', 0)).toBe(true);
    expect(hudDue('a', 'a', 0.016)).toBe(false);
    expect(hudDue('a', 'a', 1 / AERO_HUD_HZ)).toBe(true);
    expect(hudDue(null, 'a', 0)).toBe(true);
  });
});
