// carnivalEvents v2 — REPLACES the M49 file. Adds two events to the pool
// (now six): COIN STORM (a pickup frenzy on the street court — CoinField
// respawns fresh patterns as you clear them) and COUNTER STRIKE (a pure
// parry-timing duel — read the rival's wind-up, tap GUARD in the window).
// The four M49 events are byte-identical. Same design rule throughout: each
// event is 15-20 seconds of ONE clear verb, built entirely from systems
// this project already owns and trusts.
//
// ANIM-READABILITY (creative, 2026-09-07): ONE OWNER per body. Every event used to play clips from onInput AND tick with
// neverBindPose's onEnd chain settling them, and the chain fires when a one-shot is CUT too — so the trick gauntlet's
// per-frame ride-idle play cut the bail to 0.08 s, and a counter's rival hit-react chained the stance from inside the
// animator's fade handler (the stranded-fade freeze the combat pass measured). Bodies on a loop + beats use BeatOwner;
// the trick gauntlet rides BoardAnimTree with the TrickMachine in external mode, exactly like the skate mode.

import { Color3, MeshBuilder, PBRMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { BeatOwner } from '../anim/beatOwner';
import { BoardAnimTree } from '../anim/boardTree';
import { VenueKit } from '../visual/VenueKit';
import { buildSkatepark } from './rideWorlds';
import { buildRig, TrickMachine, TRICKS, type BoardRig } from './boardCore';
import { buildGoal, Reticle, PowerMeter, Flight } from './aimSwingCore';
import { resolveSave, type DiveSign, type DiveTiming } from '../core/KeeperCore';
import { registerMirroredClips } from '../anim/mirrored-clips';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { CoinField } from '../core/Pickups';
import type { ModeContext } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { DUNK_CONFIG as SHARED_CFG } from './modeConfigs';
import { dressBall } from '../visual/meshyProps';   // the hoops modes' Meshy ball (Slam Rush)
import { attachBallToHand } from '../anim/ballRig';
import { rightHandDunks } from '../anim/dunkHand';                           // HOOPS MOTION phase 3: right-handed on screen (Slam Rush)
import { rightHandHoops, rightHandBall, hoopsHand } from '../anim/hoopsHand';

export interface CarnivalEvent {
  id: string;
  title: string;
  durationSec: number;
  pointsPerUnit: number;         // raw score → Carnival Points
  rivalRange: [number, number];  // plausible raw-score range for the simulated rival
  build(ctx: ModeContext): Promise<void>;
  onInput(ctx: ModeContext, e: FelInput): void;
  /**
   * The buttons THIS event reads, and one line naming what it wants instead (SCORECARD FEEL, 2026-09-15).
   *
   * An event is fifteen seconds of one verb, and the other three buttons on the deck did nothing at all: measured on
   * the rc19 capture, only 42 % of answered presses carried a sound or a pop, because more than half the session's
   * presses were the wrong button for the event on screen and fell into the floor. The router answers those now — the
   * press is heard, and the answer is the verb that would have worked.
   */
  verbs?: { buttons: readonly string[]; says: string };
  /** advance the event; return the current raw score. */
  tick(ctx: ModeContext, dt: number): number;
  /**
   * IMPROVE (2026-10-06): put a BUILT event back to its whistle state for the next player (2P pass-and-play). The stage,
   * the bodies and the materials stay; only the score, the clock-driven state and the positions go back. An event without
   * it is torn down and built again between turns (the old path; the trick gauntlet's rider physics has no reset).
   */
  reset?(ctx: ModeContext): void;
  teardown(): void;
}

/**
 * ONE banner channel per event (IMPROVE 2026-10-06; NetSportMode's flash()). Every MAKE / MISS / COUNTER / HIT armed its
 * own 400 ms clear, so the clear of the first wiped the banner that came after it — and a clear still pending at the
 * whistle wiped the RESULT card's banner. A new flash replaces the old one and owns the clear; teardown cancels it.
 */
export function bannerChannel(): { flash(ctx: ModeContext, text: string, ms: number): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    flash(ctx, text, ms) {
      if (timer) clearTimeout(timer);
      ctx.setHud({ banner: text });
      timer = setTimeout(() => { timer = null; ctx.setHud({ banner: '' }); }, ms);
    },
    cancel() { if (timer) clearTimeout(timer); timer = null; },
  };
}

const cfg = { heroUrl: SHARED_CFG.heroUrl };

/** Meshes an event's venue kit added. Torn down with the event so the next stop does not inherit a floor, a hoop or a wall. */
function meshIds(scene: Scene): Set<number> {
  return new Set(scene.meshes.map((m) => m.uniqueId));
}
function bornSince(scene: Scene, before: Set<number>): AbstractMesh[] {
  return scene.meshes.filter((m) => !before.has(m.uniqueId));
}
function dropStage(meshes: readonly AbstractMesh[]): void {
  for (const m of meshes) if (!m.isDisposed()) m.dispose(false, true);
}

/**
 * Counter Strike's dojo floor is smaller than its walls, so the clear colour shows as a saw-tooth along the edge,
 * and the pale shoji reads as a blank board. A dark apron fills the gap; a painted banner stands in front of the
 * far wall. Any backboard still enabled from a previous stop gets its own material — the shared one is left alone.
 */
function dressCounterStrike(scene: Scene): void {
  const apron = MeshBuilder.CreateGround('carn_apron', { width: 28, height: 28 }, scene);
  apron.position.y = -0.02;
  const apronMat = new PBRMaterial('carn_apron_m', scene);
  apronMat.albedoColor = Color3.FromHexString('#3a2418');
  apronMat.emissiveColor = Color3.FromHexString('#3a2418').scale(0.08);
  apronMat.roughness = 0.82;
  apron.material = apronMat;
  apron.isPickable = false;

  const frame = MeshBuilder.CreatePlane('carn_banner', { width: 6.2, height: 1.6 }, scene);
  frame.position.set(0, 2.6, -9.58);
  const frameMat = new PBRMaterial('carn_banner_m', scene);
  frameMat.albedoColor = Color3.FromHexString('#3a2418');
  frameMat.emissiveColor = Color3.FromHexString('#3a2418').scale(0.05);
  frameMat.roughness = 0.7;
  frame.material = frameMat;
  frame.isPickable = false;

  const panel = MeshBuilder.CreatePlane('carn_banner_panel', { width: 5.4, height: 1.05 }, scene);
  panel.position.set(0, 2.6, -9.5);
  const panelMat = new PBRMaterial('carn_banner_panel_m', scene);
  panelMat.albedoColor = Color3.FromHexString('#c45c26');
  panelMat.emissiveColor = Color3.FromHexString('#e8a060').scale(0.25);
  panelMat.roughness = 0.55;
  panel.material = panelMat;
  panel.isPickable = false;

  const owned = new Set([apron.uniqueId, frame.uniqueId, panel.uniqueId]);
  for (const m of scene.meshes) {
    if (owned.has(m.uniqueId) || !m.isEnabled()) continue;
    const n = m.name.toLowerCase();
    if (n !== 'backboard' && !n.includes('backboard')) continue;
    const paint = new PBRMaterial(`carn_board_${m.uniqueId}`, scene);
    paint.albedoColor = Color3.FromHexString('#c45c26');
    paint.emissiveColor = Color3.FromHexString('#c45c26').scale(0.12);
    paint.roughness = 0.55;
    m.material = paint;
  }
}

// MOMENTUM (finish-release, 2026-09-24): the carnival reported nothing to the bus, so its crowd bed never swelled. Each
// event reports its success beat at the weight a like beat carries in the full modes; a failure reports nothing.
/** a mashed bag hit: every press lands here, so a third of a landed strike in the fight modes (9) */
const MOMENTUM_BAG_HIT = 3;
/** a landed trick (a sketchy one half); the TrickMachine's own combo reports ride on top, as on snow and surf */
const MOMENTUM_TRICK = 6;

// ── SLAM RUSH — as many dunks as you can charge-and-release in the clock ──
/** The charge a dunk wants (the top of the meter, short of full). */
export const SLAM_SWEET = 0.85;
/**
 * IMPROVE (2026-10-06): how far off the sweet spot a release may land and still go down. The make used to be a dice roll —
 * `random() < clamp(1.3 × (1 − |charge − 0.85|), 0.15, 0.95)` — so a perfect release missed one in twenty, a full hold
 * made 95 % too, and a quarter-charge flick still made nearly half: skill hardly moved the score. Now the release decides
 * it: 0.73–0.97 of the meter, which is 0.80–1.07 s into the 1.1 s ramp of a held key or the touch button (a quarter-second
 * window), and the HUD meter shows the band (it was a value nobody could see).
 */
export const SLAM_TOL = 0.12;
export function slamMade(charge: number): boolean { return Math.abs(charge - SLAM_SWEET) <= SLAM_TOL + 1e-9; }

export function slamRush(): CarnivalEvent {
  let player: SpawnedCharacter, ball: AbstractMesh, body: BeatOwner;
  let stage: AbstractMesh[] = [];
  let hudCtx: ModeContext | null = null;
  const banner = bannerChannel();
  /** the charge the HUD meter last showed (a trigger streams every frame; the meter moves in 2 % steps) */
  let shownCharge = -1;
  let charging = false, charge = 0, makes = 0, cooldown = 0;
  let gathered = false;   // this charge's gather has been thrown (it is held, not looped — see gather())
  const rim = new Vector3(0, 3.05, -0.6);
  /** HOTFIX (2026-09-24): THE GATHER IS ONE-WAY — the rip down into the loaded crouch the launch starts from (0.5 s). It was
   *  LOOPED through the whole charge, so the body snapped back up to standing and crouched again twice a second. It plays
   *  once and holds the load now. A launch still in flight is let finish (tick retries): the new charge follows it. */
  function gather(): void {
    if (gathered || body.busy) return;
    gathered = true;
    body.beat(SPORT_CLIP.dunkChargeGather, { fadeSec: 0.12, holdEnd: true });
  }
  /** The charge meter on the HUD (IMPROVE 2026-10-06); null hides it. */
  function showCharge(ctx: ModeContext, v: number | null): void {
    if (v === null) { if (shownCharge !== -1) { shownCharge = -1; ctx.setHud({ charge: null }); } return; }
    if (Math.abs(v - shownCharge) < 0.02 && v < 1) return;
    if (v === shownCharge) return;
    shownCharge = v;
    ctx.setHud({ charge: Math.round(v * 100) / 100 });
  }
  function whistle(ctx: ModeContext): void {
    makes = 0; charging = false; charge = 0; cooldown = 0; gathered = false;
    showCharge(ctx, null);
    ctx.heroRef.current = player.root;
    ctx.objectiveRef.current = rim;
    ctx.camDirector.setPreset('court');
    ctx.camDirector.snapTo(player.root.position, rim);
    // the meter's band: where a release goes down (the HUD draws it under the charge)
    ctx.setHud({ hint: 'HOLD CHARGE, release in the gold band for a make', chargeLo: SLAM_SWEET - SLAM_TOL, chargeHi: SLAM_SWEET + SLAM_TOL });
  }

  return {
    id: 'slam_rush', title: 'SLAM RUSH', durationSec: 20, pointsPerUnit: 12, rivalRange: [4, 9],
    verbs: { buttons: [], says: 'HOLD CHARGE — RELEASE AT THE TOP' },
    async build(ctx) {
      const before = meshIds(ctx.scene);
      VenueKit.buildCourt(ctx.scene, 'venice');
      stage = bornSince(ctx.scene, before);
      player = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: new Vector3(0, 0, 2.2), yawRad: Math.PI, startClip: SPORT_CLIP.idle });
      neverBindPose(player.animator, SPORT_CLIP.idle); installSafePlay(player.animator, 'carnival-slam');
      // HOOPS MOTION phase 3: the dunker is right-handed on screen like every hoops body — the dunk and hoops families mirrored onto
      // the other side of the body, the ball in the hand drawn on his right (the hotfix put it in rig RightHand: the left on screen)
      rightHandDunks(player.animator, player.skeleton); rightHandHoops(player.animator, player.skeleton);
      body = new BeatOwner(player.animator); body.loop(SPORT_CLIP.idle);
      ctx.groundLock?.track(player.root, player.skeleton);
      ball = MeshBuilder.CreateSphere('carn_ball', { diameter: 0.24 }, ctx.scene);
      // HOTFIX (2026-09-24), owner: no untextured models. The ball was a bare grey sphere left at centre court, half through
      // the floor. It is the hoops modes' ball now: the Meshy leather rides the sphere, and the sphere rides the dunker's hand.
      void dressBall(ball, 'basketball');
      rightHandBall(ball);
      attachBallToHand(ball, player.skeleton, hoopsHand(player));
      hudCtx = ctx; shownCharge = 0;   // forces the first hide through
      whistle(ctx);
    },
    reset(ctx) {
      banner.cancel();
      if (body.busy) body.settle();   // a held gather or a launch from P1's last second: P2 starts standing
      whistle(ctx);
    },
    onInput(ctx, e) {
      if (e.t === 'trigger' && e.side === 'R') {
        if (e.value > 0.02) { charging = true; charge = Math.max(charge, e.value); gather(); showCharge(ctx, charge); }   // a launch in flight settles into the new charge
        if (e.value === 0 && charging && cooldown <= 0) {
          charging = false; gathered = false;
          // IMPROVE (2026-10-06): the release decides the make (SLAM_TOL), not a dice roll weighted by it
          const made = slamMade(charge);
          body.beat(SPORT_CLIP.dunkLaunchPower, { fadeSec: 0.08 });   // out of the held load; it settles into the idle loop
          if (made) {
            makes++;
            SoundKit.play('score', { pitch: 1.1 }); EffectsKit.burst(ctx.scene, rim, 'net');
            ctx.momentum.report({ kind: 'big_make', weight: 7 });   // the shootout's make
            banner.flash(ctx, `MAKE ${makes}`, 400);
          } else { SoundKit.play('miss'); banner.flash(ctx, charge > SLAM_SWEET ? 'MISS — TOO LONG' : 'MISS — TOO SHORT', 400); }
          showCharge(ctx, null);
          charge = 0; cooldown = 0.5;
        } else if (e.value === 0 && charging) {
          // HOTFIX (2026-09-24): a release inside the cooldown was swallowed — `charging` stayed true, tick kept the load
          // held, and the dunker sat crouched until the NEXT full squeeze and release. That release is a dropped charge
          // now: nothing launches, and the body stands back up (only out of its own gather — a launch in flight plays out).
          charging = false; charge = 0;
          if (gathered && body.current === SPORT_CLIP.dunkChargeGather) body.settle();
          gathered = false;
          showCharge(ctx, null);
        }
      }
    },
    tick(_ctx, dt) { cooldown = Math.max(0, cooldown - dt); if (charging) gather(); return makes; },
    teardown() { banner.cancel(); if (hudCtx) showCharge(hudCtx, null); hudCtx = null; player?.dispose(); ball?.dispose(); dropStage(stage); },
  };
}

// ── STRIKE STORM — land as many strikes as you can on a training bag ──────
/**
 * IMPROVE (2026-10-06): the MIX. Every press was worth the same, so the event was mash rate and nothing else. Three strikes
 * in a row on three DIFFERENT buttons (GO, TRICK, POWER in any order: jab, kick, heavy) pay TRIO_BONUS extra hits; a repeat
 * button starts the trio again. A one-button masher scores exactly what it did; a varied combo earns a third more.
 */
const TRIO_BONUS = 1;
/** Fold one press into the trio: the buttons of the trio so far (≤ 2 after the call) and the bonus this press paid. Pure. */
export function strikeTrio(trio: readonly string[], btn: string): { trio: string[]; bonus: number } {
  const next = trio.includes(btn) ? [btn] : [...trio, btn];
  return next.length >= 3 ? { trio: [], bonus: TRIO_BONUS } : { trio: next, bonus: 0 };
}

export function strikeStorm(): CarnivalEvent {
  let player: SpawnedCharacter, bag: SpawnedCharacter, body: BeatOwner, bagBody: BeatOwner;
  let stage: AbstractMesh[] = [];
  let hits = 0, striking = false;
  let trio: string[] = [], mixes = 0;
  /** the dust burst's spot over the bag (one vector, not one per press) */
  const bagHit = new Vector3();
  function whistle(ctx: ModeContext): void {
    hits = 0; striking = false; trio = []; mixes = 0;
    ctx.heroRef.current = player.root;
    ctx.camDirector.setPreset('fight');
    ctx.camDirector.snapTo(player.root.position, bag.root.position);
    ctx.setHud({ hint: 'Mash GO / TRICK / POWER on the bag — mix all three for a bonus' });
  }

  return {
    id: 'strike_storm', title: 'STRIKE STORM', durationSec: 15, pointsPerUnit: 8, rivalRange: [10, 22],
    verbs: { buttons: ['A', 'B', 'Y'], says: 'MASH GO · TRICK · POWER' },
    async build(ctx) {
      const before = meshIds(ctx.scene);
      VenueKit.buildDojo(ctx.scene);
      stage = bornSince(ctx.scene, before);
      player = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: new Vector3(0, 0, 1.4), startClip: SPORT_CLIP.karateStance });
      neverBindPose(player.animator, SPORT_CLIP.karateStance); installSafePlay(player.animator, 'carnival-strike');
      ctx.groundLock?.track(player.root, player.skeleton);
      bag = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: new Vector3(0, 0, 0), tint: '#8b1e2d', startClip: SPORT_CLIP.karateStance });
      neverBindPose(bag.animator, SPORT_CLIP.karateStance); installSafePlay(bag.animator, 'carnival-bag');
      body = new BeatOwner(player.animator); body.loop(SPORT_CLIP.karateStance);
      bagBody = new BeatOwner(bag.animator); bagBody.loop(SPORT_CLIP.karateStance);
      whistle(ctx);
    },
    reset(ctx) { whistle(ctx); },
    onInput(ctx, e) {
      if (e.t === 'button' && e.pressed && !striking && (e.btn === 'A' || e.btn === 'B' || e.btn === 'Y')) {
        striking = true;
        const clip = e.btn === 'A' ? SPORT_CLIP.karateJab : e.btn === 'B' ? SPORT_CLIP.karateKick : SPORT_CLIP.karateHeavy;
        body.beat(clip, { fadeSec: 0.06, onSettle: () => { striking = false; } });   // the strike settles into the stance on its own
        hits++;
        const t = strikeTrio(trio, e.btn); trio = t.trio;
        if (t.bonus) { mixes += t.bonus; SoundKit.play('uiTick', { pitch: 1.5, volume: 0.35 }); }
        bagBody.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.05 });   // a mashed bag flinches again from the top
        SoundKit.play('impact', { pitch: 1.2, volume: 0.35 });
        EffectsKit.burst(ctx.scene, bagHit.copyFrom(bag.root.position).addInPlaceFromFloats(0, 1.1, 0), 'dust');
        ctx.momentum.report({ kind: 'clean_hit', weight: MOMENTUM_BAG_HIT });
        ctx.setHud({ banner: t.bonus ? `${hits + mixes} · MIX +${t.bonus}` : `${hits + mixes}` });
      }
    },
    tick() { return hits + mixes; },
    teardown() { player?.dispose(); bag?.dispose(); dropStage(stage); },
  };
}

// ── TRICK GAUNTLET — chain skate tricks for score, reusing boardCore as-is ─
export function trickGauntlet(): CarnivalEvent {
  let world: ReturnType<typeof buildSkatepark>, rig: BoardRig, tricks: TrickMachine, animTree: BoardAnimTree;
  let stickX = 0, pump = 0, airT = 0, landBeatT = 0, bailBeatT = 0;
  let lastLanding: 'clean' | 'sketchy' = 'clean';   // phase 6: which landing beat the tree plays
  const LAND_BEAT_SEC = 0.4, BAIL_BEAT_SEC = 0.8;   // board_land 0.42 s, skate_bail 0.75 s — the tree settles them when the window closes
  let callT = 0;
  const CALL_SEC = 0.9;   // the trick call's banner hold (snow and surf hold theirs as long)

  return {
    id: 'trick_gauntlet', title: 'TRICK GAUNTLET', durationSec: 20, pointsPerUnit: 0.4, rivalRange: [300, 900],
    verbs: { buttons: ['A', 'B', 'Y', 'X'], says: 'GO POPS · TRICK SPINS' },
    async build(ctx) {
      world = buildSkatepark(ctx.scene);
      rig = await buildRig(ctx, cfg.heroUrl, new Vector3(0, 0, -6), 0, world.ground, '#ffd75e');
      animTree = new BoardAnimTree(rig.char.animator);
      // The machine's HUD keys are namespaced here: its `score` is the raw trick total, and the carnival's `score` is P1's
      // night total (the host renders it), so a banked combo used to replace the night's points with a trick count.
      tricks = new TrickMachine(rig, (h) => ctx.setHud(Object.fromEntries(Object.entries(h).map(([k, v]) => [`trick${k[0].toUpperCase()}${k.slice(1)}`, v]))), {
        anim: 'external',   // the tree owns the rider's clips; the machine reports beats
        momentum: ctx.momentum,   // deep combos light the building, as on snow and surf
        onBeat: (b) => { if (b === 'land' || b === 'land_sketchy') { landBeatT = LAND_BEAT_SEC; lastLanding = b === 'land_sketchy' ? 'sketchy' : 'clean'; animTree.clearBeat('land_clean', 'land_sketchy'); } else { bailBeatT = BAIL_BEAT_SEC; animTree.clearBeat('bail'); } },
      });
      stickX = 0; pump = 0; airT = 0; landBeatT = 0; bailBeatT = 0; callT = 0;
      ctx.setHud({ hint: 'POP, flip in the air — stick sideways + TRICK spins — chain combos before you land' });
    },
    onInput(ctx, e) {
      if (e.t === 'stick' && e.side === 'L') stickX = e.x;
      if (e.t === 'trigger' && e.side === 'R') pump = e.value;
      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A' && rig.rider.grounded) rig.rider.jump(0.6);
        // The carnival deck's four-button budget maps X to CHARGE (RT hold), so the 360 on X was unreachable on touch and
        // the pad. Owner decision 2026-09-07: TRICK / POWER with the stick pushed sideways is the SPIN (FreeRun's
        // stick-picks-the-trick rule); X still spins for keyboard / gamepad players.
        if (e.btn === 'B' || e.btn === 'Y') {
          if (Math.abs(stickX) > 0.5) { tricks.start(TRICKS.spin); console.info('[CARN-TRICK] spin (stick)'); }
          else tricks.start(e.btn === 'B' ? TRICKS.flipA : TRICKS.flipB);
        }
        if (e.btn === 'X') tricks.start(TRICKS.spin);
      }
    },
    tick(ctx, dt) {
      rig.rider.update(dt, stickX, pump);
      const landedBefore = tricks.landed;
      const call = tricks.update(dt);   // grades the touchdown BEFORE the tree sees this frame (the skate ordering lesson)
      // The call (the trick and its points, SKETCHY, BANKED, REPEAT, BAILED) is this event's banner, as MAKE and COUNTER are
      // the others' (it was thrown away: the one event of six with no banner). Cleared on the event's own clock, not a timer:
      // a call in the last second would have wiped the result card's banner.
      if (call) { ctx.setHud({ banner: call }); callT = CALL_SEC; }
      else if (callT > 0) { callT -= dt; if (callT <= 0) ctx.setHud({ banner: '' }); }
      // a trick that paid (not a bail, not a repeat worth nothing) is heard in the stands
      if (tricks.landed > landedBefore) ctx.momentum.report({ kind: 'clean_hit', weight: lastLanding === 'sketchy' ? MOMENTUM_TRICK / 2 : MOMENTUM_TRICK });
      const grounded = rig.rider.grounded;
      airT = grounded ? 0 : airT + dt;
      animTree.update({
        speed01: Math.min(1, Math.hypot(rig.rider.vel.x, rig.rider.vel.z) / 8), pushing: false,
        lean: grounded ? stickX : 0,
        airborne: !grounded && (airT > 0.05 || rig.rider.vel.y > 0.5),
        grabHeld: tricks.grabHeld, flipping: tricks.flipping, spinning: tricks.spinning,
        grinding: false, manual: false,
        landing: landBeatT > 0 ? lastLanding : 'none', bailing: bailBeatT > 0,
        tucking: grounded && pump > 0.5,
      });
      if (landBeatT > 0) { landBeatT -= dt; if (landBeatT <= 0) animTree.clearBeat('land_clean', 'land_sketchy'); }
      if (bailBeatT > 0) { bailBeatT -= dt; if (bailBeatT <= 0) animTree.clearBeat('bail'); }
      rig.char.root.position.x = Math.max(-20, Math.min(20, rig.char.root.position.x));
      rig.char.root.position.z = Math.max(-20, Math.min(20, rig.char.root.position.z));
      ctx.camDirector.update(rig.char.root.position, rig.rider.vel, null);
      // The whistle's read is tick(ctx, 0), and a zero step never runs the link window down, so a combo still open on the
      // ground at the horn never banked and its points were lost. On the ground it is as good as banked (only a bail takes
      // a combo, and a bail happens in the air), so it counts; one still in the air at the horn is unresolved and does not.
      // (Only the whistle reads this value: the live loop ignores it.)
      return tricks.score + (rig.rider.grounded ? tricks.comboPts : 0);
    },
    teardown() { rig?.dispose(); world?.dispose(); },
  };
}

// ── HOT SHOT — quick-fire shots on goal, reusing aimSwingCore as-is ───────
/**
 * IMPROVE (2026-10-06): a KEEPER. Hot Shot was aim at an empty net. KeeperCore runs the penalty mode's human keeper — read
 * the kicker's lean, dive on the strike, resolveSave judges the ball at the line. Here it runs in reverse: the AI keeper
 * reads the SHOOTER's aim (the right side `read` of the time), its dive is good / late / none by the odds below, and the
 * same resolveSave judges the shot. A ball within 0.9 m of the middle is always saved (he stays up or dives through it),
 * a corner past 2.4 m never is: the aim is the skill again.
 */
export const HOT_SHOT_KEEPER = { read: 0.6, good: 0.3, late: 0.4 } as const;   // the rest of the time he stays on his line
export function hotShotKeeper(aimX: number, rnd: () => number = Math.random): { dive: DiveSign; timing: DiveTiming } {
  const t = rnd();
  const timing: DiveTiming = t < HOT_SHOT_KEEPER.good ? 'good' : t < HOT_SHOT_KEEPER.good + HOT_SHOT_KEEPER.late ? 'late' : 'none';
  if (timing === 'none') return { dive: 0, timing };
  const side: -1 | 1 = aimX >= 0 ? 1 : -1;
  return { dive: rnd() < HOT_SHOT_KEEPER.read ? side : (side === 1 ? -1 : 1), timing };
}

export function hotShot(): CarnivalEvent {
  let player: SpawnedCharacter, ball: AbstractMesh, reticle: Reticle, meter: PowerMeter, flight: Flight, body: BeatOwner;
  let keeper: SpawnedCharacter, keeperBody: BeatOwner;
  let stage: AbstractMesh[] = [];
  let goal: AbstractMesh[] = [];
  let goals = 0, phase: 'aim' | 'power' | 'flight' = 'aim', stickX = 0, stickY = 0;
  /** the keeper's call for the shot in the air, and the beat (event clock) his rise waits for */
  let call: { dive: DiveSign; timing: DiveTiming } = { dive: 0, timing: 'none' };
  let riseT = 0;
  /** IMPROVE (2026-10-06): the Meshy goal loads after build returns — set once the event is torn down, so a late load drops */
  let tornDown = false;
  const banner = bannerChannel();
  const goalCenter = new Vector3(0, 1.2, 11);
  const ballHome = new Vector3(0, 0.11, 0);
  /** The keeper faces −z, so world +x is his LEFT: the authored dive stretches to his right; a dive to +x is the mirror
   *  ('<clip>.M'), registered on his body (the penalty mode's convention). */
  const sided = (clip: string, sign: DiveSign): string => (sign > 0 ? `${clip}.M` : clip);

  /** The shot is decided (at the line, or short of it): score it, put the ball back, and get the keeper up. */
  function decide(ctx: ModeContext, at: 'line' | 'short'): void {
    flight.active = false;
    const onTarget = at === 'line' && Math.abs(ball.position.x) < 3.6 && ball.position.y < 2.4;
    const saved = onTarget && resolveSave(call.dive, call.timing, ball.position.x, ball.position.y).saved;
    if (onTarget && !saved) { goals++; SoundKit.play('score'); EffectsKit.burst(ctx.scene, goalCenter, 'confetti'); ctx.momentum.report({ kind: 'big_make', weight: 8 }); }
    else if (saved) { SoundKit.play('impact', { pitch: 0.9, volume: 0.45 }); banner.flash(ctx, 'SAVED!', 500); }
    else { SoundKit.play('miss'); if (at === 'short') banner.flash(ctx, 'SHORT — MORE POWER', 500); }
    ball.position.copyFrom(ballHome);
    phase = 'aim';
    if (call.dive !== 0) riseT = 0.5;
  }
  function whistle(ctx: ModeContext): void {
    goals = 0; phase = 'aim'; stickX = 0; stickY = 0; riseT = 0; call = { dive: 0, timing: 'none' };
    ctx.heroRef.current = player.root;
    ctx.camDirector.setFixedBehind(player.root.position, 0, 'flight', true);   // hard cut between events: a lerp from the last event's camera left the hero behind it (measured, 3 frame-guard hits);
    ctx.setHud({ hint: 'Aim for the corners, GO to power, GO to shoot — beat the keeper' });
  }

  return {
    id: 'hot_shot', title: 'HOT SHOT', durationSec: 15, pointsPerUnit: 15, rivalRange: [3, 7],
    verbs: { buttons: ['A'], says: 'GO — POWER, THEN SHOOT' },
    async build(ctx) {
      tornDown = false;
      const before = meshIds(ctx.scene);
      VenueKit.buildField(ctx.scene, 'pitch');
      goal = buildGoal(ctx.scene, () => !tornDown);
      stage = bornSince(ctx.scene, before);
      player = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: new Vector3(0, 0, 0), startClip: SPORT_CLIP.penaltyIdle });
      neverBindPose(player.animator, SPORT_CLIP.penaltyIdle); installSafePlay(player.animator, 'carnival-hotshot');
      body = new BeatOwner(player.animator); body.loop(SPORT_CLIP.penaltyIdle);
      keeper = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: new Vector3(0, 0, 10.4), yawRad: Math.PI, tint: '#1f8b4c', startClip: SPORT_CLIP.keeperIdle });
      neverBindPose(keeper.animator, SPORT_CLIP.keeperIdle); installSafePlay(keeper.animator, 'carnival-keeper');
      registerMirroredClips(keeper.animator, ctx.scene, keeper.skeleton, [SPORT_CLIP.keeperDive, SPORT_CLIP.keeperDiveHold, SPORT_CLIP.keeperRise]);
      ctx.groundLock?.track(keeper.root, keeper.skeleton);
      keeperBody = new BeatOwner(keeper.animator); keeperBody.loop(SPORT_CLIP.keeperIdle);
      ball = MeshBuilder.CreateSphere('carn_sball', { diameter: 0.22 }, ctx.scene);
      ball.position.copyFrom(ballHome);
      flight = new Flight(ball, -9.8);
      reticle = new Reticle(ctx.scene, goalCenter, { x: 3.3, y: 1.05 });
      meter = new PowerMeter();
      whistle(ctx);
    },
    reset(ctx) {
      banner.cancel();
      flight.active = false; meter.stop();
      ball.position.copyFrom(ballHome);
      reticle.pos.copyFrom(goalCenter); reticle.update(0, 0, 0);
      body.loop(SPORT_CLIP.penaltyIdle);
      if (keeperBody.busy) keeperBody.settle();
      keeperBody.loop(SPORT_CLIP.keeperIdle);
      whistle(ctx);
    },
    onInput(ctx, e) {
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'button' && e.btn === 'A' && e.pressed) {
        if (phase === 'aim') { phase = 'power'; meter.start(); }
        else if (phase === 'power') {
          const p = meter.stop(); phase = 'flight';
          body.beat(SPORT_CLIP.penaltyStrike, { fadeSec: 0.08 });
          const to = reticle.pos.subtract(ball.position).normalize();
          flight.launch(ball.position, to.scale(13 + p * 7).add(new Vector3(0, 0, 0)));
          // the keeper reads the aim and goes (or stays): the dive is on the strike, the save is judged at the line
          call = hotShotKeeper(reticle.pos.x);
          riseT = 0;
          if (call.dive !== 0) {
            keeperBody.beat(sided(SPORT_CLIP.keeperDive, call.dive), { fadeSec: 0.08 });
            keeperBody.loop(sided(SPORT_CLIP.keeperDiveHold, call.dive), { fadeSec: 0.2 });
          }
        }
      }
    },
    tick(ctx, dt) {
      meter.update(dt);
      if (phase === 'aim') reticle.update(dt, stickX, stickY);
      if (riseT > 0) {
        riseT -= dt;
        if (riseT <= 0) { keeperBody.beat(sided(SPORT_CLIP.keeperRise, call.dive), { fadeSec: 0.12 }); keeperBody.loop(SPORT_CLIP.keeperIdle, { fadeSec: 0.25 }); }
      }
      if (phase === 'flight') {
        const flying = flight.step(dt);
        if (ball.position.z >= 10.9) {
          decide(ctx, 'line');
        } else if (!flying) {
          // IMPROVE (2026-10-06): a ball that stops short of the line is a miss. Only z ≥ 10.9 ended a shot, so a low-power
          // shot that died on the grass left the phase in 'flight' and nothing could be shot for the rest of the clock.
          decide(ctx, 'short');
        }
      }
      return goals;
    },
    teardown() { tornDown = true; banner.cancel(); player?.dispose(); keeper?.dispose(); ball?.dispose(); reticle?.dispose(); goal.forEach((g) => g.dispose()); dropStage(stage); },
  };
}

// ── COIN STORM — clear the pattern, a fresh one drops, keep sprinting ─────
export function coinStorm(): CarnivalEvent {
  let player: SpawnedCharacter, body: BeatOwner;
  let stage: AbstractMesh[] = [];
  let coins: CoinField | null = null;
  let collected = 0, wave = 0, moving = false;
  let stickX = 0, stickY = 0;
  /** IMPROVE (2026-10-06): the whistle spot, 5 m short of the first cross's centre. Both diagonals pass through the origin —
   *  a coin and its twin sat exactly where the runner stood, so two coins were handed out at the whistle. From here the
   *  nearest coin is 3.5 m off (the magnet reaches 1.1): the first coin is run for. */
  const SPAWN = new Vector3(0, 0, -5);

  function layPattern(ctx: ModeContext): void {
    // IMPROVE (2026-10-06): ONE field, emptied per wave. Disposing it and building a new one rebuilt the master mesh, its
    // PBR material and its instance buffer every time a pattern was cleared.
    if (coins) coins.clear(); else coins = new CoinField(ctx.scene);
    wave++;
    // alternate a diagonal cross with a ring — always a readable route
    if (wave % 2 === 1) {
      coins.line(new Vector3(-8, 0.4, -8), new Vector3(8, 0.4, 8), 7);
      coins.line(new Vector3(8, 0.4, -8), new Vector3(-8, 0.4, 8), 7);
    } else {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        coins.line(new Vector3(Math.sin(a) * 7, 0.4, Math.cos(a) * 7), new Vector3(Math.sin(a) * 7, 0.4, Math.cos(a) * 7), 1);
      }
    }
  }

  function whistle(ctx: ModeContext): void {
    collected = 0; wave = 0; moving = false; stickX = 0; stickY = 0;
    player.root.position.copyFrom(SPAWN); player.root.rotation.y = 0;
    body.loop(SPORT_CLIP.idle);
    layPattern(ctx);
    ctx.heroRef.current = player.root;
    ctx.camDirector.setPreset('runner');
    ctx.camDirector.snapTo(player.root.position, player.root.position.add(new Vector3(0, 0, 6)));
    ctx.setHud({ hint: 'Sprint the pattern — clear it and a fresh one drops' });
  }

  return {
    id: 'coin_storm', title: 'COIN STORM', durationSec: 15, pointsPerUnit: 6, rivalRange: [8, 16],
    verbs: { buttons: [], says: 'RUN IT WITH THE STICK' },
    async build(ctx) {
      // THE SEAM (SCORECARD VISUALS, 2026-09-15): the event lays its own court over the carnival hub's lawn and both
      // sit at y 0, so the boundary z-fought — the rc20 late frame is a sawtooth of grass and asphalt chewing along the
      // court's edge. The court is the thing that arrived second, so it is the thing that steps up; a centimetre is
      // daylight to the depth buffer and nothing to a runner.
      const before = meshIds(ctx.scene);
      const groundsBefore = new Set(ctx.scene.meshes.filter((m) => m.name === 'venue_ground'));
      VenueKit.buildCourt(ctx.scene, 'street');
      stage = bornSince(ctx.scene, before);
      for (const g of ctx.scene.meshes) if (g.name === 'venue_ground' && !groundsBefore.has(g)) g.position.y += 0.012;
      player = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: SPAWN.clone(), startClip: SPORT_CLIP.idle });
      neverBindPose(player.animator, SPORT_CLIP.idle); installSafePlay(player.animator, 'carnival-coins');
      body = new BeatOwner(player.animator); body.loop(SPORT_CLIP.idle);
      ctx.groundLock?.track(player.root, player.skeleton);
      whistle(ctx);
    },
    reset(ctx) { whistle(ctx); },
    onInput(_ctx, e) {
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
    },
    tick(ctx, dt) {
      // MODE-STICK-FACE (2026-09-07): camera-relative — the runner camera follows the velocity, so a world-axis stick
      // drifted off screen-right as soon as the camera swung; up = the camera's flat forward, right = screen right.
      const vel = ctx.camDirector.stickWorldLatched(stickX, stickY).scaleInPlace(6);   // latched: the runner camera follows the velocity
      player.root.position.addInPlace(vel.scale(dt));
      player.root.position.x = Math.max(-11, Math.min(11, player.root.position.x));
      player.root.position.z = Math.max(-11, Math.min(11, player.root.position.z));
      if (vel.lengthSquared() > 0.2) player.root.rotation.y = Math.atan2(vel.x, vel.z);
      moving = vel.length() > (moving ? 0.5 : 0.9);   // hysteresis: a thumb on the dead-zone edge used to restart the run / idle crossfade every frame
      body.loop(moving ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { fadeSec: 0.15 });
      const gained = coins?.update(dt, player.root.position) ?? 0;
      if (gained > 0) {
        collected += gained;
        SoundKit.play('uiTick', { pitch: 1.4 });
        if ((coins?.collected ?? 0) >= (wave % 2 === 1 ? 14 : 10)) {
          SoundKit.play('powerUp', { pitch: 1.2, volume: 0.4 });
          ctx.momentum.report({ kind: 'clean_run', weight: 10 });   // the cleared pattern, not every coin in it
          layPattern(ctx);
        }
      }
      ctx.camDirector.update(player.root.position, vel, null);
      return collected;
    },
    teardown() { player?.dispose(); coins?.dispose(); coins = null; dropStage(stage); },
  };
}

// ── COUNTER STRIKE — pure parry timing: read the wind-up, GUARD the window ─
export function counterStrike(): CarnivalEvent {
  let player: SpawnedCharacter, rival: SpawnedCharacter, body: BeatOwner, rivalBody: BeatOwner;
  let stage: AbstractMesh[] = [];
  let parries = 0;
  let state: 'idle' | 'telegraph' | 'cooldown' = 'idle';
  let stateSec = 0, parried = false;
  /** IMPROVE (2026-10-06): ONE press per wind-up. A TOO EARLY press never set `parried`, so mashing GO through the wind-up
   *  always landed a press inside 0.35–0.65 s and every wind-up was countered. The first press is the answer now. */
  let answered = false;
  const banner = bannerChannel();
  const TELEGRAPH_SEC = 0.5;
  const WINDOW = { open: 0.35, close: 0.65 };   // seconds after the wind-up starts
  function whistle(ctx: ModeContext): void {
    parries = 0; state = 'idle'; stateSec = 0; parried = false; answered = false;
    ctx.heroRef.current = player.root;
    ctx.camDirector.setPreset('fight');
    ctx.camDirector.snapTo(player.root.position, rival.root.position);
    ctx.setHud({ hint: 'Watch the wind-up — ONE tap of GO at the last instant to counter' });
  }

  return {
    id: 'counter_strike', title: 'COUNTER STRIKE', durationSec: 15, pointsPerUnit: 14, rivalRange: [4, 8],
    verbs: { buttons: ['A'], says: 'GO — ON THE WIND-UP' },
    async build(ctx) {
      const before = meshIds(ctx.scene);
      VenueKit.buildDojo(ctx.scene);
      dressCounterStrike(ctx.scene);
      stage = bornSince(ctx.scene, before);
      player = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: new Vector3(0, 0, 1.2), startClip: SPORT_CLIP.karateStance });
      neverBindPose(player.animator, SPORT_CLIP.karateStance); installSafePlay(player.animator, 'carnival-counter');
      ctx.groundLock?.track(player.root, player.skeleton);
      rival = await CharacterLibrary.spawn(ctx.scene, cfg.heroUrl, { position: new Vector3(0, 0, -0.8), tint: '#6b1e8b', startClip: SPORT_CLIP.karateStance });
      neverBindPose(rival.animator, SPORT_CLIP.karateStance); installSafePlay(rival.animator, 'carnival-counter-rival');
      ctx.groundLock?.track(rival.root, rival.skeleton);
      body = new BeatOwner(player.animator); body.loop(SPORT_CLIP.karateStance);
      rivalBody = new BeatOwner(rival.animator); rivalBody.loop(SPORT_CLIP.karateStance);
      whistle(ctx);
    },
    reset(ctx) {
      banner.cancel();
      body.loop(SPORT_CLIP.karateStance); rivalBody.loop(SPORT_CLIP.karateStance);
      whistle(ctx);
    },
    onInput(ctx, e) {
      // NOTE: was gated on btn 'X', which the carnival deck's 4-button budget
      // (CHARGE/GO/TRICK/POWER → RT/A/B/Y) never maps — the parry window was
      // unwinnable on every real control scheme. GO (A) is the deck's shared
      // primary-action verb, so it's the correct rebind, not TRICK/POWER.
      if (e.t === 'button' && e.btn === 'A' && e.pressed && state === 'telegraph' && !answered) {
        answered = true;   // early or on time, this wind-up has had its answer
        if (stateSec >= WINDOW.open && stateSec <= WINDOW.close) {
          parried = true;
          parries++;
          SoundKit.play('impact', { pitch: 1.6, volume: 0.5 });
          ctx.momentum.report({ kind: 'near_miss', weight: 10 });   // the fight modes' parry
          EffectsKit.burst(ctx.scene, rival.root.position.add(new Vector3(0, 1.2, 0)), 'sparks');
          body.beat(SPORT_CLIP.karateJab, { fadeSec: 0.06 });
          rivalBody.loop(SPORT_CLIP.karateStance); rivalBody.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.05 });   // countered out of the wind-up: he reels, the punch never comes
          banner.flash(ctx, `COUNTER ${parries}!`, 450);
        } else {
          SoundKit.play('miss', { volume: 0.3 });
          banner.flash(ctx, 'TOO EARLY', 400);
        }
      }
    },
    tick(ctx, dt) {
      stateSec += dt;
      if (state === 'idle' && stateSec > 0.4 + Math.random() * 0.5) {
        state = 'telegraph'; stateSec = 0; parried = false; answered = false;
        rivalBody.loop(SPORT_CLIP.karateWindup, { fadeSec: 0.12 });   // readable wind-up: the rear fist chambered, weight back (was the dunk charge crouch)
        SoundKit.play('whoosh', { pitch: 0.7, volume: 0.3 });
      } else if (state === 'telegraph' && stateSec >= TELEGRAPH_SEC + 0.15) {
        rivalBody.loop(SPORT_CLIP.karateStance);
        if (!parried) {
          rivalBody.beat(SPORT_CLIP.karateJab, { fadeSec: 0.06 });   // a countered rival is already reeling — only an unanswered wind-up throws
          SoundKit.play('impact', { pitch: 0.8, volume: 0.4 });
          body.beat(SPORT_CLIP.karateHitReact, { fadeSec: 0.05 });
          banner.flash(ctx, 'HIT!', 400);
        }
        state = 'cooldown'; stateSec = 0;
      } else if (state === 'cooldown' && stateSec > 0.6) {
        state = 'idle'; stateSec = 0;
      }
      return parries;
    },
    teardown() { banner.cancel(); player?.dispose(); rival?.dispose(); dropStage(stage); },
  };
}

/** The full pool — CourtCarnivalMode draws a random 4 per session. */
export function allCarnivalEvents(): CarnivalEvent[] {
  return [slamRush(), strikeStorm(), trickGauntlet(), hotShot(), coinStorm(), counterStrike()];
}
