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

import { Vector3 } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { buildRig, TrickMachine, TRICKS, type BoardRig } from './boardCore';
import { trickFor, bestFitting, asTrickDef, heldTrickDir, type BoardTrick } from '../core/BoardTricks';   // the named vocabulary
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
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
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { RIDE_CONFIG as CFG } from './modeConfigs';
import { mountVenueProps, type VenuePropsHandle } from '../visual/VenueProps';

const YETI_SPAWN_GATE = 5;                 // bursts out after this gate clears
const YETI_CHASE_SEC = 8;
const YETI_CLEAR_PTS = 150;
const YETI_CATCH_PENALTY = 100;
const ROCK_PENALTY = 50;
const STUMBLE_IFRAME_SEC = 1.2;
/** Tuck depth at which the rider commits and starts SPENDING the boost meter. */
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
  let nextGate = 0, gatesHit = 0, elapsed = 0;
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
  const bio: BoardPostureInput = { ...BOARD_INPUT_IDLE };
  let bailBeatT = 0, landBeatT = 0, airT = 0;
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
  const move = new BoardMovement(tuneForVenue(SNOW_TUNING, readBoardVenue('snow')));   // Phase 12: carve weight + slope energy
  const mbus = new MomentumBus();
  let boost = 0;                                  // SSX boost meter 0..100
  let boosting = false;

  async function spawnYeti(ctx: ModeContext): Promise<void> {
    if (yetiDone || yeti) return;
    yetiDone = true;                       // one appearance per run, no matter what
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
      rig = await buildRig(ctx, CFG.heroUrl, new Vector3(0, 0.2, 4), 0, world.ground, '#ff6b3d', 'snowboard', { hardFloorY: pisteBottomY - 5, rayLength: 80, stickDown: 0.6 });
      tricks = new TrickMachine(rig, (h) => ctx.setHud(h), { anim: 'external', onBeat: (b) => { if (b === 'land') landBeatT = LAND_BEAT_SEC; else bailBeatT = BAIL_BEAT_SEC; } });
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
      bailBeatT = 0; landBeatT = 0; airT = 0;
      assertSpawned(ctx.scene, { hero: rig.char.root, minWorldMeshes: 20, modeId: 'snowboard' });
      nextGate = 0; gatesHit = 0; elapsed = 0; hudSec = -1; ended = false; stickX = 0; stickY = 0; tuck = 0;
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
      ctx.setHud({ score: 0, boost: 0, gates: `0/${world.markers.length}`, hint: 'Gates for points · JUMP rocks · grind the rails · watch the treeline…' });
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
        if (e.btn === 'B' || e.btn === 'X' || e.btn === 'Y') {
          const held = heldTrickDir(stickX, stickY);
          const air = Math.max(0.3, rig.rider.grounded ? 0 : AIR_BUDGET_SEC);
          const want = trickFor('snow', held, e.btn as BoardTrick['btn']);
          const fits = want && want.airSec <= air ? want : bestFitting('snow', e.btn as BoardTrick['btn'], air);
          if (fits) {
            tricks.start(asTrickDef(fits));
            ctx.setHud({ banner: fits.label });
            setTimeout(() => ctx.setHud({ banner: '' }), 520);
            // the boost still fills off a SPIN, which is what it always rewarded — now it scales with the rotation
            if (fits.spinDeg > 0) {
              boost = Math.min(BOOST_MAX, boost + BOOST_PER_SPIN * (fits.spinDeg / 360));
              ctx.setHud({ boost: Math.round(boost) });   // the meter has to move as it FILLS, not only as it drains
            }
          }
        }
        if (e.btn === 'R1') boosting = boost > 10;
      }
      if (e.t === 'button' && !e.pressed && e.btn === 'X') tricks.endGrab();
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;
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
      if (!boosting && tuck >= BOOST_TUCK && boost > 1) {
        boosting = true;
        SoundKit.play('powerUp', { pitch: 0.9, volume: 0.5 });
        ctx.setHud({ banner: 'BOOST' });
        setTimeout(() => ctx.setHud({ banner: '' }), 700);
      } else if (boosting && tuck < BOOST_TUCK * 0.6) {
        boosting = false;
      }
      if (boosting) {
        rig.rider.vel.scaleInPlace(1 + 0.9 * dt);
        boost = Math.max(0, boost - BOOST_DRAIN * dt);
        if (boost === 0) boosting = false;
        ctx.setHud({ boost: Math.round(boost) });
      }
      mbus.update(dt);

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
      if (gate) {
        const p = rig.char.root.position;
        if (p.z >= gate.z - 0.3) {
          if (Math.abs(p.x - gate.x) <= 2.0) {
            gatesHit++;
            tricks.score += 100;
            ctx.feel?.impact?.(0.15);
            SoundKit.play('score', { pitch: 1.4, volume: 0.35 });
            EffectsKit.burst(ctx.scene, rig.char.root.position.clone(), 'sparks');
            ctx.setHud({ banner: 'GATE ✓', score: tricks.score });
            crowd?.cheer(0.5);
          } else {
            SoundKit.play('miss', { volume: 0.3 });
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
        landing: landBeatT > 0 ? 'clean' : 'none', bailing: bailBeatT > 0, tucking: tuck > 0.5,
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
      // Clamp at the edge of the snow, from the WORLD the venue built — the same
      // one-number rule skate's fence and surf's water edge now follow, so the
      // edge a player feels is always an edge they can see. Reading the module
      // constant here was the bug the skate fence already had: a wide venue
      // clamped the rider to a narrow corridor over visibly wider snow.
      const edge = world.bound - 1;
      rig.char.root.position.x = Math.max(-edge, Math.min(edge, rig.char.root.position.x));

      if (nextGate >= world.markers.length) {
        ended = true;
        SoundKit.play('whistle');
        finishPunch(ctx);   // A+ P0: run FINISHED — hit-stop + shake + short flash, once; the whistle stays
        const timeBonus = Math.max(0, Math.round((60 - elapsed) * 10));
        return ctx.end('FINISHED', tricks.score + timeBonus, { gatesHit, elapsed: Math.round(elapsed) });
      }
      ctx.camDirector.look(lookX, lookY, dt);
      ctx.camDirector.update(rig.char.root.position, rig.rider.vel, gate ?? null);
    },

    dispose() {
      posture?.dispose(); posture = null;
      yeti?.char.dispose(); yeti = null; yetiPool = null;
      crowd?.dispose();
      propsGone = true; props?.dispose(); props = null;
      rig?.dispose(); world?.dispose(); SoundKit.stopAmbient();
    },
  };
})();
