import { describe, expect, it } from 'vitest';
import {
  pathFor, pathAt, mirrorPath, crossingsOf, DEFAULT_STANCE, PATH_PHI_AT_STRIKE, CONTACT_FADE_SEC, LOCK_STRETCH, PAUSIN_MAX_SEC,
  type HandlePath, type PathMove, type V3,
} from './handlePaths';
import { STRIDE_PHI_AT_STRIKE } from './ballCarry';
import { dribbleAtPushed, HOOPS_DRIBBLE, PUSHED_FLOOR_PHASE } from './Dribble';
import { MOVE_SHAPE, type HandleMove } from '../core/HandleSystem';

// HOOPS MOTION phase 4a (plan §3.2, §6): the ball's path through every handle move, pure. The carry does not play these yet (4b); what is
// proven here is the path itself: continuous, inside the per-frame bound at the game's frame rates and paces, crossing as the move's shape
// says, and shaped as the decode asks (a crossover low and past the midline, between the feet, behind the hips, an in-and-out that comes
// back, a yoyo with two tops).

const MOVES = (Object.keys(MOVE_SHAPE) as HandleMove[]);
const WITH_PATH = MOVES.filter((m) => MOVE_SHAPE[m].path !== 'none');
const EXTRA: PathMove[] = ['jab', 'pausin', 'pausin_release'];
const ALL: PathMove[] = [...WITH_PATH, ...EXTRA];
const sub = (a: V3, b: V3) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
const need = (p: HandlePath | null): HandlePath => { if (!p) throw new Error('no path'); return p; };
/** The ball sampled at `fps` over the path, root frame. */
const samples = (p: HandlePath, fps: number): V3[] => { const out: V3[] = []; for (let i = 0; i <= Math.ceil(p.duration * fps); i++) out.push(pathAt(p, i / fps).ball); return out; };
/** The largest step between frames: hips-relative (the root frame: a root translation cancels, the hips ride the root) and, with the
 *  root running forward at `mps`, in the world. */
function steps(p: HandlePath, fps: number, mps = 0): { rel: number; world: number } {
  const s = samples(p, fps); let rel = 0, world = 0; const dz = mps / fps;
  for (let i = 1; i < s.length; i++) { const d = sub(s[i], s[i - 1]); rel = Math.max(rel, len(d)); world = Math.max(world, len({ x: d.x, y: d.y, z: d.z + dz })); }
  return { rel, world };
}

describe('every path', () => {
  it('exists for every move with a path family, and not for the step-back or off the head (the carry bounces / the mode throws)', () => {
    for (const m of WITH_PATH) expect(pathFor(m, 'right'), m).not.toBeNull();
    expect(pathFor('stepback', 'right')).toBeNull();
    expect(pathFor('off_the_head', 'right')).toBeNull();
  });

  it("starts in the start hand's dribble top and ends in the end hand's, at rest", () => {
    const S = DEFAULT_STANCE;
    for (const m of ALL.filter((x) => x !== 'pausin' && x !== 'pausin_release')) {
      for (const hand of ['right', 'left'] as const) {
        const p = need(pathFor(m, hand)); const sx = (h: string) => (h === 'right' ? S.S : -S.S);
        const a = pathAt(p, 0), b = pathAt(p, p.duration);
        expect(len(sub(a.ball, { x: sx(hand), y: S.P, z: S.F })), `${m} ${hand} start`).toBeLessThan(1e-9);
        expect(len(sub(b.ball, { x: sx(p.endHand), y: S.P, z: S.F })), `${m} ${hand} end`).toBeLessThan(1e-9);
        expect(len(a.vel) + len(b.vel), `${m} at rest at both ends`).toBeLessThan(1e-9);
      }
    }
  });

  it('joins its segments C1: the velocity is continuous at every join but the floor contact (the bounce)', () => {
    for (const m of ALL) {
      const p = need(pathFor(m, 'right'));
      for (let i = 1; i < p.segs.length; i++) {
        const a = p.segs[i - 1], b = p.segs[i];
        expect(Math.abs(a.t1 - b.t0), `${m} join ${i} in time`).toBeLessThan(1e-12);
        expect(len(sub(a.p1, b.p0)), `${m} join ${i} in place`).toBeLessThan(1e-12);
        const bounce = a.mode === 'fall' && b.mode === 'rise';
        if (bounce) { expect(a.v1.y, `${m} falls into the floor`).toBeLessThan(0); expect(b.v0.y, `${m} leaves it rising`).toBeGreaterThan(0); continue; }
        expect(len(sub(a.v1, b.v0)), `${m} join ${i} (${a.kind} → ${b.kind}) velocity`).toBeLessThan(1e-9);
      }
    }
  });

  it('bounces off the floor at the ball\'s radius: every flight touches it once, nothing goes under it', () => {
    for (const m of ALL) {
      const p = need(pathFor(m, 'right'));
      for (const b of samples(p, 1000)) expect(b.y, m).toBeGreaterThanOrEqual(DEFAULT_STANCE.r - 1e-9);
      const floors = p.segs.filter((s) => s.mode === 'fall');
      for (const f of floors) expect(Math.abs(f.p1.y - DEFAULT_STANCE.r), `${m} floor`).toBeLessThan(1e-12);
    }
  });

  // the per-frame bound (PLAN G4: 0.15 m a frame). Read hips-relative on a moving move and world on a standing one (owner Q10); a root
  // translation cancels in the root frame, so the rel figure is one number per move — asserted at 60 and 120 fps, at pace 1 and at the
  // turbo's real-speed ceiling 1.25 (moveRateFor). assumption: at 30 fps the plan's "≤ 0.15 at 30/60/120 fps" is read as the SAME SPEED
  // (0.30 m a 30 fps frame): today's own pushed dribble peaks at 3.1·H·hz = 5.3 m/s (Dribble.ts), 0.178 m a 30 fps frame, so a literal
  // 0.15 there would fail every bounce the game already plays.
  for (const pace of [1, 1.25]) {
    it(`stays inside 0.15 m a frame hips-relative at 60 and 120 fps (0.30 at 30 fps) — pace ${pace}`, () => {
      const worst: string[] = [];
      for (const m of ALL) {
        const p = need(pathFor(m, 'right', pace));
        const s60 = steps(p, 60).rel, s120 = steps(p, 120).rel, s30 = steps(p, 30).rel;
        if (s60 > 0.15 || s120 > 0.15 || s30 > 0.30) worst.push(`${m}: ${s30.toFixed(3)} / ${s60.toFixed(3)} / ${s120.toFixed(3)}`);
      }
      expect(worst).toEqual([]);
    });
  }

  it('standing, the world step is the rel step (≤ 0.15); running, the world figure is reported beside it (Q10: not a gate on a moving move)', () => {
    const table: Record<string, number[]> = {};
    for (const m of ALL) {
      const p = need(pathFor(m, 'right'));
      expect(steps(p, 60, 0).world, m).toBeLessThanOrEqual(0.15);
      table[m] = [0, 2.5, 4.6, 6.4].map((v) => +(steps(p, 60, v).world - v / 60).toFixed(3));   // the world step less the root's
      for (const x of table[m]) expect(Number.isFinite(x)).toBe(true);
    }
    // the triangle: a world step is never more than the root's step plus the rel step
    for (const m of ALL) { const p = need(pathFor(m, 'right')); for (const v of [2.5, 4.6, 6.4]) expect(steps(p, 60, v).world).toBeLessThanOrEqual(v / 60 + steps(p, 60).rel + 1e-9); }
  });

  it('crosses the midline as its MOVE_SHAPE says, and ends in the hand that implies', () => {
    for (const m of WITH_PATH) {
      for (const hand of ['right', 'left'] as const) {
        const p = need(pathFor(m, hand));
        expect(crossingsOf(p), `${m} ${hand}`).toBe(MOVE_SHAPE[m].crosses);
        expect(p.endHand, `${m} ${hand}`).toBe(MOVE_SHAPE[m].crosses === 1 ? (hand === 'right' ? 'left' : 'right') : hand);
      }
    }
    for (const m of EXTRA) expect(crossingsOf(need(pathFor(m, 'right'))), m).toBe(0);
  });

  it('is its own mirror: a left-hand start is the right-hand path with x negated and the hands swapped', () => {
    for (const m of ALL) {
      const r = need(pathFor(m, 'right')), l = need(pathFor(m, 'left'));
      expect(l.duration).toBeCloseTo(r.duration, 12);
      for (let t = 0; t <= r.duration; t += 0.01) {
        const a = pathAt(r, t), b = pathAt(l, t);
        expect(Math.abs(a.ball.x + b.ball.x) + Math.abs(a.ball.y - b.ball.y) + Math.abs(a.ball.z - b.ball.z), `${m} at ${t.toFixed(2)}`).toBeLessThan(1e-9);
        expect(b.contact, m).toBe(a.contact ? (a.contact === 'right' ? 'left' : 'right') : null);
      }
      expect(mirrorPath(mirrorPath(r))).toEqual(r);
    }
  });

  it('maps onto a body\'s own stance: a fitted palm moves the tops, the floor stays at the ball\'s radius', () => {
    const p = need(pathFor('crossover', 'right', 1, { P: 1.08 }));
    expect(pathAt(p, 0).ball.y).toBeCloseTo(1.08, 12);
    expect(pathAt(p, p.duration).ball.y).toBeCloseTo(1.08, 12);
    expect(Math.min(...samples(p, 1000).map((b) => b.y))).toBeGreaterThanOrEqual(DEFAULT_STANCE.r - 1e-9);
    expect(steps(p, 60).rel).toBeLessThanOrEqual(0.15);
  });
});

describe('the shapes the decode asks for', () => {
  it('the crossover crosses low and far: the midline at ≤ 0.6 m, ≥ 0.3 m past it on the far side (G5)', () => {
    for (const m of ['crossover', 'momentum_cross', 'snatch_back'] as const) {
      const p = need(pathFor(m, 'right')); const s = samples(p, 1000);
      let mid = Infinity; for (let i = 1; i < s.length; i++) if (Math.sign(s[i].x) !== Math.sign(s[i - 1].x)) mid = Math.min(mid, s[i].y);
      expect(mid, `${m} midline height`).toBeLessThanOrEqual(0.6);
      expect(Math.max(...s.map((b) => -b.x)), `${m} far lateral`).toBeGreaterThanOrEqual(0.3);
    }
  });

  it("between the legs bounces inside the split stance's box and crosses there (G2)", () => {
    // the plan's v2 stance: the lead (catch-side, left) foot at z +0.30, the trail foot at −0.15, 0.40 m wide
    const p = need(pathFor('between_legs', 'right'));
    const floor = p.segs.find((s) => s.mode === 'fall')!.p1;
    expect(floor.x).toBeGreaterThan(-0.2); expect(floor.x).toBeLessThan(0.2);
    expect(floor.z).toBeGreaterThan(-0.15); expect(floor.z).toBeLessThan(0.30);
    const s = samples(p, 1000); const i = s.findIndex((b, k) => k > 0 && Math.sign(b.x) !== Math.sign(s[k - 1].x));
    expect(Math.abs(i / 1000 - p.segs.find((x) => x.mode === 'fall')!.t1)).toBeLessThan(0.12);   // the crossing at the bounce (h4's ±0.12 s)
  });

  it('behind the back crosses behind the hips: z < −0.10 at the sign change, between 0.3 and 1.3 m high (G3)', () => {
    for (const m of ['behind_back', 'momentum_btb'] as const) {
      const s = samples(need(pathFor(m, 'right')), 1000);
      const i = s.findIndex((b, k) => k > 0 && Math.sign(b.x) !== Math.sign(s[k - 1].x));
      expect(s[i].z, m).toBeLessThan(-0.10 + DEFAULT_STANCE.F - 0.16);
      expect(s[i].y, m).toBeGreaterThan(0.3); expect(s[i].y, m).toBeLessThan(1.3);
    }
  });

  it('the in-and-out goes ≥ 0.2 m toward the midline and is back inside 0.3 s, in the same hand (G8)', () => {
    for (const m of ['in_and_out', 'slip_slide'] as const) {
      const p = need(pathFor(m, 'right')); const S = DEFAULT_STANCE.S; const s = samples(p, 1000);
      expect(S - Math.min(...s.map((b) => b.x)), m).toBeGreaterThanOrEqual(0.2);
      const inT = s.map((b, k) => (S - b.x > 0.05 ? k : -1)).filter((k) => k >= 0);
      expect((inT[inT.length - 1] - inT[0]) / 1000, `${m}: in more than 5 cm for`).toBeLessThanOrEqual(0.3);
      expect(p.endHand).toBe('right');
    }
  });

  it('the yoyo has two tops ≥ 0.25 m apart and never crosses', () => {
    const p = need(pathFor('yoyo', 'right')); const s = samples(p, 1000); const tops: number[] = [];
    for (let i = 1; i < s.length - 1; i++) if (s[i].y > s[i - 1].y && s[i].y >= s[i + 1].y) tops.push(s[i].y);
    expect(tops.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThanOrEqual(0.25);
  });

  it("the Shammgod pushes the ball ≥ 0.45 m out in front before the other hand pulls it across", () => {
    const p = need(pathFor('shammgod', 'right')); const s = samples(p, 1000);
    expect(Math.max(...s.map((b) => b.z)) - DEFAULT_STANCE.F).toBeGreaterThanOrEqual(0.45);
  });

  it('the double cross crosses twice and the steezo roll is the wrap then the pull back: both end in the start hand', () => {
    for (const m of ['double_cross', 'steezo_roll'] as const) { const p = need(pathFor(m, 'right')); expect(crossingsOf(p), m).toBe(2); expect(p.endHand, m).toBe('right'); }
    const roll = need(pathFor('steezo_roll', 'right'));
    expect(roll.duration).toBeCloseTo(need(pathFor('behind_back', 'right')).duration + need(pathFor('spin', 'right')).duration, 12);
  });

  it("the spin's pull palms the ball at the hips, then the other hand catches it — within 0.3 m of the hips through the hold", () => {
    const p = need(pathFor('spin', 'right'));
    const hips = { x: 0, y: 0.95, z: 0 };
    for (let t = 0.12; t <= 0.28; t += 0.01) { const a = pathAt(p, t); expect(a.contact).toBe('right'); expect(len(sub(a.ball, hips))).toBeLessThanOrEqual(0.3); }
    expect(pathAt(p, p.duration).contact).toBe('left');
  });

  it('the pull path under a turning root (the spin\'s 180–270° over SPIN_SEC, a smoothstep) stays inside 0.15 m a frame against the hips', () => {
    const p = need(pathFor('spin', 'right'));
    for (const sweep of [Math.PI, 1.5 * Math.PI]) {
      const fps = 60; let worst = 0; let prev: V3 | null = null;
      for (let i = 0; i <= Math.ceil(p.duration * fps); i++) {
        const t = i / fps, u = Math.min(1, t / p.duration), yaw = sweep * u * u * (3 - 2 * u);
        const b = pathAt(p, t).ball; const c = Math.cos(yaw), sn = Math.sin(yaw);
        const w = { x: b.x * c + b.z * sn, y: b.y, z: -b.x * sn + b.z * c };   // the ball's offset from the (turning) hips, in the world
        if (prev) worst = Math.max(worst, len(sub(w, prev))); prev = w;
      }
      expect(worst, `sweep ${(sweep * 180 / Math.PI).toFixed(0)}°`).toBeLessThanOrEqual(0.15);
    }
  });

  it("PAUSIN' holds the ball out to the side for up to PAUSIN_MAX_SEC, and its release pounds forward (floor at z 0.45)", () => {
    const hold = need(pathFor('pausin', 'right'));
    expect(hold.duration).toBeCloseTo(0.12 + PAUSIN_MAX_SEC, 12);
    const at = pathAt(hold, 0.5).ball; expect(at.x).toBeCloseTo(DEFAULT_STANCE.S + 0.08, 9); expect(pathAt(hold, 0.5).contact).toBe('right');
    const rel = need(pathFor('pausin_release', 'right'));
    expect(rel.segs.find((s) => s.mode === 'fall')!.p1.z).toBeCloseTo(0.45, 12);
  });
});

describe('the contact schedule (plan §3.3)', () => {
  it('the start hand is on the ball through the push and fades off over CONTACT_FADE_SEC; the end hand fades on before its catch and holds it', () => {
    const p = need(pathFor('crossover', 'right'));
    const push = p.segs[0], cat = p.segs[p.segs.length - 1];
    expect(pathAt(p, 0).reach.right).toBe(1);
    expect(pathAt(p, push.t1 + CONTACT_FADE_SEC / 2).reach.right).toBeCloseTo(0.5, 6);
    expect(pathAt(p, push.t1 + CONTACT_FADE_SEC + 0.001).reach.right).toBe(0);
    expect(pathAt(p, cat.t0 - CONTACT_FADE_SEC / 2).reach.left).toBeCloseTo(0.5, 6);
    expect(pathAt(p, cat.t0 - CONTACT_FADE_SEC - 0.001).reach.left).toBe(0);
    expect(pathAt(p, p.duration).reach.left).toBe(1);
    const mid = pathAt(p, (p.segs[1].t0 + p.segs[1].t1) / 2);
    expect(mid.contact).toBeNull();
  });

  it('a hand on the ball targets the top of the ball; a hand fading on targets the ball where it will meet it', () => {
    const p = need(pathFor('crossover', 'right'));
    const a = pathAt(p, 0.02); expect(a.handTarget.right).toEqual({ x: a.ball.x, y: a.ball.y + DEFAULT_STANCE.r, z: a.ball.z });
    const cat = p.segs[p.segs.length - 1]; const meet = pathAt(p, cat.t0).ball;
    const b = pathAt(p, cat.t0 - 0.03); expect(b.handTarget.left).toEqual({ x: meet.x, y: meet.y + DEFAULT_STANCE.r, z: meet.z });
    expect(pathAt(p, p.segs[0].t1 + CONTACT_FADE_SEC + 0.01).handTarget.right).toBeNull();   // in the air, past its fade, the clip owns the push hand
  });

  it('lists the hands inside CONTACT_FADE_SEC of a contact (the drag skips them) and reads the shape\'s exposure inside its k range', () => {
    const p = need(pathFor('crossover', 'right'));
    expect(pathAt(p, 0.01).contactHands).toEqual(['right']);
    expect(pathAt(p, p.duration).contactHands).toEqual(['left']);
    expect(pathAt(p, p.duration * 0.5).exposed).toBe(1);
    expect(pathAt(p, p.duration * 0.1).exposed).toBe(0);
    expect(pathAt(need(pathFor('between_legs', 'right')), 0.2).exposed).toBe(0.3);
  });
});

describe('continuity with the dribble and the stride', () => {
  /** The drawn ball on the start hand's pushed bounce (Dribble.dribbleAtPushed) at `hz`, at phase `ph` (root frame). */
  const drawn = (ph: number, hz: number) => { const H = HOOPS_DRIBBLE, d = dribbleAtPushed(ph, H), e = dribbleAtPushed(ph + 0.001, H); return { p: { x: H.side, y: d.ballY, z: H.forward }, v: { x: 0, y: ((e.ballY - d.ballY) / 0.001) * hz, z: 0 } }; };
  /** The first time the ball is past the midline on the other side (a right-hand start). */
  const firstCross = (p: HandlePath): number => { for (let t = 0; t <= p.duration + 1e-9; t += 0.001) if (pathAt(p, t).ball.x < -0.02) return t; return Infinity; };

  it('a move asked mid-bounce, at any phase of the hoops dribble, starts from the drawn ball with no step over 0.15 m (0.30 at 30 fps)', () => {
    // every path move, every 5 % of the bounce, at 1.7 and 2 Hz (the idle and the stride lock's ceiling), pace 1 and the turbo's 1.25
    const bad: string[] = [];
    for (const hz of [1.7, 2]) for (const pace of [1, 1.25]) for (let ph = 0; ph < 0.999; ph += 0.05) {
      const from = drawn(ph, hz);
      for (const m of WITH_PATH) {
        const p = need(pathFor(m, 'right', pace, {}, undefined, from)), at = `${m} ${hz} Hz pace ${pace} phase ${ph.toFixed(2)}`;
        if (len(sub(pathAt(p, 0).ball, from.p)) > 1e-9) bad.push(`${at}: does not start at the drawn ball`);
        const s60 = steps(p, 60).rel, s30 = steps(p, 30).rel;
        if (s60 > 0.15 || s30 > 0.30) bad.push(`${at}: ${s30.toFixed(3)} / ${s60.toFixed(3)}`);
        if (crossingsOf(p) !== MOVE_SHAPE[m].crosses) bad.push(`${at}: crossings ${crossingsOf(p)}`);
        if (Math.min(...samples(p, 1000).map((b) => b.y)) < DEFAULT_STANCE.r - 1e-9) bad.push(`${at}: under the floor`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('…and it STARTS AT ONCE (U2, 4a review F1): request → the first midline crossing ≤ the move from rest plus one fall of the dribble', () => {
    // 4a met a falling ball at its next top at rest: a crossover asked on a falling ball crossed 0.48–0.70 s after the request (from rest
    // 0.18 s). A falling ball is re-aimed at the path's floor contact now, a rising one met at the path's release — so the ball starts on
    // the move the frame it is asked, and crosses within the time the ball needs to get to the floor once
    const bad: string[] = []; const worst: Record<string, number> = {};
    for (const hz of [1.7, 2]) for (const pace of [1, 1.25]) {
      const oneFall = PUSHED_FLOOR_PHASE / hz;
      for (const m of WITH_PATH.filter((x) => MOVE_SHAPE[x].crosses > 0)) {
        const rest = firstCross(need(pathFor(m, 'right', pace)));
        for (let ph = 0; ph < 0.999; ph += 0.05) {
          const lat = firstCross(need(pathFor(m, 'right', pace, {}, undefined, drawn(ph, hz))));
          worst[m] = Math.max(worst[m] ?? 0, lat - rest);
          if (!(lat <= rest + oneFall + 1e-9)) bad.push(`${m} ${hz} Hz pace ${pace} phase ${ph.toFixed(2)}: ${lat.toFixed(3)} s against ${(rest + oneFall).toFixed(3)}`);
        }
      }
    }
    expect(bad).toEqual([]);
    // a ball falling from high enough to be re-aimed (phase ≤ 0.35 at 2 Hz: its fall ≥ 0.05 s) crosses within a fall of the request —
    // nearer the floor it bounces on its own side first (REAIM_MAX_MPS) and is met on the way up (the bound above)
    for (let ph = 0.05; ph <= 0.35 + 1e-9; ph += 0.05) expect(firstCross(need(pathFor('crossover', 'right', 1, {}, undefined, drawn(ph, 2)))), `phase ${ph.toFixed(2)}`).toBeLessThanOrEqual(PUSHED_FLOOR_PHASE / 2 + 1e-9);
  });

  it("with the end hand's lock foot, the catch lands the next bounce's phase on PATH_PHI_AT_STRIKE at its strike (within ±15 % of the path)", () => {
    for (const period of [0.5, 0.6, 0.7]) {
      for (const strikePhase of [0, 0.2, 0.45, 0.7, 0.9]) {
        const p0 = need(pathFor('crossover', 'right')), p = need(pathFor('crossover', 'right', 1, {}, { strikePhase, period }));
        expect(Math.abs(p.duration - p0.duration)).toBeLessThanOrEqual(LOCK_STRETCH * p0.duration + 1e-9);
        // the foot's strikes after the path's end; the bounce phase there (one bounce a stride from the top at the end)
        const toStrike = (1 - strikePhase) % 1 * period; let T = toStrike; while (T < p.duration - 1e-9) T += period;
        const phase = ((T - p.duration) / period) % 1;
        const err = Math.abs(((phase - PATH_PHI_AT_STRIKE + 0.5) % 1 + 1) % 1 - 0.5);
        expect(err, `period ${period} strike phase ${strikePhase}: miss ${p.lockMiss}`).toBeLessThanOrEqual(Math.abs(p.lockMiss ?? 0) + 1e-9);
        if (Math.abs(p.lockMiss ?? 0) < 1e-9) expect(err).toBeLessThan(1e-9);
        expect(steps(p, 60).rel).toBeLessThanOrEqual(0.15);
      }
    }
  });

  it("…but ±15 % reaches the stride only on a fifth of the strike phases at a 0.6 s stride: the miss is reported (lockMiss), never hidden", () => {
    // measured, not designed: a 0.42 s crossover has ±0.063 s of slack, and the end times that land repeat every period, so the share of
    // strike phases it can land is 2 × 0.063 / 0.6 ≈ 0.21 (plan §3.3's fallback — the lock gain easing back — covers the rest)
    let landed = 0, n = 0;
    for (let sp = 0; sp < 1 - 1e-9; sp += 0.05) { const p = need(pathFor('crossover', 'right', 1, {}, { strikePhase: sp, period: 0.6 })); n++; if (Math.abs(p.lockMiss ?? 0) < 1e-9) landed++; }
    expect(n).toBe(20);
    expect(landed).toBeGreaterThanOrEqual(3); expect(landed).toBeLessThanOrEqual(6);
  });

  it('with the lock AND a mid-bounce start, the catch is re-timed after the blend: the phase error at the strike is never more than lockMiss (4a review F4)', () => {
    // re-timed first, 4a's blend then moved the catch (a pre-roll of the ball's own bounce, or a cut): 100 of 600 cases read lockMiss 0
    // and landed up to half a bounce off the strike
    const bad: string[] = []; let landed = 0, n = 0;
    for (const period of [0.5, 0.6, 0.7]) for (let sp = 0; sp < 0.999; sp += 0.05) for (let ph = 0; ph < 0.999; ph += 0.1) {
      const p = need(pathFor('crossover', 'right', 1, {}, { strikePhase: sp, period }, drawn(ph, 2)));
      const toStrike = (1 - sp) % 1 * period; let T = toStrike; while (T < p.duration - 1e-9) T += period;
      const phase = ((T - p.duration) / period) % 1;
      const err = Math.abs(((phase - PATH_PHI_AT_STRIKE + 0.5) % 1 + 1) % 1 - 0.5);
      n++; if (Math.abs(p.lockMiss ?? 0) < 1e-9) landed++;
      if (err > Math.abs(p.lockMiss ?? 0) + 1e-9) bad.push(`period ${period} strike ${sp.toFixed(2)} phase ${ph.toFixed(1)}: error ${err.toFixed(3)}, lockMiss ${p.lockMiss}`);
      if (steps(p, 60).rel > 0.15) bad.push(`period ${period} strike ${sp.toFixed(2)} phase ${ph.toFixed(1)}: step ${steps(p, 60).rel.toFixed(3)}`);
    }
    expect(bad).toEqual([]);
    expect(n).toBe(600); expect(landed).toBeGreaterThan(0);
  });

  it("PATH_PHI_AT_STRIKE is the carry's own STRIDE_PHI_AT_STRIKE (kept apart only to spare the carry an import cycle)", () => {
    expect(PATH_PHI_AT_STRIKE).toBe(STRIDE_PHI_AT_STRIKE);
  });
});
