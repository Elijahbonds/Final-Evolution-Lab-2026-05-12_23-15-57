// BaseballInningsMode — BASEBALL-3INN (2026-10-22, ALL-MODES-TO-75 §6; PM call: baseball is its own mode at /play/baseball,
// Derby moves to /play/derby). Three innings at the plate: the pitcher winds up and throws, you swing on the crossing.
//
// This file is the VIEW. The rules and the clock — the graded swing, the count, the innings, the end, the banners — are
// baseballGame.ts, pure and played headless by baseballGame.test.ts. Every beat here (the wind-up, the release, the swing,
// the crack on the contact frame, the banner and its clear, the end) is called from BaseballGame.tick on the game clock,
// so a pause holds all of it. No setTimeout, no Math.random().
//
// Why not BaseballMode.ts: that stub is excluded from tsc (tsconfig.json) and pinned dead by controlsScreen.scan.test.ts
// (DEAD_FILES; "nothing registered imports them"), so it stays as it was. The registry: BASEBALL-REGISTER (2026-10-22) put
// this definition in MODES.baseball and ENABLED_BABYLON_MODES with its own body row, and moved Derby to modeId 'derby'.
// /play/baseball still hands it straight to the timing host (TimingHostOpts.def), the same definition.
//
// Bodies and clips: the batter and the pitcher run anim/baseballTree.ts — the bat stance and swing, the over-the-top pitch
// (whose first PITCH_RELEASE_SEC is the leg lift: the wind-up), the jump on a home run. Every clip already exists.
//
// BASEBALL-FEEL (2026-10-23): every slot runs off a game event through baseballSlots.ts (pure, played headless by
// baseballFeel.test.ts); contact and power stop at their own points on the swing clip; each contact holds a hit-stop
// (contact < power ≤ homer, ≤ 120 ms); the batter holds Derby's two-hand bat, drawn as bat.glb.

import { MeshBuilder, Vector3 } from '@babylonjs/core';
import type { AbstractMesh } from '@babylonjs/core';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import type { SpawnedCharacter } from '../core/CharacterLibrary';
import { assertSpawned } from '../core/FrameGuard';
import { BaseballAnimTree, type BaseballAnimInput } from '../anim/baseballTree';
import { SoundKit } from '../audio/SoundKit';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { readPlaceLook } from '../nexus/placeLooks';
import { EffectsKit, type AmbientHandle } from '../visual/EffectsKit';
import { spawnAthlete, spawnFoe, buildPlateAndMound, buildBallparkOutfield, Flight } from './aimSwingCore';
import { pitchSpec, PITCH_RELEASE_SEC } from './baseballPitch';   // BASEBALL-PITCH-MOD: its own copy, so Derby/golf/shootout clips stay out of baseball's closure
import { derbySeed } from '../core/DerbyLoop';
import { PRECISION_CONFIG as CFG } from './modeConfigs';
import { BaseballGame, RELEASE_Z, SWING_WINDOW_SEC, type SwingGrade } from './baseballGame';
import { mountTwoHandBat, type BatHandle } from './baseballBat';
import { BaseballSlots, SlotDriver, hitStopFor, SWING_STOP_T, swingWeightFor, type SwingWeight } from './baseballSlots';

/** Derby's batting frame (precisionModes.ts battingCam): behind and left of the batter, the pitcher mid-frame. */
const BATTING_CAM = new Vector3(-1.75, 1.85, -3.4);
const PITCHER_VIEW = new Vector3(0, 1.45, 18);
/** Where the ball leaves the hand and where it crosses (Derby: released at 1.5 m over the mound, in the zone at ~1.05 m). */
const RELEASE_Y = 1.5, PLATE_Y = 1.05;

const REST: BaseballAnimInput = {
  pitching: false, windingUp: false, releasing: false, batting: false, swinging: null,
  fielding: 'none', throwing: false, running: false, sliding: false,
};

/** The ball off the bat, by what the swing earned (m/s). `side` −1..1: early pulls to the left field line, late goes right. */
export function launchFor(g: SwingGrade): { x: number; y: number; z: number } {
  const side = Math.max(-1, Math.min(1, g.offsetSec / (SWING_WINDOW_SEC / 2)));
  switch (g.kind) {
    case 'homer': return { x: side * 4, y: 17, z: 30 };
    case 'double': return { x: side * 7, y: 7, z: 24 };
    case 'single': return { x: side * 9, y: 2.5, z: 17 };
    default: return { x: side * 3, y: 14, z: 7 };   // weak contact: the pop-up an infielder settles under
  }
}

export const BaseballInningsMode: ModeDefinition = (() => {
  let batter: SpawnedCharacter | null = null, pitcher: SpawnedCharacter | null = null;
  let batterTree: BaseballAnimTree | null = null, pitcherTree: BaseballAnimTree | null = null;
  let ball: AbstractMesh | null = null, flight: Flight | null = null;
  let ambient: AmbientHandle | null = null;
  let venue: VenueHandle | null = null;
  let game: BaseballGame | null = null;
  /** The slot each body is in, off the game's events (baseballSlots). */
  let slots: BaseballSlots | null = null;
  let bat: BatHandle | null = null, batSec: number | null = null;
  let driver: SlotDriver | null = null, swingW: SwingWeight = 'contact', swingHeld = false;
  /** The pitch on its way in: seconds since the release and its speed (null: nothing inbound). */
  let inbound: { t: number; speed: number } | null = null;

  return {
    modeId: 'baseball', mood: 'goldenHour', camPreset: 'court',

    async load(ctx: ModeContext) {
      // PLACE (BASEBALL-3INN, environmentCoverage): the derby's ballpark spec under baseball's own place pick (Catalina
      // Ballpark / Sandlot / Night Game), the way DerbyMode mounts it; the kit field only if the spec is missing.
      venue = mountVenue(ctx, 'derby', { keepGameplayCamera: true, look: readPlaceLook('baseball') });
      if (!venue) VenueKit.buildField(ctx.scene, 'ballpark');
      buildPlateAndMound(ctx.scene);
      buildBallparkOutfield(ctx.scene);
      ambient = EffectsKit.ambient(ctx.scene, 'park');
      SoundKit.startAmbient('stadium');

      batter = await spawnAthlete(ctx, CFG.heroUrl, new Vector3(-0.7, 0, 0), Math.PI / 2, 'baseball_bat_stance');
      pitcher = await spawnFoe(ctx, CFG.heroUrl, new Vector3(0, 0.35, 18), Math.PI, 'idle_stand');
      batterTree = new BaseballAnimTree(batter.animator);
      pitcherTree = new BaseballAnimTree(pitcher.animator);
      batterTree.update({ ...REST, batting: true });
      pitcherTree.update(REST);
      bat?.dispose(); bat = mountTwoHandBat(ctx.scene, batter, () => batSec);   // Derby's two-hand bat, drawn as bat.glb

      ball = MeshBuilder.CreateSphere('baseball_ball', { diameter: 0.12 }, ctx.scene);
      ball.material = VenueKit.paint(ctx.scene, 'baseball_ball_m', '#f7f7f2', 0.45, 0.35);
      ball.isPickable = false;
      ball.setEnabled(false);
      flight = new Flight(ball, -9.8);

      ctx.heroRef.current = batter.root;
      ctx.objectiveRef.current = ball.position;
      ctx.camDirector.setFixed(BATTING_CAM, 1.25, true);
      ctx.camera.setTarget(Vector3.Lerp(batter.root.position.add(new Vector3(0, 1.25, 0)), PITCHER_VIEW, 0.4));
      assertSpawned(ctx.scene, { hero: batter.root, minWorldMeshes: 5, modeId: 'baseball' });

      slots = new BaseballSlots(PITCH_RELEASE_SEC); driver = new SlotDriver(batterTree, pitcherTree); batSec = null; swingHeld = false; inbound = null;
      const seed = derbySeed();
      game?.dispose();
      game = new BaseballGame({
        windup: () => {
          slots?.windup();
          ball?.setEnabled(false);
          if (flight) flight.active = false;
        },
        release: (p) => {
          inbound = { t: 0, speed: p.speed };
          ball?.position.set(0, RELEASE_Y, RELEASE_Z); ball?.setEnabled(true);
        },
        swing: (g) => {
          slots?.swing(g); swingW = swingWeightFor(g.kind); swingHeld = false;
          SoundKit.play('whoosh');
        },
        contact: (g) => {
          // the crack on the contact frame: the press that connected, with the ball at the plate (±0.15 s)
          SoundKit.play('impact', { pitch: g.kind === 'homer' ? 1.5 : 1.25, volume: 0.9 });
          ctx.juice.hitStop(hitStopFor(g.kind));   // contact < power ≤ homer, all ≤ HIT_STOP_CAP_MS
          ctx.juice.shake(g.kind === 'homer' ? 0.12 : 0.06, 120);
          slots?.contact(g);
          if (g.kind === 'homer') SoundKit.play('crowdCheer');
          inbound = null;
          if (ball && flight) {
            ball.setEnabled(true);
            const v = launchFor(g);
            flight.launch(new Vector3(ball.position.x, ball.position.y, Math.max(ball.position.z, 0.3)), new Vector3(v.x, v.y, v.z));
          }
        },
        strikeout: () => slots?.strikeout(),
        banner: (text) => ctx.setHud({ banner: text }),
        hud: (patch) => ctx.setHud(patch),
        end: (r) => ctx.end(r.outcome, r.score, r.stats),
      }, (n) => pitchSpec(n, seed), PITCH_RELEASE_SEC);
      game.start();
    },

    onInput(_ctx: ModeContext, e: FelInput) {
      // A swings. Nothing else ends or skips the game: the last out does (the stub's B-to-quit is gone).
      if (e.t === 'button' && e.btn === 'A' && e.pressed) game?.press();
    },

    update(_ctx: ModeContext, dt: number) {
      game?.tick(dt);   // the only clock: pitches, banners and the end all run off it, so a pause holds them

      if (inbound && ball) {
        inbound.t += dt;
        const z = RELEASE_Z - inbound.speed * inbound.t;
        const f = Math.min(1, Math.max(0, (RELEASE_Z - z) / RELEASE_Z));
        ball.position.set(0, RELEASE_Y + (PLATE_Y - RELEASE_Y) * f, z);
        if (z < -2.5) { inbound = null; ball.setEnabled(false); }   // into the catcher's mitt
      }
      if (flight?.active) flight.step(dt);

      if (!slots) return;
      const f = slots.tick(dt);
      driver?.apply(f);   // a new beat re-fires even when it is the same slot as the last (two strikeouts in a row)
      batSec = f.batSec;
      // the swing's stop point: contact checks at t 0.42, power drives to 0.55 — the clip holds there
      if (f.batter.swinging && !swingHeld && batSec != null && batSec >= SWING_STOP_T[swingW]) {
        swingHeld = true;
        batter?.animator.setSpeed(swingW === 'power' ? 'baseball_contact_drive' : 'baseball_swing_full', 0);
      }
    },

    dispose() {
      game?.dispose(); game = null; slots = null; driver = null;
      bat?.dispose(); bat = null; batSec = null;
      ambient?.dispose(); ambient = null;
      venue?.dispose(); venue = null;
      batter?.dispose(); pitcher?.dispose(); batter = null; pitcher = null;
      batterTree = null; pitcherTree = null;
      ball = null; flight = null; inbound = null;
    },
  };
})();
