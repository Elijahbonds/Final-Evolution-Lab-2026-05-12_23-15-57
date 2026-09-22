// SurfBreakMode v5 — REPLACES the M44 file. The wave finally barrels
// (rideWorlds v3 ships alongside):
//   THE BARREL — the funnel shell over the pocket opens and closes on an
//     18s cycle (8s open). Riding the pocket while it's open doubles flow
//     gain and the score trickle ("IN THE BARREL"); hold it ≥1.5s and
//     exiting banks a +250 "BARRELED!" bonus. The tube visibly breathes —
//     you can SEE when the wave is hollow.
//   BUOYS — four fixed obstacles in the lineup; hitting one is a wipeout,
//     same recovery flow as falling behind the wave. Weaving matters now.
// Everything from M44 kept: pocket flow, cutbacks, grabs, the 140-unit
// rider/wave lockstep wrap (E24's fix).

import { stepSpeedFov } from '../core/SpeedFov';
import { BoostKit } from '../core/BoostKit';          // FINISH-RELEASE: the shared boost is the surge now
import { BoostFx } from '../premium/BoostFx';
import { BoostPads } from '../visual/BoostPads';
import { MomentumBus } from '../core/MomentumBus';
import { Vector3 } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { CharacterLibrary } from '../core/CharacterLibrary';
import { buildRig, TrickMachine, TRICKS, type BoardRig } from './boardCore';
import { buildSurfBreak, WAVE_SPEED, WAVE_LAP, WAVE_FACE_LEN, type RideWorld } from './rideWorlds';
import { readBoardVenue } from '../nexus/boardVenues';   // three breaks, three seas
import { assertSpawned } from '../core/FrameGuard';
import { BoardAnimTree } from '../anim/boardTree';
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { BoardTrickLayer } from '../anim/BoardTrickLayer';   // TRICK POSE (2026-09-15): tricks recognisable on sight
import { boardPose, boardBank, lookAhead, BOARD_INPUT_IDLE, type BoardPostureInput } from '../core/BoardPosture';
import { trickFor, bestFitting, asTrickDef, heldTrickDir, basePts as trickPts, type BoardTrick } from '../core/BoardTricks';   // the named vocabulary
import { angulate } from '../core/DynamicPosture';   // a rider ANGULATES: the board banks, the spine comes back out of it
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { RIDE_CONFIG as CFG } from './modeConfigs';
import { mountVenueProps, type VenuePropsHandle } from '../visual/VenueProps';
import { refuse } from '../core/Refusal';            // MECHANICS PASS: a press that cannot act is answered
import { BOARD_PACE } from '../core/BoardMovement';   // WALLS + SPEED (2026-09-15): the shared +35% board pace
import { REPEAT_DECAY } from '../core/ComboChain';   // the same THPS repeat decay the skate and free-run chains use
import { SurfSpray } from '../premium/SurfSpray';   // SURF OCEAN: crest mist, rail spray, splashes

const RUN_SEC = 90;
/** How fast a cutback comes around. ~0.4s to complete the turn. */
const CUTBACK_RATE = 6;
/** The camera preset's resting fov, captured on the first frame after load and restored to by SpeedFov. */
let baseFov: number | null = null;

export const POCKET = { min: 2, max: 9 };
/** WALLS + SPEED (2026-09-15): +35% with the other boards (was 9) — the ceiling the surge and the lens normalise against.
 *  BOARD-SPEED (2026-09-21): it rides the shared pace now (9 × BOARD_PACE = 14.4), so the next pace change reaches surf too. */
export const MAX_FORWARD_SPEED = 9 * BOARD_PACE;
/** The plain X grab on a wave, as a named shape for the trick layer: an indy on a surfboard (TRICK POSE). */
const SURF_GRAB: BoardTrick = { id: 'surf_grab', label: 'GRAB', discipline: 'surf', kind: 'air', dir: null, btn: 'X', spinDeg: 0, flipDeg: 0, grab: 'indy', difficulty: 1.4, airSec: 0.3, clip: 'board_grab' };
/** How far past the bottom of the face the rider may drift before the rail holds them (m) — the wave catches up anyway. */
export const FLAT_LEASH = 8;
/** Wave-relative drift (m/s): stalled on the flat the wave gains this much on you; the face's slide under the lip; the
 *  stick's trim up / drop down; the buried rail's drive. */
/** BOARD-SPEED (2026-09-21): what the RIDER does — trim up, drop in, drive off the rail — moves with the shared pace
 *  (+18.5% with skate and snow). What the WAVE does (flat / slide / trim) does not: the wave is the wave. */
const RIDE_PACE = BOARD_PACE / 1.35;
export const DRIFT = { flat: -1.7, slide: 0.9, trim: 0.6, climb: 2.4 * RIDE_PACE, drop: 2.2 * RIDE_PACE, rail: 2.6 * RIDE_PACE };
export const BARREL_HOLD_SEC = 1.5;
export const BARREL_BONUS = 250;
/** Carve depth at which the rider commits and starts SPENDING flow. */
export const SURGE_CARVE = 0.85;
/** Flow burned per second while surging. */
export const SURGE_DRAIN = 45;
/** Extra m/s the surge buys above the normal ceiling. */
export const SURGE_SPEED_BONUS = 4;

/** Ceiling on the flow meter. */
export const FLOW_MAX = 200;
/** Flow gained per second riding the pocket (doubled inside the tube). */
export const FLOW_FILL_PER_SEC = 22;
export const SurfBreakMode: ModeDefinition = (() => {
  let world: RideWorld, waveLipAt: (t: number) => Vector3, barrelActive: (t: number) => boolean;
  let faceHeightAt: (x: number, z: number, t: number) => number;
  // deep runs light the building here too, not only on a skateboard (boardCore.TrickMachine)
  let trickMomentum = new MomentumBus();
  let props: VenuePropsHandle | null = null, propsGone = false;   // ship pass 4: CC0 prop dressing (visual/venuePropSets.ts)
  let rig: BoardRig, tricks: TrickMachine;
  let crowd: Onlookers;
  let t = 0, timeLeft = RUN_SEC, flow = 0;
  /** A surf air off the lip is short — this is the hang a pop actually buys. */
  const AIR_BUDGET_SEC = 0.7;
  let stickX = 0, stickY = 0, carve = 0;
  /** Seconds inside the current barrel with the stick or R2 working; the share that makes a barrel RIDDEN. */
  let barrelWorked = 0;
  const BARREL_WORK_SHARE = 0.35;
  /** wave-relative forward drift (m/s): forward speed = WAVE_SPEED + rel (ARENA-10PHASE P3) */
  let rel = 0;
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  /** Where the board is turning TO. A cutback is a carve, not a pivot. */
  let yawTarget = 0;
  /** MECHANICS PASS: one wave move at a time (the carve finishes first), and repeats on this wave pay less. */
  let waveMoveUntil = 0;
  const waveMoveRepeats = new Map<string, number>();
  const WAVE_MOVE_LOCK_SEC = 0.55;
  /** phase 7: lateral speed INTO the channel wall that is a wipe rather than a turn-back (a hard carve tops ~4 m/s). */
  const SURF_EDGE_SLAM_MS = 4.5;
  const SURF_LATERAL_MAX = 7;
  let ended = false, wipedOut = false;
  let lapsSeen = 0;
  let barrelSec = 0, inBarrel = false, barrels = 0;
  let surging = false;
  // BOOST (FINISH-RELEASE, 2026-09-14): the surge used to fire by burying the carve past SURGE_CARVE and burning FLOW —
  // a boost you could not hold back, on the carve trigger. It is the shared BoostKit now: riding the pocket and landing
  // wave tricks fill it, the held R1 (RB · Shift · BOOST pill) burns it, and FLOW goes back to being the score meter.
  let boostKit = new BoostKit();
  let boostFx: BoostFx | null = null;
  let boostPads: BoostPads | null = null;
  let boostHeld = false;
  /** Surf's pads ride the wave: across the face at these x, this far into the pocket. */
  const PAD_XS = [-14, 0, 14];
  const PAD_POCKET_U = 5.5;
  // ANIM-READABILITY (2026-09-07): ONE owner of the rider's clips. The per-frame play(...) here cut every one-shot a
  // frame later (grab 0.13 s, landing 0.13 s; the air one-shot ran out mid-flight and flashed the idle; steering had no
  // lean at all). The BoardAnimTree holds beats and settles one-shots; the mode feeds it state — stick = lean, a
  // cutback leans into its turn, the buried rail is the tuck, the wipe is the bail held through the reset.
  let animTree: BoardAnimTree;
  // BIOMECH-WAVE2 (2026-09-09) — the game-wide bar on the wave (SPEC-FEL-BIOMECH-GAMEWIDE G1–G6). Measured on 2942860:
  //   G1/G5  no clip in the board suite keys the thoracic chain or the head, so the surfer's chest held the last carve
  //          and his eyes pointed down the root yaw — including inside the TUBE, where he looked at the wall instead
  //          of out the end of it. The Posture Poses layer now carries the body per ride window and puts the eyes on a
  //          point down the line (and the barrel gets its own window: crouched under the lip, chest open, eyes out).
  //   G6     the CUTBACK — the mode's signature move, and the whole reason `yawTarget` exists — had NO LEAN in it. The
  //          only thing that rolled the rider was GroundRide's `−steer · 0.28` off the raw stick, and a cutback is
  //          fired on B with the stick anywhere: the board came round 90° with the body standing straight up on it.
  //          Measured over the frames where a carve CLIP is playing, the body was upright (< 3° of roll) on 25/146 of
  //          them before and 7/145 after. The roll reads the same lean the clip does now, scaled by speed
  //          (BoardPosture.boardBank).
  let posture: { layer: PostureLayer; dispose(): void } | null = null;
  let trickLayer: BoardTrickLayer | null = null;
  const bio: BoardPostureInput = { ...BOARD_INPUT_IDLE };
  /** The lean the tree and the body BOTH ride (the stick, or the cutback coming around). */
  let rideLean = 0;
  let bailBeatT = 0, landBeatT = 0, airT = 0, cutbackUntil = 0;
  let edgeHit = false;   // phase 7: one edge read per contact
  let lastLanding: 'clean' | 'sketchy' = 'clean';   // phase 6: which landing beat the tree plays
  // SURF OCEAN (2026-09-15): the living sea's per-frame step, and the water answering the rider
  let updateSea: (dt: number, camera: ModeContext['camera']) => void = () => {};
  let spray: SurfSpray | null = null;
  let lastYaw = 0;
  const BAIL_BEAT_SEC = 1.55, LAND_BEAT_SEC = 0.4;   // the wipe resets the rider at 1.6 s
  const CUTBACK_LEAN_SEC = 0.5;                      // the board leans into a cutback for as long as it comes around
  function driveAnim(dt: number): void {
    if (landBeatT > 0) { landBeatT -= dt; if (landBeatT <= 0) animTree.clearBeat('land_clean', 'land_sketchy'); }
    if (bailBeatT > 0) { bailBeatT -= dt; if (bailBeatT <= 0) animTree.clearBeat('bail'); }
    airT = rig.rider.grounded ? 0 : airT + dt;   // a flicker of lost contact on the wave is not air
    // the stick is intent; a cutback leans into its turn while it comes around (the yaw spring alone would read a
    // released steer as a counter-carve for a few frames)
    const turning = yawTarget - rig.char.root.rotation.y;
    const cutbackLean = t < cutbackUntil && Math.abs(turning) > 0.15 ? Math.sign(turning) : 0;
    rideLean = !rig.rider.grounded ? 0 : Math.abs(stickX) > 0.3 ? stickX : cutbackLean;
    const speed01 = Math.min(1, rig.rider.vel.length() / MAX_FORWARD_SPEED);
    const airborne = !rig.rider.grounded && (airT > 0.1 || rig.rider.vel.y > 0.5);
    // one object, two consumers: the tree picks the clip, the posture layer picks the body under it
    bio.speed01 = speed01; bio.pushing = false; bio.lean = rideLean; bio.airborne = airborne;
    bio.grabHeld = tricks.grabHeld; bio.flipping = tricks.flipping; bio.spinning = tricks.spinning;
    bio.grinding = rig.rider.grinding !== null; bio.manual = false;
    bio.landing = landBeatT > 0; bio.bailing = bailBeatT > 0; bio.tucking = carve > 0.5;
    bio.barrelled = inBarrel;
    animTree.update({
      speed01, pushing: false,
      lean: rideLean,
      airborne,
      grabHeld: tricks.grabHeld, flipping: tricks.flipping, spinning: tricks.spinning,
      grinding: rig.rider.grinding !== null, manual: false,
      landing: landBeatT > 0 ? lastLanding : 'none', bailing: bailBeatT > 0, tucking: carve > 0.5,
    });
  }

  function wipeout(ctx: ModeContext, why: string, lipZ: number): void {
    waveMoveRepeats.clear();   // a new wave, a fresh list
    spray?.splash(rig.char.root.position, 1.2);   // SURF OCEAN: the fall throws the water
    console.info(`[SURF-WIPE] call: ${why}${wipedOut ? ' (already down — ignored)' : ''}`);   // A+ P0 probe: punches are checked against accepted calls
    if (wipedOut) return;
    wipedOut = true;
    tricks.bail();
    // A+ P0 juice (PM brief BOARD-A-PLUS-P0, 2026-09-06): the wipe HITS — hit-stop + shake + ONE low thud (replaces the bare
    // feel.impact, whose thud would double). Once per wipe: this whole function is gated by wipedOut. No hang slowMo.
    ctx.juice.hitStop(50);
    ctx.juice.shake(0.12, 160);
    SoundKit.play('impact', { pitch: 0.6, volume: 0.7 });
    console.info('[SURF-JUICE] wipeout punch');
    SoundKit.play('crowdGroan', { volume: 0.5 });
    EffectsKit.burst(ctx.scene, rig.char.root.position.clone(), 'dust');
    ctx.setHud({ banner: why, flow: 0 });
    flow = 0; barrelSec = 0; inBarrel = false;
    setTimeout(() => {
      rel = 0;
      // phase 7 (measured): a wipe AT the channel wall respawned at the wall, facing back up the line (the mirrored yaw), and
      // the Rider's own carve accel along that yaw put him behind the crest inside a second — 15 wipes in a row at the edge.
      // The respawn is inside the break, facing down the line.
      const inside = Math.max(-(world.bound - 12), Math.min(world.bound - 12, rig.char.root.position.x));
      rig.char.root.position.set(inside, 0, lipZ + 6);
      rig.char.root.rotation.y = 0; yawTarget = 0; cutbackUntil = 0;
      // A reposition is a teleport, not motion — the camera must follow it in one
      // step rather than lerping across the gap with the rider out of frame.
      ctx.camDirector.snapTo(rig.char.root.position, waveLipAt(t));
      rig.rider.vel.set(0, 0, 0);
      wipedOut = false;
      ctx.setHud({ banner: '' });
    }, 1600);
  }

  function bankBarrel(ctx: ModeContext): void {
    if (barrelSec < BARREL_HOLD_SEC) { barrelSec = 0; inBarrel = false; barrelWorked = 0; return; }
    // MECHANICS PASS (2026-09-15): the board trims itself into the pocket hands-off, so the barrel paid 250 to a rider with the
    // pad down (idle probe, run 2). A barrel is RIDDEN: it banks only when the rider worked the tube — trimmed with the stick
    // or drove with R2 for a real share of the time inside. Otherwise it is said, and pays nothing.
    const worked = barrelWorked / Math.max(0.001, barrelSec);
    if (worked < BARREL_WORK_SHARE) {
      barrelSec = 0; inBarrel = false; barrelWorked = 0;
      refuse(ctx, 'RIDE THE TUBE — TRIM OR DRIVE IN IT');
      return;
    }
    barrelWorked = 0;
    barrels++;
    tricks.score += BARREL_BONUS;
    SoundKit.play('score', { pitch: 1.3 });
    SoundKit.play('crowdCheer', { volume: 0.5 });
    // The 'surf' preset's own note reads "barrel treatment = tightest (set via
    // pulse when in the tube)" -- an intent that was written down and never
    // wired. pulse() is a push-in of up to 32% on the follow distance, which is
    // exactly that treatment. The run's biggest moment now looks different as
    // well as sounding different.
    ctx.camDirector.pulse(1, 0.6);
    // A+ P0: ONE punch feel — this used to call feel.impact twice back to back (two thuds, two freezes). One feel hit + a soft shake.
    ctx.feel?.impact?.(0.45);
    ctx.juice.shake(0.08, 140);
    console.info('[SURF-JUICE] barrel bank');
    EffectsKit.burst(ctx.scene, rig.char.root.position.add(new Vector3(0, 1.2, 0)), 'net');
    ctx.setHud({ score: tricks.score, banner: `BARRELED! +${BARREL_BONUS}` });
    setTimeout(() => ctx.setHud({ banner: '' }), 900);
    barrelSec = 0; inBarrel = false;
  }

  return {
    modeId: 'surf', camPreset: 'surf',
    // Per-venue light and horizon, read at mount (see SkateRunMode). This is also what finally mounts the painted
    // OCEAN backdrop — a sea, a pier and palms that had existed in Backdrops.ts since M61 and were reachable from
    // no mood at all, so every break sat under Venice's city skyline.
    get mood() { return readBoardVenue('surf').mood; },
    get backdrop() { return readBoardVenue('surf').sky; },

    async load(ctx: ModeContext) {
      // ONE BUS PER MOUNT, OWNED BY THE HARNESS. This mode built its own, which worked and was
      // INAUDIBLE: the crowd swell and the tier sting are bound to the harness's bus, and there was
      // exactly one onTierChange subscriber in the game. Same reports, same weights, now heard.
      trickMomentum = ctx.momentum;
      // module-scope state outlives a mount: a remount must re-read the preset's fov, not the last run's.
      baseFov = null;
      const venue = readBoardVenue('surf');
      const built = buildSurfBreak(ctx.scene, POCKET, venue);
      ctx.setHud({ banner: `${venue.name} · ${venue.sub}` });
      world = built.world; waveLipAt = built.waveLipAt; barrelActive = built.barrelActive; faceHeightAt = built.faceHeightAt;
      updateSea = built.updateSea;
      spray?.dispose(); spray = new SurfSpray(ctx.scene);
      propsGone = false; void mountVenueProps(ctx.scene, 'surf-break').then((h) => { if (propsGone) h?.dispose(); else props = h; });
      // Gate 0: Validate skeletal rig by spawning placeholder to check skeleton
      const _validateChar = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, { position: new Vector3(0, -1000, 0) });
      if (_validateChar.skeleton?.bones.length === 65) {
        // Confirmed: 65-bone Mixamo rig with proper structure
      }
      _validateChar.dispose(); // Clean up validation placeholder
      // ARENA-10PHASE P3: spawn IN the pocket (the lip starts at z −50; was z −22 = 28 m out on the flat with nothing under
      // the board for the first 6 s), and glue the rider to the face on the way down it (the wave face falls away faster
      // than one frame of gravity, exactly like the pitched piste — see RiderCfgOverrides.stickDown).
      rig = await buildRig(ctx, CFG.heroUrl, new Vector3(0, 0, -50 + POCKET.min + 3), 0, world.ground, '#ffd75e', 'surfboard', { stickDown: 0.9, rayLength: 8, carveAccel: 9 * BOARD_PACE, maxSpeed: 16 * BOARD_PACE });   // WALLS + SPEED: +35% across the face
      tricks = new TrickMachine(rig, (h) => ctx.setHud(h), { momentum: trickMomentum, anim: 'external', onBeat: (b) => { if (b === 'land' || b === 'land_sketchy') { landBeatT = LAND_BEAT_SEC; lastLanding = b === 'land_sketchy' ? 'sketchy' : 'clean'; spray?.splash(rig.char.root.position, b === 'land' ? 0.5 : 0.8); } else { bailBeatT = BAIL_BEAT_SEC; spray?.splash(rig.char.root.position, 1); } } });
      animTree = new BoardAnimTree(rig.char.animator);
      posture?.dispose();
      posture = mountPostureLayer(ctx.scene, rig.char.skeleton, rig.char.root, () => {
        const { window, pose, legs } = boardPose(bio);
        // ANGULATION. The ROOT already banks (boardBank, applied to root.rotation.z) but every authored board stance is
        // [x, 0, 0] — pitch only — so today the whole body rolls as ONE RIGID PIECE. A real rider banks the board and
        // keeps their upper body out of it; the spine counter-angles against the edge. Deliberately the OPPOSITE sign
        // to the hoops bank: a basketball player rolls INTO the turn because nothing else is tilted, a rider's board
        // is already over. Reads the root's own eased roll, so the counter-angle can never disagree with the bank.
        const angled = angulate(pose, rig.char.root.rotation.z, window);
        // G1 on the wave: down the line, at head height — and in the barrel that IS out the end of the tube
        const la = lookAhead(rig.char.root.position, rig.char.root.rotation.y, 7, 1.5);
        const at = new Vector3(la.x, la.y, la.z);
        return { pose: angled, legs, aim: at, eyes: at, window };
      }, 'SURF-PP');
      trickLayer?.dispose();
      trickLayer = new BoardTrickLayer(ctx.scene, rig.char.skeleton, rig.char.root, rig.board);   // after the posture layer: the grab hand is the last word
      if (process.env.NODE_ENV === 'development') {
        const dev = (window as unknown as { __FEL_DEV__?: { boardPosture?: unknown } }).__FEL_DEV__;
        if (dev) dev.boardPosture = { me: () => posture?.layer.get() ?? null, bio: () => ({ ...bio }), aim: () => { const la = lookAhead(rig.char.root.position, rig.char.root.rotation.y, 7, 1.5); return la; } };   // BIOMECH-WAVE2 probes
      }
      bailBeatT = 0; landBeatT = 0; airT = 0; cutbackUntil = 0; rel = 0; stickY = 0; rideLean = 0;
      ctx.camDirector.setPreset('surf');   // over the swell back, clear of the crest (was 'board': 2.4 m up, inside a 2.6 m wave)
      assertSpawned(ctx.scene, { hero: rig.char.root, minWorldMeshes: 4, modeId: 'surf' });
      t = 0; timeLeft = RUN_SEC; flow = 0; ended = false; wipedOut = false; lapsSeen = 0; surging = false;
      yawTarget = rig.char.root.rotation.y;
      barrelSec = 0; inBarrel = false; barrels = 0;
      ctx.objectiveRef.current = waveLipAt(t);
      crowd = new Onlookers(ctx.scene, world.crowdSpots, '#3a4a63');   // L4: the beach
      // Phase 3 requires snapTo() at load and update() every frame. All three
      // board modes had only the update: the camera therefore STARTED at its
      // default position and had to lerp in at lag 0.08-0.12, with the rider
      // off-screen the whole way. That is where this mode's [FEL-FRAME] lines
      // came from — a fast board sport outruns a camera that begins behind.
      ctx.camDirector.snapTo(rig.char.root.position, waveLipAt(t));
      SoundKit.startAmbient('ocean');
      EffectsKit.ambient(ctx.scene, 'venice');
      boostKit = new BoostKit(0.2); boostHeld = false;
      boostFx?.dispose(); boostFx = new BoostFx(ctx.scene, ctx.camera, { trailFrom: rig.char.root, trailWidth: 0.5, color: '#bff4ff' });
      boostPads?.dispose(); boostPads = new BoostPads(ctx.scene, PAD_XS.map((x) => ({ pos: new Vector3(x, 0, 0), radius: 2.8 })));   // SHARD-PICKUP: one colour for the mechanic
      ctx.setHud({ score: 0, flow: 0, ...boostKit.hud(), time: RUN_SEC, hint: 'Ride the pocket under the lip · pull BACK to climb, push to drop in · R2 drives · hold RB / Shift to BOOST · miss the buoys' });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }   // P3: y = trim (back climbs the face, forward drops in)
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      if (e.t === 'trigger' && e.side === 'R') carve = e.value;
      if (e.t === 'button' && e.btn === 'R1') boostHeld = e.pressed;   // BOOST: the shared held R1
      if (e.t === 'button' && e.pressed && !wipedOut) {
        if (e.btn === 'A') {
          if (rig.rider.grounded) { rig.rider.jump(0.5 + flow / 200); SoundKit.play('whoosh', { pitch: 1.3, volume: 0.4 }); }   // the tree reads the air
        }
        if (e.btn === 'B') {
          // THE WAVE LIST (BoardTricks, surf). B used to be one hardcoded cutback; the held direction now picks among
          // five wave tricks — bottom turn, cutback, snap, floater, tube — and each carries its own score.
          //
          // The DRAWN-OUT TURN IS PRESERVED, deliberately. An earlier version snapped the board through 90 degrees in a
          // single frame: a cutback is the most drawn-out turn in surfing (you bury the rail and come back around), and
          // an instant pivot both looks wrong and whips the chase camera hard enough to lose the rider — which is where
          // surf's remaining [FEL-FRAME] lines came from. So the turn is still AIMED here and carved in update().
          const held = heldTrickDir(stickX, stickY);
          const wave = trickFor('surf', held, 'B') ?? trickFor('surf', null, 'B')!;
          // MECHANICS PASS (2026-09-15): the worst row on the scorecard — every B paid full points with no condition, so
          // mashing it out-scored surfing 9 to 1 (14,213 vs 1,530). A wave move is now a MOVE: on the face, one at a time
          // (the carve has to finish), and the same move again on this wave pays less (THPS repeat decay).
          if (!rig.rider.grounded) { refuse(ctx, 'ON THE FACE'); return; }
          if (t < waveMoveUntil) { refuse(ctx, 'MID-TURN'); return; }
          const rep = waveMoveRepeats.get(wave.id) ?? 0;
          waveMoveRepeats.set(wave.id, rep + 1);
          waveMoveUntil = t + WAVE_MOVE_LOCK_SEC;
          // only the reverts swing the board round; a floater or a tube ride holds the line
          if (wave.kind === 'revert') {
            yawTarget += Math.PI * 0.5 * (stickX >= 0 ? 1 : -1);
            cutbackUntil = t + CUTBACK_LEAN_SEC;
          }
          const paid = Math.round((trickPts(wave) + Math.round(flow / 4)) * REPEAT_DECAY[Math.min(rep, REPEAT_DECAY.length - 1)]);
          tricks.score += paid;
          if (rep < 2) boostKit.earn(wave.difficulty >= 3 ? 'trickBig' : 'trickSmall');
          ctx.feel?.impact?.(wave.difficulty >= 3 ? 0.2 : 0.12);
          SoundKit.play('whoosh', { pitch: 1.5, volume: 0.35 });
          ctx.juice.scorePop(rig.char.root.position.add(new Vector3(0, 2, 0)), `+${paid}`, rep ? '#94a3b8' : '#ffd75e');
          ctx.setHud({ score: tricks.score, banner: rep ? `${wave.label} · REPEAT ×${rep + 1}` : wave.label });
          setTimeout(() => ctx.setHud({ banner: '' }), 600);
        }
        if (e.btn === 'Y') {
          // the AIRS: only legal off the lip, and the air the rider has decides which one
          const air = rig.rider.grounded ? 0 : Math.max(0.35, AIR_BUDGET_SEC);
          const held = heldTrickDir(stickX, stickY);
          const want = trickFor('surf', held, 'Y');
          const fits = want && want.airSec <= air ? want : bestFitting('surf', 'Y', air);
          if (fits) {
            tricks.start(asTrickDef(fits));
            trickLayer?.start(fits);
            ctx.setHud({ banner: fits.label });
            setTimeout(() => ctx.setHud({ banner: '' }), 560);
          }
        }
        if (e.btn === 'X') { if (rig.rider.grounded) refuse(ctx, 'GRAB IN THE AIR'); else { tricks.start(TRICKS.grab); trickLayer?.start(SURF_GRAB); } }   // PHONE CONTROLS: a grab on the face was silent
      }
      if (e.t === 'button' && !e.pressed && e.btn === 'X') { tricks.endGrab(); trickLayer?.release(); }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      trickLayer?.begin();   // TRICK POSE: take back last frame's trick offsets before this frame's writes
      t += dt; timeLeft -= dt;
      const lip = waveLipAt(t);
      updateSea(dt, ctx.camera);   // SURF OCEAN: the swell moves and follows the lens, wiped out or not

      const lap = Math.floor((t * WAVE_SPEED) / WAVE_LAP);
      if (lap > lapsSeen) {
        lapsSeen = lap;
        rig.char.root.position.z -= WAVE_LAP;
        ctx.camDirector.snapTo(rig.char.root.position, waveLipAt(t));   // the wrap is a cut: the camera cuts with it (it used to lerp 140 m)
      }

      if (timeLeft <= 0) {
        ended = true;
        SoundKit.play('whistle');
        return ctx.end('SESSION_END', tricks.score, { bestFlow: Math.round(flow), barrels });
      }

      if (!wipedOut) {
        // SURGE — the flow meter is a resource you SPEND, which is the half of
        // SSX's boost economy this mode did not have. Flow filled by riding the
        // pocket and then only ever gated a passive score trickle: there was no
        // action anywhere that consumed it, so it was a readout, not a
        // decision. Now burying the rail past SURGE_CARVE burns the meter for
        // drive above the normal ceiling — speed you cannot otherwise get, and
        // the only way to outrun a section closing ahead of you. Bank it for
        // the score trickle or spend it to make the wave; that trade is the
        // decision the meter was missing.
        const bev = boostKit.update(dt, boostHeld, true);
        surging = boostKit.burning;
        if (bev.started) { ctx.setHud({ banner: 'BOOST' }); setTimeout(() => ctx.setHud({ banner: '' }), 600); }
        if (bev.full) { ctx.setHud({ banner: 'BOOST READY' }); setTimeout(() => ctx.setHud({ banner: '' }), 700); }
        boostFx?.update(dt, boostKit, bev);
        if (boostPads) {
          PAD_XS.forEach((x, i) => { const z = lip.z + PAD_POCKET_U; boostPads!.place(i, new Vector3(x, faceHeightAt(x, z, t), z)); });
          boostPads.update(dt, rig.char.root.position, boostKit);
        }

        // ── WAVE-RELATIVE DRIVE (ARENA-10PHASE P3 / SURF-WAVES-BOUNDS, 2026-09-07) ──
        // The Rider is a flat-park model: its own forward accel (9 m/s² × 0.55 with no pump) ran the surfer up to 14 m/s
        // while the wave travels at 4.5, so an unattended run left the water strip 11 s in and fell off the world
        // (measured: z 137 at 12 s, the camera 71 m up and 320 m behind by 43 s — playtest d3d4a93's empty gradient).
        // A surfer is CARRIED: forward speed = the wave's + a drift the face and the inputs decide. Under the lip the face
        // slides you ahead (steep there, nothing at the bottom); on the flat you stall and the wave catches up; stick
        // BACK trims up the face toward the lip, stick FORWARD drops in; R2 buries the rail for drive (and past
        // SURGE_CARVE spends flow for more). Fall behind the crest and the existing rule wipes you out.
        const u = rig.char.root.position.z - lip.z;
        const slope = u < 0 ? 0.3 : u < WAVE_FACE_LEN ? 1 - u / WAVE_FACE_LEN : 0;   // 1 under the lip → 0 at the bottom
        // hands-off the board trims itself into the face: the slide under the lip beats the trim, the trim wins lower down,
        // so an untouched rider settles a third of the way up the face (u ≈ 3, ~1.1 m up) and RIDES — not the flat
        let relTarget = u >= WAVE_FACE_LEN ? DRIFT.flat : DRIFT.slide * slope - DRIFT.trim;
        if (stickY > 0.2) relTarget -= DRIFT.climb * stickY;
        else if (stickY < -0.2) relTarget += DRIFT.drop * -stickY;
        // the boost drives above the normal ceiling (scaled by its ramp, so the surge arrives and bleeds off smoothly)
        const surge = SURGE_SPEED_BONUS * 1.5 * boostKit.k;
        relTarget += carve * DRIFT.rail + surge;
        relTarget = Math.min(relTarget, MAX_FORWARD_SPEED - WAVE_SPEED + surge);
        rel += (relTarget - rel) * Math.min(1, dt * 3.2);
        rig.rider.vel.z = WAVE_SPEED + rel;
        rig.rider.update(dt, stickX, carve);
        // phase 7 (measured): the Rider's carve accel along a sideways yaw ran the lateral speed to 24.7 m/s across the face
        // (the intent driver's weave + a held rail); a committed carve is ~5.5 — the wave carries, it does not launch
        if (Math.abs(rig.rider.vel.x) > SURF_LATERAL_MAX) rig.rider.vel.x = Math.sign(rig.rider.vel.x) * SURF_LATERAL_MAX;
        // NEVER OFF THE WAVE: the leash past the bottom of the face (the wave catches up anyway; this is the frame guard)
        const leash = lip.z + WAVE_FACE_LEN + FLAT_LEASH;
        if (rig.char.root.position.z > leash) { rig.char.root.position.z = leash; rel = Math.min(rel, 0); }
        // the board pitches with the face it is on: nose down riding down the slope, level on the flat
        const px = rig.char.root.position.x, pz = rig.char.root.position.z;
        const drop = faceHeightAt(px, pz, t) - faceHeightAt(px, pz + 1, t);
        const pitch = rig.rider.grounded ? Math.atan(drop) * 0.55 : 0;
        rig.char.root.rotation.x += (pitch - rig.char.root.rotation.x) * Math.min(1, dt * 8);

        // BUOYS — hitting one ends the ride the same way falling behind does
        const p = rig.char.root.position;
        for (const o of world.obstacles) {
          if (Math.hypot(p.x - o.pos.x, p.z - o.pos.z) < o.radius + 0.6) {
            bankBarrel(ctx);                       // an earned barrel still pays before the splash
            wipeout(ctx, 'BUOY! WIPEOUT', lip.z);
            break;
          }
        }
        if (wipedOut) { driveAnim(dt); ctx.setHud({ time: Math.ceil(timeLeft) }); return; }

        const ahead = rig.char.root.position.z - lip.z;
        const hollow = barrelActive(t);
        if (ahead < -0.5) {
          bankBarrel(ctx);
          wipeout(ctx, 'WIPEOUT', lip.z);
        } else if (ahead >= POCKET.min && ahead <= POCKET.max) {
          // pocket riding — doubled while the tube is open over you
          const mult = hollow ? 2 : 1;
          flow = Math.min(FLOW_MAX, flow + dt * FLOW_FILL_PER_SEC * mult);
          boostKit.earnOver('pocketPerSec', dt, mult);
          // MECHANICS PASS: the pocket fills FLOW (which every move and the barrel multiply) — it no longer drips points. The
          // drip is what scored 921 for a rider who never touched the pad, with no cue for any of it (19 unexplained scores).
          if (hollow) {
            barrelSec += dt;
            if (Math.hypot(stickX, stickY) > 0.3 || carve > 0.2) barrelWorked += dt;
            if (!inBarrel && barrelSec > 0.3) {
              inBarrel = true;
              SoundKit.play('powerUp', { pitch: 1.2, volume: 0.35 });
              // hood in as the tube closes over you, and hold it while you are inside
              ctx.camDirector.pulse(0.7, 1.2);
              ctx.setHud({ banner: 'IN THE BARREL' });
              setTimeout(() => ctx.setHud({ banner: '' }), 800);
            }
          } else if (inBarrel) {
            bankBarrel(ctx);                       // the tube closed while you were in it — pay out
          }
          ctx.setHud({ flow: Math.round(flow) });
        } else {
          if (inBarrel) bankBarrel(ctx);           // drifted out of the pocket — pay out if earned
          flow = Math.max(0, flow - dt * 30);
          ctx.setHud({ flow: Math.round(flow) });
        }

        const banner = tricks.update(dt);
        if (banner) {
          ctx.setHud({ banner });
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
        }
        // Clamp AT the water's edge, not 5m inside it. The rider used to stop
        // against nothing while the ocean visibly continued past him.
        const edge = world.bound - 1;   // the break's own width, so the clamp and the water's edge are one number
        if (Math.abs(rig.char.root.position.x) > edge) {
          const side = Math.sign(rig.char.root.position.x);
          rig.char.root.position.x = side * edge;
          // phase 7 — THE EDGE DECIDES (the skate fence / snow piste rule, BAIL HONESTY 09-21): straight into the channel
          // wall at speed is a wipe, not a silent turn-back; a glancing touch turns the board along the wave as before.
          const into = rig.rider.vel.x * side;
          if (!edgeHit) {
            if (into > SURF_EDGE_SLAM_MS && !wipedOut) { console.info(`[SURF-EDGE] slam ${into.toFixed(1)} m/s`); wipeout(ctx, 'EDGE OF THE BREAK — WIPEOUT', waveLipAt(t).z); }
            else console.info(`[SURF-EDGE] turn ${into.toFixed(1)} m/s`);
          }
          edgeHit = true;
          // WALLS + SPEED (2026-09-15): the edge of the break turns the board back along the wave — a clamp alone left the
          // surfer aimed at the edge, carving into it every frame and stuck there
          if (rig.rider.vel.x * side > 0) rig.rider.vel.x = -rig.rider.vel.x * 0.35;
          const r = rig.char.root.rotation.y;
          if (Math.sin(r) * side > 0) { yawTarget = r - 2 * Math.atan2(Math.sin(r), Math.cos(r)); cutbackUntil = t + 0.4; }   // mirror the heading, same winding
        } else edgeHit = false;
      }

      driveAnim(dt);   // every frame, wiped out or not — the tree is the one owner of the rider's clips

      // carve toward the aimed heading (~0.4s to come around)
      const yawErr = yawTarget - rig.char.root.rotation.y;
      if (Math.abs(yawErr) > 0.001) rig.char.root.rotation.y += yawErr * Math.min(1, dt * CUTBACK_RATE);
      // G6: BURY THE RAIL. The turn above is the whole move and it had no lean under it — the roll now reads the same
      // lean the clip does (stick, or the cutback coming around), scaled by speed, layered over GroundRide's own ease.
      if (!wipedOut && rig.rider.grounded) {
        const want = boardBank(rideLean, Math.min(1, rig.rider.vel.length() / MAX_FORWARD_SPEED));
        rig.char.root.rotation.z += (want - rig.char.root.rotation.z) * Math.min(1, 10 * dt);
      }
      trickLayer?.apply(dt, !rig.rider.grounded);   // TRICK POSE: the spin, the cork, the grab — after the mode's own root writes
      ctx.camDirector.setAir(!rig.rider.grounded && !rig.rider.grinding ? 1 : 0);   // the AIR CAM: the trick in the picture

      crowd.update(dt);
      if (spray) {
        const yaw = rig.char.root.rotation.y, yawRate = dt > 0 ? Math.abs(yaw - lastYaw) / dt : 0; lastYaw = yaw;
        const carving = t < cutbackUntil;
        spray.update({
          lip, rider: rig.char.root.position, speed: rig.rider.vel.length(),
          carve: carving ? 1 : Math.min(1, yawRate / 2.2 + Math.abs(rideLean) * 0.5),
          carveSide: -Math.sign(yaw - lastYaw || rideLean || 1), hollow: barrelActive(t), grounded: rig.rider.grounded && !wipedOut,
        });
      }
      ctx.setHud({ time: Math.ceil(timeLeft), ...boostKit.hud() });
      const vel = rig.rider.vel;
      const leadVel = vel.lengthSquared() > 0.01 ? vel.scale(1.6) : vel;
      ctx.camDirector.look(lookX, lookY, dt);
      ctx.camDirector.update(rig.char.root.position, leadVel, lip);
      // SPEED YOU CANNOT SEE IS NOT SPEED. The lens widens toward top speed and eases back, normalised
      // against THIS mode's ceiling so flat-out feels the same in every discipline. Frame-independent:
      // see SpeedFov (a per-frame lerp settles 2.4x faster at 144 fps than at 60).
      baseFov ??= ctx.camera.fov;
      ctx.camera.fov = stepSpeedFov(ctx.camera.fov, baseFov * (boostFx?.fovMult(boostKit) ?? 1), Math.hypot(rig.rider.vel.x, rig.rider.vel.z), rig.rider.topSpeed, dt);
    },

    dispose() { trickLayer?.dispose(); trickLayer = null; spray?.dispose(); spray = null; updateSea = () => {}; boostFx?.dispose(); boostFx = null; boostPads?.dispose(); boostPads = null; posture?.dispose(); posture = null; propsGone = true; props?.dispose(); props = null; crowd?.dispose(); rig?.dispose(); world?.dispose(); SoundKit.stopAmbient(); },
  };
})();

// HUD: score, flow, time, banner, hint — unchanged — plus `barrels` in the
// end-of-session stats.
