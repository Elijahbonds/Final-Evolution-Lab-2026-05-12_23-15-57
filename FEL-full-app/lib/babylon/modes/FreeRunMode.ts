// FreeRunMode — A+ mission #10 (2026-09-06): free-running tricking, replacing GymnasticsMode on the roster. Owner benchmark:
// Skate 3 trick-scoring model + Mirror's Edge traversal feel.
//
// TRAVERSAL: a Havok character controller (PhysicsCharacterController) against static box aggregates for every course
// piece — no fall-through by construction; the only non-physical pieces are the gates (start / checkpoint / finish arches)
// and the slide BAR, which is a gate you must slide under (the capsule cannot crouch; clipping it costs speed). Momentum
// gates the verbs (FreeRunCore.verbsFor): walk and you can only jump; run and you can vault and slide; sprint and the
// wall and the ledges open up. Wall-run, wall-kick, cat leap, precision jump, landing roll.
// TRICKS + SCORING: Skate's own ComboChain (imported, not rewritten) — every link pays N×, a clean touchdown with no linked
// move banks the pot, a bail burns it — with FreeRunCore.trickPoints = difficulty × launch × execution (Skate's sketchy
// multiplier). Tricks come off vaults, wall-kicks and drops, not only flat ground.
// STATE: per scene (a host that mounts twice must never share a controller or a course — the Carnival lesson).

import { Coyote } from '../core/gameFeel';
import { stepSpeedFov } from '../core/SpeedFov';
import { Vector3, Mesh, MeshBuilder, Color3, type PBRMaterial, PhysicsAggregate, PhysicsShapeType, PhysicsCharacterController, CharacterSupportedState, type CharacterSurfaceInfo, type Scene, type AbstractMesh } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
import { readPlaceLook } from '../nexus/placeLooks';
import { MOOD_TO_FAMILY } from '../visual/Backdrops';
import type { HudValue, ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { DEFAULT_HERO_URL } from '../core/athleteRoster';
import { installSafePlay } from '../anim/clipRegistry';
import { FreeRunAnimTree } from '../anim/freeRunTree';
// BIOMECH-WAVE2 (2026-09-09) — the game-wide bar on the traceur (SPEC-FEL-BIOMECH-GAMEWIDE G1–G6). Measured on
// 2942860, per rendered frame:
//   G1/G3  on the ground the stick's direction was COPIED into the heading (`S.heading.copyFrom(w)`) and written
//          straight onto the root (`root.rotation.y = atan2(heading)`), so a flicked stick turned the whole body in a
//          single frame — up to 180° between two rendered frames, with the run loop still striding the old way.
//   G3/G5  the landing wrote `root.rotation.x = 0; root.rotation.z = 0` on the touchdown frame, teleporting away the
//          last quarter of every somersault: a front flip that came down at 300° simply became 0° between frames. The
//          residual SETTLES upright now (Biomech.settleAngle), so the flip finishes on the feet.
//   G5     nothing touched the thoracic chain or the head — a traceur never looked at the ledge he was catching. The
//          Posture Poses layer carries the body per run window with the eyes down the line.
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { freeRunWindow, runPose, FREERUN_INPUT_IDLE, RUNNER_TURN_RATE, type FreeRunPostureInput } from '../core/RunPosture';
import { slewYaw, settleAngle, wrapYaw } from '../core/Biomech';
import { SoundKit } from '../audio/SoundKit';
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import { initPhysics } from '../core/Physics';
import { ComboChain } from '../core/ComboChain';
import {
  verbsFor, stepSpeed, gradeDrop, speedAfterLanding, trickPoints, FREERUN_TRICKS, TIERS, tierById, VAULT_GATE,
  timeBonus, runGrade, RUN_MAX, ROLL_WINDOW_S, type RunState, type Env, type FreeRunTrick, type Tier, type Landing, type LAUNCH_MULT,
  trickRotationComplete, trickProgress, trickTotalRad, TRICK_AROUND, steerAlpha, AIR_STEER_K, SURF_STEER_K, groundTurnRate, SLIDE_SEC, slideEnds,
} from '../core/FreeRunCore';
import { trackPieces, respawnFor, overGap, routeAt, laneAt, railAt, springAt, gateAhead, hazardAhead, indexCourse, castCourse, type Piece, type CourseIndex, type RayHit } from './freeRunCourse';
// IMPROVE (2026-10-06): a personal best per track and tier, split at every checkpoint
import { loadPb, savePbIfFaster, gateDeltaMs, splitWords, type FreeRunPb } from '../core/FreeRunSplits';
import { deltaLabel } from '../racing/ghost';
// FLOW (owner brief 2026-09-18): the parkour racer's momentum rules — flow and kinetic meters, the vector rebound, the
// momentum vault, rails, surf, springs, speed gates and the grapple. Pure in core/FreeRunFlow; the tracks in nexus/freeRunTracks.
import { FLOW, FlowMeter, KINETIC, KineticMeter, vectorRebound, approachDeg, vaultTiming, VAULT, REBOUND, gateOpen, GATE_NEED, canGrapple, swingAt, GRAPPLE, DRAFT, draftStep, isDrafting } from '../core/FreeRunFlow';
// RIVALS (owner brief 2026-09-18, pass 2): three runners down the lanes, the draft and the slingshot, the drive-by, the parry-vault,
// hazards and slams that drop them, a rank on the HUD. Pure in core/FreeRunRivals; the bodies are FreeRunAnimTree rigs.
import { RIVALS, makeRivals, stepRival, alongside, stumble, hazardVictims, slamVictims, standing, type Rival, type CourseRead } from '../core/FreeRunRivals';
import { trackById, FREERUN_TRACKS, type FreeRunTrack } from '../nexus/freeRunTracks';

const CAPSULE_H = 1.7, CAPSULE_R = 0.32;
/** R3 LOCK-ON (racing pass): how far along the course a runner can be locked, and how far a locked drive-by reaches
 *  (alongside is 2.2 m along / 2.6 m across; a lock stretches it to a lunge's worth). */
const LOCK_RANGE_M = 30, LOCK_STRIKE_ALONG_M = 4.5, LOCK_STRIKE_LATERAL_M = 4;
/** Seconds at the start line before the clock runs on its own; the run is called at this many times the course par. */
const START_GRACE_SEC = 4, RUN_CAP_PAR = 3;
const JUMP_V = 6.4, VAULT_V = 4.6, WALLRUN_SEC = 1.1, WALLKICK_V = 6.8, WALLKICK_PUSH = 5.2, DOWN_SEC = 1.3;   // SLIDE_SEC lives in FreeRunCore now (the LT hold reads it)
const BANK_AFTER_SEC = 0.6;          // Skate's revert window: roll clean this long and the pot banks
const JUMP_BEAT_SEC = 0.42;          // jump_up is 0.45 s: the take-off clip, then the tree holds the air pose
const LAND_BEAT_SEC = 0.38;          // jump_land is 0.35 s: the whole absorb shows before the run takes over
const RISE_SEC = 0.45;               // karate_get_up: the last part of DOWN_SEC is the get-up
const PICK_TIMEOUT_S = 6;
const FALL_Y = -2.5;
const BAR_CLIP_SPEED = 0.45;         // clip the bar without sliding: keep this much speed
/** IMPROVE (2026-10-06): an A pressed this long before touchdown still fires on the landing (gameFeel.InputBuffer's 140 ms,
 *  on the mode's clock so a pause or a hit-stop cannot spend it). */
const A_BUFFER_SEC = 0.14;
/** IMPROVE (2026-10-06): a speed gate shows what it needs from this far out (it used to say so 0.9 m from the wall). */
const GATE_WARN_M = 15;
/** IMPROVE (2026-10-06): a rival rig this far along the course from the runner is parked (no clip evaluation); it wakes
 *  inside RIG_WAKE_M (the gap stops a rival on the line flickering between the two). */
const RIG_PARK_M = 40, RIG_WAKE_M = 36;

type Launch = keyof typeof LAUNCH_MULT;
type Phase = 'pick' | 'run' | 'done';

interface St {
  scene: Scene;
  phase: Phase; pickSec: number; autoBegin: boolean;
  tier: Tier; pieces: Piece[]; meshes: AbstractMesh[]; aggs: PhysicsAggregate[];
  hero: SpawnedCharacter | null; cc: PhysicsCharacterController | null;
  state: RunState; speed: number; heading: Vector3; stick: Vector3;
  airStartY: number; airSec: number; launch: Launch; trick: FreeRunTrick | null; trickSpun: number;
  wallSec: number; wallNormal: Vector3; slideSec: number; downSec: number; groundSec: number;
  rollAt: number | null; clock: number;
  combo: ComboChain; started: boolean; runSec: number; finished: boolean; /** seconds stood at the start before moving */ waitSec: number;
  checkpoint: number; highTouched: boolean; bails: number; barsCleared: Set<number>;
  env: Env;
  /** ANIM-READABILITY (creative, 2026-09-07): the ONE OWNER of the runner's clips. The mode never calls animator.play;
   *  it latches wall-clock beats (take-off, landing) and feeds the tree once per frame. */
  tree: FreeRunAnimTree | null; jumpAt: number; landAt: number; landing: 'none' | 'clean' | 'sketchy';
  /** PARKOUR captures for the current beats (null = the base clip), and how long the landing beat holds. */
  takeoffClip: string | null; landClip: string | null; slideClip: string | null; landBeatSec: number;
  /** BIOMECH-WAVE2: the Posture Poses layer and the body it is fed. */
  posture: { layer: PostureLayer; dispose(): void } | null; bio: FreeRunPostureInput;
  /** Vertical velocity, owned here: the controller integrates the velocity it is handed, so gravity is ours to apply. */
  vy: number;
  /** A+ P0 juice: performance.now() of the last bail punch (one per crash), and the one finish punch. */
  bailAt: number; finishLatch: boolean;
  // FLOW (2026-09-18)
  track: FreeRunTrack; flow: FlowMeter; kinetic: KineticMeter;
  grindRail: Piece | null; grindEndAt: number; surfSec: number; dashSec: number; ltHeld: boolean; rtHeld: boolean;
  swing: { from: Vector3; anchor: Piece; t: number } | null; anchorNear: Piece | null;
  wallApproachDeg: number; wallDist: number; vaultDist: number;
  gateAggs: Map<number, PhysicsAggregate>; pieceMesh: Map<number, Mesh>; springLatch: number; slideEndAt: number; rsTricked: boolean;
  stats: { rebounds: number; perfectVaults: number; grinds: number; surfs: number; springs: number; gates: number; grapples: number; bursts: number; slams: number; kicks: number; flowBursts: number };
  // RIVALS (pass 2)
  rivals: Rival[]; rivalRigs: { char: SpawnedCharacter; tree: FreeRunAnimTree; parked: boolean }[];
  draft: number; draftSaid: boolean;
  /** An incoming lunge: the rival and the clock it lands at (B inside the window parries it). */
  lunge: { r: Rival; at: number } | null;
  /** R3 LOCK-ON (racing pass, 2026-09-23): the rival the drive-by aims at — it reaches a locked runner that is near but
   *  not quite alongside, which is what the brief's "R3 lock-on nearest racer" is for. */
  lockOn: Rival | null;
  race: { driveBys: number; parries: number; hitsTaken: number; slingshots: number; hazardHits: number; slamHits: number; place: number; deltaSec: number };
  // ── IMPROVE (2026-10-06) ──
  /** Coyote time on the jump, per scene (it was one module-level timer every mount shared). */
  coyote: Coyote;
  /** The camera preset's resting fov, captured on the first run frame (was module scope too). */
  baseFov: number | null;
  /** What the course was built as (track:tier), the materials and merged meshes that build made, and its piece index. */
  builtKey: string; mats: PBRMaterial[]; merged: Mesh[]; idx: CourseIndex;
  /** The rivals' read of the course, built once per build (it was a new closure per rival per frame). */
  courseRead: CourseRead;
  /** The banner's expiry on the mode clock (null = holds); one channel, so an older banner can never clear a newer one. */
  bannerUntil: number | null;
  /** Mode clock of an A pressed in the air that nothing took (replayed on touchdown inside A_BUFFER_SEC). */
  aBufferAt: number;
  /** The slide's elapsed seconds, and whether LT started it (an LT slide lasts while LT is held). */
  slideByLt: boolean;
  /** The trick fill last sent to the HUD (tenths), and whether the "around" tick has sounded this trick. */
  trickPctShown: number; trickAroundSaid: boolean;
  /** The speed-gate read-out last sent to the HUD. */
  gateReqShown: string;
  /** The personal best for this track and tier (loaded at begin), and this run's clock at each checkpoint (ms). */
  pb: FreeRunPb | null; gateTimes: number[];
}
const states = new WeakMap<Scene, St>();
const live = new Set<St>();

/** How far the StandardMaterial-era palette is pulled down to sit correctly as PBR albedo. */
const PBR_ALBEDO_SCALE = 0.42;
// SCORECARD VISUALS (2026-09-15): the course read as one grey-blue mass — the ground drops away from the things you USE,
// so the vault box, the wall and the bar each own a colour against it.
const MAT: Record<string, string> = { ground: '#6E6A66', vault: '#D99A3C', wall: '#C4603F', ledge: '#3FB8B0', roof: '#3FB8B0', bar: '#F2C230', start: '#3DDC97', finish: '#F4C542', checkpoint: '#4FD1E8', gap: '#000000', rail: '#e5e7eb', spring: '#34d399', gate: '#f87171', anchor: '#fde68a', hazard: '#b45309', slope: '#5a5e66' };
const SPRING_V = 8.8, GRIND_MIN = 4.5, SURF_TOP = 1.6, KICK_M = 1.6;

// IMPROVE (2026-10-06): the fov baseline and the coyote timer moved into St (per scene). Scratch vectors for the
// per-frame physics step, the probe and the camera: temporaries, written and read inside one call, never kept.
const V_DOWN = new Vector3(0, -1, 0), V_UP = new Vector3(0, 1, 0), V_ZERO = new Vector3(0, 0, 0);
const TMP_VEL = new Vector3(), TMP_POS = new Vector3(), TMP_MOVE = new Vector3(), TMP_CAM = new Vector3(), TMP_AIM = new Vector3(), TMP_WISH = new Vector3();
const PROBE_LEDGE: readonly ['ledge', 'roof'] = ['ledge', 'roof'];
/** The press the A buffer replays on touchdown. */
const A_PRESS: FelInput = { t: 'button', btn: 'A', pressed: true };
const PROBE_VAULT: readonly ['vault'] = ['vault'], PROBE_WALL: readonly ['wall'] = ['wall'], PROBE_BAR: readonly ['bar'] = ['bar'];
/** One support read per scene, refilled in place each frame (checkSupportToRef). */
const supportFor = new WeakMap<Scene, CharacterSurfaceInfo>();
function supportOf(scene: Scene): CharacterSurfaceInfo {
  let s = supportFor.get(scene);
  if (!s) { s = { isSurfaceDynamic: false, supportedState: CharacterSupportedState.UNSUPPORTED, averageSurfaceNormal: new Vector3(), averageSurfaceVelocity: new Vector3(), averageAngularSurfaceVelocity: new Vector3() }; supportFor.set(scene, s); }
  return s;
}
/** Kinds merged into one mesh per material: static and never touched again (a gate opens, a hazard is kicked, a marker is
 *  translucent — those stay separate). */
const MERGE_KINDS = new Set(['ground', 'vault', 'wall', 'ledge', 'roof', 'bar', 'rail', 'spring', 'anchor', 'slope']);

export const FreeRunMode: ModeDefinition = (() => {
  const st = (ctx: ModeContext): St | undefined => states.get(ctx.scene);

  /** The key a build is made for: a rebuild with the same key is skipped (IMPROVE 2026-10-06: load built the course and
   *  begin built it again, identically, re-creating ~16 PBR materials each time without disposing the old ones). */
  const courseKey = (S: St): string => `${S.track.id}:${S.tier.id}`;

  /** Re-read the per-frame lookups after the pieces change (a build, a kicked hazard). */
  function reindex(S: St): void {
    S.idx = indexCourse(S.pieces);
    const idx = S.idx;
    S.courseRead = {
      overGap: (x: number, z: number) => overGap(idx.gaps, x, z),
      obstacleAhead: (x: number, z: number, ahead: number) => idx.obstacles.some((q) => Math.abs(q.x - x) <= q.w / 2 + 0.3 && q.z - q.d / 2 - z > -0.2 && q.z - q.d / 2 - z < ahead),
      finishZ: idx.finishZ,
    };
  }

  function buildCourse(ctx: ModeContext, S: St): void {
    if (S.builtKey === courseKey(S)) return;
    S.builtKey = courseKey(S);
    for (const m of S.merged) m.dispose(); S.merged = [];
    for (const m of S.meshes) m.dispose(); S.meshes = []; S.aggs = [];   // a mesh's dispose takes its aggregate with it
    for (const m of S.mats) m.dispose(); S.mats = [];                     // IMPROVE (2026-10-06): the last build's paint
    S.pieces = trackPieces(S.track, S.tier);
    reindex(S);
    S.gateAggs.clear(); S.pieceMesh.clear(); S.barsCleared.clear();
    // EVERY PIECE WAS A StandardMaterial, AND THAT IS WHY THIS MODE LOOKED UNFINISHED.
    //
    // Per-mode visual audit (2026-09-13): Freerun graded C — "untextured white/grey blocks on a white plane"
    // and the mode most likely to make the project look unfinished. The cause is not missing art. These
    // venues light for PBR (hemispheric 0.85 + a directional at 2.60), and a StandardMaterial multiplies its
    // diffuse by that linearly and CLIPS AT WHITE: the `#8E8A84` ground and the `#C9A15A` vault both land on
    // white, so an authored palette of seven distinct colours rendered as one grey. Nobody mis-typed a
    // colour; the material could not survive the lighting. VenueKit.paint's own doc names this exact bug
    // with Velocity Kart as its worked example, and it is the third place today it has turned up.
    //
    // Roughness varies by what the thing IS — concrete ground is matte, a metal bar is not — which is a
    // distinction StandardMaterial could not express here at all.
    const mats = new Map<string, PBRMaterial>();
    const GLOW = new Set(['ledge', 'roof', 'finish', 'start', 'checkpoint', 'rail', 'spring', 'gate', 'anchor']);
    const ROUGH: Record<string, number> = { ground: 0.95, vault: 0.8, wall: 0.85, bar: 0.35 };
    const matFor = (kind: string): PBRMaterial => {
      let m = mats.get(kind);
      if (!m) {
        // PLACE: the track's palette over the authored one. IMPROVE (2026-10-06): read off the TRACK, which the pick screen
        // can now change — the place look is the track the splash picked, so a run that keeps it paints exactly as before
        const hex = S.track.world.colors[kind] ?? readPlaceLook('freerun')?.world?.colors[kind] ?? MAT[kind] ?? '#888888';
        // the gates and ledges read as markers, so they keep a real emissive floor; surfaces do not
        m = VenueKit.paint(ctx.scene, `fr_mat_${kind}`, hex, GLOW.has(kind) ? 0.3 : 0.05, ROUGH[kind] ?? 0.7);
        // AND THE PALETTE ITSELF WAS AUTHORED FOR THE WRONG MATERIAL MODEL. These hexes were picked against
        // StandardMaterial's linear multiply; the same values as PBR albedo, under this rig's exposure,
        // land far lighter — the `#8E8A84` ground measured 0.556 albedo and read as white concrete-paper.
        // Surfaces are pulled down so they sit where the author meant them to; the markers keep their value
        // because a marker is supposed to be brighter than the thing it is stuck to.
        if (!GLOW.has(kind)) m.albedoColor = m.albedoColor.scale(PBR_ALBEDO_SCALE);
        mats.set(kind, m); S.mats.push(m);
      }
      return m;
    };
    for (const [i, p] of S.pieces.entries()) {
      if (p.kind === 'gap') continue;                                    // a gap is the absence of ground
      const isGate = p.kind === 'start' || p.kind === 'finish' || p.kind === 'checkpoint';
      const box: Mesh = MeshBuilder.CreateBox(`fr_${p.kind}_${i}`, { width: p.w, height: p.h, depth: p.d }, ctx.scene);
      box.position.set(p.x, p.y, p.z);
      if (p.kind === 'slope' && p.pitch) box.rotation.x = p.pitch;   // the spillway: a tilted slab (the aggregate follows the mesh)
      box.material = matFor(p.kind);
      box.metadata = { freerun: p.kind, pieceIndex: i };
      S.pieceMesh.set(i, box);
      // SCORECARD VISUALS (2026-09-15): at 0.35 the start gate's slab washed over the whole course in the opening frame —
      // a gate is a MARKER you run through, not a pane of fog
      if (isGate) { box.visibility = 0.18; box.isPickable = false; }
      else if (p.kind === 'bar') { box.isPickable = true; }             // a gate you slide under; not a collider (the capsule cannot crouch)
      else if (p.kind === 'rail' || p.kind === 'anchor' || p.kind === 'spring') { box.isPickable = false; }   // a rail is ridden by state, not collided with; an anchor is a point; a spring is a pad you run over (a collider stopped the capsule at its edge)
      else if (p.kind === 'gate') { box.visibility = 0.45; box.isPickable = false; const agg = new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0, friction: 0.9 }, ctx.scene); S.aggs.push(agg); S.gateAggs.set(i, agg); }   // a speed gate: solid until you are fast enough
      else S.aggs.push(new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0, friction: 0.9 }, ctx.scene));
      S.meshes.push(box);
    }
    // IMPROVE (2026-10-06): every piece was its own mesh and its own draw (100+ on a track, again per shadow cascade). The
    // static kinds draw as ONE merged mesh per material; the per-piece boxes stay — hidden — because each carries its own
    // Havok shape (an aggregate is a box on a node) and the dispose path. Nothing moves, so every matrix is frozen.
    const byKind = new Map<string, Mesh[]>();
    for (const m of S.meshes) {
      const kind = (m.metadata as { freerun?: string } | null)?.freerun ?? '';
      if (!MERGE_KINDS.has(kind)) continue;
      let list = byKind.get(kind); if (!list) { list = []; byKind.set(kind, list); } list.push(m as Mesh);
    }
    for (const [kind, list] of byKind) {
      if (list.length < 2) continue;
      // named BEFORE the merge fills it: the light rig sorts shadow casters from receivers by name the moment a mesh is
      // added, and the ground must stay a receiver (a mesh MergeMeshes names itself would cast and stop receiving)
      const target = new Mesh(`fr_${kind}_merged`, ctx.scene);
      const merged = Mesh.MergeMeshes(list, false, true, target);
      if (!merged) { target.dispose(); continue; }
      merged.material = matFor(kind); merged.isPickable = false;
      merged.metadata = { freerunMerged: kind };
      merged.freezeWorldMatrix();
      for (const m of list) m.isVisible = false;
      S.merged.push(merged);
    }
    for (const m of S.meshes) if (MERGE_KINDS.has((m.metadata as { freerun?: string } | null)?.freerun ?? '')) m.freezeWorldMatrix();
  }

  function hud(ctx: ModeContext, S: St, extra: Record<string, HudValue> = {}): void {
    const h = S.combo.hud;
    ctx.setHud({
      speed: Math.round(S.speed * 10) / 10, speedMax: RUN_MAX,
      verbs: [...verbsFor(S.state, S.speed, S.env), ...(S.state === 'ground' && S.env.wallAhead && S.wallApproachDeg >= REBOUND.minDeg && S.wallApproachDeg <= REBOUND.maxDeg ? ['REBOUND'] : []), ...(S.anchorNear ? ['GRAPPLE'] : []), ...(S.state === 'grind' ? ['GRIND'] : []), ...(S.state === 'surf' ? ['SURF'] : []), ...(S.kinetic.canSlam ? ['SLAM'] : S.kinetic.canBurst ? ['BURST'] : [])].join(' · '),
      place: `P${S.race.place} / ${S.rivals.length + 1}`, delta: S.race.place > 1 ? `+${S.race.deltaSec.toFixed(1)}s` : 'LEADING', draft: Math.round(S.draft * 100),
      flow: S.flow.tier, flowFrac: Math.round(S.flow.frac * 100), kinetic: Math.round(S.kinetic.value), lane: laneAt(S.hero?.root.position.x ?? 0, S.hero?.root.position.y ?? 0).toUpperCase(), track: S.track.name,
      combo: h.combo, pot: h.pot, banked: h.banked, score: h.banked + h.pot,
      time: Math.round(S.runSec * 10) / 10, checkpoint: `${S.checkpoint}/${S.idx.checkpointCount}`,
      tier: S.tier.name, route: S.highTouched ? 'HIGH LINE' : 'LOW LINE', runState: S.state,
      gateReq: S.gateReqShown, gateReady: S.gateReqShown.endsWith('OPEN') ? 1 : 0,   // IMPROVE (2026-10-06): the speed gate ahead
      ...extra,
    });
  }

  /** IMPROVE (2026-10-06): ONE banner channel with an expiry on the mode clock. Each flash used to start its own
   *  setTimeout to clear itself, so an older banner's timer wiped a newer one ("PARRY", "GATE OPEN" vanished early) —
   *  and, on real time, the timers ran on through a pause. The newest banner owns the expiry; update() clears it. */
  function flash(ctx: ModeContext, text: string, ms = 700): void {
    ctx.setHud({ banner: text });
    const S = st(ctx); if (S) S.bannerUntil = S.clock + ms / 1000;
  }
  /** A banner that holds until something replaces it (the pick screen, the finish). */
  function holdBanner(S: St): void { S.bannerUntil = null; }
  function tickBanner(ctx: ModeContext, S: St): void {
    if (S.bannerUntil !== null && S.clock >= S.bannerUntil) { S.bannerUntil = null; ctx.setHud({ banner: '' }); }
  }

  // ── A+ P0 juice (PM brief CARNIVAL-A-PLUS-P0, 2026-09-07) — the skate bail recipe on the gymnastics slot. No slowMo, no
  // juice.impact({ slow }); Havok traversal untouched.
  /** A big land or a banked line: a soft shake (the light feel hit on the landing stays). */
  function softBeat(ctx: ModeContext, tag: string): void { ctx.juice.shake(0.07, 120); console.info(`[FR-JUICE] soft beat (${tag})`); }
  /** A bail or a fall: hit-stop + shake + ONE low thud (replaces feel.impact(0.7), whose thud would double the miss cue's
   *  partner). Latched once per crash. */
  function bailPunch(ctx: ModeContext, S: St, tag: string): void {
    const t = performance.now(); if (t - S.bailAt < 400) { console.info(`[FR-JUICE] bail latched (${tag})`); return; } S.bailAt = t;
    ctx.juice.hitStop(45); ctx.juice.shake(0.10, 140);
    SoundKit.play('impact', { pitch: 0.6, volume: 0.65 });
    console.info(`[FR-JUICE] bail punch (${tag})`);
  }
  /** The finish: one punch — hit-stop + shake + a flash that is gold on an S / A run. Once per run. */
  function finishPunch(ctx: ModeContext, S: St, top: boolean): void {
    if (S.finishLatch) return; S.finishLatch = true;
    ctx.juice.hitStop(55); ctx.juice.shake(0.12, 150); ctx.juice.flash(top ? '#FFD700' : '#fff6dd', top ? 140 : 100);
    console.info(`[FR-JUICE] finish punch (${top ? 'gold' : 'white'})`);
  }

  /** A take-off / a touchdown: latch the beat for the tree (re-fires on a new beat of the same kind). */
  function jumpBeat(S: St): void { S.jumpAt = S.clock; S.tree?.clearBeat('jump'); }
  function landBeat(S: St, landing: 'clean' | 'sketchy', rolled = false): void {
    // PARKOUR: a timed roll out of a real drop lands in the captured dive roll, and the beat holds for it
    S.landClip = rolled && landing === 'clean' && S.hero?.animator.clipNames.has('pk_dive_roll') ? 'pk_dive_roll' : null;
    S.landBeatSec = S.landClip ? Math.max(LAND_BEAT_SEC, (S.hero!.animator.durationOf('pk_dive_roll') ?? 1.1) * 0.8) : LAND_BEAT_SEC;
    S.landAt = S.clock; S.landing = landing; S.tree?.clearBeat('land_clean', 'land_sketchy');
  }

  // ── FLOW verbs (owner brief 2026-09-18) ──────────────────────────────
  function say(ctx: ModeContext, text: string, ms = 700): void { flash(ctx, text, ms); console.info(`[FR-FLOW] ${text}`); }
  /** The VECTOR REBOUND: the heading reflects off the wall, the speed is kept (plus a little when the tap is on the contact). */
  function rebound(ctx: ModeContext, S: St): boolean {
    const n = S.wallNormal;
    const r = vectorRebound({ x: S.heading.x, z: S.heading.z }, { x: n.x, z: n.z });
    if (!r) return false;
    const onContact = S.wallDist < 0.9;
    S.heading.set(r.x, 0, r.z);
    S.speed = S.speed * REBOUND.keep + (onContact ? REBOUND.bonus : 0);
    S.flow.add(FLOW.rebound); S.kinetic.add(KINETIC.chain * 0.5); S.stats.rebounds++;
    S.state = 'air'; S.airStartY = S.hero!.root.position.y; S.airSec = 0; S.launch = 'wallkick'; S.trick = null; S.rollAt = null;
    S.vy = 3.2; S.cc!.setVelocity(new Vector3(r.x * S.speed, S.vy, r.z * S.speed)); jumpBeat(S);
    S.combo.add('REBOUND', 70, 'grind');
    say(ctx, onContact ? 'VECTOR REBOUND · PERFECT' : 'VECTOR REBOUND');
    SoundKit.play('impact', { pitch: 1.5, volume: 0.45 }); ctx.feel?.impact?.(0.25); ctx.juice.flash('#ffffff', 60);
    return true;
  }
  /** Onto a rail: the grind locks the line and keeps the speed (a slide straight into it pays a mini boost). */
  function startGrind(ctx: ModeContext, S: St, rail: Piece): void {
    S.state = 'grind'; S.grindRail = rail; S.speed = Math.max(GRIND_MIN, S.speed); S.trick = null; S.vy = 0;
    const fromSlide = S.clock - S.slideEndAt < 0.35;
    if (fromSlide) { S.speed += 1.5; S.flow.add(20); say(ctx, 'SLIDE TO GRIND · BOOST'); } else say(ctx, 'RAIL GRIND');
    S.stats.grinds++; S.combo.add('GRIND', 40, 'grind'); SoundKit.play('swish', { pitch: 0.9, volume: 0.4 });
  }
  function endGrind(S: St, vy: number): void {
    S.grindRail = null; S.state = 'air'; S.airStartY = S.hero!.root.position.y; S.airSec = 0; S.launch = 'ground'; S.trick = null; S.rollAt = null;
    S.vy = vy; S.cc!.setVelocity(new Vector3(S.heading.x * S.speed, vy, S.heading.z * S.speed)); jumpBeat(S);
  }
  /** A speed gate ahead: fast enough and it opens; too slow and it is a wall. */
  function tickGates(ctx: ModeContext, S: St): void {
    const p = S.hero!.root.position;
    // IMPROVE (2026-10-06): the gate's need, read from GATE_WARN_M out — "LOCKED" used to show 0.9 m from the gate, by
    // which point you had hit a wall. The HUD carries the needed speed against yours until the gate opens or is passed.
    const far = gateAhead(S.idx.gates, p.x, p.z, GATE_WARN_M);
    const farLocked = far && S.gateAggs.has(S.idx.indexOf.get(far) ?? -1) ? far : null;
    const need = farLocked ? RUN_MAX * GATE_NEED[farLocked.gateTier ?? 1] : 0;
    const req = farLocked ? `GATE T${farLocked.gateTier ?? 1} · NEED ${need.toFixed(1)} · YOU ${S.speed.toFixed(1)}${S.speed >= need ? ' · OPEN' : ''}` : '';
    // the numbers ride the six-a-second HUD frame; only the gate coming into or out of range is pushed at once
    const was = S.gateReqShown; S.gateReqShown = req;
    if (!was !== !req) ctx.setHud({ gateReq: req, gateReady: farLocked && S.speed >= need ? 1 : 0 });
    const g = gateAhead(S.idx.gates, p.x, p.z, 3);
    if (!g) return;
    const i = S.idx.indexOf.get(g) ?? -1;
    const agg = S.gateAggs.get(i);
    if (!agg) return;
    if (gateOpen(S.speed, g.gateTier ?? 1, RUN_MAX)) {
      agg.dispose(); S.gateAggs.delete(i);
      const m = S.pieceMesh.get(i); if (m) { m.visibility = 0.08; (m.material as PBRMaterial).emissiveColor = Color3.FromHexString('#34d399'); }
      S.speed += 0.5; S.flow.add(15); S.stats.gates++;
      say(ctx, `GATE OPEN · TIER ${g.gateTier}`); SoundKit.play('clang', { pitch: 1.2, volume: 0.5 }); ctx.juice.flash('#34d399', 70);
    } else if (g.z - p.z < 0.9 && S.clock - S.springLatch > 0.8) { S.springLatch = S.clock; say(ctx, `LOCKED — TIER ${g.gateTier} SPEED`, 600); }
  }
  /** X on a loose hazard: kick it down the course (a weapon against whoever is behind it — the rivals are the next pass). */
  function kickHazard(ctx: ModeContext, S: St): boolean {
    const p = S.hero!.root.position;
    const h = hazardAhead(S.pieces, p.x, p.z, KICK_M);
    if (!h) return false;
    const i = S.pieces.indexOf(h);
    const m = S.pieceMesh.get(i); const agg = S.aggs.find((a) => a.transformNode === m);
    if (agg) { agg.dispose(); S.aggs = S.aggs.filter((a) => a !== agg); }
    if (m) { const from = m.position.clone(); const t0 = S.clock; const obs = ctx.scene.onBeforeRenderObservable.add(() => { const u = Math.min(1, (S.clock - t0) / 0.7); m.position.set(from.x, from.y + Math.sin(u * Math.PI) * 1.4, from.z + u * 11); m.rotation.x += 0.3; if (u >= 1) { ctx.scene.onBeforeRenderObservable.remove(obs); m.setEnabled(false); } }); }
    S.pieces.splice(i, 1, { ...h, kind: 'gap', y: -99, d: 0, w: 0 });   // gone from the readers (a zero-size gap is nothing)
    reindex(S);   // IMPROVE (2026-10-06): the rivals stop hopping a hazard that is no longer there
    for (const v of hazardVictims({ x: h.x, z: h.z }, S.rivals)) { stumble(v); S.race.hazardHits++; S.kinetic.add(KINETIC.hit); say(ctx, `DEBRIS HIT ${v.name}`, 600); }
    S.speed += 0.6; S.kinetic.add(10); S.stats.kicks++;
    S.combo.add('KICK', 25, 'manual'); say(ctx, 'KICKED IT DOWN THE LINE'); SoundKit.play('impact', { pitch: 1.1, volume: 0.5 }); ctx.feel?.impact?.(0.3);
    return true;
  }
  /** LB near an anchor: the grapple — a swing under it that exits past it, faster. */
  function grapple(ctx: ModeContext, S: St): boolean {
    const a = S.anchorNear; if (!a) return false;
    S.swing = { from: S.hero!.root.position.clone(), anchor: a, t: 0 }; S.state = 'swing'; S.trick = null; S.vy = 0;
    S.stats.grapples++; S.combo.add('GRAPPLE', 55, 'grind'); say(ctx, 'GRAPPLE'); SoundKit.play('whoosh', { pitch: 1.3, volume: 0.5 });
    return true;
  }
  /** Y: KINETIC OVERDRIVE — a ground slam with a full meter, else a forward burst with half of one. */
  function overdrive(ctx: ModeContext, S: St): boolean {
    if (S.state !== 'air' && S.kinetic.spendSlam()) {
      S.stats.slams++; S.combo.add('SLAM', 90, 'air');
      EffectsKit.burst(ctx.scene, S.hero!.root.position, 'dust', 3); ctx.juice.shake(0.18, 220); ctx.juice.hitStop(50); ctx.feel?.impact?.(0.6); SoundKit.play('thud', { pitch: 0.6, volume: 0.8 });
      for (const v of slamVictims({ x: S.hero!.root.position.x, z: S.hero!.root.position.z }, S.rivals, KINETIC.slamRadius)) { stumble(v); S.race.slamHits++; say(ctx, `SLAM DROPPED ${v.name}`, 600); }
      say(ctx, 'GROUND SLAM'); return true;
    }
    if (S.kinetic.spendBurst()) {
      S.speed += KINETIC.burstSpeed; S.dashSec = KINETIC.burstSec; S.stats.bursts++;
      ctx.juice.flash('#fde68a', 60); SoundKit.play('whoosh', { pitch: 1.4, volume: 0.6 }); ctx.feel?.impact?.(0.3);
      say(ctx, 'KINETIC BURST'); return true;
    }
    refuse(ctx, 'OVERDRIVE — METER LOW'); return false;
  }

  /** RIVALS: one frame of the field — their run, the draft behind them, a lunge landing on you, the rank. */
  function tickRivals(ctx: ModeContext, S: St, dt: number): void {
    const p = S.hero!.root.position;
    const course = S.courseRead;   // IMPROVE (2026-10-06): built once per build, not a closure per rival per frame
    let drafting = false;
    for (const [i, r] of S.rivals.entries()) {
      const out = S.started ? stepRival(r, dt, RUN_MAX, course, { x: p.x, z: p.z }, S.clock) : { lunged: false, telegraphed: false, finished: false };
      if (out.telegraphed) { S.lunge = { r, at: S.clock + RIVALS.lungeTelegraphSec }; say(ctx, `${r.name} LUNGES — B TO PARRY`, 500); ctx.juice.callout('PARRY!', '#f87171', 450); SoundKit.play('uiTick', { pitch: 0.6, volume: 0.5 }); }
      if (out.lunged) {
        if (S.lunge && S.lunge.r === r) S.lunge = null;
        const inReach = Math.abs(p.z - r.z) < RIVALS.lungeGapM + 0.6 && Math.abs(p.x - r.x) < RIVALS.lungeLateralM && S.state !== 'air' && S.state !== 'swing';
        if (inReach) { S.speed *= RIVALS.lungeHitKeep; S.race.hitsTaken++; landBeat(S, 'sketchy'); say(ctx, `${r.name} HIT YOU`, 700); SoundKit.play('impact', { pitch: 0.8, volume: 0.5 }); ctx.juice.shake(0.12, 160); ctx.feel?.impact?.(0.4); ctx.momentum.report({ kind: 'blunder', weight: -8 }); }
        else say(ctx, `${r.name} MISSED`, 400);
      }
      if (out.finished) say(ctx, `${r.name} FINISHED`, 700);
      if (isDrafting({ along: p.z, lateral: p.x }, { along: r.z, lateral: r.x })) drafting = true;
      const rig = S.rivalRigs[i];
      if (rig) {
        rig.char.root.position.set(r.x, r.y, r.z); rig.char.root.rotation.y = 0;
        // IMPROVE (2026-10-06): a rival far up or down the course is a few pixels tall — its rig is PARKED (every clip
        // stopped, so nothing is evaluated or re-skinned; the body holds its last pose and keeps moving) and woken with a
        // fresh tree when it comes back inside RIG_WAKE_M. Measured cost unverified; the saving is three rigs' clip work.
        const far = Math.abs(r.z - p.z);
        if (!rig.parked && far > RIG_PARK_M) { rig.parked = true; rig.tree.reset(); rig.char.animator.park(); }   // reset first: stop() raises a one-shot's end, and a tree still in it would replay
        else if (rig.parked && far < RIG_WAKE_M) { rig.parked = false; rig.tree.reset(); }
        if (!rig.parked) rig.tree.update({ speed01: Math.min(1, r.speed / RUN_MAX), airborne: r.air, jumpBeat: false, tricking: false, wallrun: false, sliding: false, landing: 'none', down: r.stumble > 0.45, celebrating: r.finished });
      }
    }
    if (S.lunge && S.clock > S.lunge.at + RIVALS.parryWindowSec) S.lunge = null;
    S.draft = draftStep(S.draft, drafting && S.state === 'ground', dt);
    if (S.draft >= 1 && !S.draftSaid) { S.draftSaid = true; say(ctx, 'SLINGSHOT READY — A', 700); SoundKit.play('powerUp', { pitch: 1.3, volume: 0.4 }); }
    if (S.draft < 1) S.draftSaid = false;
    const st = standing(p.z, S.speed, S.rivals);
    if (st.place < S.race.place) { ctx.momentum.report({ kind: 'overtake', weight: 12 }); ctx.juice.scorePop(p.add(new Vector3(0, 2, 0)), `P${st.place}`, '#86efac'); }
    S.race.place = st.place; S.race.deltaSec = st.deltaSec;
  }

  /** The tree is fed once per frame, every phase, from the run's context — the movement INTENT included (S.speed is the
   *  speed the runner keeps through a landing, so a landing under a held stick settles onto the run, not an idle flash). */
  function feedTree(S: St): void {
    if (!S.tree) return;
    const airborne = S.state === 'air' || S.state === 'swing';
    // one read, two consumers (the clip and the body under it)
    S.bio.state = S.state === 'ground' || S.state === 'air' || S.state === 'wallrun' || S.state === 'slide' || S.state === 'down' ? S.state : S.state === 'surf' ? 'slide' : S.state === 'swing' ? 'air' : 'ground';
    S.bio.speed01 = S.finished ? 0 : Math.min(1, S.speed / RUN_MAX);
    S.bio.tricking = airborne && !!S.trick;
    S.bio.landing = !airborne && S.clock - S.landAt < LAND_BEAT_SEC;
    S.bio.rising = S.state === 'down' && S.downSec <= RISE_SEC;
    S.bio.vaulting = S.env.vaultAhead && S.state === 'ground' && S.speed > RUN_MAX * 0.4;
    S.bio.celebrating = S.finished;
    S.tree.update({
      speed01: S.finished ? 0 : Math.min(1, S.speed / RUN_MAX),   // the finish: the celebrate settles into the idle, not a run on the spot under the results banner
      airborne,
      jumpBeat: airborne && S.clock - S.jumpAt < JUMP_BEAT_SEC,
      tricking: airborne && !!S.trick,
      wallrun: S.state === 'wallrun',
      sliding: S.state === 'slide' || S.state === 'surf',
      landing: !airborne && S.clock - S.landAt < S.landBeatSec ? S.landing : 'none',
      takeoffClip: S.takeoffClip, landClip: S.landClip, slideClip: S.slideClip,
      down: S.state === 'down' && S.downSec > RISE_SEC,   // the last RISE_SEC of DOWN_SEC is the get-up
      celebrating: S.finished,
    });
  }

  // ── probes: what the course offers right now ─────────────────────────
  // IMPROVE (2026-10-06): four whole-scene ray picks a frame became four ray-box tests against the course pieces near the
  // runner (freeRunCourse.castCourse): the same rays, lengths and kinds; the course is axis-aligned boxes the mode built
  // itself, so the slab test gives the same hit, distance and face normal a mesh pick did — with no Ray, no predicate
  // over every mesh in the scene, and no Vector3s.
  function probe(S: St): void {
    const p = S.hero!.root.position;
    const fwd = S.heading;
    const cast = (oy: number, ahead: number, dx: number, dy: number, dz: number, len: number, kinds: Parameters<typeof castCourse>[9]): RayHit | null =>
      castCourse(S.idx, p.z, p.x + fwd.x * ahead, p.y + oy, p.z + fwd.z * ahead, dx, dy, dz, len, kinds);
    const knee = cast(0.6, 0, fwd.x, fwd.y, fwd.z, 1.7, PROBE_VAULT);
    const chest = cast(1.3, 0, fwd.x, fwd.y, fwd.z, 1.4, PROBE_WALL);
    // the bar ray runs at the height a bar you must duck actually sits (the course's bar spans 1.10–1.40 m): at 1.45 it
    // passed over the bar's top edge, SLIDE was never offered, and every run "CLIPPED THE BAR" (2026-09-15, parkour probe)
    const head = cast(1.25, 0, fwd.x, fwd.y, fwd.z, 1.9, PROBE_BAR);
    const ledge = cast(4.2, 2.2, 0, -1, 0, 2.6, PROBE_LEDGE);
    // the ledge ray points straight down from 4.2 m: the point it hit sits t below that
    const ledgeY = ledge ? p.y + 4.2 - ledge.t : -Infinity;
    S.env = { vaultAhead: !!knee, wallAhead: !!chest, ledgeAhead: !!ledge && ledgeY > p.y + 1.2, barAhead: !!head };
    if (chest) S.wallNormal.set(chest.nx, chest.ny, chest.nz);
    // FLOW: how the wall is being approached (a rebound is oblique, a wall run head-on), how far the vault box is (the press is
    // graded against it), and whether an anchor is in reach. Along a unit ray the distance to the hit point IS t.
    S.wallApproachDeg = chest ? 90 - approachDeg({ x: fwd.x, z: fwd.z }, { x: chest.nx, z: chest.nz }) : 0;
    S.wallDist = chest ? chest.t : 99;
    S.vaultDist = knee ? knee.t : 99;
    S.anchorNear = null;
    for (const q of S.idx.anchors) if (canGrapple({ x: p.x, y: p.y, z: p.z }, q)) { S.anchorNear = q; break; }
  }

  // ── the run's beats ──────────────────────────────────────────────────
  // Grace window on the jump: the ledge is behind you, the press still counts (gameFeel.Coyote). IMPROVE (2026-10-06): it
  // lives on St now — one module-level timer was shared by every mount, against this file's own per-scene rule.

  function beginAir(S: St, launch: Launch, vy: number): void {
    S.vy = vy;
    S.cc!.setVelocity(TMP_VEL.set(S.heading.x * S.speed, vy, S.heading.z * S.speed));
    S.state = 'air'; S.airStartY = S.hero!.root.position.y; S.airSec = 0; S.launch = launch; S.trick = null; S.trickSpun = 0; S.rollAt = null; S.aBufferAt = -9;
    // PARKOUR (2026-09-15): a vault takes off in the captured speed vault
    S.takeoffClip = launch === 'vault' && S.hero!.animator.clipNames.has('pk_vault') ? 'pk_vault' : null;
    jumpBeat(S);
  }

  function land(ctx: ModeContext, S: St): void {
    const drop = Math.max(0, S.airStartY - S.hero!.root.position.y);
    const rolledWithin = S.rollAt === null ? null : S.clock - S.rollAt;
    let landing: Landing = gradeDrop(drop, rolledWithin);
    // a trick that did not come round is a bail, whatever the drop. IMPROVE (2026-10-06): "come round" is the rotation
    // actually SPUN (S.trickSpun), not the airtime — a flip thrown just before touchdown on a long drop was paid clean
    // while the body was half round
    if (S.trick && !trickRotationComplete(S.trick, S.trickSpun)) landing = 'bail';
    if (S.trick) {
      const pts = trickPoints(S.trick, S.launch, landing);
      if (pts > 0) { const label = `${S.trick.name}${S.launch !== 'ground' ? ` OFF ${S.launch.toUpperCase()}` : ''}`; const rep = S.combo.repeatsOf(label); const paid = S.combo.add(label, pts, 'air'); flash(ctx, `${S.trick.name} ${landing === 'sketchy' ? '· SKETCHY ' : ''}${rep ? `· REPEAT ×${rep + 1} ` : ''}+${paid}`); }
    } else if (landing === 'clean' && drop >= 2.4) { S.combo.add('ROLL', 30, 'revert'); flash(ctx, 'ROLL +30'); }
    // G3/G5: the flip's residual is NOT written to 0 here — it settles upright over the next few frames (see update).
    S.speed = speedAfterLanding(S.speed, landing);
    if (landing === 'clean') { S.flow.add(FLOW.cleanLand); S.kinetic.add(KINETIC.cleanLand); if (S.trick) { S.flow.add(FLOW.trick); S.kinetic.add(KINETIC.chain); const b = S.flow.burst(); if (b > 0) { S.speed += b; S.stats.flowBursts++; say(ctx, `FLOW BURST +${b.toFixed(1)}`, 600); ctx.juice.flash('#22d3ee', 50); } } }   // FLOW: a landed trick spends a tier as speed
    if (landing === 'bail') {
      const lost = S.combo.bail(); S.bails++;
      S.state = 'down'; S.downSec = DOWN_SEC;   // the tree: fall → the floor → the get-up inside DOWN_SEC
      SoundKit.play('miss'); bailPunch(ctx, S, 'bail');   // A+ P0: hit-stop + shake + ONE low thud (feel.impact(0.7) is gone)
      flash(ctx, lost > 0 ? `BAILED — ${lost} lost` : 'BAILED', 900);
    } else {
      S.state = 'ground'; S.groundSec = 0;
      landBeat(S, landing, rolledWithin !== null && rolledWithin <= ROLL_WINDOW_S && drop >= 1.2);
      ctx.feel?.impact?.(landing === 'sketchy' ? 0.45 : 0.2);
      if (S.trick || drop >= 2.4) softBeat(ctx, S.trick ? 'trick land' : 'big land');   // A+ P0: a big land answers softly
      if (landing === 'sketchy') flash(ctx, 'HARD LANDING — roll next time', 700);
    }
    EffectsKit.burst(ctx.scene, S.hero!.root.position, 'dust');
    S.trick = null; trickHud(ctx, S);
    if (landing === 'bail') S.aBufferAt = -9;   // a bail eats the buffered press
    hud(ctx, S);
  }

  /** IMPROVE (2026-10-06): the trick's fill on the HUD (0 when no trick), sent only when it moves a tenth — and one tick
   *  the moment it is "around" (TRICK_AROUND of the rotation: safe to land). Bails stop feeling random. */
  function trickHud(ctx: ModeContext, S: St): void {
    const frac = S.trick ? trickProgress(S.trick, S.trickSpun) : 0;
    const pct = Math.floor(frac * 10) * 10;
    if (pct !== S.trickPctShown) { S.trickPctShown = pct; ctx.setHud({ trickPct: pct, trickAround: S.trick && frac >= TRICK_AROUND ? 1 : 0 }); }
    if (S.trick && frac >= TRICK_AROUND && !S.trickAroundSaid) {
      S.trickAroundSaid = true; ctx.setHud({ trickAround: 1 });
      SoundKit.play('uiTick', { pitch: 1.6, volume: 0.45 });
    }
    if (!S.trick) S.trickAroundSaid = false;
  }

  function respawn(ctx: ModeContext, S: St): void {
    const r = respawnFor(S.pieces, S.checkpoint);
    S.cc!.setPosition(new Vector3(r.x, r.y + CAPSULE_H / 2 + 0.05, r.z));
    S.cc!.setVelocity(Vector3.Zero());
    S.heading.set(0, 0, 1);   // back at the checkpoint facing down the course, and the camera cut behind it (it follows now)
    behindRunner(ctx, S, new Vector3(r.x, r.y, r.z));
    const lost = S.combo.bail(); S.bails++;
    S.speed = 0; S.state = 'ground'; S.trick = null; S.hero!.root.rotation.set(0, S.hero!.root.rotation.y, 0);
    landBeat(S, 'sketchy');   // put back down hard at the checkpoint (the tree read the teleport as an idle flash)
    SoundKit.play('miss'); bailPunch(ctx, S, 'fell');   // A+ P0: a fall is a crash
    flash(ctx, lost > 0 ? `FELL — ${lost} lost · back to the checkpoint` : 'FELL — back to the checkpoint', 1000);
  }

  /** The run was called: what is banked stands (the pot in hand banks too — you did not bail), no time or route bonus. */
  function outOfTime(ctx: ModeContext, S: St): void {
    if (S.finished) return;
    S.finished = true; S.phase = 'done'; ctx.camDirector.rearView = false; S.lockOn = null;
    S.combo.bank();
    const total = S.combo.banked;
    SoundKit.play('whistle'); SoundKit.play('miss');
    holdBanner(S); hud(ctx, S, { banner: `OUT OF TIME · ${total}` });   // an unfinished run is never a PB
    setTimeout(() => ctx.end('timeout', total, {
      timeSec: Math.round(S.runSec * 10) / 10, tricks: S.combo.banked, timeBonus: 0, routeBonus: 0, bestCombo: S.combo.bestCombo,
      tier: S.tier.id, bails: S.bails, highLine: S.highTouched ? 1 : 0,
    }), 1400);
  }

  function finish(ctx: ModeContext, S: St): void {
    if (S.finished) return;
    S.finished = true; S.phase = 'done'; ctx.camDirector.rearView = false; S.lockOn = null;
    S.combo.bank();
    const tb = timeBonus(S.runSec, S.tier);
    const rb = S.highTouched ? S.tier.routeBonus : 0;
    const total = S.combo.banked + tb + rb;
    const grade = runGrade(total, S.tier);
    SoundKit.play('whistle'); SoundKit.play('crowdCheer');
    // RACING PASS phase 9: a race is WON by finishing first. It was won on the GRADE (S or A) whatever the place —
    // measured, "FINISH · P4 · 52.5s · GRADE S" ended as a win. The grade stays on the banner and in the result.
    const first = S.race.place === 1;
    finishPunch(ctx, S, first);   // A+ P0: one finish punch (gold for the winner)
    EffectsKit.burst(ctx.scene, S.hero!.root.position.add(new Vector3(0, 1.8, 0)), 'confetti');
    // IMPROVE (2026-10-06): the personal best — a finished run that beats it (or the first finish) becomes the reference
    const totalMs = Math.round(S.runSec * 1000);
    const pb = savePbIfFaster(S.track.id, S.tier.id, { totalMs, atGate: S.gateTimes });
    const pbWords = pb.previous ? `${pb.improved ? 'NEW PB ' : 'PB '}${deltaLabel(totalMs - pb.previous.totalMs)}` : 'FIRST PB';
    holdBanner(S); hud(ctx, S, { banner: `FINISH · P${S.race.place} · ${S.runSec.toFixed(1)}s · GRADE ${grade} · ${pbWords}`, pbSplit: pbWords });
    setTimeout(() => ctx.end(first ? 'win' : 'complete', total, {
      timeSec: Math.round(S.runSec * 10) / 10, tricks: S.combo.banked, timeBonus: tb, routeBonus: rb, bestCombo: S.combo.bestCombo,
      tier: S.tier.id, bails: S.bails, highLine: S.highTouched ? 1 : 0, place: S.race.place, field: S.rivals.length + 1, driveBys: S.race.driveBys, parries: S.race.parries,
      grade: 'DCBAS'.indexOf(grade) + 1,   // details are numbers: 1 D … 5 S (the host spells it)
    }), 1400);
  }

  // ── pick ─────────────────────────────────────────────────────────────
  // IMPROVE (2026-10-06): the pick screen picks the TRACK too (▲ ▼), and the course behind it is rebuilt for every change —
  // the d-pad only cycled the tier, which changed the HUD text while the course stayed at the tier and track it loaded
  // with, so the gaps you saw were not the gaps you had picked, and three of the four tracks were reachable only by URL.
  function showPick(ctx: ModeContext, S: St): void {
    holdBanner(S);
    const pb = loadPb(S.track.id, S.tier.id);
    ctx.setHud({
      banner: `▲  ${S.track.name.toUpperCase()}  ▼     ◀  ${S.tier.name}  ▶`,
      hint: `${S.tier.gaps} gaps · par ${S.tier.parSec}s · high line +${S.tier.routeBonus}${pb ? ` · PB ${(pb.totalMs / 1000).toFixed(1)}s` : ''}  ·  ◀ ▶ tier · ▲ ▼ track · any face button starts`,
      tier: S.tier.name, track: S.track.name, verbs: '', time: 0,
    });
  }

  /** Cut the camera behind the runner, looking down the course, and let the stick take a fresh basis from that view.
   *  Whatever held the camera before (the pick screen, the intro, a fall) is not what the first push should be read
   *  against: a basis latched off a side-on camera ran a held stick-forward straight off the side of the start slab. */
  function behindRunner(ctx: ModeContext, S: St, at?: Vector3): void {
    const p = at ?? S.hero!.root.position;
    ctx.camDirector.snapTo(p, p.add(new Vector3(0, 0, 8)));
    ctx.camDirector.stickWorldLatched(0, 0);   // a centred read releases the latch; the next held frame latches off this view
  }

  async function begin(ctx: ModeContext, S: St): Promise<void> {
    if (S.phase !== 'pick') return;
    S.phase = 'run';
    buildCourse(ctx, S);   // a no-op when the pick screen already built this track and tier (IMPROVE 2026-10-06)
    S.pb = loadPb(S.track.id, S.tier.id); S.gateTimes = [];
    behindRunner(ctx, S);
    ctx.setHud({ banner: '', hint: 'stick RUNS · RT SPRINT · A JUMP / VAULT / REBOUND / WALL RUN · LT or B SLIDE · X FLIP / KICK · Y OVERDRIVE · LB GRAPPLE · R-stick TRICKS' });
    hud(ctx, S);
  }

  return {
    modeId: 'freerun', camPreset: 'runner',
    hideRingInPlay: true,
    // PLACE LOOKS (2026-09-18): the light and the sky are the place's — getters, because the harness reads both at mount
    get mood() { return readPlaceLook('freerun')?.world?.mood ?? 'nightGame'; },
    get backdrop() { return readPlaceLook('freerun')?.world?.backdrop ?? MOOD_TO_FAMILY[readPlaceLook('freerun')?.world?.mood ?? 'nightGame']; },

    async load(ctx: ModeContext) {
      // module-scope state outlives a mount: a remount must re-read the preset's fov, not the last run's (IMPROVE 2026-10-06:
      // the baseline is on St now, so a remount starts from null by construction)
      const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tier') : null;
      const trackQ = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('track') : null;   // FLOW: the track (the place pick, or ?track=)
      const S: St = {
        scene: ctx.scene, phase: 'pick', pickSec: 0, autoBegin: !!q,
        tier: tierById(q ? Number(q) : 1), pieces: [], meshes: [], aggs: [],
        hero: null, cc: null, state: 'ground', speed: 0, heading: new Vector3(0, 0, 1), stick: new Vector3(),
        airStartY: 0, airSec: 0, launch: 'ground', trick: null, trickSpun: 0,
        wallSec: 0, wallNormal: new Vector3(1, 0, 0), slideSec: 0, downSec: 0, groundSec: 0, rollAt: null, clock: 0,
        combo: new ComboChain(undefined, 'all'), started: false, runSec: 0, finished: false, waitSec: 0,
        checkpoint: 0, highTouched: false, bails: 0, barsCleared: new Set(),
        env: { vaultAhead: false, wallAhead: false, ledgeAhead: false, barAhead: false }, vy: 0,
        tree: null, jumpAt: -9, landAt: -9, landing: 'none', takeoffClip: null, landClip: null, slideClip: null, landBeatSec: LAND_BEAT_SEC,
        posture: null, bio: { ...FREERUN_INPUT_IDLE },
        bailAt: 0, finishLatch: false,
        track: trackById(trackQ ?? readPlaceLook('freerun')?.id), flow: new FlowMeter(), kinetic: new KineticMeter(),
        grindRail: null, grindEndAt: 0, surfSec: 0, dashSec: 0, ltHeld: false, rtHeld: false, swing: null, anchorNear: null,
        wallApproachDeg: 0, wallDist: 99, vaultDist: 99, gateAggs: new Map(), pieceMesh: new Map(), springLatch: -9, slideEndAt: -9, rsTricked: false,
        stats: { rebounds: 0, perfectVaults: 0, grinds: 0, surfs: 0, springs: 0, gates: 0, grapples: 0, bursts: 0, slams: 0, kicks: 0, flowBursts: 0 },
        rivals: makeRivals(), rivalRigs: [], draft: 0, draftSaid: false, lunge: null, lockOn: null,
        race: { driveBys: 0, parries: 0, hitsTaken: 0, slingshots: 0, hazardHits: 0, slamHits: 0, place: 1, deltaSec: 0 },
        coyote: new Coyote(), baseFov: null,
        builtKey: '', mats: [], merged: [], idx: indexCourse([]), courseRead: { overGap: () => false, obstacleAhead: () => false, finishZ: 0 },
        bannerUntil: null, aBufferAt: -9, slideByLt: false, trickPctShown: 0, trickAroundSaid: false, gateReqShown: '',
        pb: null, gateTimes: [],
      };
      states.set(ctx.scene, S); live.add(S);

      // Havok first: the course pieces are static aggregates, the runner a character capsule
      const handle = await initPhysics(ctx.scene);
      handle.ground.dispose();                                  // the helper's catch-all floor would fill every gap
      const floor = ctx.scene.getMeshByName('physics_ground'); floor?.dispose();
      if (S.scene.isDisposed) return;

      // IMPROVE (2026-10-06): the hero and the three rivals spawn in PARALLEL (they were awaited one after another; the
      // library caches the container promise per URL, so four concurrent spawns share one load)
      const [hero, ...rivalChars] = await Promise.all([
        CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, { position: new Vector3(0, 0, 3), yawRad: 0, startClip: 'idle_stand', modeId: 'freerun' }),
        // RIVALS: three runners on the grid behind the line, each its own animation tree
        ...S.rivals.map((r) => CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, { position: new Vector3(r.x, 0, r.z + 3), yawRad: 0, tint: r.tint, scale: 0.98, startClip: 'idle_stand', modeId: 'freerun-rival' })),
      ]);
      S.hero = hero;
      if (S.scene.isDisposed) return;
      for (const [i, r] of S.rivals.entries()) {
        const char = rivalChars[i];
        installSafePlay(char.animator, 'freerun-rival');
        r.z += 3;   // the grid is measured from the hero's spawn (z 3)
        S.rivalRigs.push({ char, tree: new FreeRunAnimTree(char.animator), parked: false });
      }
      installSafePlay(S.hero.animator, 'freerun');
      S.tree = new FreeRunAnimTree(S.hero.animator);
      // G1/G5: the body under the clips. There is no objective on a course, so the aim IS the line — 8 m down the
      // heading at head height; a vault / a wall run puts the eyes on the surface through the window's own stance.
      S.posture?.dispose();
      S.posture = mountPostureLayer(ctx.scene, S.hero.skeleton, S.hero.root, () => {
        const hero = S.hero; if (!hero) return null;
        const { window, pose, legs } = runPose(freeRunWindow(S.bio));
        const hp = hero.root.position;
        const at = TMP_AIM.set(hp.x + S.heading.x * 8, hp.y + 1.5, hp.z + S.heading.z * 8);   // a scratch: the layer reads it this call
        return { pose, legs, aim: at, eyes: at, window };
      }, 'FR-PP');
      if (process.env.NODE_ENV === 'development') {
        const dev = (window as unknown as { __FEL_DEV__?: { runPosture?: unknown } }).__FEL_DEV__;
        if (dev) dev.runPosture = { me: () => S.posture?.layer.get() ?? null, bio: () => ({ ...S.bio }), aim: () => { const h = S.hero; if (!h) return null; return { x: h.root.position.x + S.heading.x * 8, y: h.root.position.y + 1.5, z: h.root.position.z + S.heading.z * 8 }; } };   // BIOMECH-WAVE2 probes
      }
      if (S.scene.isDisposed) return;
      S.cc = new PhysicsCharacterController(new Vector3(0, CAPSULE_H / 2 + 0.05, 3), { capsuleHeight: CAPSULE_H, capsuleRadius: CAPSULE_R }, ctx.scene);
      buildCourse(ctx, S);                                      // the pick screen shows the course
      ctx.heroRef.current = S.hero.root; ctx.objectiveRef.current = null;
      ctx.camDirector.setPreset('runner');
      ctx.camDirector.snapTo(S.hero.root.position, S.hero.root.position.add(new Vector3(0, 0, 8)));
      SoundKit.startAmbient('wind');
      // THE PROBE SEAM (dev): the run's state and meters, and what the flow verbs have done
      (ctx.scene.metadata ??= {}).freerun = { state: () => ({ x: +S.hero!.root.position.x.toFixed(2), y: +S.hero!.root.position.y.toFixed(2), z: +S.hero!.root.position.z.toFixed(2), speed: +S.speed.toFixed(2), state: S.state, flow: S.flow.tier, flowValue: Math.round(S.flow.value), kinetic: Math.round(S.kinetic.value), lane: laneAt(S.hero!.root.position.x, S.hero!.root.position.y), track: S.track.id, phase: S.phase, verbs: verbsFor(S.state, S.speed, S.env), wallDeg: +S.wallApproachDeg.toFixed(0), wallDist: +S.wallDist.toFixed(2), vaultDist: +S.vaultDist.toFixed(2), anchor: !!S.anchorNear, stats: { ...S.stats }, bails: S.bails, race: { ...S.race, draft: +S.draft.toFixed(2), lunge: S.lunge ? { name: S.lunge.r.name, inSec: +(S.lunge.at - S.clock).toFixed(2) } : null }, rivals: S.rivals.map((r) => ({ name: r.name, x: +r.x.toFixed(1), z: +r.z.toFixed(1), speed: +r.speed.toFixed(1), stumble: +r.stumble.toFixed(2), finished: r.finished })), pieces: S.pieces.map((q) => ({ kind: q.kind, x: q.x, y: q.y, z: q.z, w: q.w, d: q.d, route: q.route, face: q.face })) }) };
      assertSpawned(ctx.scene, { hero: S.hero.root, minWorldMeshes: 6, modeId: 'freerun' });
      if (!S.autoBegin) showPick(ctx, S);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      const S = st(ctx); if (!S || !S.hero || !S.cc) return;
      // BIOMECH-WAVE2: the stick is recorded in EVERY phase. InputBus only emits a stick event when the value CHANGES,
      // and the pick branch below used to swallow them — so a player who was already holding forward when the course
      // started stood still until they let go and pushed again (measured on the fake pad: 15 s of a held stick, 0 m).
      if (e.t === 'stick' && e.side === 'L') { S.stick.set(e.x, 0, -e.y); if (S.phase === 'run') return; }
      // FLOW: RT sprints, LT slides (a hold), the RIGHT STICK throws the air tricks, LB grapples
      if (S.phase === 'run') {
        if (e.t === 'trigger' && e.side === 'R') { S.rtHeld = e.value > 0.5; return; }
        if (e.t === 'trigger' && e.side === 'L') { const was = S.ltHeld; S.ltHeld = e.value > 0.5; if (S.ltHeld && !was && S.state === 'ground' && S.speed >= VAULT_GATE) { S.state = 'slide'; S.slideSec = 0; S.slideByLt = true; S.slideClip = S.env.barAhead && S.hero.animator.clipNames.has('pk_duck') ? 'pk_duck' : null; S.combo.add('SLIDE', 35, 'manual'); flash(ctx, 'SLIDE'); SoundKit.play('whoosh', { pitch: 0.8 }); } return; }
        if (e.t === 'stick' && e.side === 'R') {
          const mag = Math.hypot(e.x, e.y);
          if (mag < 0.7) { S.rsTricked = false; return; }
          if (S.state === 'air' && !S.trick && !S.rsTricked) {
            S.rsTricked = true;
            const t: FreeRunTrick = Math.abs(e.x) > Math.abs(e.y) ? (Math.abs(e.x) > 0.9 ? FREERUN_TRICKS.spin : FREERUN_TRICKS.side) : e.y < 0 ? FREERUN_TRICKS.front : FREERUN_TRICKS.back;
            S.trick = t; S.trickSpun = 0; SoundKit.play('whoosh', { pitch: 1.2, volume: 0.5 });
          }
          return;
        }
      }
      if (S.phase === 'pick') {
        if (e.t === 'dpad' && e.pressed) {
          const step = e.dir === 'right' || e.dir === 'down' ? 1 : -1;
          if (e.dir === 'left' || e.dir === 'right') {
            const i = TIERS.findIndex((t) => t.id === S.tier.id);
            S.tier = TIERS[(i + step + TIERS.length) % TIERS.length];
          } else {
            const i = FREERUN_TRACKS.findIndex((t) => t.id === S.track.id);
            S.track = FREERUN_TRACKS[(i + step + FREERUN_TRACKS.length) % FREERUN_TRACKS.length];
          }
          // assumption: a choice restarts the pick's auto-start clock, so the course is not begun under a player mid-choice
          S.pickSec = 0;
          buildCourse(ctx, S);   // the preview IS the course you will run
          SoundKit.play('uiTick', { pitch: step > 0 ? 1.2 : 0.9, volume: 0.3 }); showPick(ctx, S);
        } else if (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B' || e.btn === 'X' || e.btn === 'Y')) void begin(ctx, S);
        return;
      }
      // RACING PASS phase 3 — the stick clicks the brief maps: L3 held = LOOK BACK (the release is read in any phase so it
      // always lets go), R3 = LOCK-ON the nearest runner (again on the same one lets go)
      if (e.t === 'button' && e.btn === 'LS') { ctx.camDirector.rearView = e.pressed && S.phase === 'run'; return; }
      if (S.phase !== 'run') return;
      if (e.t !== 'button' || !e.pressed) return;
      if (e.btn === 'RS') {
        const p = S.hero.root.position;
        const near = S.rivals.filter((q) => !q.finished && Math.abs(q.z - p.z) < LOCK_RANGE_M).sort((a, b) => Math.abs(a.z - p.z) - Math.abs(b.z - p.z))[0];
        if (!near) { S.lockOn = null; refuse(ctx, 'LOCK-ON — NOBODY IN RANGE'); return; }
        if (S.lockOn === near) { S.lockOn = null; ctx.juice.callout('LOCK RELEASED', '#94a3b8', 600); SoundKit.play('uiTick', { pitch: 0.8, volume: 0.3 }); return; }
        S.lockOn = near; const dz = near.z - p.z;
        ctx.juice.callout(`LOCKED — ${near.name} ${Math.abs(dz).toFixed(0)} m ${dz >= 0 ? 'AHEAD' : 'BEHIND'}`, '#f472b6', 1100);
        SoundKit.play('uiTick', { pitch: 1.4, volume: 0.4 });
        return;
      }
      const verbs = verbsFor(S.state, S.speed, S.env);
      if (e.btn === 'L1') { if (!grapple(ctx, S)) refuse(ctx, 'GRAPPLE — NO ANCHOR IN REACH'); return; }
      if (e.btn === 'R1') {   // RIVALS: the DRIVE-BY — a strike in passing that never stops the run
        const p = S.hero.root.position;
        // R3: a LOCKED runner is reachable a little further out than one merely alongside
        const locked = S.lockOn && !S.lockOn.finished && S.lockOn.stumble <= 0 && Math.abs(S.lockOn.z - p.z) < LOCK_STRIKE_ALONG_M && Math.abs(S.lockOn.x - p.x) < LOCK_STRIKE_LATERAL_M ? S.lockOn : null;
        const r = locked ?? S.rivals.find((q) => !q.finished && q.stumble <= 0 && alongside(q, { x: p.x, z: p.z }));
        if (!r) { refuse(ctx, 'DRIVE-BY — NO RUNNER BESIDE YOU'); return; }
        stumble(r); S.speed += RIVALS.driveBySpeedGain; S.kinetic.add(KINETIC.hit); S.race.driveBys++;
        S.combo.add('DRIVE-BY', 60, 'air'); say(ctx, `DRIVE-BY — ${r.name}`); SoundKit.play('impact', { pitch: 1.2, volume: 0.5 }); ctx.feel?.impact?.(0.35); ctx.juice.hitStop(40);
        EffectsKit.burst(ctx.scene, S.rivalRigs[S.rivals.indexOf(r)]?.char.root.position.add(new Vector3(0, 1.1, 0)) ?? p, 'sparks');
        return;
      }
      if (e.btn === 'B' && S.lunge && Math.abs(S.clock - S.lunge.at) <= RIVALS.parryWindowSec) {   // RIVALS: the PARRY-VAULT — the attacker becomes the springboard
        const r = S.lunge.r; S.lunge = null; r.lungeT = 0; r.lungeCool = RIVALS.lungeCooldownSec; stumble(r);
        S.speed += RIVALS.parrySteal; S.kinetic.add(KINETIC.parry); S.flow.add(30); S.race.parries++;
        if (S.state !== 'air') beginAir(S, 'vault', RIVALS.parryVaultV); else { S.vy = RIVALS.parryVaultV; S.cc.setVelocity(new Vector3(S.heading.x * S.speed, S.vy, S.heading.z * S.speed)); }
        S.combo.add('PARRY-VAULT', 110, 'grind'); say(ctx, `PARRY-VAULT — OVER ${r.name}`); SoundKit.play('impact', { pitch: 1.6, volume: 0.5 }); ctx.juice.flash('#ffffff', 60); ctx.juice.hitStop(60); ctx.feel?.impact?.(0.4);
        return;
      }
      if (e.btn === 'A' && S.state === 'ground' && S.draft >= 1) {   // RIVALS: the SLINGSHOT out of a draft
        S.draft = 0; S.draftSaid = false; S.speed += DRAFT.burst; S.dashSec = 0.45; S.flow.add(FLOW.slingshot); S.race.slingshots++;
        S.combo.add('SLINGSHOT', 50, 'manual'); say(ctx, 'SLINGSHOT'); SoundKit.play('whoosh', { pitch: 1.5, volume: 0.6 }); ctx.juice.flash('#22d3ee', 50); ctx.feel?.impact?.(0.3);
        return;
      }
      if (e.btn === 'A' && S.state === 'grind') { endGrind(S, JUMP_V); S.flow.add(10); say(ctx, 'OFF THE RAIL'); return; }
      if (e.btn === 'A' && S.state === 'swing') { S.swing = null; S.state = 'air'; S.airSec = 0; S.launch = 'vault'; S.vy = 4.5; S.speed += GRAPPLE.speedBonus; S.cc.setVelocity(new Vector3(S.heading.x * S.speed, S.vy, S.heading.z * S.speed)); jumpBeat(S); say(ctx, 'RELEASE'); return; }
      if (e.btn === 'A' && S.state === 'surf') { S.state = 'ground'; beginAir(S, 'ground', JUMP_V); say(ctx, 'OFF THE SLOPE'); return; }
      if (e.btn === 'A') {
        if (S.state === 'ground') {
          if (S.env.wallAhead && S.wallApproachDeg >= REBOUND.minDeg && S.wallApproachDeg <= REBOUND.maxDeg && S.speed >= VAULT_GATE && rebound(ctx, S)) { /* FLOW: the vector rebound */ }
          else if (springAt(S.pieces, S.hero.root.position.x, S.hero.root.position.z)) { beginAir(S, 'vault', SPRING_V); S.stats.springs++; S.flow.add(15); S.combo.add('SPRINGBOARD', 30, 'grind'); say(ctx, 'SPRINGBOARD'); SoundKit.play('whoosh', { pitch: 1.4, volume: 0.5 }); }
          else if (verbs.includes('VAULT')) {
            // FLOW: the momentum vault — the press is graded against the box; a perfect one is a catapult into an air dash
            const grade = vaultTiming(S.vaultDist, S.speed);
            if (grade === 'perfect') { S.speed *= VAULT.catapultMult; S.dashSec = VAULT.dashSec; S.flow.add(FLOW.perfectVault); S.kinetic.add(KINETIC.chain); S.stats.perfectVaults++; beginAir(S, 'vault', VAULT_V * 0.9); S.combo.add('CATAPULT VAULT', 70, 'grind'); say(ctx, 'PERFECT VAULT · CATAPULT'); ctx.juice.flash('#ffffff', 50); ctx.feel?.impact?.(0.3); SoundKit.play('impact', { pitch: 1.6, volume: 0.4 }); }
            else { if (grade === 'good') S.flow.add(FLOW.goodVault); beginAir(S, 'vault', VAULT_V); S.combo.add('VAULT', 40, 'grind'); flash(ctx, grade === 'good' ? 'VAULT · GOOD' : 'VAULT'); SoundKit.play('whoosh'); }
          }
          else if (verbs.includes('WALL RUN')) { S.state = 'wallrun'; S.wallSec = WALLRUN_SEC; S.airStartY = S.hero.root.position.y; S.combo.add('WALL RUN', 45, 'grind'); flash(ctx, 'WALL RUN'); SoundKit.play('whoosh'); }
          else if (verbs.includes('VAULT')) { beginAir(S, 'vault', VAULT_V); S.combo.add('VAULT', 40, 'grind'); flash(ctx, 'VAULT'); SoundKit.play('whoosh'); }
          else { beginAir(S, 'ground', JUMP_V); }
        } else if ((S.state === 'wallrun' || S.state === 'air') && (verbs.includes('WALL KICK'))) {
          const away = S.wallNormal.clone(); away.y = 0; if (away.lengthSquared() < 0.01) away.set(-S.heading.x, 0, -S.heading.z); away.normalize();
          S.heading.copyFrom(away); S.speed = Math.max(S.speed, 4.5);
          S.state = 'air'; S.airStartY = S.hero.root.position.y; S.airSec = 0; S.launch = 'wallkick'; S.trick = null; S.rollAt = null;
          S.vy = WALLKICK_V; S.cc.setVelocity(new Vector3(away.x * WALLKICK_PUSH, WALLKICK_V, away.z * WALLKICK_PUSH));
          S.combo.add('WALL KICK', 60, 'grind'); flash(ctx, 'WALL KICK'); SoundKit.play('impact', { pitch: 1.3, volume: 0.4 }); jumpBeat(S);
        } else if (S.state === 'air' && S.launch === 'drop' && S.coyote.ok) {
          // COYOTE TIME. Running off a ledge and pressing jump a frame late is the oldest unfair-feeling
          // moment in any game that has a ledge, and this is a PARKOUR mode -- it is made of ledges. The
          // press was simply dropped: `S.state` had already flipped to 'air' and nothing below the ground
          // branch answered A unless a wall kick happened to be available.
          //
          // TWO GUARDS, AND BOTH MATTER. `launch === 'drop'` is the mode's own word for air entered WITHOUT
          // a take-off (an edge at line 475, sliding off a wall at 455), so a deliberate jump can never be
          // extended by this. And `beginAir` rewrites launch to 'ground', so the window closes behind it --
          // a second press inside the same 110 ms cannot become a double jump.
          //
          // `Coyote` had been exported by gameFeel since the juice toolkit was written and referenced by
          // nothing -- audited 2026-09-14, the only file naming it was gameFeel itself. Here and the skate
          // ollie are its first two consumers.
          beginAir(S, 'ground', JUMP_V);
          SoundKit.play('whoosh', { pitch: 1.1, volume: 0.3 });
        } else if (S.state === 'air') {
          // IMPROVE (2026-10-06): THE PRESS BUFFER. An A a few frames before touchdown (jump, vault, rebound) was simply
          // dropped — only the coyote side of the window existed. It is held for A_BUFFER_SEC on the mode clock and
          // fired on the landing (update), through this same path, so it does whatever A does on the ground there.
          S.aBufferAt = S.clock;
        }
      } else if (e.btn === 'B') {
        if (S.state === 'ground' && verbs.includes('SLIDE')) { S.state = 'slide'; S.slideSec = 0; S.slideByLt = false; S.slideClip = S.env.barAhead && S.hero.animator.clipNames.has('pk_duck') ? 'pk_duck' : null; S.combo.add('SLIDE', 35, 'manual'); flash(ctx, 'SLIDE'); SoundKit.play('whoosh', { pitch: 0.8 }); }   // PARKOUR: under a bar, the captured underbar
        else if (S.state === 'air') { S.rollAt = S.clock; ctx.juice.callout('ROLL ON LANDING', '#cbd5e1', 400); }   // the roll is timed against touchdown
        else refuse(ctx, 'SLIDE WHILE RUNNING');   // PHONE CONTROLS: a SLIDE with no run under it
      } else if (e.btn === 'X' || e.btn === 'Y') {
        if (e.btn === 'X' && S.state !== 'air' && kickHazard(ctx, S)) return;   // FLOW: X kicks a loose hazard down the line
        if (e.btn === 'Y' && S.state !== 'air') { overdrive(ctx, S); return; }   // FLOW: Y is the kinetic overdrive on the ground
        if (S.state !== 'air') refuse(ctx, e.btn === 'X' ? 'FLIP IN THE AIR' : 'TWIST IN THE AIR');   // PHONE CONTROLS: FLIP / TWIST on the ground
        else if (S.trick) refuse(ctx, 'ONE TRICK PER JUMP');
        if (S.state === 'air' && !S.trick) {
          if (e.btn === 'Y' && verbs.includes('CAT LEAP')) {
            // catch the ledge: snap up onto it and keep running the high line
            const p = S.hero.root.position;
            const target = p.add(S.heading.scale(2.2)); target.y = 3.7 + CAPSULE_H / 2;
            S.cc.setPosition(target); S.vy = 0; S.cc.setVelocity(new Vector3(S.heading.x * 3, 0, S.heading.z * 3));
            S.state = 'ground'; S.speed = Math.max(3, S.speed * 0.8); S.groundSec = 0; S.highTouched = true;
            S.combo.add('CAT LEAP', 80, 'grind'); flash(ctx, 'CAT LEAP'); SoundKit.play('impact', { pitch: 1.1, volume: 0.35 }); landBeat(S, 'clean');
            return;
          }
          const sx = S.stick.x, sz = S.stick.z;
          const t: FreeRunTrick = e.btn === 'Y' ? (Math.abs(sx) > 0.5 ? FREERUN_TRICKS.spin : FREERUN_TRICKS.twist)
            : sz < -0.5 ? FREERUN_TRICKS.back : Math.abs(sx) > 0.5 ? FREERUN_TRICKS.side : FREERUN_TRICKS.front;
          S.trick = t; S.trickSpun = 0;   // the tree plays the tuck while S.trick holds
          SoundKit.play('whoosh', { pitch: 1.2, volume: 0.5 });
        }
      }
    },

    update(ctx: ModeContext, dt: number) {
      const S = st(ctx); if (!S || !S.hero || !S.cc) return;
      S.clock += dt;
      tickBanner(ctx, S);   // IMPROVE (2026-10-06): the one banner channel, on the mode clock (holds through a pause)
      if (S.phase === 'pick') { S.pickSec += dt; if (S.autoBegin || S.pickSec >= PICK_TIMEOUT_S) void begin(ctx, S); return; }
      if (S.phase === 'done') { feedTree(S); return; }   // the finish celebrate plays out under the results banner
      if (S.phase !== 'run') return;

      const cc = S.cc, root = S.hero.root;
      // heading follows the stick in camera space; the run keeps its heading with no input. The basis is LATCHED the frame the
      // stick leaves the deadzone (CameraDirector.stickWorldLatched): the camera follows the run now, and a live basis under
      // a follow camera turns a held stick-right into a circle as the camera swings in behind.
      const wishLen = Math.min(1, Math.hypot(S.stick.x, S.stick.z));
      const wishW = ctx.camDirector.stickWorldLatched(S.stick.x, -S.stick.z);
      if (wishLen > 0.15 && S.state !== 'down' && wishW.lengthSquared() > 1e-6) {
        const w = wishW.normalize();
        if (S.state === 'ground' || S.state === 'slide') {
          // IMPROVE (2026-10-06, TUNED): `heading.copyFrom(stick)` reversed the velocity in one frame at full speed while
          // only the mesh slewed, so the body slid sideways through a flick. At a walk the stick still pivots you on the
          // spot; at a run the heading turns at the body's own rate (FreeRunCore.groundTurnRate), so the two agree.
          const rate = groundTurnRate(S.speed);
          if (!Number.isFinite(rate)) S.heading.copyFrom(w);
          else { const yaw = slewYaw(Math.atan2(S.heading.x, S.heading.z), Math.atan2(w.x, w.z), rate, dt); S.heading.set(Math.sin(yaw), 0, Math.cos(yaw)); }
        } else {
          // FLOW: a surf drifts round the bend; the air has a faint control. IMPROVE (2026-10-06): as rates (1 − e^(−k·dt)),
          // the 0.12 / 0.04 per-frame lerps at 60 fps — the same steer at 144 fps as at 60
          Vector3.LerpToRef(S.heading, w, steerAlpha(S.state === 'surf' ? SURF_STEER_K : AIR_STEER_K, dt), TMP_WISH);
          if (TMP_WISH.lengthSquared() > 1e-8) S.heading.copyFrom(TMP_WISH.normalize());
        }
      }
      // FLOW: the top speed is the base times the flow tier (and a sprint on RT); a dash (a catapult, a burst) holds above it
      const top = RUN_MAX * S.flow.topSpeedMult() * (S.rtHeld ? 1.1 : 1);
      if (S.state === 'ground') S.speed = stepSpeed(S.speed, wishLen * top, dt, Math.max(top, S.dashSec > 0 ? S.speed : 0));
      if (S.dashSec > 0) S.dashSec = Math.max(0, S.dashSec - dt);
      S.flow.tick(dt, S.state === 'ground' && S.speed < 1);
      if (S.state === 'wallrun') S.flow.add(FLOW.wallRunPerSec * dt);
      if (S.state === 'grind') S.flow.add(FLOW.grindPerSec * dt);
      if (S.state === 'surf') S.flow.add(FLOW.surfPerSec * dt);
      // G1: the body TURNS onto the heading. A traceur turns fast, but never in one frame — and a trick owns the yaw
      // while it is spinning (the mode integrates it below), so the slew stands aside for it.
      if (!(S.state === 'air' && S.trick && S.trick.axis === 'y')) {
        root.rotation.y = slewYaw(root.rotation.y, Math.atan2(S.heading.x, S.heading.z), RUNNER_TURN_RATE, dt);
      }
      // G3/G5: a flip's residual pitch / roll settles upright instead of being written to 0 on the landing frame
      // The trick integrates raw radians (a 1.5-turn side flip leaves rotation.z at 9.6 rad, measured), so the residual
      // is WRAPPED to the short way round first — settling 9.6 rad to 0 would un-spin the body backwards through a
      // whole revolution on the way to standing up.
      if (S.state !== 'air') { root.rotation.x = settleAngle(wrapYaw(root.rotation.x), dt, 0.11); root.rotation.z = settleAngle(wrapYaw(root.rotation.z), dt, 0.11); }

      probe(S);

      // ── the physics step ── (IMPROVE 2026-10-06: scratch vectors and an in-place support read — no per-frame Vector3s)
      // gravity is applied to S.vy below; the controller integrates what it is handed (V_ZERO is its gravity)
      const G = -9.81;
      const support = supportOf(ctx.scene);
      cc.checkSupportToRef(dt, V_DOWN, support);
      const supported = support.supportedState === CharacterSupportedState.SUPPORTED;
      if (S.state === 'grind' && S.grindRail) {
        // THE GRIND: locked to the rail's line at the rail's height, carrying the speed; off the end, a hop
        const r = S.grindRail; const top = r.y + r.h / 2;
        S.heading.set(0, 0, 1);
        const z = root.position.z + S.speed * dt;
        cc.setPosition(TMP_POS.set(r.x, top + CAPSULE_H / 2 + 0.02, z)); cc.setVelocity(TMP_VEL.set(0, 0, S.speed));
        if (z > r.z + r.d / 2) { endGrind(S, 2.2); say(ctx, 'RAIL END', 400); }
      } else if (S.state === 'swing' && S.swing) {
        // THE GRAPPLE: an arc under the anchor, out past it faster
        S.swing.t += dt; const u = Math.min(1, S.swing.t / GRAPPLE.sec);
        const q = swingAt(S.swing.from, S.swing.anchor, u);
        cc.setPosition(TMP_POS.set(q.x, q.y + CAPSULE_H / 2 + 0.02, q.z)); cc.setVelocity(V_ZERO); S.heading.set(0, 0, 1);
        if (u >= 1) { S.swing = null; S.state = 'air'; S.airStartY = root.position.y; S.airSec = 0; S.launch = 'vault'; S.vy = 3.5; S.speed += GRAPPLE.speedBonus; cc.setVelocity(TMP_VEL.set(0, S.vy, S.speed)); jumpBeat(S); say(ctx, 'SLUNG', 400); }
      } else if (S.state === 'wallrun') {
        S.wallSec -= dt;
        S.vy = 2.6 * (S.wallSec / WALLRUN_SEC) - 1.2;
        const run = Math.max(3.5, S.speed);   // along the heading, flat (the heading carries no y)
        cc.setVelocity(TMP_VEL.set(S.heading.x * run, S.vy, S.heading.z * run));
        if (S.wallSec <= 0 || !S.env.wallAhead && S.wallSec < WALLRUN_SEC - 0.25) { S.state = 'air'; S.airSec = 0; S.launch = 'drop'; }   // off the wall: the tree holds the air pose (no second take-off)
      } else if (S.state === 'air') {
        S.airSec += dt;
        S.vy = Math.max(-30, S.vy + G * dt);
        cc.setVelocity(TMP_VEL.set(S.heading.x * S.speed, S.vy, S.heading.z * S.speed));
        if (S.trick) {
          // IMPROVE (2026-10-06): the trick spins ONE rotation and holds there — it used to keep spinning past the turn it
          // is scored as, so a flip thrown early on a long air came down at whatever angle the extra spin left it
          const t = S.trick, rate = (t.turns * 2 * Math.PI) / t.airSec;
          const step = Math.min(Math.abs(rate) * dt, Math.max(0, trickTotalRad(t) - S.trickSpun));
          S.trickSpun += step;
          const d = Math.sign(rate) * step;
          if (t.axis === 'x') root.rotation.x += d; else if (t.axis === 'z') root.rotation.z += d; else root.rotation.y += d;
        }
      } else if (S.state === 'down') {
        S.downSec -= dt; S.vy = supported ? 0 : Math.max(-30, S.vy + G * dt); cc.setVelocity(TMP_VEL.set(0, S.vy, 0));
        if (S.downSec <= 0) { S.state = 'ground'; S.speed = 0; }
      } else {
        // IMPROVE (2026-10-06, TUNED): an LT slide lasts while LT is held (up to SLIDE_HOLD_MAX_SEC); a tap — B, or LT let
        // go — is the SLIDE_SEC slide it always was (FreeRunCore.slideEnds)
        if (S.state === 'slide') { S.slideSec += dt; if (slideEnds(S.slideSec, S.slideByLt, S.ltHeld)) { S.state = 'ground'; S.slideEndAt = S.clock; } }
        // on the ground the controller follows the surface; off an edge we fall under our own gravity
        // FLOW: THE SURF — on a slope (the spillway) the run becomes a slide: downhill gathers speed past the top, uphill spends it, and the steering drifts
        const nrm = support.averageSurfaceNormal;
        const onSlopePiece = S.idx.slopes.some((q) => Math.abs(root.position.x - q.x) <= q.w / 2 && Math.abs(root.position.z - q.z) <= q.d / 2);
        const onSlope = supported && nrm.y < 0.965 && S.speed > 1.5 && onSlopePiece;
        if (onSlope && S.state === 'ground') { S.state = 'surf'; S.surfSec = 0; S.stats.surfs++; say(ctx, 'SURF', 500); SoundKit.play('whoosh', { pitch: 0.7, volume: 0.4 }); }
        else if (!onSlope && S.state === 'surf') { S.state = 'ground'; S.groundSec = 0; if (S.surfSec > 0.6) { S.combo.add('SURF', 45, 'manual'); } }
        if (S.state === 'surf') { S.surfSec += dt; const downhill = nrm.z; S.speed = Math.max(2, Math.min(RUN_MAX * SURF_TOP, S.speed + downhill * 9 * dt)); }
        if (supported) {
          S.vy = 0;
          TMP_VEL.set(S.heading.x * S.speed, 0, S.heading.z * S.speed);
          TMP_MOVE.set(0, 0, 0);   // calculateMovement's own result starts at zero (and stays there when the basis is degenerate)
          cc.calculateMovementToRef(dt, S.heading, support.averageSurfaceNormal, cc.getVelocity(), support.averageSurfaceVelocity, TMP_VEL, V_UP, TMP_MOVE);
          TMP_MOVE.y = Math.min(TMP_MOVE.y, 0.5); cc.setVelocity(TMP_MOVE);
        }
        else { S.vy = Math.max(-30, S.vy + G * dt); cc.setVelocity(TMP_VEL.set(S.heading.x * S.speed, S.vy, S.heading.z * S.speed)); }
        if (S.state === 'ground') {
          if (!supported && S.vy < -1.2) { S.state = 'air'; S.airStartY = root.position.y; S.airSec = 0; S.launch = 'drop'; S.trick = null; S.rollAt = null; }   // a drop off an edge: no take-off, the air hold
          else { S.groundSec += dt; }
          // touching down without a linked move banks the line
          if (S.groundSec >= BANK_AFTER_SEC && S.combo.pot > 0) { const b = S.combo.bank(); flash(ctx, `BANKED +${b}`, 800); SoundKit.play('score', { volume: 0.5 }); softBeat(ctx, 'bank'); hud(ctx, S); }
        }
      }
      cc.integrate(dt, support, V_ZERO);
      const pos = cc.getPosition();
      root.position.set(pos.x, pos.y - CAPSULE_H / 2 - 0.02, pos.z);
      trickHud(ctx, S);

      // landings
      if (S.state === 'air' && S.vy < 0 && S.airSec > 0.1) { const rail = railAt(S.idx.rails, root.position.x, root.position.y, root.position.z); if (rail) startGrind(ctx, S, rail); }   // FLOW: onto a rail
      if (S.state === 'air' && supported && S.airSec > 0.08 && S.vy <= 0.5) {
        land(ctx, S);
        // IMPROVE (2026-10-06): an A pressed just before touchdown fires now, through the same input path
        // (land() has moved the state on, which the narrowing above cannot see)
        if ((S.state as RunState) === 'ground' && S.clock - S.aBufferAt <= A_BUFFER_SEC) { S.aBufferAt = -9; FreeRunMode.onInput(ctx, A_PRESS); }
      }
      // FLOW: gates open to speed; a spring pad launches whoever runs onto it
      if (S.state === 'ground' || S.state === 'surf') tickGates(ctx, S);
      if (S.state === 'ground' && S.speed > 2 && S.clock - S.springLatch > 1.2) { const sp = springAt(S.idx.springs, root.position.x, root.position.z); if (sp) { S.springLatch = S.clock; beginAir(S, 'vault', SPRING_V); S.stats.springs++; S.flow.add(15); S.combo.add('SPRINGBOARD', 30, 'grind'); say(ctx, 'SPRINGBOARD'); SoundKit.play('whoosh', { pitch: 1.4, volume: 0.5 }); } }

      // falls, bars, gates (IMPROVE 2026-10-06: over the indexed bars and checkpoints, not every piece)
      if (root.position.y < FALL_Y || (root.position.y < -0.4 && overGap(S.idx.gaps, root.position.x, root.position.z))) respawn(ctx, S);
      for (const i of S.idx.bars) {
        const p = S.pieces[i];
        if (!S.barsCleared.has(i) && root.position.z > p.z && root.position.z < p.z + 1.2 && Math.abs(root.position.x - p.x) < p.w / 2) {
          S.barsCleared.add(i);
          if (S.state !== 'slide' && root.position.y < p.y + 0.4) { S.speed *= BAR_CLIP_SPEED; ctx.feel?.impact?.(0.4); flash(ctx, 'CLIPPED THE BAR — slide under it', 800); }   // A+ P0: ONE thud (feel.impact plays its own; the stacked impact SFX is gone)
        }
      }
      for (const i of S.idx.checkpoints) {
        const p = S.pieces[i];
        if ((p.index ?? 0) > S.checkpoint && root.position.z > p.z) {
          S.checkpoint = p.index ?? 0; SoundKit.play('uiTick', { pitch: 1.3 });
          // IMPROVE (2026-10-06): the split against the personal best at this checkpoint
          const ms = Math.round(S.runSec * 1000); S.gateTimes[S.checkpoint - 1] = ms;
          const split = splitWords(gateDeltaMs(S.pb, S.checkpoint, ms));
          if (split) ctx.setHud({ pbSplit: split });
          flash(ctx, `CHECKPOINT ${S.checkpoint}${split ? ` · ${split}` : ''}`, split ? 1000 : 600);
        }
      }
      if (!S.started && root.position.z > 1.5) { S.started = true; flash(ctx, 'GO', 500); }
      // THE RUN ENDS (MECHANICS PASS, 2026-09-15). The clock only started once you crossed z 1.5 and the run only ended at the
      // course's end, so a player who stood still (or got lost) sat in a run that could never finish — the release gauntlet
      // capped out on it. The clock now starts on its own after a few seconds at the line, and the run is called at
      // RUN_CAP_PAR × par: what you banked stands, with no time bonus, and the last ten seconds are counted out loud.
      if (!S.started) { S.waitSec += dt; if (S.waitSec >= START_GRACE_SEC) { S.started = true; flash(ctx, 'GO — THE CLOCK IS RUNNING', 900); } }
      if (S.started && !S.finished) {
        const cap = S.tier.parSec * RUN_CAP_PAR, before = cap - S.runSec;
        S.runSec += dt;
        const left = cap - S.runSec;
        if (Math.ceil(left) !== Math.ceil(before) && left > 0 && left <= 10) { flash(ctx, `${Math.ceil(left)}s LEFT`, 600); SoundKit.play('uiTick', { pitch: 1 + (10 - left) * 0.04 }); }
        if (left <= 0) { outOfTime(ctx, S); return; }
      }
      if (routeAt(root.position.x, root.position.y) === 'high') S.highTouched = true;
      S.coyote.update(S.state === 'ground');   // one feed per frame, from the state the jump branch reads
      if (!S.finished && root.position.z >= S.idx.finishZ) finish(ctx, S);
      tickRivals(ctx, S, dt);

      feedTree(S);

      // camera: leads the momentum and pulls back with speed (FOV widens).
      // This was `c.fov = 0.8 + S.speed * 0.018` — the game's only real speed kick, and unclamped: nothing
      // stopped a fast enough run from widening the lens into a fisheye, and the hard-coded 0.8 ignored
      // whatever fov the camera preset was actually tuned at. Same effect, bounded, and eased on a time
      // constant so it settles identically at 30 fps and 144.
      // THE CAMERA FOLLOWS THE RUN (2026-09-15). Since the scaffold the mode snapped the director once at spawn and never
      // called update, so the camera stayed at the start line while the runner left it: every vault, flip and roll was a
      // few pixels tall 20 m away (the rc9 scorecard frame shows an empty course). The runner preset now chases the heading,
      // and a real air (not a hop) swings to the three-quarter air cam so a flip reads side-on — only on the move: standing
      // still the director has no velocity to be behind, takes "behind" from where it already is, and the side offset then
      // compounds frame on frame into an orbit (measured: a standing jump carried the camera round to the runner's side).
      ctx.camDirector.setAir(S.state === 'air' && S.airSec > 0.25 && S.speed > 3 ? 1 : 0);
      ctx.camDirector.update(root.position, TMP_CAM.set(S.heading.x * S.speed, 0, S.heading.z * S.speed), null);
      const c = ctx.scene.activeCamera;
      if (c) { S.baseFov ??= c.fov; c.fov = stepSpeedFov(c.fov, S.baseFov, S.speed, RUN_MAX, dt); }
      if (Math.floor(S.clock * 6) !== Math.floor((S.clock - dt) * 6)) hud(ctx, S);   // six HUD frames a second is plenty for numbers
    },

    dispose() {
      setTimeout(() => {
        for (const S of live) if (S.scene.isDisposed) { S.posture?.dispose(); S.posture = null; live.delete(S); }
        if (live.size === 0) SoundKit.stopAmbient();
      }, 0);
    },
  };
})();
