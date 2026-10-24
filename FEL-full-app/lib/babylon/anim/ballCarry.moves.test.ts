// HOOPS MOTION phase 4b (plan §3.3, §6) — THE CARRY PLAYS A MOVE'S BALL. runMove / queueMove / cancelMove on the hoops carry: a handle
// move's path (anim/handlePaths) started on the frame it is asked, from the ball as drawn, on the node rig of ballCarry.hoops.test (two
// arms, two legs, mirrored the way the runtime hoops rigs are: the rig's LEFT arm on the root's +x, the athlete's right). The palm on
// the contact frames with the motion layers mounted is read on the forge hero (ballCarry.movesRig.test.ts — the hinge needs a real rig).
import { describe, expect, it } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import { mountBallCarry, movePushK, MOVE_PUSH_EASE, STRIDE_PHI_AT_STRIKE, LOCK_MIN_GAP_K, SNAP_TURN_RAD, type BallCarry, type CarryMoveEvent } from './ballCarry';
import { requestMove, type HandleHost } from './handleMotion';
import { attachBallToHand } from './ballRig';
import { pathFor, pathAt, PAUSIN_MAX_SEC } from './handlePaths';
import { HOOPS_DRIBBLE } from './Dribble';

function rig(scene: Scene) {
  const root = new TransformNode('root', scene);
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);   // facing the rim (−z)
  const sk = new Skeleton('sk', 'sk', scene);
  const nodes: Record<string, TransformNode> = {};
  const add = (name: string, parent: TransformNode, pos: [number, number, number], q = Quaternion.Identity()) => {
    const n = new TransformNode(name, scene); n.parent = parent; n.position.set(...pos); n.rotationQuaternion = q; nodes[name] = n; return n;
  };
  const hips = add('Hips', root, [0, 0.95, 0]);
  const spine = add('Spine2', hips, [0, 0.4, 0]);
  for (const [sd, x] of [['Left', 0.18], ['Right', -0.18]] as const) {
    const sh = add(`${sd}Arm`, spine, [x, 0.1, 0], Quaternion.RotationAxis(new Vector3(0, 0, 1), x > 0 ? 0.2 : -0.2));
    const el = add(`${sd}ForeArm`, sh, [0.02 * Math.sign(x), -0.28, 0], Quaternion.RotationAxis(Vector3.Right(), 0.4));
    add(`${sd}Hand`, el, [0, -0.26, 0]);
    const up = add(`${sd}UpLeg`, hips, [x * 0.55, -0.05, 0]);
    const kn = add(`${sd}Leg`, up, [0, -0.42, 0]);
    add(`${sd}Foot`, kn, [0, -0.4, 0]);
  }
  let parentBone: Record<string, Bone | null> = {};
  for (const n of Object.values(nodes)) {
    const pb = parentBone[(n.parent as TransformNode).name] ?? null;
    const b = new Bone(n.name, sk, pb, Matrix.Identity()); b.linkTransformNode(n); parentBone = { ...parentBone, [n.name]: b };
  }
  for (const n of [root, ...Object.values(nodes)]) n.computeWorldMatrix(true);
  const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
  (ball.metadata ??= {}).felPalmMirrorLeft = true;
  return { root, sk, ball, nodes };
}
/** A point in the root's frame (x = the athlete's right, z forward, y up from the root). */
const local = (root: TransformNode, p: Vector3): Vector3 => {
  root.computeWorldMatrix(true);
  return p.subtract(root.getAbsolutePosition()).applyRotationQuaternion(Quaternion.Inverse(root.rotationQuaternion!));
};
/** A frame as the modes run it: the mode's update, the after-animations pass, the camera's before-render and the after-render. */
function driver(scene: Scene, carry: BallCarry, ball: AbstractMesh) {
  const steps: number[] = []; let last: Vector3 | null = null;
  const frame = (dt: number, speed: number, active: boolean, before?: () => void) => {
    before?.();
    carry.update(dt, speed, active);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
    scene.onBeforeCameraRenderObservable.notifyObservers(scene.activeCamera as never);
    scene.onAfterRenderObservable.notifyObservers(scene);
    ball.computeWorldMatrix(true);
    const p = ball.getAbsolutePosition().clone();
    if (last) steps.push(Vector3.Distance(p, last));
    last = p;
    return p;
  };
  return { frame, steps, reset: () => { steps.length = 0; last = null; } };
}
function setup() {
  const scene = new Scene(new NullEngine());
  const r = rig(scene);
  attachBallToHand(r.ball, r.sk, 'LeftHand');
  const carry = mountBallCarry({ scene, ball: r.ball, root: r.root, skeleton: r.sk, hoops: true });
  const d = driver(scene, carry, r.ball);
  return { scene, r, carry, d };
}
/** Dribble (0.3 of full speed, standing) until the carry's phase is `ph` (± a frame) after a full bounce. */
function dribbleTo(s: ReturnType<typeof setup>, ph: number): void {
  let n = 0, wraps = 0, last = s.carry.phase;
  while (n++ < 600) { s.d.frame(1 / 60, 0.3, true); if (s.carry.phase < last) wraps++; last = s.carry.phase; if (wraps >= 1 && Math.abs(s.carry.phase - ph) < 0.03) return; }
  throw new Error(`never reached phase ${ph}`);
}

describe('runMove: the ball on the move\'s path, from the ball as drawn', () => {
  it('a crossover from the stroke\'s top ends in the other hand, and the dribble goes on there', () => {
    const s = setup();
    dribbleTo(s, 0.0);
    s.d.reset();
    expect(s.carry.runMove('crossover')).toBe(true);
    expect(s.carry.move?.startHand).toBe('right'); expect(s.carry.move?.endHand).toBe('left');
    const xs: number[] = [];
    for (let i = 0; i < 80; i++) xs.push(local(s.r.root, s.d.frame(1 / 60, 0.3, true)).x);
    expect(s.carry.move).toBeNull();
    expect(s.carry.side).toBe('Right'); expect(s.carry.hand).toBe('Left');   // the rig's RightHand is drawn on the athlete's left
    expect(Math.max(...s.d.steps)).toBeLessThanOrEqual(0.15);
    expect(xs[xs.length - 1]).toBeLessThan(-0.15);                           // dribbling on his left
    expect(Math.min(...xs.slice(0, 40))).toBeLessThan(-0.15);                // it crossed inside the path
    s.carry.dispose();
  });

  it('asked mid-bounce, it STARTS AT ONCE (U2): the ball leaves the dribble\'s own path on the next frame — every tenth of the bounce, inside 0.15 m a frame', () => {
    for (let ph = 0.05; ph < 0.99; ph += 0.1) {
      const a = setup(), b = setup();
      dribbleTo(a, ph); dribbleTo(b, ph);
      a.d.reset(); b.d.reset();
      expect(a.carry.runMove('crossover'), `phase ${ph.toFixed(2)}`).toBe(true);
      const pa = a.d.frame(1 / 60, 0.3, true), pb = b.d.frame(1 / 60, 0.3, true);   // the same frame with and without the move
      const sep = local(a.r.root, pa).subtract(local(b.r.root, pb));
      expect(sep.length(), `phase ${ph.toFixed(2)}: the move changed nothing on its first frame`).toBeGreaterThan(1e-4);
      for (let i = 0; i < 60; i++) a.d.frame(1 / 60, 0.3, true);
      expect(Math.max(...a.d.steps), `phase ${ph.toFixed(2)}`).toBeLessThanOrEqual(0.15);
      expect(a.carry.hand, `phase ${ph.toFixed(2)}`).toBe('Left');
      a.carry.dispose(); b.carry.dispose();
    }
  });

  it('asked AFTER this frame\'s update (the modes read their sticks after ticking the carry), the move\'s first drawn frame is a frame into it: the ball never stands still for a frame (a false top)', () => {
    for (let ph = 0.05; ph < 0.99; ph += 0.1) {
      const s = setup(); dribbleTo(s, ph);
      const before = s.r.ball.getAbsolutePosition().clone();
      s.carry.update(1 / 60, 0.3, true);          // the mode ticks the carry …
      expect(s.carry.runMove('crossover')).toBe(true);   // … then its stick loop asks for the move, in the same frame
      s.scene.onAfterAnimationsObservable.notifyObservers(s.scene);
      s.scene.onBeforeCameraRenderObservable.notifyObservers(s.scene.activeCamera as never);
      s.r.ball.computeWorldMatrix(true);
      const step = Vector3.Distance(s.r.ball.getAbsolutePosition(), before);
      expect(step, `phase ${ph.toFixed(2)}`).toBeGreaterThan(1e-3); expect(step).toBeLessThanOrEqual(0.15);
      s.carry.dispose();
    }
  });

  it('queueMove holds one move for the running one\'s catch: a crossover queued behind a crossover crosses back — two crossings, the start hand at the end', () => {
    const s = setup();
    dribbleTo(s, 0.0);
    s.d.reset();
    expect(s.carry.runMove('crossover')).toBe(true);
    expect(s.carry.queueMove('crossover')).toBe(true);
    expect(s.carry.hand).toBe('Right');   // the destination after both
    let side = 0, crossings = 0;
    for (let i = 0; i < 120; i++) {
      const x = local(s.r.root, s.d.frame(1 / 60, 0.3, true)).x;
      const sd = x > 0.05 ? 1 : x < -0.05 ? -1 : 0;
      if (sd !== 0) { if (side !== 0 && sd !== side) crossings++; side = sd; }
    }
    expect(crossings).toBe(2);
    expect(s.carry.move).toBeNull(); expect(s.carry.side).toBe('Left');
    expect(Math.max(...s.d.steps)).toBeLessThanOrEqual(0.15);
    s.carry.dispose();
  });

  it('switchHand asked while a move runs queues its crossover (the double cross); toSide to the destination is a no-op', () => {
    const s = setup();
    dribbleTo(s, 0.2);
    s.carry.switchHand(); expect(s.carry.move?.name).toBe('crossover');
    s.carry.toSide('left'); expect(s.carry.handAfterMove).toBe('Left');   // already on its way there
    s.carry.switchHand(); expect(s.carry.hand).toBe('Right');    // queued: back across at the catch
    for (let i = 0; i < 120; i++) s.d.frame(1 / 60, 0.3, true);
    expect(s.carry.side).toBe('Left'); expect(s.carry.move).toBeNull();
    s.carry.dispose();
  });

  it('cancelMove mid-move: back into the dribble from where the ball is, no jump; reset mid-move: the possession starts in the right hand', () => {
    const s = setup();
    dribbleTo(s, 0.1);
    s.d.reset();
    s.carry.runMove('crossover');
    for (let i = 0; i < 8; i++) s.d.frame(1 / 60, 0.3, true);
    s.carry.cancelMove();
    expect(s.carry.move).toBeNull();
    for (let i = 0; i < 60; i++) s.d.frame(1 / 60, 0.3, true);
    expect(Math.max(...s.d.steps)).toBeLessThanOrEqual(0.15);
    s.carry.runMove('crossover');
    for (let i = 0; i < 8; i++) s.d.frame(1 / 60, 0.3, true);
    s.d.frame(1 / 60, 0, false);
    s.carry.reset();
    expect(s.carry.move).toBeNull(); expect(s.carry.hand).toBe('Right'); expect(s.carry.side).toBe('Left');
    s.carry.dispose();
  });

  it('from a HELD ball (the carry parked, the ball in the palm) a hold-first path — the spin\'s pull — returns true, takes the ball from the palm without a jump', () => {
    const s = setup();
    dribbleTo(s, 0.3);
    s.d.frame(1 / 60, 0, false);   // parked: the ball gathered into the palm
    for (let i = 0; i < 20; i++) s.d.frame(1 / 60, 0, false);
    expect(s.carry.active).toBe(false); expect(s.r.ball.parent?.name).toBe('LeftHand');
    s.d.reset(); s.d.frame(1 / 60, 0, false);
    expect(s.carry.runMove('spin')).toBe(true);
    expect(s.carry.active).toBe(true); expect(s.r.ball.parent).toBeNull();
    for (let i = 0; i < 50; i++) s.d.frame(1 / 60, 0.3, true);
    expect(Math.max(...s.d.steps)).toBeLessThanOrEqual(0.15);
    expect(s.carry.hand).toBe('Left');   // the pull's hand change
    s.carry.dispose();
  });

  it('a body without the ball cannot run a move (false), and a move with no path of its own is refused (the step-back, off the head)', () => {
    const s = setup();
    s.r.ball.setParent(null);   // the ball is someone else's / loose
    expect(s.carry.runMove('crossover')).toBe(false);
    const t = setup(); dribbleTo(t, 0.2);
    expect(t.carry.runMove('stepback' as never)).toBe(false);
    expect(t.carry.move).toBeNull();
    s.carry.dispose(); t.carry.dispose();
  });

  it('the events fire in order: start, the release, the floor, the catch, the end', () => {
    const s = setup();
    dribbleTo(s, 0.0);
    const ev: CarryMoveEvent[] = [];
    s.carry.runMove('crossover', { onEvent: (e) => ev.push(e) });
    for (let i = 0; i < 60; i++) s.d.frame(1 / 60, 0.3, true);
    expect(ev).toEqual(['start', 'release', 'floor', 'catch', 'end']);
    const c: CarryMoveEvent[] = [];
    s.carry.runMove('crossover', { onEvent: (e) => c.push(e) }); s.d.frame(1 / 60, 0.3, true); s.carry.cancelMove();
    expect(c).toEqual(['start', 'cancel']);
    s.carry.dispose();
  });
});

describe('4b review: the facing snap and the queue', () => {
  /** A mode's frame with a FACING SNAP: the mode's update turns the root by `turnDeg` in one frame (face()), ticks the carry, asks for the
   *  move (the modes read their sticks after the carry), then the scene draws. Returns the ball's lateral in the root frame, each frame. */
  function snapThen(s: ReturnType<typeof setup>, turnDeg: number, ask: () => void, frames: number): number[] {
    const yaw0 = Math.PI, q = (y: number) => Quaternion.RotationAxis(Vector3.Up(), y);
    s.r.root.rotationQuaternion = q(yaw0 + (turnDeg * Math.PI) / 180);
    s.carry.update(1 / 60, 0.3, true);
    ask();
    for (const o of [s.scene.onAfterAnimationsObservable, s.scene.onBeforeCameraRenderObservable, s.scene.onAfterRenderObservable]) (o as { notifyObservers: (x: unknown) => void }).notifyObservers(s.scene);
    const xs = [local(s.r.root, s.r.ball.getAbsolutePosition()).x];
    for (let i = 1; i < frames; i++) xs.push(local(s.r.root, s.d.frame(1 / 60, 0.3, true)).x);
    return xs;
  }
  it('F1: a facing SNAP (the left-stick reversal writes −128° in one frame) takes a move\'s ball WITH the body — an in-and-out on that frame stays on the right of the body; a crossover crosses once, from the right', () => {
    for (const ph of [0.0, 0.3, 0.6]) {
      const a = setup(); dribbleTo(a, ph);
      const xs = snapThen(a, -128, () => { a.carry.runMove('in_and_out'); }, 24);
      expect(Math.min(...xs), `in-and-out, phase ${ph}`).toBeGreaterThan(0.02);   // (4b: −0.33 m of the body on the turn frame, for ~0.2 s)
      a.carry.dispose();
      const b = setup(); dribbleTo(b, ph);
      const cx = snapThen(b, -128, () => { b.carry.runMove('crossover'); }, 40);
      expect(cx[0], `crossover, phase ${ph}`).toBeGreaterThan(0.05);   // starts on the right of the body…
      let side = 1, n = 0; for (const x of cx) { const sd = x > 0.05 ? 1 : x < -0.05 ? -1 : 0; if (sd && sd !== side) { n++; side = sd; } }
      expect(n).toBe(1); expect(side).toBe(-1);                        // …and crosses once, to the left
      b.carry.dispose();
    }
    expect(SNAP_TURN_RAD).toBeCloseTo(Math.PI / 2, 9);
  });
  it('F1: a TURN (under a quarter turn a frame — the spin, a cut\'s slew) is not a snap: the move\'s ball keeps its own pace (BALL_YAW_RATE), no step over 0.15 m', () => {
    const s = setup(); dribbleTo(s, 0.0); s.d.reset();
    s.carry.runMove('crossover');
    let yaw = Math.PI;
    for (let i = 0; i < 20; i++) { yaw -= (40 * Math.PI) / 180; s.r.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw); s.d.frame(1 / 60, 0.3, true); }
    // 40° a frame is 42 rad/s — the ball at 7 rad/s lags it, but never jumps with it
    expect(Math.max(...s.d.steps)).toBeLessThanOrEqual(0.15);
    s.carry.dispose();
  });
  it('F2: three crossover requests 6 frames apart through the renderer on the real carry — the clips that play name the hand the ball really ends in; the replaced request plays nothing', () => {
    const s = setup(); dribbleTo(s, 0.0);
    const clips: string[] = [];
    const host: HandleHost = { carry: s.carry, beat: (clip) => clips.push(clip) };
    const ask = () => requestMove(host, { move: 'crossover', decide: { kind: 'none' } });
    const r1 = ask();
    for (let i = 0; i < 6; i++) s.d.frame(1 / 60, 0.3, true);
    const r2 = ask();
    for (let i = 0; i < 6; i++) s.d.frame(1 / 60, 0.3, true);
    const r3 = ask();
    expect([r1.ball, r2.ball, r3.ball]).toEqual(['started', 'queued', 'queued']);
    expect([r1.clipAt, r2.clipAt, r3.clipAt]).toEqual(['now', 'start', 'start']);
    expect(clips).toEqual(['bball_crossover_left']);   // the queued clips wait for their path
    for (let i = 0; i < 90; i++) s.d.frame(1 / 60, 0.3, true);
    expect(s.carry.move).toBeNull();
    // the ball: R → L (the first), then the THIRD from L → R (it replaced the second); the clips: left, then the third's right
    expect(clips).toEqual(['bball_crossover_left', 'bball_crossover_right']);
    expect(r3.startHand).toBe('left'); expect(r3.endHand).toBe('right');
    expect(s.carry.hand).toBe('Right');
    expect(local(s.r.root, s.r.ball.getAbsolutePosition()).x).toBeGreaterThan(0.1);
    s.carry.dispose();
  });
});

describe('the push-ahead through a move', () => {
  it('eases out and back in (1 at both ends, 0 through the middle, continuous): the path places the ball itself — a sprint\'s push-ahead moved the behind-the-back\'s wrap in front of the hips', () => {
    expect(movePushK(0)).toBe(1); expect(movePushK(1)).toBe(1);
    for (let k = MOVE_PUSH_EASE; k <= 1 - MOVE_PUSH_EASE + 1e-9; k += 0.05) expect(movePushK(k)).toBeCloseTo(0, 9);
    let prev = movePushK(0); for (let k = 0.001; k <= 1; k += 0.001) { const v = movePushK(k); expect(Math.abs(v - prev)).toBeLessThan(0.02); prev = v; }
  });
  it('…so a behind-the-back at a sprint crosses behind the hip line (z < −0.10 in the root frame, the push-ahead full before it)', () => {
    const s = setup();
    let n = 0; while (n++ < 400 && !(n > 120 && s.carry.phase < 0.03)) s.d.frame(1 / 60, 1, true, () => { s.r.root.position.z -= 6 / 60; });
    s.carry.runMove('behind_back');
    let crossZ: number | null = null, prevX = local(s.r.root, s.r.ball.getAbsolutePosition()).x;
    for (let i = 0; i < 50 && s.carry.move; i++) {
      const l = local(s.r.root, s.d.frame(1 / 60, 1, true, () => { s.r.root.position.z -= 6 / 60; }));
      if (crossZ === null && Math.sign(l.x) !== Math.sign(prevX)) crossZ = l.z;   // (the root's own frame: its forward is its +z)
      prevX = l.x;
    }
    expect(crossZ).not.toBeNull(); expect(crossZ!).toBeLessThan(-0.10);
    s.carry.dispose();
  });
});

describe('the modes\' wiring (U19)', () => {
  it('the spin\'s pull with the mode\'s real call order: startSpin runs the pull (no park), the spin branch ticks the carry while it runs, parks it once caught — the hand changes, no step over 0.15 m', () => {
    const s = setup();
    dribbleTo(s, 0.25);
    s.d.reset();
    // startSpin: requestMove(… path: 'spin') — the carry is NOT parked first (phase 3 called update(0, 0, false) + a gather here)
    expect(s.carry.runMove('spin')).toBe(true);
    let yaw = Math.PI, frames = 0;
    // the spin branch: `if (meCarry?.move) meCarry.update(dt, s, …true) else if (spin && meCarry?.active) meCarry.update(0, 0, false)` —
    // the root turning through the planted sweep as it does
    for (let i = 0; i < 70; i++) {
      if (i < 36) yaw += (1.5 * Math.PI) / 36;   // the planted sweep, then the step-out
      s.r.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
      if (s.carry.move) { s.d.frame(1 / 60, 0.3, true); frames++; } else if (s.carry.active) s.d.frame(0, 0, false); else s.d.frame(1 / 60, 0, false);
    }
    expect(frames).toBeGreaterThan(30);   // the pull ran through the turn (0.6 s)
    expect(s.carry.hand).toBe('Left');
    expect(s.r.ball.parent?.name).toBe('RightHand');   // parked in the catching hand (rig RightHand: the athlete's left)
    s.carry.dispose();
  });

  it('the pull under TODAY\'s spin (a full eased turn in SPIN_SEC 0.6, 15.7 rad/s at its peak), from every tenth of the bounce: the ball never steps over 0.15 m a frame — it turns with the palm, and a lag from the air closes gently', () => {
    for (let ph = 0.05; ph < 0.99; ph += 0.1) {
      const s = setup();
      dribbleTo(s, ph);
      s.d.reset();
      expect(s.carry.runMove('spin')).toBe(true);
      const yaw0 = Math.PI;
      for (let i = 1; i <= 60 && s.carry.move; i++) {
        const u = Math.min(1, i / 36), yaw = yaw0 + 2 * Math.PI * u * u * (3 - 2 * u);   // a smoothstep 2π over 0.6 s
        s.r.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
        s.d.frame(1 / 60, 0.3, true);
      }
      expect(Math.max(...s.d.steps), `phase ${ph.toFixed(2)}`).toBeLessThanOrEqual(0.15);
      s.carry.dispose();
    }
  });

  it('PAUSIN\'s hold holds with pausedDribble set: the gate `!(pausedDribble && !carry.move)` keeps the carry on while the hold path runs, the ball out to the side', () => {
    const s = setup();
    dribbleTo(s, 0.0);
    const pausedDribble = true;
    expect(s.carry.runMove('pausin')).toBe(true);
    let p = new Vector3();
    for (let i = 0; i < 40; i++) p = s.d.frame(1 / 60, 0.1, !(pausedDribble && !s.carry.move));
    expect(s.carry.active).toBe(true); expect(s.carry.move?.name).toBe('pausin');
    const l = local(s.r.root, p), want = pathAt(pathFor('pausin', 'right', 1, { P: 0.98 })!, 0.5).ball;
    expect(l.x).toBeGreaterThan(HOOPS_DRIBBLE.side + 0.04);   // out beyond the dribble's side (S + 0.08 at the default stance)
    expect(Math.abs(l.z - (want.z))).toBeLessThan(0.02);      // … at F + 0.12
    expect(PAUSIN_MAX_SEC).toBe(0.9);
    // with no move running, the pause parks the ball in the palm as it did (the old gather still covers a pause with no move)
    s.carry.cancelMove(); s.d.frame(1 / 60, 0.1, !(pausedDribble && !s.carry.move));
    expect(s.carry.active).toBe(false);
    s.carry.dispose();
  });
});

describe('the contact schedule on the arms (plan §3.3)', () => {
  it('between contacts the arm is the clip\'s (weight 0): a stub clip pose read back unchanged in the flight; on the ball the carry reaches for it', () => {
    const s = setup();
    const sh = s.r.nodes.LeftArm, el = s.r.nodes.LeftForeArm, rsh = s.r.nodes.RightArm;
    const clipSh = sh.rotationQuaternion!.clone(), clipEl = el.rotationQuaternion!.clone(), clipR = rsh.rotationQuaternion!.clone();
    const clip = () => { sh.rotationQuaternion!.copyFrom(clipSh); el.rotationQuaternion!.copyFrom(clipEl); rsh.rotationQuaternion!.copyFrom(clipR); };
    const off = (a: Quaternion, b: Quaternion) => 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180 / Math.PI;
    let n = 0; while (n++ < 200 && !(n > 60 && s.carry.phase < 0.03)) s.d.frame(1 / 60, 0.3, true, clip);
    s.carry.runMove('crossover');
    let inFlight = 0, onBall = 0;
    for (let i = 0; i < 40; i++) {
      const m0 = s.carry.move; if (!m0) break;
      s.d.frame(1 / 60, 0.3, true, clip);
      const m = s.carry.move; if (!m) break;
      // (the move's state is read after the frame; the pass drew the sample of this t)
      if (m.reach.right === 0 && m.reach.left === 0) {   // no hand on it or fading onto / off it: both arms the clip's own
        inFlight++;
        expect(off(sh.rotationQuaternion!, clipSh)).toBeLessThan(1e-3);   // the push arm (rig Left)
        expect(off(rsh.rotationQuaternion!, clipR)).toBeLessThan(1e-3);   // the catch arm (rig Right)
      }
      if (m.reach.left === 1) { onBall++; expect(off(rsh.rotationQuaternion!, clipR)).toBeGreaterThan(0.5); }   // the catch: the carry's reach
    }
    expect(inFlight).toBeGreaterThan(0); expect(onBall).toBeGreaterThan(0);
    s.carry.dispose();
  });
});

describe('the stride lock after a crossing (U20)', () => {
  it('at 4.6 m/s the next two bounces after a crossover run within ±15 % of the stride, and the half-gap never enters lockPeriod', () => {
    const s = setup();
    const P = 0.62; let t = 0;
    const foot = (name: string, off: number) => { const u = ((t + off) % P) / P; s.r.nodes[name].position.y = -0.4 + (u < 0.5 ? 0.14 * Math.sin(u * 2 * Math.PI) : 0); };
    const step = () => { t += 1 / 60; foot('LeftFoot', 0); foot('RightFoot', P / 2); s.d.frame(1 / 60, 0.8, true, () => { s.r.root.position.z -= 4.6 / 60; }); };
    for (let i = 0; i < 180; i++) step();   // locked on
    s.carry.runMove('crossover');
    const wraps: number[] = []; let last = s.carry.phase, moving = true, frame = 0;
    for (let i = 0; i < 150; i++) {
      step(); frame++;
      if (moving && !s.carry.move) { moving = false; last = s.carry.phase; wraps.push(frame); continue; }   // the dribble starts at its top: phase 0
      if (!moving && s.carry.phase < last) wraps.push(frame);
      last = s.carry.phase;
    }
    expect(wraps.length).toBeGreaterThanOrEqual(3);
    const rates = wraps.slice(1, 3).map((w, i) => 60 / (w - wraps[i]));
    for (const r of rates) expect(Math.abs(r * P - 1), `rate ${r.toFixed(2)} Hz against 1/${P}`).toBeLessThanOrEqual(0.15);
    expect(LOCK_MIN_GAP_K).toBe(0.7); expect(STRIDE_PHI_AT_STRIKE).toBe(0.92);
    s.carry.dispose();
  });
});
