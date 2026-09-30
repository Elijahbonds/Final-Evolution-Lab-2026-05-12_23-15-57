// REACH-FREEZE (2026-09-29): the play frame on a REAL body — the kit GLB every non-owner player wears, in a NullEngine — with a
// ball in its right palm exactly as the hoops modes carry one (ballRig.attachBallToHand). The spec's acceptance tests B1, B2, B5
// (through the identity pipe) and B8. Each is paired with a control that reads the SCALED body the way the modes read it before
// this pass, so a test that passes is not passing because the body never changed.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, MeshBuilder, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Skeleton, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { boneNode } from '../anim/boneLookup';
import { attachBallToHand } from '../anim/ballRig';
import { armChain, reachArm } from '../anim/HandIK';
import { applyIdentity, applyProportions, type PlayerIdentity } from './playerIdentity';
import type { SpawnedCharacter } from './CharacterLibrary';
import { playFrameWorld } from './playFramePoint';
import { STANDARD_FRAME_MODES, type V3 } from './playFrame';
import { ironContact } from './DunkHands';
import { clearOfIron, sweptTouch } from './RimFlush';
import { canCatch } from './DunkLob';
import { slamExecution, slamReadout } from './DunkSystem';
import { judgeDunk } from './JudgePanel';
import { defaultFace } from '../../closet/wearable-catalog';

const MIN = { heightScale: 0.96, buildScale: 0.94 };
const MAX = { heightScale: 1.04, buildScale: 1.08 };
const OLD_SAVE = { heightScale: 1.14, buildScale: 1.18, reachScale: 1.12 };   // the old creator's top of every row
const REACH_JOINTS = ['LeftForeArm', 'LeftHand', 'RightForeArm', 'RightHand'];

let scene: Scene; let sk: Skeleton; let root: TransformNode; let base: Vector3; let q0: Quaternion | null;
let ball: AbstractMesh; let hand: TransformNode;
beforeAll(async () => {
  scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene);
  const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/candidates/fel-kit-male.glb').toString('base64'), scene, undefined, '.glb');
  for (const g of r.animationGroups) g.stop();
  sk = r.skeletons[0]; root = r.meshes[0] as TransformNode; base = root.scaling.clone(); q0 = root.rotationQuaternion?.clone() ?? null;
  hand = boneNode(sk, 'RightHand')!;
  ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
  attachBallToHand(ball, sk, 'RightHand');
}, 60_000);

/** Every node under the root, parents first, brought up to date (what a rendered frame does). */
function settle(): void {
  root.computeWorldMatrix(true);
  for (const n of root.getDescendants(false)) (n as TransformNode).computeWorldMatrix?.(true);
}
/** The body at these proportions (absolute from the spawn's base), its root at `at`, turned `yaw` about the vertical. */
function place(p: { heightScale?: number; buildScale?: number; reachScale?: number }, at: V3, yaw: number): void {
  applyProportions({ root, skeleton: sk }, p, base);
  root.position.set(at.x, at.y, at.z);
  const turn = Quaternion.RotationAxis(Vector3.Up(), yaw);
  if (q0) root.rotationQuaternion = turn.multiply(q0); else root.rotation.set(0, yaw, 0);
  settle();
}
const v3 = (p: Vector3): V3 => ({ x: p.x, y: p.y, z: p.z });
/** The gameplay read after this pass: the node on the standard frame. */
const PLAY = (n: TransformNode): V3 => v3(playFrameWorld(n));
/** The read before it: the scaled node's world position (`ball.getAbsolutePosition()` in the modes). */
const RAW = (n: TransformNode): V3 => { n.computeWorldMatrix(true); return v3(n.getAbsolutePosition().clone()); };
const dist = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function rng(seed: number): () => number {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── B1: a seeded run ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THE RUN DRIVES, all the real outcome functions DunkMode calls, in its order: the slam's timing window (slamExecution,
// slamReadout); the flight (the root on a ballistic arc, 60 fps); the lob's catch (canCatch on the hand); the jam's rim contact
// (ironContact on the ball in the palm, then sweptTouch → clearOfIron for the point the ball meets the iron); and the five
// judges' cards (judgeDunk, with the execution a make earns). Twelve attempts from one seed. The rim and the lob are fixed in the
// world, measured once off the standard body: the court does not move with the player.
const DT = 1 / 60, G = 9.81, RIM_R = 0.2286, BALL_R = 0.12, YAW = 0.6;
const CENTER = 1.25, HALF = 0.09, REACH = 0.43;   // a slam window's shape in clip seconds: its centre, half-width and the buffer's reach
let RIM: V3; let LOB: V3;
function court(): void {
  place({}, { x: 0, y: 0.85, z: 0 }, YAW);
  const b = RAW(ball); RIM = { x: b.x, y: b.y + 0.01, z: b.z };
  place({}, { x: 0, y: 0.55, z: 0 }, YAW);
  const h = RAW(hand); LOB = { x: h.x + 0.35, y: h.y + 0.3, z: h.z - 0.25 };
}
interface Attempt { readout: string; caught: number | null; contact: number | null; touch: V3 | null; cards: number[] }
function seededRun(s: { heightScale: number; buildScale: number }, read: (n: TransformNode) => V3, seed = 29): Attempt[] {
  const r = rng(seed); const out: Attempt[] = [];
  for (let i = 0; i < 12; i++) {
    const at = CENTER + (r() - 0.6) * 0.6, v0 = 4.1 + r() * 0.5;
    const execution01 = slamExecution(at, CENTER, HALF, REACH);
    const readout = slamReadout(at, CENTER, execution01, HALF).label;
    const lob: V3 = { x: LOB.x, y: LOB.y + (r() - 0.5) * 0.2, z: LOB.z };
    let caught: number | null = null, contact: number | null = null, touch: V3 | null = null, prev: V3 | null = null;
    for (let f = 1; f < 200; f++) {
      const t = f * DT, y = v0 * t - 0.5 * G * t * t; if (y < 0) break;
      place(s, { x: 0, y, z: 0 }, YAW);
      if (caught === null && canCatch(read(hand), lob)) caught = f;
      const b = read(ball);
      if (contact === null && ironContact({ ball: b, rim: RIM, rimRadius: RIM_R, ballRadius: BALL_R, sincePress: 0, centred: true })) {
        contact = f; touch = clearOfIron(prev ? sweptTouch(prev, b, RIM, RIM_R, BALL_R) : b, RIM, RIM_R, BALL_R);
      }
      prev = b;
    }
    const execution = contact !== null ? execution01 * 10 : 0;   // a jam that never met the iron is not a make
    const cards = judgeDunk(6 + r() * 3, execution, 5 + r() * 4, r()).map((j) => j.score);
    out.push({ readout, caught, contact, touch, cards });
  }
  return out;
}

/** An attempt's discrete results — the timing readout, the catch frame, the contact frame, the cards — and whether it touched. */
const discrete = (r: Attempt[]) => r.map(({ touch, ...rest }) => ({ ...rest, touched: touch !== null }));

describe('B1 the same seeded run at the min and max cosmetic scale', () => {
  it('B1 gives identical timing-window results, catches, rim contacts and cards', () => {
    court();
    const std = seededRun({ heightScale: 1, buildScale: 1 }, PLAY);
    const lo = seededRun(MIN, PLAY), hi = seededRun(MAX, PLAY);
    // every discrete result exactly equal; the touch point equal to a micrometre (float noise from dividing the scale back out)
    expect(discrete(lo)).toEqual(discrete(std));
    expect(discrete(hi)).toEqual(discrete(std));
    std.forEach((a, i) => {
      for (const r of [lo, hi]) if (a.touch && r[i].touch) expect(dist(a.touch, r[i].touch!), `attempt ${i}`).toBeLessThan(1e-6);
    });
    // the run is not empty: it catches, it meets the iron and the cards move with the timing
    expect(std.filter((a) => a.caught !== null).length).toBeGreaterThan(0);
    expect(std.filter((a) => a.contact !== null).length).toBeGreaterThan(0);
    expect(new Set(std.map((a) => a.cards.join())).size).toBeGreaterThan(1);
  });

  it('B1 control: read off the scaled body (the modes before this pass), the same run does NOT agree', () => {
    court();
    const lo = seededRun(MIN, RAW), hi = seededRun(MAX, RAW);
    expect(discrete(lo)).not.toEqual(discrete(hi));   // not float noise: a catch, a contact frame or a card moves
  });
});

describe('B2 ball release and rim-touch points', () => {
  const AT: V3 = { x: 1.1, y: 0.7, z: -0.4 };
  function points(p: { heightScale?: number; buildScale?: number; reachScale?: number }, read: (n: TransformNode) => V3) {
    court();
    place(p, AT, YAW); const release = read(ball);
    // the jam's last two frames either side of the iron: the swept touch between them, out of the metal
    place(p, { x: 0, y: 0.8, z: 0 }, YAW); const a = read(ball);
    place(p, { x: 0, y: 0.88, z: 0 }, YAW); const b = read(ball);
    return { release, touch: clearOfIron(sweptTouch(a, b, RIM, RIM_R, BALL_R), RIM, RIM_R, BALL_R) };
  }

  it('B2 match within 1 cm at min / 1.0 / max and on an old 1.14 save (which now clamps)', () => {
    const std = points({}, PLAY);
    for (const [name, p] of Object.entries({ MIN, MAX, OLD_SAVE })) {
      const q = points(p, PLAY);
      expect(dist(q.release, std.release), `${name} release`).toBeLessThan(0.01);
      expect(dist(q.touch, std.touch), `${name} touch`).toBeLessThan(0.01);
    }
  });

  it('B2 control: the scaled ball itself is more than 1 cm apart between min and max', () => {
    const lo = points(MIN, RAW), hi = points(MAX, RAW);
    expect(dist(lo.release, hi.release)).toBeGreaterThan(0.01);
  });

  it('an old save clamps to the top of the cosmetic range and never lengthens the arm', () => {
    place(OLD_SAVE, AT, 0);
    expect(root.scaling.y / base.y).toBeCloseTo(1.04, 12);
    expect(Math.abs(root.scaling.x / base.x)).toBeCloseTo(1.04 * 1.08, 12);
    for (const n of REACH_JOINTS) expect((boneNode(sk, n)!.metadata as { felBindPos?: Vector3 } | null)?.felBindPos, n).toBeUndefined();
  });
});

// ── B5 through the identity pipe: the spawn scene's stamps, not a parameter ──────────────────────────────────────────────────
function identity(p: { heightScale: number; buildScale: number; reachScale?: number }): PlayerIdentity {
  const face = defaultFace();
  return {
    proportions: { heightScale: p.heightScale, buildScale: p.buildScale, reachScale: p.reachScale ?? 1, palette: { skin: face.skinTone, primary: '#00E5FF', accent: '#FFD700' }, stance: 'athletic' },
    face, palette: { jersey: '#00E5FF', shorts: '#0b1220', shoes: '#A855F7', accent: '#FFD700' }, jersey: null,
    wardrobe: { tops: null, shorts: null, shoes: null }, custom: true, body: 'kit-male',
  };
}
/** The spawn applyIdentity sees: this body, no meshes (nothing to tint — the proportions are the part under test). */
const spawnOf = (): SpawnedCharacter => ({ root, skeleton: sk, meshes: [], id: 'reach-freeze' }) as unknown as SpawnedCharacter;
function spawnIn(metadata: Record<string, unknown> | null, p: { heightScale: number; buildScale: number; reachScale?: number }): void {
  scene.metadata = metadata;
  root.scaling.copyFrom(base);
  applyIdentity(spawnOf(), identity(p));
  settle();
}

describe('B5 ranked spawns, and the dunk and the dunk duel, are always 1.0 / 1.0 / 1.0', () => {
  const bind = () => REACH_JOINTS.map((n) => boneNode(sk, n)!.position.clone());

  it('B5 a scene stamped dunk, dunkduel or ranked spawns the body at exactly its base scale, arms at bind', () => {
    const arms = bind();
    for (const md of [{ felModeId: 'dunk' }, { felModeId: 'dunkduel' }, { felModeId: 'freerun', felRanked: true }, { felModeId: 'onevone', felRanked: true }]) {
      for (const p of [OLD_SAVE, MIN, MAX]) {
        spawnIn(md, p);
        expect(root.scaling.equals(base), JSON.stringify(md)).toBe(true);
        REACH_JOINTS.forEach((n, i) => expect(boneNode(sk, n)!.position.equals(arms[i]), n).toBe(true));
      }
    }
    scene.metadata = null;
  });

  it('B5 control: the same pipe in a casual scene does scale the body (clamped)', () => {
    spawnIn({ felModeId: 'freerun' }, OLD_SAVE);
    expect(root.scaling.y / base.y).toBeCloseTo(1.04, 12);
    spawnIn(null, MIN);
    expect(root.scaling.y / base.y).toBeCloseTo(0.96, 12);
    scene.metadata = null; root.scaling.copyFrom(base);
  });
});

// ── B8: the hand meets the ball ──────────────────────────────────────────────────────────────────────────────────────────────
describe('B8 the visible hand still meets the ball at CONTACT', () => {
  it('B8 in every standard-frame mode the gameplay point IS the ball in the visible palm', () => {
    for (const modeId of Object.keys(STANDARD_FRAME_MODES)) {
      for (const p of [OLD_SAVE, MIN, MAX]) {
        spawnIn({ felModeId: modeId }, p);
        expect(ball.parent, modeId).toBe(hand);
        expect(dist(PLAY(ball), RAW(ball)), modeId).toBeLessThan(1e-9);
      }
    }
    scene.metadata = null; root.scaling.copyFrom(base);
  });

  // THE CONTACT POSE for a casual body: the elbow bent, the ball in front of the face — a jumper's set point, a catch. The two-bone
  // solver (HandIK.reachArm) takes the scaled arm's wrist to the standard frame's wrist; 2 mm is HandIK's own tolerance (HandIK.test).
  function bent(): { restore: () => void } {
    const arm = armChain(sk, 'Right')!;
    const saved = [arm.shoulder, arm.elbow, arm.hand].map((n) => n.rotationQuaternion?.clone() ?? null);
    arm.elbow.rotationQuaternion = (arm.elbow.rotationQuaternion ?? Quaternion.Identity()).multiply(Quaternion.RotationAxis(Vector3.Right(), 1.3));
    return { restore: () => [arm.shoulder, arm.elbow, arm.hand].forEach((n, i) => { n.rotationQuaternion = saved[i]; }) };
  }
  const POLE = new Vector3(0.6, -0.4, -0.6);

  it('B8 on a cosmetic body the two-bone solver fits the visible wrist to the gameplay point (bent arm, min and max)', () => {
    const AT: V3 = { x: 0.4, y: 0, z: 0.2 };
    for (const p of [MIN, MAX]) {
      const pose = bent();
      place({}, AT, YAW); const target = RAW(hand);           // where the standard body's wrist is, in this pose
      place(p, AT, YAW);
      const goal = PLAY(hand);
      expect(dist(goal, target)).toBeLessThan(1e-6);         // the gameplay point does not move with the body
      const miss = reachArm(armChain(sk, 'Right')!, new Vector3(goal.x, goal.y, goal.z), POLE);
      settle();
      expect(miss).toBeLessThan(2e-3);
      expect(dist(RAW(hand), target)).toBeLessThan(2e-3);
      expect(ball.parent).toBe(hand);                         // and the ball is still in that palm
      pose.restore();
    }
    place({}, AT, 0);
  });

  // THE LIMIT, measured (and the reason for STANDARD_FRAME_MODES): at FULL overhead extension — the dunk's contact, a jumper's top —
  // the standard frame's wrist is further from a shorter body's shoulder than that body's whole arm. No two-bone solve can close it;
  // the shortfall is about (1 − h) × (shoulder height + arm length). A taller body can always bend to it.
  it('B8 limit: at full overhead extension the shortest cosmetic body falls short of the standard point; the tallest reaches it', () => {
    const AT: V3 = { x: 0, y: 0, z: 0 };
    const arm = armChain(sk, 'Right')!;
    const saved = [arm.shoulder, arm.elbow, arm.hand].map((n) => n.rotationQuaternion?.clone() ?? null);
    place({}, AT, 0);
    const S = RAW(arm.shoulder), E = RAW(arm.elbow), H = RAW(arm.hand);
    const L = dist(S, E) + dist(E, H);
    const target = new Vector3(S.x, S.y + L, S.z);            // the standard wrist, straight up from its shoulder
    const miss: Record<string, number> = {};
    for (const [name, p] of Object.entries({ MIN, MAX })) {
      place(p, AT, 0);
      miss[name] = reachArm(arm, target, POLE);
      [arm.shoulder, arm.elbow, arm.hand].forEach((n, i) => { n.rotationQuaternion = saved[i]; });
    }
    place({}, AT, 0);
    const predicted = (1 - MIN.heightScale) * (S.y - AT.y + L);
    console.info(`[REACH-FREEZE] B8 limit: full overhead extension, standard shoulder ${S.y.toFixed(3)} m, arm ${L.toFixed(3)} m → the 96 % body is ${(miss.MIN * 100).toFixed(1)} cm short (predicted ${(predicted * 100).toFixed(1)} cm); the 104 % body misses by ${(miss.MAX * 1000).toFixed(2)} mm`);
    expect(miss.MAX).toBeLessThan(2e-3);
    expect(miss.MIN).toBeGreaterThan(0.02);
    expect(Math.abs(miss.MIN - predicted)).toBeLessThan(0.02);
  });
});
