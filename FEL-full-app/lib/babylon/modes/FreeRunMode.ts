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
import { Vector3, MeshBuilder, Color3, type PBRMaterial, PhysicsAggregate, PhysicsShapeType, PhysicsCharacterController, CharacterSupportedState, Ray, type Mesh, type Scene, type AbstractMesh } from '@babylonjs/core';
import { VenueKit } from '../visual/VenueKit';
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
import { EffectsKit } from '../visual/EffectsKit';
import { assertSpawned } from '../core/FrameGuard';
import { initPhysics } from '../core/Physics';
import { ComboChain } from '../core/ComboChain';
import {
  verbsFor, stepSpeed, gradeDrop, speedAfterLanding, trickPoints, trickCompletes, FREERUN_TRICKS, TIERS, tierById,
  timeBonus, runGrade, RUN_MAX, ROLL_WINDOW_S, type RunState, type Env, type FreeRunTrick, type Tier, type Landing, type LAUNCH_MULT,
} from '../core/FreeRunCore';
import { coursePieces, courseLength, checkpoints, respawnFor, overGap, routeAt, type Piece } from './freeRunCourse';

const CAPSULE_H = 1.7, CAPSULE_R = 0.32;
const JUMP_V = 6.4, VAULT_V = 4.6, WALLRUN_SEC = 1.1, WALLKICK_V = 6.8, WALLKICK_PUSH = 5.2, SLIDE_SEC = 0.7, DOWN_SEC = 1.3;
const BANK_AFTER_SEC = 0.6;          // Skate's revert window: roll clean this long and the pot banks
const JUMP_BEAT_SEC = 0.42;          // jump_up is 0.45 s: the take-off clip, then the tree holds the air pose
const LAND_BEAT_SEC = 0.38;          // jump_land is 0.35 s: the whole absorb shows before the run takes over
const RISE_SEC = 0.45;               // karate_get_up: the last part of DOWN_SEC is the get-up
const PICK_TIMEOUT_S = 6;
const FALL_Y = -2.5;
const BAR_CLIP_SPEED = 0.45;         // clip the bar without sliding: keep this much speed

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
  combo: ComboChain; started: boolean; runSec: number; finished: boolean;
  checkpoint: number; highTouched: boolean; bails: number; barsCleared: Set<number>;
  env: Env;
  /** ANIM-READABILITY (creative, 2026-09-07): the ONE OWNER of the runner's clips. The mode never calls animator.play;
   *  it latches wall-clock beats (take-off, landing) and feeds the tree once per frame. */
  tree: FreeRunAnimTree | null; jumpAt: number; landAt: number; landing: 'none' | 'clean' | 'sketchy';
  /** BIOMECH-WAVE2: the Posture Poses layer and the body it is fed. */
  posture: { layer: PostureLayer; dispose(): void } | null; bio: FreeRunPostureInput;
  /** Vertical velocity, owned here: the controller integrates the velocity it is handed, so gravity is ours to apply. */
  vy: number;
  /** A+ P0 juice: performance.now() of the last bail punch (one per crash), and the one finish punch. */
  bailAt: number; finishLatch: boolean;
}
const states = new WeakMap<Scene, St>();
const live = new Set<St>();

/** How far the StandardMaterial-era palette is pulled down to sit correctly as PBR albedo. */
const PBR_ALBEDO_SCALE = 0.42;
const MAT: Record<string, string> = { ground: '#8E8A84', vault: '#C9A15A', wall: '#B8735A', ledge: '#3FB8B0', roof: '#3FB8B0', bar: '#E0C060', start: '#3DDC97', finish: '#F4C542', checkpoint: '#4FD1E8', gap: '#000000' };

/** The camera preset's resting fov, captured on the first frame after load. */
let baseFov: number | null = null;

export const FreeRunMode: ModeDefinition = (() => {
  const st = (ctx: ModeContext): St | undefined => states.get(ctx.scene);

  function buildCourse(ctx: ModeContext, S: St): void {
    for (const m of S.meshes) m.dispose(); S.meshes = []; S.aggs = [];
    S.pieces = coursePieces(S.tier);
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
    const GLOW = new Set(['ledge', 'roof', 'finish', 'start', 'checkpoint']);
    const ROUGH: Record<string, number> = { ground: 0.95, vault: 0.8, wall: 0.85, bar: 0.35 };
    const matFor = (kind: string): PBRMaterial => {
      let m = mats.get(kind);
      if (!m) {
        const hex = MAT[kind] ?? '#888888';
        // the gates and ledges read as markers, so they keep a real emissive floor; surfaces do not
        m = VenueKit.paint(ctx.scene, `fr_mat_${kind}`, hex, GLOW.has(kind) ? 0.3 : 0.05, ROUGH[kind] ?? 0.7);
        // AND THE PALETTE ITSELF WAS AUTHORED FOR THE WRONG MATERIAL MODEL. These hexes were picked against
        // StandardMaterial's linear multiply; the same values as PBR albedo, under this rig's exposure,
        // land far lighter — the `#8E8A84` ground measured 0.556 albedo and read as white concrete-paper.
        // Surfaces are pulled down so they sit where the author meant them to; the markers keep their value
        // because a marker is supposed to be brighter than the thing it is stuck to.
        if (!GLOW.has(kind)) m.albedoColor = m.albedoColor.scale(PBR_ALBEDO_SCALE);
        mats.set(kind, m);
      }
      return m;
    };
    for (const [i, p] of S.pieces.entries()) {
      if (p.kind === 'gap') continue;                                    // a gap is the absence of ground
      const isGate = p.kind === 'start' || p.kind === 'finish' || p.kind === 'checkpoint';
      const box: Mesh = MeshBuilder.CreateBox(`fr_${p.kind}_${i}`, { width: p.w, height: p.h, depth: p.d }, ctx.scene);
      box.position.set(p.x, p.y, p.z);
      box.material = matFor(p.kind);
      box.metadata = { freerun: p.kind, pieceIndex: i };
      if (isGate) { box.visibility = 0.35; box.isPickable = false; }
      else if (p.kind === 'bar') { box.isPickable = true; }             // a gate you slide under; not a collider (the capsule cannot crouch)
      else S.aggs.push(new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0, friction: 0.9 }, ctx.scene));
      S.meshes.push(box);
    }
  }

  function hud(ctx: ModeContext, S: St, extra: Record<string, HudValue> = {}): void {
    const h = S.combo.hud;
    ctx.setHud({
      speed: Math.round(S.speed * 10) / 10, speedMax: RUN_MAX,
      verbs: verbsFor(S.state, S.speed, S.env).join(' · '),
      combo: h.combo, pot: h.pot, banked: h.banked, score: h.banked + h.pot,
      time: Math.round(S.runSec * 10) / 10, checkpoint: `${S.checkpoint}/${checkpoints(S.pieces).length}`,
      tier: S.tier.name, route: S.highTouched ? 'HIGH LINE' : 'LOW LINE', runState: S.state,
      ...extra,
    });
  }

  function flash(ctx: ModeContext, text: string, ms = 700): void {
    ctx.setHud({ banner: text });
    setTimeout(() => ctx.setHud({ banner: '' }), ms);
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
  function landBeat(S: St, landing: 'clean' | 'sketchy'): void { S.landAt = S.clock; S.landing = landing; S.tree?.clearBeat('land_clean', 'land_sketchy'); }

  /** The tree is fed once per frame, every phase, from the run's context — the movement INTENT included (S.speed is the
   *  speed the runner keeps through a landing, so a landing under a held stick settles onto the run, not an idle flash). */
  function feedTree(S: St): void {
    if (!S.tree) return;
    const airborne = S.state === 'air';
    // one read, two consumers (the clip and the body under it)
    S.bio.state = S.state === 'ground' || S.state === 'air' || S.state === 'wallrun' || S.state === 'slide' || S.state === 'down' ? S.state : 'ground';
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
      sliding: S.state === 'slide',
      landing: !airborne && S.clock - S.landAt < LAND_BEAT_SEC ? S.landing : 'none',
      down: S.state === 'down' && S.downSec > RISE_SEC,   // the last RISE_SEC of DOWN_SEC is the get-up
      celebrating: S.finished,
    });
  }

  // ── probes: what the course offers right now ─────────────────────────
  function probe(ctx: ModeContext, S: St): void {
    const p = S.hero!.root.position;
    const fwd = S.heading;
    const cast = (origin: Vector3, dir: Vector3, len: number, kinds: string[]): { hit: boolean; normal: Vector3 | null; point: Vector3 | null } => {
      const pick = ctx.scene.pickWithRay(new Ray(origin, dir, len), (m) => !!(m.metadata as { freerun?: string } | null)?.freerun && kinds.includes((m.metadata as { freerun: string }).freerun));
      return pick?.hit ? { hit: true, normal: pick.getNormal(true), point: pick.pickedPoint } : { hit: false, normal: null, point: null };
    };
    const knee = cast(p.add(new Vector3(0, 0.6, 0)), fwd, 1.7, ['vault']);
    const chest = cast(p.add(new Vector3(0, 1.3, 0)), fwd, 1.4, ['wall']);
    const head = cast(p.add(new Vector3(0, 1.45, 0)), fwd, 1.9, ['bar']);
    const ledge = cast(p.add(new Vector3(0, 4.2, 0)).add(fwd.scale(2.2)), new Vector3(0, -1, 0), 2.6, ['ledge', 'roof']);
    S.env = { vaultAhead: knee.hit, wallAhead: chest.hit, ledgeAhead: ledge.hit && !!ledge.point && ledge.point.y > p.y + 1.2, barAhead: head.hit };
    if (chest.hit && chest.normal) S.wallNormal.copyFrom(chest.normal);
  }

  // ── the run's beats ──────────────────────────────────────────────────
  /** Grace window on the jump: the ledge is behind you, the press still counts (gameFeel.Coyote). */
  const coyote = new Coyote();

  function beginAir(S: St, launch: Launch, vy: number): void {
    S.vy = vy;
    S.cc!.setVelocity(new Vector3(S.heading.x * S.speed, vy, S.heading.z * S.speed));
    S.state = 'air'; S.airStartY = S.hero!.root.position.y; S.airSec = 0; S.launch = launch; S.trick = null; S.trickSpun = 0; S.rollAt = null;
    jumpBeat(S);
  }

  function land(ctx: ModeContext, S: St): void {
    const drop = Math.max(0, S.airStartY - S.hero!.root.position.y);
    const rolledWithin = S.rollAt === null ? null : S.clock - S.rollAt;
    let landing: Landing = gradeDrop(drop, rolledWithin);
    // a trick that did not come round is a bail, whatever the drop
    if (S.trick && !trickCompletes(S.trick, S.airSec)) landing = 'bail';
    if (S.trick) {
      const pts = trickPoints(S.trick, S.launch, landing);
      if (pts > 0) { const label = `${S.trick.name}${S.launch !== 'ground' ? ` OFF ${S.launch.toUpperCase()}` : ''}`; const rep = S.combo.repeatsOf(label); const paid = S.combo.add(label, pts, 'air'); flash(ctx, `${S.trick.name} ${landing === 'sketchy' ? '· SKETCHY ' : ''}${rep ? `· REPEAT ×${rep + 1} ` : ''}+${paid}`); }
    } else if (landing === 'clean' && drop >= 2.4) { S.combo.add('ROLL', 30, 'revert'); flash(ctx, 'ROLL +30'); }
    // G3/G5: the flip's residual is NOT written to 0 here — it settles upright over the next few frames (see update).
    S.speed = speedAfterLanding(S.speed, landing);
    if (landing === 'bail') {
      const lost = S.combo.bail(); S.bails++;
      S.state = 'down'; S.downSec = DOWN_SEC;   // the tree: fall → the floor → the get-up inside DOWN_SEC
      SoundKit.play('miss'); bailPunch(ctx, S, 'bail');   // A+ P0: hit-stop + shake + ONE low thud (feel.impact(0.7) is gone)
      flash(ctx, lost > 0 ? `BAILED — ${lost} lost` : 'BAILED', 900);
    } else {
      S.state = 'ground'; S.groundSec = 0;
      landBeat(S, landing);
      ctx.feel?.impact?.(landing === 'sketchy' ? 0.45 : 0.2);
      if (S.trick || drop >= 2.4) softBeat(ctx, S.trick ? 'trick land' : 'big land');   // A+ P0: a big land answers softly
      if (landing === 'sketchy') flash(ctx, 'HARD LANDING — roll next time', 700);
    }
    EffectsKit.burst(ctx.scene, S.hero!.root.position, 'dust');
    S.trick = null;
    hud(ctx, S);
  }

  function respawn(ctx: ModeContext, S: St): void {
    const r = respawnFor(S.pieces, S.checkpoint);
    S.cc!.setPosition(new Vector3(r.x, r.y + CAPSULE_H / 2 + 0.05, r.z));
    S.cc!.setVelocity(Vector3.Zero());
    const lost = S.combo.bail(); S.bails++;
    S.speed = 0; S.state = 'ground'; S.trick = null; S.hero!.root.rotation.set(0, S.hero!.root.rotation.y, 0);
    landBeat(S, 'sketchy');   // put back down hard at the checkpoint (the tree read the teleport as an idle flash)
    SoundKit.play('miss'); bailPunch(ctx, S, 'fell');   // A+ P0: a fall is a crash
    flash(ctx, lost > 0 ? `FELL — ${lost} lost · back to the checkpoint` : 'FELL — back to the checkpoint', 1000);
  }

  function finish(ctx: ModeContext, S: St): void {
    if (S.finished) return;
    S.finished = true; S.phase = 'done';
    S.combo.bank();
    const tb = timeBonus(S.runSec, S.tier);
    const rb = S.highTouched ? S.tier.routeBonus : 0;
    const total = S.combo.banked + tb + rb;
    const grade = runGrade(total, S.tier);
    SoundKit.play('whistle'); SoundKit.play('crowdCheer');
    finishPunch(ctx, S, grade === 'S' || grade === 'A');   // A+ P0: one finish punch
    EffectsKit.burst(ctx.scene, S.hero!.root.position.add(new Vector3(0, 1.8, 0)), 'confetti');
    hud(ctx, S, { banner: `FINISH · ${S.runSec.toFixed(1)}s · GRADE ${grade}` });
    setTimeout(() => ctx.end(grade === 'S' || grade === 'A' ? 'win' : 'complete', total, {
      timeSec: Math.round(S.runSec * 10) / 10, tricks: S.combo.banked, timeBonus: tb, routeBonus: rb, bestCombo: S.combo.bestCombo,
      tier: S.tier.id, bails: S.bails, highLine: S.highTouched ? 1 : 0,
    }), 1400);
  }

  // ── pick ─────────────────────────────────────────────────────────────
  function showPick(ctx: ModeContext, S: St): void {
    ctx.setHud({ banner: `COURSE   ◀  ${S.tier.name}  ▶`, hint: `${S.tier.gaps} gaps · par ${S.tier.parSec}s · high line +${S.tier.routeBonus}  ·  any face button starts`, tier: S.tier.name, verbs: '', time: 0 });
  }

  async function begin(ctx: ModeContext, S: St): Promise<void> {
    if (S.phase !== 'pick') return;
    S.phase = 'run';
    buildCourse(ctx, S);
    ctx.setHud({ banner: '', hint: 'stick RUNS · A JUMP / VAULT / WALL RUN · B SLIDE / ROLL · X FLIP (stick picks) · Y TWIST / CAT LEAP' });
    hud(ctx, S);
  }

  return {
    modeId: 'freerun', mood: 'nightGame', camPreset: 'runner',

    async load(ctx: ModeContext) {
      // module-scope state outlives a mount: a remount must re-read the preset's fov, not the last run's.
      baseFov = null;
      const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tier') : null;
      const S: St = {
        scene: ctx.scene, phase: 'pick', pickSec: 0, autoBegin: !!q,
        tier: tierById(q ? Number(q) : 1), pieces: [], meshes: [], aggs: [],
        hero: null, cc: null, state: 'ground', speed: 0, heading: new Vector3(0, 0, 1), stick: new Vector3(),
        airStartY: 0, airSec: 0, launch: 'ground', trick: null, trickSpun: 0,
        wallSec: 0, wallNormal: new Vector3(1, 0, 0), slideSec: 0, downSec: 0, groundSec: 0, rollAt: null, clock: 0,
        combo: new ComboChain(undefined, 'all'), started: false, runSec: 0, finished: false,
        checkpoint: 0, highTouched: false, bails: 0, barsCleared: new Set(),
        env: { vaultAhead: false, wallAhead: false, ledgeAhead: false, barAhead: false }, vy: 0,
        tree: null, jumpAt: -9, landAt: -9, landing: 'none',
        posture: null, bio: { ...FREERUN_INPUT_IDLE },
        bailAt: 0, finishLatch: false,
      };
      states.set(ctx.scene, S); live.add(S);

      // Havok first: the course pieces are static aggregates, the runner a character capsule
      const handle = await initPhysics(ctx.scene);
      handle.ground.dispose();                                  // the helper's catch-all floor would fill every gap
      const floor = ctx.scene.getMeshByName('physics_ground'); floor?.dispose();
      if (S.scene.isDisposed) return;

      S.hero = await CharacterLibrary.spawn(ctx.scene, DEFAULT_HERO_URL, { position: new Vector3(0, 0, 3), yawRad: 0, startClip: 'idle_stand', modeId: 'freerun' });
      installSafePlay(S.hero.animator, 'freerun');
      S.tree = new FreeRunAnimTree(S.hero.animator);
      // G1/G5: the body under the clips. There is no objective on a course, so the aim IS the line — 8 m down the
      // heading at head height; a vault / a wall run puts the eyes on the surface through the window's own stance.
      S.posture?.dispose();
      S.posture = mountPostureLayer(ctx.scene, S.hero.skeleton, S.hero.root, () => {
        const hero = S.hero; if (!hero) return null;
        const { window, pose, legs } = runPose(freeRunWindow(S.bio));
        const at = hero.root.position.add(new Vector3(S.heading.x * 8, 1.5, S.heading.z * 8));
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
      assertSpawned(ctx.scene, { hero: S.hero.root, minWorldMeshes: 6, modeId: 'freerun' });
      if (!S.autoBegin) showPick(ctx, S);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      const S = st(ctx); if (!S || !S.hero || !S.cc) return;
      // BIOMECH-WAVE2: the stick is recorded in EVERY phase. InputBus only emits a stick event when the value CHANGES,
      // and the pick branch below used to swallow them — so a player who was already holding forward when the course
      // started stood still until they let go and pushed again (measured on the fake pad: 15 s of a held stick, 0 m).
      if (e.t === 'stick' && e.side === 'L') { S.stick.set(e.x, 0, -e.y); if (S.phase === 'run') return; }
      if (S.phase === 'pick') {
        if (e.t === 'dpad' && e.pressed && (e.dir === 'left' || e.dir === 'right')) {
          const i = TIERS.findIndex((t) => t.id === S.tier.id);
          S.tier = TIERS[(i + (e.dir === 'right' ? 1 : -1) + TIERS.length) % TIERS.length];
          SoundKit.play('uiTick', { pitch: e.dir === 'right' ? 1.2 : 0.9, volume: 0.3 }); showPick(ctx, S);
        } else if (e.t === 'button' && e.pressed && (e.btn === 'A' || e.btn === 'B' || e.btn === 'X' || e.btn === 'Y')) void begin(ctx, S);
        return;
      }
      if (S.phase !== 'run') return;
      if (e.t !== 'button' || !e.pressed) return;
      const verbs = verbsFor(S.state, S.speed, S.env);
      if (e.btn === 'A') {
        if (S.state === 'ground') {
          if (verbs.includes('WALL RUN')) { S.state = 'wallrun'; S.wallSec = WALLRUN_SEC; S.airStartY = S.hero.root.position.y; S.combo.add('WALL RUN', 45, 'grind'); flash(ctx, 'WALL RUN'); SoundKit.play('whoosh'); }
          else if (verbs.includes('VAULT')) { beginAir(S, 'vault', VAULT_V); S.combo.add('VAULT', 40, 'grind'); flash(ctx, 'VAULT'); SoundKit.play('whoosh'); }
          else { beginAir(S, 'ground', JUMP_V); }
        } else if ((S.state === 'wallrun' || S.state === 'air') && (verbs.includes('WALL KICK'))) {
          const away = S.wallNormal.clone(); away.y = 0; if (away.lengthSquared() < 0.01) away.set(-S.heading.x, 0, -S.heading.z); away.normalize();
          S.heading.copyFrom(away); S.speed = Math.max(S.speed, 4.5);
          S.state = 'air'; S.airStartY = S.hero.root.position.y; S.airSec = 0; S.launch = 'wallkick'; S.trick = null; S.rollAt = null;
          S.vy = WALLKICK_V; S.cc.setVelocity(new Vector3(away.x * WALLKICK_PUSH, WALLKICK_V, away.z * WALLKICK_PUSH));
          S.combo.add('WALL KICK', 60, 'grind'); flash(ctx, 'WALL KICK'); SoundKit.play('impact', { pitch: 1.3, volume: 0.4 }); jumpBeat(S);
        } else if (S.state === 'air' && S.launch === 'drop' && coyote.ok) {
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
        }
      } else if (e.btn === 'B') {
        if (S.state === 'ground' && verbs.includes('SLIDE')) { S.state = 'slide'; S.slideSec = SLIDE_SEC; S.combo.add('SLIDE', 35, 'manual'); flash(ctx, 'SLIDE'); SoundKit.play('whoosh', { pitch: 0.8 }); }
        else if (S.state === 'air') { S.rollAt = S.clock; }                    // the roll is timed against touchdown
      } else if (e.btn === 'X' || e.btn === 'Y') {
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
      if (S.phase === 'pick') { S.pickSec += dt; if (S.autoBegin || S.pickSec >= PICK_TIMEOUT_S) void begin(ctx, S); return; }
      if (S.phase === 'done') { feedTree(S); return; }   // the finish celebrate plays out under the results banner
      if (S.phase !== 'run') return;

      const cc = S.cc, root = S.hero.root;
      // heading follows the stick in camera space; the run keeps its heading with no input
      const cam = ctx.camera;
      const fwd = cam.getForwardRay().direction; fwd.y = 0; if (fwd.lengthSquared() < 0.01) fwd.set(0, 0, 1); fwd.normalize();
      const right = new Vector3(fwd.z, 0, -fwd.x);
      const wishLen = Math.min(1, Math.hypot(S.stick.x, S.stick.z));
      if (wishLen > 0.15 && S.state !== 'down') {
        const w = fwd.scale(S.stick.z).addInPlace(right.scale(S.stick.x)).normalize();
        if (S.state === 'ground' || S.state === 'slide') S.heading.copyFrom(w);
        else S.heading = Vector3.Lerp(S.heading, w, 0.04).normalize();          // faint air control
      }
      if (S.state === 'ground') S.speed = stepSpeed(S.speed, wishLen * RUN_MAX, dt);
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

      probe(ctx, S);

      // ── the physics step ──
      const down = new Vector3(0, -1, 0), gravity = Vector3.Zero();   // gravity is applied to S.vy below; the controller integrates what it is handed
      const G = -9.81;
      const support = cc.checkSupport(dt, down);
      const supported = support.supportedState === CharacterSupportedState.SUPPORTED;
      let desired: Vector3;
      if (S.state === 'wallrun') {
        S.wallSec -= dt;
        const along = S.heading.clone(); along.y = 0;
        S.vy = 2.6 * (S.wallSec / WALLRUN_SEC) - 1.2;
        desired = new Vector3(along.x * Math.max(3.5, S.speed), S.vy, along.z * Math.max(3.5, S.speed));
        cc.setVelocity(desired);
        if (S.wallSec <= 0 || !S.env.wallAhead && S.wallSec < WALLRUN_SEC - 0.25) { S.state = 'air'; S.airSec = 0; S.launch = 'drop'; }   // off the wall: the tree holds the air pose (no second take-off)
      } else if (S.state === 'air') {
        S.airSec += dt;
        S.vy = Math.max(-30, S.vy + G * dt);
        desired = new Vector3(S.heading.x * S.speed, S.vy, S.heading.z * S.speed);
        cc.setVelocity(desired);
        if (S.trick) {
          const t = S.trick, rate = (t.turns * 2 * Math.PI) / t.airSec;
          S.trickSpun += Math.abs(rate) * dt;
          if (t.axis === 'x') root.rotation.x += rate * dt; else if (t.axis === 'z') root.rotation.z += rate * dt; else root.rotation.y += rate * dt;
        }
      } else if (S.state === 'down') {
        S.downSec -= dt; S.vy = supported ? 0 : Math.max(-30, S.vy + G * dt); cc.setVelocity(new Vector3(0, S.vy, 0));
        if (S.downSec <= 0) { S.state = 'ground'; S.speed = 0; }
      } else {
        if (S.state === 'slide') { S.slideSec -= dt; if (S.slideSec <= 0) S.state = 'ground'; }
        // on the ground the controller follows the surface; off an edge we fall under our own gravity
        if (supported) { S.vy = 0; desired = new Vector3(S.heading.x * S.speed, 0, S.heading.z * S.speed); const moved = cc.calculateMovement(dt, S.heading, support.averageSurfaceNormal, cc.getVelocity(), support.averageSurfaceVelocity, desired, new Vector3(0, 1, 0)); moved.y = Math.min(moved.y, 0.5); cc.setVelocity(moved); }
        else { S.vy = Math.max(-30, S.vy + G * dt); cc.setVelocity(new Vector3(S.heading.x * S.speed, S.vy, S.heading.z * S.speed)); }
        if (S.state === 'ground') {
          if (!supported && S.vy < -1.2) { S.state = 'air'; S.airStartY = root.position.y; S.airSec = 0; S.launch = 'drop'; S.trick = null; S.rollAt = null; }   // a drop off an edge: no take-off, the air hold
          else { S.groundSec += dt; }
          // touching down without a linked move banks the line
          if (S.groundSec >= BANK_AFTER_SEC && S.combo.pot > 0) { const b = S.combo.bank(); flash(ctx, `BANKED +${b}`, 800); SoundKit.play('score', { volume: 0.5 }); softBeat(ctx, 'bank'); hud(ctx, S); }
        }
      }
      cc.integrate(dt, support, gravity);
      const pos = cc.getPosition();
      root.position.set(pos.x, pos.y - CAPSULE_H / 2 - 0.02, pos.z);

      // landings
      if (S.state === 'air' && supported && S.airSec > 0.08 && S.vy <= 0.5) land(ctx, S);

      // falls, bars, gates
      if (root.position.y < FALL_Y || (root.position.y < -0.4 && overGap(S.pieces, root.position.x, root.position.z))) respawn(ctx, S);
      for (const [i, p] of S.pieces.entries()) {
        if (p.kind === 'bar' && !S.barsCleared.has(i) && root.position.z > p.z && root.position.z < p.z + 1.2 && Math.abs(root.position.x - p.x) < p.w / 2) {
          S.barsCleared.add(i);
          if (S.state !== 'slide' && root.position.y < p.y + 0.4) { S.speed *= BAR_CLIP_SPEED; ctx.feel?.impact?.(0.4); flash(ctx, 'CLIPPED THE BAR — slide under it', 800); }   // A+ P0: ONE thud (feel.impact plays its own; the stacked impact SFX is gone)
        }
        if (p.kind === 'checkpoint' && (p.index ?? 0) > S.checkpoint && root.position.z > p.z) { S.checkpoint = p.index ?? 0; SoundKit.play('uiTick', { pitch: 1.3 }); flash(ctx, `CHECKPOINT ${S.checkpoint}`, 600); }
      }
      if (!S.started && root.position.z > 1.5) { S.started = true; flash(ctx, 'GO', 500); }
      if (S.started && !S.finished) S.runSec += dt;
      if (routeAt(root.position.x, root.position.y) === 'high') S.highTouched = true;
      coyote.update(S.state === 'ground');   // one feed per frame, from the state the jump branch reads
      if (!S.finished && root.position.z >= courseLength(S.pieces)) finish(ctx, S);

      feedTree(S);

      // camera: leads the momentum and pulls back with speed (FOV widens).
      // This was `c.fov = 0.8 + S.speed * 0.018` — the game's only real speed kick, and unclamped: nothing
      // stopped a fast enough run from widening the lens into a fisheye, and the hard-coded 0.8 ignored
      // whatever fov the camera preset was actually tuned at. Same effect, bounded, and eased on a time
      // constant so it settles identically at 30 fps and 144.
      const c = ctx.scene.activeCamera;
      if (c) { baseFov ??= c.fov; c.fov = stepSpeedFov(c.fov, baseFov, S.speed, RUN_MAX, dt); }
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
