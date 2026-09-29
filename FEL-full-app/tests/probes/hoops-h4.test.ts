import { describe, expect, it } from 'vitest';
import {
  measureH4, crossingsH4, betweenH4, behindH4, flagsV1, spinH4, hesiH4, shimmyH4, pathH4, latencyH4, leftDribbleH4, playedMove, JN, J, windowMoveClip,
  type H4Body, type H4Frame, type H4Mark,
} from '../../scripts/probes/_hoops-h4.mts';
import { pathFor, pathAt, mirrorPath, type HandlePath } from '../../lib/babylon/anim/handlePaths';
import { dribbleAtPushed, HOOPS_DRIBBLE } from '../../lib/babylon/anim/Dribble';

// HOOPS MOTION phase 4a (plan §5.2): THE NEGATIVE CONTROLS, before any gate is read. Phases 1–3's `underLegs` / `behindBack` read noise
// (base2: hero_1v1_drive flagged both 5/5); h4's `between` / `behind` replace them. On synthetic bodies — a skeleton posed from its root
// and a few stance choices, the ball on a handlePaths path or on the hoops dribble — the drive, the idle and the crossover must read
// false for both, and a between / behind path must read true. The rest of h4 is pinned on the same bodies.

type P = [number, number, number];
const DT = 1000 / 60;
/** A drawn body: the root at `root` facing `yaw` (+z at 0; the athlete's right is +x at 0), the joints from a small table. */
function body(root: P, yaw: number, o: { feet?: 'square' | 'split' | 'stride'; stride?: number; hipsY?: number; spine2Y?: number; shoulderDeg?: number; clip?: string } = {}): H4Body {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const w = (x: number, y: number, z: number): number[] => [root[0] + x * c + z * s, root[1] + y, root[2] - x * s + z * c];
  const hy = o.hipsY ?? 0.95, sh = ((o.shoulderDeg ?? 0) * Math.PI) / 180;
  const arm = (side: number): number[] => w(side * 0.18 * Math.cos(sh), 1.4, -side * 0.18 * Math.sin(sh));
  const feet: Record<string, [P, P]> = {
    square: [[-0.18, 0.08, 0], [0.18, 0.08, 0]],
    split: [[-0.2, 0.08, 0.30], [0.2, 0.08, -0.15]],   // the plan's v2 between-the-legs stance: the lead (left) foot ahead
    stride: [[-0.12, 0.08, 0.35 * (o.stride ?? 1)], [0.12, 0.08, -0.35 * (o.stride ?? 1)]],
  };
  const [lf, rf] = feet[o.feet ?? 'square'];
  const J0: Record<string, number[]> = {
    Hips: w(0, hy, 0), Spine: w(0, hy + 0.1, 0), Spine1: w(0, hy + 0.2, 0), Spine2: w(0, o.spine2Y ?? hy + 0.3, 0), Neck: w(0, hy + 0.5, 0), Head: w(0, hy + 0.65, 0),
    LeftShoulder: w(-0.08, 1.4, 0), RightShoulder: w(0.08, 1.4, 0), LeftArm: arm(-1), RightArm: arm(1),
    LeftForeArm: w(-0.25, 1.15, 0.05), RightForeArm: w(0.25, 1.15, 0.05), LeftHand: w(-0.28, 0.95, 0.12), RightHand: w(0.28, 0.95, 0.12),
    LeftUpLeg: w(-0.1, hy - 0.05, 0), RightUpLeg: w(0.1, hy - 0.05, 0), LeftLeg: w(-0.12, 0.5, 0.02), RightLeg: w(0.12, 0.5, 0.02),
    LeftFoot: w(...lf), RightFoot: w(...rf), LeftToeBase: w(lf[0], 0.03, lf[2] + 0.14), RightToeBase: w(rf[0], 0.03, rf[2] + 0.14),
  };
  return { rp: [...root], rq: null, rr: [0, yaw, 0], j: JN.map((n) => J0[n]), c: [[o.clip ?? 'bball_mc_dribble_jog', 1]] };
}
/** The ball's world point for a root-frame point (x the athlete's right, z forward). */
const worldOf = (root: P, yaw: number, p: { x: number; y: number; z: number }): number[] => [root[0] + p.x * Math.cos(yaw) + p.z * Math.sin(yaw), root[1] + p.y, root[2] - p.x * Math.sin(yaw) + p.z * Math.cos(yaw)];
/** A 1v1-offence frame: the hero's carry on `hand` (the athlete's), the ball live on the dribble. */
const frame = (t: number, b: H4Body, ball: number[], hand: 'R' | 'L', extra: Record<string, unknown> = {}): H4Frame => ({ t, B: { me: b }, ball, bb: '', br: false, s: { po: 'mine', ca: hand, hh: { me: hand }, ...extra } });
/** The hoops dribble on a hand for `sec`, from phase 0 (the stroke's top), root frame. */
function dribbleFrames(t0: number, sec: number, rootAt: (t: number) => P, yaw: number, hand: 'R' | 'L', o: Parameters<typeof body>[2] = {}, hz = 1.7, dx = 0, dz = 0): H4Frame[] {
  const out: H4Frame[] = [];
  for (let k = 0; k * DT <= sec * 1000; k++) {
    const t = t0 + k * DT, d = dribbleAtPushed((k * DT / 1000) * hz, HOOPS_DRIBBLE);
    const x = (hand === 'R' ? 1 : -1) * (d.ball.x + dx); const r = rootAt(t);
    out.push(frame(t, body(r, yaw, o), worldOf(r, yaw, { x, y: d.ballY, z: d.ball.z + dz }), hand));
  }
  return out;
}
/** A handlePaths move from its start, the carry's hand following the path's contacts (the last hand to touch it) — or, `destination`,
 *  the hand it is going to from the first frame (today's carry: `hand` is the destination once a crossing starts). A `hold` segment is
 *  the ball in the hand (parented: bb). */
function moveFrames(t0: number, path: HandlePath, rootAt: (t: number) => P, yawAt: (t: number) => number, o: Parameters<typeof body>[2] = {}, extra: (t: number) => Record<string, unknown> = () => ({}), destination = false): H4Frame[] {
  const out: H4Frame[] = []; let hand: 'R' | 'L' = (destination ? path.endHand : path.startHand) === 'right' ? 'R' : 'L';
  for (let k = 0; k * DT <= path.duration * 1000; k++) {
    const t = t0 + k * DT, a = pathAt(path, (k * DT) / 1000); if (a.contact && !destination) hand = a.contact === 'right' ? 'R' : 'L';
    const r = rootAt(t), y = yawAt(t);
    const f = frame(t, body(r, y, o), worldOf(r, y, a.ball), hand, extra(t)); if (a.seg === 'hold') { f.bb = 'me'; f.bh = a.contact === 'left' ? 'L' : 'R'; }
    out.push(f);
  }
  return out;
}
const still = (): P => [0, 0, 4];
const need = (p: HandlePath | null) => { if (!p) throw new Error('no path'); return p; };
/** idle dribble, then the move, then the dribble on the end hand: the move starts at A0 = 500 ms. */
function play(move: Parameters<typeof pathFor>[0], o: Parameters<typeof body>[2] = {}, destination = false): { win: H4Frame[]; A0: number; path: HandlePath } {
  const path = need(pathFor(move, 'right'));
  const pre = dribbleFrames(0, 0.5, still, 0, 'R', o, 2.0).slice(0, -1);   // a whole bounce: it ends at the top, where the move starts
  const mv = moveFrames(500, path, still, () => 0, o, () => ({}), destination).slice(0, -1);
  const post = dribbleFrames(500 + path.duration * 1000, 0.8, still, 0, path.endHand === 'right' ? 'R' : 'L', o, 2.0);
  return { win: [...pre, ...mv, ...post], A0: 500, path };
}

describe('the negative controls (plan §5.2)', () => {
  it('the IDLE dribble reads no crossing, not between, not behind', () => {
    const win = dribbleFrames(0, 1.5, still, 0, 'R');
    const cr = crossingsH4(win, 'me', 500);
    expect(cr).toEqual([]);
    expect(betweenH4(win, 'me', 500, cr).found).toBe(false);
    expect(behindH4(cr).found).toBe(false);
  });

  it("the DRIVE (6 m/s, the ball pushed ahead on the right) reads neither — and a low bounce in front that the old flag called 'under the legs' is not between the legs", () => {
    const run = (t: number): P => [0, 0, 4 + (6 * t) / 1000];
    const win = dribbleFrames(0, 1.5, run, 0, 'R', { feet: 'stride' }, 2.0, 0, 0.16);
    const m = measureH4(win, 'me', 500, [], 'bball_mc_dribble_run', 900);
    expect(m.nCross).toBe(0); expect(m.between.found).toBe(false); expect(m.behind.found).toBe(false);
    // the old read's false positive, reproduced: a low bounce 0.15 m out and 0.2 m ahead is "below the knees within 0.22 × 0.3 m"
    const low = dribbleFrames(0, 1.5, run, 0, 'R', { feet: 'stride' }, 2.0, -0.11, 0.04);
    expect(flagsV1(low, 'me', 500).underLegs).toBe(true);
    const m2 = measureH4(low, 'me', 500, [], 'bball_mc_dribble_run', 900);
    expect(m2.between.found).toBe(false); expect(m2.behind.found).toBe(false);
  });

  it('the CROSSOVER crosses once, in front: not between, not behind — low (≤ 0.6 m) and far (≥ 0.3 m), the decode\'s G5', () => {
    for (const feet of ['square', 'stride', 'split'] as const) {
      const { win, A0 } = play('crossover', { feet });
      const m = measureH4(win, 'me', A0, [], 'bball_crossover_left', 1000);
      expect(m.nCross, feet).toBe(1);
      expect(m.crossings[0].from).toBe('R'); expect(m.crossings[0].to).toBe('L');
      expect(m.crossings[0].handBefore).toBe('R'); expect(m.crossings[0].handAfter).toBe('L');
      expect(m.between.found, feet).toBe(false); expect(m.behind.found, feet).toBe(false);
      expect(m.cross.midY!).toBeLessThanOrEqual(0.6); expect(m.cross.farLat!).toBeGreaterThanOrEqual(0.3);
    }
  });

  it("the hand BEFORE a crossing is read before it started (4a review F5): today's carry names the destination from the crossing's first frame", () => {
    // destination = true: the carry's hand (hh) is the END hand from the move's first frame, as beginCross flips it (and 4b's runMove
    // reports its destination) — the last frame on the old side already reads L; the crossing still reads R → L
    for (const destination of [false, true]) {
      const { win, A0 } = play('crossover', {}, destination);
      const c = crossingsH4(win, 'me', A0);
      expect(c.length, `destination ${destination}`).toBe(1);
      expect(c[0].handBefore, `destination ${destination}`).toBe('R'); expect(c[0].handAfter, `destination ${destination}`).toBe('L');
    }
  });

  it('a BETWEEN-THE-LEGS path reads between (in the split stance and a square one), not behind; a crossover in the split stance is not', () => {
    const split = play('between_legs', { feet: 'split' });
    const m = measureH4(split.win, 'me', split.A0, [], 'bball_between_legs_left', 1000);
    expect(m.between.found).toBe(true); expect(m.behind.found).toBe(false); expect(m.nCross).toBe(1);
    const sq = play('between_legs', { feet: 'square' });
    expect(measureH4(sq.win, 'me', sq.A0, [], 'bball_between_legs_left', 1000).between.found).toBe(true);   // the box still holds a square stance's floor point
    const wide = play('crossover', { feet: 'split' });
    expect(measureH4(wide.win, 'me', wide.A0, [], 'bball_crossover_left', 1000).between.found).toBe(false);
  });

  it('a BEHIND-THE-BACK path reads behind, not between', () => {
    for (const mv of ['behind_back', 'momentum_btb'] as const) {
      const { win, A0 } = play(mv);
      const m = measureH4(win, 'me', A0, [], 'bball_behind_back_left', 1000);
      expect(m.behind.found, mv).toBe(true); expect(m.between.found, mv).toBe(false);
      expect(m.behind.zM!).toBeLessThan(-0.10);
    }
  });

  it('the hips drop is read against the pre-move mean (G2: ≥ 0.15 m on a real between-the-legs)', () => {
    const path = need(pathFor('between_legs', 'right'));
    const pre = dribbleFrames(0, 0.5, still, 0, 'R', { feet: 'split' }, 2.0).slice(0, -1);
    const mv: H4Frame[] = []; for (let k = 0; k * DT <= path.duration * 1000; k++) { const t = 500 + k * DT, a = pathAt(path, (k * DT) / 1000); const u = Math.sin(Math.PI * Math.min(1, k * DT / 1000 / path.duration)); mv.push(frame(t, body(still(), 0, { feet: 'split', hipsY: 0.95 - 0.2 * u }), worldOf(still(), 0, a.ball), a.contact === 'left' ? 'L' : 'R')); }
    const cr = crossingsH4([...pre, ...mv], 'me', 500);
    expect(betweenH4([...pre, ...mv], 'me', 500, cr).hipsDropM!).toBeCloseTo(0.2, 2);
  });
});

describe('the rest of h4, on the same bodies', () => {
  it('the in-and-out keeps the hand: 0 crossings, ≥ 0.2 m toward the midline and back, the off hand away (G8)', () => {
    const { win, A0 } = play('in_and_out');
    const m = measureH4(win, 'me', A0, [], 'bball_in_and_out_right', 1000);
    expect(m.nCross).toBe(0);
    expect(m.inout.excursionM!).toBeGreaterThanOrEqual(0.2);
    expect(m.inout.outBackMs!).toBeLessThanOrEqual(300);
    expect(m.inout.returned).toBe(true);
    expect(m.nameOk.ok).toBe(true);
  });

  it('the spin: the turn over SPIN_SEC, the hand change, no feint before it (G6), from the mode\'s spinning flag', () => {
    const path = need(pathFor('spin', 'right'));
    const sweep = 1.5 * Math.PI, yawAt = (t: number) => { const u = Math.min(1, Math.max(0, (t - 500) / 600)); return sweep * u * u * (3 - 2 * u); };
    const pre = dribbleFrames(0, 0.5, still, 0, 'R', {}, 2.0).slice(0, -1).map((f) => ({ ...f, s: { ...f.s, sp: 0 } }));
    const mv = moveFrames(500, path, still, yawAt, {}, () => ({ sp: 1 })).slice(0, -1);
    const post = dribbleFrames(1100, 0.8, still, sweep, 'L', {}, 2.0).map((f) => ({ ...f, s: { ...f.s, sp: 0 } }));
    const win = [...pre, ...mv, ...post];
    const s = spinH4(win, 'me', 480, [])!;
    expect(s.t0Ms).toBe(20);
    expect(s.turnSpinDeg!).toBeCloseTo(270, 0);
    expect(s.handAt0).toBe('R'); expect(s.handAt1000).toBe('L'); expect(s.handChange).toBe(true);
    expect(s.preFeint).toBe(0); expect(s.ballHipsP90M!).toBeLessThanOrEqual(0.3);   // held through the pull's hold, by the hips
  });

  it('the hesi: Spine2 rises, the root holds ≤ 0.5 m/s, then ≥ 3 m/s — read off the root and the drawn chest (G7)', () => {
    const v = (t: number) => (t < 500 ? 3.8 : t < 700 ? 0.3 : 4.2);
    const out: H4Frame[] = []; let z = 0;
    for (let k = 0; k * DT <= 1500; k++) { const t = k * DT; z += (v(t) * DT) / 1000; const up = t >= 500 && t < 760 ? 0.05 : 0; out.push(frame(t, body([0, 0, z], 0, { spine2Y: 1.25 + up }), worldOf([0, 0, z], 0, { x: 0.26, y: 0.9, z: 0.16 }), 'R')); }
    const h = hesiH4(out, 'me', 480);
    expect(h.spine2RiseM!).toBeCloseTo(0.05, 3);
    expect(h.stillMs).toBeGreaterThanOrEqual(150);
    expect(h.explodeMs!).toBeLessThanOrEqual(300);
  });

  /** The drawn shoulders at `deg(t)` about the root, still, 0–1000 ms. */
  const shoulders = (deg: (t: number) => number, extra: (t: number) => Record<string, unknown> = () => ({})): H4Frame[] => {
    const out: H4Frame[] = [];
    for (let k = 0; k * DT <= 1000; k++) { const t = k * DT; out.push({ ...frame(t, body(still(), 0, { shoulderDeg: deg(t) }), worldOf(still(), 0, { x: 0.26, y: 0.9, z: 0.16 }), 'R'), s: { po: 'mine', ca: 'R', hh: { me: 'R' }, ...extra(t) } }); }
    return out;
  };
  it('the shimmy: the drawn shoulders ±15° about the root at 2.5 Hz for 0.6 s (G13) — the rate off a full cycle (≥ 3 swings)', () => {
    const s = shimmyH4(shoulders((t) => (t >= 300 && t <= 900 ? 15 * Math.sin(2 * Math.PI * 2.5 * (t - 300) / 1000) : 0)), 'me', 0, 1000);
    expect(s.extremes).toBe(3);
    expect(s.ampDeg!).toBeCloseTo(15, 0);
    expect(s.hz!).toBeCloseTo(2.5, 0);
    expect(s.spanMs!).toBeGreaterThanOrEqual(300);
    // half a cycle (two swings) reports its amplitude but no rate
    const half = shimmyH4(shoulders((t) => (t >= 300 && t <= 500 ? 15 * Math.sin(2 * Math.PI * 2.5 * (t - 300) / 1000) : 0)), 'me', 0, 1000);
    expect(half.hz).toBeNull();
  });

  it('NOT a shimmy (4a review F3, the negative control): one lean, then a large one-way turn — the hook\'s own turn after its R2 lean', () => {
    // p4/base's hook shimmy, as read: a lean +0.3 → +14.7° over the 0.23 s beat, then the hook turns the shoulders to −23° and back to +7°
    const deg = (t: number) => (t < 230 ? 14.7 * (t / 230) : t < 530 ? 14.7 - 37.7 * ((t - 230) / 300) : -23 + 30 * Math.min(1, (t - 530) / 300));
    // with the hook's finish line bounding the beat: the lean alone, no swing
    const bounded = shimmyH4(shoulders(deg), 'me', 0, 1000, [{ t: 233, msg: '[1V1-MOVE] finish hook right release 0.31 s hop 0.66 s' }]);
    expect(bounded.endMs).toBe(233);
    expect(bounded.hz).toBeNull(); expect(bounded.extremes).toBeLessThan(3);
    // the shot flag bounds it too (the fadeaway's finish flag rising)
    expect(shimmyH4(shoulders(deg, (t) => ({ fi: t >= 240 ? 1 : 0 })), 'me', 0, 1000).endMs).toBe(Math.round(Math.ceil(240 / DT) * DT));
    // and unbounded — the whole window — two extremes are not a cycle: no rate, and the name check fails
    const whole = shimmyH4(shoulders(deg), 'me', 0, 1000);
    expect(whole.hz).toBeNull();
    const m = measureH4(shoulders(deg), 'me', 0, [{ t: 0, msg: '[1V1-STICK] post hook right (shimmy)' }], 'mark: [HM-INPUT] hook R2', 1000);
    expect(m.nameOk.move).toBe('shimmy'); expect(m.nameOk.ok).toBe(false);
  });

  it('the path: hips-relative and world less the root; a moving window gates on rel (Q10)', () => {
    const run = (t: number): P => [0, 0, 4 + (5 * t) / 1000];
    const path = need(pathFor('crossover', 'right'));
    const win = moveFrames(0, path, run, () => 0);
    const p = pathH4(win, 'me', 0);
    expect(p.moving).toBe(true); expect(p.gateM).toBe(p.relMaxM);
    expect(p.relMaxM!).toBeLessThanOrEqual(0.15);
    expect(p.worldNetMaxM!).toBeLessThanOrEqual(p.relMaxM! + 1e-3);
    const stand = pathH4(moveFrames(0, path, still, () => 0), 'me', 0);
    expect(stand.moving).toBe(false); expect(stand.gateM).toBe(stand.worldMaxM);
  });

  it("the latency from the probe's input mark: to the first new clip, the ball leaving its spot, the mode's own line", () => {
    const win = dribbleFrames(0, 1, still, 0, 'R', {}, 2.0);
    win.forEach((f) => { if (f.t >= 533) f.B.me.c = [['bball_mc_dribble_jog', 0.8], ['bball_crossover_left', 0.2]]; });
    const marks: H4Mark[] = [{ t: 500, msg: '[HM-INPUT] lcross rim 0.70' }, { t: 517, msg: '[1V1-HANDLE] move crossover left → bball_crossover_left rate 1.00' }];
    const l = latencyH4(win, 'me', 500, marks);
    expect(l.clipMs).toBe(33); expect(l.clip).toBe('bball_crossover_left'); expect(l.gameMs).toBe(17);
    expect(playedMove(marks, 500, 'mark: [HM-INPUT] lcross')).toBe('crossover');
  });

  it('names what the body did (G11): a crossover clip whose ball never crossed is NOT a crossover', () => {
    const ok = play('crossover'); expect(measureH4(ok.win, 'me', ok.A0, [], 'bball_crossover_left', 1000).nameOk).toMatchObject({ ok: true, expect: 'crossed, in front' });
    const idle = dribbleFrames(0, 1.5, still, 0, 'R');
    expect(measureH4(idle, 'me', 500, [], 'bball_crossover_left', 1000).nameOk).toMatchObject({ ok: false, expect: 'crossed, in front' });
    const b = play('behind_back'); expect(measureH4(b.win, 'me', b.A0, [], 'bball_behind_back_left', 1000).nameOk.ok).toBe(true);
    const bl = play('between_legs', { feet: 'split' }); expect(measureH4(bl.win, 'me', bl.A0, [], 'bball_between_legs_left', 1000).nameOk.ok).toBe(true);
    const d = play('double_cross'); expect(measureH4(d.win, 'me', d.A0, [], 'bball_double_cross_left', 1000).nameOk).toMatchObject({ ok: true, expect: 'crossed twice' });
  });

  it('G11 reads the CLIP (4a review F2): the move clip crossing 0.5 after the anchor must be the move\'s family, whatever the body did', () => {
    // a jab line with the hesi clip (p4/base: every jab window played bball_mc_hesi) is a fail even with the foot out
    const win = dribbleFrames(0, 1.2, still, 0, 'R', {}, 2.0);
    win.forEach((f) => { if (f.t >= 520) f.B.me.c = [['bball_mc_dribble_idle', 0.3], ['bball_mc_hesi', 0.7]]; });
    const jab = measureH4(win, 'me', 500, [{ t: 500, msg: '[HM-INPUT] jab tap' }, { t: 517, msg: '[1V1-THREAT] jab #1 odds 0.40 bought true' }], 'mark: [HM-INPUT] jab tap', 900);
    expect(jab.nameOk).toMatchObject({ move: 'jab', clip: 'bball_mc_hesi', clipOk: false, ok: false });
    expect(jab.nameOk.line).toMatch(/THREAT\] jab/);
    // the crossover's own clip passes the clip half; the loops never count as the move clip
    const ok = play('crossover'); ok.win.forEach((f) => { if (f.t >= 520 && f.t < 900) f.B.me.c = [['bball_mc_dribble_walk', 0.2], ['bball_mc_crossover_left', 0.8]]; });
    const n = measureH4(ok.win, 'me', ok.A0, [], 'bball_mc_crossover_left', 1000).nameOk;
    expect(n).toMatchObject({ clip: 'bball_mc_crossover_left', clipOk: true, ok: true });
    // a size-up is named by its own clip (the cycle's yoyo is not judged as a yoyo move)
    const su = dribbleFrames(0, 1.2, still, 0, 'R', {}, 2.0); su.forEach((f) => { if (f.t >= 520) f.B.me.c = [['bball_yoyo', 1]]; });
    expect(measureH4(su, 'me', 500, [{ t: 505, msg: '[1V1-HANDLE] size-up bball_yoyo (handle 100)' }], 'mark: [HM-INPUT] flick upright', 900).nameOk).toMatchObject({ move: 'size_up:bball_yoyo', clipOk: true, ok: true });
  });

  it('4b review F2: a clip queued by an EARLIER input (it plays when its ball starts, after this input) is not this move\'s clip; an unasked one still is', () => {
    // the Shammgod's take: a between asked 150 ms before the Shammgod's input plays its clip at the running crossover's catch, after it
    expect(windowMoveClip('shammgod', ['bball_between_legs_right', 'bball_shammgod_left'], ['between_legs'])).toBe('bball_shammgod_left');
    // …but a clip nobody asked for before the anchor counts against the move (the rotation's entry flick 17 ms after a sweep)
    expect(windowMoveClip('spin', ['bball_in_and_out_right', 'bball_spin'], [])).toBe('bball_in_and_out_right');
    expect(windowMoveClip('crossover', [], ['between_legs'])).toBe('');
  });

  it("a SWEEP's window is named by its spin / roll line, not the rotation's entry flick 17 ms after the input (4a review F2)", () => {
    const marks: H4Mark[] = [{ t: 500, msg: '[HM-INPUT] sweep slow 45ms' }, { t: 517, msg: '[1V1-HANDLE] move in_and_out right → bball_in_and_out_right rate 1.00' }, { t: 880, msg: '[1V1-MOVE] spin right' }];
    expect(playedMove(marks, 500, 'mark: [HM-INPUT] sweep slow 45ms')).toBe('spin');
    expect(playedMove(marks.slice(0, 2), 500, 'mark: [HM-INPUT] sweep slow 45ms')).toBe('in_and_out');   // no spin came: the flick is what it did
    expect(playedMove([{ t: 500, msg: '[HM-INPUT] flick up' }, ...marks.slice(1)], 500, 'mark: [HM-INPUT] flick up')).toBe('in_and_out');   // not a sweep: the first line
  });

  it('counts left-hand dribble frames raw and those the carry had on its left hand (G14); an L → R change with no move line is unasked', () => {
    // the carry's hand as today's carry reports it — the destination from the crossing's start: every left frame is deliberate
    const { win, A0 } = play('crossover', {}, true);
    const m = measureH4(win, 'me', A0, [], 'bball_crossover_left', 1000);
    expect(m.leftDribble.raw).toBeGreaterThan(0);
    expect(m.leftDribble.excluded).toBe(0); expect(m.leftDribble.deliberate).toBe(m.leftDribble.raw);
    // back to the right with a crossover the probe saw no move line for: one unasked return
    const back = [...win, ...moveFrames(win[win.length - 1].t + DT, mirrorPath(need(pathFor('crossover', 'right'))), still, () => 0, {}, () => ({}), true)];
    expect(leftDribbleH4(back, 'me', []).returnsUnasked).toBe(1);
    expect(leftDribbleH4(back, 'me', [{ t: win[win.length - 1].t, msg: '[1V1-HANDLE] move crossover right' }]).returnsUnasked).toBe(0);
  });

  it("the bounce rate after a crossing (U20): the next bounces' rate against the stride's, read past the window's end", () => {
    // the crossing, then the dribble on the new hand at 2 Hz on a 0.5 s same-foot stride (feet touching down in turn)
    const path = need(pathFor('crossover', 'right'));
    const pre = dribbleFrames(0, 0.5, still, 0, 'R', {}, 2.0).slice(0, -1);
    const mv = moveFrames(500, path, still, () => 0).slice(0, -1);
    const post = dribbleFrames(500 + path.duration * 1000, 1.6, still, 0, 'L', {}, 2.0);
    const all = [...pre, ...mv, ...post].map((f) => { const b = f.B.me; const up = (ph: number) => (Math.sin(2 * Math.PI * (f.t / 500 + ph)) > 0.5 ? 0.25 : 0.08);
      b.j[J.LeftFoot]![1] = up(0); b.j[J.RightFoot]![1] = up(0.5); return f; });
    const A0 = 500, win = all.filter((f) => f.t >= A0 - 400 && f.t <= A0 + 1000);
    const m = measureH4(win, 'me', A0, [], 'bball_crossover_left', 1000, all);
    expect(measureH4(win, 'me', A0, [], 'bball_crossover_left', 1000).bounceRate[0].rates.length).toBeLessThan(2);   // the window alone: too few tops
    expect(m.bounceRate.length).toBe(1);
    expect(m.bounceRate[0].rates.length).toBe(2);
    for (const r of m.bounceRate[0].rates) expect(r).toBeCloseTo(2, 1);
    expect(m.bounceRate[0].strideHz!).toBeCloseTo(2, 1);
    expect(m.bounceRate[0].ratios.every((x) => Math.abs(x - 1) <= 0.15)).toBe(true);
  });

  it('reads J as the recorder\'s joint order', () => { expect(JN[J.RightHand]).toBe('RightHand'); expect(JN.length).toBe(22); });
});
