// DunkDuelMode — NEW mode (`modeId: 'dunkduel'`, route `/play/dunkduel`).
// The head-to-head dunk contest: TWO HUMANS, one device, pass-and-play.
// Player 1 dunks, hands the device over, Player 2 answers, alternating two
// dunks each; the same three judges (Silk/Doc/Prime) score every attempt,
// and the higher total takes the duel.
//
// HONEST SCOPE: this is real local head-to-head — the strongest two-player
// experience shippable without networking infrastructure this repo can't
// see (same boundary as M48/M50). A remote/IRL-video variant would ride on
// the M36 cash-arena ghost/recording pipeline and is deliberately NOT
// faked here.
//
// The attempt flow is the proven M47/M52 single-player loop, trimmed for
// duel pacing: approach → charge (trigger) → cinematic with SLAM QTE →
// judged reveal. Rim-cam broadcast cut and per-phase watchdogs from M52.
//
// Owner re-lock (2026-09-01): "head to head irl dunk is supposed to be a
// REAL dunk contest platform" — the same NBA Live 08 contest bar as Dunk
// Contest, played head-to-head. What that adds to the trimmed loop:
//   VARIETY MEMORY — the judges remember EACH player's dunks; repeating
//     yourself costs you ("THE JUDGES HAVE SEEN THAT ONE…").
//   THE RUN-UP IS PART OF THE DUNK — peak approach speed feeds the jump
//     apex AND the judges' difficulty read. A walk-up caps your dunk.
//   THE CHAIR IS PHYSICAL — both players get the identical option to arm
//     the obstacle; clearing it pays, clipping it KILLS the dunk mid-air.
// (The bench-toss alley-oop — P2 throwing P1's lob — is the duel-native
// prop and is DEFERRED: it needs a second input surface mid-attempt.)
//
// BIOMECH-HOOPS-WAVE1 (2026-09-08): the contest's Posture Poses + feet (DUNK-POSTURE / DUNK-POSTURE-LEGS) on BOTH duel
// bodies through the shared anim/PostureLayer — the same stance table (core/DunkPosture) on the same flight clock, the
// chest on the iron, the eyes on the rim, the hip-yaw strip, the feet pointed in the air and flat for the land; the
// facing keeps easing onto the rim through the resolve (it stopped at the takeoff). The bench body stands in the hoops
// idle stance, chest and eyes on the dunker.

import { Color3, Color4, MeshBuilder, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, AnimationGroup, Camera, Observer, ParticleSystem, Scene, TransformNode } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { BallSim } from '../core/BallPhysics';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { MOCAP_DUNK } from '../nexus/dressingFlags';
import { attachBallToHand, releaseBall, runEastbayPath, runHandOffPath, handOffK, flushThroughRim, clankOffRim, type HandOffSpec } from '../anim/ballRig';
import { OBSTACLE_SPECS, clipsObstacle, heightAt, nextObstacle, type ObstacleKind } from '../core/DunkObstacles';
import { spawnDunkObstacle, type DunkObstacle } from './dunkObstacleProps';
import { boneNode } from '../anim/boneLookup';
import { EASTBAY_TIMING } from '../anim/authored/timing';
import { armChain, reachArm, shapeReach, type ArmChain } from '../anim/HandIK';   // A+ P8 H1 (dunk mirror): the hang wrist reach
import { hitStop as feelHitStop } from '../core/gameFeel';   // DUNK-HANDS-RIM H3 (dunk mirror)
import { PostureLayer } from '../anim/PostureLayer';   // BIOMECH-HOOPS-WAVE1: the contest's Posture Poses, shared
import { posturePose, type PostureInput } from '../core/DunkPosture';
import { legPose } from '../core/DunkLegs';
import { HOOPS_LEGS, HOOPS_POSTURE } from '../core/HoopsPosture';
import type { PlayOpts } from '../anim/CharacterAnimator';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { HoopJuice } from '../visual/HoopJuice';
import { applyVeniceDunkLookPass } from '../visual/veniceSurroundVisibility';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { applyOceanCourt } from '../visual/CourtSurface';
import { DUNK_CONFIG as CFG } from './modeConfigs';

let modeVenue: VenueHandle | null = null;   // ship pass 4: the mounted venue spec, disposed with the mode
import { judgeDunk, type JudgeScore } from '../core/JudgePanel';  // Phase 7: shared judges

type Phase = 'handoff' | 'approach' | 'charge' | 'cinematic' | 'resolve' | 'judging' | 'matchOver';
const STYLES = ['power', 'flashy', 'sig'] as const;
type Style = (typeof STYLES)[number];
// DUNK-CONTROL-JUICE: the duel launches on the same bodies as the contest — the owner's mocap takeoff (it TUCKS the feet,
// which is what clears a car: the 0.35 s authored takeoff leaves the legs nearly straight and the trail foot caught the roof
// at 1.36 m); FLASHY launched on the ROUNDHOUSE kick before.
const STYLE_CLIP: Record<Style, string> = {
  power: MOCAP_DUNK ? 'dunk_mocap' : SPORT_CLIP.dunkLaunchPower, flashy: MOCAP_DUNK ? 'dunk_mocap' : SPORT_CLIP.dunkLaunchPower, sig: SPORT_CLIP.dunkLaunchSig,
};
const STYLE_LABEL: Record<Style, string> = { power: 'POWER', flashy: 'FLASHY', sig: 'SIGNATURE' };
const STYLE_TIER: Record<Style, number> = { power: 3, flashy: 5.5, sig: 8 };

const DUNKS_EACH = 2;

// DUNK-CONTROL-JUICE (2026-09-08): the chair box is gone — the duel dunks over the same car / barrier / crate as the contest
// (dunkObstacleProps: real meshes, hitboxes sampled off them, the feet against the top). X and d-pad down cycle them.
type Prop = 'none' | ObstacleKind;
const PROP_LABEL: Record<Prop, string> = { none: 'NO PROP', car: OBSTACLE_SPECS.car.label, barrier: OBSTACLE_SPECS.barrier.label, crate: OBSTACLE_SPECS.crate.label };
const PROP_BONUS: Record<Prop, number> = { none: 0, car: OBSTACLE_SPECS.car.bonus, barrier: OBSTACLE_SPECS.barrier.bonus, crate: OBSTACLE_SPECS.crate.bonus };
const FLUSH_Z_AHEAD = 0.6;
const EASTBAY_HANDOFF: HandOffSpec = { at: EASTBAY_TIMING.handOff, from: 'RightHand', to: 'LeftHand' };
const APPROACH_SPEED = 6, FACE_RIM_RATE = 6;   // Dunk play tip (2026-09-07): the dunk mirror's stick speed / rim-facing ease
const TURN_RATE = 10, RETREAT_Z = CFG.startZ + 1.5;   // the facing slew (rad/s); how far a pull-back may back off the runway
const wrapYaw = (y: number): number => Math.atan2(Math.sin(y), Math.cos(y));   // the Euler yaw stays in (−π, π]
// A+ P8 athlete hands, mirrored from DunkMode (PM brief VENICE-DUNK-A-PLUS-P8, 2026-09-07): the reach weight ramp, the fall rate.
const HAND_IK_MAX = 0.6, HAND_IK_LAG_SEC = 0.12, HAND_IK_RIM_UP = 0.08, REACH_POLE_CAP = Math.PI / 2, HAND_IK_FROM = EASTBAY_TIMING.carryUp - 0.05, FALL_SPEED = 2.6;
/** HOLD = RUN (the contest's): the hold ramps the athlete toward the rim at up to the max run and launches at the takeoff line. */
const HOLD_RUN_MAX = 7, HOLD_RUN_RAMP = 6;


const BUDGET_SEC: Record<Phase, number> = {
  handoff: 6, approach: 30, charge: 5, cinematic: 4, resolve: 3, judging: 6, matchOver: 999,
};

export const DunkDuelMode: ModeDefinition = (() => {
  let p1: SpawnedCharacter, p2: SpawnedCharacter;
  let ball: AbstractMesh, ballSim: BallSim;
  let trail: ParticleSystem | null = null;   // juice soft #5
  let fovCam: Camera | null = null, fovBase = 0, fovT = 0, fovOn = false;   // juice soft #4
  let settleLatch = false;                    // juice soft #3
  let settleArmed = false, settleArmAt = 0;   // A+ P4 (P10 mirror): the settle waits for feet-down, not the flush frame
  let hoopJuice: HoopJuice | null = null;     // juice LOOK: rim spring, net squash, hoop flash on the make
  let phase: Phase = 'handoff';
  let phaseSec = 0;
  let activeIdx: 0 | 1 = 0;                       // whose turn
  let attemptNum = [0, 0];                        // dunks taken per player
  let totals = [0, 0];
  let style: Style = 'power';
  let charge = 0, clipTime = 0, qteHit = false, qteWindowOpen = false, qteAccuracy = 0;
  let sinceRelease = 0, releasePos = new Vector3();
  let finishing = false, rimCamCut = false, ended = false;
  let hangSlowMoLatch = false;
  let contactLatch = false;                  // contactPunch once per attempt (the make's flush frame)
  // ── A+ P8 athlete hands (dunk mirror; no replay in the duel) ──
  const armsOf = new WeakMap<SpawnedCharacter, { Left: ArmChain | null; Right: ArmChain | null }>();   // H1: per body, built once
  let handIkT = 0;                            // H1: 0..1 ease of the wrist reach
  let handIkObs: Observer<Scene> | null = null, ikScene: Scene | null = null;
  const handIkTarget = new Vector3(), handIkPole = new Vector3();
  let clipToken = 0;                          // H5: a superseded clip's onEnd chain is dead (Babylon fires it on stop() too)
  let airHeld = false;                        // H5: the aerial clip holds its last frame until feet-down
  let dropToFloor = false;                    // H5: the root falls from the release height (a miss at the clank, a make at CONTACT)
  // ── BIOMECH-HOOPS-WAVE1: the Posture Poses layer per body (the contest's windows on the active dunker, the idle stance on the bench) ──
  const postureOf = new WeakMap<SpawnedCharacter, PostureLayer>();
  let landed = false;                         // feet-down: the land crouch owns the stance until its idle returns
  function activeFeed() {
    const inp: PostureInput = {
      phase: phase === 'approach' || phase === 'charge' || phase === 'cinematic' || phase === 'resolve' ? phase : 'other',
      clipTime, made: phase === 'resolve' ? qteHit : null, clipped: obstacleClipped, landed, celebrate: false, trick: null,
    };
    const { window, pose } = posturePose(inp);
    return { pose, legs: legPose(dropToFloor && window !== 'land' ? 'brace' : window, null), aim: rim, eyes: rim, window };
  }
  function benchFeed(c: SpawnedCharacter) {
    const other = c === p1 ? p2 : p1;
    return { pose: HOOPS_POSTURE.idle, legs: HOOPS_LEGS.idle, aim: other.root.position, eyes: ball.getAbsolutePosition(), window: 'bench' };
  }
  // the contest systems (owner re-lock: the real dunk-contest bar)
  let prop: Prop = 'none';
  let obstacle: DunkObstacle | null = null, obstacleToken = 0;
  let obstacleClipped = false, toppling = false, obstacleOver = false, obstacleCleared = false, clipFloorY = 0, clipBackZ = 0;
  let launchZ = CFG.gatherZ, ikSideK = 0, activeHandOff: { spec: HandOffSpec; t: number } | null = null;
  const feetOf = new WeakMap<SpawnedCharacter, { L: TransformNode | null; R: TransformNode | null }>();
  const gatherLine = (): number => (prop === 'none' ? CFG.gatherZ : rim.z + OBSTACLE_SPECS[prop].takeoffFromRim);
  const feetY = (): number => {
    const c = active(); let f = feetOf.get(c);
    if (!f) { f = { L: boneNode(c.skeleton, 'LeftFoot'), R: boneNode(c.skeleton, 'RightFoot') }; feetOf.set(c, f); }
    let lo = Infinity; for (const n of [f.L, f.R]) if (n) { n.computeWorldMatrix(true); lo = Math.min(lo, n.getAbsolutePosition().y); }
    return Number.isFinite(lo) ? Math.max(c.root.position.y, lo - 0.05) : c.root.position.y;
  };
  let runUpPeak = 0, launchSpeed01 = 0, holdRunSpeed = 0;
  const usedCombos: [Set<string>, Set<string>] = [new Set(), new Set()]; // per-player variety memory
  const rim = new Vector3(0, CFG.rimHeight, CFG.rimZ);
  const ebState = { inLeftHand: false };
  let stickX = 0, stickY = 0;
  let lookX = 0, lookY = 0, lookSeen = false; // R stick → the director's look orbit (Dunk play tip 2026-09-07)

  const active = (): SpawnedCharacter => (activeIdx === 0 ? p1 : p2);
  const bench = (): SpawnedCharacter => (activeIdx === 0 ? p2 : p1);
  const label = (): string => (activeIdx === 0 ? 'P1' : 'P2');
  function setPhase(p: Phase): void { phase = p; phaseSec = 0; }

  // ── Dunk play tip (2026-09-07), the dunk mirror: camera-relative stick, facing from velocity ──
  function stickVel(ctx: ModeContext): Vector3 {
    const mag = Math.hypot(stickX, stickY);
    if (mag < 0.08) return Vector3.Zero();
    const k = (mag > 1 ? 1 / mag : 1) * APPROACH_SPEED;
    const f = ctx.camDirector.forwardFlat(), r = ctx.camDirector.rightFlat();
    return new Vector3((r.x * stickX - f.x * stickY) * k, 0, (r.z * stickX - f.z * stickY) * k);
  }
  function faceVel(v: Vector3, dt: number): void {   // slewed at TURN_RATE, shortest arc; the Euler yaw wins over any stale quat
    if (v.x * v.x + v.z * v.z < 0.05) return;
    const root = active().root;
    if (root.rotationQuaternion) root.rotationQuaternion = null;
    const want = Math.atan2(v.x, v.z);
    const d = Math.atan2(Math.sin(want - root.rotation.y), Math.cos(want - root.rotation.y));
    root.rotation.y = wrapYaw(root.rotation.y + Math.sign(d) * Math.min(Math.abs(d), TURN_RATE * dt));
  }
  function faceToward(target: Vector3, k: number): void {
    const root = active().root;
    const want = Math.atan2(target.x - root.position.x, target.z - root.position.z);
    let d = want - root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    root.rotation.y = wrapYaw(root.rotation.y + d * Math.min(1, k));
  }

  function setProp(ctx: ModeContext, p: Prop): void {
    prop = p;
    obstacle?.dispose(); obstacle = null; obstacleToken++;
    if (p !== 'none') {
      const token = ++obstacleToken;
      void spawnDunkObstacle(ctx.scene, p, rim, 'duel_obstacle').then((o) => { if (token !== obstacleToken || ctx.scene.isDisposed) o.dispose(); else obstacle = o; }, () => undefined);
    }
    ctx.setHud({ prop: PROP_LABEL[prop] });
  }

  function enterHandoff(ctx: ModeContext): void {
    setPhase('handoff');
    style = 'power'; charge = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; rimCamCut = false; hangSlowMoLatch = false; contactLatch = false;
    runUpPeak = 0; launchSpeed01 = 0; holdRunSpeed = 0; obstacleClipped = false; toppling = false; obstacleOver = false; obstacleCleared = false;
    settleLatch = false; settleArmed = false; fovRelease(); setTrail('soft');   // juice soft: back to the runway
    setProp(ctx, 'none');
    active().root.position.set(0, 0, CFG.startZ);
    active().root.rotation.y = Math.PI;
    airHeld = false; dropToFloor = false; handIkT = 0; landed = false;   // A+ P8
    playClip(SPORT_CLIP.idle, { loop: true });
    bench().root.position.set(4.2, 0, CFG.rimZ + 4);
    bench().animator.play(SPORT_CLIP.idle, { loop: true });
    attachBallToHand(ball, active().skeleton, 'RightHand');
    // the camera AND FrameGuard follow whose turn it is — before this, P2's
    // whole game was framed against P1 idling on the bench spot
    ctx.heroRef.current = active().root;
    ctx.camDirector.snapTo(active().root.position, rim);
    SoundKit.play('uiTick', { pitch: 0.9 });
    ctx.setHud({
      activePlayer: label(), p1Score: totals[0], p2Score: totals[1],
      dunkNum: `${attemptNum[activeIdx] + 1}/${DUNKS_EACH}`, style: STYLE_LABEL[style], charge: 0,
      prop: PROP_LABEL[prop],
      banner: `PASS TO ${label()}`, hint: `${label()} — take the device`,
    });
    setTimeout(() => {
      if (phase !== 'handoff' || ended) return;
      ctx.setHud({ banner: '', hint: 'STYLE to cycle · X / D-PAD down picks the CAR, BARRIER or CRATE · LOOK stick orbits the camera · HOLD to run — then tap jump' });
      setPhase('approach');
    }, 2200);
  }

  function launchDunk(ctx: ModeContext): void {
    if (phase === 'cinematic') return;
    setPhase('cinematic');
    clipTime = 0; qteHit = false; qteWindowOpen = false; qteAccuracy = 0; ebState.inLeftHand = false; rimCamCut = false; hangSlowMoLatch = false; contactLatch = false;
    settleLatch = false; settleArmed = false; setTrail('soft');   // A+ P5/P6: no gather at takeoff, the runway trail stays soft through it
    airHeld = false; dropToFloor = false;   // A+ P8
    launchZ = active().root.position.z; obstacleOver = false; obstacleCleared = false; activeHandOff = null; ikSideK = 0;
    console.info('[JUICE-SOFT] launch');
    console.info(`[DUNK-LAUNCH] charge ${charge.toFixed(2)} run ${runUpPeak.toFixed(1)} apex ${((1.05 + charge * 0.55) * (0.85 + launchSpeed01 * 0.3)).toFixed(2)} from z ${launchZ.toFixed(2)} to line ${gatherLine().toFixed(2)}`);
    ctx.camDirector.resetLook();   // the takeoff → rimCamCut framing never inherits a look orbit
    SoundKit.play('whoosh', { pitch: 0.85 });   // the ONE whoosh — never re-triggered on CONTACT
    // Soft-OPEN #2 mirror (see DunkMode.launchDunk): a launch clip that runs out in the air flows into the held hang, not into nothing
    playClip(STYLE_CLIP[style], { speedRatio: 1, onEnd: () => { if (phase === 'cinematic') { console.info('[HANDS] launch → hang'); playAir(SPORT_CLIP.dunkScoreHang, hangRateToResolve()); } } });
  }

  function resolveDunk(ctx: ModeContext): void {
    if (phase === 'resolve') return;
    setPhase('resolve');
    sinceRelease = 0; qteWindowOpen = false; rimCamCut = false;
    ctx.camDirector.snapTo(active().root.position, rim);
    ctx.setHud({ slamPulse: false });
    releasePos.copyFrom(ball.getAbsolutePosition());
    releaseBall(ball);
    if (!qteHit) { ballSim.launch(releasePos, clankOffRim(ball, rim)); missClank(ctx); setTrail('off'); armSettle(); }   // juice soft #2, #5; A+ P4
    if (!qteHit) dropToFloor = true;   // A+ P8 H5: a miss falls from the release height — feet-down is where the stumble lands
    playAir(qteHit ? SPORT_CLIP.dunkScoreHang : SPORT_CLIP.jumpLand);   // A+ P8 H5: holds its last frame in the air; the land clip is feet-down's
  }

  // ── A+ P8 athlete hands, mirrored from DunkMode (see there for the measurements) ─────────────────────────────────
  /** H1: after the clips evaluate, the ball hand reaches for the rim with the eased weight — the wrist lags the root into the iron. */
  function handIkApply(): void {
    const w = HAND_IK_MAX * handIkT * handIkT * (3 - 2 * handIkT);
    if (!p1 || !p2) return;
    const c = active();
    // BIOMECH-HOOPS-WAVE1: the Posture Poses (thoracic / clavicles / head / hips strip / feet) BEFORE the reach — the wrist
    // solves against the posed shoulders (the contest's order: postureTick → spin → posture → reach)
    { const pdt = (ikScene?.getEngine().getDeltaTime() ?? 16) / 1000;
      for (const body of [p1, p2]) { const L = postureOf.get(body); if (L) L.step(pdt, body === c ? activeFeed() : benchFeed(body)); } }
    if (w > 0.001) {
      let arms = armsOf.get(c);
      if (!arms) { arms = { Left: armChain(c.skeleton, 'Left'), Right: armChain(c.skeleton, 'Right') }; armsOf.set(c, arms); }
      c.root.computeWorldMatrix(true);
      handIkTarget.set(rim.x, rim.y + HAND_IK_RIM_UP, rim.z);
      // DUNK-CONTROL-JUICE: the reach crossfades between the arms across the eastbay hand-off (an arm swap on one frame threw the ball)
      for (const side of ['Right', 'Left'] as const) {
        const ws = w * (side === 'Left' ? ikSideK : 1 - ikSideK);
        const arm = arms[side]; if (!arm || ws <= 0.001) continue;
        handIkPole.set(side === 'Left' ? -0.7 : 0.7, -0.2, -0.5).applyRotationQuaternionInPlace(c.root.absoluteRotationQuaternion);
        // DUNK-SOFTS-NAMED: the weight lives in the TARGET, not in a rotation slerp — the hand is solved at full weight toward
        // the point `ws` of the way from the clip's hand to the rim, the elbow's twist capped in proportion (shapeReach). The
        // old partial-weight slerp flipped the arm 60° in one frame whenever the mocap wind-up put the hand behind the
        // shoulder (aim / pole deltas near ±180°: hand 3.40 → 2.92 m in 17 ms, POWER only); the pull it gave is kept.
        arm.shoulder.computeWorldMatrix(true); arm.elbow.computeWorldMatrix(true); arm.hand.computeWorldMatrix(true);
        const sh = arm.shoulder.getAbsolutePosition(), el = arm.elbow.getAbsolutePosition(), hd = arm.hand.getAbsolutePosition();
        const want = hd.add(handIkTarget.subtract(hd).scale(ws));
        const shaped = shapeReach(sh, el, hd, want, handIkPole, undefined, REACH_POLE_CAP * ws);
        reachArm(arm, shaped.target, shaped.pole, 1);
      }
    }
    if (activeHandOff && phase === 'cinematic') runHandOffPath(ball, c.skeleton, activeHandOff.t, activeHandOff.spec, ebState);   // the ball after the reach, this frame's hands
  }
  /** H5: every active-player clip goes through here — a superseded clip's onEnd chain is dead (Babylon raises it on stop()). */
  function playClip(name: string, opts: PlayOpts = {}): AnimationGroup | null {
    const token = ++clipToken;
    if (opts.loop) return active().animator.play(name, opts);
    return active().animator.play(name, { ...opts, onEnd: () => {
      if (token !== clipToken) return;
      if (opts.onEnd) opts.onEnd(); else active().animator.play(SPORT_CLIP.idle, { loop: true });
    } });
  }
  /** H5: the aerial clip — ends on its own in the air → holds its last frame; feet-down plays the land clip. */
  function playAir(name: string, speedRatio = 1): void {
    airHeld = true;
    playClip(name, { speedRatio, onEnd: () => { if (active().root.position.y > 0.05) console.info(`[HANDS] hold ${name}`); else landNow(); } });
  }
  /** The hang paced to last until the resolve — the 0.35 s takeoff's 0.8 s hang ran out 0.24 s before the finish (12 clip-less frames). */
  function hangRateToResolve(): number {
    const left = Math.max(0.3, EASTBAY_TIMING.extend + CFG.qteWindowSec / 2 + 0.05 - clipTime);
    const hang = active().animator.durationOf(SPORT_CLIP.dunkScoreHang) ?? 0.8;
    return Math.max(0.35, Math.min(1, hang / left));
  }
  /** H5: feet-down — the land crouch, then the idle loop. Once per attempt. */
  function landNow(): void {
    if (!airHeld) return;
    airHeld = false; landed = true;
    console.info('[HANDS] land dunk_land_crouch');
    playClip(SPORT_CLIP.dunkLandCrouch, { onEnd: () => { landed = false; playClip(SPORT_CLIP.idle, { loop: true }); } });
  }

  /** The chair caught the dunker mid-flight — the dunk DIES here, whatever
   *  the slam timing was going to be. Same physics as Dunk Contest's prop. */
  function clipBlown(ctx: ModeContext): void {
    toppling = true; obstacle?.hit();
    SoundKit.play('impact', { pitch: 0.6, volume: 0.6 }); console.info('[JUICE-SFX] impact chair');   // the prop is the miss's one hit (missClank skips)
    SoundKit.play('crowdGroan', { volume: 0.7 });
    ctx.feel?.impact?.(0.6);
    ctx.setHud({ banner: `${label()} CAUGHT THE ${obstacle?.spec.label ?? 'PROP'} — BLOWN` });
    setTimeout(() => ctx.setHud({ banner: '' }), 1200);
    resolveDunk(ctx); // qteHit false → the clank path; a blown dunk judges at 0
  }


  /** CONTACT (PM brief VENICE-JUICE-P0, 2026-09-06): console juice on the make's flush frame — one hit-stop, one shake,
   *  one white-gold flash, one rim thud — latched once per attempt so judge cards and FIFTY bursts never re-fire it.
   *  Never a second slow-mo: the hang already spent it at rise. Miss path: nothing here (the clank stays honest). */
  // ── Venice juice soft #2–#5 (PM brief VENICE-JUICE-SOFT, 2026-09-06) ─────────────────────────────────────────────
  /** #2 miss clank weight: a light metallic hit and a small feel impact on the clank — never the make's contactPunch. */
  function missClank(ctx: ModeContext): void {
    if (obstacleClipped) { console.info('[JUICE-SFX] clank skipped — the chair thud was the one hit'); return; }   // A+ P2: one hit per miss
    ctx.feel.impact(0.4);
    SoundKit.play('impact', { pitch: 1.35, volume: 0.45 });
    console.info('[JUICE-SOFT] miss clank'); console.info('[JUICE-SFX] impact clank');
  }
  /** #3 land settle: a micro shake (amp 0.05) and dust at the feet, once per attempt; the miss keeps its one-breath retry. */
  /** A+ P4: armed at CONTACT (make) or at the clank (miss); fires from update() once the body is back on the floor. */
  function armSettle(): void { settleArmed = true; settleArmAt = performance.now(); }
  function settleTick(ctx: ModeContext): void {
    if (!settleArmed) return;
    const since = performance.now() - settleArmAt;
    // feet-down (root back on the floor) or, failing that, the land clip's plant beat ~0.45 s after the hit — never the hit frame
    if (since < 220 || (active().root.position.y > 0.05 && since < 450)) return;
    settleArmed = false; landSettle(ctx);
  }
  function landSettle(ctx: ModeContext): void {
    if (settleLatch) return;
    settleLatch = true;
    fovRelease();   // A+ P5: a miss restores the fov at the land
    ctx.juice.shake(0.05, 110);
    EffectsKit.burst(ctx.scene, active().root.position.clone(), 'dust');
    console.info('[JUICE-SOFT] land settle');
  }
  /** #4 FOV gather: the active camera's fov eases −10% over the gather into the hang and back on CONTACT or land. Only
   *  the fov moves — rimCamCut, the hang target locks and the follow distance beat are untouched. */
  function fovGather(ctx: ModeContext): void {
    const cam = ctx.scene.activeCamera; if (!cam) return;
    if (fovCam !== cam) { fovCam = cam; fovBase = cam.fov; fovT = 0; }
    fovOn = true;
    console.info('[JUICE-SOFT] fov gather');
  }
  function fovRelease(): void { if (fovOn) console.info('[JUICE-SOFT] fov release'); fovOn = false; }
  function fovTick(dt: number): void {
    if (!fovCam) return;
    const target = fovOn ? 1 : 0; const rate = dt / (fovOn ? 0.35 : 0.25);
    fovT = fovT < target ? Math.min(target, fovT + rate) : Math.max(target, fovT - rate);
    const k = fovT * fovT * (3 - 2 * fovT);
    fovCam.fov = fovBase * (1 - 0.10 * k);
    if (!fovOn && fovT === 0) { fovCam.fov = fovBase; fovCam = null; }
  }
  /** #5 trail ramp: soft on the runway, bright in the hang, a white flash cut on the make, dead on a miss or a clipped air. */
  function setTrail(level: 'soft' | 'hang' | 'off'): void {
    if (!trail) return;
    console.info(`[JUICE-SOFT] trail ${level}`);
    if (level === 'off') { trail.emitRate = 0; return; }
    const hang = level === 'hang'; const c = Color3.FromHexString('#ffb36b');
    trail.emitRate = hang ? 170 : 45; trail.maxSize = hang ? 0.2 : 0.1; trail.minSize = hang ? 0.07 : 0.04;
    trail.color1 = new Color4(c.r, c.g, c.b, hang ? 0.95 : 0.5);
  }
  function trailFlash(): void {
    if (!trail) return;
    console.info('[JUICE-SOFT] trail flash');
    trail.color1 = new Color4(1, 1, 1, 1); trail.emitRate = 260; trail.maxSize = 0.3;
    setTimeout(() => { if (trail) trail.emitRate = 0; }, 130);
  }

  function contactPunch(ctx: ModeContext): void {
    if (contactLatch) return;
    contactLatch = true;
    ctx.juice.hitStop(70);
    feelHitStop(70);   // DUNK-HANDS-RIM H3 (dunk mirror): the mode's clock stops on the iron too — one composed beat, no second slow-mo
    ctx.juice.shake(0.12, 140);
    ctx.juice.flash('#fff6dd', 120);
    SoundKit.play('impact', { pitch: 0.7, volume: 0.8 }); console.info('[JUICE-SFX] impact slam');   // A+ P2: the ONE slam thud of the attempt
    fovRelease(); trailFlash();   // juice soft #4, #5
    armSettle();                  // A+ P4: the settle fires at feet-down, not on this frame
    hoopJuice?.punch();           // juice LOOK #1–#3 (make only)
  }

  function finishAttempt(ctx: ModeContext, made: boolean): void {
    if (finishing) return;
    finishing = true;
    let dunkTotal = 0;
    let scores: JudgeScore[] = [];
    let isRepeat = false;
    if (made) {
      // VARIETY MEMORY — the judges remember what THIS player has thrown.
      // Repeating your own combo costs you; the other player's dunks are not
      // your burden (answering a dunk with the same dunk is a legit duel
      // play — execution decides it).
      const combo = `${style}_${prop}`;
      isRepeat = usedCombos[activeIdx].has(combo);
      usedCombos[activeIdx].add(combo);
      const varietyMod = isRepeat ? 0.8 : 1;
      const varietyBonus = isRepeat ? 0 : 0.5;
      // NB: no standalone banner here — the score banner below would clobber
      // it in the same tick (measured: the repeat note never survived a
      // frame). The repeat is named IN the result banner instead.
      // The run-up is judged too (the real panel reads the runway attack),
      // and the chair pays its bonus — but only cleared, never clipped.
      const difficulty = Math.max(0, Math.min(10,
        (STYLE_TIER[style] + PROP_BONUS[prop] + charge * 2 + launchSpeed01 * 1.0 + varietyBonus) * varietyMod));
      const execution = Math.max(0, Math.min(10, qteAccuracy * 10));
      const styleScore = Math.max(0, Math.min(10, STYLE_TIER[style] * 0.8));
      scores = judgeDunk(difficulty, execution, styleScore);
      dunkTotal = scores.reduce((s, j) => s + j.score, 0);
      totals[activeIdx] += dunkTotal;
      SoundKit.play('score', { pitch: 1.1 });
      EffectsKit.burst(ctx.scene, rim, 'net');
      if (dunkTotal >= 27) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, active().root.position.add(new Vector3(0, 1.8, 0)), 'confetti'); }
    } else {
      setTimeout(() => SoundKit.play('crowdGroan', { volume: 0.35 }), 260);   // A+ P2: the clank was the one hit; the crowd groans a breath later, quietly
    }
    if (made) dropToFloor = true; else landNow();   // A+ P8 H5: a make lets go of the iron and falls to feet-down; a miss has normally landed already
    ctx.setHud({
      p1Score: totals[0], p2Score: totals[1],
      judgeReveal: made ? scores : null,
      banner: made
        ? (isRepeat ? `${label()} SCORES ${dunkTotal} — JUDGES HAVE SEEN THAT ONE` : `${label()} SCORES ${dunkTotal}`)
        : `${label()} — MISSED, 0 pts`,
    });
    setPhase('judging');
    setTimeout(() => {
      ctx.setHud({ judgeReveal: null, banner: '' });
      advance(ctx);
      finishing = false;
    }, made ? 2600 : 1400);
  }

  function advance(ctx: ModeContext): void {
    if (phase !== 'judging' || ended) return;
    attemptNum[activeIdx]++;
    const p1Done = attemptNum[0] >= DUNKS_EACH, p2Done = attemptNum[1] >= DUNKS_EACH;
    if (p1Done && p2Done) {
      setPhase('matchOver');
      ended = true;
      SoundKit.play('whistle');
      const tie = totals[0] === totals[1];
      const winner = totals[0] >= totals[1] ? 'P1' : 'P2';
      if (!tie) { SoundKit.play('crowdCheer'); EffectsKit.burst(ctx.scene, rim, 'confetti'); }
      ctx.setHud({ banner: tie ? 'DEAD HEAT!' : `${winner} TAKES THE DUEL!` });
      ctx.end(tie ? 'DUEL_TIED' : `${winner}_WINS`, Math.max(totals[0], totals[1]), { p1: totals[0], p2: totals[1] });
      return;
    }
    // alternate: whoever has fewer attempts goes next
    activeIdx = attemptNum[0] <= attemptNum[1] ? 0 : 1;
    enterHandoff(ctx);
  }

  function watchdog(ctx: ModeContext): void {
    if (phaseSec <= BUDGET_SEC[phase] || finishing || ended) return;
    console.warn(`[FEL-DUNK] duel watchdog tripped in "${phase}" — auto-advancing`);
    switch (phase) {
      case 'handoff': ctx.setHud({ banner: '' }); setPhase('approach'); break;
      case 'approach': active().root.position.set(0, 0, gatherLine()); phaseSec = 0; break;
      case 'charge': launchDunk(ctx); break;
      case 'cinematic': resolveDunk(ctx); break;
      case 'resolve': finishAttempt(ctx, qteHit); break;
      case 'judging': ctx.setHud({ judgeReveal: null, banner: '' }); advance(ctx); break;
    }
  }

  return {
    modeId: 'dunkduel', mood: 'goldenHour', camPreset: 'court',

    async load(ctx: ModeContext) {
      // ship pass 4: the venue spec (with its baked map) first; the kit venue only if no spec
      modeVenue = mountVenue(ctx, 'basketball_dunk', { keepGameplayCamera: true, location: ctx.location });
      if (!modeVenue) VenueKit.buildCourt(ctx.scene);
      applyOceanCourt(ctx.scene, 'venice');
      p1 = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, CFG.startZ), yawRad: Math.PI, startClip: SPORT_CLIP.idle,
      });
      neverBindPose(p1.animator, SPORT_CLIP.idle);
      installSafePlay(p1.animator, 'dunkduel-p1');
      ctx.groundLock?.track(p1.root, p1.skeleton);
      p2 = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(4.2, 0, CFG.rimZ + 4), startClip: SPORT_CLIP.idle,
      });
      neverBindPose(p2.animator, SPORT_CLIP.idle);
      installSafePlay(p2.animator, 'dunkduel-p2');
      ctx.groundLock?.track(p2.root, p2.skeleton);
      if (ikScene && handIkObs) ikScene.onAfterAnimationsObservable.remove(handIkObs);   // A+ P8 H1: the reach, after the clips
      ikScene = ctx.scene; handIkObs = ctx.scene.onAfterAnimationsObservable.add(handIkApply);
      // BIOMECH-HOOPS-WAVE1: one Posture Poses layer per body; the layer owns the eyes (the secondary head-look stands down)
      postureOf.set(p1, new PostureLayer(p1.skeleton, p1.root, 'DUEL-PP-P1')); postureOf.set(p2, new PostureLayer(p2.skeleton, p2.root, 'DUEL-PP-P2'));
      p1.secondary?.setLookTarget(() => null); p2.secondary?.setLookTarget(() => null);
      if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopsPosture?: unknown; dunkPosture?: unknown } }).__FEL_DEV__; if (dev) { const h = { me: () => postureOf.get(active())?.get() ?? null, bench: () => postureOf.get(bench())?.get() ?? null, foe: () => postureOf.get(bench())?.get() ?? null, get: () => postureOf.get(active())?.get() ?? null }; dev.hoopsPosture = h; dev.dunkPosture = h; } }

      ball = MeshBuilder.CreateSphere('duel_ball', { diameter: 0.24 }, ctx.scene);
      ballSim = new BallSim(ball, 0.12);
      ctx.heroRef.current = active().root;
      ctx.objectiveRef.current = rim;
      SoundKit.startAmbient('stadium');
      EffectsKit.ambient(ctx.scene, 'venice');
      trail = EffectsKit.ballTrail(ctx.scene, ball); setTrail('soft');
      hoopJuice?.dispose(); hoopJuice = new HoopJuice(ctx.scene, rim);
      if (process.env.NODE_ENV === 'development') { const dev = (window as unknown as { __FEL_DEV__?: { hoopJuiceUsed?: unknown } }).__FEL_DEV__; if (dev) dev.hoopJuiceUsed = hoopJuice.used; }   // OOM-HYGIENE: the handle is gone once the harness is disposed (a load that resolves after an unmount)
      // Court locations (docs/SPEC-COURT-LOCATIONS.md): the Venice look (golden sky, surround palms) is Venice's own —
      // under any other location the location's environment stands, so the pass steps aside.
      if (!ctx.location || ctx.location === 'venice') await applyVeniceDunkLookPass(ctx.scene);

      activeIdx = 0; attemptNum = [0, 0]; totals = [0, 0]; ended = false; finishing = false;
      enterHandoff(ctx);
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; if (!lookSeen && (Math.abs(e.x) > 0.12 || Math.abs(e.y) > 0.12)) { lookSeen = true; console.info('[LOOK] R stick live'); } }
      if (phase === 'handoff' && e.t === 'button' && e.pressed) {
        // any button skips the handoff card
        ctx.setHud({ banner: '', hint: 'STYLE to cycle · LOOK stick orbits the camera · HOLD to run — then tap jump' });
        setPhase('approach');
        return;
      }
      if (e.t === 'button' && e.btn === 'B' && e.pressed && phase === 'approach') {
        style = STYLES[(STYLES.indexOf(style) + 1) % STYLES.length];
        ctx.setHud({ style: STYLE_LABEL[style] });
        SoundKit.play('uiTick');
      }
      // THE CHAIR — d-pad (keyboard/couch) or X (touch/Controller Link: the
      // pad's d-pad IS the movement stick there, so the prop needed a face
      // button) arms/clears it during the approach. Both players get the
      // identical option, so the duel stays the identical test.
      // Keyboard hotfix (2026-09-07): the arrows are the L stick (InputBus) — ArrowUp runs at the rim, ArrowDown backs
      // off; the chair is the pad / touch d-pad or X. Mirrors DunkMode.
      if (e.t === 'dpad' && e.pressed && e.src !== 'key' && phase === 'approach') {
        if (e.dir === 'down') { setProp(ctx, nextObstacle(prop === 'none' ? null : prop)); SoundKit.play('uiTick', { pitch: 0.8 }); }
        if (e.dir === 'up' && prop !== 'none') { setProp(ctx, 'none'); SoundKit.play('uiTick', { pitch: 1.2 }); }
      }
      if (e.t === 'button' && e.btn === 'X' && e.pressed && phase === 'approach') {
        setProp(ctx, prop === 'crate' ? 'none' : nextObstacle(prop === 'none' ? null : prop));   // none → car → barrier → crate → none
        SoundKit.play('uiTick', { pitch: prop === 'none' ? 1.2 : 0.8 });
      }
      if (e.t === 'trigger' && e.side === 'R') {
        if (phase === 'approach' && e.value > 0.02) {
          // DUNK-CONTROL-JUICE: HOLD = RUN, the contest's own (the duel's charge phase used to stand still in the gather crouch and
          // launch on the release — its HUD promised the hold-run it never had)
          setPhase('charge');
          holdRunSpeed = Math.max(2, runUpPeak);
          playClip(SPORT_CLIP.moveLoop, { loop: true });
          ctx.setHud({ hint: 'HOLD — running to the rim · steer with the stick · release early to jump from here' });
        }
        if (phase === 'charge') {
          charge = Math.max(charge, e.value);
          ctx.setHud({ charge: Math.round(charge * 100) });
          if (e.value === 0) launchDunk(ctx);
        }
      }
      if (e.t === 'button' && e.btn === 'A' && e.pressed && qteWindowOpen) {
        qteHit = true;
        qteAccuracy = Math.max(0, 1 - Math.abs(clipTime - EASTBAY_TIMING.extend) / (CFG.qteWindowSec / 2));
      }
    },

    update(ctx: ModeContext, dt: number) {
      fovTick(dt); settleTick(ctx);
      // A+ P5: the fov pinch starts on the APPROACH — inside 3.6 m (horizontal) of the rim during the run, not at takeoff
      if ((phase === 'approach' || phase === 'charge') && !fovOn && Math.hypot(active().root.position.x - rim.x, active().root.position.z - rim.z) <= 3.6) fovGather(ctx);
      phaseSec += dt;
      watchdog(ctx);
      if (ended) return;

      const lookOn = phase === 'approach' || phase === 'charge';   // R look on the runway only (the rim cut / verdict keep their framing)
      ctx.camDirector.look(lookOn ? lookX : 0, lookOn ? lookY : 0, dt);
      // Dunk play tip (2026-09-07): camera-relative stick, no auto-drift, the facing follows the velocity — see DunkMode
      const vel = stickVel(ctx);
      if (phase === 'approach') {
        const c = active();
        c.root.position.addInPlace(vel.scale(dt));
        c.root.position.z = Math.max(gatherLine(), Math.min(RETREAT_Z, c.root.position.z));
        c.root.position.x = Math.max(-6, Math.min(6, c.root.position.x));
        faceVel(vel, dt);
        // THE RUN-UP IS PART OF THE DUNK. Peak approach speed feeds the apex
        // at launch and the judges' difficulty read — a walk-up caps both.
        runUpPeak = Math.max(runUpPeak, Math.hypot(vel.x, vel.z));
        launchSpeed01 = Math.max(0, Math.min(1, (runUpPeak - 2) / 6));
        playClip(Math.hypot(vel.x, vel.z) > 0.5 ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { loop: true });
        if (c.root.position.z <= gatherLine() + 0.2) {
          ctx.setHud({
            hint: runUpPeak < 3.5
              ? 'HOLD to run — come in FASTER: the run-up buys your air'
              : 'HOLD to run — then tap jump',
          });
        }
      }

      if (phase === 'charge') {
        const c = active();
        holdRunSpeed = Math.min(HOLD_RUN_MAX, holdRunSpeed + dt * HOLD_RUN_RAMP);
        const steer = ctx.camDirector.rightFlat().x * stickX * 3 + Math.max(-2, Math.min(2, (rim.x - c.root.position.x) * 0.8));
        c.root.position.x = Math.max(-6, Math.min(6, c.root.position.x + steer * dt));
        c.root.position.z -= holdRunSpeed * dt;
        faceVel(new Vector3(steer, 0, -holdRunSpeed), dt);
        runUpPeak = Math.max(runUpPeak, Math.hypot(steer, holdRunSpeed));
        launchSpeed01 = Math.max(0, Math.min(1, (runUpPeak - 2) / 6));
        const line = gatherLine();
        if (c.root.position.z <= line) { c.root.position.z = line; launchDunk(ctx); }
      }
      if (phase === 'cinematic') {
        const animScale = ctx.scene.animationTimeScale ?? 1;
        const prevClip = clipTime;
        clipTime += dt * (Number.isFinite(animScale) && animScale > 0 ? animScale : 1);
        if (!hangSlowMoLatch && prevClip < EASTBAY_TIMING.rise && clipTime >= EASTBAY_TIMING.rise) {
          hangSlowMoLatch = true;
          ctx.juice.slowMo(0.4, 400);
          ctx.camDirector.pulse(0.4, 0.45);
          setTrail('hang');   // A+ P6: the trail brightens at the hang rise, not at takeoff
        }
        const c = active();
        activeHandOff = style === 'sig' ? { spec: EASTBAY_HANDOFF, t: clipTime } : null;
        if (style === 'sig' && runEastbayPath(ball, c.skeleton, clipTime, ebState)) console.info(`[HANDS] handoff R→L eastbay @${clipTime.toFixed(2)}`);
        ikSideK = activeHandOff ? handOffK(activeHandOff.t, activeHandOff.spec) : (ebState.inLeftHand ? 1 : 0);
        // A+ P8 H4: the ball stays parented to the ball hand through the hang — a lost parent that is not a release re-attaches
        if (!ball.parent && !ball.metadata?.felReleased) { attachBallToHand(ball, c.skeleton, ebState.inLeftHand ? 'LeftHand' : 'RightHand'); console.info('[HANDS] ball re-attached'); }
        const k = Math.min(1, clipTime / EASTBAY_TIMING.duration);
        // DUNK-CONTROL-JUICE (the contest's mirror): a parabola off the floor, a constant-speed carry from the takeoff line
        // to the rim's front edge at the extension — the car is a long jump from its own line. The run-up buys air.
        c.root.position.y = 4 * k * (1 - k) * (1.05 + charge * 0.55) * (0.85 + launchSpeed01 * 0.3);
        const u = Math.min(1, clipTime / EASTBAY_TIMING.extend);
        c.root.position.z = launchZ + (rim.z + FLUSH_Z_AHEAD - launchZ) * u;
        faceToward(rim, dt * FACE_RIM_RATE);   // ease the facing onto the iron through the rise

        // THE OBSTACLE IS PHYSICAL: the lowest foot against the sampled top of the mesh under it — the dunk DIES on a clip
        if (obstacle && !obstacleClipped) {
          const fy = feetY(), px = c.root.position.x - rim.x, pz = c.root.position.z;
          const h = heightAt(obstacle.profile, px, pz);
          if (h > 0 && !obstacleOver) { obstacleOver = true; console.info(`[DUNK-PROP] over ${obstacle.spec.label}: feet ${fy.toFixed(2)} vs top ${h.toFixed(2)}`); }
          if (clipsObstacle(obstacle.profile, fy, px, pz, obstacle.spec.clearance)) {
            obstacleClipped = true; setTrail('off');   // juice soft #5: a clipped air kills the trail
            const deep = h - fy > 0.45 || obstacle.spec.topples;
            clipFloorY = deep ? 0 : h; clipBackZ = deep ? Math.max(pz, obstacle.nearZ + 0.4) : pz;
            console.info(`[DUNK-PROP] CLIPPED ${obstacle.spec.label}: feet ${fy.toFixed(2)} under ${h.toFixed(2)} at z ${pz.toFixed(2)}`);
            clipBlown(ctx);
          } else if (h === 0 && obstacleOver && !obstacleCleared && pz < obstacle.farZ) {
            obstacleCleared = true;
            console.info(`[DUNK-PROP] CLEARED ${obstacle.spec.label}`);
            SoundKit.play('crowdCheer', { volume: 0.35 }); ctx.camDirector.pulse(0.35, 0.3);
            ctx.setHud({ banner: `${label()} OVER THE ${obstacle.spec.label}!` }); setTimeout(() => ctx.setHud({ banner: '' }), 700);
          }
        }

        if (!rimCamCut && clipTime >= EASTBAY_TIMING.extend * 0.55) {
          rimCamCut = true;
          ctx.camDirector.snapTo(new Vector3(rim.x + 2.6, 0.4, rim.z - 1.2), c.root.position.add(new Vector3(0, 1.4, 0)));
        }

        const wasOpen = qteWindowOpen;
        qteWindowOpen = clipTime >= EASTBAY_TIMING.extend - CFG.qteWindowSec / 2
          && clipTime <= EASTBAY_TIMING.extend + CFG.qteWindowSec / 2;
        if (qteWindowOpen && !wasOpen) ctx.setHud({ hint: 'SLAM!', slamPulse: true });
        if (!qteWindowOpen && wasOpen) ctx.setHud({ slamPulse: false });
        if (clipTime >= EASTBAY_TIMING.extend + CFG.qteWindowSec / 2) resolveDunk(ctx);
      }

      if (phase === 'resolve') {
        sinceRelease += dt;
        if (!obstacleClipped) faceToward(rim, dt * FACE_RIM_RATE);   // BIOMECH-HOOPS-WAVE1 G1: the chest stays on the iron through the jam (the ease stopped at the takeoff)
        // a clipped dunk drops the dunker where the chair caught him, and the
        // chair goes over — the failure has to READ as contact
        if (obstacleClipped) {   // down where the prop caught him: the floor before the side he hit, or the top he caught
          active().root.position.y = Math.max(clipFloorY, active().root.position.y - 6 * dt);
          active().root.position.z += (clipBackZ - active().root.position.z) * Math.min(1, dt * 6);
        }
        if (qteHit) {
          if (flushThroughRim(ball, rim, releasePos, sinceRelease)) { contactPunch(ctx); finishAttempt(ctx, true); }
        } else {
          ballSim.step(dt);
          if (sinceRelease > 1.2) finishAttempt(ctx, false);
        }
      }

      obstacle?.tick(dt);
      // ── A+ P8 athlete hands: the fall to feet-down, the reach weight (dunk mirror) ──────────────────────────────
      if (dropToFloor && !obstacleClipped) {
        active().root.position.y = Math.max(0, active().root.position.y - FALL_SPEED * dt);
        if (active().root.position.y <= 0) dropToFloor = false;
      }
      if (airHeld && phase !== 'cinematic' && active().root.position.y <= (obstacleClipped ? clipFloorY : 0) + 0.05) landNow();
      // DUNK-SOFTS-NAMED: the reach starts at the CARRY-UP (the extension toward the iron), not the rise — through the rise and
      // the mocap's wind-up the hand swings past the shoulder and a reach toward the rim whipped it (0.8 m/frame measured;
      // the clip alone moves 0.22 m/frame), so the catch and the wind-up ride the clip's own hand now
      const reachWant = (phase === 'cinematic' && clipTime >= HAND_IK_FROM && !obstacleClipped)
        || (phase === 'resolve' && qteHit && !contactLatch && !obstacleClipped);
      const ikScale = ctx.scene.animationTimeScale ?? 1;
      const ikStep = dt * (phase === 'cinematic' && Number.isFinite(ikScale) && ikScale > 0 ? ikScale : 1) / HAND_IK_LAG_SEC;
      const prevIk = handIkT;
      handIkT = reachWant ? Math.min(1, handIkT + ikStep) : Math.max(0, handIkT - ikStep);
      if (prevIk === 0 && handIkT > 0) console.info('[HANDS] reach on'); else if (prevIk > 0 && handIkT === 0) console.info('[HANDS] reach off');

      if (phase === 'cinematic' && rimCamCut) {
        // hold the rim-cam angle through the flush
      } else if (phase !== 'judging' && phase !== 'matchOver' && phase !== 'handoff') {
        ctx.camDirector.update(active().root.position, vel, phase === 'approach' ? rim : ball.position);
      }
    },

    dispose() {
      hoopJuice?.dispose(); hoopJuice = null;
      modeVenue?.dispose?.(); modeVenue = null;
      if (ikScene && handIkObs) ikScene.onAfterAnimationsObservable.remove(handIkObs);   // A+ P8 H1
      handIkObs = null; ikScene = null; handIkT = 0;
      p1?.dispose(); p2?.dispose(); ball?.dispose();
      obstacle?.dispose(); obstacle = null; obstacleToken++;
      SoundKit.stopAmbient();
    },
  };
})();

// HUD CONTRACT (bare values): activePlayer ('P1'/'P2'), p1Score/p2Score,
// dunkNum, style, prop, charge, slamPulse, judgeReveal (same shape as Dunk
// Contest's), banner, hint.
