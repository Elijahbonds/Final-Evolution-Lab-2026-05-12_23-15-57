// hoops-p03 (1v1/3v3 phase 3): the 1v1 rival's move kit and reads — a move is a shape (it beats a body that leaves the lane and loses to
// one that stays), the reads pick by the defender, the tiers differ in WHAT he does, the odds are the release's.
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  RivalKit, moveFrame, moveWeights, pickWeighted, actionVariety, windowedVariety, KIT_WEIGHTS, KIT_MOVES, RIVAL_ACTIONS, RIVAL_KIT_ON,
  RIVAL_TIGHT_M, IN_OUT_EXPOSED_FROM, IN_OUT_EXPOSED_TO, type KitMove,
} from './rivalOffense';
import { AttackerBrain, STEAL_EXPOSURE_MIN, GATHER_SEC, SIDESTEP_SEC, CROSSOVER_EXPOSED_FROM, CROSSOVER_EXPOSED_TO, rivalShotPct } from '../core/BasketballCore';

const DT = 1 / 60;
const RIM = new Vector3(0, 0, -0.6);
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const mem = (): Record<KitMove, number> => ({ crossover: 0, shuffle: 0, hesitation: 0, in_and_out: 0, behind: 0, spin: 0, post_up: 0 });

/** A possession of the kit against a defender placed by `def` each frame; the rival moves at his wish (the mode's mover is in the sim). */
function run(tier: 'rookie' | 'pro' | 'elite', def: (t: number, me: Vector3) => Vector3, seed = 7, maxSec = 12) {
  const b = new AttackerBrain(seeded(seed));
  const kit = new RivalKit(tier, seeded(seed + 1));
  b.useKit(kit);
  const self = new Vector3(0, 0, 9.2);
  const rows: { t: number; phase: string; exposure: number; action: string | null; back: boolean }[] = [];
  let shot: { style: string; look: string | null; dist: number } | null = null;
  for (let t = 0; t < maxSec && !shot; t += DT) {
    const d = b.decide(DT, self, def(t, self), RIM);
    self.addInPlace(d.wish.scale(DT));
    rows.push({ t, phase: d.phase, exposure: d.exposure, action: d.action ?? null, back: !!d.backToRim });
    if (d.shot) shot = { style: d.shot, look: d.look ?? null, dist: Math.hypot(self.x - RIM.x, self.z - RIM.z) };
  }
  return { b, kit, rows, shot, self };
}
const mirror = (gap: number) => (_t: number, r: Vector3) => { const d = RIM.subtract(r); d.y = 0; d.normalize(); return r.add(d.scale(gap)); };

describe('hoops/rivalOffense — the kit', () => {
  it('ships on, every gate action is named, the crossover is the release\'s shape', () => {
    expect(RIVAL_KIT_ON).toBe(true);
    expect(RIVAL_ACTIONS).toHaveLength(14);
    for (let t = 0; t < SIDESTEP_SEC; t += DT) {
      const f = moveFrame('crossover', t);
      expect(f.exposure >= STEAL_EXPOSURE_MIN).toBe(t >= CROSSOVER_EXPOSED_FROM && t <= CROSSOVER_EXPOSED_TO);
    }
    expect(moveFrame('crossover', SIDESTEP_SEC).done).toBe(true);
  });
  it('every move ends (the post-up is ended by the brain), and its exposure is a window, not the whole move', () => {
    for (const m of KIT_MOVES) {
      if (m === 'post_up') { expect(moveFrame(m, 5).done).toBe(false); expect(moveFrame(m, 0.5).exposure).toBeLessThan(STEAL_EXPOSURE_MIN); continue; }
      let t = 0; let exposed = 0, frames = 0;
      while (!moveFrame(m, t).done && t < 3) { if (moveFrame(m, t).exposure >= STEAL_EXPOSURE_MIN) exposed++; frames++; t += DT; }
      expect(t, m).toBeLessThan(1.2);
      expect(exposed, m).toBeLessThan(frames * 0.6);
    }
    // the in-and-out's ball is out wide at its turn (the poke's window); the behind-the-back and the spin are protected throughout
    expect(moveFrame('in_and_out', (IN_OUT_EXPOSED_FROM + IN_OUT_EXPOSED_TO) / 2).exposure).toBe(1);
    for (let t = 0; t < 0.6; t += DT) { expect(moveFrame('behind', t).exposure).toBeLessThan(STEAL_EXPOSURE_MIN); expect(moveFrame('spin', t).exposure).toBeLessThan(STEAL_EXPOSURE_MIN); }
  });
  it('the reads: a tight man draws the spin and the post (in its band), a loose one the crossover; a closing one the hesitation', () => {
    const tight = moveWeights('elite', { dist: RIVAL_TIGHT_M - 0.2, inLane: true, closing: 0, rimDist: 4 }, mem(), 0, null);
    const loose = moveWeights('elite', { dist: RIVAL_TIGHT_M + 0.2, inLane: true, closing: 0, rimDist: 4 }, mem(), 0, null);
    expect(tight.spin).toBeGreaterThan(loose.spin);
    expect(tight.post_up).toBeGreaterThan(0);
    expect(loose.post_up).toBe(0);
    expect(loose.crossover).toBeGreaterThan(tight.crossover);
    expect(moveWeights('elite', { dist: 2, inLane: true, closing: 0, rimDist: 9 }, mem(), 0, null).post_up).toBe(0);   // out of the post's band
    const bite = moveWeights('pro', { dist: 1.4, inLane: true, closing: 3, rimDist: 7 }, mem(), 0, null);
    const sit = moveWeights('pro', { dist: 1.4, inLane: true, closing: 0, rimDist: 7 }, mem(), 0, null);
    expect(bite.hesitation).toBeGreaterThan(sit.hesitation * 1.5);
  });
  it('the memory: ELITE leans on what worked against this defender; a ROOKIE does not (adaptRate 0)', () => {
    const r = { dist: 1.4, inLane: true, closing: 0, rimDist: 7 };
    const m = mem(); m.hesitation = 1; m.crossover = -1;
    const eNone = moveWeights('elite', r, mem(), 0, null), eMem = moveWeights('elite', r, m, 0, null);
    expect(eMem.hesitation / eNone.hesitation).toBeGreaterThan(1.5);
    expect(eMem.crossover / eNone.crossover).toBeLessThan(0.5);
    const rNone = moveWeights('rookie', r, mem(), 0, null), rMem = moveWeights('rookie', r, m, 0, null);
    expect(rMem.hesitation).toBeCloseTo(rNone.hesitation, 9);
  });
  it('the tiers differ in WHAT he does: a rookie has no spin, in-and-out, behind or post; an elite has them all', () => {
    for (const m of ['spin', 'in_and_out', 'behind', 'post_up'] as KitMove[]) { expect(KIT_WEIGHTS.rookie[m]).toBe(0); expect(KIT_WEIGHTS.elite[m]).toBeGreaterThan(0); }
  });
  it('pickWeighted reads the roll across the table and never picks a zero', () => {
    const w = { a: 1, b: 0, c: 3 };
    expect(pickWeighted(w, 0)).toBe('a');
    expect(pickWeighted(w, 0.24)).toBe('a');
    expect(pickWeighted(w, 0.26)).toBe('c');
    expect(pickWeighted(w, 0.999)).toBe('c');
    expect(pickWeighted({ a: 0 }, 0.5)).toBeNull();
  });
  it('variety: distinct actions and bits over the gate vocabulary (the shuffle is not an action)', () => {
    expect(actionVariety(['crossover', 'crossover', 'layup', 'shuffle'])).toEqual({ distinct: 2, bits: expect.closeTo(0.918, 2), n: 3 });
    const w = windowedVariety(Array.from({ length: 20 }, (_, i) => [RIVAL_ACTIONS[i % 8]]), 10);
    expect(w.windows).toBe(2); expect(w.distinctMin).toBe(8); expect(w.bitsMin).toBeGreaterThan(2.9);
  });
});

describe('hoops/rivalOffense — a possession', () => {
  it('opens with the check, a standstill; an open lane is a drive and a layup after the gather', () => {
    const r = run('pro', () => new Vector3(6, 0, 14));
    expect(r.rows.slice(0, 5).every((x) => x.phase === 'check')).toBe(true);
    expect(r.shot?.style).toBe('layup');
    expect(r.rows.some((x) => x.action === 'drive')).toBe(true);
    expect(r.rows.filter((x) => x.phase === 'gather').length * DT).toBeCloseTo(GATHER_SEC, 1);
    expect(r.rows.filter((x) => x.phase === 'gather').every((x) => x.exposure === 0)).toBe(true);
  });
  it('held in front, he throws moves (not one), and every possession ends in a shot by the clock', () => {
    for (const seed of [3, 7, 11, 19]) {
      const r = run('elite', mirror(1.1), seed);
      expect(r.shot, `seed ${seed}`).not.toBeNull();
      const moves = r.kit.actions.filter((a) => ['crossover', 'hesitation', 'in_and_out', 'behind', 'spin', 'post_up'].includes(a));
      expect(moves.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
    }
  });
  it('a move beats a body that stays put and loses to one that stays in front (geometry, not a roll): the hesitation', () => {
    // a defender who stops dead where the hesitation started is beaten by the go; a mirror is not
    const stays = (() => { let at: Vector3 | null = null; return (t: number, r: Vector3) => { if (t < 1.0) return mirror(1.1)(t, r); at ??= mirror(1.1)(t, r); return at; }; })();
    const beaten = run('pro', stays, 5);
    const held = run('pro', mirror(1.1), 5);
    const closest = (rows: typeof beaten.rows, self: Vector3) => Math.hypot(self.x - RIM.x, self.z - RIM.z);
    expect(closest(beaten.rows, beaten.self)).toBeLessThan(closest(held.rows, held.self));
  });
  it('the post-up backs him down with his back to the rim and ends in a hook (a layup) or a fade (a jumper)', () => {
    // put the defender tight inside the post band, every frame, and force the post by memory
    for (const seed of [2, 4, 6, 8, 10, 12, 14, 16]) {
      const b = new AttackerBrain(seeded(seed)); const kit = new RivalKit('elite', seeded(seed)); b.useKit(kit);
      for (const m of KIT_MOVES) kit.memory[m] = m === 'post_up' ? 1 : -1;
      const self = new Vector3(0.3, 0, 4.2);
      let sawPost = false, back = false, shot: string | null = null, look: string | null = null;
      for (let t = 0; t < 10 && !shot; t += DT) {
        const d = b.decide(DT, self, mirror(1.05)(t, self), RIM);
        if (d.phase === 'post') { sawPost = true; back = back || !!d.backToRim; }
        self.addInPlace(d.wish.scale(DT));
        if (d.shot) { shot = d.shot; look = d.look ?? null; }
      }
      if (!sawPost) continue;
      expect(back).toBe(true);
      expect(['layup', 'jumper']).toContain(shot);
      if (shot === 'layup') expect(look === 'hook' || look === null).toBe(true);
      return;
    }
    throw new Error('no seed reached a post-up');
  });
  it('the odds are the release\'s: a floater is a jumper from where it is let go, a hook a layup', () => {
    expect(rivalShotPct(3.5, 0.5, 'jumper')).toBeCloseTo(0.52 - 0.21, 6);
    expect(rivalShotPct(2.2, 0.5, 'layup')).toBeCloseTo(0.74 - 0.21, 6);
  });
  it('a strip on a move teaches him: the move he lost it on is leaned on less', () => {
    const b = new AttackerBrain(seeded(1)); const kit = new RivalKit('elite', seeded(2)); b.useKit(kit);
    const self = new Vector3(0, 0, 8);
    let lost: string | null = null;
    for (let t = 0; t < 6 && !lost; t += DT) { const d = b.decide(DT, self, mirror(1.1)(t, self), RIM); self.addInPlace(d.wish.scale(DT)); if (d.exposure >= STEAL_EXPOSURE_MIN && d.phase !== 'drive') { lost = kit.actions[kit.actions.length - 1] ?? null; b.noteStolen(); } }
    expect(lost).not.toBeNull();
    const m = (lost === 'hesitation' || lost === 'in_and_out' || lost === 'crossover' ? lost : 'crossover') as KitMove;
    expect(kit.memory[m]).toBeLessThan(0);
  });
  it('the release\'s script is untouched without a kit (the brain\'s default)', () => {
    const b = new AttackerBrain(seeded(7));
    expect(b.kit).toBeNull();
    const d = b.decide(DT, new Vector3(0, 0, 9), new Vector3(0, 0, 7), RIM);
    expect(d.action).toBeUndefined();
  });
});
