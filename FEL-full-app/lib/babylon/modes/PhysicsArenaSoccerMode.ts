// PhysicsArenaSoccerMode — the Physics Arena's soccer, slice 1: 1v1 in a small cage, first to 5 (owner 2026-11-24: "The next sport
// after 3v3: SOCCER"; docs/PHYSICS-ARENA-PLAN.md §9).
//
// What is physics here, on Havok through lib/babylon/arena:
//   THE BALL   a size-5 ball (arenaPhysics SOCCER_SPEC): air drag, Magnus curl, rolling resistance and spin bleed from the shipped
//              core/SoccerBall.ts coefficients, applied as forces every step. Nothing moves it but forces and contacts.
//   THE GOALS  posts and bar as Havok capsules (a shot rings off the iron), the net as walls and a drag volume; the boards keep the
//              ball in play (soccerPitch.ts). The goal is the ball wholly over the line, read on the swept path (soccerGeometry).
//   THE FEET   a dribble is touches: a ball at the foot of a running body is pushed ahead of the run, and runs loose when the run
//              turns away from it; a tackle is a foot that reaches the ball first; a strike is a contact at the release of the
//              hold (soccerKick.ts: off the sweet spot it loses pace and line), the stick's sideways push at the release bends it.
//   THE BODIES two upright capsules (the arena's): a ball struck into a body comes off it.
// What is NOT physics, said plainly: the clips are played over the capsules; the rival's choices are rules, with a seeded scatter.
// Rules: a kick-off from the centre spot by the side that conceded; no offside, no fouls called (arena.fouls is the hoops'), the
// boards keep the ball in; a ball that leaves the cage is dropped back in where it left.

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
import { ArenaPhysics, SOCCER_SPEC, type ArenaPlayer } from '../arena/arenaPhysics';
import { buildSoccerColliders, mountSoccerPitch, type SoccerPitch } from '../arena/soccerPitch';
import { CENTRE, GOAL, PITCH, SOCCER_BALL, goalCrossingAt, goalLineZ, type End } from '../arena/soccerGeometry';
import type { ArenaSoccerLog } from '@/lib/sessions/arenaScore';
import { FOOT_AHEAD_M, REACH_M, WIND_SEC, strike, type KickKind } from '../arena/soccerKick';
import { seeded } from '../arena/shotModel';
import type { P3 } from '../arena/hoopGeometry';
import { povBobM, povEyeM, povFovDeg, povLookDegS, povOn, stepHz } from '../arena/arenaConfig';
import { applyPov, fovForAspect, povLook, povPose, type PovView } from '../arena/povCamera';

export const ARENA_SOCCER_MODE_ID = 'physics_arena_soccer';
/** First to this. */
export const SOCCER_GAME_TO = 5;
/** Jog / sprint (m/s). */
const JOG = 5.0, SPRINT = 7.0;
const DRIVE_ACCEL = 28;
/** A touch: the ball within this of the foot (flat, m), low, and the last touch this long ago (s). */
const TOUCH_R = 0.36, TOUCH_GAP_SEC = 0.26;
/** A running touch pushes the ball this much faster than the run (it leads the body, the hoops dribble's rule). */
const TOUCH_LEAD = 1.32;
/** A tackle reaches this far from the foot (m); then the foot is out of play this long (s). */
const TACKLE_REACH_M = 1.25, TACKLE_GAP_SEC = 0.9;
/** After a goal the ball sits in the net this long (s); a finished game shows its score this long. The server's score rules lean on
 *  SCORED_SEC (lib/sessions/arenaScore.ts ARENA_MIRRORED.soccerScoredSec: two goals at least this far apart). */
export const SCORED_SEC = 2.0;
const OVER_SEC = 3.0;

/** The rival by OPPONENT tier: run speed, reaction (the owner's 420 / 220 / 120 ms), the strike's scatter, how far out he shoots. */
export const SOCCER_RIVAL: Record<Tier, { speed: number; reactSec: number; scatter: number; shootFromM: number; tackleGapSec: number }> = {
  rookie: { speed: 4.6, reactSec: 0.42, scatter: 0.35, shootFromM: 8, tackleGapSec: 1.6 },
  pro: { speed: 5.4, reactSec: 0.22, scatter: 0.22, shootFromM: 10, tackleGapSec: 1.1 },
  elite: { speed: 6.1, reactSec: 0.12, scatter: 0.14, shootFromM: 12, tackleGapSec: 0.8 },
};

type Who = 'me' | 'foe';
type Phase = 'kickoff' | 'live' | 'scored' | 'over';

interface Athlete {
  who: Who;
  node: TransformNode;
  body: ArenaPlayer;
  view: TransformNode;
  char: SpawnedCharacter | null;
  head: TransformNode | null;
  yaw: number;
  clip: string;
  clipHoldT: number;
  wish: { x: number; z: number };
  /** A kick being wound up: its kind and the hold so far (s); `aiAt` the AI's release time. */
  kick: { kind: KickKind; t: number; aiAt: number } | null;
  touchCd: number;
  tackleCd: number;
  /** The end this athlete attacks. */
  attacks: End;
}

interface St {
  scene: Scene;
  world: ArenaPhysics;
  pitch: SoccerPitch;
  ballMesh: Mesh;
  me: Athlete;
  foe: Athlete;
  rng: ReturnType<typeof seeded>;
  tier: Tier;
  t: number;
  score: Record<Who, number>;
  phase: Phase;
  phaseT: number;
  kicker: Who;
  /** The side that conceded the last goal: it kicks off next. */
  conceded: Who;
  lastTouch: Who | null;
  lastTouchAt: number;
  prevBall: P3;
  input: { lx: number; ly: number; rx: number; ry: number; sprint: boolean };
  pov: { on: boolean; view: PovView; savedFov: number };
  camModeSeen: CamMode;
  ai: { reactAt: number; aimX: number; curl: number };
  banner: string;
  bannerT: number;
  timing: string;
  hudKey: string;
  stats: { shots: Record<Who, number>; goals: Record<Who, number>; touches: Record<Who, number>; tackles: Record<Who, number>; posts: number; whiffs: number; drops: number };
  /** This game's goal log (the session's `stats.arena`: the server rebuilds the score from it) and its clock's zero. */
  game: { t0: number; log: ArenaSoccerLog };
  /** A finished game waiting to be handed to the page (ctx.card in update()). */
  final: { won: boolean; me: number; foe: number; log: ArenaSoccerLog } | null;
  /** Probe seam: the rival does nothing. */
  aiQuiet: boolean;
  seam: Record<string, (...a: never[]) => unknown> | null;
  disposed: boolean;
}

const states = new WeakMap<Scene, St>();
let current: St | null = null;
const TMP = new Vector3(), TMP2 = new Vector3();
const p3 = (v: { x: number; y: number; z: number }): P3 => ({ x: v.x, y: v.y, z: v.z });
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const other = (w: Who): Who => (w === 'me' ? 'foe' : 'me');
const yawTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
const goalOf = (end: End): P3 => ({ x: 0, y: 0, z: goalLineZ(end) });
function slewYaw(cur: number, want: number, rate: number, dt: number): number {
  let d = want - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const k = Math.min(1, rate * dt);
  return cur + d * k;
}
const athlete = (S: St, w: Who): Athlete => (w === 'me' ? S.me : S.foe);
const say = (S: St, text: string, sec = 1.4) => { S.banner = text; S.bannerT = sec; };
/** Where the athlete's foot meets the ball: in front of the body, at the ball's height. */
function footPoint(a: Athlete): P3 {
  const p = a.node.position;
  return { x: p.x + Math.sin(a.yaw) * FOOT_AHEAD_M, y: SOCCER_BALL.r, z: p.z + Math.cos(a.yaw) * FOOT_AHEAD_M };
}

function playClip(a: Athlete, clip: string, loop = true, hold = 0): void {
  if (!a.char || a.clip === clip) return;
  a.clip = clip; a.clipHoldT = hold;
  a.char.animator.play(clip, { loop, fadeSec: 0.12 });
}

// ── the kick-off, goals and resets ──────────────────────────────────────────────────────────────────────────────────────

function setupKickoff(S: St, kicker: Who): void {
  S.phase = 'kickoff'; S.phaseT = 0; S.kicker = kicker;
  const k = athlete(S, kicker), o = athlete(S, other(kicker));
  const back = (a: Athlete) => (a.attacks === 'north' ? -1 : 1);   // a player stands in his own half
  k.body.teleport({ x: 0, y: 0, z: 0.75 * back(k) });
  o.body.teleport({ x: 0, y: 0, z: 4.0 * back(o) });
  k.yaw = yawTo(k.node.position, CENTRE); o.yaw = yawTo(o.node.position, CENTRE);
  for (const a of [k, o]) { a.kick = null; a.touchCd = 0; a.tackleCd = 0; }
  S.world.ball.teleport({ x: CENTRE.x, y: SOCCER_BALL.r, z: CENTRE.z });
  S.prevBall = { x: 0, y: SOCCER_BALL.r, z: 0 };
  S.lastTouch = null;
  say(S, kicker === 'me' ? 'Your kick-off' : 'Their kick-off', 1.2);
}

function scored(S: St, by: Who, at: { x: number; y: number }): void {
  S.score[by]++; S.stats.goals[by]++; S.conceded = other(by);
  S.game.log.goals.push({ t: S.t - S.game.t0, side: by, x: at.x, y: at.y });
  S.phase = 'scored'; S.phaseT = 0;
  say(S, by === 'me' ? 'GOAL' : 'They score', SCORED_SEC);
  SoundKit.play('swish', { volume: 0.6 });
  playClip(athlete(S, by), 'soccer_goal_celebrate', false, 1.6);
  if (S.score[by] >= SOCCER_GAME_TO) {
    S.phase = 'over'; S.phaseT = 0; say(S, `${by === 'me' ? 'You win' : 'They win'} ${S.score.me}–${S.score.foe}`, OVER_SEC);
    S.final = { won: by === 'me', me: S.score.me, foe: S.score.foe, log: { v: 1, goals: S.game.log.goals.map((g) => ({ ...g })) } };   // a snapshot: the card is this game
  }
}

// ── the feet ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A touch: the ball at a running foot is pushed ahead of the run (a dribble); at a still foot it is stopped there (a trap). */
function touches(S: St, h: number): void {
  if (S.phase === 'scored' || S.phase === 'over') return;
  const ball = S.world.ball, bp = ball.pos;
  if (bp.y > 0.45) return;   // only a ball on or near the ground is played with the feet
  const bv = ball.vel(TMP2);
  for (const a of [S.me, S.foe]) {
    a.touchCd -= h;
    if (a.kick || a.touchCd > 0) continue;
    const f = footPoint(a);
    if (Math.hypot(bp.x - f.x, bp.z - f.z) > TOUCH_R) continue;
    const v = a.body.vel(TMP);
    const sp = Math.hypot(v.x, v.z);
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    if (sp > 1.0) {
      // the push leads the run (a ball behind the run's line is left: the hard cut loses it)
      const along = (v.x * fx + v.z * fz) / sp;
      if (along < 0.3) continue;
      ball.launch({ x: v.x * TOUCH_LEAD + fx * 0.4, y: 0.2, z: v.z * TOUCH_LEAD + fz * 0.4 });
    } else {
      const rel = Math.hypot(bv.x - v.x, bv.z - v.z);
      if (rel < 0.3) continue;   // already at the feet
      ball.launch({ x: v.x + (bv.x - v.x) * 0.15, y: 0, z: v.z + (bv.z - v.z) * 0.15 });   // cushioned
    }
    a.touchCd = TOUCH_GAP_SEC;
    if (S.lastTouch !== a.who) S.lastTouchAt = S.t;
    S.lastTouch = a.who; S.stats.touches[a.who]++;
    if (S.phase === 'kickoff') { S.phase = 'live'; S.phaseT = 0; }
    break;   // one foot a step
  }
}

/** The other body's foot is nearer the ball than this one's (a ball shielded by the dribbler cannot be reached through him). */
function shielded(S: St, a: Athlete): boolean {
  const o = athlete(S, other(a.who)), b = S.world.ball.pos;
  return flat(footPoint(o), b) + 0.15 < flat(footPoint(a), b) && flat(o.node.position, a.node.position) < flat(a.node.position, b);
}

/** A tackle: the foot reaches for the ball; if it gets there first the ball is knocked away from the other body. */
function tackle(S: St, a: Athlete): void {
  if (a.tackleCd > 0 || a.kick || S.phase === 'scored' || S.phase === 'over') return;
  a.tackleCd = a.who === 'foe' ? SOCCER_RIVAL[S.tier].tackleGapSec : TACKLE_GAP_SEC;
  playClip(a, 'soccer_tackle_slide', false, 0.5);
  const ball = S.world.ball, b = ball.pos, f = footPoint(a);
  if (flat(b, f) > TACKLE_REACH_M || b.y > 0.6 || shielded(S, a)) return;
  const o = athlete(S, other(a.who)).node.position;
  const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz) || 1;
  ball.launch({ x: (dx / d) * 4.2 + Math.sin(a.yaw) * 1.5, y: 0.6, z: (dz / d) * 4.2 + Math.cos(a.yaw) * 1.5 });
  if (S.lastTouch !== a.who) S.lastTouchAt = S.t;
  S.lastTouch = a.who; S.stats.tackles[a.who]++;
  a.touchCd = 0.3; athlete(S, other(a.who)).touchCd = 0.35;
  say(S, a.who === 'me' ? 'Won it' : 'Tackled', 0.8);
  SoundKit.play('impact', { volume: 0.25 });
}

/** The release: a strike if the ball is at the foot, an air kick if not. */
function releaseKick(S: St, a: Athlete, aimYaw: number, curl: number): void {
  if (!a.kick) return;
  const kind = a.kick.kind, power = Math.min(1, a.kick.t / WIND_SEC);
  a.kick = null;
  playClip(a, kind === 'shot' ? 'soccer_kick_shoot' : 'soccer_kick_pass', false, 0.45);
  const ball = S.world.ball;
  const off = Math.hypot(ball.pos.x - footPoint(a).x, ball.pos.z - footPoint(a).z) + Math.max(0, ball.pos.y - 0.5);
  const out = strike({ kind, power, aimYaw, curl, offFootM: off, normal: S.rng.normal });
  if (!out.contact) { S.stats.whiffs++; if (a.who === 'me') S.timing = 'missed the ball'; return; }
  const bv = ball.vel(TMP2);
  // the foot meets a moving ball: a little of its own pace carries (a first-time strike)
  ball.launch({ x: out.vel.x + bv.x * 0.25, y: out.vel.y, z: out.vel.z + bv.z * 0.25 }, out.spin);
  ball.ignore(a.body.bit, 0.25);   // the kicking leg's own body does not stop the ball it struck
  if (S.lastTouch !== a.who) S.lastTouchAt = S.t;
  S.lastTouch = a.who; a.touchCd = 0.3;
  if (kind === 'shot') S.stats.shots[a.who]++;
  if (S.phase === 'kickoff') { S.phase = 'live'; S.phaseT = 0; }
  if (a.who === 'me') S.timing = `${kind}, ${Math.round(power * 100)} % power, ${out.quality > 0.95 ? 'clean' : out.quality > 0.6 ? 'off the sweet spot' : 'scuffed'}`;
  SoundKit.play('whoosh', { volume: 0.2 + 0.2 * power });
}

// ── the players' runs ───────────────────────────────────────────────────────────────────────────────────────────────────

function myWish(ctx: ModeContext, S: St): { x: number; z: number } {
  const { lx, ly } = S.input;
  if (Math.hypot(lx, ly) < 0.15) return { x: 0, z: 0 };
  const sp = S.input.sprint ? SPRINT : JOG;
  if (S.pov.on) {
    const fx = Math.sin(S.pov.view.yaw), fz = Math.cos(S.pov.view.yaw);
    return { x: (fx * -ly + fz * lx) * sp, z: (fz * -ly - fx * lx) * sp };
  }
  const w = ctx.camDirector.stickWorldLatched(lx, ly, 0.15, Math.hypot(S.input.rx, S.input.ry) > 0.2);
  return { x: w.x * sp, z: w.z * sp };
}

/** The rival: chase a loose ball, dribble at the goal and shoot from range, or stand goal-side of a ball at the player's feet. */
function foeWish(S: St): { x: number; z: number } {
  const f = S.foe, prof = SOCCER_RIVAL[S.tier], b = S.world.ball.pos, bv = S.world.ball.vel(TMP2);
  if (S.aiQuiet || S.phase === 'scored' || S.phase === 'over' || (S.phase === 'kickoff' && S.kicker === 'me')) return { x: 0, z: 0 };
  const go = (x: number, z: number, speed = prof.speed) => {
    const dx = x - f.node.position.x, dz = z - f.node.position.z, d = Math.hypot(dx, dz);
    return d < 0.15 ? { x: 0, z: 0 } : { x: (dx / d) * Math.min(speed, d * 3), z: (dz / d) * Math.min(speed, d * 3) };
  };
  const mine = S.lastTouch === 'foe' && flat(b, f.node.position) < 1.4;
  const hisFeet = S.lastTouch === 'me' && flat(b, S.me.node.position) < 1.3;
  if (mine) {
    // run the ball at the goal he attacks (a lean toward the far post, round the player if he is in the way)
    const g = goalOf(f.attacks), me = S.me.node.position;
    let tx = g.x + S.ai.aimX * GOAL.halfW, tz = g.z;
    const ahead = (me.z - f.node.position.z) * Math.sign(g.z - f.node.position.z);
    if (ahead > 0 && ahead < 3 && Math.abs(me.x - f.node.position.x) < 1.2) tx = f.node.position.x + (me.x > f.node.position.x ? -3 : 3);
    // the run carries the ball: aim the body just behind the ball, toward the target
    const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz) || 1;
    return go(b.x - (dx / d) * 0.25 + (dx / d) * 0.6, b.z - (dz / d) * 0.25 + (dz / d) * 0.6);
  }
  if (hisFeet) {
    // goal-side: between the ball and his own goal, 1.4 m off the ball
    const own = goalOf(f.attacks === 'north' ? 'south' : 'north');
    const dx = own.x - b.x, dz = own.z - b.z, d = Math.hypot(dx, dz) || 1;
    return go(b.x + (dx / d) * 1.4, b.z + (dz / d) * 1.4);
  }
  // a loose ball: where it will be a moment from now
  return go(b.x + bv.x * 0.3, b.z + bv.z * 0.3);
}

function aiDecide(S: St, dt: number): void {
  if (S.aiQuiet || (S.phase !== 'live' && !(S.phase === 'kickoff' && S.kicker === 'foe'))) return;
  const f = S.foe, prof = SOCCER_RIVAL[S.tier], b = S.world.ball.pos;
  const g = goalOf(f.attacks);
  if (f.kick) {
    f.kick.t += dt;
    if (f.kick.t >= f.kick.aiAt) releaseKick(S, f, yawTo(f.node.position, { x: g.x + S.ai.aimX * GOAL.halfW, z: g.z }), S.ai.curl);
    return;
  }
  const atFeet = flat(b, footPoint(f)) < 0.45 && b.y < 0.4;
  if (atFeet && flat(f.node.position, g) < prof.shootFromM && S.lastTouch === 'foe') {
    // the shot: a corner, a hold for the distance, a little curl toward the far post, the hand's scatter by tier
    S.ai.aimX = (S.rng.next() < 0.5 ? -1 : 1) * (0.55 + S.rng.next() * 0.3);
    S.ai.curl = -S.ai.aimX * 0.4 * S.rng.next();
    const want = Math.min(1, 0.45 + flat(f.node.position, g) / 18);
    f.kick = { kind: 'shot', t: 0, aiAt: Math.max(0.15, want * WIND_SEC + S.rng.normal() * prof.scatter * 0.3) };
    return;
  }
  // a tackle on the ball at the player's feet, after his reaction time
  if (S.lastTouch === 'me' && flat(b, footPoint(f)) < TACKLE_REACH_M - 0.2 && f.tackleCd <= 0) {
    if (S.ai.reactAt === 0) S.ai.reactAt = S.t + prof.reactSec;
    if (S.t >= S.ai.reactAt) { tackle(S, f); S.ai.reactAt = 0; }
  } else S.ai.reactAt = 0;
}

function beforeStep(ctx: ModeContext, S: St, h: number): void {
  for (const a of [S.me, S.foe]) {
    let w = a.who === 'me' ? myWish(ctx, S) : foeWish(S);
    if (S.phase === 'scored' || S.phase === 'over') w = { x: 0, z: 0 };
    // at the kick-off the other side waits outside the centre circle until the ball moves
    if (S.phase === 'kickoff' && a.who !== S.kicker) {
      const p = a.node.position, nx = p.x + w.x * h, nz = p.z + w.z * h;
      if (Math.hypot(nx, nz) < 3.0) w = { x: 0, z: 0 };
    }
    if (a.kick) { w.x *= 0.35; w.z *= 0.35; }   // winding up: a plant, not a run
    // the boards: nobody runs through them
    const p = a.node.position;
    if ((p.x > PITCH.halfW - 0.4 && w.x > 0) || (p.x < -PITCH.halfW + 0.4 && w.x < 0)) w.x = 0;
    if ((p.z > PITCH.halfL - 0.4 && w.z > 0) || (p.z < -PITCH.halfL + 0.4 && w.z < 0)) w.z = 0;
    a.wish = w;
    if (a.body.grounded) a.body.drive(w.x, w.z, h, DRIVE_ACCEL);
    if (a.tackleCd > 0) a.tackleCd -= h;
  }
  touches(S, h);
}

function afterStep(S: St): void {
  const b = S.world.ball.pos, now = p3(b);
  if (S.phase === 'live' || S.phase === 'kickoff') {
    const g = goalCrossingAt(S.prevBall, now);
    if (g) scored(S, g.end === S.me.attacks ? 'me' : 'foe', g);
  }
  S.prevBall = now;
}

function frameRules(S: St, dt: number): void {
  S.phaseT += dt;
  for (const c of S.world.drainContacts()) {
    if (c.surface === 'post' && c.impulse > 0.3) { S.stats.posts++; SoundKit.play('rattle', { volume: Math.min(0.6, 0.2 + c.impulse * 0.1) }); say(S, 'Off the post', 0.8); }
    else if (c.surface === 'boards' && c.impulse > 0.6) SoundKit.play('thud', { volume: Math.min(0.4, 0.1 + c.impulse * 0.05) });
    if (c.surface === 'body' && c.playerId) { const w = c.playerId as Who; if (S.lastTouch !== w) S.lastTouchAt = S.t; S.lastTouch = w; }
  }
  if (S.phase === 'kickoff' && S.kicker === 'foe' && S.phaseT > 1.0 && !S.foe.kick && !S.aiQuiet) {
    // the rival's kick-off: a touch forward (he runs onto it)
    const k = S.foe, fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    S.world.ball.launch({ x: fx * 2.2, y: 0, z: fz * 2.2 });
    S.lastTouch = 'foe'; S.lastTouchAt = S.t; S.phase = 'live'; S.phaseT = 0;
  }
  if (S.phase === 'scored' && S.phaseT > SCORED_SEC) setupKickoff(S, S.conceded);
  if (S.phase === 'over' && S.phaseT > OVER_SEC) { S.score.me = 0; S.score.foe = 0; S.game = { t0: S.t, log: { v: 1, goals: [] } }; setupKickoff(S, 'me'); }
  // a ball out of the cage (a chip over the boards): dropped back in where it left
  const b = S.world.ball.pos;
  const out = Math.abs(b.x) > PITCH.halfW + 0.6 || (Math.abs(b.z) > PITCH.halfL + GOAL.depth + 0.6) || (Math.abs(b.z) > PITCH.halfL + 0.6 && Math.abs(b.x) > GOAL.halfW + 0.3) || b.y < -1;
  if (out && S.phase === 'live') {
    S.world.ball.teleport({ x: Math.max(-PITCH.halfW + 0.8, Math.min(PITCH.halfW - 0.8, b.x)), y: SOCCER_BALL.r, z: Math.max(-PITCH.halfL + 0.8, Math.min(PITCH.halfL - 0.8, b.z)) });
    S.prevBall = p3(S.world.ball.pos);
    S.stats.drops++;
    say(S, 'Back in', 0.8);
  }
}

function facing(S: St, dt: number): void {
  for (const a of [S.me, S.foe]) {
    const v = a.body.vel(TMP), sp = Math.hypot(v.x, v.z), b = S.world.ball.pos;
    let want = a.yaw;
    if (a.who === 'me' && S.pov.on) want = S.pov.view.yaw;
    else if (a.kick) want = a.who === 'me' ? a.yaw : yawTo(a.node.position, goalOf(a.attacks));
    else if (sp > 0.8) want = Math.atan2(v.x, v.z);
    else want = yawTo(a.node.position, b);
    a.yaw = a.who === 'me' && S.pov.on ? want : slewYaw(a.yaw, want, a.kick ? 4 : 10, dt);
    a.view.position.copyFrom(a.node.position);
    a.view.rotation.y = a.yaw;
    if (a.clipHoldT > 0) { a.clipHoldT -= dt; continue; }
    const nearBall = flat(b, a.node.position) < 1.2;
    playClip(a, nearBall && sp > 1.2 ? 'soccer_dribble_jog' : sp > 3.5 ? 'run' : sp > 0.5 ? 'walk' : 'idle_stand');
  }
}

function togglePov(ctx: ModeContext, S: St): void {
  const on = !S.pov.on;
  S.pov.on = on;
  ctx.camDirector.suspended = on;
  for (const m of S.me.char?.meshes ?? []) m.isVisible = !on;
  if (on) { S.pov.savedFov = ctx.camera.fov; S.pov.view.yaw = S.me.yaw; S.pov.view.pitch = 0.12; }
  else { ctx.camera.fov = S.pov.savedFov; ctx.camera.minZ = 0.1; ctx.camDirector.snapTo(S.me.node.position, goalVec(S.me.attacks)); }
  say(S, on ? 'POV' : 'Pitch camera', 0.9);
}

const goalVec = (end: End) => new Vector3(0, 1, goalLineZ(end));

function camera(ctx: ModeContext, S: St, dt: number): void {
  if (ctx.camDirector.mode !== S.camModeSeen) {
    if (povOn()) { ctx.camDirector.mode = S.camModeSeen; togglePov(ctx, S); }
    else S.camModeSeen = ctx.camDirector.mode;
  }
  if (S.pov.on) {
    povLook(S.pov.view, S.input.rx, S.input.ry, povLookDegS(), dt);
    const v = S.me.body.vel(TMP), head = S.me.head;
    const eyeY = head ? Math.min(2.1, Math.max(1.3, head.getAbsolutePosition().y - S.me.node.position.y + 0.08)) : povEyeM();
    const pose = povPose(p3(S.me.node.position), S.pov.view, eyeY, Math.hypot(v.x, v.z), povBobM(), dt);
    applyPov(ctx.camera, pose, fovForAspect(povFovDeg(), ctx.scene.getEngine().getAspectRatio(ctx.camera)));
    return;
  }
  ctx.camDirector.look(S.input.rx, S.input.ry, dt);
  // the camera frames the ball against the goal he attacks
  ctx.camDirector.update(S.me.node.position, S.me.body.vel(TMP), goalVec(S.me.attacks));
}

function hud(ctx: ModeContext, S: St, dt: number): void {
  if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }
  const power = S.me.kick ? Math.round(Math.min(1, S.me.kick.t / WIND_SEC) * 100) : -1;
  const key = `${S.score.me}|${S.score.foe}|${S.banner}|${S.timing}|${S.pov.on}|${S.phase}|${power}`;
  if (key === S.hudKey) return;
  S.hudKey = key;
  ctx.setHud({ arenaScore: `${S.score.me}–${S.score.foe}`, arenaBanner: S.banner, arenaTiming: S.timing, arenaPov: S.pov.on ? 1 : 0, arenaPhase: S.phase, arenaPower: power });
}

/** The aim of my strike: the view in POV; else the stick if it is pushed, the goal he attacks if not. */
function myAim(ctx: ModeContext, S: St): { yaw: number; curl: number } {
  const g = goalOf(S.me.attacks);
  const toGoal = yawTo(S.me.node.position, g);
  if (S.pov.on) return { yaw: S.pov.view.yaw, curl: Math.max(-1, Math.min(1, S.input.lx)) };
  const { lx, ly } = S.input;
  if (Math.hypot(lx, ly) < 0.3) return { yaw: S.me.yaw, curl: 0 };
  const w = ctx.camDirector.stickWorldLatched(lx, ly, 0.15, false);
  const stickYaw = Math.atan2(w.x, w.z);
  // the stick toward the goal aims; its push across that line is the curl (right of the aim bends right)
  let d = stickYaw - toGoal;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) < 1.2 ? { yaw: toGoal + d * 0.5, curl: Math.max(-1, Math.min(1, d / 0.9)) } : { yaw: stickYaw, curl: 0 };
}

export const PhysicsArenaSoccerMode: ModeDefinition = {
  modeId: ARENA_SOCCER_MODE_ID,
  mood: 'goldenHour',
  camPreset: 'soccer',

  async load(ctx: ModeContext) {
    const scene = ctx.scene;
    const pitch = mountSoccerPitch(scene);
    const ballMesh = MeshBuilder.CreateSphere('ball', { diameter: SOCCER_BALL.r * 2, segments: 16 }, scene);
    const bm = new PBRMaterial('arena_soccer_ball_mat', scene);
    bm.albedoColor = Color3.FromHexString('#f2f2f2'); bm.roughness = 0.6; bm.metallic = 0;
    ballMesh.material = bm;
    void dressBall(ballMesh, 'soccer');   // the Meshy ball skin rides the physics sphere (drawing only)
    const world = await ArenaPhysics.create(scene, { hoop: false, ballNode: ballMesh, ball: SOCCER_SPEC });
    if (scene.isDisposed) { world.dispose(); return; }
    buildSoccerColliders(world);
    const mkNode = (name: string, z: number) => { const n = new TransformNode(name, scene); n.position.set(0, 0, z); return n; };
    const meNode = mkNode('arena_soccer_me', -1), foeNode = mkNode('arena_soccer_foe', 4);
    const meBody = world.addPlayer('me', meNode, { mass: 78, radius: 0.28 }), foeBody = world.addPlayer('foe', foeNode, { mass: 80, radius: 0.28 });
    const meView = new TransformNode('arena_soccer_me_view', scene), foeView = new TransformNode('arena_soccer_foe_view', scene);
    const [meChar, foeChar] = await Promise.all([
      CharacterPipeline.spawnPlayer(scene, DUNK_CONFIG.heroUrl, { position: Vector3.Zero(), yawRad: 0, startClip: 'idle_stand', modeId: ARENA_SOCCER_MODE_ID }).catch(() => null),
      CharacterPipeline.spawnNpc(scene, DUNK_CONFIG.heroUrl, { position: Vector3.Zero(), yawRad: 0, startClip: 'idle_stand', modeId: ARENA_SOCCER_MODE_ID, name: 'Rival', tint: '#F25F5C' }).catch(() => null),
    ]);
    if (scene.isDisposed) { world.dispose(); return; }
    for (const [c, v] of [[meChar, meView], [foeChar, foeView]] as const) {
      if (!c) continue;
      installSafePlay(c.animator, ARENA_SOCCER_MODE_ID);
      c.root.parent = v; c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0); c.root.rotationQuaternion = null;
    }
    const mk = (who: Who, node: TransformNode, body: ArenaPlayer, view: TransformNode, char: SpawnedCharacter | null, attacks: End): Athlete =>
      ({ who, node, body, view, char, head: char ? boneNode(char.skeleton, 'Head') : null, yaw: 0, clip: '', clipHoldT: 0, wish: { x: 0, z: 0 }, kick: null, touchCd: 0, tackleCd: 0, attacks });
    const S: St = {
      scene, world, pitch, ballMesh, me: mk('me', meNode, meBody, meView, meChar, 'north'), foe: mk('foe', foeNode, foeBody, foeView, foeChar, 'south'),
      rng: seeded(0x50cc3), tier: runTier(), t: 0, score: { me: 0, foe: 0 }, phase: 'kickoff', phaseT: 0, kicker: 'me', conceded: 'me', lastTouch: null, lastTouchAt: 0,
      prevBall: { x: 0, y: SOCCER_BALL.r, z: 0 }, input: { lx: 0, ly: 0, rx: 0, ry: 0, sprint: false },
      pov: { on: false, view: { yaw: 0, pitch: 0, bobPhase: 0 }, savedFov: ctx.camera.fov }, camModeSeen: ctx.camDirector.mode,
      ai: { reactAt: 0, aimX: 0.6, curl: 0 }, banner: '', bannerT: 0, timing: '', hudKey: '',
      stats: { shots: { me: 0, foe: 0 }, goals: { me: 0, foe: 0 }, touches: { me: 0, foe: 0 }, tackles: { me: 0, foe: 0 }, posts: 0, whiffs: 0, drops: 0 },
      game: { t0: 0, log: { v: 1, goals: [] } }, final: null, aiQuiet: false, seam: null, disposed: false,
    };
    states.set(scene, S); current = S;
    setupKickoff(S, 'me');
    for (const a of [S.me, S.foe]) { a.view.position.copyFrom(a.node.position); a.view.rotation.y = a.yaw; }
    ctx.heroRef.current = meView;
    ctx.objectiveRef.current = goalVec('north');
    ctx.camDirector.snapTo(meNode.position, goalVec('north'));
    scene.onDisposeObservable.addOnce(() => close(scene));
    // the probe seam (headless tests: arenaSoccerSeam; the browser rig: window.__ARENA_SOCCER__ on dev / agent runs)
    S.seam = {
      state: () => ({ phase: S.phase, score: { ...S.score }, t: S.t, ball: p3(S.world.ball.pos), me: p3(S.me.node.position), foe: p3(S.foe.node.position), stats: JSON.parse(JSON.stringify(S.stats)), timing: S.timing }),
      /** Me at (x, z) facing the goal I attack, the ball at my foot (+ `offM` further ahead), live, still. */
      place: (x: number, z: number, offM?: number) => {
        S.phase = 'live'; S.phaseT = 0;
        S.me.body.teleport({ x, y: 0, z }); S.me.yaw = yawTo({ x, z }, goalOf(S.me.attacks));
        S.foe.body.teleport({ x: x > 0 ? -6 : 6, y: 0, z: 0 });
        const f = footPoint(S.me), fx = Math.sin(S.me.yaw), fz = Math.cos(S.me.yaw);
        S.world.ball.teleport({ x: f.x + fx * (offM ?? 0), y: SOCCER_BALL.r, z: f.z + fz * (offM ?? 0) });
        S.prevBall = p3(S.world.ball.pos); S.lastTouch = 'me'; S.me.kick = null;
      },
      /** Wind up a kick of `kind` and release it after `holdSec` toward yaw `aimYaw` with `curl` (the test's strike). */
      kick: (kind: KickKind, power: number, aimYaw: number, curl: number) => {
        S.me.kick = { kind, t: power * WIND_SEC, aiAt: 0 };
        releaseKick(S, S.me, aimYaw, curl);
      },
      quiet: (on: boolean) => { S.aiQuiet = on; },
      pov: () => togglePov(ctx, S),
    };
    if (typeof window !== 'undefined' && devOrAgentHooks()) (window as unknown as { __ARENA_SOCCER__?: unknown }).__ARENA_SOCCER__ = S.seam;
  },

  onPlay(ctx: ModeContext) { const S = states.get(ctx.scene); if (S) S.tier = runTier(); },

  onInput(ctx: ModeContext, e: FelInput) {
    const S = states.get(ctx.scene);
    if (!S) return;
    if (e.t === 'stick') { if (e.side === 'L') { S.input.lx = e.x; S.input.ly = e.y; } else { S.input.rx = e.x; S.input.ry = e.y; } return; }
    if (e.t === 'trigger' && e.side === 'R') { S.input.sprint = e.value > 0.4; return; }
    if (e.t !== 'button') return;
    if (e.btn === 'R1') { S.input.sprint = e.pressed; return; }
    const me = S.me;
    const live = S.phase === 'live' || (S.phase === 'kickoff' && S.kicker === 'me');
    if (e.btn === 'X' || e.btn === 'A') {
      // X: the shot, A: the pass — hold to wind up, let go to strike
      if (e.pressed) { if (live && !me.kick) me.kick = { kind: e.btn === 'X' ? 'shot' : 'pass', t: 0, aiAt: 0 }; }
      else if (me.kick && me.kick.kind === (e.btn === 'X' ? 'shot' : 'pass')) { const aim = myAim(ctx, S); releaseKick(S, me, aim.yaw, aim.curl); }
      return;
    }
    if (!e.pressed) return;
    if (e.btn === 'B' || e.btn === 'Y') { if (live) tackle(S, me); }
  },

  update(ctx: ModeContext, dt: number) {
    const S = states.get(ctx.scene);
    if (!S || S.disposed) return;
    // the game on the physics clock (the arena's rule: a frame the step cap cut short slows the game, not the strike's timing)
    S.world.step(dt, (h) => { S.t = S.world.time; beforeStep(ctx, S, h); }, () => afterStep(S));
    const simDt = S.world.stats.steps / stepHz();
    S.t = S.world.time;
    if (S.me.kick) S.me.kick.t += simDt;
    aiDecide(S, simDt);
    frameRules(S, simDt);
    // a finished game to the page (it posts the run; the server rebuilds the score from the goal log); play goes on
    if (S.final) { const f = S.final; S.final = null; ctx.card?.(f.won ? 'WIN' : 'LOSS', f.me, { opponentScore: f.foe, won: f.won ? 1 : 0 }, { arena: f.log, opponentScore: f.foe, won: f.won }); }
    facing(S, simDt);
    camera(ctx, S, dt);
    hud(ctx, S, dt);
  },

  dispose() { if (current && current.scene.isDisposed) close(current.scene); },
};

/** The probe seam for a scene (place, kick, quiet, pov, state). */
export function arenaSoccerSeam(scene: Scene): Record<string, (...a: never[]) => unknown> | null { return states.get(scene)?.seam ?? null; }

/** The soccer's counters for a scene (the headless test reads them). */
export function arenaSoccerStats(scene: Scene): (St['stats'] & { score: Record<Who, number> }) | null {
  const S = states.get(scene);
  return S ? { ...JSON.parse(JSON.stringify(S.stats)), score: { ...S.score } } : null;
}

function close(scene: Scene): void {
  const S = states.get(scene);
  if (!S || S.disposed) return;
  S.disposed = true;
  S.world.dispose();
  S.pitch.dispose();
  states.delete(scene);
  if (current === S) current = null;
  if (typeof window !== 'undefined') delete (window as unknown as { __ARENA_SOCCER__?: unknown }).__ARENA_SOCCER__;
}
