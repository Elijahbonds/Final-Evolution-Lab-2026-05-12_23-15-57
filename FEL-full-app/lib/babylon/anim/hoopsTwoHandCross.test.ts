// HOOPS-TWO-HAND-CROSS (spec §3.4, TH-5..TH-8; TH-1..TH-4 test the hand-off timing, which the PM scoped out with StrongHand). New tests
// only — nothing existing is edited. TH-5: the snatchback's hand flips once, through its path (no switchHand toggle), and a stick
// crossover landing in its window queues behind it instead of flipping on top. TH-6: a move's impulse REDIRECTS the travel (rotate,
// don't add: DribbleController.redirect → cutTo); the fakes stay zero. TH-7: every 3v3 body gets the left-hand loops and its ball hand
// fed. TH-8: the modes' wiring, read off the source (the headless check C runs as-is in scripts/headless-checks.suite.test.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Bone, Matrix, MeshBuilder, NullEngine, Quaternion, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { mountBallCarry, type BallCarry } from './ballCarry';
import { requestMove, type HandleHost } from './handleMotion';
import { attachBallToHand } from './ballRig';
import { pathFor } from './handlePaths';
import { chooseBasketballClip, LEFT_TWIN_STATES, leftTwinOf, type AnimTreeInput } from './basketballTree';
import { DribbleController, redirectFor, REDIRECT_TOP_K } from '../core/BasketballCore';
import { DEFAULT_MOVEMENT } from '../core/CourtMovement';
import { impulseFor, moveImpulse, type HandleMove } from '../core/HandleSystem';

/** The node rig of ballCarry.moves.test (two arms, two legs; the rig's LEFT arm on the root's +x, the athlete's right), facing −z. */
function setup() {
  const scene = new Scene(new NullEngine());
  const root = new TransformNode('root', scene);
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);
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
  attachBallToHand(ball, sk, 'LeftHand');
  const carry = mountBallCarry({ scene, ball, root, skeleton: sk, hoops: true });
  /** One frame as the modes run it: the update, the after-animations pass, the camera's before-render, the after-render. */
  const frame = (dt = 1 / 60) => {
    carry.update(dt, 0.3, true);
    scene.onAfterAnimationsObservable.notifyObservers(scene);
    scene.onBeforeCameraRenderObservable.notifyObservers(scene.activeCamera as never);
    scene.onAfterRenderObservable.notifyObservers(scene);
  };
  for (let i = 0; i < 40; i++) frame();   // into the dribble
  return { carry, frame };
}
/** Run frames until the carry has no move (and none queued), recording the rig hand and the hand state on every frame. */
function runOut(carry: BallCarry, frame: () => void, max = 240) {
  const bones: string[] = [carry.handBone], hands: string[] = [carry.hand];
  for (let n = 0; n < max && carry.move; n++) { frame(); bones.push(carry.handBone); hands.push(carry.hand); }
  return { bones, hands };
}
const flips = (xs: string[]): number => xs.reduce((n, x, i) => n + (i > 0 && x !== xs[i - 1] ? 1 : 0), 0);
const host = (carry: BallCarry, impulses: { forward: number; lateral: number }[] = []): HandleHost => ({ carry, beat: () => {}, impulse: (forward, lateral) => impulses.push({ forward, lateral }) });

describe('TH-5: the snatchback flips once, through its path', () => {
  it('a snatchback has a one-crossing path (its catch by the end hand at 0.25 s) and the carry runs it: the rig hand flips exactly once, ending in the other hand', () => {
    const p = pathFor('snatch_back', 'right');
    expect(p).not.toBeNull();
    expect(p!.endHand).toBe('left');
    const { carry, frame } = setup();
    const start = carry.handBone;
    const imp: { forward: number; lateral: number }[] = [];
    // the 1v1 / 3v3 request as built today (custom decide, no impulse: its body is the step-back hop, not the impulse)
    const r = requestMove(host(carry, imp), { move: 'snatch_back', decide: { kind: 'custom', run: () => {} } });
    expect(r.ball).toBe('started');
    expect(r.endHand).not.toBe(r.startHand);
    const { bones, hands } = runOut(carry, frame);
    expect(flips(bones)).toBe(1);
    expect(flips(hands)).toBeLessThanOrEqual(1);
    expect(carry.handBone).not.toBe(start);
    expect(imp).toEqual([]);
  });
  it('a stick crossover landing in the snatchback\'s window QUEUES behind it: one flip per move (two), back in the start hand — never a double flip on the snatchback', () => {
    const { carry, frame } = setup();
    const start = carry.handBone;
    requestMove(host(carry), { move: 'snatch_back', decide: { kind: 'custom', run: () => {} } });
    const bones: string[] = [carry.handBone];
    for (let i = 0; i < 6; i++) { frame(); bones.push(carry.handBone); }
    const r = requestMove(host(carry), { move: 'crossover', impulse: true, decide: { kind: 'none' } });
    expect(r.ball).toBe('queued');
    expect(r.startHand).not.toBe(r.endHand);
    const out = runOut(carry, frame);
    const all = [...bones, ...out.bones.slice(1)];
    expect(flips(all)).toBe(2);
    expect(carry.handBone).toBe(start);
  });
  it('neither mode\'s snatchback toggles the hand on its own: no switchHand / toSide in its branch, the hand goes through requestMove\'s path', () => {
    for (const f of ['lib/babylon/modes/OneVOneMode.ts', 'lib/babylon/modes/ThreeVThreeMode.ts']) {
      const src = readFileSync(f, 'utf8');
      const at = src.indexOf("if (pick.move === 'snatchback')");
      expect(at, f).toBeGreaterThan(0);
      const branch = src.slice(at, src.indexOf('continue;', at));
      expect(branch, f).toMatch(/requestMove\(meHost\(\), \{\s*move: 'snatch_back'/);
      expect(branch, f).not.toMatch(/switchHand\(|toSide\(/);
    }
  });
});

/** Run a DribbleController straight ahead (facing +z) at a sprint until it is at speed. */
function atSpeed(sprint = true) {
  const d = new DribbleController();
  d.setFacing(0);
  for (let i = 0; i < 90; i++) d.update(1 / 60, 0, -1, sprint);
  return d;
}
const heading = (v: Vector3): number => Math.atan2(v.x, v.z);

describe('TH-6: a move redirects the travel — rotate, don\'t add (DR-3)', () => {
  it('redirectFor (pure): the travel turned toward the move\'s side by atan2(lateral, forward), the speed max(current, |impulse|) capped at top × 1.15 — never braked', () => {
    const top = DEFAULT_MOVEMENT.maxSpeed;
    const cross = impulseFor('crossover', 'right');
    const r = redirectFor(0, 5, 0, cross.forward, cross.lateral)!;
    expect(r.turnRad).toBeCloseTo(Math.atan2(1.6, 0.4), 6);
    expect(Math.atan2(r.x, r.z)).toBeCloseTo(Math.atan2(1.6, 0.4), 6);   // +: toward the athlete's right (yaw + π/2)
    expect(r.speed).toBe(5);
    const l = redirectFor(0, 5, 0, impulseFor('crossover', 'left').forward, impulseFor('crossover', 'left').lateral)!;
    expect(Math.atan2(l.x, l.z)).toBeCloseTo(-Math.atan2(1.6, 0.4), 6);
    // from a standstill: the facing turned, at the impulse's own magnitude
    const s = redirectFor(0, 0, Math.PI / 2, cross.forward, cross.lateral)!;
    expect(Math.atan2(s.x, s.z)).toBeCloseTo(Math.PI / 2 + Math.atan2(1.6, 0.4), 6);
    expect(s.speed).toBeCloseTo(Math.hypot(0.4, 1.6), 6);
    // the cap holds an impulse over it; a run already over the cap is not braked
    expect(redirectFor(0, 0, 0, 9, 0)!.speed).toBeCloseTo(top * REDIRECT_TOP_K, 6);
    expect(redirectFor(0, top * 1.2, 0, cross.forward, cross.lateral)!.speed).toBeCloseTo(top * 1.2, 6);
    // the fakes stay zero
    for (const m of ['hesi', 'yoyo', 'in_and_out', 'spin'] as HandleMove[]) { const i = moveImpulse(m); expect(redirectFor(0, 5, 0, i.forward, i.lateral), m).toBeNull(); }
  });
  it('on the controller: after a crossover\'s impulse the velocity\'s heading has turned toward the move\'s side, the speed not below its pre-move value; the facing goes with it', () => {
    for (const side of ['right', 'left'] as const) {
      const d = atSpeed();
      const v0 = d.vel.clone(), s0 = v0.length(), h0 = heading(v0);
      const imp = impulseFor('crossover', side);
      expect(d.redirect(imp.forward, imp.lateral, d.facing)).toBe(true);
      for (let i = 0; i < 5; i++) d.update(1 / 60, 0, 0, true);   // the blend (CUT_BLEND_SEC 0.07 s), the stick let go
      const turned = heading(d.vel) - h0;
      const sgn = side === 'right' ? 1 : -1;
      expect(turned * sgn, side).toBeGreaterThan(0.5);   // over ~29°: a heading change, not a sideways slide
      expect(d.vel.length(), side).toBeGreaterThanOrEqual(s0 * 0.85);   // (the stick let go: CourtMovement's own decel over 5 frames)
      expect((d.facing - h0) * sgn, side).toBeGreaterThan(0.5);
    }
  });
  it('…and the redirect\'s target speed is not below the pre-move speed (the cut it writes: speed ≥ |v0|), its heading the rotated one', () => {
    const d = atSpeed();
    const s0 = d.vel.length(), h0 = heading(d.vel);
    const imp = impulseFor('crossover', 'right');
    d.redirect(imp.forward, imp.lateral, d.facing);
    const cut = (d as unknown as { pendingCut: { x: number; z: number; speed: number } | null }).pendingCut!;
    expect(cut.speed).toBeGreaterThanOrEqual(s0);
    expect(Math.atan2(cut.x, cut.z) - h0).toBeCloseTo(Math.atan2(1.6, 0.4), 4);
  });
  it('a zero-impulse move (the hesi) changes nothing: no cut, the velocity and the facing as they were', () => {
    const d = atSpeed();
    const v0 = d.vel.clone(), f0 = d.facing;
    const i = moveImpulse('hesi');
    expect(d.redirect(i.forward, i.lateral, d.facing)).toBe(false);
    expect(d.vel.equals(v0)).toBe(true);
    expect(d.facing).toBe(f0);
  });
  it('a cut already blending (the step-back hop, the left stick\'s own reversal) keeps its line: the move adds nothing on top', () => {
    const d = atSpeed();
    d.stepBack(0, 1, true);
    const cut = { ...(d as unknown as { pendingCut: object }).pendingCut };
    const imp = impulseFor('crossover', 'right');
    expect(d.redirect(imp.forward, imp.lateral, d.facing)).toBe(false);
    expect((d as unknown as { pendingCut: object }).pendingCut).toEqual(cut);
  });
  it('both modes\' impulse hosts redirect through the controller — no velocity addition is left', () => {
    for (const [f, call] of [['lib/babylon/modes/OneVOneMode.ts', 'meDribble.redirect(forward, lateral, me.root.rotation.y)'], ['lib/babylon/modes/ThreeVThreeMode.ts', 'me.drib.redirect(forward, lateral, me.char.root.rotation.y)']] as const) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toContain(`impulse: (forward, lateral) => { ${call}; }`);
      expect(src, f).not.toMatch(/vel\.addInPlace\(new Vector3\(fx \* forward/);
    }
  });
});

describe('TH-7: 3v3 AI bodies loop in the left hand', () => {
  const src = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
  it('every body gets the left twins at spawn — the `!ai` guard is gone (1v1 twins both its bodies)', () => {
    expect(src).not.toMatch(/if \(!ai\) leftDribbleTwins/);
    expect(src).toMatch(/\n\s+leftDribbleTwins\(char\.animator, char\.skeleton\);/);
    const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
    expect((one.match(/leftDribbleTwins\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('every 3v3 tree that can carry the ball is fed its ball hand from its own carry (the hero, the mates, the foe driver)', () => {
    expect(src).toContain("ballHand: carries.get(me)?.hand === 'Left' ? 'left' : 'right'");
    expect(src).toContain("ballHand: carries.get(body)?.hand === 'Left' ? 'left' : 'right'");
    expect(src).toContain("ballHand: carries.get(f)?.hand === 'Left' ? 'left' : 'right'");
    // each fed carry exists: one per body, mounted for all six
    expect(src).toMatch(/for \(const b of \[me, \.\.\.mates, \.\.\.foes\]\) carries\.set\(b, mountBallCarry/);
  });
  it('a body with the ball in its LEFT hand plays the left loop (its `_left` twin) in every dribble state an AI reaches; in the right hand, the loop itself', () => {
    const base: AnimTreeInput = { speedMps: 0, speed01: 0, crossover: false, nearestDefender: Infinity, hasBall: true, shooting: false, dunking: false, driving: false, defending: false, bracing: false, staggered: false };
    const cases: Partial<AnimTreeInput>[] = [{ speed01: 0 }, { speed01: 0.3, speedMps: 1.9 }, { speed01: 0.6, speedMps: 3.8 }, { speed01: 0.9, speedMps: 5.8 }, { speed01: 0.9, speedMps: 5.8, driving: true }];
    for (const c of cases) {
      const right = chooseBasketballClip({ ...base, ...c, ballHand: 'right' });
      const left = chooseBasketballClip({ ...base, ...c, ballHand: 'left' });
      expect(LEFT_TWIN_STATES.has(left.state), left.state).toBe(true);
      expect(left.clip, left.state).toBe(leftTwinOf(right.clip));
    }
  });
});

describe('TH-8: the scope held (the PR\'s touched-test list is empty)', () => {
  it('the hesi hang / explode and the crossover\'s own cut are untouched: the controller still writes them itself (check C runs as-is in the headless suite)', () => {
    const src = readFileSync('lib/babylon/core/BasketballCore.ts', 'utf8');
    expect(src).toContain('this.cutTo(dir!.x, dir!.z, Math.min(top * 1.15, this.movement.vel.length() + this.crossoverBoost * (sprint ? 1.3 : 0.85)));');
    expect(src).toContain('private explodeAlong(dir: Vector3): void {');
  });
  it('the move impulse values are HandleSystem\'s, unchanged (MA-1 / MA-3 own them)', () => {
    expect(moveImpulse('crossover')).toEqual({ forward: 0.4, lateral: 1.6 });
    expect(moveImpulse('shammgod')).toEqual({ forward: 3.4, lateral: 0.8 });
    expect(moveImpulse('snatch_back')).toEqual({ forward: -2.6, lateral: 0.6 });
  });
});
