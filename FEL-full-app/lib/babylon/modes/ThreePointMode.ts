// ThreePointMode — Babylon 9 Three-Point Shootout.
//
// Ported from the react-three-fiber implementation (components/games/
// three-point-3d.tsx) so 3PT runs on the same Babylon stack as every other
// mode instead of dragging a second renderer into the bundle. The tuned
// constants are carried over VERBATIM — they came from the proven 2D shootout
// and are the reason the mechanic feels right. // TUNE(elijah)
//
// The shot is a timing mechanic: an oscillating release bar sweeps 0..1 and the
// sweet spot is SHOT_TARGET. How close the release lands to that decides the
// make. That is exactly why this mode is the Controller Link reference target —
// if a phone can hit a timing window, the transport is fast enough for anything.
//
// BENCHMARK (locked): NBA 2K9 Three-Point Contest. That means a FIELD and
// ROUNDS, not a solo time attack — the 2009 event ran six shooters through a
// qualifying round, advanced the top three, and decided it on a final round.
// The shot format was already right (5 racks x 5 balls, last ball of each rack
// is the money ball worth 2, 30 max, 60s); what was missing was the contest
// around it, so a score had nothing to be measured against but a fixed number.
//
// Controller Link contract (see lib/controller-link/schemas/registry.ts):
//   'shoot'  — release. Optional payload {power} from a tilt charge; when the
//              phone sends power we bias the arc, but the TIMING is still what
//              decides the make, so a button-only controller is not handicapped.
//   'charge' — live 0..1 wind-up, streamed for the on-screen power ring.
//
// BIOMECH-HOOPS-WAVE1 (2026-09-08) — the dunk contest's body control, ported (SPEC-BIOMECH-HOOPS-WAVE1 G1–G6):
//   G6 the ball rides the shooting HAND (attachBallToHand) through the jog and the load, and leaves it at the jumpshot's
//      release frame from where the hand is — it used to float 1.9 m over the root and start its arc from there;
//   G1 the jog to the next rack faces the travel (the body ran sideways between racks), the load slews onto the rim (a
//      snap at arrival before); G2 the jog carries the ball two-handed at the chest (HandIK) — not an empty-handed run;
//   G5 the shot holds its FOLLOW-THROUGH (the authored beat, then the eyes on the iron through the arc) instead of
//      dropping to the idle; the shared Posture Poses layer (anim/PostureLayer) squares the chest to the rim through the
//      load / release / follow and keeps the eyes on the iron.

import { SPORT_CLIP } from '../anim/clipRegistry';
import { SHOT_TARGET as HUD_TARGET, PERFECT_BAND as HUD_PERFECT, GOOD_BAND as HUD_GOOD, heatLevel, pointsLeft, FIRE_STREAK } from '../core/shootoutHud';
import { readDisplaySetting, displayBanner, widen } from '@/lib/controller-link/tvMode';
import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Material, Mesh, Observer, ParticleSystem, Scene } from '@babylonjs/core';
import { EffectsKit, applyTrail, type TrailLevel } from '../visual/EffectsKit';   // suite pass: the net's answer and the hot hand's trail (the dunk contest's)
import { attachBallToHand, releaseBall } from '../anim/ballRig';
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';   // BIOMECH-HOOPS-WAVE1
import { armChain, reachArm, type ArmChain } from '../anim/HandIK';
import { hoopsPose, HOOPS_INPUT_IDLE, RELEASE_SEC, type HoopsPostureInput, type ShotWindow } from '../core/HoopsPosture';
import { slewYaw, yawTo, yawOfVel } from '../core/Biomech';
import { RELEASE_FRAME_01 } from '../core/BallHandling';
import { releaseFrameOf } from '../anim/opponentMotion';
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered   // HOOPS MOVEMENT: the release frame of the clip that plays
import { type SpawnedCharacter } from '../core/CharacterLibrary';
import { CharacterPipeline } from '../core/characterPipeline';   // suite pass: the sanctioned spawn paths
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay } from '../anim/clipRegistry';
import { VenueKit } from '../visual/VenueKit';
import { dressBall as dressMeshyBall } from '../visual/meshyProps';   // suite pass: the Meshy leather every other hoops mode plays with
import { cloneForTint } from '../core/playerIdentity';
import { netExitVelocity, netExitMph } from '../core/NetExit';
import { boneNode } from '../anim/boneLookup';   // POLISH: the rack pick aims at the hand   // NET EXIT (2026-09-17): the swish leaves with pace and bounces off the floor before the next ball
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { applyOceanCourt } from '../visual/CourtSurface';
import { ShotArc } from '../core/BasketballCore';
import { BallSim } from '../core/BallPhysics';
import { resolveRim, forcedMissProfile } from '../core/RimPhysics';   // a shootout miss you can READ
import { THREE_CORNER_R, THREE_TOP_R, threePointRadius } from '../core/BasketballCore';
import { SoundKit } from '../audio/SoundKit';
import { HoopJuice } from '../visual/HoopJuice';   // A+ P0 CONTACT-lite: the hoop answers a make (shared with Dunk / 1v1 / 3v3; Meshy never scaled)
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';

let modeVenue: VenueHandle | null = null;   // ship pass 4: the mounted venue spec, disposed with the mode

// ── EXACT tuned constants (verbatim from the proven 2D/R3F shootout) ──
const RACKS = 5;
const BALLS_PER_RACK = 5;
const GAME_LEN = 60;
/** 2009 field size. Top FINALISTS advance from qualifying to the final round. */
const FIELD_SIZE = 6;
const FINALISTS = 3;
// A+ mission #4: the sweet centre and bands live in core/shootoutHud.ts so the host draws the SAME band it grades.
const SHOT_TARGET = HUD_TARGET;
// The real NBA three-point line is NOT a constant radius: 6.71m in the corners,
// 7.24m at the top of the arc. The racks sit ON that line, so a corner rack is a
// genuinely shorter shot than the top-of-key rack — which is the reason the top
// rack is the hard one in the real contest. A single radius flattened that away.
// Re-exported from the shared basketball core so 3PT and the 5-on-court modes
// cannot drift to different three-point lines. Names kept for 3PT's own tests.
export const RACK_CORNER_R = THREE_CORNER_R;   // NBA corner three
export const RACK_TOP_R = THREE_TOP_R;         // NBA top-of-arc three
export const RACK_ANGLES = [30, 60, 90, 120, 150].map((d) => (d * Math.PI) / 180);
/** Radius at a given arc angle: corner distance at the ends, top distance at 90 deg. */
export const rackRadius = threePointRadius;

/** Rim position matches VenueKit.buildCourt's hoop. */
const RIM = new Vector3(0, 3.05, -0.6);

/** Rack stations swept along the arc in FRONT of the rim (+z side). */
const RACK_POS = RACK_ANGLES.map(
  (a) => new Vector3(RIM.x + rackRadius(a) * Math.cos(a), 0, RIM.z + rackRadius(a) * Math.sin(a)),
);

/** How wide the "perfect" window is around SHOT_TARGET (shared with the host). */
const PERFECT_BAND = HUD_PERFECT;
/**
 * TV MODE (mission Phase C, 2026-09-13).
 *
 * Mirroring delays the PICTURE, not the input: on AirPlay or Chromecast the player sees the meter at the
 * perfect moment, presses, and the press lands 60–300 ms late — every time, consistently, through no error
 * of their own. So on a mirrored display the bands are widened to give that time back. It is compensation
 * for a display, not a difficulty setting, and `widen` can only ever ADD time (FACTOR_MIN is 1).
 *
 * Read once per load rather than per shot: a player who changes the setting mid-rack would otherwise be
 * judged by two different windows inside one rack.
 */
let shotFactor = 1;
const perfectBand = (): number => widen(PERFECT_BAND, shotFactor);
const goodBand = (): number => widen(GOOD_BAND, shotFactor);
/** How long the ball lives off the iron before the next ball is in the hand. Long enough to SEE where
 *  the miss went (that is the whole point), short enough that a shootout still feels like a shootout. */
const RIM_OUT_SEC = 0.85;
const GOOD_BAND = HUD_GOOD;
/** Bar sweeps a full cycle in this many seconds. */
const BAR_PERIOD = 1.15;           //TUNE(elijah)
/** Seconds to travel between rack stations. */
const MOVE_SEC = 0.85;             //TUNE(elijah)
/** How long the standings board holds between rounds. */
const STANDINGS_SEC = 4.0;         //TUNE(elijah)

type Phase = 'move' | 'shoot' | 'flight' | 'standings' | 'done';
type Round = 'qualifying' | 'final';

export interface Shooter {
  name: string;
  score: number;
  isPlayer: boolean;
  shot: boolean;      // has posted a score this round
}

/** Fictional rivals — deliberately not real 2009 competitors, since shipping
 *  real athletes' names is a licensing question, not an engineering one. */
const RIVAL_NAMES = ['V. MARCH', 'D. OKAFOR', 'R. SOLIS', 'T. HALE', 'K. NDIAYE'];

/**
 * A rival's round score. Real 2009 scores ran ~9-19 in qualifying and ~12-19 in
 * the final, so this centres there rather than spanning the full 0-30 — a field
 * that can post 3 or 29 makes the player's own score feel arbitrary.
 * `skill` biases the centre; the triangular draw keeps extremes rare.
 */
export function simulateRival(skill: number, round: Round): number {
  const centre = (round === 'final' ? 14 : 12.5) + skill * 5;
  const spread = round === 'final' ? 3.2 : 4.0;
  const tri = (Math.random() + Math.random()) / 2;          // triangular, centred
  const raw = centre + (tri * 2 - 1) * spread * 2;
  return Math.max(3, Math.min(30, Math.round(raw)));
}

let player: SpawnedCharacter | null = null;
/** Owner decision 2026-09-05: the contest's other shooters are ROSTER BODIES waiting behind the arc (idle, never seen
 *  shooting — D4's ruling stands); they replace the venue's capsule placeholders. */
let rivalBodies: SpawnedCharacter[] = [];
const RIVAL_SEEDS = ['#F25F5C', '#2EC4B6', '#FFBF47', '#5B8DEF', '#B07CF5'];
let ball: Mesh | null = null;
let arc: ShotArc | null = null;
let ballSim: BallSim | null = null;
/** Seconds left of the ball living off the iron after a miss; -1 = not rimming out. */
let rimOut = -1;
const NET_EXIT_SEC = 0.55;   // NET EXIT: the made ball is live (falling, bouncing) this long before the next ball is in the hand
/** Signed timing error of the shot in flight: negative = EARLY (short), positive = LATE (long). */
let shotErr = 0;
let ballMat: StandardMaterial | null = null;   // the plain sphere until the Meshy skin lands (and if it never does)
let trail: ParticleSystem | null = null; let trailLevel: TrailLevel = 'off';
/** POLISH (2026-09-17): the next ball comes off the RACK into the hand over PICK_SEC (it teleported 4–9 m from wherever the last one landed — measured: a 6 m ball jump on every ball). */
let pick: { from: Vector3; t: number; mesh: Mesh } | null = null;   // `mesh` = the rack ball that travels; the live ball is hidden until the hand
const PICK_SEC = 0.24;   // the ball's trail: lit for the flight of a hot hand, a white cut on the money ball
function setTrail(level: TrailLevel, hex?: string): void { if (!trail || level === trailLevel) return; trailLevel = level; applyTrail(trail, level, hex); }
/** The live ball's skin meshes with their leather and their money-ball gold, swapped per shot. */
let ballSkin: { mesh: AbstractMesh; base: Material; money: Material }[] = [];
/** One gold clone per shared skin material — the rack balls and the live ball all wear the same two. */
const moneyMats = new Map<Material, Material>();
function moneyMatFor(base: Material): Material {
  let m = moneyMats.get(base);
  if (!m) {
    const c = cloneForTint(base as Material & { albedoColor?: Color3; diffuseColor?: Color3 }, `${base.name}_money`) as (Material & { albedoColor?: Color3; diffuseColor?: Color3; emissiveColor?: Color3 }) | null;
    if (!c) return base;
    c.albedoColor?.copyFrom(MONEY_COLOR); c.diffuseColor?.copyFrom(MONEY_COLOR);
    if (c.emissiveColor) c.emissiveColor.copyFrom(MONEY_COLOR.scale(0.35));   // a touch of glow so the money ball reads at distance under the venue grade
    m = c; moneyMats.set(base, m);
  }
  return m;
}
/** Dress a ball sphere in the Meshy leather; `money` paints it gold. Resolves with the skin meshes (empty if the skin did not land). */
async function skinBall(sphere: Mesh, money: boolean): Promise<{ mesh: AbstractMesh; base: Material; money: Material }[]> {
  const ok = await dressMeshyBall(sphere, 'basketball');
  if (!ok || sphere.isDisposed()) return [];
  const out: { mesh: AbstractMesh; base: Material; money: Material }[] = [];
  for (const mesh of sphere.getChildMeshes()) {
    if (!mesh.material) continue;
    const pair = { mesh, base: mesh.material, money: moneyMatFor(mesh.material) };
    if (money) mesh.material = pair.money;
    out.push(pair);
  }
  return out;
}
/** One ball-rack per station: the frame plus its five balls. */
let rackBalls: Mesh[][] = [];
let rackMeshes: Mesh[] = [];

/** Regulation ball vs the money ball. In the real contest (and in 2K9) the money
 *  ball is a different colour — seeing it coming is part of the tension, and it
 *  is the only cue that the next shot is worth double. */
const BALL_COLOR = Color3.FromHexString('#c1571f');       // leather orange
const MONEY_COLOR = Color3.FromHexString('#ffd75e');      // money-ball gold

/** Hide the balls already taken, so a rack visibly empties as it is shot. */
function syncRacks(): void {
  for (let r = 0; r < rackBalls.length; r++) {
    for (let b = 0; b < rackBalls[r].length; b++) {
      // Racks ahead stay full; the current rack empties left-to-right; racks
      // already finished stay empty.
      const taken = r < S.rack || (r === S.rack && b < S.ballIdx);
      if (!(pick && pick.mesh === rackBalls[r][b])) rackBalls[r][b].setEnabled(!taken);   // setEnabled, not isVisible: the Meshy skin is a child node and isVisible does not cascade; the travelling pick keeps its own state
    }
  }
}

/** Recolour the loaded ball for whichever shot is next up. */
function dressBall(): void {
  syncRacks();
  const money = isMoneyBall(S.ballIdx);
  for (const p of ballSkin) p.mesh.material = money ? p.money : p.base;   // the Meshy leather, or its gold
  if (!ballMat) return;
  ballMat.diffuseColor = money ? MONEY_COLOR : BALL_COLOR;
  // A touch of emissive so the money ball reads at distance under the venue grade.
  ballMat.emissiveColor = money ? MONEY_COLOR.scale(0.35) : Color3.Black();
}

// A ModeDefinition is a module singleton, so its state is shared by every
// harness instance that mounts it. In dev, React mounts twice (StrictMode /
// Fast Refresh): instance A loads, instance B loads, then A's teardown runs and
// nulls player/ball/arc out from under the LIVE instance B. update() then
// early-returns forever — the scene renders, the camera tracks, and nothing
// ever moves. Counting loads against disposals lets a stale teardown skip.
let loadCount = 0;
let disposeCount = 0;
// ── A+ P0 CONTACT-lite (PM brief THREEPOINT-A-PLUS-P0, 2026-09-06) ────────────────────────────────────────────
// The release names the result (scorePop / feel.impact / score SFX stay where they were); the RIM answers when the ball
// arrives — a soft shake + HoopJuice on a make, a clank on a miss. No hang slowMo, no dunk hit-stop, no FOV stack.
let hoopJuice: HoopJuice | null = null;   // juice-only ring + net + material clones at RIM; no meshy_hoop_* transform is touched
let contactLatch = false;                 // one landing beat per ball — never re-fired by the HUD or the rack advance
let landing: { perfect: boolean; money: boolean } = { perfect: false, money: false };   // what the release decided, for the landing beat
// ── BIOMECH-HOOPS-WAVE1 (2026-09-08) ────────────────────────────────────────────────────────────────────────────
let posture: { layer: PostureLayer; dispose(): void } | null = null;
let carryObs: Observer<Scene> | null = null, carryScene: Scene | null = null;
let arms: { Left: ArmChain | null; Right: ArmChain | null } | null = null;
let carryK = 0;                            // the two-hand chest carry's weight (eased in for the jog, out for the load)
const bio: HoopsPostureInput = { ...HOOPS_INPUT_IDLE, role: 'offense', hasBall: true };
let shotWin: ShotWindow = 'none', shotSec = 0;
let releaseIn = -1;                        // seconds until the ball leaves the hand (the jumpshot's release frame); −1 = none pending
let pendingMade = false;
/** The jumpshot's pace on the release: the timing decision is the press, the ball leaves at the clip's release frame
 *  RELEASE_FRAME_01 · 0.9 s / 1.5 ≈ 0.27 s later — the hand, not a point over the head. */
const SHOT_CLIP_SPEED = 1.5;
const FACE_RATE = 10, FACE_RIM_RATE = 8;
/** The jog's two-hand carry: both hands on the ball at the chest, solved off this frame's shoulders (after the posture
 *  layer, so the arms follow the posed chest). The pole keeps the elbows out and down, never into the ribs. */
function carryApply(): void {
  if (!player || !arms || !arms.Left || !arms.Right || carryK <= 0.001) return;
  const L = arms.Left, R = arms.Right;
  L.shoulder.computeWorldMatrix(true); R.shoulder.computeWorldMatrix(true);
  const ls = L.shoulder.getAbsolutePosition(), rs = R.shoulder.getAbsolutePosition();
  const side = rs.subtract(ls); side.y = 0; if (side.lengthSquared() < 1e-6) return; side.normalize();
  const yaw = player.root.rotation.y; const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const carry = ls.add(rs).scale(0.5).addInPlace(fwd.scale(0.30)).addInPlace(new Vector3(0, -0.30, 0));
  const w = carryK * carryK * (3 - 2 * carryK) * 0.85;
  reachArm(R, carry.add(side.scale(0.12)), side.scale(0.7).add(new Vector3(0, -0.35, 0)).subtract(fwd.scale(0.3)), w);
  reachArm(L, carry.subtract(side.scale(0.12)), side.scale(-0.7).add(new Vector3(0, -0.35, 0)).subtract(fwd.scale(0.3)), w);
}

const S = {
  phase: 'move' as Phase,
  lookX: 0, lookY: 0,   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  rack: 0,
  ballIdx: 0,
  pts: 0,
  streak: 0,
  best: 0,
  clock: GAME_LEN,
  barT: 0,
  moveT: 0,
  from: new Vector3(),
  /** Live wind-up charge streamed from a phone; 0 when playing on keys. */
  charge: 0,
  fired: false,
  // ── contest layer ──
  round: 'qualifying' as Round,
  field: [] as Shooter[],
  /** Per-rival skill 0..1, fixed for the whole contest so form is consistent. */
  skills: [] as number[],
  standingsT: 0,
  /** Rival field indices awaiting a staged reveal, weakest first — the
   *  favourite's number lands last, which is the drama a results board is FOR. */
  revealQueue: [] as number[],
  /** Tiebreak playoffs run so far (a tied final is shot again by the tied shooters). */
  playoff: 0,
  revealT: 0,
  /** True while the finalists' FINAL scores post before the player's run. */
  finalistsPosting: false,
  eliminated: false,
  /** Previous hero position, for the camera's velocity term. */
  prevPos: new Vector3(),
  vel: new Vector3(),
};

function resetState(): void {
  S.phase = 'move'; S.rack = 0; S.ballIdx = 0; S.pts = 0; S.streak = 0; S.best = 0;
  S.clock = GAME_LEN; S.barT = 0; S.moveT = 0; S.charge = 0; S.fired = false;
  S.from.copyFrom(RACK_POS[0]);
  S.round = 'qualifying';
  S.standingsT = 0;
  S.revealQueue = [];
  S.revealT = 0;
  S.finalistsPosting = false;
  S.eliminated = false;
  S.skills = RIVAL_NAMES.map(() => 0.25 + Math.random() * 0.7);
  S.field = [
    { name: 'YOU', score: 0, isPlayer: true, shot: false },
    ...RIVAL_NAMES.slice(0, FIELD_SIZE - 1).map((name) => ({
      name, score: 0, isPlayer: false, shot: false,
    })),
  ];
}

/** Reset only the per-run shooting state, keeping contest standings. */
function resetRun(): void {
  S.phase = 'move'; S.rack = 0; S.ballIdx = 0; S.pts = 0; S.streak = 0;
  S.clock = GAME_LEN; S.barT = 0; S.moveT = 0; S.charge = 0; S.fired = false;
  S.from.copyFrom(RACK_POS[0]);
  shotWin = 'none'; releaseIn = -1;
  if (player && ball) attachBallToHand(ball, player.skeleton, 'RightHand');   // BIOMECH-HOOPS-WAVE1
}

/** Posted shooters by score; anyone still to post sinks to the bottom (their
 *  card reads "—" until their number lands). */
const standings = (): Shooter[] =>
  [...S.field].sort((a, b) => (b.shot ? b.score : -1) - (a.shot ? a.score : -1));

/** A rack's last ball is the money ball — 2 points instead of 1. */
const isMoneyBall = (i: number): boolean => i === BALLS_PER_RACK - 1;

function pushHud(ctx: ModeContext, banner?: string): void {
  ctx.setHud({
    score: S.pts,
    rack: `${Math.min(S.rack + 1, RACKS)}/${RACKS}`,
    ball: `${Math.min(S.ballIdx + 1, BALLS_PER_RACK)}/${BALLS_PER_RACK}`,
    streak: S.streak,
    clock: Math.max(0, Math.ceil(S.clock)),
    meter: S.phase === 'shoot' ? Number(S.barT.toFixed(2)) : null,
    money: isMoneyBall(S.ballIdx),
    // A+ mission #4 (Wii readability): the host draws rack pips, points left and the heat from these numbers
    rackIdx: S.rack, ballIdx: S.ballIdx, left: pointsLeft(S.rack, S.ballIdx), heat: heatLevel(S.streak),
    charge: S.charge > 0.02 ? Number(S.charge.toFixed(2)) : null,
    round: S.round === 'final' ? 'FINAL' : 'QUALIFYING',
    // The bezel renders a scorecard from {name,score,line} triples, so the
    // standings board reuses the judged-contest HUD channel rather than
    // inventing a second one. An unposted rival's card reads "—" until their
    // number lands in the staged reveal.
    board: S.phase === 'standings' || S.phase === 'done'
      ? standings().map((f, i) => ({
          name: f.name,
          score: f.shot ? f.score : '—',
          line: !f.shot ? 'SHOOTING…'
            : S.round === 'qualifying' && i < FINALISTS ? 'ADVANCES'
            : S.round === 'final' && i === 0 ? 'CHAMPION'
            : `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}`,
        }))
      : null,
    // THE NEED — the final round's pressure number, live during the run.
    // The finalists post first; the player shoots last, at a known target,
    // exactly as the top qualifier does in the real event.
    need: S.round === 'final' && !S.finalistsPosting && S.phase !== 'standings' && S.phase !== 'done'
      ? Math.max(0, ...S.field.filter((f) => !f.isPlayer).map((f) => f.score)) + 1
      : null,
    banner: banner ?? null,
  });
}

/** Release the loaded ball, grading on how close the bar was to the sweet spot. */
function fire(ctx: ModeContext, power?: number): void {
  if (S.phase !== 'shoot' || S.fired || !player || !ball || !arc) return;
  S.fired = true;

  const signed = S.barT - SHOT_TARGET;   // the SIGN is the feedback: early is short, late is long
  shotErr = signed;
  const err = Math.abs(signed);
  // A tilt charge nudges the odds but never replaces timing — a phone player and
  // a keyboard player are judged on the same window.
  const powerBonus = typeof power === 'number' ? (1 - Math.abs(power - 0.75)) * 0.05 : 0;
  const made = err < perfectBand() || (err < goodBand() && Math.random() < 0.55 + powerBonus);
  const perfect = err < perfectBand();

  const worth = isMoneyBall(S.ballIdx) ? 2 : 1;
  if (made) {
    S.pts += worth;
    S.streak += 1;
    S.best = Math.max(S.best, S.streak);
  } else {
    S.streak = 0;
  }

  // 'jumpshot' is a real registered clip; SPORT_CLIP has no shooting alias. BIOMECH-HOOPS-WAVE1: the clip is CUT at its
  // release frame into the authored FOLLOW-THROUGH (update → flight: the ball leaves the hand there) — chained after the
  // clip's END it crossfaded from arms-down into the overhead first key, through a T (8–10 T frames a ball, measured).
  player.animator.play('jumpshot', { speedRatio: SHOT_CLIP_SPEED, onEnd: () => { /* cut at the release; a late end holds */ } });
  releaseIn = releaseFrameOf(player.animator, 'jumpshot', RELEASE_FRAME_01) * (player.animator.durationOf('jumpshot') ?? 0.9) / SHOT_CLIP_SPEED;
  pendingMade = made;
  S.phase = 'flight';
  if (S.streak >= FIRE_STREAK || isMoneyBall(S.ballIdx)) setTrail('hang', isMoneyBall(S.ballIdx) ? '#ffd75e' : '#ffb36b'); else setTrail('off');   // the hot hand's flight leaves a trail

  const money = isMoneyBall(S.ballIdx);
  landing = { perfect, money }; contactLatch = false;   // A+ P0: the landing beat (update → 'made' | 'missed') reads these
  if (made) {
    ctx.juice.scorePop(RIM.clone(), perfect ? `PERFECT +${worth}` : `+${worth}`,
      perfect ? '#22d3ee' : '#ffd75e');
    ctx.feel.impact(perfect ? 0.5 : 0.3);
    // THE RACK RUN IS THE EVENT. A shooter going 5-for-5 is the moment this mode exists for and the
    // Game-Breaker layer could not see a single make -- 3PT reported nothing into it.
    ctx.momentum.report({ kind: 'big_make', weight: perfect ? 12 : 7 });
    if (money || S.streak >= 4) ctx.momentum.report({ kind: 'chain', weight: money ? 18 : 12 });
    SoundKit.play('score');
    // Phase 7/8 — a money ball IS the crowd moment in this event, and a hot
    // streak is the other one. Landing them identically to a routine make is
    // what made the run read flat. Camera punch + exposure flash + crowd.
    if (money || S.streak >= 4) {
      SoundKit.play('crowdCheer');
      ctx.camDirector.pulse(money ? 0.7 : 0.45, 0.45);       //TUNE(elijah)
      ctx.lights.flashBeat();
    }
  } else {
    SoundKit.play('miss');
    // Bricking the double-value ball deserves the groan.
    if (money) SoundKit.play('crowdGroan');
  }
  S.charge = 0;
  pushHud(ctx, made ? `${perfect ? 'PERFECT' : 'GOOD'}${S.streak >= FIRE_STREAK ? ' · ON FIRE' : ''}` : 'MISS');
}

/** The make's landing beat: a soft shake, a short flash on a PERFECT or the money ball, and the hoop answers. Latched once per ball.
 *  No hit-stop here — feel.impact at the release already carries its 45–55 ms freeze and its own thud, so nothing is stacked. */
function contactMake(ctx: ModeContext): void {
  if (contactLatch) return;
  contactLatch = true;
  const big = landing.perfect || landing.money;
  ctx.juice.shake(big ? 0.10 : 0.06, 100);
  if (big) ctx.juice.flash(landing.money ? '#ffd75e' : '#fff6dd', 90);
  hoopJuice?.punch();
  // THE NET ANSWERS (suite pass, 2026-09-16): 1v1, 3v3 and the dunk contest burst the net on a make; the shootout —
  // the mode that is nothing but makes — did not. Sparks on the money ball and the perfect release.
  EffectsKit.burst(ctx.scene, RIM, 'net');
  if (big) { EffectsKit.burst(ctx.scene, RIM, 'sparks'); setTrail('flash', '#ffffff'); }
  console.info(`[3PT-JUICE] make${landing.perfect ? ' perfect' : ''}${landing.money ? ' money' : ''}`);
}
/** The miss's landing beat: a light metallic clank with a small feel hit — never the make's answer, never HoopJuice. */
function missClank(ctx: ModeContext): void {
  if (contactLatch) return;
  contactLatch = true;
  ctx.feel.impact(0.4);
  SoundKit.play('impact', { pitch: 1.35, volume: 0.45 });
  console.info('[3PT-JUICE] miss clank');
}

function advanceBall(ctx: ModeContext): void {
  setTrail('off');
  S.ballIdx += 1;
  S.fired = false;
  shotWin = 'none';
  const rackBall = S.ballIdx < BALLS_PER_RACK ? rackBalls[S.rack]?.[S.ballIdx] : null;
  if (player && ball && rackBall) {   // the pick: the RACK BALL travels to the hand; the live ball waits, hidden, where it landed
    if (ball.parent) releaseBall(ball);
    ball.setEnabled(false);
    rackBall.setEnabled(true); rackBall.setParent(null);
    pick = { from: rackBall.getAbsolutePosition().clone(), t: 0, mesh: rackBall };
  } else if (player && ball) attachBallToHand(ball, player.skeleton, 'RightHand');   // BIOMECH-HOOPS-WAVE1 G6: the next ball is in the hand (a rack change: the jog carries it)
  if (S.ballIdx >= BALLS_PER_RACK) {
    S.ballIdx = 0;
    S.rack += 1;
    if (S.rack >= RACKS) { endRun(ctx); return; }
    S.from.copyFrom(player?.root.position ?? RACK_POS[0]);
    S.moveT = 0;
    S.phase = 'move';
    return;
  }
  S.barT = Math.random() * Math.PI;   // desync the bar so it can't be memorised
  S.phase = 'shoot';
  dressBall();
}

/** The player's run for this round is over — post the score, run the field. */
function endRun(ctx: ModeContext): void {
  if (S.phase === 'done' || S.phase === 'standings') return;

  const me = S.field.find((f) => f.isPlayer);
  if (me) { me.score = S.pts; me.shot = true; }

  // The field's numbers land ONE AT A TIME, weakest first — a results board
  // that appears fully formed has no drama, and the dunk contest's staged
  // reveal already proved the idiom. In the final, the rivals posted before
  // the player's run (see afterStandings), so the queue is empty there.
  S.revealQueue = S.field
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !f.isPlayer && !f.shot)
    .sort((a, b) => (S.skills[a.i - 1] ?? 0.5) - (S.skills[b.i - 1] ?? 0.5))
    .map(({ i }) => i);
  S.revealT = 0;

  S.phase = 'standings';
  S.standingsT = 0;
  pushHud(ctx, S.round === 'qualifying' ? 'QUALIFYING RESULTS' : 'FINAL RESULTS');
}

/** Called once the standings board has been shown long enough to read. */
function afterStandings(ctx: ModeContext): void {
  const board = standings();
  const me = board.findIndex((f) => f.isPlayer);
  const myScore = board[me]?.score ?? 0;

  if (S.round === 'final') {
    // THE PLAYOFF (lock D-tiebreak, 2026-09-03): a tie at the top is shot
    // again by the tied shooters, as the real event does — it no longer goes
    // to the earlier poster.
    const tied = board.filter((f) => f.score === board[0].score);
    if (tied.length > 1 && S.playoff < 3) {
      S.playoff += 1;
      S.field = tied.map((f) => ({ ...f, score: 0, shot: false }));
      S.skills = S.field.map(() => 0.35 + Math.random() * 0.6);
      S.finalistsPosting = true;
      S.revealQueue = S.field.map((f, i) => ({ f, i })).filter(({ f }) => !f.isPlayer).map(({ i }) => i);
      S.revealT = 0;
      S.phase = 'standings';
      S.standingsT = 0;
      pushHud(ctx, `PLAYOFF ${S.playoff} — TIED AT ${board[0].score}`);
      return;
    }
    const won = me === 0;
    S.phase = 'done';
    ctx.end(won ? 'win' : 'complete', myScore, {
      points: myScore, bestStreak: S.best, place: me + 1, round: 2,
    });
    return;
  }

  // Qualifying: top three advance, exactly as the 2009 event ran.
  if (me >= FINALISTS) {
    S.eliminated = true;
    S.phase = 'done';
    ctx.end('complete', myScore, {
      points: myScore, bestStreak: S.best, place: me + 1, round: 1,
    });
    return;
  }

  // Advance: the field shrinks to the finalists — and the finalists post
  // FIRST, staged, so the player runs the final at a known number. The real
  // event shoots the final in reverse qualifying order; with one human in
  // the field the dramatic choice is the same one the broadcast makes: the
  // player shoots last. Recorded in the lock (this is board order only —
  // D4's ruling against visible rival shooting stands).
  S.round = 'final';
  S.field = board.slice(0, FINALISTS).map((f) => ({ ...f, score: 0, shot: false }));
  S.skills = S.field.map(() => 0.35 + Math.random() * 0.6);
  S.finalistsPosting = true;
  S.revealQueue = S.field
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !f.isPlayer)
    .sort((a, b) => (S.skills[a.i - 1] ?? 0.5) - (S.skills[b.i - 1] ?? 0.5))
    .map(({ i }) => i);
  S.revealT = 0;
  S.phase = 'standings';
  S.standingsT = 0;
  pushHud(ctx, 'THE FIELD POSTS…');
}

/**
 * Pure round resolution — the 2K9 contest rule, isolated from scene state so it
 * can be proved without a renderer. Qualifying advances the top FINALISTS; the
 * final is won outright by the leader.
 */
export function resolveRound(field: Shooter[], round: Round): {
  board: Shooter[];
  place: number;
  advances: boolean;
  champion: boolean;
} {
  const board = [...field].sort((a, b) => b.score - a.score);
  const place = board.findIndex((f) => f.isPlayer) + 1;
  return {
    board,
    place,
    advances: round === 'qualifying' && place >= 1 && place <= FINALISTS,
    champion: round === 'final' && place === 1,
  };
}

export const ThreePointMode: ModeDefinition = {
  modeId: 'threepoint',
  mood: 'goldenHour',
  camPreset: 'hoops',

  async load(ctx: ModeContext): Promise<void> {
    loadCount += 1;
    resetState();

    // TV MODE. Read once at load (see shotFactor): a player who flips the setting mid-rack must not be
    // judged by two different windows inside one rack. The banner says WHY the timing moved, so a widened
    // window can never be mistaken for the game quietly going easy.
    const display = readDisplaySetting(typeof navigator === 'undefined' ? undefined : {
      userAgent: navigator.userAgent,
      touchPoints: navigator.maxTouchPoints,
      width: typeof window === 'undefined' ? 0 : window.innerWidth,
      height: typeof window === 'undefined' ? 0 : window.innerHeight,
    });
    shotFactor = display.factor;
    if (display.mode === 'mirrored') console.info(`[3PT] ${displayBanner(display)}`);

    // ship pass 4: the venue spec (with its baked map) first; the kit venue only if no spec

    modeVenue = mountVenue(ctx, 'basketball_h2h', { keepGameplayCamera: true, location: ctx.location });

    if (!modeVenue) VenueKit.buildCourt(ctx.scene, 'venice');
    applyOceanCourt(ctx.scene, 'venice');

    player = await CharacterPipeline.spawnPlayer(ctx.scene, DEFAULT_HERO_URL, {
      position: RACK_POS[0].clone(),
      startClip: 'idle_stand',
      modeId: 'threepoint',
    });
    neverBindPose(player.animator, 'idle_stand');
    installSafePlay(player.animator, 'threepoint');
    ctx.groundLock.track(player.root, player.skeleton);
    ctx.heroRef.current = player.root;
    // the field waits along the left sideline, facing the rim, one body per rival card
    // THE FIELD WAITS ON THE SIDELINE — sequentially, on TWO roster bodies (suite pass, 2026-09-16). Five rival cards
    // used to spawn five DISTINCT roster bodies at once, the moment the mode reported loaded: five GLBs' worth of
    // skin maps landing on the GPU in the same second the venue kit did, and on the dev server the device reset —
    // "WebGL context lost … Graphics were reset by the device", every load, the shootout a black canvas until the
    // harness reloaded it. The cards keep their five names; the bodies behind them alternate two seeds (two shared
    // containers) and arrive one at a time, after the court is up.
    void (async () => {
      const bodies: SpawnedCharacter[] = [];
      try {
        for (let i = 0; i < RIVAL_NAMES.length; i++) {
          if (!player || ctx.scene.isDisposed) break;
          const z = 4 - i * 1.9;
          const b = await CharacterPipeline.spawnNpc(ctx.scene, DEFAULT_HERO_URL, {
            position: new Vector3(-9.2, 0, z), yawRad: Math.atan2(RIM.x - -9.2, RIM.z - z), tint: RIVAL_SEEDS[i % 2], startClip: 'idle_stand', identity: false, modeId: 'threepoint',
          });
          neverBindPose(b.animator, 'idle_stand');
          bodies.push(b);
        }
      } catch (e) { console.warn('[FEL-3PT] rival bodies did not spawn', (e as Error)?.message ?? e); }
      if (!player || ctx.scene.isDisposed) { bodies.forEach((b) => b.dispose()); return; }
      rivalBodies = bodies;
    })();

    ball = MeshBuilder.CreateSphere('tp_ball', { diameter: 0.24, segments: 16 }, ctx.scene);
    ballMat = new StandardMaterial('tp_ballMat', ctx.scene);
    ball.material = ballMat;
    dressBall();
    // THE MESHY LEATHER (suite pass, 2026-09-16): 1v1, 3v3 and the dunk contest play with the baked ball; the shootout
    // shot a flat orange sphere. The skin rides the sphere; the money ball swaps its materials for gold clones.
    void skinBall(ball, isMoneyBall(S.ballIdx)).then((skin) => { if (ball && !ball.isDisposed()) { ballSkin = skin; dressBall(); } });
    trail?.dispose(); trail = EffectsKit.ballTrail(ctx.scene, ball); trailLevel = 'soft'; setTrail('off');
    // BIOMECH-HOOPS-WAVE1 G6: the ball rides the shooting hand (it used to float 1.9 m over the root)
    attachBallToHand(ball, player.skeleton, 'RightHand');
    // the Posture Poses layer (chest on the rim, eyes on the iron, feet) — then the jog's two-hand carry, solved after it
    player.secondary?.setLookTarget(() => null);   // the layer owns the eyes
    posture?.dispose();
    posture = mountPostureLayer(ctx.scene, player.skeleton, player.root, () => { const { window, pose, legs } = hoopsPose(bio); return { pose, legs, aim: RIM, eyes: RIM, window }; }, '3PT-PP');
    arms = { Left: armChain(player.skeleton, 'Left'), Right: armChain(player.skeleton, 'Right') };
    if (carryScene && carryObs) carryScene.onAfterAnimationsObservable.remove(carryObs);
    carryScene = ctx.scene; carryObs = ctx.scene.onAfterAnimationsObservable.add(carryApply);
    carryK = 0; shotWin = 'none'; releaseIn = -1;
    if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopsPosture?: unknown } }).__FEL_DEV__; if (dev) dev.hoopsPosture = { me: () => posture?.layer.get() ?? null, bio: () => ({ me: { ...bio } }) }; }
    // The objective is the RIM, not the ball. The 'hoops' preset frames hero and
    // objective together (fitTwo), so pointing this at the ball — which sits in
    // the shooter's own hands — gave it two coincident points and the framing
    // degenerated to a view of the boardwalk with neither player nor hoop in it.
    ctx.objectiveRef.current = RIM;

    // Phase 6 / Concept Lock D3 — the racks belong ON the court. 2K9 shows them,
    // and without them nothing tells the player where the balls are, how many are
    // left, or which one is the money ball until it is already in their hands.
    rackBalls = [];
    rackMeshes = [];
    for (let r = 0; r < RACKS; r++) {
      const at = RACK_POS[r];
      const stand = MeshBuilder.CreateBox(`rack_${r}`, { width: 0.9, height: 0.12, depth: 0.34 }, ctx.scene);
      // Sit the rack just outside the arc so the shooter is never inside it.
      const outward = at.subtract(RIM).normalize();
      stand.position.copyFrom(at).addInPlace(outward.scale(0.75));
      stand.position.y = 0.62;
      const standMat = new StandardMaterial(`rackMat_${r}`, ctx.scene);
      standMat.diffuseColor = Color3.FromHexString('#2b3038');
      stand.material = standMat;
      rackMeshes.push(stand);

      const balls: Mesh[] = [];
      for (let b = 0; b < BALLS_PER_RACK; b++) {
        const bm = MeshBuilder.CreateSphere(`rack_${r}_ball_${b}`, { diameter: 0.2, segments: 10 }, ctx.scene);
        bm.position.copyFrom(stand.position);
        bm.position.x += (b - (BALLS_PER_RACK - 1) / 2) * 0.21;
        bm.position.y += 0.16;
        const money = isMoneyBall(b);
        void skinBall(bm, money);   // the rack wears the same leather (the fifth ball gold); the sphere hides under it
        balls.push(bm);
      }
      rackBalls.push(balls);
      rackMeshes.push(...balls);
    }

    arc = new ShotArc();
    if (ball) ballSim = new BallSim(ball, 0.12);
    hoopJuice?.dispose(); hoopJuice = new HoopJuice(ctx.scene, RIM);   // A+ P0: once per load, at the rim the arc lands on
    if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopJuiceUsed?: unknown } }).__FEL_DEV__; if (dev) dev.hoopJuiceUsed = hoopJuice.used; }

    S.from.copyFrom(RACK_POS[0]);
    S.prevPos.copyFrom(player.root.position);

    // ModeHarness constructs the CameraDirector but does NOT drive it — each
    // mode owns its own framing. Without these calls the camera stays at its
    // construction default (0, 3, -8), which sits behind the hoop looking out
    // at the boardwalk: no shooter, no rim, no shot arc in frame.
    ctx.camDirector.snapTo(player.root.position, RIM);
    pushHud(ctx, 'RACK 1');
  },

  onInput(ctx: ModeContext, e: FelInput): void {
    if (e.t === 'stick' && e.side === 'R') { S.lookX = e.x; S.lookY = e.y; return; }   // MODE-STICK-FACE: R stick → the director's look orbit
    if (S.phase === 'done' || S.phase === 'standings') return;

    // Phone tilt wind-up streams in as the right trigger (see modeBridge).
    if (e.t === 'trigger' && e.side === 'R') {
      S.charge = e.value;
      return;
    }
    // A press is the release: keyboard Space, touch SHOOT, or a phone flick all
    // arrive here identically because they all normalise to FelInput.
    if (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B' || e.btn === 'X')) {   // X too: SQUARE shoots in the 2K map every other hoops mode plays by
      // MECHANICS PASS (2026-09-15): 43 % of SHOOT presses were silent — pressed while the ball was in the air or the next
      // one was still coming off the rack. Answered now, with where the ball is.
      if (S.phase === 'shoot' && S.fired) refuse(ctx, "BALL'S IN THE AIR");
      else if (S.phase !== 'shoot') refuse(ctx, 'NEXT BALL…');
      else fire(ctx, S.charge > 0.02 ? S.charge : undefined);
    }
  },

  update(ctx: ModeContext, dt: number): void {
    if (S.phase === 'done' || !player || !ball || !arc) return;
    if (pick) {   // POLISH: the pick off the rack — eased from the rack to the hand, then attached
      pick.t = Math.min(1, pick.t + dt / PICK_SEC); const k = pick.t * pick.t * (3 - 2 * pick.t);
      const hand = boneNode(player.skeleton, 'RightHand'); const to = hand ? hand.getAbsolutePosition() : player.root.position.add(new Vector3(0.3, 1.0, 0.3));
      pick.mesh.position.copyFrom(Vector3.Lerp(pick.from, to, k));
      if (pick.t >= 1) { pick.mesh.setEnabled(false); pick = null; ball.setEnabled(true); ball.position.copyFrom(to); attachBallToHand(ball, player.skeleton, 'RightHand'); }
    }

    // Standings: the staged reveal runs first (one card every 0.75s); the
    // readable hold starts only when the last number has landed.
    if (S.phase === 'standings') {
      if (S.revealQueue.length) {
        S.revealT += dt;
        if (S.revealT >= 0.75) {
          S.revealT = 0;
          const idx = S.revealQueue.shift()!;
          const f = S.field[idx];
          f.score = simulateRival(S.skills[idx - 1] ?? 0.5, S.round);
          f.shot = true;
          SoundKit.play('uiTick', { pitch: 0.8 + f.score * 0.02, volume: 0.4 });
          // A+ mission #4: the body on the sideline ANSWERS its number — a big round celebrates, a poor one flinches.
          // (Lock D4 rules out visible rival shooting; a reaction to the posted score is not a shot.)
          const body = rivalBodies[RIVAL_NAMES.indexOf(f.name)];
          if (body) body.animator.play(f.score >= 16 ? SPORT_CLIP.scoreCelebrate : 'bball_contact_react', { onEnd: () => body.animator.play('idle_stand', { loop: true }) });
          pushHud(ctx);
        }
        return;
      }
      S.standingsT += dt;
      if (S.standingsT >= STANDINGS_SEC) {
        if (S.finalistsPosting) {
          // the field has posted; the player runs the final at the number
          S.finalistsPosting = false;
          resetRun();
          pushHud(ctx, 'FINAL ROUND — YOUR RUN');
        } else {
          afterStandings(ctx);
        }
      }
      return;
    }

    S.clock -= dt;
    if (S.clock <= 0) { endRun(ctx); return; }

    if (S.phase === 'move') {
      S.moveT = Math.min(1, S.moveT + dt / MOVE_SEC);
      const target = RACK_POS[Math.min(S.rack, RACKS - 1)];
      // Ease so the jog into the rack reads as deliberate rather than a snap.
      const k = S.moveT * S.moveT * (3 - 2 * S.moveT);
      player.root.position = Vector3.Lerp(S.from, target, k);
      player.animator.play(k < 1 ? 'run' : 'idle_stand', { loop: true });
      // BIOMECH-HOOPS-WAVE1 G1: the jog faces its travel (the body ran sideways / backwards to the next rack), slewed
      const travel = yawOfVel({ x: target.x - S.from.x, z: target.z - S.from.z }, 0.05);
      if (k < 1 && travel !== null) player.root.rotation.y = slewYaw(player.root.rotation.y, travel, FACE_RATE, dt);
      if (S.moveT >= 1) {
        S.phase = 'shoot';
        S.fired = false;
        S.barT = Math.random() * Math.PI;
        dressBall();
        pushHud(ctx, `RACK ${S.rack + 1}`);
      }
    } else if (S.phase === 'shoot') {
      // Triangle sweep 0..1..0 — a sine would linger at the extremes and make
      // the sweet spot easier at the top of the arc than the bottom.
      S.barT = (S.barT + dt / BAR_PERIOD) % 1;
      // Face the rim while loaded — slewed onto it (BIOMECH-HOOPS-WAVE1 G1/G3: a lookAt snap before), the ball in the hand.
      player.root.rotation.y = slewYaw(player.root.rotation.y, yawTo(player.root.position, RIM), FACE_RIM_RATE, dt);
    } else if (S.phase === 'flight') {
      player.root.rotation.y = slewYaw(player.root.rotation.y, yawTo(player.root.position, RIM), FACE_RIM_RATE, dt);
      if (releaseIn >= 0) {
        // BIOMECH-HOOPS-WAVE1 G6: the ball rides the hand up to the jumpshot's release frame and leaves it from where the
        // hand IS (the arc used to start from a point 1.9 m over the root on the press, arms still at the hips)
        releaseIn -= dt;
        if (releaseIn < 0) {
          const from = ball.getAbsolutePosition().clone(); releaseBall(ball); arc.start(from, RIM, pendingMade, 'jumper'); shotWin = 'release'; shotSec = 0; releaseIn = -1;
          player.animator.play('bball_follow_through', { fadeSec: 0.08, onEnd: () => player?.animator.play('idle_stand', { loop: true, fadeSec: 0.2 }) });   // from the release frame: arms overhead → the wrist snap → down the front
        }
      } else if (rimOut >= 0) {
        // the ball is live off the iron: let it bounce where the timing sent it, then the next ball is up
        ballSim?.step(dt);
        rimOut -= dt;
        if (rimOut < 0) { rimOut = -1; advanceBall(ctx); }
      } else {
        const r = arc.step(dt, ball.position);
        if (r === 'made') { contactMake(ctx); const v = netExitVelocity('jumper'); ballSim?.launch(ball.position.clone(), new Vector3(v.x, v.y, v.z)); rimOut = NET_EXIT_SEC; console.info(`[3PT-NET] jumper exit ${netExitMph('jumper')} mph`); }   // A+ P0: the hoop answers the make; NET EXIT: the ball drops through with pace and bounces before the next ball
        else if (r === 'missed') {
          missClank(ctx);                             // A+ P0: the miss has weight — a clank off the iron, never HoopJuice
          // A shootout is nothing but shooting feedback, and the ball used to vanish to the next rack the
          // instant a shot missed — so EARLY and LATE looked identical and the shooter learned nothing
          // from the one thing the mode is about. Now the iron answers the timing: early is short off the
          // front and comes back at me, late is long off the back and runs away.
          const toShooter = player.root.position.subtract(RIM); toShooter.y = 0;
          const q01 = Math.max(0.15, 1 - Math.abs(shotErr) / Math.PI);
          const hit = resolveRim(RIM, toShooter, forcedMissProfile(q01, { short: shotErr < 0 ? 0.8 : -0.8 }), 0.05);
          ballSim?.launch(hit.contact, hit.outVel);
          rimOut = RIM_OUT_SEC;
          pushHud(ctx, hit.label);
          console.info(`[3PT-RIM] ${hit.kind} — ${hit.label} (err ${shotErr.toFixed(2)})`);
        }
      }
    }
    // BIOMECH-HOOPS-WAVE1: the carry weight (the jog only), the shot's posture clock, this frame's window for the layer
    carryK += ((S.phase === 'move' && S.moveT < 1 ? 1 : 0) - carryK) * Math.min(1, dt / 0.15);
    if (shotWin === 'release') { shotSec += dt; if (shotSec >= RELEASE_SEC) shotWin = 'follow'; }
    Object.assign(bio, {
      role: 'offense', hasBall: S.phase === 'move' || S.phase === 'shoot' || releaseIn >= 0, speed01: S.phase === 'move' && S.moveT < 1 ? 0.5 : 0,   // the jog is a carry (the dribble stance), not a drive
      shot: S.phase === 'shoot' || (S.phase === 'flight' && releaseIn >= 0) ? 'load' : S.phase === 'flight' ? shotWin : 'none',
    } satisfies Partial<HoopsPostureInput>);

    // Camera follows the shooter, framed against the rim (the 'hoops' preset
    // fits both). Velocity is derived rather than tracked so the lookAhead term
    // leads the jog between racks.
    if (dt > 0) {
      S.vel.copyFrom(player.root.position).subtractInPlace(S.prevPos).scaleInPlace(1 / dt);
      S.prevPos.copyFrom(player.root.position);
    }
    ctx.camDirector.look(S.lookX, S.lookY, dt);
    ctx.camDirector.update(player.root.position, S.vel, RIM);

    pushHud(ctx);
  },

  dispose(): void {

    modeVenue?.dispose?.(); modeVenue = null;
    disposeCount += 1;
    // A newer instance has already loaded — this teardown belongs to an older
    // one and must not touch the live objects.
    if (disposeCount < loadCount) return;
    hoopJuice?.dispose(); hoopJuice = null;   // A+ P0: restores any hoop material the punch swapped
    posture?.dispose(); posture = null;        // BIOMECH-HOOPS-WAVE1
    if (carryScene && carryObs) carryScene.onAfterAnimationsObservable.remove(carryObs); carryObs = null; carryScene = null; arms = null;
    player?.dispose(); player = null;
    for (const b of rivalBodies) b.dispose(); rivalBodies = [];
    trail?.dispose(); trail = null; trailLevel = 'off';
    ball?.dispose(); ball = null;
    ballMat?.dispose(); ballMat = null;
    ballSkin = []; for (const m of moneyMats.values()) m.dispose(); moneyMats.clear();
    pick = null;
    for (const m of rackMeshes) m.dispose();
    rackMeshes = []; rackBalls = [];
    arc = null;
    ballSim = null; rimOut = -1;
  },
};
