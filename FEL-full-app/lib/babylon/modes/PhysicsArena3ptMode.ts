// PhysicsArena3ptMode — the Physics Arena, phase 3: a three-point contest on real physics (docs/PHYSICS-ARENA-PLAN.md §5).
//
// Five racks round the arc, five balls a rack, the last ball of each rack worth 2, sixty seconds from the first shot. Every ball
// is the arena's Havok ball (a pool of four, so the next shot can leave while the last is still on the iron); every shot is the
// one release the 1v1 uses (arenaShot: the throw plus the body's own rise or fall at the release — let go at the top of the jump);
// every point is the ball through the hoop (hoopSensor). No make chance, no meter grade deciding anything.
//
// The shipped 3-Point Contest (ThreePointMode.ts, `/play/threepoint`) is untouched: this is the arena's own contest, with its own
// rules where the arena needs them (assumption: five racks of five, the fifth ball worth 2, sixty seconds from the first release).
// Registered, NOT enabled: its page is /play/arena?sport=threepoint.

import { Color3, MeshBuilder, PBRMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { Mesh, Scene } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import type { CamMode } from '../core/CameraDirector';
import { CharacterPipeline } from '../core/characterPipeline';
import type { SpawnedCharacter } from '../core/CharacterLibrary';
import { installSafePlay } from '../anim/clipRegistry';
import { boneNode } from '../anim/boneLookup';
import { dressBall } from '../visual/meshyProps';
import { SoundKit } from '../audio/SoundKit';
import { DUNK_CONFIG } from './modeConfigs';
import { devOrAgentHooks } from '@/lib/agentRunHooks';
import { ArenaPhysics, type ArenaBall, type ArenaPlayer } from '../arena/arenaPhysics';
import { mountArenaCourt, RIM_VEC, type ArenaCourt } from '../arena/arenaCourt';
import { ARENA_RIM, ARENA_RIM_RADIUS, BALL_R, type P3 } from '../arena/hoopGeometry';
import { HoopSensor } from '../arena/hoopSensor';
import { releaseShot } from '../arena/arenaShot';
import { seeded } from '../arena/shotModel';
import { chestPoint, setPoint } from '../arena/dribble';
import { aimAssist, jumpVy, povBobM, povEyeM, povFovDeg, povLookDegS, povOn } from '../arena/arenaConfig';
import { aimYawErr, applyPov, fovForAspect, povLook, povPose, type PovView } from '../arena/povCamera';

export const ARENA_3PT_MODE_ID = 'physics_arena_3pt';
const G = 9.81;
/** The contest's clock (s), from the first release. */
export const CONTEST_SEC = 60;
/** The racks: angle from the ring's axis (degrees) and distance from the ring's centre (m), just past the 6.75 m line. */
export const RACKS: ReadonlyArray<{ deg: number; d: number }> = [
  { deg: -78, d: 7.05 }, { deg: -40, d: 7.1 }, { deg: 0, d: 7.15 }, { deg: 40, d: 7.1 }, { deg: 78, d: 7.05 },
];
export const BALLS_PER_RACK = 5;
/** The pool of physical balls (a shot leaves while the last one is still in the air). */
const POOL = 4;
const GATHER_SEC = 0.14;

/** Where the shooter stands at rack i (feet), facing the ring. */
export function rackSpot(i: number): P3 {
  const r = RACKS[i];
  const a = (r.deg * Math.PI) / 180;
  return { x: ARENA_RIM.x + Math.sin(a) * r.d, y: 0, z: ARENA_RIM.z + Math.cos(a) * r.d };
}

/** Points for ball b of a rack (0-based): the last one is the 2-point ball. */
export const pointsFor = (b: number): number => (b === BALLS_PER_RACK - 1 ? 2 : 1);

interface PoolBall { ball: ArenaBall; mesh: Mesh; sensor: HoopSensor; prev: P3; pts: number; live: boolean }

interface St {
  scene: Scene;
  world: ArenaPhysics;
  court: ArenaCourt;
  pool: PoolBall[];
  poolNext: number;
  racks: Mesh[][];
  node: TransformNode;
  body: ArenaPlayer;
  view: TransformNode;
  char: SpawnedCharacter | null;
  head: TransformNode | null;
  yaw: number;
  clip: string;
  rack: number;
  inRack: number;
  /** The ball in hand (its pool index), or -1. */
  inHand: number;
  shot: { t: number; jumped: boolean; wantRelease: boolean } | null;
  moveT: number;
  clock: number;
  started: boolean;
  done: boolean;
  doneT: number;
  score: number;
  makes: number;
  shots: number;
  t: number;
  rng: ReturnType<typeof seeded>;
  input: { rx: number; ry: number };
  pov: { on: boolean; view: PovView; savedFov: number };
  camModeSeen: CamMode;
  banner: string;
  bannerT: number;
  timing: string;
  hudKey: string;
  scriptOffset: number | null;
  disposed: boolean;
}

const states = new WeakMap<Scene, St>();
let current: St | null = null;
const TMP = new Vector3();
const p3 = (v: { x: number; y: number; z: number }): P3 => ({ x: v.x, y: v.y, z: v.z });
const yawTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
const say = (S: St, text: string, sec = 1.2) => { S.banner = text; S.bannerT = sec; };

function playClip(S: St, clip: string, loop = true): void {
  if (!S.char || S.clip === clip) return;
  S.clip = clip;
  S.char.animator.play(clip, { loop, fadeSec: 0.15 });
}

function toRack(S: St, i: number): void {
  S.rack = i; S.inRack = 0;
  const p = rackSpot(i);
  S.body.teleport(p);
  S.yaw = yawTo(p, ARENA_RIM);
}

function reset(S: St): void {
  S.score = 0; S.makes = 0; S.shots = 0; S.clock = CONTEST_SEC; S.started = false; S.done = false; S.doneT = 0; S.inHand = -1; S.shot = null;
  for (const rack of S.racks) for (const m of rack) m.isVisible = true;
  for (const pb of S.pool) { pb.live = false; pb.ball.teleport({ x: 9 + S.pool.indexOf(pb) * 0.3, y: BALL_R, z: 12 }); pb.sensor.reset(); }
  toRack(S, 0);
  say(S, 'Five racks, sixty seconds. Hold X, let go at the top', 2.2);
}

/** X down: the next ball off the rack into the hands, the gather, the jump. */
function pick(S: St): void {
  if (S.done || S.shot || S.inHand >= 0 || S.moveT > 0 || S.inRack >= BALLS_PER_RACK) return;
  const pi = S.poolNext; S.poolNext = (S.poolNext + 1) % POOL;
  const pb = S.pool[pi];
  pb.pts = pointsFor(S.inRack);
  pb.live = false;
  pb.sensor.reset();
  S.racks[S.rack][S.inRack].isVisible = false;
  pb.ball.teleport(chestPoint(p3(S.node.position), S.yaw));
  pb.ball.ignore(S.body.bit);
  S.inHand = pi;
  S.shot = { t: 0, jumped: false, wantRelease: false };
  playClip(S, 'bball_shoot_jumper', false);
  if (!S.started) { S.started = true; }
}

function release(S: St): void {
  if (!S.shot || S.inHand < 0) return;
  const pb = S.pool[S.inHand];
  const v = S.body.vel(TMP);
  const yawErr = S.pov.on ? aimYawErr(S.pov.view.yaw, p3(S.node.position), ARENA_RIM, aimAssist()) : 0;
  const ms = Math.round(((S.shot.jumped ? -v.y : -jumpVy()) / G) * 1000);
  releaseShot(pb.ball, S.body.bit, { x: v.x, y: S.shot.jumped ? v.y : jumpVy(), z: v.z }, S.rng.normal, yawErr);
  pb.live = true; pb.prev = p3(pb.ball.pos);
  S.inHand = -1; S.shot = null; S.shots++; S.inRack++;
  S.timing = `${ms < -35 ? 'early' : ms > 35 ? 'late' : 'on time'} ${ms > 0 ? '+' : ''}${ms} ms`;
  SoundKit.play('whoosh', { volume: 0.3 });
  if (S.inRack >= BALLS_PER_RACK) S.moveT = S.rack < RACKS.length - 1 ? 0.7 : 0;
}

function camera(ctx: ModeContext, S: St, dt: number): void {
  if (ctx.camDirector.mode !== S.camModeSeen) {
    if (povOn()) { ctx.camDirector.mode = S.camModeSeen; togglePov(ctx, S); }
    else S.camModeSeen = ctx.camDirector.mode;
  }
  if (S.pov.on) {
    povLook(S.pov.view, S.input.rx, S.input.ry, povLookDegS(), dt);
    const eyeY = S.head ? Math.min(2.1, Math.max(1.3, S.head.getAbsolutePosition().y - S.node.position.y + 0.08)) : povEyeM();
    const pose = povPose(p3(S.node.position), S.pov.view, eyeY, 0, povBobM(), dt);
    applyPov(ctx.camera, pose, fovForAspect(povFovDeg(), ctx.scene.getEngine().getAspectRatio(ctx.camera)));
    return;
  }
  ctx.camDirector.look(S.input.rx, S.input.ry, dt);
  ctx.camDirector.update(S.node.position, S.body.vel(TMP), RIM_VEC());
}

function togglePov(ctx: ModeContext, S: St): void {
  S.pov.on = !S.pov.on;
  ctx.camDirector.suspended = S.pov.on;
  for (const m of S.char?.meshes ?? []) m.isVisible = !S.pov.on;
  if (S.pov.on) { S.pov.savedFov = ctx.camera.fov; S.pov.view.yaw = S.yaw; S.pov.view.pitch = 0.12; }
  else { ctx.camera.fov = S.pov.savedFov; ctx.camera.minZ = 0.1; ctx.camDirector.snapTo(S.node.position, RIM_VEC()); }
  say(S, S.pov.on ? 'POV' : 'Court camera', 0.9);
}

export const PhysicsArena3ptMode: ModeDefinition = {
  modeId: ARENA_3PT_MODE_ID,
  mood: 'goldenHour',
  camPreset: 'hoops',

  async load(ctx: ModeContext) {
    const scene = ctx.scene;
    const court = mountArenaCourt(scene);
    const ballMat = new PBRMaterial('arena3_ball', scene);
    ballMat.albedoColor = Color3.FromHexString('#e0742c'); ballMat.roughness = 0.7; ballMat.metallic = 0;
    const goldMat = new PBRMaterial('arena3_gold', scene);
    goldMat.albedoColor = Color3.FromHexString('#f2c14e'); goldMat.roughness = 0.4; goldMat.metallic = 0.2;
    goldMat.emissiveColor = Color3.FromHexString('#f2c14e').scale(0.15);
    const meshes: Mesh[] = [];
    for (let i = 0; i < POOL; i++) {
      const m = MeshBuilder.CreateSphere(`ball${i ? `_${i}` : ''}`, { diameter: BALL_R * 2, segments: 16 }, scene);
      m.material = ballMat; meshes.push(m);
      void dressBall(m, 'basketball');
    }
    const world = await ArenaPhysics.create(scene, { ballNode: meshes[0] });
    if (scene.isDisposed) { world.dispose(); return; }
    const pool: PoolBall[] = meshes.map((m, i) => ({ ball: i === 0 ? world.ball : world.addBall(m), mesh: m, sensor: new HoopSensor(ARENA_RIM, ARENA_RIM_RADIUS), prev: { x: 0, y: 0, z: 0 }, pts: 1, live: false }));
    // the racks: a low stand beside each spot, its five balls (the last one gold: worth 2); drawing only (a ball goes to the
    // physics when it is picked up)
    const standMat = new PBRMaterial('arena3_stand', scene);
    standMat.albedoColor = Color3.FromHexString('#2b3a55'); standMat.roughness = 0.5; standMat.metallic = 0.3;
    const racks: Mesh[][] = RACKS.map((_, i) => {
      const p = rackSpot(i), yaw = yawTo(p, ARENA_RIM);
      const sx = Math.cos(yaw), sz = -Math.sin(yaw);   // to the shooter's right
      const base = { x: p.x + sx * 0.75, z: p.z + sz * 0.75 };
      const stand = MeshBuilder.CreateBox(`arena3_rack_${i}`, { width: 1.3, height: 0.5, depth: 0.32 }, scene);
      stand.position.set(base.x, 0.25, base.z); stand.rotation.y = yaw + Math.PI / 2; stand.material = standMat;
      return Array.from({ length: BALLS_PER_RACK }, (_, b) => {
        const m = MeshBuilder.CreateSphere(`arena3_rackball_${i}_${b}`, { diameter: BALL_R * 2, segments: 12 }, scene);
        const k = (b - 2) * 0.25, th = yaw + Math.PI / 2;   // along the stand (its local x after the turn)
        m.position.set(base.x + Math.cos(th) * k, 0.62, base.z - Math.sin(th) * k);
        m.material = b === BALLS_PER_RACK - 1 ? goldMat : ballMat;
        return m;
      });
    });
    const node = new TransformNode('arena3_me_body', scene);
    const body = world.addPlayer('me', node);
    const view = new TransformNode('arena3_me_view', scene);
    const char = await CharacterPipeline.spawnPlayer(scene, DUNK_CONFIG.heroUrl, { position: Vector3.Zero(), yawRad: 0, startClip: 'bball_idle_stand', modeId: ARENA_3PT_MODE_ID }).catch(() => null);
    if (scene.isDisposed) { world.dispose(); return; }
    if (char) { installSafePlay(char.animator, ARENA_3PT_MODE_ID); char.root.parent = view; char.root.position.set(0, 0, 0); char.root.rotation.set(0, 0, 0); char.root.rotationQuaternion = null; }
    const S: St = {
      scene, world, court, pool, poolNext: 0, racks, node, body, view, char, head: char ? boneNode(char.skeleton, 'Head') : null,
      yaw: 0, clip: '', rack: 0, inRack: 0, inHand: -1, shot: null, moveT: 0, clock: CONTEST_SEC, started: false, done: false, doneT: 0,
      score: 0, makes: 0, shots: 0, t: 0, rng: seeded(0x3a7e3), input: { rx: 0, ry: 0 },
      pov: { on: false, view: { yaw: 0, pitch: 0, bobPhase: 0 }, savedFov: ctx.camera.fov }, camModeSeen: ctx.camDirector.mode,
      banner: '', bannerT: 0, timing: '', hudKey: '', scriptOffset: null, disposed: false,
    };
    states.set(scene, S); current = S;
    reset(S);
    view.position.copyFrom(node.position); view.rotation.y = S.yaw;
    ctx.heroRef.current = view;
    ctx.objectiveRef.current = RIM_VEC();
    ctx.camDirector.snapTo(node.position, RIM_VEC());
    scene.onDisposeObservable.addOnce(() => close(scene));
    if (typeof window !== 'undefined' && devOrAgentHooks()) {
      (window as unknown as { __ARENA3__?: unknown }).__ARENA3__ = {
        state: () => ({ score: S.score, makes: S.makes, shots: S.shots, rack: S.rack, inRack: S.inRack, clock: S.clock, done: S.done, pov: S.pov.on, timing: S.timing }),
        /** The next ball, released at the top of the jump plus `sec`. */
        shoot: (sec: number) => { S.scriptOffset = sec; pick(S); return S.shot !== null; },
        pov: () => togglePov(ctx, S),
      };
    }
  },

  onInput(ctx: ModeContext, e: FelInput) {
    const S = states.get(ctx.scene);
    if (!S) return;
    if (e.t === 'stick' && e.side === 'R') { S.input.rx = e.x; S.input.ry = e.y; return; }
    if (e.t !== 'button') return;
    if (e.btn === 'X' || e.btn === 'A') {
      if (e.pressed) pick(S);
      else if (S.shot) S.shot.wantRelease = true;
    }
  },

  update(ctx: ModeContext, dt: number) {
    const S = states.get(ctx.scene);
    if (!S || S.disposed) return;
    S.t += dt;
    S.world.step(dt, (h) => {
      if (S.body.grounded) S.body.drive(0, 0, h);
      if (S.inHand >= 0) S.pool[S.inHand].ball.hold(S.shot?.jumped || (S.shot && S.shot.t > 0.05) ? setPoint(p3(S.node.position), S.yaw) : chestPoint(p3(S.node.position), S.yaw));
    }, (h) => {
      for (const pb of S.pool) {
        if (!pb.live) continue;
        const now = p3(pb.ball.pos);
        if (pb.sensor.step(pb.prev, now, h) === 'make') {
          S.score += pb.pts; S.makes++;
          SoundKit.play('swish', { volume: 0.7 });
          say(S, pb.pts === 2 ? '+2' : '+1', 0.8);
        }
        pb.prev = now;
      }
    });
    // the jump shot
    if (S.shot) {
      S.shot.t += dt;
      if (!S.shot.jumped && S.shot.t >= GATHER_SEC) { S.body.jump(jumpVy()); S.shot.jumped = true; S.shot.t = 0; }
      if (S.shot?.jumped) {
        const sinceTop = S.shot.t - jumpVy() / G;
        if (S.scriptOffset !== null && sinceTop >= S.scriptOffset) { S.scriptOffset = null; release(S); }
        else if (S.shot.wantRelease) release(S);
        else if (S.shot.t > 0.15 && S.body.grounded) release(S);
      }
    }
    // to the next rack
    if (S.moveT > 0) { S.moveT -= dt; if (S.moveT <= 0 && S.body.grounded) toRack(S, S.rack + 1); else if (S.moveT <= 0) S.moveT = 0.05; }
    // the clock and the end
    if (S.started && !S.done) {
      S.clock = Math.max(0, S.clock - dt);
      if (S.clock <= 0 || (S.shots >= RACKS.length * BALLS_PER_RACK && S.pool.every((pb) => !pb.live || pb.ball.pos.y < 0.5))) {
        S.done = true; S.doneT = 0;
        say(S, `Final: ${S.score} (${S.makes} of ${S.shots})`, 4);
      }
    }
    if (S.done) { S.doneT += dt; if (S.doneT > 4.5) reset(S); }
    for (const pb of S.pool) if (pb.live && pb.ball.pos.y < 0.2 && pb.ball.vel(TMP).length() < 0.3) pb.live = false;
    // the body drawn
    S.yaw = S.pov.on ? S.pov.view.yaw : S.yaw;
    S.view.position.copyFrom(S.node.position); S.view.rotation.y = S.yaw;
    if (!S.shot && S.body.grounded) playClip(S, 'bball_idle_stand');
    camera(ctx, S, dt);
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }
    const clock = Math.ceil(S.clock);
    const key = `${S.score}|${clock}|${S.banner}|${S.timing}|${S.pov.on}`;
    if (key !== S.hudKey) {
      S.hudKey = key;
      ctx.setHud({ arenaScore: `${S.score}`, arenaClock: clock, arenaBanner: S.banner, arenaTiming: S.timing, arenaPov: S.pov.on ? 1 : 0, arenaRack: `${S.rack + 1}/${RACKS.length}` });
    }
  },

  dispose() {
    if (current && current.scene.isDisposed) close(current.scene);
  },
};

/** The contest's counters for a scene (the headless test reads them). */
export function arena3Stats(scene: Scene): { score: number; makes: number; shots: number; done: boolean } | null {
  const S = states.get(scene);
  return S ? { score: S.score, makes: S.makes, shots: S.shots, done: S.done } : null;
}

function close(scene: Scene): void {
  const S = states.get(scene);
  if (!S || S.disposed) return;
  S.disposed = true;
  S.world.dispose();
  S.court.dispose();
  states.delete(scene);
  if (current === S) current = null;
  if (typeof window !== 'undefined') delete (window as unknown as { __ARENA3__?: unknown }).__ARENA3__;
}
