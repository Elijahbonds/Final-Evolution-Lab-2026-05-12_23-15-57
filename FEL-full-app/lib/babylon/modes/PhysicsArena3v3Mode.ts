// PhysicsArena3v3Mode — the Physics Arena, 3v3 basketball on real physics (docs/PHYSICS-ARENA-PLAN.md §5; owner 2026-11-24:
// "3v3 hoops arena" next after the merge).
//
// The arena's 1v1 with three a side, on the same shared core (lib/babylon/arena): one Havok ball, the hoop, six upright bodies
// that collide, the dribble as pushes, every shot the one release (the body's rise or fall at the release is the timing), the
// basket the ball through the hoop. What three a side adds is the PASS: a throw to a teammate's chest that flies through the
// physics, so a body in the lane intercepts it by being there (an interception is a catch by the wrong side, nothing rolled).
//
// You play one body (the human is always home player 1); your two teammates and the three rivals are rules: the handler drives,
// shoots when open, or passes to the open man (or to you when you call for it, Y); off the ball they space to the arc; on defence
// each guards his man (between the man and the ring), jumps at a shot after his reaction time, and reaches for a dribble the
// handler's body does not shield. Their release has a seeded human scatter by OPPONENT tier; whether anything goes in is the
// physics'.
//
// Rules: half court, 1s and 2s, first to 21 (the shipped 3v3's target, owner 2026-11-12), the ball changes hands after a make,
// the check at the top of the key is a real pass. A practice place: no session, no pay. Registered, NOT enabled: its page is
// /play/arena?sport=threes. The shipped 3v3 (ThreeVThreeMode.ts) is untouched.

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
import { runTier, type Tier } from '../core/Difficulty';
import { DUNK_CONFIG } from './modeConfigs';
import { devOrAgentHooks } from '@/lib/agentRunHooks';
import { ArenaPhysics, type ArenaHands, type ArenaPlayer } from '../arena/arenaPhysics';
import { mountArenaCourt, RIM_VEC, type ArenaCourt } from '../arena/arenaCourt';
import { ARC_M, ARENA_RIM, ARENA_RIM_RADIUS, BALL_BOUNDS, BALL_R, CHECK_SPOT, COURT, RIM_FLOOR, type P3 } from '../arena/hoopGeometry';
import { HoopSensor } from '../arena/hoopSensor';
import { dunkPush, LAYUP_ARC_DEG, releaseShot } from '../arena/arenaShot';
import { passVelocity, seeded } from '../arena/shotModel';
import { chestPoint, dribbleCatch, dribbleCommit, dribbleHand, dribblePush, setPoint } from '../arena/dribble';
import { aimAssist, dunkJumpVy, dunksOn, floorBounce, jumpVy, physicsHandsOn, povBobM, povEyeM, povFovDeg, povLookDegS, povOn, stepHz } from '../arena/arenaConfig';
import { aimYawErr, applyPov, fovForAspect, povLook, povPose, type PovView } from '../arena/povCamera';
import { handTargets } from '../arena/handTargets';
import { RIVAL_BY_TIER, shotKindFor, type ShotKind } from './PhysicsArenaMode';

export const ARENA_3V3_MODE_ID = 'physics_arena_3v3';
const G = 9.81;
/** First to this (the shipped 3v3's target). */
export const ARENA_3V3_GAME_TO = 21;
const GATHER_SEC = 0.14;
const SECURE_R = 0.62, SECURE_MAX_MPS = 10;
const CATCH_HOLD_SEC = 0.2;
const JOG = 4.4, SPRINT = 6.0;
const STALL_SEC = 7;
const DRIVE_ACCEL = 30;
/** After a poke or a lost dribble, the handler who lost it cannot secure it for this long (the ball is loose for everyone else). */
const POKE_GRACE_SEC = 0.35;
/** Where the offence spaces (x, z on the floor): the top, the wings, the corners. */
export const SPACING: ReadonlyArray<{ x: number; z: number }> = [
  { x: 0, z: ARENA_RIM.z + 7.1 }, { x: -4.9, z: ARENA_RIM.z + 5.0 }, { x: 4.9, z: ARENA_RIM.z + 5.0 },
  { x: -6.4, z: ARENA_RIM.z + 1.2 }, { x: 6.4, z: ARENA_RIM.z + 1.2 },
];
/** A teammate counts as open past this from his nearest defender (m). */
const OPEN_M = 1.9;

type Team = 'home' | 'away';
type BallState = 'held' | 'dribble' | 'flight' | 'pass' | 'loose';
type Phase = 'check' | 'live' | 'scored' | 'over';
const otherTeam = (t: Team): Team => (t === 'home' ? 'away' : 'home');

interface Pl {
  i: number;
  team: Team;
  human: boolean;
  node: TransformNode;
  body: ArenaPlayer;
  hands: ArenaHands | null;
  view: TransformNode;
  char: SpawnedCharacter | null;
  head: TransformNode | null;
  yaw: number;
  clip: string;
  shot: { t: number; jumped: boolean; wantRelease: boolean; aiReleaseAt: number; kind: ShotKind } | null;
  hopT: number;
  pokeCd: number;
  /** A hand swinging at the ball (physics hands): seconds left. */
  reachT: number;
  wish: { x: number; z: number };
  committed: { x: number; z: number };
  /** The rival this body guards (index into players). */
  guards: number;
  /** Where he spaces on offence (index into SPACING). */
  spot: number;
  reactAt: number;
}

interface St {
  scene: Scene;
  world: ArenaPhysics;
  court: ArenaCourt;
  ballMesh: Mesh;
  pl: Pl[];
  sensor: HoopSensor;
  rng: ReturnType<typeof seeded>;
  tier: Tier;
  t: number;
  score: Record<Team, number>;
  phase: Phase;
  phaseT: number;
  possession: Team;
  handler: Pl | null;
  ball: BallState;
  ballT: number;
  dribble: { side: 1 | -1; pushedAt: number; due: number; crossAt: number };
  lastTouch: Pl | null;
  shotBy: Pl | null;
  shotFromM: number;
  shotTouched: boolean;
  passFrom: Pl | null;
  passTo: Pl | null;
  /** The handler's time on the ball, and whether the human asked for it (Y). */
  holdT: number;
  calledAt: number;
  /** Who last lost the dribble, and when (a poked ball is not his to pick straight back up: arena3v3 POKE_GRACE_SEC). */
  lostBy: Pl | null;
  lostAt: number;
  input: { lx: number; ly: number; rx: number; ry: number; sprint: boolean };
  pov: { on: boolean; view: PovView; savedFov: number };
  camModeSeen: CamMode;
  banner: string;
  bannerT: number;
  timing: string;
  prevBall: P3;
  hudKey: string;
  stats: { shots: Record<Team, number>; makes: Record<Team, number>; passes: number; completed: number; intercepted: number; steals: number; lostHandles: number; blocksByHand: number; outOfBounds: number; stalls: number };
  disposed: boolean;
}

const states = new WeakMap<Scene, St>();
let current: St | null = null;
const TMP = new Vector3(), TMP2 = new Vector3();
const p3 = (v: { x: number; y: number; z: number }): P3 => ({ x: v.x, y: v.y, z: v.z });
const flatDist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const yawTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
function slewYaw(cur: number, want: number, rate: number, dt: number): number {
  let d = want - cur;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const s = rate * dt;
  return cur + Math.max(-s, Math.min(s, d));
}
const say = (S: St, text: string, sec = 1.4) => { S.banner = text; S.bannerT = sec; };
const mates = (S: St, a: Pl) => S.pl.filter((x) => x.team === a.team && x !== a);
const rivals = (S: St, team: Team) => S.pl.filter((x) => x.team !== team);
/** How far the nearest defender of the other team is from this body. */
function openness(S: St, a: Pl): number {
  let best = Infinity;
  for (const d of rivals(S, a.team)) best = Math.min(best, flatDist(d.node.position, a.node.position));
  return best;
}
/** Is any body of the other team near the line of a pass (a lane an interception could come from)? */
function laneClear(S: St, from: Pl, to: Pl): boolean {
  const a = from.node.position, b = to.node.position;
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
  for (const d of rivals(S, from.team)) {
    const p = d.node.position;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2));
    if (Math.hypot(a.x + dx * k - p.x, a.z + dz * k - p.z) < 0.7 && k > 0.1 && k < 0.95) return false;
  }
  return true;
}

// ── the ball's owners ─────────────────────────────────────────────────────────────────────────────────────────────────────

function secure(S: St, a: Pl): void {
  const was = S.possession;
  const pass = S.ball === 'pass' ? S.passTo : null;
  if (S.ball === 'pass' && S.passFrom) {   // a live pass (the check's pass has no passer on record)
    if (a.team === S.passFrom.team) S.stats.completed++;
    else { S.stats.intercepted++; say(S, a.team === 'home' ? 'Picked it off' : 'Intercepted'); }
  } else if (S.ball === 'pass') {
    // the check's pass: caught by anyone is just the check
  } else if (S.phase === 'live' && a.team !== was) {
    if (S.shotBy && S.shotBy.team !== a.team) say(S, a.team === 'home' ? 'Rebound' : 'Their board');
    else { S.stats.steals++; say(S, a.team === 'home' ? 'Steal' : 'Stripped'); }
  }
  void pass;
  // the handler's clock restarts on a new possession or a caught pass, not when he picks up his own poked dribble
  if (a !== S.lostBy || S.t - S.lostAt > 1.5) S.holdT = 0;
  S.handler = a; S.ball = 'held'; S.ballT = 0; S.passTo = null; S.passFrom = null; S.lastTouch = a;
  S.world.ball.ignore(a.body.bit);
  S.possession = a.team;
  S.shotBy = null;
}

function loseBall(S: St, why: string | null): void {
  S.lostBy = S.handler; S.lostAt = S.t;
  S.handler = null; S.ball = 'loose'; S.ballT = 0;
  S.world.ball.collideAll();
  if (why) say(S, why);
}

/** The check: the offence spaces out, the point man at the top; his defender holds the ball in front of him. */
function setupCheck(S: St, offence: Team): void {
  S.phase = 'check'; S.phaseT = 0; S.possession = offence;
  const off = S.pl.filter((x) => x.team === offence), def = S.pl.filter((x) => x.team !== offence);
  off.forEach((a, k) => { const sp = SPACING[k === 0 ? 0 : k === 1 ? 1 : 2]; a.spot = k === 0 ? 0 : k === 1 ? 1 : 2; a.body.teleport({ x: sp.x, y: 0, z: sp.z + (k === 0 ? 0.8 : 0) }); a.yaw = Math.PI; });
  def.forEach((d, k) => {
    d.guards = off[k].i;
    const m = off[k].node.position;
    d.body.teleport({ x: m.x * 0.85, y: 0, z: m.z - 1.4 }); d.yaw = 0;
  });
  for (const a of S.pl) { a.shot = null; a.hopT = 0; a.reachT = 0; }
  const point = off[0], holder = def[0];
  S.world.ball.teleport(chestPoint(p3(holder.node.position), holder.yaw));
  S.sensor.reset();
  S.handler = holder; S.ball = 'held'; S.ballT = 0; S.shotBy = null; S.passTo = point; S.passFrom = null; S.holdT = 0;
  S.world.ball.ignore(holder.body.bit);
  say(S, offence === 'home' ? 'Your ball. Check it up' : 'Their ball', 1.3);
}

function throwPass(S: St, from: Pl, to: Pl): void {
  const ball = S.world.ball;
  // lead the receiver: where he will be when it gets there
  const tv = to.body.vel(TMP2);
  const d0 = flatDist(ball.pos, to.node.position);
  const flight = 0.18 + d0 * 0.07;
  const target = chestPoint({ x: to.node.position.x + tv.x * flight, y: to.node.position.y, z: to.node.position.z + tv.z * flight }, to.yaw);
  ball.ignore(from.body.bit, 0.3);
  ball.launch(passVelocity(p3(ball.pos), target, flight));
  S.handler = null; S.ball = 'pass'; S.ballT = 0; S.passTo = to; S.passFrom = S.phase === 'check' ? null : from; S.lastTouch = from;
  if (S.phase === 'live') S.stats.passes++;
  SoundKit.play('whoosh', { volume: 0.25 });
}

function push(S: St, a: Pl): void {
  const ball = S.world.ball;
  // the outside hand when guarded (owner 2026-10-20, the hoops rule)
  // (in three a side the traffic is teammates too: the hand away from the nearest body of either side)
  let near: Pl | null = null, nd = 2.2;
  for (const d of S.pl) { if (d === a) continue; const dd = flatDist(d.node.position, a.node.position); if (dd < nd) { nd = dd; near = d; } }
  if (near && S.t - S.dribble.crossAt > 1.0) {
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const ox = near.node.position.x - a.node.position.x, oz = near.node.position.z - a.node.position.z;
    S.dribble.side = fz * ox - fx * oz > 0 ? -1 : 1;
  }
  const hand = dribbleHand(p3(a.node.position), a.yaw, S.dribble.side);
  const v = a.body.vel(TMP);
  const pu = dribblePush(p3(ball.pos), hand, { x: v.x, y: 0, z: v.z }, BALL_R, floorBounce(), a.wish, DRIVE_ACCEL);
  ball.launch(pu.vel, pu.spin);
  a.committed.x = a.wish.x; a.committed.z = a.wish.z;
  S.dribble.pushedAt = S.t; S.dribble.due = S.t + pu.period;
}

function startShot(S: St, a: Pl, aiReleaseAt = Infinity): void {
  if (S.handler !== a || a.shot || (S.ball !== 'dribble' && S.ball !== 'held')) return;
  S.ball = 'held'; S.ballT = 0;
  const v = a.body.vel(TMP);
  const kind = shotKindFor(flatDist(a.node.position, RIM_FLOOR), Math.hypot(v.x, v.z), dunksOn());
  a.shot = { t: 0, jumped: false, wantRelease: false, aiReleaseAt, kind };
  a.yaw = S.pov.on && a.human ? S.pov.view.yaw : yawTo(a.node.position, ARENA_RIM);
  playClip(a, kind === 'dunk' ? 'bball_layup_gather' : 'bball_shoot_jumper', false);
}

function release(S: St, a: Pl): void {
  if (!a.shot) return;
  const ball = S.world.ball;
  const v = a.body.vel(TMP);
  const yawErr = S.pov.on && a.human ? aimYawErr(S.pov.view.yaw, p3(a.node.position), ARENA_RIM, aimAssist()) : 0;
  const ms = Math.round(((a.shot.jumped ? -v.y : -jumpVy()) / G) * 1000);
  const kind = a.shot.kind;
  if (kind === 'dunk') { ball.ignore(a.body.bit, 0.35); ball.launch(dunkPush(p3(ball.pos))); }
  else releaseShot(ball, a.body.bit, { x: v.x, y: a.shot.jumped ? v.y : jumpVy(), z: v.z }, S.rng.normal, yawErr, kind === 'layup' ? LAYUP_ARC_DEG : undefined);
  S.handler = null; S.ball = 'flight'; S.ballT = 0; S.shotBy = a; S.shotTouched = false; S.lastTouch = a;
  S.shotFromM = flatDist(a.node.position, RIM_FLOOR);
  S.stats.shots[a.team]++;
  S.sensor.reset();
  a.shot = null;
  if (a.human) S.timing = kind === 'dunk' ? 'dunk' : `${kind === 'layup' ? 'layup, ' : ''}${ms < -35 ? 'early' : ms > 35 ? 'late' : 'on time'} ${ms > 0 ? '+' : ''}${ms} ms`;
  SoundKit.play('whoosh', { volume: 0.3 });
}

function dunkHold(a: Pl): P3 {
  const p = a.node.position;
  const dx = ARENA_RIM.x - p.x, dz = ARENA_RIM.z - p.z, d = Math.hypot(dx, dz) || 1, reach = Math.min(0.55, d);
  return { x: p.x + (dx / d) * reach, y: p.y + 2.45, z: p.z + (dz / d) * reach };
}

/** A hand at the ball. With physics hands (arena.physicsHands) the hand swings and the contact is the physics'; without, an impulse
 *  away from the handler (the 1v1's rule). */
function poke(S: St, a: Pl): void {
  if (a.hands) { a.reachT = 0.18; return; }
  const ball = S.world.ball, h = S.handler;
  const from = h ? h.node.position : a.node.position;
  const dx = ball.pos.x - from.x, dz = ball.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
  const v = ball.vel(TMP2);
  loseBall(S, a.team === 'home' ? 'Poked it' : 'They poked it');
  ball.launch({ x: v.x * 0.3 + (dx / d) * 2.4 + Math.sin(a.yaw) * 0.8, y: Math.max(1.4, v.y * 0.2 + 1.6), z: v.z * 0.3 + (dz / d) * 2.4 + Math.cos(a.yaw) * 0.8 });
  S.lastTouch = a;
  SoundKit.play('impact', { volume: 0.25 });
}

function shielded(S: St, reacher: Pl): boolean {
  if (!S.handler) return false;
  const h = S.handler.node.position, r = reacher.node.position, b = S.world.ball.pos;
  return flatDist(b, r) > flatDist(h, r) + 0.05;
}

function playClip(a: Pl, clip: string, loop = true): void {
  if (!a.char || a.clip === clip) return;
  a.clip = clip;
  a.char.animator.play(clip, { loop, fadeSec: 0.15 });
}

// ── wishes ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function humanWish(ctx: ModeContext, S: St): { x: number; z: number } {
  const { lx, ly, rx, ry } = S.input;
  if (Math.hypot(lx, ly) < 0.15) return { x: 0, z: 0 };
  const sp = S.input.sprint ? SPRINT : JOG;
  if (S.pov.on) {
    const fx = Math.sin(S.pov.view.yaw), fz = Math.cos(S.pov.view.yaw);
    return { x: (fx * -ly + fz * lx) * sp, z: (fz * -ly - fx * lx) * sp };
  }
  const w = ctx.camDirector.stickWorldLatched(lx, ly, 0.15, Math.hypot(rx, ry) > 0.2);
  return { x: w.x * sp, z: w.z * sp };
}

function aiWish(S: St, a: Pl): { x: number; z: number } {
  const prof = RIVAL_BY_TIER[S.tier];
  const p = a.node.position;
  let tx = p.x, tz = p.z, speed = prof.speed;
  if (S.phase === 'check') return { x: 0, z: 0 };
  const ball = S.world.ball;
  if (S.handler === a) {
    const sp = SPACING[a.spot];
    // the handler drives from his spot toward the ring's elbow on his side
    tx = sp.x * 0.35; tz = ARENA_RIM.z + 3.2; speed = prof.speed * 0.8;
  } else if (S.handler && S.handler.team === a.team) {
    const sp = SPACING[a.spot]; tx = sp.x; tz = sp.z;   // off the ball: space
  } else if (S.handler) {
    const man = S.pl[a.guards];
    const m = man.node.position;
    const dx = ARENA_RIM.x - m.x, dz = ARENA_RIM.z - m.z, d = Math.hypot(dx, dz) || 1;
    const off = man === S.handler ? 1.2 : 1.6;
    tx = m.x + (dx / d) * off; tz = m.z + (dz / d) * off;
  } else {
    // a loose ball or one in the air: the two nearest go to it, the rest get back to their spots or men
    const bv = ball.vel(TMP2);
    const bx = ball.pos.x + bv.x * 0.3, bz = ball.pos.z + bv.z * 0.3;
    const order = [...S.pl].filter((x) => !x.human).sort((u, w) => flatDist(u.node.position, { x: bx, z: bz }) - flatDist(w.node.position, { x: bx, z: bz }));
    if (order.indexOf(a) < 2 || S.ball !== 'flight') { tx = bx; tz = bz; }
    else { const sp = SPACING[a.spot]; tx = sp.x * 0.7; tz = sp.z * 0.7; }
  }
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 0.15) return { x: 0, z: 0 };
  const k = (Math.min(1, d / 0.8) * speed) / d;
  let wx = dx * k, wz = dz * k;
  // with the ball he goes round a body in his path (a dribble run into a body loses the ball, in the physics) — the 1v1's rule,
  // against the nearest body ahead of him, either side
  if (S.handler === a) {
    let near: Pl | null = null, nd = 1.6;
    for (const o of S.pl) {
      if (o === a) continue;
      const ox = o.node.position.x - p.x, oz = o.node.position.z - p.z, od = Math.hypot(ox, oz);
      if (od < nd && (ox * dx + oz * dz) / (od * d || 1) > 0.3) { nd = od; near = o; }
    }
    if (near) {
      const ox = near.node.position.x - p.x, oz = near.node.position.z - p.z;
      const side = ox * dz - oz * dx > 0 ? 1 : -1;
      const push = speed * (1 - nd / 1.6) * 1.4;
      wx += (-dz / d) * side * push; wz += (dx / d) * side * push;
      const n = Math.hypot(wx, wz); if (n > speed) { wx *= speed / n; wz *= speed / n; }
    }
  }
  return { x: wx, z: wz };
}

function keepIn(p: { x: number; z: number }, w: { x: number; z: number }): { x: number; z: number } {
  let { x, z } = w;
  if (p.x < COURT.minX && x < 0) x = 1.5; if (p.x > COURT.maxX && x > 0) x = -1.5;
  if (p.z < COURT.minZ && z < 0) z = 1.5; if (p.z > COURT.maxZ && z > 0) z = -1.5;
  return { x, z };
}

// ── the steps ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

function beforeStep(ctx: ModeContext, S: St, h: number): void {
  const ball = S.world.ball;
  for (const a of S.pl) {
    let w = a.human ? humanWish(ctx, S) : aiWish(S, a);
    if (S.phase === 'check' || (a.shot && !a.shot.jumped && a.shot.kind !== 'dunk')) w = { x: 0, z: 0 };
    w = keepIn(a.node.position, w);
    a.wish.x = w.x; a.wish.z = w.z;
    const drive = S.handler === a && S.ball === 'dribble' && dribbleCommit(a.committed, w).changing ? a.committed : w;
    if (a.body.grounded) a.body.drive(drive.x, drive.z, h, a.shot ? 40 : DRIVE_ACCEL);
    if (a.hands) {
      const tg = handTargets({
        feet: p3(a.node.position), yaw: a.yaw, ball: p3(ball.pos),
        role: a.shot ? 'shoot' : S.handler === a ? (S.ball === 'dribble' ? 'dribble' : 'hold') : a.reachT > 0 ? 'reach' : a.hopT > 0 ? 'contest' : S.handler && S.handler.team !== a.team ? 'guard' : 'rest',
        dribbleSide: S.dribble.side,
      });
      a.hands.target(tg.left, tg.right, a.reachT > 0);
    }
  }
  const a = S.handler;
  if (a && S.ball === 'held') {
    ball.hold(a.shot?.kind === 'dunk' ? dunkHold(a) : a.shot ? setPoint(p3(a.node.position), a.yaw, a.shot.kind === 'layup' ? 2.2 : 2.3) : chestPoint(p3(a.node.position), a.yaw));
  } else if (a && S.ball === 'dribble') {
    const hand = dribbleHand(p3(a.node.position), a.yaw, S.dribble.side);
    const bp = ball.pos, bv = ball.vel(TMP2), av = a.body.vel(TMP);
    const changing = dribbleCommit(a.committed, a.wish).changing || dribbleCommit(a.committed, { x: av.x, z: av.z }).changing;
    if (S.t > S.dribble.pushedAt + 0.1 && dribbleCatch(p3(bp), p3(bv), p3(a.node.position), hand, changing)) push(S, a);
    else if (S.t > S.dribble.due + 0.45 || flatDist(bp, a.node.position) > 1.6) { S.stats.lostHandles++; loseBall(S, a.human ? 'Lost the handle' : null); }
  }
}

function afterStep(S: St, h: number): void {
  const b = S.world.ball.pos;
  const now = { x: b.x, y: b.y, z: b.z };
  if (S.sensor.step(S.prevBall, now, h) === 'make' && (S.ball === 'flight' || S.ball === 'loose') && S.phase === 'live') {
    const by = S.shotBy ?? S.lastTouch;
    const team = by?.team ?? S.possession;
    const pts = S.shotBy && S.shotFromM > ARC_M ? 2 : 1;
    S.score[team] += pts; S.stats.makes[team]++;
    S.phase = 'scored'; S.phaseT = 0;
    S.possession = otherTeam(team);   // the ball changes hands after a make
    say(S, `${team === 'home' ? (by?.human ? 'Bucket' : 'Your team scores') : 'They score'} +${pts}`);
    SoundKit.play('swish', { volume: 0.7 });
    if (S.score[team] >= ARENA_3V3_GAME_TO) { S.phase = 'over'; S.phaseT = 0; say(S, `${team === 'home' ? 'You win' : 'They win'} ${S.score.home}–${S.score.away}`, 3); }
  }
  S.prevBall = now;
}

function rules(S: St, dt: number): void {
  const ball = S.world.ball;
  S.phaseT += dt; S.ballT += dt; S.holdT += dt;
  for (const c of S.world.drainContacts()) {
    if (S.ball === 'flight' && c.surface !== 'body') S.shotTouched = true;
    if (c.playerId) { const who = S.pl.find((x) => String(x.i) === c.playerId); if (who) { S.lastTouch = who; if (c.hand && S.ball === 'flight' && who.team !== S.shotBy?.team) { S.stats.blocksByHand++; say(S, who.team === 'home' ? 'Blocked' : 'Got blocked'); } } }
    if (c.hand && S.ball === 'dribble' && S.handler && c.playerId !== String(S.handler.i)) loseBall(S, null);
    if (c.impulse > 0.4) {
      if (c.surface === 'rim') SoundKit.play('rattle', { volume: Math.min(0.6, 0.15 + c.impulse * 0.1) });
      else if (c.surface === 'board') SoundKit.play('thud', { volume: Math.min(0.5, 0.1 + c.impulse * 0.08) });
    }
    if (S.ball === 'flight' && c.surface === 'floor') S.ball = 'loose';
  }
  if (S.ball === 'flight' && S.shotTouched && ball.pos.y < ARENA_RIM.y - 0.6) S.ball = 'loose';
  if (S.ball === 'pass' && S.ballT > 1.6) S.ball = 'loose';

  if (S.phase === 'check' && S.ball === 'held' && S.handler && S.handler.team !== S.possession && S.phaseT > (S.handler.human ? 2.5 : 0.8) && S.passTo) throwPass(S, S.handler, S.passTo);
  if (S.phase === 'scored' && S.phaseT > 1.4) setupCheck(S, S.possession);
  if (S.phase === 'over' && S.phaseT > 3) { S.score.home = 0; S.score.away = 0; setupCheck(S, 'home'); }

  if (S.ball === 'pass' || S.ball === 'loose' || S.ball === 'flight') {
    const bv = ball.vel(TMP2);
    let best: Pl | null = null, bestD = Infinity;
    for (const a of S.pl) {
      if (S.ball === 'flight' && !S.shotTouched && !(bv.y < 0 && ball.pos.y < 2.6)) continue;
      if (S.phase === 'scored' || (ball.ignoring & a.body.bit)) continue;
      if (a === S.lostBy && S.t - S.lostAt < POKE_GRACE_SEC) continue;   // the poked handler cannot just take it straight back
      const c = chestPoint(p3(a.node.position), a.yaw);
      const dc = Math.hypot(ball.pos.x - c.x, ball.pos.y - c.y, ball.pos.z - c.z);
      const dh = flatDist(ball.pos, a.node.position);
      const near = dc < SECURE_R || (dh < 0.55 && ball.pos.y < a.node.position.y + 2.45 && ball.pos.y > a.node.position.y + 0.3);
      const av = a.body.vel(TMP);
      if (near && Math.hypot(bv.x - av.x, bv.y - av.y, bv.z - av.z) < SECURE_MAX_MPS && dc < bestD) { best = a; bestD = dc; }
    }
    if (best) {
      const wasCheck = S.phase === 'check';
      secure(S, best);
      if (wasCheck && best.team === S.possession) { S.phase = 'live'; S.phaseT = 0; }
    }
  }
  if (S.ball === 'held' && S.handler && S.phase === 'live' && !S.handler.shot && S.ballT > CATCH_HOLD_SEC && S.handler.body.grounded) {
    S.ball = 'dribble'; S.ballT = 0; push(S, S.handler);
  }
  if (S.phase === 'live' && S.ball !== 'held' && S.ball !== 'dribble' && ball.pos.y < 0.5) {
    const p = ball.pos;
    if (p.x < BALL_BOUNDS.minX || p.x > BALL_BOUNDS.maxX || p.z < BALL_BOUNDS.minZ || p.z > BALL_BOUNDS.maxZ) {
      say(S, 'Out of bounds', 1.2); SoundKit.play('whistle', { volume: 0.4 }); S.stats.outOfBounds++;
      setupCheck(S, S.lastTouch ? otherTeam(S.lastTouch.team) : otherTeam(S.possession));
      return;
    }
  }
  if (S.phase === 'live' && S.ball === 'loose' && S.ballT > STALL_SEC) { S.stats.stalls++; setupCheck(S, S.possession); }
}

function decisions(S: St, dt: number): void {
  const prof = RIVAL_BY_TIER[S.tier];
  for (const a of S.pl) {
    if (a.pokeCd > 0) a.pokeCd -= dt;
    if (a.reachT > 0) a.reachT -= dt;
    if (a.hopT > 0) a.hopT += dt;
    if (a.hopT > 0.2 && a.body.grounded) a.hopT = 0;
    if (!a.shot) continue;
    a.shot.t += dt;
    if (!a.shot.jumped && a.shot.t >= GATHER_SEC) { a.body.jump(a.shot.kind === 'dunk' ? dunkJumpVy() : jumpVy()); a.shot.jumped = true; a.shot.t = 0; }
    if (a.shot.jumped && a.shot.kind === 'dunk') {
      const b = S.world.ball.pos;
      if (a.shot.wantRelease || (b.y > ARENA_RIM.y + BALL_R + 0.06 && flatDist(b, ARENA_RIM) < 0.5) || (a.shot.t > 0.2 && a.body.grounded)) release(S, a);
    } else if (a.shot.jumped) {
      const sinceTop = a.shot.t - jumpVy() / G;
      if (!a.human && sinceTop >= a.shot.aiReleaseAt) release(S, a);
      else if (a.shot.wantRelease) release(S, a);
      else if (a.shot.t > 0.15 && a.body.grounded) release(S, a);
    }
  }
  if (S.phase !== 'live') return;
  const h = S.handler;
  // the AI handler: shoot open, pass to the open man (the human first when he called for it), or go up anyway
  if (h && !h.human && !h.shot && (S.ball === 'dribble' || S.ball === 'held') && S.holdT > 0.7) {
    const dist = flatDist(h.node.position, RIM_FLOOR);
    const open = openness(S, h) > OPEN_M;
    const target = mates(S, h).filter((m) => openness(S, m) > OPEN_M && laneClear(S, h, m)).sort((u, w) => (w.human && S.t - S.calledAt < 2 ? 1 : 0) - (u.human && S.t - S.calledAt < 2 ? 1 : 0) || openness(S, w) - openness(S, u))[0];
    const human = mates(S, h).find((m) => m.human);
    if (human && h.team === human.team && S.t - S.calledAt < 2 && laneClear(S, h, human)) { throwPass(S, h, human); S.calledAt = -9; }
    else if (open && dist < prof.maxShotM) startShot(S, h, S.rng.normal() * prof.releaseSd);
    else if (target && S.holdT > 1.6) throwPass(S, h, target);
    else if (S.holdT > 2.6 && dist < prof.maxShotM + 0.5) startShot(S, h, S.rng.normal() * prof.releaseSd);   // a contested shot rather than a stall
    else if (S.holdT > 4.5) startShot(S, h, S.rng.normal() * prof.releaseSd);
  }
  for (const d of S.pl) {
    if (d.human || (h && d.team === h.team)) continue;
    // a contest jump at a shot near him, after his reaction time
    const shooter = S.pl.find((x) => x.shot && x.team !== d.team && flatDist(x.node.position, d.node.position) < 2.2);
    if (shooter && d.hopT === 0 && d.body.grounded) {
      if (d.reactAt === 0) d.reactAt = S.t + prof.reactSec;
      if (S.t >= d.reactAt) { d.body.jump(jumpVy() * 0.95); d.hopT = 0.001; d.reactAt = 0; }
    } else if (!shooter) d.reactAt = 0;
    // a reach at the handler's dribble when it is not shielded
    // (his own man only, and not in the first moments of a possession: a fresh catch is secured before anyone reaches in)
    if (h && S.ball === 'dribble' && h.team !== d.team && d.guards === h.i && S.holdT > 0.8 && d.pokeCd <= 0 && S.world.ball.pos.y < 1.3) {
      const fh = chestPoint(p3(d.node.position), d.yaw), b = S.world.ball.pos;
      const mh = dribbleHand(p3(h.node.position), h.yaw, S.dribble.side);
      const dF = Math.hypot(b.x - fh.x, b.z - fh.z), dM = Math.hypot(b.x - mh.x, b.z - mh.z);
      // only an exposed ball: nearer his hand than the dribbler's, and not behind the dribbler's body (the 1v1's rule)
      if (dF < 0.85 && dF < dM - 0.1 && !shielded(S, d)) { poke(S, d); d.pokeCd = prof.pokeGapSec; }
    }
    // a rebound jump under a falling ball
    const b = S.world.ball;
    if (!h && d.hopT === 0 && d.body.grounded && b.vel(TMP2).y < 0 && b.pos.y > 2.0 && b.pos.y < 3.1 && flatDist(b.pos, d.node.position) < 0.9) { d.body.jump(jumpVy() * 0.9); d.hopT = 0.001; }
  }
}

function facing(S: St, dt: number): void {
  for (const a of S.pl) {
    const v = a.body.vel(TMP), sp = Math.hypot(v.x, v.z);
    let want = a.yaw;
    if (a.human && S.pov.on) want = S.pov.view.yaw;
    else if (a.shot) want = yawTo(a.node.position, ARENA_RIM);
    else if (S.handler && S.handler.team !== a.team) want = yawTo(a.node.position, S.pl[a.guards]?.node.position ?? S.handler.node.position);
    else if (sp > 0.6) want = Math.atan2(v.x, v.z);
    else if (S.handler === a) want = yawTo(a.node.position, ARENA_RIM);
    else if (S.handler) want = yawTo(a.node.position, S.handler.node.position);
    a.yaw = a.human && S.pov.on ? want : slewYaw(a.yaw, want, 9, dt);
    a.view.position.copyFrom(a.node.position);
    a.view.rotation.y = a.yaw;
    if (a.shot || (!a.body.grounded && a.clip === 'bball_shoot_jumper')) continue;
    const hasBall = S.handler === a && S.ball === 'dribble';
    playClip(a, hasBall ? (sp > 4.8 ? 'bball_dribble_run' : sp > 2.2 ? 'bball_dribble_jog' : sp > 0.5 ? 'bball_dribble_walk' : 'bball_dribble_idle')
      : S.handler && S.handler.team !== a.team ? (sp > 3 ? 'run' : 'bball_defend_stance') : sp > 3 ? 'run' : sp > 0.5 ? 'walk' : 'bball_idle_stand');
  }
}

function togglePov(ctx: ModeContext, S: St): void {
  const me = S.pl[0];
  S.pov.on = !S.pov.on;
  ctx.camDirector.suspended = S.pov.on;
  for (const m of me.char?.meshes ?? []) m.isVisible = !S.pov.on;
  if (S.pov.on) { S.pov.savedFov = ctx.camera.fov; S.pov.view.yaw = me.yaw; S.pov.view.pitch = 0.08; }
  else { ctx.camera.fov = S.pov.savedFov; ctx.camera.minZ = 0.1; ctx.camDirector.snapTo(me.node.position, RIM_VEC()); }
  say(S, S.pov.on ? 'POV' : 'Court camera', 0.9);
}

function camera(ctx: ModeContext, S: St, dt: number): void {
  const me = S.pl[0];
  if (ctx.camDirector.mode !== S.camModeSeen) {
    if (povOn()) { ctx.camDirector.mode = S.camModeSeen; togglePov(ctx, S); }
    else S.camModeSeen = ctx.camDirector.mode;
  }
  if (S.pov.on) {
    povLook(S.pov.view, S.input.rx, S.input.ry, povLookDegS(), dt);
    const v = me.body.vel(TMP);
    const eyeY = me.head ? Math.min(2.1, Math.max(1.3, me.head.getAbsolutePosition().y - me.node.position.y + 0.08)) : povEyeM();
    applyPov(ctx.camera, povPose(p3(me.node.position), S.pov.view, eyeY, Math.hypot(v.x, v.z), povBobM(), dt), fovForAspect(povFovDeg(), ctx.scene.getEngine().getAspectRatio(ctx.camera)));
    return;
  }
  ctx.camDirector.look(S.input.rx, S.input.ry, dt);
  ctx.camDirector.update(me.node.position, me.body.vel(TMP), RIM_VEC());
}

export const PhysicsArena3v3Mode: ModeDefinition = {
  modeId: ARENA_3V3_MODE_ID,
  mood: 'goldenHour',
  camPreset: 'hoops',

  async load(ctx: ModeContext) {
    const scene = ctx.scene;
    const court = mountArenaCourt(scene);
    const ballMesh = MeshBuilder.CreateSphere('ball', { diameter: BALL_R * 2, segments: 16 }, scene);
    const bm = new PBRMaterial('arena3v3_ball_mat', scene);
    bm.albedoColor = Color3.FromHexString('#e0742c'); bm.roughness = 0.7; bm.metallic = 0;
    ballMesh.material = bm;
    void dressBall(ballMesh, 'basketball');
    const world = await ArenaPhysics.create(scene, { ballNode: ballMesh });
    if (scene.isDisposed) { world.dispose(); return; }
    const hands = physicsHandsOn();
    const bodies = Array.from({ length: 6 }, (_, i) => {
      const node = new TransformNode(`arena3v3_body_${i}`, scene);
      node.position.set((i % 3 - 1) * 3, 0, 6 + (i < 3 ? 1 : -1));
      const body = world.addPlayer(String(i), node, { mass: i < 3 ? 90 : 95 });
      return { node, body, hands: hands ? world.addHands(body) : null, view: new TransformNode(`arena3v3_view_${i}`, scene) };
    });
    const chars = await Promise.all(bodies.map((_, i) => (i === 0
      ? CharacterPipeline.spawnPlayer(scene, DUNK_CONFIG.heroUrl, { position: Vector3.Zero(), yawRad: 0, startClip: 'bball_idle_stand', modeId: ARENA_3V3_MODE_ID })
      : CharacterPipeline.spawnNpc(scene, DUNK_CONFIG.heroUrl, { position: Vector3.Zero(), yawRad: 0, startClip: 'bball_idle_stand', modeId: ARENA_3V3_MODE_ID, name: i < 3 ? `Mate${i}` : `Rival${i - 2}`, tint: i < 3 ? '#2EC4B6' : '#F25F5C' })
    ).catch(() => null)));
    if (scene.isDisposed) { world.dispose(); return; }
    const pl: Pl[] = bodies.map((b, i) => {
      const c = chars[i];
      if (c) { installSafePlay(c.animator, ARENA_3V3_MODE_ID); c.root.parent = b.view; c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0); c.root.rotationQuaternion = null; }
      return {
        i, team: i < 3 ? 'home' : 'away', human: i === 0, ...b, char: c, head: c ? boneNode(c.skeleton, 'Head') : null, yaw: 0, clip: '', shot: null,
        hopT: 0, pokeCd: 0, reachT: 0, wish: { x: 0, z: 0 }, committed: { x: 0, z: 0 }, guards: i < 3 ? i + 3 : i - 3, spot: i % 3, reactAt: 0,
      };
    });
    const S: St = {
      scene, world, court, ballMesh, pl, sensor: new HoopSensor(ARENA_RIM, ARENA_RIM_RADIUS), rng: seeded(0x33a7e), tier: runTier(), t: 0,
      score: { home: 0, away: 0 }, phase: 'check', phaseT: 0, possession: 'home', handler: null, ball: 'held', ballT: 0,
      dribble: { side: 1, pushedAt: 0, due: 0, crossAt: -9 }, lastTouch: null, shotBy: null, shotFromM: 0, shotTouched: false, passFrom: null, passTo: null,
      holdT: 0, calledAt: -9, lostBy: null, lostAt: -9, input: { lx: 0, ly: 0, rx: 0, ry: 0, sprint: false },
      pov: { on: false, view: { yaw: 0, pitch: 0, bobPhase: 0 }, savedFov: ctx.camera.fov }, camModeSeen: ctx.camDirector.mode,
      banner: '', bannerT: 0, timing: '', prevBall: { x: 0, y: 1, z: 6 }, hudKey: '',
      stats: { shots: { home: 0, away: 0 }, makes: { home: 0, away: 0 }, passes: 0, completed: 0, intercepted: 0, steals: 0, lostHandles: 0, blocksByHand: 0, outOfBounds: 0, stalls: 0 },
      disposed: false,
    };
    states.set(scene, S); current = S;
    setupCheck(S, 'home');
    for (const a of pl) { a.view.position.copyFrom(a.node.position); a.view.rotation.y = a.yaw; }
    ctx.heroRef.current = pl[0].view;
    ctx.objectiveRef.current = RIM_VEC();
    ctx.camDirector.snapTo(pl[0].node.position, RIM_VEC());
    scene.onDisposeObservable.addOnce(() => close(scene));
    if (typeof window !== 'undefined' && devOrAgentHooks()) {
      (window as unknown as { __ARENA3V3__?: unknown }).__ARENA3V3__ = { state: () => ({ phase: S.phase, score: { ...S.score }, possession: S.possession, ball: S.ball, t: S.t, stats: JSON.parse(JSON.stringify(S.stats)) }), pov: () => togglePov(ctx, S) };
    }
  },

  onPlay(ctx: ModeContext) { const S = states.get(ctx.scene); if (S) S.tier = runTier(); },

  onInput(ctx: ModeContext, e: FelInput) {
    const S = states.get(ctx.scene);
    if (!S) return;
    const me = S.pl[0];
    if (e.t === 'stick') { if (e.side === 'L') { S.input.lx = e.x; S.input.ly = e.y; } else { S.input.rx = e.x; S.input.ry = e.y; } return; }
    if (e.t === 'trigger' && e.side === 'R') { S.input.sprint = e.value > 0.4; return; }
    if (e.t !== 'button') return;
    if (e.btn === 'R1') { S.input.sprint = e.pressed; return; }
    if (!e.pressed) { if (e.btn === 'X' && me.shot) me.shot.wantRelease = true; return; }
    if (e.btn === 'X') {
      if (S.handler === me && S.phase === 'live') startShot(S, me);
      else if (me.body.grounded && me.hopT === 0) { me.body.jump(jumpVy()); me.hopT = 0.001; }
    } else if (e.btn === 'A') {
      if (me.body.grounded && me.hopT === 0 && !me.shot) { me.body.jump(jumpVy()); me.hopT = 0.001; }
    } else if (e.btn === 'B') {
      if (S.handler === me && (S.ball === 'dribble' || S.ball === 'held') && !me.shot) {
        // pass toward the stick (or to the most open mate with the stick at rest)
        const ms = mates(S, me);
        const { lx, ly } = S.input;
        let to = ms.sort((u, w) => openness(S, w) - openness(S, u))[0];
        if (Math.hypot(lx, ly) > 0.3) {
          const dir = S.pov.on ? { x: Math.sin(S.pov.view.yaw) * -ly + Math.cos(S.pov.view.yaw) * lx, z: Math.cos(S.pov.view.yaw) * -ly - Math.sin(S.pov.view.yaw) * lx } : (() => { const w = ctx.camDirector.stickWorldLatched(lx, ly); return { x: w.x, z: w.z }; })();
          to = ms.map((m) => ({ m, c: ((m.node.position.x - me.node.position.x) * dir.x + (m.node.position.z - me.node.position.z) * dir.z) / (flatDist(m.node.position, me.node.position) || 1) })).sort((u, w) => w.c - u.c)[0].m;
        }
        throwPass(S, me, to);
      } else if (S.phase === 'check' && S.handler === me && S.passTo) throwPass(S, me, S.passTo);
    } else if (e.btn === 'Y') {
      if (S.handler && S.handler.team === me.team && S.handler !== me) { S.calledAt = S.t; say(S, 'Ball!', 0.6); }
      else if (S.handler && S.handler.team !== me.team && S.ball === 'dribble' && me.pokeCd <= 0) {
        me.pokeCd = 0.9;
        const fh = chestPoint(p3(me.node.position), me.yaw), b = S.world.ball.pos;
        if (Math.hypot(b.x - fh.x, b.z - fh.z) < 1.0 && b.y < 1.4 && !shielded(S, me)) poke(S, me);
      }
    } else if (e.btn === 'L1' && S.handler === me && S.ball === 'dribble') { S.dribble.side = S.dribble.side === 1 ? -1 : 1; S.dribble.crossAt = S.t; }
  },

  update(ctx: ModeContext, dt: number) {
    const S = states.get(ctx.scene);
    if (!S || S.disposed) return;
    // the game on the physics clock (the 1v1's rule: a frame the step cap cut short slows the game, not the jump against the timing)
    S.world.step(dt, (h) => { S.t = S.world.time; beforeStep(ctx, S, h); }, (h) => afterStep(S, h));
    const simDt = S.world.stats.steps / stepHz();
    S.t = S.world.time;
    decisions(S, simDt);
    rules(S, simDt);
    facing(S, simDt);
    camera(ctx, S, dt);
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }
    const key = `${S.score.home}|${S.score.away}|${S.banner}|${S.timing}|${S.pov.on}|${S.possession}|${S.phase}`;
    if (key !== S.hudKey) {
      S.hudKey = key;
      ctx.setHud({ arenaScore: `${S.score.home}–${S.score.away}`, arenaBanner: S.banner, arenaTiming: S.timing, arenaPov: S.pov.on ? 1 : 0, arenaPoss: S.possession, arenaPhase: S.phase });
    }
  },

  dispose() { if (current && current.scene.isDisposed) close(current.scene); },
};

/** The 3v3's counters for a scene (the headless test reads them). */
export function arena3v3Stats(scene: Scene): (St['stats'] & { score: Record<Team, number> }) | null {
  const S = states.get(scene);
  return S ? { ...JSON.parse(JSON.stringify(S.stats)), score: { ...S.score } } : null;
}

function close(scene: Scene): void {
  const S = states.get(scene);
  if (!S || S.disposed) return;
  S.disposed = true;
  S.world.dispose();
  S.court.dispose();
  states.delete(scene);
  if (current === S) current = null;
  if (typeof window !== 'undefined') delete (window as unknown as { __ARENA3V3__?: unknown }).__ARENA3V3__;
}
