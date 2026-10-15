// The fight's cinematic cameras (lane/w3-present, wave 3): pure maths, so every shot is held without a GPU.
import { describe, expect, it } from 'vitest';
import { flatUnit, type V3 } from '../scene/broadcastShots';
import {
  DRAGON_CUT, FIGHT_INTRO, FIGHT_INTRO_SEC, FINISHER, FINISHER_SEC, bearingAbout, dragonCutAt, dragonCutSec, fightIntroAt, finisherAt, walkPos,
  type LivePose,
} from './fightShots';

const ME = { x: 0, z: 2.2 }, FOE = { x: 0, z: -2.2 };
const LIVE: LivePose = { pos: { x: 0.4, y: 2.4, z: 7.4 }, target: { x: 0, y: 1.3, z: -0.5 }, fov: 0.8 };
const d = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const at = (t: number) => fightIntroAt(t, ME, FOE, LIVE);

describe('the fight intro', () => {
  it('lasts FOE + ME + WIDE seconds and hands over to the play camera: the last frame IS the live frame', () => {
    expect(FIGHT_INTRO_SEC).toBeCloseTo(FIGHT_INTRO.foeSec + FIGHT_INTRO.meSec + FIGHT_INTRO.wideSec, 9);
    expect(at(FIGHT_INTRO_SEC).shot).toBe('play');
    const last = at(FIGHT_INTRO_SEC - 1e-4).shot;
    expect(last).not.toBe('play');
    if (last === 'play') return;
    expect(d(last.pos, LIVE.pos)).toBeLessThan(0.05);
    expect(d(last.target, LIVE.target)).toBeLessThan(0.05);
    expect(last.fov).toBeCloseTo(LIVE.fov, 2);
  });

  it('the rival walks in first, then the player, each to the round-start mark; both stand on the marks at the end', () => {
    const start = at(0);
    expect(start.foePos.z).toBeCloseTo(FOE.z - FIGHT_INTRO.walkM, 6);     // behind its mark, away from the other
    expect(start.mePos.z).toBeCloseTo(ME.z + FIGHT_INTRO.walkM, 6);
    expect(start.foeMps).toBeGreaterThan(0); expect(start.meMps).toBe(0);  // the rival is walking, the player stands
    const mid = at(FIGHT_INTRO.foeSec + 0.2);
    expect(mid.foePos.z).toBeCloseTo(FOE.z, 6);                           // the rival is on his mark by the time the camera moves to the player
    expect(mid.foeMps).toBe(0); expect(mid.meMps).toBeGreaterThan(0);
    const end = at(FIGHT_INTRO.foeSec + FIGHT_INTRO.meSec + 0.1);
    expect(end.mePos.z).toBeCloseTo(ME.z, 6); expect(end.foePos.z).toBeCloseTo(FOE.z, 6);
  });

  it('a walk stays inside every arena (the smallest half-depth is the Rooftop\'s 5.25 m) and never crosses the other fighter', () => {
    for (let t = 0; t <= FIGHT_INTRO_SEC; t += 0.05) {
      const f = at(t);
      expect(Math.abs(f.mePos.z)).toBeLessThan(5.25); expect(Math.abs(f.foePos.z)).toBeLessThan(5.25);
      expect(f.foePos.z).toBeLessThan(f.mePos.z);
    }
  });

  it('the walk eases out: it arrives at the mark and does not overshoot it', () => {
    let prev = walkPos(ME, FOE, 0);
    for (let u = 0.05; u <= 1.0001; u += 0.05) {
      const p = walkPos(ME, FOE, u);
      expect(p.z).toBeLessThanOrEqual(prev.z + 1e-9);
      expect(p.z).toBeGreaterThanOrEqual(ME.z - 1e-9);
      prev = p;
    }
    expect(prev.z).toBeCloseTo(ME.z, 9);
  });

  it('the plates: the rival\'s while the camera is on him, the player\'s on the player, none in the wide; each fades in and out', () => {
    expect(at(0.7).plate).toBe('foe'); expect(at(0.7).plateK).toBeCloseTo(1, 6);
    expect(at(FIGHT_INTRO.foeSec + 0.7).plate).toBe('me');
    expect(at(FIGHT_INTRO.foeSec + FIGHT_INTRO.meSec + 0.3).plate).toBeNull();
    expect(at(0).plateK).toBe(0);                         // in over the first quarter second
    expect(at(FIGHT_INTRO.foeSec - 0.02).plateK).toBeLessThan(0.2);   // out over the last 0.2 s
  });

  it('every shot keeps its subject in front of the lens and the camera off the floor and out of the fighters', () => {
    for (let t = 0; t < FIGHT_INTRO_SEC; t += 0.05) {
      const f = at(t);
      if (f.shot === 'play') continue;
      expect(f.shot.pos.y).toBeGreaterThan(0.4);
      for (const p of [f.mePos, f.foePos]) expect(Math.hypot(f.shot.pos.x - p.x, f.shot.pos.z - p.z)).toBeGreaterThan(1.2);
    }
  });

  it('the bars close at once and open with the hand-over', () => {
    expect(at(0).letterbox).toBe(0);
    expect(at(0.3).letterbox).toBe(1);
    expect(at(FIGHT_INTRO_SEC - 0.01).letterbox).toBeLessThan(0.1);
  });

  it('the hand-over eases AROUND the ring, never through a fighter (the camera stays outside 1.2 m of both)', () => {
    for (let t = FIGHT_INTRO_SEC - FIGHT_INTRO.outSec; t < FIGHT_INTRO_SEC; t += 0.02) {
      const f = at(t);
      if (f.shot === 'play') continue;
      for (const p of [ME, FOE]) expect(Math.hypot(f.shot.pos.x - p.x, f.shot.pos.z - p.z)).toBeGreaterThan(1.2);
    }
  });
});

describe('the DRAGON cut', () => {
  const cut = { atk: ME, def: FOE, side: 1, windupSec: 0.55 };
  it('winds up low over the attacker\'s shoulder (the defender beyond him, never between the lens and him), profiles both on the blow, then eases into the play camera and ends', () => {
    expect(dragonCutSec(cut)).toBeCloseTo(0.55 + DRAGON_CUT.impactSec + DRAGON_CUT.outSec, 9);
    const wind = dragonCutAt(0.1, cut, LIVE).shot;
    const hit = dragonCutAt(0.55 + 0.2, cut, LIVE).shot;
    expect(wind).not.toBe('play'); expect(hit).not.toBe('play');
    if (wind === 'play' || hit === 'play') return;
    expect(wind.pos.y).toBeLessThan(1);                                  // a low angle
    expect(Math.hypot(wind.pos.x - ME.x, wind.pos.z - ME.z)).toBeLessThan(3.4);   // close on the attacker
    expect(Math.abs(hit.pos.x)).toBeGreaterThan(4.5);                    // the impact shot is a profile off the line between them (the line runs along z)
    expect(dragonCutAt(dragonCutSec(cut), cut, LIVE).shot).toBe('play');
    const end = dragonCutAt(dragonCutSec(cut) - 1e-4, cut, LIVE).shot;
    if (end !== 'play') { expect(d(end.pos, LIVE.pos)).toBeLessThan(0.05); expect(end.fov).toBeCloseTo(LIVE.fov, 2); }
  });
  it('the rival\'s cut (impactOnly) has no windup: it begins on the profile', () => {
    const c = { ...cut, atk: FOE, def: ME, impactOnly: true };
    expect(dragonCutSec(c)).toBeCloseTo(DRAGON_CUT.impactSec + DRAGON_CUT.outSec, 9);
    const s = dragonCutAt(0.05, c, LIVE).shot;
    if (s !== 'play') expect(Math.abs(s.pos.x)).toBeGreaterThan(4.5);
  });
  it('the profile is on the side asked for', () => {
    const a = dragonCutAt(0.8, { ...cut, side: 1 }, LIVE).shot, b = dragonCutAt(0.8, { ...cut, side: -1 }, LIVE).shot;
    if (a !== 'play' && b !== 'play') expect(Math.sign(a.pos.x)).toBe(-Math.sign(b.pos.x));
  });
  it('a very short windup still gets its beat of low angle', () => {
    expect(dragonCutSec({ windupSec: 0.01 })).toBeCloseTo(DRAGON_CUT.minWindupSec + DRAGON_CUT.impactSec + DRAGON_CUT.outSec, 9);
  });
  it('the windup lens stands BEHIND the attacker (away from the defender): the defender is never between the camera and the attacker', () => {
    for (const side of [1, -1]) for (const t of [0.05, 0.2, 0.45]) {
      const s = dragonCutAt(t, { ...cut, side }, LIVE).shot;
      if (s === 'play') throw new Error('playing');
      const toDef = { x: FOE.x - ME.x, z: FOE.z - ME.z };   // attacker -> defender
      const camFromAtk = { x: s.pos.x - ME.x, z: s.pos.z - ME.z };
      expect(camFromAtk.x * toDef.x + camFromAtk.z * toDef.z, `side ${side} t ${t}`).toBeLessThan(0);   // the camera is on the far side of the attacker from the defender
    }
  });
  it('the attacker stays in front of the windup lens', () => {
    const s = dragonCutAt(0.2, cut, LIVE).shot;
    if (s !== 'play') { const dir = flatUnit({ x: s.target.x - s.pos.x, y: 0, z: s.target.z - s.pos.z }); const to = flatUnit({ x: ME.x - s.pos.x, y: 0, z: ME.z - s.pos.z }); expect(dir.x * to.x + dir.z * to.z).toBeGreaterThan(0.8); }
  });
});

describe('the 100th-KO finisher', () => {
  const live: LivePose = { pos: { x: 0, y: 4.5, z: 9 }, target: { x: 0, y: 1, z: 1 }, fov: 0.8 };
  const me = { x: 0, z: 3 }, fallen = { x: 1.2, z: 1.6 };
  const c = { me, fallen, startBearing: bearingAbout(live.pos, me), spin: 1 };
  it('starts on the play camera\'s own frame and ends on it (no cut at either end)', () => {
    const first = finisherAt(0, c, live).shot, last = finisherAt(FINISHER_SEC - 1e-4, c, live).shot;
    if (first === 'play' || last === 'play') throw new Error('should be playing');
    expect(d(first.pos, live.pos)).toBeLessThan(0.05);
    expect(d(last.pos, live.pos)).toBeLessThan(0.05);
    expect(last.fov).toBeCloseTo(live.fov, 2);
    expect(finisherAt(FINISHER_SEC, c, live).shot).toBe('play');
  });
  it('orbits the fighter: the bearing sweeps through FINISHER.sweepRad at a steady radius band, and the camera never enters the fighter', () => {
    const mid = finisherAt(FINISHER.inSec + FINISHER.orbitSec / 2, c, live).shot;
    if (mid === 'play') throw new Error('should be playing');
    const r = Math.hypot(mid.pos.x - me.x, mid.pos.z - me.z);
    expect(r).toBeGreaterThan(FINISHER.r1 - 0.01); expect(r).toBeLessThan(FINISHER.r0 + 0.01);
    for (let t = 0; t < FINISHER_SEC; t += 0.05) {
      const s = finisherAt(t, c, live).shot;
      if (s === 'play') continue;
      expect(Math.hypot(s.pos.x - me.x, s.pos.z - me.z)).toBeGreaterThan(1.2);
    }
    const a0 = bearingAbout(finisherAt(FINISHER.inSec, c, live).shot === 'play' ? live.pos : (finisherAt(FINISHER.inSec, c, live).shot as { pos: V3 }).pos, me);
    const a1 = bearingAbout((finisherAt(FINISHER.inSec + FINISHER.orbitSec, c, live).shot as { pos: V3 }).pos, me);
    const sweep = Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)));   // (the bearing wraps at pi)
    expect(sweep).toBeCloseTo(FINISHER.sweepRad, 1);
  });
  it('spins the way asked', () => {
    const a = finisherAt(1.5, { ...c, spin: 1 }, live).shot, b = finisherAt(1.5, { ...c, spin: -1 }, live).shot;
    if (a !== 'play' && b !== 'play') expect(a.pos.x).not.toBeCloseTo(b.pos.x, 1);
  });
});
