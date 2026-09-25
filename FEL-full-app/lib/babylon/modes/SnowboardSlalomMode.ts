// SnowboardSlalomMode v5 — REPLACES the M44 file. The slope is no longer an
// empty gate corridor (rideWorlds v3 ships alongside):
//   ROCKS — real obstacles on the piste. Hit one grounded and you stumble
//     (speed cut, -50, brief recovery i-frames). JUMP clears them clean.
//   RAILS — three down-slope rails: press JUMP in the air near one to lock
//     a grind (same tryGrind flow Skate Run uses), stick to dismount.
//   THE LIFT GRIND — launch off the second kicker into the ski-lift CABLE
//     for the run's biggest grind bonus (400).
//   THE YETI — an original FEL creature (an oversized, frost-tinted
//     pursuer — no franchise likeness of any kind). It bursts from beside
//     the piste mid-run and chases for a stretch; jump its lunge for
//     +150 ("CLEARED THE YETI"), get caught grounded and you tumble
//     (-100, hard speed cut). One appearance per run, watchdog-bounded.
// Everything from M44 kept: gates, tricks, tuck, gate/miss audio language.

import { stepSpeedFov } from '../core/SpeedFov';
import { BoostKit } from '../core/BoostKit';          // FINISH-RELEASE: the shared boost replaces the tuck-spent meter
import { BoostFx } from '../premium/BoostFx';
import { BoostPads } from '../visual/BoostPads';
import { Vector3 } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { buildRig, TrickMachine, TRICKS, type BoardRig } from './boardCore';
import { trickFor, bestFitting, airPressFor, asTrickDef, heldTrickDir, type BoardTrick } from '../core/BoardTricks';   // the named vocabulary
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { BoardTrickLayer } from '../anim/BoardTrickLayer';   // TRICK POSE (2026-09-15): tricks recognisable on sight
import { boardPose, boardBank, lookAhead, BOARD_INPUT_IDLE, type BoardPostureInput } from '../core/BoardPosture';
import { angulate } from '../core/DynamicPosture';   // a rider ANGULATES: the board banks, the spine comes back out
import { buildSlopeRun, SLOPE_PITCH, SLALOM_START, SLALOM_GATES, SLALOM_SPACING, type RideWorld } from './rideWorlds';
import { readBoardVenue, tuneForVenue } from '../nexus/boardVenues';   // three mountains, not three tints of one
import { Mob, MobPool, STEERING_PRESETS } from '../core/MobSteering';
import { CharacterLibrary } from '../core/CharacterLibrary';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { BoardAnimTree } from '../anim/boardTree';
import { BoardMovement, SNOW_TUNING } from '../core/BoardMovement';
import { MomentumBus } from '../core/MomentumBus';
import { assertSpawned } from '../core/FrameGuard';
import { SoundKit } from '../audio/SoundKit';
import { refuse } from '../core/Refusal';   // MECHANICS PASS: a press that cannot act is answered
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { RIDE_CONFIG as CFG } from './modeConfigs';
import { mountVenueProps, type VenuePropsHandle } from '../visual/VenueProps';

/** phase 10: the share of the gates that makes the run a GATE CRASHER (the win) */
const GATE_CRASHER_SHARE = 0.5;
const YETI_SPAWN_GATE = 5;                 // bursts out after this gate clears
const YETI_CHASE_SEC = 8;
const YETI_CLEAR_PTS = 150;
const YETI_CATCH_PENALTY = 100;
const ROCK_PENALTY = 50;
const STUMBLE_IFRAME_SEC = 1.2;
/** Tuck depth at which the rider commits and starts SPENDING the boost meter. */
/** The camera preset's resting fov, captured on the first frame after load and restored to by SpeedFov. */
let baseFov: number | null = null;

export const BOOST_TUCK = 0.85;
/** Boost burned per second while boosting. */
export const BOOST_DRAIN = 30;
/** Boost gained per spin landed. */
export const BOOST_PER_SPIN = 12;
/** Ceiling on the boost meter. */
export const BOOST_MAX = 100;

export const SnowboardSlalomMode: ModeDefinition = (() => {
  let world: RideWorld, rig: BoardRig, tricks: TrickMachine;
  let props: VenuePropsHandle | null = null, propsGone = false;   // ship pass 4: CC0 prop dressing (visual/venuePropSets.ts)
  let crowd: Onlookers;
  // deep runs light the building here too, not only on a skateboard (boardCore.TrickMachine)
  let trickMomentum = new MomentumBus();
  let nextGate = 0, gatesHit = 0, elapsed = 0, gateStreak = 0;
  let hudSec = -1;   // ARENA-10PHASE P9 soft: the run clock the HUD shows (it never published `time` — the chip sat on "0s" all run)
  /** A full snowboard air's hang, for judging which trick the rider can finish. */
  const AIR_BUDGET_SEC = 1.2;
  let stickX = 0, stickY = 0, tuck = 0;   // stickY was dropped entirely, so up/down was unreadable for a trick grammar
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  let ended = false;
  let stumbleIframe = 0;
  let yeti: Mob | null = null, yetiPool: MobPool | null = null;
  let yetiSec = 0, yetiDone = false;
  // A+ P0 juice (PM brief BOARD-A-PLUS-P0, 2026-09-06): rock hit / yeti catch share one wipe punch (latched 0.5 s so a rock
  // and the yeti on the same beat hit once); the finish gets one punch. Gates keep their tiny feel only. No hang slowMo.
  let wipeLatchUntil = 0, finishLatch = false;
  // ANIM-READABILITY (2026-09-07): ONE owner of the rider's clips. This mode used to play(...) every frame AND fire
  // one-shots from onInput / the rock / the yeti / the TrickMachine — the per-frame play cut each of them a frame later
  // (measured: the wipe's bail clip visible 0.13 s, the grab 0.12 s, the landing 0.12 s; the 0.8 s air one-shot ran
  // out mid-flight and flashed the idle). The BoardAnimTree holds beats and settles one-shots; the mode feeds it state.
  let animTree: BoardAnimTree;
  // THE SNOW MODES HAD NO POSTURE LAYER AT ALL. Skate and surf have carried one since BIOMECH-WAVE2 and the snowboard
  // never got it, so none of the body work — the authored ride stances, the grab shapes, the eyes on the line, the
  // angulation — could reach a snowboarder. It reads the same BoardPosture table the other two do.
  let posture: { layer: PostureLayer; dispose(): void } | null = null;
  let trickLayer: BoardTrickLayer | null = null;
  const bio: BoardPostureInput = { ...BOARD_INPUT_IDLE };
  let bailBeatT = 0, landBeatT = 0, airT = 0;
  let lastLanding: 'clean' | 'sketchy' = 'clean';   // phase 6: which landing beat the tree plays
  /** BAIL HONESTY (2026-09-21): true while the board is against the edge of the piste, so one slam is one fall. */
  let edgeHit = false;
  const BAIL_BEAT_SEC = 0.9, LAND_BEAT_SEC = 0.4;
  function wipePunch(ctx: ModeContext): void {
    if (elapsed < wipeLatchUntil) return;
    wipeLatchUntil = elapsed + 0.5;
    ctx.juice.hitStop(45);
    ctx.juice.shake(0.10, 140);
    SoundKit.play('impact', { pitch: 0.6, volume: 0.65 });
    console.info('[SNOW-JUICE] wipe punch');
  }
  function finishPunch(ctx: ModeContext): void {
    if (finishLatch) return;
    finishLatch = true;
    ctx.juice.hitStop(50);
    ctx.juice.shake(0.10, 160);
    ctx.juice.flash('#fff6dd', 100);
    console.info('[SNOW-JUICE] finish punch');
  }
  const snowTune = tuneForVenue(SNOW_TUNING, readBoardVenue('snow'));
  const move = new BoardMovement(snowTune);   // Phase 12: carve weight + slope energy
  let mbus = new MomentumBus();
  // BOOST (FINISH-RELEASE, 2026-09-14): the shared BoostKit. The mode's own 0..100 meter was spent by TUCKING past 0.85
  // — a boost you could not choose to hold back, on the same trigger as the speed tuck. Spins, gates and grinds pay it
  // now; the held R1 (RB · Shift · BOOST pill) burns it, exactly as in the kart, the plane and the other boards.
  let boostKit = new BoostKit();
  let boostFx: BoostFx | null = null;
  let boostPads: BoostPads | null = null;
  let boostHeld = false;

  async function spawnYeti(ctx: ModeContext): Promise<void> {
    if (yetiDone || yeti) return;
    yetiDone = true;                       // one appearance per run, no matter what
    console.info('[SNOW-YETI] spawn');
    const p = rig.char.root.position;
    const char = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
      position: new Vector3(p.x + 12, p.y, p.z + 6),
      scale: 1.4, tint: '#dfe9f2', startClip: SPORT_CLIP.idle,
    });
    neverBindPose(char.animator, SPORT_CLIP.idle);
    installSafePlay(char.animator, 'snowboard-yeti');
    ctx.groundLock?.track(char.root, char.skeleton);
    yeti = new Mob(char, STEERING_PRESETS.rusher);
    yeti.startPursuit();
    yetiPool = new MobPool();
    yetiPool.add(yeti);
    yetiSec = 0;
    SoundKit.play('crowdGroan', { pitch: 0.45, volume: 0.7 });   // the roar
    ctx.feel?.impact?.(0.3);
    ctx.setHud({ banner: 'YETI ON YOUR TAIL!' });
    setTimeout(() => ctx.setHud({ banner: '' }), 1100);
  }

  function despawnYeti(ctx: ModeContext): void {
    if (!yeti) return;
    const gone = yeti;
    yeti = null; yetiPool = null;
    gone.down();
    ctx.groundLock?.release(gone.char.root);
    EffectsKit.burst(ctx.scene, gone.char.root.position.add(new Vector3(0, 1, 0)), 'dust');
    const root = gone.char.root;
    const startY = root.position.y;
    const sink = ctx.scene.onBeforeRenderObservable.add(() => {
      root.position.y -= 0.03;
      if (root.position.y < startY - 3) {
        ctx.scene.onBeforeRenderObservable.remove(sink);
        gone.char.dispose();
      }
    });
    setTimeout(() => { try { gone.char.dispose(); } catch { /* already gone */ } }, 2500);
  }

  return {
    modeId: 'snowboard', camPreset: 'descent',
    // The LIGHT is the venue's. A getter, because the harness reads this at mount — after the splash has written the
    // pick and before load() runs — and a module-level literal is why the night park would have rendered under an
    // alpine midday sun. Same reasoning for the painted horizon.
    get mood() { return readBoardVenue('snow').mood; },
    get backdrop() { return readBoardVenue('snow').sky; },

    async load(ctx: ModeContext) {
      // ONE BUS PER MOUNT, OWNED BY THE HARNESS. This mode built its own, which worked and was
      // INAUDIBLE: the crowd swell and the tier sting are bound to the harness's bus, and there was
      // exactly one onTierChange subscriber in the game. Same reports, same weights, now heard.
      mbus = ctx.momentum;
      // ONE BUS PER MOUNT, OWNED BY THE HARNESS. This mode built its own, which worked and was
      // INAUDIBLE: the crowd swell and the tier sting are bound to the harness's bus, and there was
      // exactly one onTierChange subscriber in the game. Same reports, same weights, now heard.
      trickMomentum = ctx.momentum;
      // module-scope state outlives a mount: a remount must re-read the preset's fov, not the last run's.
      baseFov = null;
      const venue = readBoardVenue('snow');
      world = buildSlopeRun(ctx.scene, venue);
      ctx.setHud({ banner: `${venue.name} · ${venue.sub}` });
      // lateralShift: the 'slope' set's treeline is authored at x ±19…±24 for a 17 m half-piste. A wider venue
      // pushes it out by the difference, so the glacier's 34 m groom does not have pines standing in it.
      propsGone = false; void mountVenueProps(ctx.scene, 'slope', undefined, { snapToGround: true, lateralShift: Math.max(0, venue.bound - 17) }).then((h) => { if (propsGone) h?.dispose(); else props = h; });   // P9: the pines stand ON the pitched snow
      // The piste is pitched SLOPE_PITCH and drops ~56 m over the run. The Rider's flat-park defaults (6 m ground ray, hard
      // floor at y 0) pinned the rider at y ≈ 0 above it, so rocks / the yeti (placed ON the piste) never made contact: the
      // ray missed once the snow was > 4.5 m below and the floor clamp fired every frame below −0.5. A longer ray, a floor
      // under the run's lowest point and the stick-down glue keep the rider on the snow (owner sign-off 2026-09-07).
      const pisteBottomY = -Math.sin(SLOPE_PITCH) * (SLALOM_START + SLALOM_GATES * SLALOM_SPACING + 40);
      rig = await buildRig(ctx, CFG.heroUrl, new Vector3(0, 0.2, 4), 0, world.ground, '#ff6b3d', 'snowboard', {
        hardFloorY: pisteBottomY - 5, rayLength: 80, stickDown: 0.6,
        // BOARD-SPEED (2026-09-21): the Rider's own flat 16 m/s cap sat UNDER the momentum model's ceiling (17 × pace), so
        // both earlier pace passes were invisible on a straight descent — the hill already ran the board into the 16 wall
        // ("descends at 12–16 m/s straight"). The momentum model owns the ceiling; the Rider's cap only has to clear it.
        maxSpeed: snowTune.maxSpeed * 1.4,
      });
      tricks = new TrickMachine(rig, (h) => ctx.setHud(h), {
        momentum: trickMomentum, anim: 'external',
        // HOTFIX (2026-09-24): X in the air is a grab now, and X's release ends it — so a keyboard tap under 0.1 s graded
        // under GRAB_SKETCHY (0.4) and landed as a BAIL (combo wiped, speed cut to a quarter). A grab is held at least
        // MIN_TAP_GRAB_SEC (one clean grab's worth): a tap is a clean minimum grab, a longer hold is the same grab as
        // before. The trick pose lets the grab hand go when the grab really ends.
        minGrabSec: TrickMachine.MIN_TAP_GRAB_SEC, onGrabEnd: () => trickLayer?.release(),
        onBeat: (b) => {
        if (b === 'land' || b === 'land_sketchy') {
          landBeatT = LAND_BEAT_SEC; lastLanding = b === 'land_sketchy' ? 'sketchy' : 'clean';   // phase 6: the body reads the grade
          // SCORECARD FEEL (2026-09-15): a landed trick pops at the rider — the run measured 4.5 juice beats a minute
          ctx.juice.scorePop(rig.char.root.position.add(new Vector3(0, 2.1, 0)), b === 'land' ? 'STOMPED' : 'SKETCHY', b === 'land' ? '#a7f3d0' : '#fcd34d');
        } else bailBeatT = BAIL_BEAT_SEC;
      } });
      animTree = new BoardAnimTree(rig.char.animator);
      posture?.dispose();
      posture = mountPostureLayer(ctx.scene, rig.char.skeleton, rig.char.root, () => {
        const { window, pose, legs } = boardPose(bio);
        // the board banks at the root; the spine counter-angles against it rather than riding over as one piece
        const angled = angulate(pose, rig.char.root.rotation.z, window);
        // the objective on a board sport is where the board is TAKING you — 7 m down the heading at head height
        const la = lookAhead(rig.char.root.position, rig.char.root.rotation.y, 7, 1.5);
        const at = new Vector3(la.x, la.y, la.z);
        return { pose: angled, legs, aim: at, eyes: at, window };
      }, 'SNOW-PP');
      trickLayer?.dispose();
      trickLayer = new BoardTrickLayer(ctx.scene, rig.char.skeleton, rig.char.root, rig.board);   // after the posture layer: the grab hand is the last word
      bailBeatT = 0; landBeatT = 0; airT = 0; edgeHit = false;
      assertSpawned(ctx.scene, { hero: rig.char.root, minWorldMeshes: 20, modeId: 'snowboard' });
      nextGate = 0; gatesHit = 0; elapsed = 0; gateStreak = 0; hudSec = -1; ended = false; stickX = 0; stickY = 0; tuck = 0;
      stumbleIframe = 0; yeti = null; yetiPool = null; yetiSec = 0; yetiDone = false;
      wipeLatchUntil = 0; finishLatch = false;
      ctx.objectiveRef.current = world.markers[nextGate] ?? null;
      crowd = new Onlookers(ctx.scene, world.crowdSpots, '#2f3f57');   // L4: spectators on the slope
      // Phase 3 requires snapTo() at load and update() every frame. All three
      // board modes had only the update: the camera therefore STARTED at its
      // default position and had to lerp in at lag 0.08-0.12, with the rider
      // off-screen the whole way. That is where this mode's [FEL-FRAME] lines
      // came from — a fast board sport outruns a camera that begins behind.
      ctx.camDirector.snapTo(rig.char.root.position, world.markers[nextGate] ?? null);
      SoundKit.startAmbient('wind');           // Phase 18: descent wind bed
      EffectsKit.ambient(ctx.scene, 'slope');  // snowfall
      // BOOST: a pad on the fall line halfway to every other gate, pointing down the hill
      boostKit = new BoostKit(0.2); boostHeld = false;
      boostFx?.dispose(); boostFx = new BoostFx(ctx.scene, ctx.camera, { trailFrom: rig.char.root, trailWidth: 0.5, color: '#9be7ff' });
      boostPads?.dispose();
      boostPads = new BoostPads(ctx.scene, world.markers.filter((_, i) => i % 2 === 1).map((gm, j) => {
        const prev = world.markers[j * 2] ?? rig.char.root.position;
        const at = prev.add(gm.subtract(prev).scale(0.5));
        return { pos: at, yaw: Math.atan2(gm.x - prev.x, gm.z - prev.z), radius: 2.6 };
      }), '#9be7ff');
      ctx.setHud({ score: 0, ...boostKit.hud(), gates: `0/${world.markers.length}`, hint: 'Gates for points · JUMP rocks · grind the rails · hold RB / Shift to BOOST' });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = Number.isFinite(e.y) ? e.y : 0; }
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      if (e.t === 'trigger' && e.side === 'R') tuck = e.value;
      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A') {
          if (rig.rider.grounded) {
            rig.rider.jump(0.5 + tuck * 0.5);   // the tree reads the air and plays board_air (a direct one-shot here ran out mid-flight)
            SoundKit.play('whoosh', { pitch: 1.3, volume: 0.4 });
          } else if (rig.rider.tryGrind(world.grindLines)) {
            // credit the line actually closest to the rider (lift cable pays 400)
            const p = rig.char.root.position;
            const nearest = world.grindLines.reduce((best, l) =>
              Vector3.Distance(Vector3.Center(l.a, l.b), p) < Vector3.Distance(Vector3.Center(best.a, best.b), p) ? l : best,
            world.grindLines[0]);
            tricks.bankGrind(nearest);
            const isCable = nearest.bonus >= 400;
            ctx.setHud({ banner: isCable ? 'LIFT CABLE GRIND!' : 'RAIL GRIND!' });
            SoundKit.play('powerUp', { volume: 0.45, pitch: isCable ? 1.4 : 1 });
            // The lift cable is the run's biggest single score. It already
            // sounded different from an ordinary rail; now it looks different.
            if (isCable) { ctx.camDirector.pulse(0.8, 0.5); ctx.feel?.impact?.(0.4); }
            ctx.feel?.impact?.(isCable ? 0.45 : 0.3);
          }
        }
        // THE NAMED VOCABULARY (BoardTricks). Three buttons used to mean three fixed tricks — a 360, a grab and a
        // kickflip on a SNOWBOARD, which is not even a snowboard trick. The held direction now picks which of the
        // twelve snow tricks a button throws, and the air the rider actually has decides what is legal: a cork 720
        // needs over a second of hang and must not be thrown off a roller.
        if ((e.btn === 'B' || e.btn === 'X' || e.btn === 'Y') && rig.rider.grounded && !rig.rider.grinding) {
          // MECHANICS PASS (2026-09-15): the air budget floor (0.3 s) let an air trick START on the snow, so mashing B / X / Y
          // down the run landed a stream of straight airs and grabs (mash 936 vs deliberate 440). Air tricks are thrown in the air.
          refuse(ctx, 'IN THE AIR');
        } else if (e.btn === 'B' || e.btn === 'X' || e.btn === 'Y') {
          const held = heldTrickDir(stickX, stickY);
          const air = Math.max(0.3, rig.rider.grounded ? 0 : AIR_BUDGET_SEC);
          const btn = e.btn as BoardTrick['btn'];
          // HOTFIX (2026-09-24): IN THE AIR, AN AIR TRICK — skate's ANIM-RESIDUAL fix, which snow never got. The whole-list
          // search includes the ground links, and X's only snow trick is the rail BOARDSLIDE (airSec 0, so it always "fits"):
          // every X off a kicker threw a BOARDSLIDE over open air. airPressFor names the air trick, and an X with no named air
          // is the held direction's grab (X is the grab hold: its release ends it, below, after the minimum hold — see the
          // TrickMachine's minGrabSec above). On a rail the links are the point.
          let fits: BoardTrick | null;
          if (rig.rider.grinding) { const want = trickFor('snow', held, btn); fits = want && want.airSec <= air ? want : bestFitting('snow', btn, air); }
          else fits = airPressFor('snow', held, btn, air);
          if (fits) {
            tricks.start(asTrickDef(fits));
            trickLayer?.start(fits);
            ctx.setHud({ banner: fits.label });
            setTimeout(() => ctx.setHud({ banner: '' }), 520);
            // the boost still fills off a SPIN, which is what it always rewarded — now it scales with the rotation
            if (fits.spinDeg > 0) boostKit.earn(fits.spinDeg >= 540 ? 'trickBig' : 'trickSmall', Math.max(1, fits.spinDeg / 360));
          }
        }
      }
      if (e.t === 'button' && e.btn === 'R1') boostHeld = e.pressed;   // BOOST: the shared held R1 (press AND release)
      // a grab inside its minimum hold ends later (onGrabEnd releases the pose then); with no grab in flight the pose is let go now
      if (e.t === 'button' && !e.pressed && e.btn === 'X') { tricks.endGrab(); if (!tricks.grabHeld) trickLayer?.release(); }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
      trickLayer?.begin();   // TRICK POSE: take back last frame's trick offsets before this frame's writes
      elapsed += dt;
      if (Math.floor(elapsed) !== hudSec) { hudSec = Math.floor(elapsed); ctx.setHud({ time: hudSec }); }   // P9 soft: the clock runs
      stumbleIframe = Math.max(0, stumbleIframe - dt);
      if (rig.rider.grinding && Math.abs(stickX) > 0.7) rig.rider.dismount();
      // Phase 12: slope energy via the shared board movement (descent builds
      // speed for real); tuck adds, boost spends the meter on a burst.
      // TUCK, not 0. The comment above says "tuck adds" and the HUD verb is
      // literally TUCK, but the momentum model was handed a hard-coded 0, so
      // tucking drove the animation and nothing else. With pushAccel 0 on snow,
      // that left slope gravity as the ONLY propulsion in the mode: measured
      // over six seconds of held tuck the rider covered 1.5m down the hill
      // against 7.2m across it, roughly 0.75 m/s of descent on a course 205m
      // long. That is the whole reason a 90-second run scored 1 gate out of 12
      // -- the rider only ever physically reached the first one.
      const bev = boostKit.update(dt, boostHeld, stumbleIframe === 0);
      move.boostK = boostKit.k;
      if (rig.rider.grinding) boostKit.earnOver('grindPerSec', dt);
      boostPads?.update(dt, rig.char.root.position, boostKit);
      boostFx?.update(dt, boostKit, bev);
      if (bev.started) { ctx.setHud({ banner: 'BOOST' }); setTimeout(() => ctx.setHud({ banner: '' }), 600); }
      if (bev.full) { ctx.setHud({ banner: 'BOOST READY' }); setTimeout(() => ctx.setHud({ banner: '' }), 700); }
      const v = move.update(dt, stickX, tuck, ctx.scene, rig.char.root.position, world.ground);
      rig.rider.vel.x = v.x; rig.rider.vel.z = v.z;
      rig.rider.update(dt, stickX, tuck);
      crowd.update(dt);
      // The rider has to FACE where they are going. This mode never set the
      // root rotation at ALL, so the board kept whatever yaw it spawned with
      // and the rider came down the mountain broadside -- steering with the
      // slalom while permanently pointed across the fall line. The board mesh
      // is parented to this root, so it was sideways too. Skate takes the same
      // yaw from the same shared momentum object; snowboard simply never had
      // the line. Grinding holds its own heading, as it does there.
      if (!rig.rider.grinding) rig.char.root.rotation.y = move.yaw;
      // SSX Tricky is NAMED after its boost state, and this meter could not be
      // spent: `boosting` was never assigned true ANYWHERE in the codebase, so
      // boost filled at +12 a spin and drained inside a branch nothing could
      // enter. Everything else was already here -- the acceleration, the drain,
      // the HUD publish -- only the trigger was missing, which is why it read as
      // a working feature.
      //
      // Same commitment idiom surf uses for its flow meter, deliberately: one
      // benchmark, one economy. Bury the tuck and you spend the meter; ease off
      // and you keep what is left.
      // (the tuck-spent meter that lived here is the shared BoostKit now — see the top of update)
      { const bh = boostKit.hudIfChanged(); if (bh) ctx.setHud(bh); }
      // the harness cools the shared meter on real time now -- a second update() here decayed it twice as fast

      // ROCKS — grounded contact is a stumble; airborne clears clean
      if (stumbleIframe === 0 && rig.rider.grounded && !rig.rider.grinding) {
        const p = rig.char.root.position;
        for (const o of world.obstacles) {
          if (Math.hypot(p.x - o.pos.x, p.z - o.pos.z) < o.radius + 0.5 && Math.abs(p.y - o.pos.y) < 1.6) {
            stumbleIframe = STUMBLE_IFRAME_SEC;
            tricks.score = Math.max(0, tricks.score - ROCK_PENALTY);
            rig.rider.vel.scaleInPlace(0.35);
            wipePunch(ctx);   // A+ P0: hit-stop + shake + ONE low thud (replaces impact SFX + feel.impact, which doubled the thud); dust kept
            EffectsKit.burst(ctx.scene, p.clone(), 'dust');
            bailBeatT = BAIL_BEAT_SEC;   // the tree plays the bail and holds it for the beat
            console.info('[SNOW-ROCK] hit');
            ctx.setHud({ score: tricks.score, banner: `ROCK! -${ROCK_PENALTY}` });
            setTimeout(() => ctx.setHud({ banner: '' }), 700);
            break;
          }
        }
      }

      // THE YETI — spawn after gate N, chase for a bounded window
      if (!yetiDone && gatesHit >= YETI_SPAWN_GATE) void spawnYeti(ctx);
      if (yeti && yetiPool) {
        yetiSec += dt;
        const contacts = yetiPool.update(dt, rig.char.root.position, rig.rider.vel);
        for (const mob of contacts) {
          if (!rig.rider.grounded || rig.rider.grinding) {
            tricks.score += YETI_CLEAR_PTS;
            mob.onContactResolved();
            SoundKit.play('crowdCheer', { volume: 0.5 });
            ctx.camDirector.pulse(1, 0.55);
            crowd?.cheer(1);
            ctx.feel?.impact?.(0.3);
            console.info('[SNOW-YETI] clear');
            ctx.setHud({ score: tricks.score, banner: `CLEARED THE YETI +${YETI_CLEAR_PTS}` });
            setTimeout(() => ctx.setHud({ banner: '' }), 900);
            despawnYeti(ctx);
          } else {
            tricks.score = Math.max(0, tricks.score - YETI_CATCH_PENALTY);
            rig.rider.vel.scaleInPlace(0.25);
            mob.onContactResolved();
            wipePunch(ctx);   // A+ P0: the yeti catch is a wipe too — same punch, same latch
            EffectsKit.burst(ctx.scene, rig.char.root.position.clone(), 'dust');
            bailBeatT = BAIL_BEAT_SEC;
            console.info('[SNOW-YETI] caught');
            ctx.setHud({ score: tricks.score, banner: `THE YETI GOT YOU -${YETI_CATCH_PENALTY}` });
            setTimeout(() => ctx.setHud({ banner: '' }), 900);
            despawnYeti(ctx);
          }
          break;
        }
        if (yeti && yetiSec > YETI_CHASE_SEC) {         // it gives up — watchdog-bounded chase
          ctx.setHud({ banner: 'THE YETI FALLS BEHIND' });
          setTimeout(() => ctx.setHud({ banner: '' }), 800);
          despawnYeti(ctx);
        }
      }

      const gate = world.markers[nextGate];
      // QA INTENT (2026-09-15): the next gate for the mechanics probe's intent driver (gates are thin instances, not meshes it
      // can find) — read through the agent-only __FEL_QA__.scene(), never by the game itself
      ((ctx.scene.metadata ??= {}) as { qaNextGate?: { x: number; z: number } | null }).qaNextGate = gate ? { x: gate.x, z: gate.z } : null;
      if (gate) {
        const p = rig.char.root.position;
        if (p.z >= gate.z - 0.3) {
          if (Math.abs(p.x - gate.x) <= 2.0) {
            gatesHit++;
            tricks.score += 100;
            boostKit.earn('trickSmall');   // a clean gate pays the boost — the slalom line is the fast line
            ctx.feel?.impact?.(0.15);
            SoundKit.play('score', { pitch: 1.4, volume: 0.35 });
            EffectsKit.burst(ctx.scene, rig.char.root.position.clone(), 'sparks');
            // SCORECARD FEEL (2026-09-15): the gate is the slalom's beat — a +100 pop at the rider and a gate-streak callout, so a
            // clean line reads as a line (the run measured 1.5 juice beats a minute)
            gateStreak++;
            ctx.juice.scorePop(rig.char.root.position.add(new Vector3(0, 2, 0)), gateStreak >= 3 ? `+100 · ${gateStreak} IN A ROW` : '+100', '#7dd3fc');
            console.info(`[SNOW-GATE] hit ${gatesHit}`);
            ctx.setHud({ banner: 'GATE ✓', score: tricks.score });
            crowd?.cheer(0.5);
          } else {
            SoundKit.play('miss', { volume: 0.3 });
            if (gateStreak >= 3) ctx.juice.callout(`STREAK OVER — ${gateStreak}`, '#94a3b8', 700);
            gateStreak = 0;
            console.info('[SNOW-GATE] miss');
            ctx.setHud({ banner: 'MISSED GATE' });
          }
          setTimeout(() => ctx.setHud({ banner: '' }), 700);
          nextGate++;
          ctx.setHud({ gates: `${gatesHit}/${world.markers.length}` });
        }
      }

      const trickBanner = tricks.update(dt);
      if (trickBanner) {
        ctx.setHud({ banner: trickBanner });
        setTimeout(() => ctx.setHud({ banner: '' }), 900);
      }
      // ── animation: the tree is the one owner (see the note at the top) ──
      if (landBeatT > 0) { landBeatT -= dt; if (landBeatT <= 0) animTree.clearBeat('land_clean', 'land_sketchy'); }
      if (bailBeatT > 0) { bailBeatT -= dt; if (bailBeatT <= 0) animTree.clearBeat('bail'); }
      airT = rig.rider.grounded ? 0 : airT + dt;   // a flicker of lost contact on the pitched piste is not air
      animTree.update({
        speed01: move.speed01, pushing: false, lean: rig.rider.grounded ? move.balance.lean : 0,
        airborne: !rig.rider.grounded && (airT > 0.1 || rig.rider.vel.y > 0.5),
        grabHeld: tricks.grabHeld, flipping: tricks.flipping, spinning: tricks.spinning,
        grinding: rig.rider.grinding !== null, manual: false,
        landing: landBeatT > 0 ? lastLanding : 'none', bailing: bailBeatT > 0, tucking: tuck > 0.5,
      });
      // THE POSTURE LAYER'S OWN READ. Same signals as the tree, in the shape BoardPosture wants: without this the
      // layer would sit on the idle stance for the whole run and the mount would be decoration.
      bio.speed01 = move.speed01;
      bio.pushing = false;
      bio.lean = rig.rider.grounded ? move.balance.lean : 0;
      bio.airborne = !rig.rider.grounded && (airT > 0.1 || rig.rider.vel.y > 0.5);
      bio.grabHeld = tricks.grabHeld;
      bio.flipping = tricks.flipping;
      bio.spinning = tricks.spinning;
      bio.grinding = rig.rider.grinding !== null;
      bio.manual = false;
      bio.landing = landBeatT > 0;
      bio.bailing = bailBeatT > 0;
      bio.tucking = tuck > 0.5;
      // THE BOARD BANKS. Skate and surf have rolled the root off their lean since BIOMECH-WAVE2 G6; the snowboard —
      // the discipline whose whole identity is laying a board over on edge — never did, so it carved bolt upright.
      // The same function, the same easing, so a bank means one thing across all three.
      if (!bio.airborne && !bio.bailing) {
        const wantRoll = boardBank(move.balance.lean, move.speed01);
        rig.char.root.rotation.z += (wantRoll - rig.char.root.rotation.z) * Math.min(1, 10 * dt);
      }
      trickLayer?.apply(dt, !rig.rider.grounded);   // TRICK POSE: the spin, the cork, the grab — after the mode's own root writes
      ctx.camDirector.setAir(!rig.rider.grounded && !rig.rider.grinding ? 1 : 0);   // the AIR CAM: the trick in the picture
      // Clamp at the edge of the snow, from the WORLD the venue built — the same
      // one-number rule skate's fence and surf's water edge now follow, so the
      // edge a player feels is always an edge they can see. Reading the module
      // constant here was the bug the skate fence already had: a wide venue
      // clamped the rider to a narrow corridor over visibly wider snow.
      const edge = world.bound - 1;
      if (Math.abs(rig.char.root.position.x) > edge) {
        rig.char.root.position.x = Math.sign(rig.char.root.position.x) * edge;
        // WALLS + SPEED (2026-09-15): the edge turns the board back onto the run. Clamping the position alone left the
        // board pointed off-piste, so the momentum model drove it into the edge every frame and the rider stuck there.
        if (move.wall(-Math.sign(rig.char.root.position.x), 0) && !rig.rider.grinding) rig.char.root.rotation.y = move.yaw;
        rig.rider.vel.x = move.vel.x; rig.rider.vel.z = move.vel.z;
        // BAIL HONESTY (2026-09-21): a rider who straight-lines off the piste into the edge at descent speed used to get
        // turned back onto the run in the ride pose, silently — the rock and the yeti both cost him a fall, and the edge,
        // the one he hits hardest, cost him nothing to read. It is the same wipe those two play, latched so one slam is
        // one fall, and it settles him on the piste pointing back down it: no reset, no respawn, push and go.
        if (move.slammedWall && !edgeHit && bailBeatT <= 0) {
          tricks.score = Math.max(0, tricks.score - ROCK_PENALTY);
          rig.rider.vel.scaleInPlace(0.35); move.vel.scaleInPlace(0.35);
          wipePunch(ctx);
          EffectsKit.burst(ctx.scene, rig.char.root.position.clone(), 'dust');
          bailBeatT = BAIL_BEAT_SEC;
          console.info('[SNOW-EDGE] slam');
          ctx.setHud({ score: tricks.score, banner: `OFF THE PISTE! -${ROCK_PENALTY}` });
          setTimeout(() => ctx.setHud({ banner: '' }), 700);
        }
        if (!edgeHit && !move.slammedWall) console.info('[SNOW-EDGE] turn');
        edgeHit = true;
      } else edgeHit = false;

      if (nextGate >= world.markers.length) {
        ended = true;
        SoundKit.play('whistle');
        finishPunch(ctx);   // A+ P0: run FINISHED — hit-stop + shake + short flash, once; the whistle stays
        const timeBonus = Math.max(0, Math.round((60 - elapsed) * 10));
        // phase 10 — GATE CRASHER: the title is the win condition. Half the gates or better (15 of 30) is the crash; fewer is
        // a finished run. Before this the run ended 'FINISHED' whatever happened and the card said 0 COINS.
        const crashed = gatesHit >= Math.ceil(world.markers.length * GATE_CRASHER_SHARE);
        console.info(`[SNOW-END] ${crashed ? 'win' : 'complete'} gates ${gatesHit}/${world.markers.length} score ${tricks.score + timeBonus}`);
        return ctx.end(crashed ? 'win' : 'complete', tricks.score + timeBonus, { gatesHit, gates: world.markers.length, elapsed: Math.round(elapsed), tricksLanded: tricks.landed, bestCombo: tricks.bestCombo });
      }
      ctx.camDirector.look(lookX, lookY, dt);
      ctx.camDirector.update(rig.char.root.position, rig.rider.vel, gate ?? null);
      // SPEED YOU CANNOT SEE IS NOT SPEED. The lens widens toward top speed and eases back, normalised
      // against THIS mode's ceiling so flat-out feels the same in every discipline. Frame-independent:
      // see SpeedFov (a per-frame lerp settles 2.4x faster at 144 fps than at 60).
      baseFov ??= ctx.camera.fov;
      ctx.camera.fov = stepSpeedFov(ctx.camera.fov, baseFov * (boostFx?.fovMult(boostKit) ?? 1), Math.hypot(rig.rider.vel.x, rig.rider.vel.z), snowTune.maxSpeed, dt);   // the momentum ceiling, not the Rider's clearance cap (BOARD-SPEED)
    },

    dispose() {
      trickLayer?.dispose(); trickLayer = null;
      boostFx?.dispose(); boostFx = null; boostPads?.dispose(); boostPads = null;
      posture?.dispose(); posture = null;
      yeti?.char.dispose(); yeti = null; yetiPool = null;
      crowd?.dispose();
      propsGone = true; props?.dispose(); props = null;
      rig?.dispose(); world?.dispose(); SoundKit.stopAmbient();
    },
  };
})();
