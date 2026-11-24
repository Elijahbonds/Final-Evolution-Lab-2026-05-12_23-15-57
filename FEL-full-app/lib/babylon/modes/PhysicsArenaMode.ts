// PhysicsArenaMode — the Physics Arena, slice 1: basketball 1v1 played on real physics (owner 2026-11-23: "Make there be a live
// physics play arena for the sport modes.- all the modes can be played physics based. And POV-"; docs/PHYSICS-ARENA-PLAN.md).
//
// What is physics here, all of it on Havok through lib/babylon/arena (the shared core the next modes reuse):
//   THE BALL   a Havok sphere with a basketball's mass, bounce and spin. Nothing moves it but forces, contacts and the hands' pushes.
//   THE HOOP   the ring as solid iron, the glass, the bracket, the pole; the net slows what passes through it.
//   THE BODIES two upright capsules that collide: a drive into a set body costs momentum; a ball that hits a body comes off it.
//   THE HANDS  a dribble is a push down that must come back to the hand (dribble.ts): a hard cut, a body in the way or a poke and
//              the handle is lost; a shot is the throw the hand meant plus part of the body's own rise or fall at the release
//              (shotModel.ts: let go at the top of the jump and it flies true); a pass is a throw to the other body's chest.
//   THE SCORE  the ball through the hoop (hoopSensor.ts), read every physics step. There is no make chance anywhere in this file.
// What is NOT physics (said plainly): the characters' animation clips are played over the capsules (no ragdoll), the rival's
// choices are rules, and its release has a human scatter (seeded) by the OPPONENT tier.
//
// POV: the camera button (SELECT / C) switches to the player's own eyes and back (cam.pov; povCamera.ts).
// Rules: half court, 1s and 2s (past the arc is 2), first to 11, make it take it, the check at the top of the key is a real pass
// each way. At 11 the game is handed to the page as a card (ctx.card, with its play log) and starts again; the page posts it as a
// run that pays XP and progress (owner 2026-11-24; arena.xpOn; the server rebuilds the score from the log: lib/sessions/arenaScore.ts).
//
// Registered in MODES, NOT in ENABLED_BABYLON_MODES: its page is /play/arena (Play's Physics Arena chip, arena.on). No shipped mode
// reads anything here.

import { MeshBuilder, PBRMaterial, Color3, TransformNode, Vector3 } from '@babylonjs/core';
import type { Scene, Mesh } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import type { CamMode } from '../core/CameraDirector';
import { CharacterPipeline } from '../core/characterPipeline';
import type { SpawnedCharacter } from '../core/CharacterLibrary';
import { installSafePlay } from '../anim/clipRegistry';
import { boneNode } from '../anim/boneLookup';
import { dressBall } from '../visual/meshyProps';
import { SoundKit } from '../audio/SoundKit';
import { runTier, type Tier } from '../core/Difficulty';
import { DUNK_CONFIG } from './modeConfigs';
import { devOrAgentHooks } from '@/lib/agentRunHooks';
import { ArenaPhysics, type ArenaHands, type ArenaPlayer } from '../arena/arenaPhysics';
import { handTargets } from '../arena/handTargets';
import { mountArenaCourt, RIM_VEC, type ArenaCourt } from '../arena/arenaCourt';
import { ARC_M, ARENA_RIM, ARENA_RIM_RADIUS, BALL_BOUNDS, BALL_R, CHECK_SPOT, COURT, RIM_FLOOR, type P3 } from '../arena/hoopGeometry';
import { HoopSensor } from '../arena/hoopSensor';
import { dunkPush, LAYUP_ARC_DEG, releaseShot } from '../arena/arenaShot';
import { passVelocity, seeded } from '../arena/shotModel';
import { chestPoint, dribbleCatch, dribbleCommit, dribbleHand, dribblePush, setPoint } from '../arena/dribble';
import { aimAssist, downSec, dunkJumpVy, dunksOn, floorBounce, foulsOn, jumpVy, knockdownsOn, knockMps, physicsHandsOn, povBobM, povEyeM, povFovDeg, povLookDegS, povOn, stepHz } from '../arena/arenaConfig';
import { ruleContact, type ContactBody, type ContactCall } from '../arena/arenaContact';
import { rule } from '../core/Ref';
import type { ArenaHoopsLog } from '@/lib/sessions/arenaScore';
import { aimYawErr, applyPov, fovForAspect, povLook, povPose, type PovView } from '../arena/povCamera';

export const ARENA_MODE_ID = 'physics_arena';
const G = 9.81;
/** First to this. */
export const ARENA_GAME_TO = 11;
/** After a basket the game stops this long before the check (s). The server's score rules lean on it (lib/sessions/arenaScore.ts
 *  ARENA_MIRRORED.scoredPauseSec: two baskets are at least this far apart on the game's clock). */
export const SCORED_PAUSE_SEC = 1.4;
/** The gather: the plant before the jump (s). */
const GATHER_SEC = 0.14;
/** A ball comes into the hands from this close (m, from the chest), not faster than this relative speed (m/s). */
const SECURE_R = 0.62, SECURE_MAX_MPS = 10;
/** The ball is held at the chest this long after a catch before the first push (s). */
const CATCH_HOLD_SEC = 0.2;
/** Jog / sprint (m/s). */
const JOG = 4.4, SPRINT = 6.0;
/** A loose ball nobody secures in this long goes back to the check (s). */
const STALL_SEC = 7;
/** The bodies' acceleration cap (m/s²) when driving: a blocked drive bleeds into the solver. */
const DRIVE_ACCEL = 30;

/** The rival by OPPONENT tier: reaction (owner 2026-10-20: 420 / 220 / 120 ms), release scatter (s, one sd), speed, poke gap,
 *  how far out he shoots. Rules and a human scatter: the outcome of every shot is still the physics'. */
export const RIVAL_BY_TIER: Record<Tier, { reactSec: number; releaseSd: number; speed: number; pokeGapSec: number; maxShotM: number }> = {
  rookie: { reactSec: 0.42, releaseSd: 0.085, speed: 4.2, pokeGapSec: 2.4, maxShotM: 5 },
  pro: { reactSec: 0.22, releaseSd: 0.06, speed: 4.8, pokeGapSec: 1.6, maxShotM: 6.5 },
  elite: { reactSec: 0.12, releaseSd: 0.04, speed: 5.3, pokeGapSec: 1.1, maxShotM: 7.2 },
};

type Who = 'me' | 'foe';
type BallState = 'held' | 'dribble' | 'flight' | 'pass' | 'loose';
type Phase = 'check' | 'live' | 'scored' | 'over';
/** A jump shot, a layup (close: a high soft arc), or a dunk (a run at the ring: the hand jams it down through). */
export type ShotKind = 'jumper' | 'layup' | 'dunk';

/** Which shot a press at this distance and speed is (arena.dunks 0: always the jump shot). */
export function shotKindFor(distM: number, speedMps: number, dunks: boolean): ShotKind {
  if (dunks && distM < 2.1 && speedMps > 2.5) return 'dunk';
  if (dunks && distM < 2.3) return 'layup';
  return 'jumper';
}

interface Athlete {
  who: Who;
  node: TransformNode;
  body: ArenaPlayer;
  /** Physics hands (arena.physicsHands, OFF by default): null without the knob. */
  hands: ArenaHands | null;
  /** A hand swinging at the ball (with physics hands): seconds left. */
  reachT: number;
  view: TransformNode;
  char: SpawnedCharacter | null;
  /** The head bone (POV's eye height), found once. */
  head: TransformNode | null;
  yaw: number;
  clip: string;
  /** A jump shot in progress: t since the gather, whether he has left the floor, a release asked for. */
  shot: { t: number; jumped: boolean; wantRelease: boolean; aiReleaseAt: number; kind: ShotKind } | null;
  /** A plain jump (rebound, contest) in progress. */
  hopT: number;
  pokeCd: number;
  /** The run the stick asks for this step (m/s, flat). */
  wish: { x: number; z: number };
  /** Dribbling: the run the last push committed to (a cut waits for the hand: dribble.ts dribbleCommit). */
  committed: { x: number; z: number };
  /** Knocked down (arena.knockdowns): seconds until he is back up. Out of the play until then. */
  downT: number;
}

interface St {
  scene: Scene;
  world: ArenaPhysics;
  court: ArenaCourt;
  ballMesh: Mesh;
  me: Athlete;
  foe: Athlete;
  sensor: HoopSensor;
  rng: ReturnType<typeof seeded>;
  tier: Tier;
  t: number;
  score: Record<Who, number>;
  phase: Phase;
  phaseT: number;
  possession: Who;
  handler: Who | null;
  ball: BallState;
  ballT: number;
  dribble: { side: 1 | -1; pushedAt: number; due: number; crossAt: number };
  lastTouch: Who | null;
  shotBy: Who | null;
  shotFromM: number;
  shotTouched: boolean;
  passTo: Who | null;
  input: { lx: number; ly: number; rx: number; ry: number; sprint: boolean };
  pov: { on: boolean; view: PovView; savedFov: number };
  camModeSeen: CamMode;
  ai: { spot: P3; since: number; reactAt: number; pokeAt: number; /** This possession he drives at the ring (a dunk or a layup, if the physics lets him). */ drive: boolean };
  banner: string;
  bannerT: number;
  timing: string;
  prevBall: P3;
  hudKey: string;
  stats: { shots: Record<Who, number>; makes: Record<Who, number>; lostHandles: number; steals: number; physMsMax: number; physMsSum: number; frames: number; blocksByHand: number;
    /** Body-on-body contacts reported, knockdowns, fouls by call (arena.knockdowns / arena.fouls), and-ones. */
    bodyHits: number; hardestHitMps: number; knockdowns: number; fouls: Record<string, number>; andOnes: number };
  /** A shooting foul whose attempt is still playing out: the fouled shooter (a make counts, a miss is his ball). */
  andOne: Who | null;
  /** This game's play log (the session's `stats.arena`: the server rebuilds the score from it) and its clock's zero. */
  game: { t0: number; log: ArenaHoopsLog };
  /** A finished game waiting to be handed to the page (ctx.card, in update()). */
  final: { won: boolean; me: number; foe: number; log: ArenaHoopsLog } | null;
  /** Probe seam: the next shot of mine releases at the top of the jump plus this (s), instead of on the button. */
  scriptOffset: number | null;
  /** Probe seam: the rival stands still and does nothing (a scripted shot measured on its own). */
  aiQuiet: boolean;
  /** The probe seam is published (dev, or an agent run on a loopback host). */
  seamOn: boolean;
  seam: Record<string, (...a: never[]) => unknown> | null;
  disposed: boolean;
}

const states = new WeakMap<Scene, St>();
let current: St | null = null;
const TMP = new Vector3(), TMP2 = new Vector3();
const p3 = (v: { x: number; y: number; z: number }): P3 => ({ x: v.x, y: v.y, z: v.z });
const flatDist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const other = (w: Who): Who => (w === 'me' ? 'foe' : 'me');
const yawTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
function slewYaw(cur: number, want: number, rate: number, dt: number): number {
  let d = want - cur;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const s = rate * dt;
  return cur + Math.max(-s, Math.min(s, d));
}

function athlete(S: St, who: Who): Athlete { return who === 'me' ? S.me : S.foe; }

function say(S: St, text: string, sec = 1.6): void { S.banner = text; S.bannerT = sec; }

// ── the ball's owners ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** `who` has the ball in his hands (a catch, a rebound, a steal, the check). */
function secure(S: St, who: Who): void {
  const before = S.possession;
  S.handler = who; S.ball = 'held'; S.ballT = 0; S.passTo = null; S.lastTouch = who;
  S.world.ball.ignore(athlete(S, who).body.bit);
  if (S.phase === 'live') {
    if (before !== who && S.shotBy && S.shotBy !== who) { say(S, who === 'me' ? 'Rebound' : 'His board'); }
    else if (before !== who) { S.stats.steals++; say(S, who === 'me' ? 'Steal' : 'Stripped'); SoundKit.play('whoosh', { volume: 0.4 }); }
    else if (S.shotBy === who) say(S, who === 'me' ? 'Offensive board' : 'He got his own miss');
  }
  S.possession = who;
  S.shotBy = null;
}

function loseBall(S: St, why: string | null): void {
  S.handler = null; S.ball = 'loose'; S.ballT = 0;
  S.world.ball.collideAll();
  if (why) say(S, why);
}

/** The check: the defender at the top of the key holds the ball; the offence stands past the arc. */
function setupCheck(S: St, offence: Who): void {
  S.phase = 'check'; S.phaseT = 0; S.possession = offence;
  const def = other(offence);
  const o = athlete(S, offence), d = athlete(S, def);
  o.body.teleport({ x: CHECK_SPOT.x, y: 0, z: CHECK_SPOT.z + 0.9 });
  d.body.teleport({ x: CHECK_SPOT.x, y: 0, z: CHECK_SPOT.z - 1.6 });
  o.yaw = Math.PI; d.yaw = 0;
  o.shot = null; d.shot = null; o.hopT = 0; d.hopT = 0; o.downT = 0; d.downT = 0; S.andOne = null;
  S.world.ball.teleport(chestPoint(p3(d.node.position), d.yaw));
  S.sensor.reset();
  S.handler = def; S.ball = 'held'; S.ballT = 0; S.shotBy = null; S.passTo = null;
  S.world.ball.ignore(d.body.bit);
  say(S, offence === 'me' ? 'Your ball. Check it up' : 'His ball. Check it to him (B)', 1.4);
}

function throwPass(S: St, from: Who, to: Who): void {
  const a = athlete(S, from), b = athlete(S, to);
  const target = chestPoint(p3(b.node.position), b.yaw);
  const ball = S.world.ball;
  ball.ignore(a.body.bit, 0.3);
  const d = flatDist(ball.pos, target);
  ball.launch(passVelocity(p3(ball.pos), target, 0.18 + d * 0.07));
  S.handler = null; S.ball = 'pass'; S.ballT = 0; S.passTo = to; S.lastTouch = from;
  SoundKit.play('whoosh', { volume: 0.25 });
}

function startDribble(S: St, who: Who): void {
  S.ball = 'dribble'; S.ballT = 0;
  push(S, athlete(S, who));
}

function push(S: St, a: Athlete): void {
  const ball = S.world.ball;
  // the outside hand when guarded (owner 2026-10-20, the hoops rule): the push goes to the hand away from a defender within reach,
  // unless the player crossed it over himself in the last second (L1)
  const d = athlete(S, other(a.who));
  if (flatDist(d.node.position, a.node.position) < 2.2 && S.t - S.dribble.crossAt > 1.0) {
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const ox = d.node.position.x - a.node.position.x, oz = d.node.position.z - a.node.position.z;
    S.dribble.side = fz * ox - fx * oz > 0 ? -1 : 1;   // he is on my right: the left hand
  }
  const hand = dribbleHand(p3(a.node.position), a.yaw, S.dribble.side);
  const v = a.body.vel(TMP);
  const pu = dribblePush(p3(ball.pos), hand, { x: v.x, y: 0, z: v.z }, BALL_R, floorBounce(), a.wish, DRIVE_ACCEL);
  ball.launch(pu.vel, pu.spin);
  a.committed.x = a.wish.x; a.committed.z = a.wish.z;
  S.dribble.pushedAt = S.t; S.dribble.due = S.t + pu.period;
}

// ── shooting ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

function startShot(S: St, a: Athlete, aiReleaseAt = Infinity): void {
  if (S.handler !== a.who || a.shot || a.downT > 0 || (S.ball !== 'dribble' && S.ball !== 'held')) return;
  S.ball = 'held'; S.ballT = 0;
  const v = a.body.vel(TMP);
  const kind = shotKindFor(flatDist(a.node.position, RIM_FLOOR), Math.hypot(v.x, v.z), dunksOn());
  a.shot = { t: 0, jumped: false, wantRelease: false, aiReleaseAt, kind };
  a.yaw = S.pov.on && a.who === 'me' ? S.pov.view.yaw : yawTo(a.node.position, ARENA_RIM);
  playClip(a, kind === 'dunk' ? 'bball_layup_gather' : 'bball_shoot_jumper', false);
}

function release(S: St, a: Athlete): void {
  if (!a.shot) return;
  const ball = S.world.ball;
  const v = a.body.vel(TMP);
  const yawErr = S.pov.on && a.who === 'me' ? aimYawErr(S.pov.view.yaw, p3(a.node.position), ARENA_RIM, aimAssist()) : 0;
  // the release against the top of the jump: a body still rising at vy is vy/g early, a falling one late (ballistic, exact)
  const ms = Math.round(((a.shot.jumped ? -v.y : -jumpVy()) / G) * 1000);
  const kind = a.shot.kind;
  if (kind === 'dunk') { ball.ignore(a.body.bit, 0.35); ball.launch(dunkPush(p3(ball.pos))); }
  else releaseShot(ball, a.body.bit, { x: v.x, y: a.shot.jumped ? v.y : jumpVy(), z: v.z }, S.rng.normal, yawErr, kind === 'layup' ? LAYUP_ARC_DEG : undefined);
  S.handler = null; S.ball = 'flight'; S.ballT = 0; S.shotBy = a.who; S.shotTouched = false; S.lastTouch = a.who;
  S.shotFromM = flatDist(a.node.position, RIM_FLOOR);
  S.stats.shots[a.who]++;
  S.sensor.reset();
  a.shot = null;
  const label = ms < -35 ? 'early' : ms > 35 ? 'late' : 'on time';
  if (a.who === 'me') S.timing = kind === 'dunk' ? 'dunk' : `${kind === 'layup' ? 'layup, ' : ''}${label} ${ms > 0 ? '+' : ''}${ms} ms`;
  SoundKit.play('whoosh', { volume: 0.3 });
}

// ── the frame ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

function playClip(a: Athlete, clip: string, loop = true): void {
  if (!a.char || a.clip === clip) return;
  a.clip = clip;
  a.char.animator.play(clip, { loop, fadeSec: 0.15 });
}

function myWish(ctx: ModeContext, S: St): { x: number; z: number } {
  const { lx, ly, rx, ry } = S.input;
  if (Math.hypot(lx, ly) < 0.15) return { x: 0, z: 0 };
  let fx: number, fz: number, rxv: number, rzv: number;
  if (S.pov.on) {
    fx = Math.sin(S.pov.view.yaw); fz = Math.cos(S.pov.view.yaw); rxv = fz; rzv = -fx;
  } else {
    const w = ctx.camDirector.stickWorldLatched(lx, ly, 0.15, Math.hypot(rx, ry) > 0.2);
    const sp = S.input.sprint ? SPRINT : JOG;
    return { x: w.x * sp, z: w.z * sp };
  }
  const sp = S.input.sprint ? SPRINT : JOG;
  return { x: (fx * -ly + rxv * lx) * sp, z: (fz * -ly + rzv * lx) * sp };
}

/** Keep a body on the court: a wish that leaves it is turned back at the line. */
function keepIn(p: { x: number; z: number }, w: { x: number; z: number }): { x: number; z: number } {
  let { x, z } = w;
  if (p.x < COURT.minX && x < 0) x = 1.5; if (p.x > COURT.maxX && x > 0) x = -1.5;
  if (p.z < COURT.minZ && z < 0) z = 1.5; if (p.z > COURT.maxZ && z > 0) z = -1.5;
  return { x, z };
}

function foeWish(S: St): { x: number; z: number } {
  const f = S.foe, me = S.me, prof = RIVAL_BY_TIER[S.tier];
  const fp = f.node.position;
  let tx = fp.x, tz = fp.z, speed = prof.speed;
  if (S.phase === 'check' || S.aiQuiet) return { x: 0, z: 0 };
  if (S.handler === 'foe') {
    tx = S.ai.spot.x; tz = S.ai.spot.z; speed = prof.speed * (S.ai.drive ? 1.1 : 0.8);
  } else if (S.handler === 'me') {
    // between me and the ring, 1.25 m off me
    const mp = me.node.position;
    const dx = ARENA_RIM.x - mp.x, dz = ARENA_RIM.z - mp.z, d = Math.hypot(dx, dz) || 1;
    tx = mp.x + (dx / d) * 1.25; tz = mp.z + (dz / d) * 1.25;
  } else {
    // a loose ball: where it is going
    const bp = S.world.ball.pos, bv = S.world.ball.vel(TMP2);
    tx = bp.x + bv.x * 0.3; tz = bp.z + bv.z * 0.3;
    if (S.ball === 'flight' && S.shotBy === 'foe') { tx = (tx + ARENA_RIM.x) / 2; tz = (tz + ARENA_RIM.z) / 2 + 1; }
  }
  const dx = tx - fp.x, dz = tz - fp.z, d = Math.hypot(dx, dz);
  if (d < 0.15) return { x: 0, z: 0 };
  const k = Math.min(1, d / 0.8) * speed / d;
  let wx = dx * k, wz = dz * k;
  // with the ball he goes round a body in his path rather than into it (a dribble run into a body loses the ball, in the physics)
  if (S.handler === 'foe') {
    const mp = me.node.position, ox = mp.x - fp.x, oz = mp.z - fp.z, od = Math.hypot(ox, oz);
    const ahead = (ox * dx + oz * dz) / (od * d || 1);
    if (od < 1.6 && ahead > 0.3) {
      const side = ox * dz - oz * dx > 0 ? 1 : -1;   // step to the side the body is not on
      const px = (-dz / d) * side, pz = (dx / d) * side;
      const push = speed * (1 - od / 1.6) * 1.4;
      wx += px * push; wz += pz * push;
      const n = Math.hypot(wx, wz); if (n > speed) { wx *= speed / n; wz *= speed / n; }
    }
  }
  return { x: wx, z: wz };
}

function beforeStep(ctx: ModeContext, S: St, h: number): void {
  const ball = S.world.ball;
  // bodies
  for (const a of [S.me, S.foe]) {
    let w = a.who === 'me' ? myWish(ctx, S) : foeWish(S);
    if (S.phase === 'check' || a.downT > 0 || (a.shot && !a.shot.jumped && a.shot.kind !== 'dunk')) w = { x: 0, z: 0 };   // planted for the check and the gather (a dunk keeps its run); a body on the floor does not run
    w = keepIn(a.node.position, w);
    a.wish.x = w.x; a.wish.z = w.z;
    // a dribbler's change of run waits for the hand (at most a bounce; measured ~50 ms on a cut), so the ball is never left behind
    const drive = S.handler === a.who && S.ball === 'dribble' && dribbleCommit(a.committed, w).changing ? a.committed : w;
    if (a.body.grounded) a.body.drive(drive.x, drive.z, h, a.shot ? 40 : DRIVE_ACCEL);
    if (a.hands) {
      const tg = handTargets({
        feet: p3(a.node.position), yaw: a.yaw, ball: p3(S.world.ball.pos), dribbleSide: S.dribble.side,
        role: a.downT > 0 ? 'rest' : a.shot ? 'shoot' : S.handler === a.who ? (S.ball === 'dribble' ? 'dribble' : 'hold') : a.reachT > 0 ? 'reach' : a.hopT > 0 ? 'contest' : S.handler ? 'guard' : 'rest',
      });
      a.hands.target(tg.left, tg.right, a.reachT > 0);
    }
  }
  // the ball in hand
  if (S.handler && S.ball === 'held') {
    const a = athlete(S, S.handler);
    const at = a.shot?.kind === 'dunk' ? dunkHold(a) : a.shot ? setPoint(p3(a.node.position), a.yaw, a.shot.kind === 'layup' ? 2.2 : 2.3) : chestPoint(p3(a.node.position), a.yaw);
    ball.hold(at);
  } else if (S.handler && S.ball === 'dribble') {
    const a = athlete(S, S.handler);
    const hand = dribbleHand(p3(a.node.position), a.yaw, S.dribble.side);
    const bp = ball.pos, bv = ball.vel(TMP2);
    // a change waiting (the stick), or the body knocked off the run it committed to (a collision): the hand takes the ball where it can
    const bvNow = a.body.vel(TMP);
    const changing = dribbleCommit(a.committed, a.wish).changing || dribbleCommit(a.committed, { x: bvNow.x, z: bvNow.z }).changing;
    if (S.t > S.dribble.pushedAt + 0.1 && dribbleCatch(p3(bp), p3(bv), p3(a.node.position), hand, changing)) push(S, a);
    else if (S.t > S.dribble.due + 0.45 || flatDist(bp, a.node.position) > 1.6) {
      S.stats.lostHandles++;
      loseBall(S, a.who === 'me' ? 'Lost the handle' : 'He lost it');
    }
  }
}

function afterStep(S: St, h: number): void {
  const b = S.world.ball.pos;
  const now = { x: b.x, y: b.y, z: b.z };
  if (S.sensor.step(S.prevBall, now, h) === 'make' && (S.ball === 'flight' || S.ball === 'loose') && S.phase === 'live') {
    const who = S.shotBy ?? S.lastTouch ?? 'me';
    const pts = S.shotBy && S.shotFromM > ARC_M ? 2 : 1;
    S.score[who] += pts;
    S.stats.makes[who]++;
    S.game.log.baskets.push({ t: S.t - S.game.t0, side: who, shot: !!S.shotBy, fromM: S.shotBy ? S.shotFromM : 0 });
    S.possession = who;   // make it take it: the scorer checks it again
    S.phase = 'scored'; S.phaseT = 0;
    say(S, `${who === 'me' ? 'Bucket' : 'He scores'} +${pts}`, 1.4);
    if (S.andOne === who) { S.stats.andOnes++; say(S, `${rule('and_one').call} +${pts}`, 1.4); }   // fouled and it went in: the basket counts (no free throws here)
    S.andOne = null;
    SoundKit.play('swish', { volume: 0.7 });
    if (S.score[who] >= ARENA_GAME_TO) {
      S.phase = 'over'; S.phaseT = 0; say(S, `${who === 'me' ? 'You win' : 'He wins'} ${S.score.me}–${S.score.foe}`, 3);
      S.final = { won: who === 'me', me: S.score.me, foe: S.score.foe, log: S.game.log };
    }
  }
  S.prevBall = now;
}

function frameRules(ctx: ModeContext, S: St, dt: number): void {
  const ball = S.world.ball;
  S.phaseT += dt; S.ballT += dt;
  bodyContacts(S);
  // a shooting foul's attempt is over and missed (loose, or in someone's hands, or the shot never left): the shooter's ball
  if (S.andOne && S.phase === 'live' && S.ball !== 'flight' && !athlete(S, S.andOne).shot) deadBall(S, S.andOne, rule('shooting_foul').call);
  for (const c of S.world.drainContacts()) {
    if (S.ball === 'flight' && c.surface !== 'body') S.shotTouched = true;
    if (c.surface === 'body' && c.playerId) S.lastTouch = c.playerId as Who;
    // a physics hand on the ball: a dribble knocked loose, a shot touched (a block when it is the other side's hand)
    if (c.hand && S.ball === 'dribble' && S.handler && c.playerId !== S.handler) loseBall(S, c.playerId === 'me' ? 'Poked it' : 'He poked it');
    if (c.hand && S.ball === 'flight' && S.shotBy && c.playerId !== S.shotBy) { S.stats.blocksByHand++; say(S, c.playerId === 'me' ? 'Blocked' : 'Got blocked'); }
    if (c.impulse > 0.4) {
      if (c.surface === 'rim') SoundKit.play('rattle', { volume: Math.min(0.6, 0.15 + c.impulse * 0.1) });
      else if (c.surface === 'board') SoundKit.play('thud', { volume: Math.min(0.5, 0.1 + c.impulse * 0.08) });
      else if (c.surface === 'floor' && S.ball !== 'dribble') SoundKit.play('bounce', { volume: Math.min(0.4, 0.05 + c.impulse * 0.05) });
    }
    if (S.ball === 'flight' && c.surface === 'floor') S.ball = 'loose';
  }
  if (S.ball === 'flight' && S.shotTouched && S.phase === 'live' && ball.pos.y < ARENA_RIM.y - 0.6) S.ball = 'loose';

  // the check: the defender passes it in; the offence's catch makes it live
  if (S.phase === 'check') {
    const def = other(S.possession);
    if (S.ball === 'held' && S.handler === def && def === 'foe' && S.phaseT > 0.8) throwPass(S, 'foe', 'me');
    if (S.ball === 'held' && S.handler === def && def === 'me' && S.phaseT > 2.5) throwPass(S, 'me', 'foe');   // B, or on its own
  }
  if (S.phase === 'scored' && S.phaseT > SCORED_PAUSE_SEC) setupCheck(S, S.possession);
  if (S.phase === 'over' && S.phaseT > 3) { S.score.me = 0; S.score.foe = 0; S.game = { t0: S.t, log: { v: 1, baskets: [] } }; setupCheck(S, 'me'); }

  // catches: a pass to its receiver, a loose ball or a shot to whoever gets a hand on it
  if (S.ball === 'pass' || S.ball === 'loose' || S.ball === 'flight') {
    const bv = ball.vel(TMP2);
    for (const a of [S.me, S.foe]) {
      if (S.ball === 'flight' && !S.shotTouched && !(bv.y < 0 && ball.pos.y < 2.6)) continue;   // a shot on its way up is nobody's
      if (S.phase === 'scored') continue;
      if (a.downT > 0) continue;   // on the floor: not his ball to catch
      if (ball.ignoring & a.body.bit) continue;
      const c = chestPoint(p3(a.node.position), a.yaw);
      const reachTop = a.node.position.y + 2.45;
      const dh = flatDist(ball.pos, a.node.position);
      const near = Math.hypot(ball.pos.x - c.x, ball.pos.y - c.y, ball.pos.z - c.z) < SECURE_R || (dh < 0.55 && ball.pos.y < reachTop && ball.pos.y > a.node.position.y + 0.3);
      const av = a.body.vel(TMP);
      const rel = Math.hypot(bv.x - av.x, bv.y - av.y, bv.z - av.z);
      if (near && rel < SECURE_MAX_MPS) {
        const wasCheck = S.phase === 'check';
        secure(S, a.who);
        if (wasCheck && a.who === S.possession) { S.phase = 'live'; S.phaseT = 0; }
        if (a.who === 'foe') { S.ai.since = 0; pickSpot(S); }
        break;
      }
    }
  }
  // held at the chest after a catch: the first push
  // (a board taken in the air comes down in the hands: the first push waits for the feet)
  if (S.ball === 'held' && S.handler && S.phase === 'live' && !athlete(S, S.handler).shot && S.ballT > CATCH_HOLD_SEC && athlete(S, S.handler).body.grounded) startDribble(S, S.handler);

  // out of bounds: a ball low enough to touch the floor past the lines; the other side's ball at the check
  if (S.phase === 'live' && S.ball !== 'held' && S.ball !== 'dribble' && ball.pos.y < 0.5) {
    const p = ball.pos;
    if (p.x < BALL_BOUNDS.minX || p.x > BALL_BOUNDS.maxX || p.z < BALL_BOUNDS.minZ || p.z > BALL_BOUNDS.maxZ) {
      const to = S.lastTouch ? other(S.lastTouch) : other(S.possession);
      say(S, 'Out of bounds', 1.2);
      SoundKit.play('whistle', { volume: 0.4 });
      setupCheck(S, to);
      return;
    }
  }
  if (S.phase === 'live' && S.ball === 'loose' && S.ballT > STALL_SEC) setupCheck(S, S.possession);
  if (S.phase === 'live' && S.ball === 'dribble' && S.handler) {
    const hp = athlete(S, S.handler).node.position;
    if (hp.x < BALL_BOUNDS.minX || hp.x > BALL_BOUNDS.maxX || hp.z < BALL_BOUNDS.minZ || hp.z > BALL_BOUNDS.maxZ) { say(S, 'Out of bounds', 1.2); setupCheck(S, other(S.handler)); }
  }
}

// ── contact: knockdowns and fouls (arena.knockdowns, arena.fouls; both OFF by default) ─────────────────────────────────────────

/** The get-up clip is the last this long of a knockdown (s). */
const GET_UP_SEC = 0.45;

function contactBody(S: St, a: Athlete): ContactBody {
  const v = a.body.lastVel;
  return { id: a.who, side: a.who, airborne: !a.body.grounded, shooting: !!a.shot || (S.shotBy === a.who && S.ball === 'flight' && !a.body.grounded), speed: Math.hypot(v.x, v.z), hasBall: S.handler === a.who };
}

function bodyContacts(S: St): void {
  const hits = S.world.drainBodyContacts();
  for (const c of hits) { S.stats.bodyHits++; S.stats.hardestHitMps = Math.max(S.stats.hardestHitMps, c.closingSpeed); }
  const kd = knockdownsOn(), fl = foulsOn();
  if (!kd && !fl) return;   // both OFF: the bodies only push (today's arena exactly)
  for (const c of hits) {
    if (S.phase !== 'live') return;
    const att = athlete(S, c.attacker as Who), vic = athlete(S, c.victim as Who);
    if (att.downT > 0 || vic.downT > 0) continue;   // a body already on the floor
    const r = ruleContact(c, contactBody(S, att), contactBody(S, vic), { knockdowns: kd, fouls: fl, knockMps: knockMps(), offense: S.possession, looseBall: !S.handler && S.ball !== 'pass' });
    if (r.down) knockDown(S, athlete(S, r.down as Who), c.closingSpeed);
    if (r.foul) { whistle(S, r.foul); return; }
  }
}

/** Put a body on the floor: the shot he was in is gone, a ball in his hands comes out with his body's speed. */
function knockDown(S: St, a: Athlete, mps: number): void {
  a.downT = downSec(); a.shot = null; a.hopT = 0; a.reachT = 0;
  S.stats.knockdowns++;
  if (S.handler === a.who) {
    const v = a.body.lastVel;
    loseBall(S, null);
    S.world.ball.launch({ x: v.x * 0.8, y: 0.6, z: v.z * 0.8 });
  }
  playClip(a, 'karate_knockdown', false);
  say(S, a.who === 'me' ? 'Knocked down' : 'He went down', 1.2);
  SoundKit.play('impact', { volume: Math.min(0.6, 0.2 + mps * 0.05) });
}

/** The referee's call (core/Ref.ts). A shooting foul lets the attempt play out; every other call is a dead ball to the check. */
function whistle(S: St, f: ContactCall): void {
  S.stats.fouls[f.id] = (S.stats.fouls[f.id] ?? 0) + 1;
  SoundKit.play('whistle', { volume: 0.45 });
  const shooter = athlete(S, f.on as Who);
  if (f.id === 'shooting_foul' && (shooter.shot || (S.ball === 'flight' && S.shotBy === shooter.who))) { S.andOne = shooter.who; say(S, f.call.banner, 1.2); return; }
  deadBall(S, (f.call.ball ?? S.possession) as Who, f.call.banner);
}

/** Play stops: the ball goes to `to` at the check (through the scored phase's pause, so the knockdown is seen before the reset). */
function deadBall(S: St, to: Who, banner: string): void {
  S.andOne = null;
  if (S.handler) loseBall(S, null);
  S.possession = to;
  S.phase = 'scored'; S.phaseT = 0.2;
  say(S, `${banner}. ${to === 'me' ? 'Your ball' : 'His ball'}`, 1.4);
}

function pickSpot(S: St): void {
  const prof = RIVAL_BY_TIER[S.tier];
  const a = (S.rng.next() * 2 - 1) * 1.2;
  // a quarter of his possessions (with arena.dunks on) he drives at the ring: what comes of it is the physics' (a body in the lane)
  S.ai.drive = dunksOn() && S.rng.next() < 0.25;
  const d = S.ai.drive ? 0.6 : 2.6 + S.rng.next() * (prof.maxShotM - 2.6);
  S.ai.spot = { x: ARENA_RIM.x + Math.sin(a) * d, y: 0, z: ARENA_RIM.z + Math.cos(a) * d };
}

function shotsAndJumps(S: St, dt: number): void {
  const prof = RIVAL_BY_TIER[S.tier];
  for (const a of [S.me, S.foe]) {
    if (a.pokeCd > 0) a.pokeCd -= dt;
    if (a.reachT > 0) a.reachT -= dt;
    if (a.hopT > 0) a.hopT += dt;
    if (a.hopT > 0.2 && a.body.grounded) a.hopT = 0;
    if (a.downT > 0) {
      const was = a.downT;
      a.downT = Math.max(0, a.downT - dt);
      if (was > GET_UP_SEC && a.downT <= GET_UP_SEC) playClip(a, 'karate_get_up', false);
      else if (was > a.downT && a.downT > GET_UP_SEC && a.clip === 'karate_knockdown' && downSec() - a.downT > 0.6) playClip(a, 'karate_floor_hold');
    }
    if (!a.shot) continue;
    a.shot.t += dt;
    if (!a.shot.jumped && a.shot.t >= GATHER_SEC) { a.body.jump(a.shot.kind === 'dunk' ? dunkJumpVy() : jumpVy()); a.shot.jumped = true; a.shot.t = 0; }
    if (a.shot.jumped && a.shot.kind === 'dunk') {
      // the jam: on the button's release, or by itself once the ball is over the ring's plane and over the ring, or at the landing
      const b = S.world.ball.pos;
      const over = b.y > ARENA_RIM.y + BALL_R + 0.06 && flatDist(b, ARENA_RIM) < 0.5;
      if (a.shot.wantRelease || over || (a.shot.t > 0.2 && a.body.grounded)) release(S, a);
    } else if (a.shot.jumped) {
      const vy = a.body.vel(TMP).y;
      const sinceTop = a.shot.t - jumpVy() / G;
      if (a.who === 'foe' && sinceTop >= a.shot.aiReleaseAt) release(S, a);
      else if (a.who === 'me' && S.scriptOffset !== null && sinceTop >= S.scriptOffset) { S.scriptOffset = null; release(S, a); }
      else if (a.shot.wantRelease) release(S, a);
      else if (a.shot.t > 0.15 && a.body.grounded && vy <= 0) { release(S, a); }   // never let go: it leaves on the landing (very late)
    }
  }
  // the rival
  const f = S.foe, me = S.me, ball = S.world.ball;
  S.ai.since += dt;
  if (S.phase !== 'live' || S.aiQuiet || f.downT > 0) return;
  if (S.handler === 'foe' && !f.shot && (S.ball === 'dribble' || S.ball === 'held')) {
    const atSpot = flatDist(f.node.position, S.ai.spot) < 0.6;
    const open = flatDist(f.node.position, me.node.position) > 2.2 && flatDist(f.node.position, RIM_FLOOR) < prof.maxShotM;
    const rimD = flatDist(f.node.position, RIM_FLOOR);
    if (S.ai.drive) { if (S.ai.since > 0.6 && (rimD < 1.8 || S.ai.since > 4)) startShot(S, f, S.rng.normal() * prof.releaseSd); }
    else if (S.ai.since > 0.8 && (atSpot || S.ai.since > 3.5 || (open && S.ai.since > 1.5))) startShot(S, f, S.rng.normal() * prof.releaseSd);
  }
  // his contest jump on my shot, after his reaction time
  if (me.shot && f.hopT === 0 && f.body.grounded && flatDist(me.node.position, f.node.position) < 2.2) {
    if (S.ai.reactAt === 0) S.ai.reactAt = S.t + prof.reactSec;
    if (S.t >= S.ai.reactAt) { f.body.jump(jumpVy() * 0.95); f.hopT = 0.001; S.ai.reactAt = 0; }
  } else if (!me.shot) S.ai.reactAt = 0;
  // his poke on my dribble: only when the ball is nearer his hand than mine
  if (S.handler === 'me' && S.ball === 'dribble' && f.pokeCd <= 0 && ball.pos.y < 1.3) {
    const fh = chestPoint(p3(f.node.position), f.yaw), mh = dribbleHand(p3(me.node.position), me.yaw, S.dribble.side);
    const dF = Math.hypot(ball.pos.x - fh.x, ball.pos.z - fh.z), dM = Math.hypot(ball.pos.x - mh.x, ball.pos.z - mh.z);
    if (dF < 0.85 && dF < dM - 0.1 && !shielded(S, f)) { poke(S, f); f.pokeCd = prof.pokeGapSec; }
  }
  // his rebound jump: under a falling ball
  if (!S.handler && f.hopT === 0 && f.body.grounded && ball.vel(TMP2).y < 0 && ball.pos.y > 2.0 && ball.pos.y < 3.1 && flatDist(ball.pos, f.node.position) < 0.9) {
    f.body.jump(jumpVy() * 0.9); f.hopT = 0.001;
  }
}

/** The handler's body is between the reacher and the ball (the outside hand's whole point): a reach through him meets him, not it. */
function shielded(S: St, reacher: Athlete): boolean {
  if (!S.handler) return false;
  const h = athlete(S, S.handler).node.position, r = reacher.node.position, b = S.world.ball.pos;
  return flatDist(b, r) > flatDist(h, r) + 0.05;
}

/** The dunk's hold: both hands over the head, reaching toward the ring as the body rises. */
function dunkHold(a: Athlete): P3 {
  const p = a.node.position;
  const dx = ARENA_RIM.x - p.x, dz = ARENA_RIM.z - p.z, d = Math.hypot(dx, dz) || 1;
  const reach = Math.min(0.55, d);
  return { x: p.x + (dx / d) * reach, y: p.y + 2.45, z: p.z + (dz / d) * reach };
}

/** A hand on the ball: knocked away from the handler (an impulse at the ball; where it goes is the physics'). */
function poke(S: St, a: Athlete): void {
  if (a.hands) { a.reachT = 0.18; return; }   // physics hands: the hand swings at the ball; the contact decides
  const ball = S.world.ball;
  const h = S.handler ? athlete(S, S.handler) : null;
  const from = h ? h.node.position : a.node.position;
  const dx = ball.pos.x - from.x, dz = ball.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
  const v = ball.vel(TMP2);
  loseBall(S, a.who === 'me' ? 'Poked it' : 'He poked it');
  ball.launch({ x: v.x * 0.3 + (dx / d) * 2.4 + Math.sin(a.yaw) * 0.8, y: Math.max(1.4, v.y * 0.2 + 1.6), z: v.z * 0.3 + (dz / d) * 2.4 + Math.cos(a.yaw) * 0.8 });
  S.lastTouch = a.who;
  SoundKit.play('impact', { volume: 0.25 });
}

function facing(ctx: ModeContext, S: St, dt: number): void {
  for (const a of [S.me, S.foe]) {
    const v = a.body.vel(TMP);
    const sp = Math.hypot(v.x, v.z);
    let want = a.yaw;
    if (a.downT > 0) want = a.yaw;
    else if (a.who === 'me' && S.pov.on) want = S.pov.view.yaw;
    else if (a.shot) want = yawTo(a.node.position, ARENA_RIM);
    else if (S.phase === 'check') want = yawTo(a.node.position, athlete(S, other(a.who)).node.position);
    else if (S.handler && S.handler !== a.who) want = yawTo(a.node.position, athlete(S, S.handler).node.position);
    else if (sp > 0.6) want = Math.atan2(v.x, v.z);
    else if (S.handler === a.who) want = yawTo(a.node.position, ARENA_RIM);
    a.yaw = a.who === 'me' && S.pov.on ? want : slewYaw(a.yaw, want, 9, dt);
    a.view.position.copyFrom(a.node.position);
    a.view.rotation.y = a.yaw;
    // the clip over the capsule
    if (a.downT > 0) continue;   // the knockdown, the floor and the get-up play out (shotsAndJumps)
    if (a.shot || (!a.body.grounded && a.clip === 'bball_shoot_jumper')) continue;   // the follow-through holds until he lands
    const hasBall = S.handler === a.who && S.ball === 'dribble';
    const clip = hasBall
      ? (sp > 4.8 ? 'bball_dribble_run' : sp > 2.2 ? 'bball_dribble_jog' : sp > 0.5 ? 'bball_dribble_walk' : 'bball_dribble_idle')
      : S.handler && S.handler !== a.who ? (sp > 3 ? 'run' : 'bball_defend_stance')
        : sp > 3 ? 'run' : sp > 0.5 ? 'walk' : 'bball_idle_stand';
    playClip(a, clip);
  }
  void ctx;
}

function togglePov(ctx: ModeContext, S: St): void {
  const on = !S.pov.on;
  S.pov.on = on;
  ctx.camDirector.suspended = on;
  const meshes = S.me.char?.meshes ?? [];
  for (const m of meshes) m.isVisible = !on;
  if (on) {
    S.pov.savedFov = ctx.camera.fov;
    S.pov.view.yaw = S.me.yaw; S.pov.view.pitch = 0.08;
  } else {
    ctx.camera.fov = S.pov.savedFov;
    ctx.camera.minZ = 0.1;
    ctx.camDirector.snapTo(S.me.node.position, RIM_VEC());
  }
  say(S, on ? 'POV' : 'Court camera', 0.9);
}

function camera(ctx: ModeContext, S: St, dt: number): void {
  // SELECT / C: the director flips follow ↔ fixed; in the arena (cam.pov) that press is the POV switch instead
  if (ctx.camDirector.mode !== S.camModeSeen) {
    if (povOn()) { ctx.camDirector.mode = S.camModeSeen; togglePov(ctx, S); }
    else S.camModeSeen = ctx.camDirector.mode;
  }
  if (S.pov.on) {
    povLook(S.pov.view, S.input.rx, S.input.ry, povLookDegS(), dt);
    const v = S.me.body.vel(TMP);
    const head = S.me.head;
    const eyeY = head ? Math.min(2.1, Math.max(1.3, head.getAbsolutePosition().y - S.me.node.position.y + 0.08)) : povEyeM();
    const pose = povPose(p3(S.me.node.position), S.pov.view, eyeY, Math.hypot(v.x, v.z), povBobM(), dt);
    const aspect = ctx.scene.getEngine().getAspectRatio(ctx.camera);
    applyPov(ctx.camera, pose, fovForAspect(povFovDeg(), aspect));
    return;
  }
  ctx.camDirector.look(S.input.rx, S.input.ry, dt);
  const v = S.me.body.vel(TMP);
  ctx.camDirector.update(S.me.node.position, v, RIM_VEC());
}

function hud(ctx: ModeContext, S: St, dt: number): void {
  if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }
  const key = `${S.score.me}|${S.score.foe}|${S.banner}|${S.timing}|${S.pov.on}|${S.possession}|${S.phase}`;
  if (key === S.hudKey) return;
  S.hudKey = key;
  ctx.setHud({
    arenaScore: `${S.score.me}–${S.score.foe}`, arenaBanner: S.banner, arenaTiming: S.timing, arenaPov: S.pov.on ? 1 : 0,
    arenaPoss: S.possession, arenaPhase: S.phase,
  });
}

export const PhysicsArenaMode: ModeDefinition = {
  modeId: ARENA_MODE_ID,
  mood: 'goldenHour',
  camPreset: 'hoops',

  async load(ctx: ModeContext) {
    const scene = ctx.scene;
    const court = mountArenaCourt(scene);
    const ballMesh = MeshBuilder.CreateSphere('ball', { diameter: BALL_R * 2, segments: 16 }, scene);
    const bm = new PBRMaterial('arena_ball_mat', scene);
    bm.albedoColor = Color3.FromHexString('#e0742c'); bm.roughness = 0.7; bm.metallic = 0;
    ballMesh.material = bm;
    void dressBall(ballMesh, 'basketball');   // the Meshy ball skin rides the physics sphere (drawing only)
    const world = await ArenaPhysics.create(scene, { ballNode: ballMesh });
    if (scene.isDisposed) { world.dispose(); return; }
    const mkNode = (name: string, x: number, z: number) => { const n = new TransformNode(name, scene); n.position.set(x, 0, z); return n; };
    const meNode = mkNode('arena_me_body', CHECK_SPOT.x, CHECK_SPOT.z + 0.9), foeNode = mkNode('arena_foe_body', CHECK_SPOT.x, CHECK_SPOT.z - 1.6);
    const meBody = world.addPlayer('me', meNode), foeBody = world.addPlayer('foe', foeNode, { mass: 95 });
    const meView = new TransformNode('arena_me_view', scene), foeView = new TransformNode('arena_foe_view', scene);
    const [meChar, foeChar] = await Promise.all([
      CharacterPipeline.spawnPlayer(scene, DUNK_CONFIG.heroUrl, { position: Vector3.Zero(), yawRad: 0, startClip: 'bball_idle_stand', modeId: ARENA_MODE_ID }).catch(() => null),
      CharacterPipeline.spawnNpc(scene, DUNK_CONFIG.heroUrl, { position: Vector3.Zero(), yawRad: 0, startClip: 'bball_idle_stand', modeId: ARENA_MODE_ID, name: 'Rival' }).catch(() => null),
    ]);
    if (scene.isDisposed) { world.dispose(); return; }
    for (const [c, v] of [[meChar, meView], [foeChar, foeView]] as const) {
      if (!c) continue;
      installSafePlay(c.animator, ARENA_MODE_ID);
      c.root.parent = v; c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0); c.root.rotationQuaternion = null;
    }
    const handsOn = physicsHandsOn();
    const mk = (who: Who, node: TransformNode, body: ArenaPlayer, view: TransformNode, char: SpawnedCharacter | null): Athlete =>
      ({ who, node, body, hands: handsOn ? world.addHands(body) : null, reachT: 0, view, char, head: char ? boneNode(char.skeleton, 'Head') : null, yaw: 0, clip: '', shot: null, hopT: 0, pokeCd: 0, wish: { x: 0, z: 0 }, committed: { x: 0, z: 0 }, downT: 0 });
    const S: St = {
      scene, world, court, ballMesh, me: mk('me', meNode, meBody, meView, meChar), foe: mk('foe', foeNode, foeBody, foeView, foeChar),
      sensor: new HoopSensor(ARENA_RIM, ARENA_RIM_RADIUS), rng: seeded(0x0a7e4a), tier: runTier(), t: 0,
      score: { me: 0, foe: 0 }, phase: 'check', phaseT: 0, possession: 'me', handler: null, ball: 'held', ballT: 0,
      dribble: { side: 1, pushedAt: 0, due: 0, crossAt: -9 }, lastTouch: null, shotBy: null, shotFromM: 0, shotTouched: false, passTo: null,
      input: { lx: 0, ly: 0, rx: 0, ry: 0, sprint: false },
      pov: { on: false, view: { yaw: 0, pitch: 0, bobPhase: 0 }, savedFov: ctx.camera.fov }, camModeSeen: ctx.camDirector.mode,
      ai: { spot: { x: 0, y: 0, z: 4 }, since: 0, reactAt: 0, pokeAt: 0, drive: false },
      banner: '', bannerT: 0, timing: '', prevBall: { x: 0, y: 1, z: 6 }, hudKey: '',
      stats: { shots: { me: 0, foe: 0 }, makes: { me: 0, foe: 0 }, lostHandles: 0, steals: 0, physMsMax: 0, physMsSum: 0, frames: 0, blocksByHand: 0, bodyHits: 0, hardestHitMps: 0, knockdowns: 0, fouls: {}, andOnes: 0 },
      andOne: null, game: { t0: 0, log: { v: 1, baskets: [] } }, final: null, scriptOffset: null, aiQuiet: false, seamOn: false, seam: null, disposed: false,
    };
    states.set(scene, S); current = S;
    setupCheck(S, 'me');
    for (const a of [S.me, S.foe]) { a.view.position.copyFrom(a.node.position); a.view.rotation.y = a.yaw; }
    ctx.heroRef.current = meView;
    ctx.objectiveRef.current = RIM_VEC();
    ctx.camDirector.snapTo(meNode.position, RIM_VEC());
    scene.onDisposeObservable.addOnce(() => close(scene));
    // the probe seam (the browser rig through window.__ARENA__ on dev / agent runs; the headless test through arenaSeam)
    S.seam = {
        state: () => ({
          phase: S.phase, possession: S.possession, handler: S.handler, ball: S.ball, score: { ...S.score }, t: S.t, pov: S.pov.on,
          ballPos: p3(S.world.ball.pos), me: p3(S.me.node.position), foe: p3(S.foe.node.position), stats: JSON.parse(JSON.stringify(S.stats)),
          lastStep: { ...S.world.stats }, timing: S.timing,
        }),
        /** My next shot releases at the top of the jump plus `sec` (a scripted release); shoots now if I have the ball. */
        shoot: (sec: number) => { S.scriptOffset = sec; startShot(S, S.me); return S.me.shot !== null; },
        /** Put me (with the ball, live) at a spot: a scripted shot's set-up. */
        place: (x: number, z: number) => { S.phase = 'live'; S.me.body.teleport({ x, y: 0, z }); S.foe.body.teleport({ x: x + 3, y: 0, z: z + 3 }); S.me.yaw = yawTo({ x, z }, ARENA_RIM); S.world.ball.teleport(chestPoint({ x, y: 0, z }, S.me.yaw)); secure(S, 'me'); S.phase = 'live'; S.ballT = 0; },
        pov: () => togglePov(ctx, S),
        quiet: (on: boolean) => { S.aiQuiet = on; },
      };
    if (typeof window !== 'undefined' && devOrAgentHooks()) {
      S.seamOn = true;
      (window as unknown as { __ARENA__?: unknown }).__ARENA__ = S.seam;
    }
  },

  onPlay(ctx: ModeContext) {
    const S = states.get(ctx.scene);
    if (S) S.tier = runTier();
  },

  onInput(ctx: ModeContext, e: FelInput) {
    const S = states.get(ctx.scene);
    if (!S) return;
    if (e.t === 'stick') { if (e.side === 'L') { S.input.lx = e.x; S.input.ly = e.y; } else { S.input.rx = e.x; S.input.ry = e.y; } return; }
    if (e.t === 'trigger' && e.side === 'R') { S.input.sprint = e.value > 0.4; return; }
    if (e.t !== 'button') return;
    if (e.btn === 'R1') { S.input.sprint = e.pressed; return; }
    if (!e.pressed) {
      if (e.btn === 'X' && S.me.shot) S.me.shot.wantRelease = true;
      return;
    }
    if (S.me.downT > 0) return;   // on the floor: nothing until he is up
    if (e.btn === 'X') {
      if (S.handler === 'me' && S.phase === 'live') startShot(S, S.me);
      else if (S.me.body.grounded && S.me.hopT === 0) { S.me.body.jump(jumpVy()); S.me.hopT = 0.001; }   // no ball: a contest jump
    } else if (e.btn === 'A') {
      if (S.me.body.grounded && S.me.hopT === 0 && !S.me.shot) { S.me.body.jump(jumpVy()); S.me.hopT = 0.001; }
    } else if (e.btn === 'B') {
      if (S.phase === 'check' && S.handler === 'me' && S.ball === 'held') throwPass(S, 'me', 'foe');
    } else if (e.btn === 'Y') {
      if (S.handler === 'foe' && S.ball === 'dribble' && S.me.pokeCd <= 0) {
        const mh = chestPoint(p3(S.me.node.position), S.me.yaw), b = S.world.ball.pos;
        S.me.pokeCd = 0.9;
        if (Math.hypot(b.x - mh.x, b.z - mh.z) < 1.0 && b.y < 1.4 && !shielded(S, S.me)) poke(S, S.me);
      }
    } else if (e.btn === 'L1' && S.handler === 'me' && S.ball === 'dribble') {
      S.dribble.side = S.dribble.side === 1 ? -1 : 1;   // the crossover: the next push goes to the other hand
      S.dribble.crossAt = S.t;
    }
  },

  update(ctx: ModeContext, dt: number) {
    const S = states.get(ctx.scene);
    if (!S || S.disposed) return;
    // THE GAME RUNS ON THE PHYSICS CLOCK: a slow frame that the step cap cuts short (ARENA_MAX_STEPS) slows the whole game the same,
    // so a release timed on the jump is timed on the jump the body actually made (measured in the browser rig: on frame time the
    // scripted top-of-the-jump release read 216-283 ms early on a slow frame)
    S.world.step(dt, (h) => { S.t = S.world.time; beforeStep(ctx, S, h); }, (h) => afterStep(S, h));
    const simDt = S.world.stats.steps / stepHz();
    S.t = S.world.time;
    S.stats.frames++; S.stats.physMsSum += S.world.stats.ms; S.stats.physMsMax = Math.max(S.stats.physMsMax, S.world.stats.ms);
    // the phone rig's read (scripts/probes/hoops-gap/perf.mjs `extra.physMs`): the physics steps' own time a frame, probes only
    if (S.seamOn) (window as unknown as { __physMs?: number }).__physMs = S.stats.physMsSum / S.stats.frames;
    shotsAndJumps(S, simDt);
    frameRules(ctx, S, simDt);
    // a finished game to the page (it posts the run: lib/sessions/arenaScore.ts rebuilds the score from the log); play goes on
    if (S.final) { const f = S.final; S.final = null; ctx.card?.(f.won ? 'WIN' : 'LOSS', f.me, { opponentScore: f.foe, won: f.won ? 1 : 0 }, { arena: f.log, opponentScore: f.foe, won: f.won }); }
    facing(ctx, S, dt);
    camera(ctx, S, dt);
    hud(ctx, S, dt);
  },

  dispose() {
    if (current && current.scene.isDisposed) close(current.scene);
  },
};

/** The probe seam for a scene (place, shoot, quiet, pov, state): what the browser rig reaches as window.__ARENA__. */
export function arenaSeam(scene: Scene): Record<string, (...a: never[]) => unknown> | null { return states.get(scene)?.seam ?? null; }

/** The arena's counters for a scene (the headless test and the probe read them): shots and makes by side, lost handles,
 *  steals, the physics steps' cost. Null when no arena runs on that scene. */
export function arenaStats(scene: Scene): St['stats'] | null {
  const S = states.get(scene);
  return S ? JSON.parse(JSON.stringify(S.stats)) : null;
}

function close(scene: Scene): void {
  const S = states.get(scene);
  if (!S || S.disposed) return;
  S.disposed = true;
  S.world.dispose();
  S.court.dispose();
  states.delete(scene);
  if (current === S) current = null;
  if (typeof window !== 'undefined') delete (window as unknown as { __ARENA__?: unknown }).__ARENA__;
}
