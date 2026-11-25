// PhysicsArenaSoccer3v3Mode — the Physics Arena's soccer, slice 2: three outfield players and a keeper a side in the same cage, first
// to 5 (docs/PHYSICS-ARENA-PLAN.md §9; arena.soccer3v3). The ball, the goals, the touches, the tackle and the strike are slice 1's
// (arenaPhysics SOCCER_SPEC, soccerPitch, soccerKick); what is new:
//   THE KEEPERS  a body and two gloved physics hands (arenaPhysics ArenaHands, 13 cm): the keeper stands on the line from the ball to
//                his goal's centre, reads a shot after his reaction time (the owner's 420 / 220 / 120 ms) and throws his hands at
//                where it will cross; a SAVE is the contact (the ball goes where the glove sends it), never a roll of the dice. A slow
//                ball at his hands is held, then thrown out to the most open team-mate.
//   PASSING      A is a pass to the team-mate the stick points at (the most open one with the stick at rest): a strike of the pass
//                kind (soccerKick), led to where he is running; the hold is its pace. AI passes are the same strike.
//   THE TEAM     the player plays one outfielder; when his side loses the ball the control moves to the team-mate nearest it (L1 now).
//                AI outfielders: the carrier runs at goal, passes when pressed, shoots from range; the others support wide and
//                ahead; defenders press the ball (the nearest) and mark (the rest, goal-side).
// No session is posted yet (the arena's soccer XP is the 1v1's; the 3v3's is a later step).

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
import { ArenaPhysics, SOCCER_SPEC, type ArenaHands, type ArenaPlayer } from '../arena/arenaPhysics';
import { buildSoccerColliders, mountSoccerPitch, type SoccerPitch } from '../arena/soccerPitch';
import { GOAL, PITCH, SOCCER_BALL, goalCrossingAt, goalLineZ, type End } from '../arena/soccerGeometry';
import { FOOT_AHEAD_M, WIND_SEC, strike, type KickKind } from '../arena/soccerKick';
import { seeded } from '../arena/shotModel';
import type { P3 } from '../arena/hoopGeometry';
import { arenaBodyLodOn, arenaTeamRingsOn, povBobM, povEyeM, povFovDeg, povLookDegS, povOn, stepHz } from '../arena/arenaConfig';
import { mountBodyLod, type BodyLodHandle } from '../arena/bodyLod';
import { AWAY_RING, HOME_RING, mountTeamRings, type TeamRingsHandle } from '../arena/teamRings';
import { applyPov, fovForAspect, povLook, povPose, type PovView } from '../arena/povCamera';
import { SCORED_SEC, SOCCER_GAME_TO, SOCCER_RIVAL } from './PhysicsArenaSoccerMode';

export const ARENA_SOCCER_3V3_MODE_ID = 'physics_arena_soccer_3v3';
const JOG = 5.0, SPRINT = 7.0, DRIVE_ACCEL = 28, KEEPER_ACCEL = 55;
const TOUCH_R = 0.36, TOUCH_GAP_SEC = 0.26, TOUCH_LEAD = 1.32;
const TACKLE_REACH_M = 1.25, TACKLE_GAP_SEC = 0.9;
const OVER_SEC = 3.0;
/** A keeper's gloved hand (m): bigger than an outfielder's bare one (arenaPhysics HAND_R 7 cm). */
export const GLOVE_R = 0.13;
/** A keeper holds a ball at his hands slower than this (m/s, relative); a harder one is parried by the contact alone. */
const CATCH_MPS = 7.5;
/** He holds a caught ball this long before he throws it out (s). */
const HOLD_SEC = 1.2;
/** The keeper stands this far off his line, at most this wide of the centre (m). */
const KEEPER_OFF_M = 0.7, KEEPER_MAX_X = 1.3;
/** A keeper's hands reach at most this far from his chest (m; arms and a dive's stretch, his body slides with them). */
export const KEEPER_REACH_M = 0.9;
/** A keeper's hands in a dive (m/s): about half a guard's swipe (arenaPhysics HAND_MAX_MPS 12), and his body across the line at
 *  most this (m/s) while he goes for a shot. Measured against the keeper-less control (scripts/physics-arena-tests.ts S). */
export const KEEPER_HAND_MPS = 4.0, KEEPER_DIVE_MPS = 2.0;
/** His read of where a shot crosses is off by a normal error of the tier's scatter (SOCCER_RIVAL) times this (m). */
export const KEEPER_READ_ERR = 1.5;
/** A dive accelerates: τ s after his reaction a glove is at most ½·a·τ² from where it rested (a in m/s²). */
export const KEEPER_DIVE_ACCEL = 10;
/** His area: a loose ball this close to his goal's centre (m, across and out) is his to gather when he is the nearest. */
const KEEPER_AREA_M = 3.0;
/** A pass lane is clear with no opponent this close to its line (m: a body and a stretched leg). */
const LANE_M = 0.9;
/** …and a shot's (a driven ball: only a body in its line blocks it). */
const SHOT_LANE_M = 0.5;
/** A clearance's least power (a pass over 0.7 is lofted: soccerKick). */
const CLEAR_POWER = 0.75;
/** A ball dead this long in live play (pinned in a corner, two bodies on it) is dropped 1.5 m inside the boards (s). */
const STALL_SEC = 4;

type Team = 'home' | 'away';
type Phase = 'kickoff' | 'live' | 'scored' | 'over';
const otherTeam = (t: Team): Team => (t === 'home' ? 'away' : 'home');
/** Home attacks north. */
const attacks = (t: Team): End => (t === 'home' ? 'north' : 'south');
const defends = (t: Team): End => (t === 'home' ? 'south' : 'north');

interface Pl {
  i: number;
  team: Team;
  keeper: boolean;
  node: TransformNode;
  body: ArenaPlayer;
  hands: ArenaHands | null;
  view: TransformNode;
  char: SpawnedCharacter | null;
  head: TransformNode | null;
  yaw: number;
  clip: string;
  clipHoldT: number;
  wish: { x: number; z: number };
  kick: { kind: KickKind; t: number; aiAt: number; to: number; side?: number } | null;
  touchCd: number;
  tackleCd: number;
  reactAt: number;
  /** A keeper's misread of the shot he is going for (m, across). */
  readErr: number;
  /** A keeper takes no catch before this (his own throw is leaving him). */
  noCatchUntil: number;
  /** A carrier going round the ball to get behind it (aiWish). */
  round: boolean;
}

interface St {
  scene: Scene;
  world: ArenaPhysics;
  pitch: SoccerPitch;
  ballMesh: Mesh;
  pl: Pl[];
  /** The outfielder the player controls (index into pl). */
  ctrl: number;
  ctrlAt: number;
  rng: ReturnType<typeof seeded>;
  tier: Tier;
  t: number;
  score: Record<Team, number>;
  phase: Phase;
  phaseT: number;
  kicker: Team;
  conceded: Team;
  lastTouch: Pl | null;
  /** A keeper holding the ball, and since when. */
  holder: Pl | null;
  heldAt: number;
  /** The last strike toward a goal: its team and when (a keeper's touch soon after it is a save). */
  shotBy: Team | null;
  shotAt: number;
  calledAt: number;
  prevBall: P3;
  input: { lx: number; ly: number; rx: number; ry: number; sprint: boolean };
  pov: { on: boolean; view: PovView; savedFov: number };
  camModeSeen: CamMode;
  banner: string;
  bannerT: number;
  timing: string;
  hudKey: string;
  /** Where the ball last moved, and when (a dead ball for STALL_SEC is dropped back into play). */
  stillAt: P3;
  stillSince: number;
  stats: { shots: Record<Team, number>; onTarget: Record<Team, number>; goals: Record<Team, number>; passes: number; completed: number; saves: Record<Team, number>; catches: number; tackles: number; touches: number; posts: number; whiffs: number; drops: number; half: Record<Team, number> };
  /** The last passer (a team-mate's next touch completes his pass). */
  ball2pass: Pl | null;
  /** Who that pass is for (index into pl; -1 none). */
  passTo: number;
  /** The last shot's straight line crossed the goal mouth (a keeper's touch on it is a save). */
  shotOnTarget: boolean;
  /** Probe seam: the AI plays the player's side too (the headless match). */
  autoHome: boolean;
  aiQuiet: boolean;
  /** Probe seam: the keepers stand still with their hands at rest (the keeper-less control for the saves test). */
  keepersOff: boolean;
  seam: Record<string, (...a: never[]) => unknown> | null;
  /** The phone's body budget (arena.bodyLod) and the team rings (arena.teamRings), when on. */
  lod: BodyLodHandle | null;
  rings: TeamRingsHandle | null;
  disposed: boolean;
}

const states = new WeakMap<Scene, St>();
let current: St | null = null;
const TMP = new Vector3(), TMP2 = new Vector3();
const p3 = (v: { x: number; y: number; z: number }): P3 => ({ x: v.x, y: v.y, z: v.z });
const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const yawTo = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z);
const goalOf = (end: End): P3 => ({ x: 0, y: 0, z: goalLineZ(end) });
const goalVec = (end: End) => new Vector3(0, 1, goalLineZ(end));
function slewYaw(cur: number, want: number, rate: number, dt: number): number {
  let d = want - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, rate * dt);
}
const say = (S: St, text: string, sec = 1.4) => { S.banner = text; S.bannerT = sec; };
const me = (S: St): Pl => S.pl[S.ctrl];
/** The player's man (the one his stick drives). */
const human = (S: St, a: Pl): boolean => !S.autoHome && a.team === 'home' && a.i === S.ctrl;
/** A team-mate's touch completes a pass; anyone else's ends it. */
function received(S: St, a: Pl): void {
  if (S.ball2pass && S.ball2pass !== a && S.ball2pass.team === a.team) S.stats.completed++;
  if (S.ball2pass !== a) { S.ball2pass = null; S.passTo = -1; }
}
/** Clamp a point to within `r` of `c`. */
function within(c: P3, t: P3, r: number): P3 {
  const dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z, d = Math.hypot(dx, dy, dz);
  if (d <= r) return t;
  const k = r / d;
  return { x: c.x + dx * k, y: Math.max(0.1, c.y + dy * k), z: c.z + dz * k };
}
const mates = (S: St, a: Pl) => S.pl.filter((x) => x.team === a.team && x !== a);
const field = (S: St, t: Team) => S.pl.filter((x) => x.team === t && !x.keeper);
/** A spot in the shape to the world (z flips for the away side). */
const spotWorld = (a: Pl, sx: number, sz: number) => (a.team === 'home' ? { x: sx, z: sz } : { x: -sx, z: -sz });
function footPoint(a: Pl): P3 {
  const p = a.node.position;
  return { x: p.x + Math.sin(a.yaw) * FOOT_AHEAD_M, y: SOCCER_BALL.r, z: p.z + Math.cos(a.yaw) * FOOT_AHEAD_M };
}
function playClip(a: Pl, clip: string, loop = true, hold = 0): void {
  if (!a.char || a.clip === clip) return;
  a.clip = clip; a.clipHoldT = hold;
  a.char.animator.play(clip, { loop, fadeSec: 0.12 });
}
/** How open a player is: the nearest opponent's distance. */
const openness = (S: St, a: Pl) => Math.min(...S.pl.filter((x) => x.team !== a.team).map((x) => flat(x.node.position, a.node.position)));

// ── kick-offs and goals ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The shape at a kick-off: (x, z) in the side's own frame (negative z is its own half). The first outfielder is the kick-off taker. */
const SHAPE: ReadonlyArray<{ x: number; z: number }> = [{ x: 0, z: -1 }, { x: -4.5, z: -4.5 }, { x: 4.5, z: -4.5 }];

function setupKickoff(S: St, kicker: Team): void {
  S.phase = 'kickoff'; S.phaseT = 0; S.kicker = kicker;
  for (const a of S.pl) {
    a.kick = null; a.touchCd = 0; a.tackleCd = 0; a.reactAt = 0;
    if (a.keeper) { const g = goalLineZ(defends(a.team)); a.body.teleport({ x: 0, y: 0, z: g + (a.team === 'home' ? KEEPER_OFF_M : -KEEPER_OFF_M) }); a.yaw = a.team === 'home' ? 0 : Math.PI; continue; }
    const k = field(S, a.team).indexOf(a), sh = SHAPE[k];
    // the taker at the ball; the others (and the other side's front man) outside the circle
    const w = spotWorld(a, sh.x, k === 0 ? (a.team === kicker ? -0.75 : -4) : sh.z);
    a.body.teleport({ x: w.x, y: 0, z: w.z });
    a.yaw = yawTo(a.node.position, { x: 0, z: 0 });
  }
  S.world.ball.teleport({ x: 0, y: SOCCER_BALL.r, z: 0 });
  S.prevBall = { x: 0, y: SOCCER_BALL.r, z: 0 };
  S.world.ball.collideAll();
  S.lastTouch = null; S.holder = null; S.shotBy = null; S.ball2pass = null; S.passTo = -1;
  if (kicker === 'home') S.ctrl = field(S, 'home')[0].i;
  say(S, kicker === 'home' ? 'Your kick-off' : 'Their kick-off', 1.2);
}

function scored(S: St, by: Team): void {
  S.score[by]++; S.stats.goals[by]++; S.conceded = otherTeam(by);
  S.phase = 'scored'; S.phaseT = 0; S.holder = null;
  say(S, by === 'home' ? 'GOAL' : 'They score', SCORED_SEC);
  SoundKit.play('swish', { volume: 0.6 });
  if (S.lastTouch && S.lastTouch.team === by) playClip(S.lastTouch, 'soccer_goal_celebrate', false, 1.6);
  if (S.score[by] >= SOCCER_GAME_TO) { S.phase = 'over'; S.phaseT = 0; say(S, `${by === 'home' ? 'You win' : 'They win'} ${S.score.home}–${S.score.away}`, OVER_SEC); }
}

// ── the feet ────────────────────────────────────────────────────────────────────────────────────────────────────────────

function setTouch(S: St, a: Pl): void {
  S.lastTouch = a; S.stats.touches++;
  if (S.phase === 'kickoff') { S.phase = 'live'; S.phaseT = 0; }
}

function touches(S: St, h: number): void {
  if (S.phase === 'scored' || S.phase === 'over' || S.holder) return;
  const ball = S.world.ball, bp = ball.pos;
  if (bp.y > 0.45) return;
  const bv = ball.vel(TMP2);
  for (const a of S.pl) {
    a.touchCd -= h;
    if (a.kick || a.touchCd > 0) continue;
    const f = footPoint(a);
    if (Math.hypot(bp.x - f.x, bp.z - f.z) > TOUCH_R) continue;
    const v = a.body.vel(TMP), sp = Math.hypot(v.x, v.z), fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    if (sp > 1.0) {
      if ((v.x * fx + v.z * fz) / sp < 0.3) continue;
      ball.launch({ x: v.x * TOUCH_LEAD + fx * 0.4, y: 0.2, z: v.z * TOUCH_LEAD + fz * 0.4 });
    } else {
      if (Math.hypot(bv.x - v.x, bv.z - v.z) < 0.3) continue;
      ball.launch({ x: v.x + (bv.x - v.x) * 0.15, y: 0, z: v.z + (bv.z - v.z) * 0.15 });
    }
    a.touchCd = TOUCH_GAP_SEC;
    received(S, a);
    setTouch(S, a);
    break;
  }
}

function shielded(S: St, a: Pl): boolean {
  const b = S.world.ball.pos;
  return S.pl.some((o) => o.team !== a.team && flat(footPoint(o), b) + 0.15 < flat(footPoint(a), b) && flat(o.node.position, a.node.position) < flat(a.node.position, b));
}

function tackle(S: St, a: Pl): void {
  if (a.tackleCd > 0 || a.kick || a.keeper || S.holder || S.phase === 'scored' || S.phase === 'over') return;
  a.tackleCd = human(S, a) ? TACKLE_GAP_SEC : SOCCER_RIVAL[S.tier].tackleGapSec;
  playClip(a, 'soccer_tackle_slide', false, 0.5);
  const ball = S.world.ball, b = ball.pos, f = footPoint(a);
  if (flat(b, f) > TACKLE_REACH_M || b.y > 0.6 || shielded(S, a)) return;
  const carrier = S.lastTouch && S.lastTouch.team !== a.team ? S.lastTouch.node.position : a.node.position;
  const dx = b.x - carrier.x, dz = b.z - carrier.z, d = Math.hypot(dx, dz) || 1;
  ball.launch({ x: (dx / d) * 4.2 + Math.sin(a.yaw) * 1.5, y: 0.6, z: (dz / d) * 4.2 + Math.cos(a.yaw) * 1.5 });
  received(S, a); setTouch(S, a); S.stats.tackles++;
  a.touchCd = 0.3;
  SoundKit.play('impact', { volume: 0.25 });
}

/** The release: a strike at `aimYaw` (a shot) or at a team-mate (`to`, a pass led to his run). */
function releaseKick(S: St, a: Pl, aimYaw: number, curl: number): void {
  if (!a.kick) return;
  const kind = a.kick.kind, power = Math.min(1, a.kick.t / WIND_SEC), to = a.kick.to;
  a.kick = null;
  playClip(a, kind === 'shot' ? 'soccer_kick_shoot' : 'soccer_kick_pass', false, 0.45);
  const ball = S.world.ball, f = footPoint(a);
  let yaw = aimYaw;
  if (kind === 'pass' && to >= 0) {
    const m = S.pl[to], mv = m.body.vel(TMP), d = flat(m.node.position, ball.pos);
    const lead = d / (5 + 14 * power);   // the ball's time to him, about: where he will be
    yaw = yawTo(ball.pos, { x: m.node.position.x + mv.x * lead, z: m.node.position.z + mv.z * lead });
  }
  const off = Math.hypot(ball.pos.x - f.x, ball.pos.z - f.z) + Math.max(0, ball.pos.y - 0.5);
  const out = strike({ kind, power, aimYaw: yaw, curl, offFootM: off, normal: S.rng.normal });
  if (!out.contact) { S.stats.whiffs++; return; }
  const bv = ball.vel(TMP2);
  ball.launch({ x: out.vel.x + bv.x * 0.25, y: out.vel.y, z: out.vel.z + bv.z * 0.25 }, out.spin);
  ball.ignore(a.body.bit, 0.25);
  setTouch(S, a); a.touchCd = 0.3;
  if (kind === 'shot') {
    S.stats.shots[a.team]++; S.shotBy = a.team; S.shotAt = S.t;
    const c = crossing(p3(ball.pos), p3(ball.vel(TMP2)), goalLineZ(attacks(a.team)));
    S.shotOnTarget = !!c && Math.abs(c.x) < GOAL.halfW && c.y < GOAL.h;
    if (S.shotOnTarget) S.stats.onTarget[a.team]++;
  } else { S.stats.passes++; S.ball2pass = a; S.passTo = to; }
  if (human(S, a)) S.timing = `${kind}, ${Math.round(power * 100)} % power, ${out.quality > 0.95 ? 'clean' : out.quality > 0.6 ? 'off the sweet spot' : 'scuffed'}`;
  SoundKit.play('whoosh', { volume: 0.2 + 0.2 * power });
}

// ── the keepers ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Where a ball now at `p` moving at `v` crosses the plane z = zPlane (straight line in x, gravity in y), or null. */
function crossing(p: P3, v: P3, zPlane: number): { x: number; y: number; t: number } | null {
  if (Math.abs(v.z) < 0.5) return null;
  const t = (zPlane - p.z) / v.z;
  if (t < 0 || t > 2.5) return null;
  return { x: p.x + v.x * t, y: Math.max(SOCCER_BALL.r, p.y + v.y * t - 4.9 * t * t), t };
}

function keepers(S: St, h: number): void {
  const ball = S.world.ball, b = ball.pos, bv = ball.vel(TMP2);
  for (const k of S.pl) {
    if (!k.keeper || !k.hands) continue;
    const prof = SOCCER_RIVAL[S.tier];
    const lineZ = goalLineZ(defends(k.team)), out = k.team === 'home' ? 1 : -1;
    const standZ = lineZ + out * KEEPER_OFF_M;
    const p = k.node.position, fwd = out;
    const rest = { l: { x: p.x - 0.32, y: 1.05, z: p.z + fwd * 0.3 }, r: { x: p.x + 0.32, y: 1.05, z: p.z + fwd * 0.3 } };
    if (S.keepersOff || S.phase === 'scored' || S.phase === 'over') {
      k.hands.target(rest.l, rest.r, false);
      if (k.body.grounded) k.body.drive(0, 0, h, KEEPER_ACCEL);
      continue;
    }
    if (S.holder === k) {
      const at = { x: p.x, y: 1.15, z: p.z + fwd * 0.35 };
      ball.hold(at);
      k.hands.target({ x: at.x - 0.12, y: at.y, z: at.z }, { x: at.x + 0.12, y: at.y, z: at.z }, false);
      if (k.body.grounded) k.body.drive(0, 0, h, KEEPER_ACCEL);
      continue;
    }
    // a shot at his goal: the crossing of his standing plane, read after his reaction time
    const toward = bv.z * -out > 4;
    const c = toward ? crossing(p3(b), p3(bv), p.z) : null;
    const onTarget = c && Math.abs(c.x) < GOAL.halfW + 0.7 && c.y < GOAL.h + 0.6;
    let wantX = Math.max(-KEEPER_MAX_X, Math.min(KEEPER_MAX_X, (b.x * KEEPER_OFF_M * 2.2) / Math.max(1.5, Math.abs(b.z - lineZ))));
    if (onTarget) {
      if (k.reactAt === 0) { k.reactAt = S.t + prof.reactSec; k.readErr = S.rng.normal() * prof.scatter * KEEPER_READ_ERR; }
      if (S.t >= k.reactAt && c) {
        c.x += k.readErr;
        wantX = Math.max(-GOAL.halfW, Math.min(GOAL.halfW, c.x));
        // each glove: toward the read, within his reach of the chest and within the dive's ½·a·τ² of where it rested
        const hy = Math.min(2.3, Math.max(0.15, c.y)), chest = { x: p.x, y: 1.25, z: p.z }, tau = S.t - k.reactAt;
        const dive = 0.5 * KEEPER_DIVE_ACCEL * tau * tau;
        const glove = (want: P3, from: P3) => within(from, within(chest, want, KEEPER_REACH_M), dive);
        k.hands.target(glove({ x: c.x - 0.14, y: hy, z: p.z + fwd * 0.25 }, rest.l), glove({ x: c.x + 0.14, y: hy, z: p.z + fwd * 0.25 }, rest.r), true);
        // a dive to his right or left (Babylon is left-handed: facing +z, his right is +x)
        if (Math.abs(c.x - p.x) > 0.6) playClip(k, (c.x - p.x) * fwd > 0 ? 'keeper_dive_right' : 'keeper_dive_left', false, 0.8);
      } else k.hands.target(rest.l, rest.r, false);
    } else {
      k.reactAt = 0;
      k.hands.target(rest.l, rest.r, false);
    }
    // a slow loose ball in his area with nobody nearer: he comes off his line and gathers it (the catch below)
    let goZ = standZ;
    const loose = !onTarget && Math.hypot(bv.x, bv.z) < 4 && Math.abs(b.x) < KEEPER_AREA_M && Math.abs(b.z - lineZ) < KEEPER_AREA_M && b.y < 1
      && S.pl.every((o) => o === k || flat(o.node.position, b) > flat(p, b));
    if (loose && S.phase === 'live') { wantX = b.x; goZ = out > 0 ? Math.max(lineZ + 0.3, b.z - 0.45) : Math.min(lineZ - 0.3, b.z + 0.45); }
    // the body: across his line to the ball's line (a dive is a hard drive)
    const dx = wantX - p.x, dz = goZ - p.z;
    const sp = onTarget ? KEEPER_DIVE_MPS : 3.5;
    const d = Math.hypot(dx, dz);
    if (k.body.grounded) k.body.drive(d < 0.05 ? 0 : (dx / d) * Math.min(sp, d * 5), d < 0.05 ? 0 : (dz / d) * Math.min(sp, d * 5), h, KEEPER_ACCEL);
    // the catch: a ball slow enough at his gloves is held
    const kv = k.body.vel(TMP);
    const near = Math.hypot(b.x - p.x, b.z - (p.z + fwd * 0.3)) < 0.75 && b.y < 2.2;
    // a ball coming to him (or all but still), never one going away from him
    const coming = (bv.x * (p.x - b.x) + bv.z * (p.z - b.z)) > 0 || Math.hypot(bv.x, bv.z) < 1.5;
    if (near && coming && S.t >= k.noCatchUntil && Math.hypot(bv.x - kv.x, bv.y, bv.z - kv.z) < CATCH_MPS && S.phase === 'live') {
      S.holder = k; S.heldAt = S.t; S.stats.catches++;
      received(S, k);
      if (S.shotBy && S.shotBy !== k.team && S.shotOnTarget && S.t - S.shotAt < 2.5) { S.stats.saves[k.team]++; say(S, k.team === 'home' ? 'Saved' : 'Saved by the keeper', 0.9); }
      S.shotBy = null;
      ball.ignore(k.body.bit);
      setTouch(S, k);
    }
  }
  // the throw-out: to the most open team-mate
  const k = S.holder;
  if (k && S.t - S.heldAt > HOLD_SEC) {
    const m = bestOption(S, k);
    const p = ball.pos, mp = m.node.position, d = flat(p, mp) || 1, sp = Math.min(13, 6 + d * 0.5);
    ball.launch({ x: ((mp.x - p.x) / d) * sp, y: 1.2, z: ((mp.z - p.z) / d) * sp });
    ball.ignore(k.body.bit, 0.4);
    k.noCatchUntil = S.t + 0.8;
    S.holder = null; S.stats.passes++; S.ball2pass = k; S.passTo = m.i;
  }
}

// ── the runs ────────────────────────────────────────────────────────────────────────────────────────────────────────────

function humanWish(ctx: ModeContext, S: St): { x: number; z: number } {
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

/** The side that has the ball: the team of the last touch while the ball is near that player (else nobody: a loose ball). */
function inPossession(S: St): Team | null {
  if (S.holder) return S.holder.team;
  const lt = S.lastTouch;
  // a keeper's touch that he did not hold (a parry, a block) leaves the ball loose
  return lt && !lt.keeper && flat(S.world.ball.pos, lt.node.position) < 2.2 ? lt.team : null;
}

function aiWish(S: St, a: Pl): { x: number; z: number } {
  if (a.keeper) return { x: 0, z: 0 };   // the keepers drive themselves (keepers())
  if (S.aiQuiet || S.phase === 'scored' || S.phase === 'over') return { x: 0, z: 0 };
  const prof = SOCCER_RIVAL[S.tier], b = S.world.ball.pos, bv = S.world.ball.vel(TMP2);
  const speed = a.team === 'away' ? prof.speed : 5.4;
  const go = (tx: number, tz: number, sp = speed) => {
    // (a spot inside the boards: one behind a ball in a corner is not outside the pitch)
    const x = Math.max(-PITCH.halfW + 0.45, Math.min(PITCH.halfW - 0.45, tx)), z = Math.max(-PITCH.halfL + 0.45, Math.min(PITCH.halfL - 0.45, tz));
    const dx = x - a.node.position.x, dz = z - a.node.position.z, d = Math.hypot(dx, dz);
    return d < 0.2 ? { x: 0, z: 0 } : { x: (dx / d) * Math.min(sp, d * 3), z: (dz / d) * Math.min(sp, d * 3) };
  };
  if (S.phase === 'kickoff') return { x: 0, z: 0 };
  const poss = inPossession(S);
  const g = goalOf(attacks(a.team)), own = goalOf(defends(a.team));
  if (S.lastTouch === a && flat(b, a.node.position) < 1.4) {
    const want = strikeWanted(S, a);
    if (want && !(want.kind === 'shot' && want.pressed)) {
      // setting himself: behind the ball on the strike's line, at a walk (his next touch is a trap, the ball dead at his foot)
      const tp = want.to >= 0 ? S.pl[want.to].node.position : g;
      const dx = tp.x - b.x, dz = tp.z - b.z, d = Math.hypot(dx, dz) || 1;
      return go(b.x - (dx / d) * FOOT_AHEAD_M, b.z - (dz / d) * FOOT_AHEAD_M, 0.9);
    }
    // the carrier: behind the ball he runs through it at goal; on its far side he goes back round behind it
    // (by a board, along it: "behind the ball" on the line from goal would be through the board)
    let ux = g.x - b.x, uz = g.z - b.z;
    if ((b.x > PITCH.halfW - 0.6 && ux < 0) || (b.x < -PITCH.halfW + 0.6 && ux > 0)) ux = 0;
    if ((b.z > PITCH.halfL - 0.6 && uz < 0) || (b.z < -PITCH.halfL + 0.6 && uz > 0)) uz = 0;
    if (ux === 0 && uz === 0) { ux = -b.x; uz = -b.z; }
    const d = Math.hypot(ux, uz) || 1;
    ux /= d; uz /= d;
    const along = (a.node.position.x - b.x) * ux + (a.node.position.z - b.z) * uz;
    // (with hysteresis: he goes round once clearly in front of it, and runs through once clearly behind it)
    if (along > 0.3) a.round = true; else if (along < -0.2) a.round = false;
    if (!a.round) return go(b.x + ux * 3, b.z + uz * 3);
    const side = along > 0.3 ? 0.5 : 0;   // in front of it: round it, not through it
    return go(b.x - ux * 0.7 + uz * side, b.z - uz * 0.7 - ux * side);
  }
  if (S.passTo === a.i) {
    // the pass is for him: onto its line, where it will be in a moment
    return go(b.x + bv.x * 0.45, b.z + bv.z * 0.45);
  }
  const fieldMates = field(S, a.team);
  const nearestToBall = fieldMates.reduce((u, w) => (flat(w.node.position, b) < flat(u.node.position, b) ? w : u));
  if (poss === a.team) {
    // support: wide of the ball and a few metres toward goal, each on his own side
    const k = fieldMates.indexOf(a), side = k === 1 ? -1 : k === 2 ? 1 : (b.x > 0 ? -1 : 1);
    const ahead = a.team === 'home' ? 1 : -1;
    return go(Math.max(-PITCH.halfW + 1, Math.min(PITCH.halfW - 1, b.x * 0.3 + side * 4.5)), Math.max(-PITCH.halfL + 2, Math.min(PITCH.halfL - 2, b.z + ahead * 4)), speed * 0.85);
  }
  if (a === nearestToBall) {
    if (poss === otherTeam(a.team)) {
      // press: goal-side of the ball
      const dx = own.x - b.x, dz = own.z - b.z, d = Math.hypot(dx, dz) || 1;
      return go(b.x + (dx / d) * 1.1, b.z + (dz / d) * 1.1);
    }
    return go(b.x + bv.x * 0.3, b.z + bv.z * 0.3);   // a loose ball: to where it is going
  }
  // mark: the nearest attacker not already marked, goal-side of him
  const theirs = field(S, otherTeam(a.team)).sort((u, w) => flat(u.node.position, a.node.position) - flat(w.node.position, a.node.position));
  const man = theirs[fieldMates.indexOf(a) % theirs.length];
  const mp = man.node.position, dx = own.x - mp.x, dz = own.z - mp.z, d = Math.hypot(dx, dz) || 1;
  return go(mp.x + (dx / d) * 1.6, mp.z + (dz / d) * 1.6, speed * 0.9);
}

/** What an AI carrier wants to do with the ball now: a shot (in range), a pass (pressed, or the player called for it), or nothing
 *  (he dribbles on). */
/** The corner (-1 or 1) an AI shooter has a clear line to past the outfielders (the keeper is the keeper's business), or 0. */
function openCorner(S: St, a: Pl): number {
  const g = goalOf(attacks(a.team)), sides = S.rng.next() < 0.5 ? [-1, 1] : [1, -1];
  return sides.find((sd) => laneClear(S, a, { x: g.x + sd * 0.85 * GOAL.halfW, z: g.z }, false, SHOT_LANE_M)) ?? 0;
}

function strikeWanted(S: St, a: Pl): { kind: KickKind; to: number; called: boolean; pressed: boolean; side?: number; clear?: boolean } | null {
  const g = goalOf(attacks(a.team));
  const range = a.team === 'away' ? SOCCER_RIVAL[S.tier].shootFromM : 10;
  const caller = a.team === 'home' && !S.autoHome ? me(S) : null;
  const called = !!caller && caller !== a && S.t - S.calledAt < 2;
  const pressed = S.pl.some((o) => o.team !== a.team && !o.keeper && flat(o.node.position, a.node.position) < 1.8);
  if (flat(a.node.position, g) < range && !called) {
    const side = openCorner(S, a);
    if (side) return { kind: 'shot', to: -1, called: false, pressed, side };
  }
  if (!pressed && !called) return null;
  const target = called && caller ? caller : options(S, a)[0];
  if (!target) {
    // no lane: in his own half he clears it (lofted, over the press, to the furthest man forward); in theirs he keeps it
    const ahead = a.team === 'home' ? 1 : -1;
    if (ahead * a.node.position.z > 0) return null;
    const front = mates(S, a).filter((m) => !m.keeper).sort((u, w) => ahead * (w.node.position.z - u.node.position.z))[0];
    return { kind: 'pass', to: front.i, called: false, pressed, clear: true };
  }
  return { kind: 'pass', to: target.i, called, pressed };
}

/** The team-mate an AI passes to: open (the nearest opponent's distance, up to 4 m) and forward (metres toward goal, a quarter
 *  as much), the way a side builds from the back. */
function bestOption(S: St, a: Pl): Pl {
  return options(S, a)[0] ?? mates(S, a).filter((m) => !m.keeper)[0];
}
/** The team-mates an AI can pass to (a clear lane), best first. */
function options(S: St, a: Pl): Pl[] {
  const ahead = a.team === 'home' ? 1 : -1;
  const score = (m: Pl) => Math.min(4, openness(S, m)) + 0.25 * ahead * (m.node.position.z - a.node.position.z);
  return mates(S, a).filter((m) => !m.keeper && laneClear(S, a, m)).sort((u, w) => score(w) - score(u));
}
/** No opponent within LANE_M of the ball's straight line to him (past the first 0.3 m). */
function laneClear(S: St, a: Pl, m: Pl | { x: number; z: number }, keepers = true, width = LANE_M): boolean {
  const b = S.world.ball.pos, t = 'node' in m ? m.node.position : m, dx = t.x - b.x, dz = t.z - b.z, len = Math.hypot(dx, dz) || 1;
  return S.pl.every((o) => {
    if (o.team === a.team || (!keepers && o.keeper)) return true;
    const ox = o.node.position.x - b.x, oz = o.node.position.z - b.z, along = (ox * dx + oz * dz) / len;
    if (along < 0.3 || along > len) return true;
    return Math.abs(ox * dz - oz * dx) / len > width;
  });
}

/** The hardest strike an AI shooter takes from `d` metres that still crosses the line under the bar: the clean strike's speed and
 *  lift (soccerKick: 10 + 20·p m/s at 6 + 12·p degrees) flown straight, no drag or spin, under 1.5 m. A shooter keeps it down. */
export function aiShotPower(d: number): number {
  for (let p = 1; p > 0.35; p -= 0.05) {
    const v = 10 + 20 * p, th = ((6 + 12 * p) * Math.PI) / 180, t = d / (v * Math.cos(th));
    if (SOCCER_BALL.r + v * Math.sin(th) * t - 4.9 * t * t < 1.5) return p;
  }
  return 0.35;
}

function aiDecide(S: St, dt: number): void {
  if (S.aiQuiet) return;
  const prof = SOCCER_RIVAL[S.tier], b = S.world.ball.pos;
  if (S.phase === 'kickoff' && S.phaseT > 1.0) {
    const k = field(S, S.kicker)[0];
    if (!human(S, k)) {
      // the AI's kick-off: a touch back to a team-mate
      const m = field(S, S.kicker)[1], d = flat(m.node.position, b) || 1;
      S.world.ball.launch({ x: ((m.node.position.x - b.x) / d) * 7, y: 0, z: ((m.node.position.z - b.z) / d) * 7 });
      setTouch(S, k); S.stats.passes++; S.ball2pass = k; S.passTo = m.i;
    }
    return;
  }
  if (S.phase !== 'live') return;
  for (const a of S.pl) {
    if (a.keeper || human(S, a)) continue;
    if (a.kick) {
      a.kick.t += dt;
      // the release at its hold, or sooner (less power) as the ball starts to leave his foot; if it leaves before most of the
      // hold, he lets the kick go (a bump nobody can take is no pass) and plays on
      const leaving = flat(b, footPoint(a)) > 0.5;   // (outside the 0.45 m a wind-up starts in)
      if (leaving && a.kick.t < 0.6 * a.kick.aiAt) { a.kick = null; continue; }
      if (a.kick.t >= a.kick.aiAt || leaving) {
        const g = goalOf(attacks(a.team));
        // a corner, past the keeper (70–88 % of the way to a post: the 1v1 rival's 55–85 % is for an empty goal), the tier's scatter
        const aimX = (a.kick.side ?? (S.rng.next() < 0.5 ? -1 : 1)) * (0.7 + S.rng.next() * 0.18) * GOAL.halfW + S.rng.normal() * prof.scatter;
        releaseKick(S, a, yawTo(a.node.position, { x: g.x + aimX, z: g.z }), 0);
      }
      continue;
    }
    const atFeet = flat(b, footPoint(a)) < 0.45 && b.y < 0.4 && S.lastTouch === a;
    if (atFeet) {
      // the wind-up starts once he has set himself (the ball all but still beside his foot)
      const want = strikeWanted(S, a), bv = S.world.ball.vel(TMP2), av = a.body.vel(TMP);
      // (once he has set himself: a soft touch, the ball all but still at his foot; the wind-up is a plant for everyone. A shot
      // under pressure goes first time.)
      if (want && ((want.kind === 'shot' && want.pressed) || Math.hypot(bv.x - av.x, bv.z - av.z) < 1.2)) {
        const g = goalOf(attacks(a.team)), d = want.to >= 0 ? flat(S.pl[want.to].node.position, a.node.position) : flat(a.node.position, g);
        a.kick = want.kind === 'shot'
          ? { kind: 'shot', t: 0, aiAt: Math.max(0.2, aiShotPower(d) * WIND_SEC), to: -1, side: want.side }
          : { kind: 'pass', t: 0, aiAt: Math.min(1, Math.max(want.clear ? CLEAR_POWER : 0.15, (d * 0.9 + 1) / 14)) * WIND_SEC, to: want.to };
        if (want.called) S.calledAt = -9;
      }
      continue;
    }
    // a tackle at a ball an opponent is carrying, after his reaction
    // (he jockeys: he goes in on a heavy touch, the ball out from the carrier's foot, or with the carrier near his goal)
    const lt = S.lastTouch;
    const exposed = !!lt && (flat(b, footPoint(lt)) > 0.55 || flat(lt.node.position, goalOf(defends(a.team))) < 7);
    if (lt && lt.team !== a.team && !lt.keeper && exposed && flat(b, footPoint(a)) < TACKLE_REACH_M - 0.2 && a.tackleCd <= 0) {
      if (a.reactAt === 0) a.reactAt = S.t + prof.reactSec;
      if (S.t >= a.reactAt) { tackle(S, a); a.reactAt = 0; }
    } else a.reactAt = 0;
  }
}

/** The control follows the ball: when the player's side has lost it, he plays the team-mate nearest it. */
function autoSwitch(S: St): void {
  if (S.autoHome || S.t - S.ctrlAt < 0.6 || inPossession(S) === 'home' || me(S).kick) return;
  const b = S.world.ball.pos;
  const best = field(S, 'home').reduce((u, w) => (flat(w.node.position, b) < flat(u.node.position, b) ? w : u));
  if (best.i !== S.ctrl && flat(best.node.position, b) + 1.0 < flat(me(S).node.position, b)) { S.ctrl = best.i; S.ctrlAt = S.t; }
}

function beforeStep(ctx: ModeContext, S: St, h: number): void {
  for (const a of S.pl) {
    if (a.keeper) continue;
    let w = human(S, a) ? humanWish(ctx, S) : aiWish(S, a);
    if (S.phase === 'scored' || S.phase === 'over') w = { x: 0, z: 0 };
    if (S.phase === 'kickoff' && a.team !== S.kicker) {
      const p = a.node.position;
      if (Math.hypot(p.x + w.x * h, p.z + w.z * h) < 3.0) w = { x: 0, z: 0 };
    }
    if (a.kick) { w = { x: w.x * 0.35, z: w.z * 0.35 }; }
    const p = a.node.position;
    if ((p.x > PITCH.halfW - 0.4 && w.x > 0) || (p.x < -PITCH.halfW + 0.4 && w.x < 0)) w.x = 0;
    if ((p.z > PITCH.halfL - 0.4 && w.z > 0) || (p.z < -PITCH.halfL + 0.4 && w.z < 0)) w.z = 0;
    a.wish = w;
    if (a.body.grounded) a.body.drive(w.x, w.z, h, DRIVE_ACCEL);
    if (a.tackleCd > 0) a.tackleCd -= h;
  }
  keepers(S, h);
  touches(S, h);
}

function afterStep(S: St): void {
  const now = p3(S.world.ball.pos);
  if ((S.phase === 'live' || S.phase === 'kickoff') && !S.holder) {
    const g = goalCrossingAt(S.prevBall, now);
    if (g) scored(S, g.end === 'north' ? 'home' : 'away');
  }
  S.prevBall = now;
}

function frameRules(S: St, dt: number): void {
  S.phaseT += dt;
  for (const c of S.world.drainContacts()) {
    if (c.surface === 'post' && c.impulse > 0.3) { S.stats.posts++; SoundKit.play('rattle', { volume: Math.min(0.6, 0.2 + c.impulse * 0.1) }); say(S, 'Off the post', 0.8); }
    else if (c.surface === 'boards' && c.impulse > 0.6) SoundKit.play('thud', { volume: Math.min(0.4, 0.1 + c.impulse * 0.05) });
    if (c.surface === 'body' && c.playerId) {
      const a = S.pl[Number(c.playerId)];
      if (!a) continue;
      // a keeper's glove or body on a shot at his goal: a save (where the ball goes is the contact's)
      if (a.keeper && S.shotBy && S.shotBy !== a.team && S.shotOnTarget && S.t - S.shotAt < 2.5) { S.stats.saves[a.team]++; S.shotBy = null; say(S, a.team === 'home' ? 'Saved' : 'Saved by the keeper', 0.9); SoundKit.play('impact', { volume: 0.35 }); }
      received(S, a);
      S.lastTouch = a;
    }
  }
  if (S.phase === 'scored' && S.phaseT > SCORED_SEC) setupKickoff(S, S.conceded);
  if (S.phase === 'over' && S.phaseT > OVER_SEC) { S.score.home = 0; S.score.away = 0; setupKickoff(S, 'home'); }
  const b = S.world.ball.pos;
  const out = Math.abs(b.x) > PITCH.halfW + 0.6 || Math.abs(b.z) > PITCH.halfL + GOAL.depth + 0.6 || (Math.abs(b.z) > PITCH.halfL + 0.6 && Math.abs(b.x) > GOAL.halfW + 0.3) || b.y < -1;
  // (the seconds of live play the ball spends in each side's attacking half: half.home is the north half)
  if (S.phase === 'live') S.stats.half[b.z > 0 ? 'home' : 'away'] += dt;
  if (S.phase !== 'live' || S.holder || flat(b, S.stillAt) > 0.3) { S.stillAt = p3(b); S.stillSince = S.t; }
  else if (S.t - S.stillSince > STALL_SEC) {
    S.world.ball.teleport({ x: Math.max(-PITCH.halfW + 1.5, Math.min(PITCH.halfW - 1.5, b.x)), y: SOCCER_BALL.r, z: Math.max(-PITCH.halfL + 1.5, Math.min(PITCH.halfL - 1.5, b.z)) });
    S.world.ball.launch({ x: 0, y: 3, z: 0 });   // a referee's drop
    S.prevBall = p3(S.world.ball.pos); S.stats.drops++; S.lastTouch = null; S.stillAt = p3(S.world.ball.pos); S.stillSince = S.t;
  }
  if (out && S.phase === 'live' && !S.holder) {
    S.world.ball.teleport({ x: Math.max(-PITCH.halfW + 0.8, Math.min(PITCH.halfW - 0.8, b.x)), y: SOCCER_BALL.r, z: Math.max(-PITCH.halfL + 0.8, Math.min(PITCH.halfL - 0.8, b.z)) });
    S.prevBall = p3(S.world.ball.pos); S.stats.drops++;
  }
}

function facing(S: St, dt: number): void {
  const b = S.world.ball.pos;
  for (const a of S.pl) {
    const v = a.body.vel(TMP), sp = Math.hypot(v.x, v.z);
    let want = a.yaw;
    const mine = human(S, a);
    if (mine && S.pov.on) want = S.pov.view.yaw;
    else if (a.keeper) want = yawTo(a.node.position, b);
    else if (a.kick) want = a.yaw;   // a wind-up holds its stance (the strike's aim is its own: turning would swing the foot off the ball)
    else if (sp > 0.8) want = Math.atan2(v.x, v.z);
    else want = yawTo(a.node.position, b);
    a.yaw = mine && S.pov.on ? want : slewYaw(a.yaw, want, a.kick ? 4 : 10, dt);
    a.view.position.copyFrom(a.node.position);
    a.view.rotation.y = a.yaw;
    if (a.clipHoldT > 0) { a.clipHoldT -= dt; continue; }
    if (a.keeper) { playClip(a, sp > 3.5 ? 'run' : 'keeper_set'); continue; }
    playClip(a, flat(b, a.node.position) < 1.2 && sp > 1.2 ? 'soccer_dribble_jog' : sp > 3.5 ? 'run' : sp > 0.5 ? 'walk' : 'idle_stand');
  }
}

function togglePov(ctx: ModeContext, S: St): void {
  const on = !S.pov.on;
  S.pov.on = on;
  ctx.camDirector.suspended = on;
  for (const a of S.pl) for (const m of a.char?.meshes ?? []) m.isVisible = !(on && a.i === S.ctrl);
  if (on) { S.pov.savedFov = ctx.camera.fov; S.pov.view.yaw = me(S).yaw; S.pov.view.pitch = 0.12; }
  else { ctx.camera.fov = S.pov.savedFov; ctx.camera.minZ = 0.1; ctx.camDirector.snapTo(me(S).node.position, goalVec('north')); }
  say(S, on ? 'POV' : 'Pitch camera', 0.9);
}

function camera(ctx: ModeContext, S: St, dt: number): void {
  if (ctx.camDirector.mode !== S.camModeSeen) {
    if (povOn()) { ctx.camDirector.mode = S.camModeSeen; togglePov(ctx, S); }
    else S.camModeSeen = ctx.camDirector.mode;
  }
  const m = me(S);
  ctx.heroRef.current = m.view;
  if (S.pov.on) {
    povLook(S.pov.view, S.input.rx, S.input.ry, povLookDegS(), dt);
    const v = m.body.vel(TMP), head = m.head;
    const eyeY = head ? Math.min(2.1, Math.max(1.3, head.getAbsolutePosition().y - m.node.position.y + 0.08)) : povEyeM();
    const pose = povPose(p3(m.node.position), S.pov.view, eyeY, Math.hypot(v.x, v.z), povBobM(), dt);
    applyPov(ctx.camera, pose, fovForAspect(povFovDeg(), ctx.scene.getEngine().getAspectRatio(ctx.camera)));
    return;
  }
  ctx.camDirector.look(S.input.rx, S.input.ry, dt);
  ctx.camDirector.update(m.node.position, m.body.vel(TMP), goalVec('north'));
}

function myAim(ctx: ModeContext, S: St): { yaw: number; curl: number } {
  const m = me(S), g = goalOf('north'), toGoal = yawTo(m.node.position, g);
  if (S.pov.on) return { yaw: S.pov.view.yaw, curl: Math.max(-1, Math.min(1, S.input.lx)) };
  const { lx, ly } = S.input;
  if (Math.hypot(lx, ly) < 0.3) return { yaw: m.yaw, curl: 0 };
  const w = ctx.camDirector.stickWorldLatched(lx, ly, 0.15, false), stickYaw = Math.atan2(w.x, w.z);
  let d = stickYaw - toGoal;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) < 1.2 ? { yaw: toGoal + d * 0.5, curl: Math.max(-1, Math.min(1, d / 0.9)) } : { yaw: stickYaw, curl: 0 };
}

/** The team-mate a pass goes to: the one the stick points at, the most open with the stick at rest. */
function passTarget(ctx: ModeContext, S: St): Pl {
  const m = me(S), ms = mates(S, m).filter((x) => !x.keeper);
  const { lx, ly } = S.input;
  if (Math.hypot(lx, ly) > 0.3) {
    const w = S.pov.on ? { x: Math.sin(S.pov.view.yaw), z: Math.cos(S.pov.view.yaw) } : ctx.camDirector.stickWorldLatched(lx, ly, 0.15, false);
    return ms.map((x) => ({ x, c: ((x.node.position.x - m.node.position.x) * w.x + (x.node.position.z - m.node.position.z) * w.z) / (flat(x.node.position, m.node.position) || 1) })).sort((u, v) => v.c - u.c)[0].x;
  }
  return ms.sort((u, w) => openness(S, w) - openness(S, u))[0];
}

export const PhysicsArenaSoccer3v3Mode: ModeDefinition = {
  modeId: ARENA_SOCCER_3V3_MODE_ID,
  mood: 'goldenHour',
  camPreset: 'soccer',

  async load(ctx: ModeContext) {
    const scene = ctx.scene;
    const pitch = mountSoccerPitch(scene);
    const ballMesh = MeshBuilder.CreateSphere('ball', { diameter: SOCCER_BALL.r * 2, segments: 16 }, scene);
    const bm = new PBRMaterial('arena_soccer3_ball_mat', scene);
    bm.albedoColor = Color3.FromHexString('#f2f2f2'); bm.roughness = 0.6; bm.metallic = 0;
    ballMesh.material = bm;
    void dressBall(ballMesh, 'soccer');
    const world = await ArenaPhysics.create(scene, { hoop: false, ballNode: ballMesh, ball: SOCCER_SPEC });
    if (scene.isDisposed) { world.dispose(); return; }
    buildSoccerColliders(world);
    // 0-2 home outfield (0 the player), 3 home keeper; 4-6 away outfield, 7 away keeper
    const bodies = Array.from({ length: 8 }, (_, i) => {
      const node = new TransformNode(`arena_soccer3_body_${i}`, scene);
      node.position.set((i % 4) - 1.5, 0, i < 4 ? -3 : 3);
      const keeper = i % 4 === 3;
      const body = world.addPlayer(String(i), node, { mass: keeper ? 85 : 78, radius: 0.28 });
      return { node, body, keeper, hands: keeper ? world.addHands(body, GLOVE_R, KEEPER_HAND_MPS) : null, view: new TransformNode(`arena_soccer3_view_${i}`, scene) };
    });
    const tint = (i: number) => (i % 4 === 3 ? (i < 4 ? '#FFD166' : '#9B5DE5') : i < 4 ? '#2EC4B6' : '#F25F5C');
    const chars = await Promise.all(bodies.map((_, i) => (i === 0
      ? CharacterPipeline.spawnPlayer(scene, DUNK_CONFIG.heroUrl, { position: Vector3.Zero(), yawRad: 0, startClip: 'idle_stand', modeId: ARENA_SOCCER_3V3_MODE_ID })
      : CharacterPipeline.spawnNpc(scene, DUNK_CONFIG.heroUrl, { position: Vector3.Zero(), yawRad: 0, startClip: 'idle_stand', modeId: ARENA_SOCCER_3V3_MODE_ID, name: i % 4 === 3 ? `Keeper${i}` : i < 4 ? `Mate${i}` : `Rival${i - 3}`, tint: tint(i) })
    ).catch(() => null)));
    if (scene.isDisposed) { world.dispose(); return; }
    const pl: Pl[] = bodies.map((b, i) => {
      const c = chars[i];
      if (c) { installSafePlay(c.animator, ARENA_SOCCER_3V3_MODE_ID); c.root.parent = b.view; c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0); c.root.rotationQuaternion = null; }
      return { i, team: i < 4 ? 'home' : 'away', keeper: b.keeper, node: b.node, body: b.body, hands: b.hands, view: b.view, char: c, head: c ? boneNode(c.skeleton, 'Head') : null,
        yaw: 0, clip: '', clipHoldT: 0, wish: { x: 0, z: 0 }, kick: null, touchCd: 0, tackleCd: 0, reactAt: 0, readErr: 0, noCatchUntil: 0, round: false };
    });
    const S: St = {
      scene, world, pitch, ballMesh, pl, ctrl: 0, ctrlAt: 0, rng: seeded(0x50c33), tier: runTier(), t: 0, score: { home: 0, away: 0 },
      phase: 'kickoff', phaseT: 0, kicker: 'home', conceded: 'home', lastTouch: null, holder: null, heldAt: 0, shotBy: null, shotAt: -9, calledAt: -9,
      prevBall: { x: 0, y: SOCCER_BALL.r, z: 0 }, input: { lx: 0, ly: 0, rx: 0, ry: 0, sprint: false },
      pov: { on: false, view: { yaw: 0, pitch: 0, bobPhase: 0 }, savedFov: ctx.camera.fov }, camModeSeen: ctx.camDirector.mode,
      banner: '', bannerT: 0, timing: '', hudKey: '',
      stats: { shots: { home: 0, away: 0 }, onTarget: { home: 0, away: 0 }, goals: { home: 0, away: 0 }, passes: 0, completed: 0, saves: { home: 0, away: 0 }, catches: 0, tackles: 0, touches: 0, posts: 0, whiffs: 0, drops: 0, half: { home: 0, away: 0 } },
      aiQuiet: false, keepersOff: false, seam: null, lod: null, rings: null, disposed: false, ball2pass: null, stillAt: { x: 0, y: 0, z: 0 }, stillSince: 0, passTo: -1, shotOnTarget: false, autoHome: false,
    };
    states.set(scene, S); current = S;
    if (arenaBodyLodOn()) S.lod = mountBodyLod(scene, () => ctx.camera, pl.map((a) => ({ root: a.view, human: () => human(S, a) })), () => S.world.ball.pos);
    if (arenaTeamRingsOn()) S.rings = mountTeamRings(scene, (['home', 'away'] as const).map((t) => ({ color: t === 'home' ? HOME_RING : AWAY_RING, nodes: () => S.pl.filter((a) => a.team === t).map((a) => (human(S, a) ? null : a.view)) })));
    setupKickoff(S, 'home');
    for (const a of pl) { a.view.position.copyFrom(a.node.position); a.view.rotation.y = a.yaw; }
    ctx.heroRef.current = pl[0].view;
    ctx.objectiveRef.current = goalVec('north');
    ctx.camDirector.snapTo(pl[0].node.position, goalVec('north'));
    scene.onDisposeObservable.addOnce(() => close(scene));
    S.seam = {
      state: () => ({ phase: S.phase, score: { ...S.score }, t: S.t, ball: p3(S.world.ball.pos), ctrl: S.ctrl, holder: S.holder?.i ?? null, stats: JSON.parse(JSON.stringify(S.stats)) }),
      /** A home striker (player 0) at (x, z) with the ball at his foot, everyone else still; the away keeper live (or not: keepersOff). */
      place: (x: number, z: number) => {
        S.phase = 'live'; S.phaseT = 0; S.holder = null;
        for (const a of S.pl) if (!a.keeper && a.i !== 0) a.body.teleport({ x: a.i < 4 ? -6 + a.i : 6 - (a.i - 4), y: 0, z: a.i < 4 ? -10 : -10 });
        const s0 = S.pl[0];
        s0.body.teleport({ x, y: 0, z }); s0.yaw = yawTo({ x, z }, goalOf('north'));
        const f = footPoint(s0);
        S.world.ball.teleport({ x: f.x, y: SOCCER_BALL.r, z: f.z });
        S.prevBall = p3(S.world.ball.pos); S.lastTouch = s0; S.ctrl = 0; S.world.ball.collideAll(); S.ball2pass = null; S.passTo = -1;
      },
      kick: (power: number, aimYaw: number, curl: number) => { const s0 = S.pl[0]; s0.kick = { kind: 'shot', t: power * WIND_SEC, aiAt: 0, to: -1 }; releaseKick(S, s0, aimYaw, curl); },
      quiet: (on: boolean) => { S.aiQuiet = on; },
      /** The keeper-less control: the keepers stand aside by the boards (their bodies off the goal mouth), hands at rest. */
      keepersOff: (on: boolean) => {
        S.keepersOff = on;
        if (on) for (const k of S.pl) if (k.keeper) { const out = k.team === 'home' ? 1 : -1; k.body.teleport({ x: (PITCH.halfW - 1) * out, y: 0, z: goalLineZ(defends(k.team)) + out * 3 }); }
      },
      auto: (on: boolean) => { S.autoHome = on; },
      pov: () => togglePov(ctx, S),
    };
    if (typeof window !== 'undefined' && devOrAgentHooks()) (window as unknown as { __ARENA_SOCCER3__?: unknown }).__ARENA_SOCCER3__ = S.seam;
  },

  onPlay(ctx: ModeContext) { const S = states.get(ctx.scene); if (S) S.tier = runTier(); },

  onInput(ctx: ModeContext, e: FelInput) {
    const S = states.get(ctx.scene);
    if (!S) return;
    if (e.t === 'stick') { if (e.side === 'L') { S.input.lx = e.x; S.input.ly = e.y; } else { S.input.rx = e.x; S.input.ry = e.y; } return; }
    if (e.t === 'trigger' && e.side === 'R') { S.input.sprint = e.value > 0.4; return; }
    if (e.t !== 'button') return;
    if (e.btn === 'R1') { S.input.sprint = e.pressed; return; }
    const m = me(S);
    const live = S.phase === 'live' || (S.phase === 'kickoff' && S.kicker === 'home' && field(S, 'home')[0] === m);
    if (e.btn === 'X' || e.btn === 'A') {
      const kind: KickKind = e.btn === 'X' ? 'shot' : 'pass';
      if (e.pressed) { if (live && !m.kick) m.kick = { kind, t: 0, aiAt: 0, to: -1 }; }
      else if (m.kick && m.kick.kind === kind) {
        if (kind === 'pass') { m.kick.to = passTarget(ctx, S).i; releaseKick(S, m, 0, 0); }
        else { const aim = myAim(ctx, S); releaseKick(S, m, aim.yaw, aim.curl); }
      }
      return;
    }
    if (!e.pressed) return;
    if (e.btn === 'B') { if (live) tackle(S, m); }
    else if (e.btn === 'Y') { S.calledAt = S.t; say(S, 'Ball!', 0.6); }
    else if (e.btn === 'L1') {
      const b = S.world.ball.pos;
      const best = field(S, 'home').filter((x) => x.i !== S.ctrl).sort((u, w) => flat(u.node.position, b) - flat(w.node.position, b))[0];
      if (best && !m.kick) { S.ctrl = best.i; S.ctrlAt = S.t; }
    }
  },

  update(ctx: ModeContext, dt: number) {
    const S = states.get(ctx.scene);
    if (!S || S.disposed) return;
    S.world.step(dt, (h) => { S.t = S.world.time; beforeStep(ctx, S, h); }, () => afterStep(S));
    const simDt = S.world.stats.steps / stepHz();
    S.t = S.world.time;
    const m = me(S);
    if (m.kick) m.kick.t += simDt;
    aiDecide(S, simDt);
    autoSwitch(S);
    frameRules(S, simDt);
    facing(S, simDt);
    camera(ctx, S, dt);
    S.lod?.update(dt);
    S.rings?.update();
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) S.banner = ''; }
    const power = m.kick ? Math.round(Math.min(1, m.kick.t / WIND_SEC) * 100) : -1;
    const key = `${S.score.home}|${S.score.away}|${S.banner}|${S.timing}|${S.pov.on}|${S.phase}|${power}`;
    if (key !== S.hudKey) {
      S.hudKey = key;
      ctx.setHud({ arenaScore: `${S.score.home}–${S.score.away}`, arenaBanner: S.banner, arenaTiming: S.timing, arenaPov: S.pov.on ? 1 : 0, arenaPhase: S.phase, arenaPower: power });
    }
  },

  dispose() { if (current && current.scene.isDisposed) close(current.scene); },
};

export function arenaSoccer3v3Seam(scene: Scene): Record<string, (...a: never[]) => unknown> | null { return states.get(scene)?.seam ?? null; }

export function arenaSoccer3v3Stats(scene: Scene): (St['stats'] & { score: Record<Team, number> }) | null {
  const S = states.get(scene);
  return S ? { ...JSON.parse(JSON.stringify(S.stats)), score: { ...S.score } } : null;
}

function close(scene: Scene): void {
  const S = states.get(scene);
  if (!S || S.disposed) return;
  S.disposed = true;
  S.lod?.dispose(); S.rings?.dispose();
  S.world.dispose();
  S.pitch.dispose();
  states.delete(scene);
  if (current === S) current = null;
  if (typeof window !== 'undefined') delete (window as unknown as { __ARENA_SOCCER3__?: unknown }).__ARENA_SOCCER3__;
}
