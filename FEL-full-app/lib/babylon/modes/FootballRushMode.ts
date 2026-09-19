// FootballRushMode v5 — REPLACES the M45 file. The street-football feel
// pass (mechanics reference: NFL Street's truck/juke-string game — original
// implementation). Two additions on top of everything M45 shipped
// (breakaway, coins, flanker AI, map-size fixes — all kept):
//   TRUCK — hold the trigger to lower the shoulder (0.5s window, 2.5s
//     cooldown). Contact during the window doesn't tackle you — it knocks
//     the DEFENDER down: they take the fall clip, you barrel through with a
//     brief speed dip, +30 pts. High commitment (you steer worse while
//     trucking) but it beats a tackle head-on — the missing power answer to
//     the existing finesse answers (jukes/spin/hurdle).
//   STYLE CHAIN — stringing DIFFERENT evade types in one drive (juke →
//     spin → hurdle → truck) pays a stacking style bonus per new type.
//     Spamming one move pays base; variety pays double-plus — the same
//     "style over yardage" scoring philosophy street football ran on.
// Touch deck note: TRUCK takes SPIN's slot on the touch overlay (4-button
// budget); SPIN stays available on keyboard (B). See modeVerbs v4.

import { Vector3, MeshBuilder, type Mesh } from '@babylonjs/core';
import { CATCH, catchGrade, catchStack, type CatchGrade, BLOCK, blockerTarget, blockerLeadPoint, engageRead, hurdleRead, GUNSLING, gunslingRead, vaultArc, SLINGSHOT, parallelRead, draftingRead, slingshotStep, STIFF, stiffArmRead, LANES, railRead, rampAt, tunnelAt, POUNCE, pounceRead, STRIP, fumbleRead, type Exposure } from '../core/KickoffReturn';   // KICKOFF RETURN (owner brief, 2026-09-18)
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { Mob, MobPool, STEERING_PRESETS } from '../core/MobSteering';
import { CoinField } from '../core/Pickups';
// HIT-CAM. This logic was written, unit-tested (scripts/football-cam-tests.ts) and then
// wired ONLY into components/games/football-3d.tsx — the three.js fallback. Football has
// been served from Babylon since rollout wave 1 (flags.ts: football: true), so the cut has
// not fired for anyone in a long time. Same module, no re-derivation: it is pure geometry
// and a small state machine, with no renderer in it.
import {
  countConverging, makeBroadcastCutState, updateBroadcastCut, broadcastBlend, CONVERGE_RADIUS_YD,
} from '../../feel/football-cam';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { readProfile, profileFor, blunders, DEFAULT_TIER } from '../core/Difficulty';
// BIOMECH-WAVE2 (2026-09-09) — the game-wide bar on the rush (SPEC-FEL-BIOMECH-GAMEWIDE G1–G6). Measured on 2942860:
//   G4/G5  this mode had NO ANIMATION OWNER. It played clips from five places — a per-frame
//          `animator.play(footballCarryRun, { loop: true })` inside update(), the dodge one-shot, the truck, the tackle
//          and the touchdown celebrate — and CharacterAnimator only dedupes the SAME clip, so the per-frame carry run
//          cut every one-shot on the next frame. The TOUCHDOWN SPIKE never played at all (one frame, then the carry
//          run, then `newDrive` reset the body on the same frame). A `FootballAnimTree` had been written and
//          unit-tested since Mode 4 Phase 8 and was never wired in; it is the one owner now, and the score HOLDS.
//   G3     a juke TELEPORTED the runner 3.2 m sideways in the frame the button went down (`root.position.x += d.dx`)
//          while the juke clip played a body that never went anywhere. The cut is a slide over the move's own window.
//   G1/G5  nothing touched the thoracic chain or the head: a runner reading a front never looked at the man in front
//          of him. The Posture Poses layer carries the body per window, eyes on the nearest defender inside 9 m.
import { FootballAnimTree, type FootballAnimInput } from '../anim/footballTree';
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { footballWindow, runPose, FOOTBALL_INPUT_IDLE, type FootballPostureInput } from '../core/RunPosture';
import { assertSpawned } from '../core/FrameGuard';
import { refuse } from '../core/Refusal';
import { SoundKit } from '../audio/SoundKit';
import { EffectsKit } from '../visual/EffectsKit';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';
import { readPlaceLook } from '../nexus/placeLooks';
import { Onlookers } from '../visual/Onlookers';
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { FOOTBALL_CONFIG as CFG } from './modeConfigs';
// FOOTBALL UPGRADE (owner, 2026-09-18: "football, tennis and soccer upgrades next"): the carrier is a body with
// MOMENTUM (RushRun), the field has WEATHER (rain softens the cut, snow slows the run, all capped in WeatherKit), the
// BREAKAWAY is a meter with a line per evade, and the read is on the turf: your line, and the ring where the nearest
// man meets it.
import { stepRun, cutSlideSec, breakawayMeter, interceptPoint, RUN } from '../core/RushRun';
import { mountAimArrow, mountRing, type AimArrowHandle, type RingHandle } from '../visual/AimArrow';
import { WeatherKit } from '../core/WeatherKit';
import { readWeather } from '../nexus/weather';
import { mountWeatherFx, type WeatherFxHandle } from '../premium/WeatherFx';
import { stepYaw } from '../anim/LocoBus';   // SHARED-ANIM-BUS: the shared facing slew

let rushVenue: VenueHandle | null = null;   // ship pass 4: the mounted venue spec, disposed with the mode

// MAP-SIZE FIX: VenueKit.buildGridiron widened from 22m to 44m to match a
// real field's sideline-to-sideline width — this clamp has to widen with it
// or the runner stays boxed into the old narrow corridor on a visually wider
// field.
const FIELD_HALF_X = 20;
// MAP-SIZE FIX (M44): FIELD_LENGTH matches the real 90-unit venue.
const FIELD_LENGTH = 40;
const DEFENDER_MAX_DEPTH = 22;
const BREAKAWAY_THRESHOLD = 3;
const BREAKAWAY_SPEED_MULT = 1.25;
const BREAKAWAY_SEC = 4;
const TRUCK_WINDOW_SEC = 0.5;
const TRUCK_COOLDOWN_SEC = 2.5;
/** MODE-STICK-FACE: the runner's yaw slews onto his line at this rate (rad/s) — a cut turns the body, not a snap. */
const TURN_RATE = 10;
const TRUCK_PTS = 30;
/** A contact puff leaves the turf at the players' feet, never their torso (ANIM-SURGICAL — the "BODY melt"). */
const TURF_Y = 0.05;
const STYLE_CHAIN_PTS = 25;                    // per NEW evade type in a drive
const DODGES = {
  X: { gesture: 'footballJukeLeft' as const,  dx: -3.2, iframes: 0.45, pts: 15 },
  Y: { gesture: 'footballJukeRight' as const, dx: 3.2,  iframes: 0.45, pts: 15 },
  B: { gesture: 'footballSpin' as const,      dx: 0,    iframes: 0.6,  pts: 25 },
  A: { gesture: 'footballHurdle' as const,    dx: 0,    iframes: 0.5,  pts: 20 },
} as const;

export const FootballRushMode: ModeDefinition = (() => {
  let runner: SpawnedCharacter;
  let pool = new MobPool();
  let defenders: Mob[] = [];
  const hitCut = makeBroadcastCutState();
  let coins: CoinField | null = null;
  let down = 1, toGo = 10, lineOfScrimmage = 0, yards = 0, score = 0, evades = 0;
  // Owner decision (2026-09-05): a session is THREE drives. Each ends on a touchdown or a turnover on downs; the
  // session ends after the third. Before this, a runner who kept gaining reset to first down forever and never posted.
  const DRIVES = 3; let drive = 1;
  let driveEvades = 0, breakawaySec = 0;
  /** A+ mission #9 (Madden readability): the drive card between drives — yards, evades, how it ended. */
  let driveLog: { name: string; score: number | string; line: string }[] = [];
  let driveYards = 0;
  const YARD = 0.9144;
  function logDrive(result: string): void {
    driveLog.push({ name: `DRIVE ${drive}`, score: driveYards, line: `${result} · ${driveEvades} EVADES` });
  }
  let iframeSec = 0, dodging = false, ended = false;
  /** BIOMECH-WAVE2: the ONE owner of the runner's clips, plus the beats the mode latches for it. */
  let animTree: FootballAnimTree | null = null;
  let move: 'juke' | 'spin' | 'stiffArm' | null = null, moveClip = '', moveUntil = 0;
  /** The juke's lateral cut, run as a SLIDE over the move's window instead of a one-frame teleport. */
  let cutFrom = 0, cutTo = 0, cutT = 0, cutSec = 0;
  const MOVE_SEC = 0.5;
  /** The touchdown holds: the spike is the mode's biggest end pose and the drive used to reset on the same frame. */
  const TD_HOLD_SEC = 1.4;
  let tdPending = false, celebrateUntil = 0;
  let posture: { layer: PostureLayer; dispose(): void } | null = null;
  const bio: FootballPostureInput = { ...FOOTBALL_INPUT_IDLE };
  /** HUMAN-READY-HYGIENE (2026-09-07): tackled → DOWN until the reset. The runner kept running at full speed for the 1 s
   *  between the tackle and the pre-snap reset (measured: +7 m, 6 free yards a down, the fall clip cut by the run loop one
   *  frame later) and then jogged ON THE SPOT at the line through the whole pre-snap read (left foot 5 m in 1.4 s, root 0). */
  let downed = false;
  let truckSec = 0, truckCooldown = 0, trucks = 0;
  let truckHeldWas = false;   // the trigger's own edge: a HOLD is one pull, so only its first frame is answered
  // A+ P0 juice (PM brief FOOTBALL-A-PLUS-P0, 2026-09-06): the three Street beats each get ONE punch —
  // latched per truck window / per play / per drive so a second body in the same beat never re-fires it.
  let truckLatch = false, tackleLatch = false, tdLatch = false;
  let styleTypes = new Set<string>();          // evade types used this drive
  let lastDodgeType = '';                      // which move earned the current iframes
  let stickX = 0, stickY = 0;
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  /** MOMENTUM: the carrier's velocity the stick chases (RushRun). */
  let run = { vx: 0, vz: 0 };
  // ── KICKOFF RETURN (owner brief, 2026-09-18): the launch catch, the blocking wall, the gunslinger vault, the slingshot,
  // the stiff-arm, the three lanes, the gunners' pounce and the strip. Pure reads in core/KickoffReturn; this is the wiring.
  let kick: { k: number; caught: boolean; pressed: CatchGrade | null } | null = null;
  let kickBall: Mesh | null = null;
  let blockers: { char: SpawnedCharacter; side: 1 | -1; busy: number; moving: boolean; speed: number }[] = [];
  let launchSec = 0, launchMult = 1;          // a speed burst (catapult / vault / slingshot / tunnel exit): seconds left, its multiplier
  let vault: { from: Vector3; dir: Vector3; t: number } | null = null;
  let slingGauge = 0, slingCool = 0, immuneSec = 0, stiffCool = 0, slideHeld = false, gunslingNow: Mob | null = null;
  let lane: 'turf' | 'rail' | 'air' | 'tunnel' = 'turf'; let railSec = 0, railSide: 1 | -1 = 1, airT = 0, airSec = 0;
  let laneMeshes: Mesh[] = [];
  let fumble: { ball: Mesh; t: number } | null = null;
  const pounces = new Map<Mob, { t: number; dir: Vector3 }>(); let pounceCool = 0;
  const defPrev = new Map<Mob, Vector3>(), defVel = new Map<Mob, Vector3>();
  let laneHud = '', gaugeHud = -1;
  const ret = { catches: 0, perfect: 0, engages: 0, catapults: 0, vaults: 0, slings: 0, stiffs: 0, rails: 0, ramps: 0, tunnels: 0, bonks: 0, pounces: 0, fumbles: 0, recovered: 0, outOfBounds: 0 };
  const exposure = (): Exposure => vault ? 'vault' : lane === 'rail' ? 'rail' : lane === 'air' ? 'air' : lane === 'tunnel' ? 'slide' : null;
  const standingGunners = () => defenders.filter((m) => m.state !== 'downed' && m.char.root.isEnabled()).map((m) => ({ x: m.char.root.position.x, z: m.char.root.position.z, down: false, mob: m }));
  const downedGunners = () => defenders.filter((m) => m.state === 'downed').map((m) => ({ x: m.char.root.position.x, z: m.char.root.position.z }));
  const me2 = () => ({ x: runner.root.position.x, z: runner.root.position.z });
  const vel2 = () => ({ x: run.vx, z: run.vz });
  function flash(ctx: ModeContext, banner: string, ms = 700): void { ctx.setHud({ banner, score }); setTimeout(() => ctx.setHud({ banner: '' }), ms); }
  function burst(sec: number, mult: number): void { launchSec = Math.max(launchSec, sec); launchMult = Math.max(launchMult, mult); }
  let lineArrow: AimArrowHandle | null = null, pursuit: RingHandle | null = null;
  let weather: WeatherKit = new WeatherKit(); let weatherFx: WeatherFxHandle | null = null;
  /** The nearest defender's closing speed for the pursuit read (the steering presets top out near this). */
  const DEF_SPEED = 6.4;
  /** L4 — sideline banks. A drive is watched; 2 draws, instanced. */
  let gallery: Onlookers | null = null;
  // PRE-SNAP — every play begins SET: the defense holds its alignment and
  // the ball snaps on the PLAYER's call (first forward push), auto-snapping
  // at 3s so an idle phone never stalls. The benchmark's lock justification
  // opens with "pre-snap reads" and the mode had none: the defense was live
  // before you could see it. The read is the snap's timing choice.
  let preSnap = true, preSnapT = 0;
  const PRESNAP_AUTOSNAP_SEC = 3;
  // PRE-SNAP DISGUISE (sign-off carry-forward, 2026-09-03): one defender SHOWS
  // blitz — creeping toward the line while the defense is set — and at the
  // snap either comes (a real blitz, fast) or drops back into coverage. The
  // alignment you read is no longer always the coverage you get; the read is
  // whether to snap into the show or wait it out.
  let showBlitz: Mob | null = null, showBlitzComes = false;
  const SHOW_BLITZ_CHANCE = 0.55, SHOW_BLITZ_CREEP = 0.9, SHOW_BLITZ_DROP_SEC = 0.8;

  /** The picked opponent. Read at load, never at module scope — see modes/shipStatus and the SSR trap. */
  let tier = profileFor(DEFAULT_TIER);

  function snap(ctx: ModeContext): void {
    if (!preSnap) return;
    preSnap = false;
    tackleLatch = false;                       // A+ P0: one tackle weight per play
    // DIFFICULTY IS THE SNAP REACTION, not a speed multiplier (2026-09-13). Phase 0 measured this mode with
    // no tiering at all. What separates a rookie defense from an elite one is not how fast they run — it is
    // how long they take to READ the play, and whether anybody blows their assignment. A rookie is 420 ms
    // late off the snap and busts one now and then; an elite is moving at 120 ms and nobody busts. Per-
    // defender jitter on top, so a defense never releases as one block.
    for (const [i, m] of defenders.entries()) {
      if (m === showBlitz && !showBlitzComes) {
        // the show was a bluff: he drops, and starts late
        m.char.root.position.z += 3.5;
        setTimeout(() => { if (!ended) m.startPursuit(); }, SHOW_BLITZ_DROP_SEC * 1000);
        continue;
      }
      const jitter = i * 35;
      // an unforced error: this defender reads it wrong and is a long beat late getting going
      const bust = blunders(tier) ? 520 : 0;
      const delay = tier.reactionMs + jitter + bust;
      setTimeout(() => { if (!ended) m.startPursuit(); }, delay);
    }
    if (showBlitz) {
      ctx.setHud({ banner: showBlitzComes ? 'BLITZ!' : 'HE DROPPED — coverage' });
      setTimeout(() => ctx.setHud({ banner: '' }), 700);
    }
    SoundKit.play('uiTick', { pitch: 1.3, volume: 0.4 });
    ctx.setHud({ hint: 'Juke, spin, hurdle — or HOLD TRUCK and run THROUGH them', banner: 'BALL!' });
    setTimeout(() => ctx.setHud({ banner: '' }), 500);
  }

  function layCoins(ctx: ModeContext, fromZ: number): void {
    coins?.dispose();
    coins = new CoinField(ctx.scene);
    const toZ = Math.min(FIELD_LENGTH - 2, fromZ + 24);
    coins.line(new Vector3(-3, 0.4, fromZ + 4), new Vector3(3, 0.4, toZ), 8);
  }

  /** Variety pay: first use of each evade TYPE in a drive stacks a bonus. */
  function styleCredit(ctx: ModeContext, type: string): void {
    if (styleTypes.has(type)) return;
    styleTypes.add(type);
    if (styleTypes.size >= 2) {
      const bonus = STYLE_CHAIN_PTS * (styleTypes.size - 1);
      score += bonus;
      SoundKit.play('uiTick', { pitch: 1 + styleTypes.size * 0.15 });
      ctx.setHud({ score, banner: `STYLE CHAIN x${styleTypes.size} +${bonus}` });
      setTimeout(() => ctx.setHud({ banner: '' }), 700);
    }
  }

  /**
   * THE FRONT IS POOLED (SCORECARD PERF, 2026-09-15). Every down used to dispose the defenders and CharacterLibrary.spawn
   * three to six fresh bodies — each one a body clone plus its whole clip library built again (the authored pose clips,
   * the captured opponent set, IK-fitted per key). That was the stall the scorecard measured: fps p10 4 at a p50 of 60,
   * multi-second hitches at every SET. The six bodies are built once, in load, and each down re-places the ones it needs.
   */
  const DEFENDER_POOL = 6;
  let defenderBodies: SpawnedCharacter[] = [];
  async function buildDefenderBodies(ctx: ModeContext): Promise<void> {
    defenderBodies = await Promise.all(Array.from({ length: DEFENDER_POOL }, (_, i) => CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
      position: new Vector3(0, -50, -50 - i * 3), yawRad: Math.PI,
      tint: i % 2 ? '#8b1e2d' : '#5a1220',
      startClip: SPORT_CLIP.idle,
    })));
    for (const char of defenderBodies) {
      neverBindPose(char.animator, SPORT_CLIP.idle);
      installSafePlay(char.animator, 'football-defender');
      ctx.groundLock?.track(char.root, char.skeleton);
      char.animator.park();   // a parked body runs NO clip: a disabled root whose clip still advances trips the skinning-stall watch
      char.root.setEnabled(false);
    }
  }

  async function spawnDefense(ctx: ModeContext): Promise<void> {
    defenders = [];
    pool = new MobPool();
    for (const char of defenderBodies) { char.animator.park(); char.root.setEnabled(false); }   // parked: no clip advancing off-screen

    const progress = Math.max(0, runner.root.position.z);
    const count = Math.min(3 + Math.floor(progress / (FIELD_LENGTH / 3)), DEFENDER_POOL, defenderBodies.length);
    const remaining = Math.max(6, FIELD_LENGTH - progress);
    for (let i = 0; i < count; i++) {
      const lane = ((i * 2 + down) % 5) - 2;
      const rawDepth = 6 + i * 5 + (i % 2) * 3;
      const depth = Math.min(rawDepth, DEFENDER_MAX_DEPTH, remaining * 0.85);
      const char = defenderBodies[i];
      // MAP-SIZE FIX: was *3.4, tuned for the old 22m-wide field — spread
      // to *8 so defenders use the width of the new 44m field instead of
      // bunching into its center third.
      char.root.position.set(lane * 8, 0, runner.root.position.z + depth);
      char.root.rotationQuaternion = null;
      char.root.rotation.set(0, Math.PI, 0);   // a trucked or tackled body is set back upright, facing the offense
      char.root.setEnabled(true);
      char.animator.play(SPORT_CLIP.idle, { loop: true, fadeSec: 0, restart: true });
      const archetype = i % 3 === 2 ? 'flanker' : 'defender';
      const mob = new Mob(char, STEERING_PRESETS[archetype]);
      // NO pursuit yet — defenders stand in their alignment until the snap
      // (D1: the pre-snap read). startPursuit moves to snap().
      pool.add(mob);
      defenders.push(mob);
    }
    // one shown blitz per alignment, once the defense has more than a pair
    showBlitz = defenders.length >= 3 && Math.random() < 0.6 ? defenders[0] : null;
    showBlitzComes = Math.random() < SHOW_BLITZ_CHANCE;
  }

  // ── A+ P0 juice — NFL Street weight, three beats only. No hang slowMo, no juice.impact({slow}), no HoopJuice. ────────
  /** The truck BREAK: the contact that downs the defender. Hit-stop + shake + one low thud, once per truck window. */
  function truckPunch(ctx: ModeContext): void {
    if (truckLatch) return;
    truckLatch = true;
    ctx.juice.hitStop(50);
    ctx.juice.shake(0.10, 140);
    SoundKit.play('impact', { pitch: 0.6, volume: 0.7 });
    console.info('[FB-JUICE] truck punch');
  }
  /** Getting tackled: heavier than the evade tick (0.12) — the feel hit carries its own hit-stop + thud + haptic, so only a
   *  camera shake and the crowd's groan are added on top. Once per play. */
  function tackleWeight(ctx: ModeContext): void {
    if (tackleLatch) return;
    tackleLatch = true;
    ctx.feel?.impact?.(0.65);
    ctx.juice.shake(0.08, 160);
    SoundKit.play('crowdGroan', { volume: 0.45 });
    console.info('[FB-JUICE] tackle weight');
  }
  /** TOUCHDOWN: hit-stop + shake + gold flash + ONE slam thud, once per drive. Confetti, score SFX and the cheer stay. */
  function tdPunch(ctx: ModeContext): void {
    if (tdLatch) return;
    tdLatch = true;
    ctx.juice.hitStop(60);
    ctx.juice.shake(0.12, 160);
    ctx.juice.flash('#ffd75e', 120);
    SoundKit.play('impact', { pitch: 0.7, volume: 0.8 });
    console.info('[FB-JUICE] td punch');
  }

  /** Eight metres down his own line, at chest height — where the carrier is RUNNING. */
  function lineAhead(): Vector3 {
    return runner.root.position.add(new Vector3(Math.sin(runner.root.rotation.y) * 8, 1.4, Math.cos(runner.root.rotation.y) * 8));
  }
  /** The man he has to beat: the nearest defender inside 9 m, at chest height. Null out of range — then the eyes go
   *  down his own line instead (a runner in space looks where he is running, not back at the pursuit). */
  function threat(): Vector3 | null {
    let best: Mob | null = null, bd = Infinity;
    for (const m of defenders) { const d = Vector3.Distance(m.char.root.position, runner.root.position); if (d < bd) { bd = d; best = m; } }
    return best && bd <= 9 ? best.char.root.position.add(new Vector3(0, 1.35, 0)) : null;
  }

  /** BIOMECH-WAVE2: one read of the play, two consumers — the tree picks the clip, the Posture Poses layer picks the
   *  body under it. Called once per frame in EVERY phase (the pre-snap read included, which is where the runner used
   *  to jog on the spot). */
  function drive3D(speed01: number, trucking: boolean): void {
    const t = performance.now();
    if (move && t > moveUntil) { move = null; dodging = false; }   // a move the tree never settled (safety)
    const celebrating = t < celebrateUntil;
    bio.presnap = preSnap; bio.speed01 = speed01;
    bio.move = move === 'spin' ? 'spin' : move === 'stiffArm' ? 'hurdle' : move === 'juke' ? 'juke' : null;
    bio.trucking = trucking; bio.downed = downed; bio.celebrating = celebrating;
    const input: FootballAnimInput = {
      presnap: preSnap, snapped: !preSnap, isQB: false, droppingBack: false, throwing: false,
      runningRoute: false, carrying: !preSnap && !downed && speed01 > 0.15,
      move, moveClip: move ? moveClip : undefined, catching: 'none',
      beingTackled: downed, blocking: false, rushing: false, celebrating,
    };
    animTree?.update(input);
  }

  // ── KICKOFF RETURN helpers ──────────────────────────────────────────────────────────────────────────────────────
  /** The kick goes up: the ball flies in from deep and the press as it lands is the LAUNCH. */
  function startKick(ctx: ModeContext): void {
    if (!kickBall) { kickBall = MeshBuilder.CreateSphere('kick_ball', { diameter: 0.3, segments: 10 }, ctx.scene); kickBall.material = VenueKit.paint(ctx.scene, 'kick_ball_mat', '#7a3f1d', 0.05, 0.7); }
    kickBall.setEnabled(true); kickBall.position.set(0, 9, 34);
    kick = { k: 0, caught: false, pressed: null };
    ctx.setHud({ hint: 'THE KICK IS UP — press A as it LANDS in your hands' });
  }
  function tickKick(ctx: ModeContext, dt: number): void {
    if (!kick || !kickBall) return;
    kick.k = Math.min(CATCH.lateK, kick.k + dt / CATCH.flightSec);
    const k = Math.min(1, kick.k);
    kickBall.position.set(0, 1.2 + (9 - 1.2) * (1 - k) + Math.sin(k * Math.PI) * 6, 34 * (1 - k));
    if (kick.k < 1) return;
    // it lands: the press that came, graded; none at all is the free (bobbled) catch a beat late
    if (kick.pressed === null && kick.k < CATCH.lateK) return;
    const grade: CatchGrade | 'late' = kick.pressed ?? 'late';
    const stack = catchStack(grade);
    kick.caught = true; kickBall.setEnabled(false); ret.catches++; if (grade === 'perfect') ret.perfect++;
    snap(ctx);
    run = { vx: 0, vz: (RUN.base + RUN.push) * stack };
    if (stack > 0) { score += grade === 'perfect' ? 40 : 15; SoundKit.play('powerUp', { pitch: grade === 'perfect' ? 1.3 : 1 }); ctx.feel?.impact?.(0.25); }
    flash(ctx, grade === 'perfect' ? 'LEDGE-POP — 100% STACK!' : grade === 'good' ? 'CLEAN CATCH — +60%' : grade === 'early' ? 'TOO EARLY — no stack' : 'BOBBLED — no stack', 900);
    console.info(`[FB-RETURN] catch ${grade} at k ${kick.k.toFixed(2)} → stack ${stack}`);
  }
  /** The blocking wall: two lead blockers run the runner's lane and drive the gunners into the turf. */
  function tickBlockers(ctx: ModeContext, dt: number, set: boolean): void {
    const me = me2(), v = vel2();
    for (const b of blockers) {
      b.busy = Math.max(0, b.busy - dt);
      const root = b.char.root;
      let target: { x: number; z: number } | null = null;
      if (set) target = { x: b.side * 2.4, z: runner.root.position.z + 2.5 };
      else if (b.busy === 0) target = blockerTarget(me, v, standingGunners());
      if (!target) target = blockerLeadPoint(me, v, b.side);
      const dx = target.x - root.position.x, dz = target.z - root.position.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, BLOCK.speed * dt);
      const moving = d > 0.35 && !set;
      b.speed = moving && dt > 1e-4 ? step / dt : 0;
      if (moving) { root.position.x += (dx / d) * step; root.position.z += (dz / d) * step; root.rotation.y = stepYaw(root.rotation.y, Math.atan2(dx, dz), dt, 8); }
      else if (set) { root.position.x += (dx) * Math.min(1, dt * 6); root.position.z += dz * Math.min(1, dt * 6); root.rotation.y = 0; }
      if (moving !== b.moving) { b.moving = moving; b.char.animator.play(moving ? SPORT_CLIP.moveLoop : SPORT_CLIP.idle, { loop: true, fadeSec: 0.15 }); }
      if (set || b.busy > 0) continue;
      for (const g of standingGunners()) {
        if (g.mob.state !== 'pursuing' || pounces.has(g.mob)) continue;
        if (!engageRead({ x: root.position.x, z: root.position.z }, g)) continue;
        g.mob.down(); b.busy = BLOCK.busySec; ret.engages++;
        EffectsKit.burst(ctx.scene, g.mob.char.root.position.add(new Vector3(0, TURF_Y, 0)), 'dust');
        SoundKit.play('impact', { pitch: 0.9, volume: 0.4 }); flash(ctx, 'BLOCKED! — HURDLE HIM (A)', 600);
        console.info('[FB-RETURN] blocker engage');
        break;
      }
    }
  }
  /** The diver: the nearest pursuing gunner arriving inside the gunslinger window (his speed read off his position). */
  function gunslingTarget(): Mob | null {
    const me = runner.root.position, hv = new Vector3(run.vx, 0, run.vz); const hs = hv.length(); if (hs > 0.5) hv.scaleInPlace(1 / hs); else hv.set(0, 0, 1);
    for (const m of defenders) {
      if (m.state !== 'pursuing' && !pounces.has(m)) continue;
      const to = m.char.root.position.subtract(me); to.y = 0; const dist = to.length(); if (dist < 1e-3) continue;
      const dv = defVel.get(m) ?? Vector3.Zero();
      const closing = -(dv.x * to.x + dv.z * to.z) / dist;
      const cos = (to.x * hv.x + to.z * hv.z) / dist;
      if (gunslingRead(dist, closing, cos)) return m;
    }
    return null;
  }
  function gunslingerVault(ctx: ModeContext, diver: Mob): void {
    const dir = diver.char.root.position.subtract(runner.root.position); dir.y = 0; dir.normalize();
    vault = { from: runner.root.position.clone(), dir, t: 0 };
    if (pounces.has(diver)) { pounces.delete(diver); }
    diver.down(); ret.vaults++; score += GUNSLING.pts;
    dodging = true; iframeSec = GUNSLING.iframes; lastDodgeType = 'vault';
    move = 'stiffArm'; moveClip = SPORT_CLIP.footballHurdle; moveUntil = performance.now() + GUNSLING.sec * 1000;
    burst(GUNSLING.launchSec, GUNSLING.launchMult);
    styleCredit(ctx, 'vault');
    SoundKit.play('whoosh', { pitch: 1.3 }); SoundKit.play('impact', { pitch: 1.4, volume: 0.4 }); ctx.juice.hitStop(40); ctx.feel?.impact?.(0.35);
    flash(ctx, 'GUNSLINGER VAULT!', 700); console.info('[FB-RETURN] gunslinger vault');
  }
  /** The strip: a hit while exposed. The ball goes loose; the scramble is the runner's to win. */
  function stripBall(ctx: ModeContext): void {
    if (fumble) return;
    const ball = MeshBuilder.CreateSphere('fumble_ball', { diameter: 0.3, segments: 10 }, ctx.scene); ball.material = VenueKit.paint(ctx.scene, 'fumble_ball_mat', '#7a3f1d', 0.05, 0.7);
    const a = Math.random() * Math.PI * 2;
    ball.position.set(Math.max(-FIELD_HALF_X + 1, Math.min(FIELD_HALF_X - 1, runner.root.position.x + Math.cos(a) * STRIP.launchM)), 0.15, Math.max(1, runner.root.position.z + 1.2 + Math.sin(a) * STRIP.launchM));
    fumble = { ball, t: 0 }; ret.fumbles++; score = Math.max(0, score + STRIP.pts);
    vault = null; lane = 'turf'; runner.root.position.y = 0; launchSec = 0; move = null; dodging = false; cutSec = 0;
    SoundKit.play('crowdGroan', { volume: 0.5 }); ctx.juice.shake(0.1, 140); ctx.feel?.impact?.(0.4);
    flash(ctx, 'STRIPPED — LIVE BALL! GET ON IT', 900); console.info('[FB-RETURN] fumble');
  }
  function tickFumble(ctx: ModeContext, dt: number): 'none' | 'turnover' {
    if (!fumble) return 'none';
    fumble.t += dt;
    const d = Vector3.Distance(fumble.ball.position, runner.root.position);
    if (d <= STRIP.recoverM) { fumble.ball.dispose(); fumble = null; ret.recovered++; SoundKit.play('uiTick', { pitch: 1.4 }); flash(ctx, 'RECOVERED!', 600); console.info('[FB-RETURN] recovered'); return 'none'; }
    if (fumble.t < STRIP.scrambleSec) return 'none';
    fumble.ball.dispose(); fumble = null; console.info('[FB-RETURN] fumble lost');
    return 'turnover';
  }
  /** A gunner near the wall launches: a missile tackle. */
  function tickPounces(ctx: ModeContext, dt: number): Mob | null {
    pounceCool = Math.max(0, pounceCool - dt);
    if (pounceCool === 0 && !downed && !preSnap && !fumble) {
      for (const g of standingGunners()) {
        if (g.mob.state !== 'pursuing' || pounces.has(g.mob)) continue;
        if (!pounceRead(g, me2())) continue;
        const to = runner.root.position.add(new Vector3(run.vx, 0, run.vz).scale(0.35)).subtract(g.mob.char.root.position); to.y = 0; to.normalize();
        g.mob.hold(); pounces.set(g.mob, { t: 0, dir: to }); pounceCool = POUNCE.cooldownSec; ret.pounces++;
        g.mob.setYaw(Math.atan2(to.x, to.z)); g.mob.char.animator.play(SPORT_CLIP.footballHurdle, { fadeSec: 0.08 });
        flash(ctx, 'POUNCE — off the wall!', 500); console.info('[FB-RETURN] pounce');
        break;
      }
    }
    let hit: Mob | null = null;
    for (const [m, p] of pounces) {
      p.t += dt;
      const u = Math.min(1, p.t / POUNCE.sec);
      m.char.root.position.addInPlace(p.dir.scale(POUNCE.speed * dt));
      m.char.root.position.y = Math.sin(u * Math.PI) * 0.7;
      if (!hit && !downed && Vector3.Distance(m.char.root.position, runner.root.position) <= POUNCE.hitM) hit = m;
      if (u >= 1) { m.char.root.position.y = 0; pounces.delete(m); m.resume(); }
    }
    if (hit) { hit.char.root.position.y = 0; pounces.delete(hit); }
    return hit;
  }
  /** The tackle: the down, the distance, the reset (was inline in the contact loop). True when update must return. */
  function tackledBy(ctx: ModeContext, mob: Mob, how: string): boolean {
    tackleWeight(ctx);
    EffectsKit.burst(ctx.scene, runner.root.position.add(new Vector3(0, TURF_Y, 0)), 'dust');
    downed = true; move = null; cutSec = 0; vault = null; lane = 'turf'; runner.root.position.y = 0; launchSec = 0;
    animTree?.clearBeat('tackled');
    driveEvades = 0; breakawaySec = 0;
    const gainedY = yards;
    if (gainedY >= toGo) {
      down = 1; toGo = 10;
      lineOfScrimmage = runner.root.position.z;
      ctx.setHud({ down, toGo, banner: how === 'TACKLED' ? 'FIRST DOWN!' : `${how} — FIRST DOWN` });
    } else {
      down++;
      toGo -= gainedY;
      if (down > 4) {
        logDrive('TURNOVER ON DOWNS');
        if (drive >= DRIVES) {
          ended = true;
          SoundKit.play('whistle');
          ctx.end('TURNOVER_ON_DOWNS', score, { yards, evades, trucks, coinsCollected: coins?.collected ?? 0, drives: DRIVES });
          return true;
        }
        drive++;
        SoundKit.play('whistle');
        newDrive(ctx, `TURNOVER ON DOWNS · DRIVE ${drive}/${DRIVES}`);
        return true;
      }
      ctx.setHud({ down, toGo, banner: `${how} — DOWN ${down}` });
    }
    mob.onContactResolved();
    setTimeout(() => {
      ctx.setHud({ banner: '' });
      runner.root.position.x = 0; run = { vx: 0, vz: 0 };
      downed = false;
      preSnap = true; preSnapT = 0;
      void spawnDefense(ctx).then(() => {
        if (!ended && preSnap) ctx.setHud({ hint: 'READ THE FRONT — push ▲/W to SNAP' });
      });
    }, 1000);
    yards = 0;
    lineOfScrimmage = runner.root.position.z;
    return false;
  }
  function loseDrive(ctx: ModeContext, why: string): boolean {
    logDrive(why);
    if (drive >= DRIVES) { ended = true; SoundKit.play('whistle'); ctx.end('TURNOVER_ON_DOWNS', score, { yards, evades, trucks, coinsCollected: coins?.collected ?? 0, drives: DRIVES }); return true; }
    drive++; SoundKit.play('whistle'); newDrive(ctx, `${why} · DRIVE ${drive}/${DRIVES}`); return true;
  }
  /** The lanes: the sideline rail (HIGH), the turf ramps (MID), the maintenance tunnel (LOW). */
  function tickLanes(ctx: ModeContext, dt: number, vel: Vector3): void {
    const p = runner.root.position;
    if (lane === 'turf' && !vault && !downed) {
      const rs = railRead(p.x, vel.x, vel.z);
      if (rs !== 0) { lane = 'rail'; railSide = rs; railSec = 0; ret.rails++; score += LANES.railPts; SoundKit.play('whoosh', { pitch: 0.9 }); flash(ctx, 'SIDELINE RAIL — a hit up here is OUT', 700); console.info('[FB-RETURN] rail'); }
      else if (rampAt(p.x, p.z) >= 0 && Math.hypot(vel.x, vel.z) >= LANES.rampMinSpeed) { lane = 'air'; airT = 0; airSec = LANES.rampAirSec; ret.ramps++; score += LANES.rampPts; burst(LANES.rampAirSec, LANES.rampMult); SoundKit.play('whoosh', { pitch: 1.2 }); flash(ctx, 'RAMP — over the gap!', 600); console.info('[FB-RETURN] ramp'); }
      else if (tunnelAt(p.x, p.z) >= 0) {
        if (slideHeld) { lane = 'tunnel'; ret.tunnels++; score += LANES.tunnelPts; SoundKit.play('whoosh', { pitch: 0.7 }); flash(ctx, 'TUNNEL — SLIDE-SURF!', 600); console.info('[FB-RETURN] tunnel'); }
        else { run.vz *= 0.25; run.vx = 0; p.x += (p.x > 0 ? -1 : 1) * 1.8; ret.bonks++; SoundKit.play('impact', { pitch: 0.6, volume: 0.5 }); ctx.juice.shake(0.06, 120); flash(ctx, 'BONK — SLIDE under the bench (hold LT)', 800); console.info('[FB-RETURN] bonk'); }
      }
    }
    if (lane === 'rail') {
      railSec += dt; p.x = railSide * (LANES.railX - 0.25); p.y = LANES.railY;
      const away = Math.sign(stickX) === -railSide && Math.abs(stickX) > 0.5;
      if (railSec >= LANES.railMaxSec || away || downed) { lane = 'turf'; p.y = 0; p.x = railSide * (LANES.railX - 1.6); run.vx = -railSide * 2.5; }
    } else if (lane === 'air') {
      airT += dt; p.y = Math.sin(Math.min(1, airT / airSec) * Math.PI) * LANES.rampUp;
      if (airT >= airSec) { lane = 'turf'; p.y = 0; }
    } else if (lane === 'tunnel') {
      if (tunnelAt(p.x, p.z) < 0 || downed) { lane = 'turf'; if (!downed) { burst(LANES.tunnelExitSec, LANES.tunnelExitMult); flash(ctx, 'POPPED OUT — max speed!', 600); } }
    }
    if (vault) { vault.t += dt; const u = Math.min(1, vault.t / GUNSLING.sec); const q = vaultArc(vault.from, vault.dir, u); p.set(q.x, q.y, q.z); if (u >= 1) { vault = null; p.y = 0; } }
    const laneLabel = lane === 'turf' ? (slideHeld ? 'SLIDE' : '') : lane === 'rail' ? 'HIGH — SIDELINE RAIL' : lane === 'air' ? 'MID — AIR' : 'LOW — TUNNEL';
    const g = Math.round(slingGauge);
    if (laneLabel !== laneHud || g !== gaugeHud) { laneHud = laneLabel; gaugeHud = g; ctx.setHud({ lane: laneLabel, slingshot: g }); }
  }
  /** The field's parkour: the stadium walls the rail runs, the ramps, the benches the tunnel runs under. */
  function buildLanes(ctx: ModeContext): void {
    for (const m of laneMeshes) m.dispose(); laneMeshes = [];
    const wallMat = VenueKit.paint(ctx.scene, 'fb_wall_mat', '#7c8798', 0.05, 0.8), rampMat = VenueKit.paint(ctx.scene, 'fb_ramp_mat', '#2e7d3a', 0.08, 0.9), benchMat = VenueKit.paint(ctx.scene, 'fb_bench_mat', '#c9a15a', 0.06, 0.7);
    for (const side of [1, -1] as const) {
      const wall = MeshBuilder.CreateBox(`fb_wall_${side}`, { width: 0.5, height: 1.7, depth: FIELD_LENGTH + 8 }, ctx.scene);
      wall.position.set(side * (LANES.railX + 0.5), 0.85, FIELD_LENGTH / 2); wall.material = wallMat; wall.isPickable = false; laneMeshes.push(wall);
    }
    for (const [i, r] of LANES.ramps.entries()) {
      const ramp = MeshBuilder.CreateBox(`fb_ramp_${i}`, { width: r.halfX * 2, height: 0.5, depth: r.halfZ * 2 }, ctx.scene);
      ramp.position.set(r.x, 0.12, r.z); ramp.rotation.x = -0.22; ramp.material = rampMat; ramp.isPickable = false; laneMeshes.push(ramp);
    }
    for (const [i, t] of LANES.tunnels.entries()) {
      const len = t.z1 - t.z0;
      const top = MeshBuilder.CreateBox(`fb_bench_${i}`, { width: t.halfX * 2 + 0.4, height: 0.3, depth: len }, ctx.scene);
      top.position.set(t.x, 1.25, (t.z0 + t.z1) / 2); top.material = benchMat; top.isPickable = false; laneMeshes.push(top);
      for (const zz of [t.z0 + 0.3, t.z1 - 0.3]) for (const sx of [-1, 1]) {
        const leg = MeshBuilder.CreateBox(`fb_bench_leg_${i}_${zz}_${sx}`, { width: 0.18, height: 1.1, depth: 0.18 }, ctx.scene);
        leg.position.set(t.x + sx * (t.halfX + 0.05), 0.55, zz); leg.material = benchMat; leg.isPickable = false; laneMeshes.push(leg);
      }
    }
  }

  function newDrive(ctx: ModeContext, banner: string): void {
    down = 1; toGo = 10;
    lineOfScrimmage = 0; yards = 0; driveEvades = 0; breakawaySec = 0;
    styleTypes = new Set();
    truckSec = 0; truckCooldown = 0;
    truckLatch = false; tackleLatch = false; tdLatch = false;   // A+ P0: a new drive gets its own beats
    // …and its own camera: a cut still holding (or a cooldown still draining) from the last
    // play would either frame the snap from the broadcast height or swallow the first hit.
    hitCut.active = false; hitCut.timer = 0; hitCut.cooldown = 0;
    preSnap = true; preSnapT = 0; downed = false;
    runner.root.position.set(0, 0, 0);
    runner.root.rotation.y = 0; run = { vx: 0, vz: 0 };
    move = null; moveUntil = 0; cutSec = 0; celebrateUntil = 0; tdPending = false;
    // KICKOFF RETURN: a fresh drive opens with the kick in the air
    vault = null; lane = 'turf'; runner.root.position.y = 0; launchSec = 0; launchMult = 1; slingGauge = 0; slingCool = 0; immuneSec = 0; stiffCool = 0; gunslingNow = null;
    for (const [m] of pounces) { m.char.root.position.y = 0; } pounces.clear(); pounceCool = 1.5;
    if (fumble) { fumble.ball.dispose(); fumble = null; }
    for (const b of blockers) { b.busy = 0; b.char.root.position.set(b.side * 2.4, 0, 2.5); b.char.root.rotation.y = 0; }
    animTree?.reset();   // the tree is the one owner: the pre-snap idle is a WINDOW, not a play() from here
    ctx.camDirector.snapTo(runner.root.position, runner.root.position.add(new Vector3(0, 0, 12)));
    driveYards = 0;
    ctx.setHud({ down, toGo, banner, breakaway: false, truckReady: true, drive: `${drive}/${DRIVES}`, board: driveLog.length ? driveLog : null, boardTitle: driveLog.length ? `DRIVE ${drive} / ${DRIVES}` : '', ballOn: 0, los: 0, firstDown: 10, fieldLen: Math.round(FIELD_LENGTH / YARD) });
    setTimeout(() => ctx.setHud({ banner: '', board: null, boardTitle: '' }), 2600);   // long enough to read the card
    void spawnDefense(ctx).then(() => {
      ctx.setHud({ hint: 'READ THE FRONT — push ▲/W to SNAP' });
    });
    layCoins(ctx, 0);
    startKick(ctx);
  }

  return {
    modeId: 'football', mood: 'nightGame', camPreset: 'runner',

    async load(ctx: ModeContext) {
      tier = readProfile();
      driveLog = []; driveYards = 0;
      rushVenue = mountVenue(ctx, 'football_rush', { keepGameplayCamera: true, look: readPlaceLook('football') });   // PLACE: the splash's pick
      // WEATHER: the start screen's pick — rain softens the cut (grip), snow slows the run (drag), fog / night dress it
      weather = WeatherKit.fromPick(readWeather('football'), 'gridiron', Math.floor(Date.now() / 1000) % 100000);
      weatherFx?.dispose(); weatherFx = mountWeatherFx(ctx.scene, ctx.lights, weather, { tier: ctx.lights.tier });
      // the kit gridiron stands at y 0.05: the reads sit just over it
      lineArrow?.dispose(); lineArrow = mountAimArrow(ctx.scene, '#22d3ee', 0.09); lineArrow.show(false);
      pursuit?.dispose(); pursuit = mountRing(ctx.scene, '#ff2d78', 1.5, 0.09); pursuit.show(false);
      VenueKit.buildGridiron(ctx.scene);   // the kit field keeps its yard lines and posts under the spec's sky
      // The kit's gridiron stands ON TOP of the spec's ground, so the spec's is hidden — but it kept the NAME
      // `venue_ground`, and two coplanar meshes under one name is not only redundant floor: Physics.ts binds
      // `scene.getMeshByName('venue_ground')`, which returns the FIRST match, and the venue mounts before the
      // kit. So the physics floor was the hidden 44 × 52 plane under a visible 44 × 90 field — no floor at all
      // past x ±22 / z ±26. Renamed rather than disposed: the camera's venue-shell regex still matches it, and
      // the mesh is still wanted for bounds. (Found by scripts/probes/_ground-audit.mts.)
      if (rushVenue) for (const m of rushVenue.built.root.getChildMeshes()) if (m.name === 'venue_ground') { m.visibility = 0; m.name = 'venue_ground_under'; m.isPickable = false; }
      runner = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
        position: new Vector3(0, 0, 0), yawRad: 0, startClip: SPORT_CLIP.idle,
      });
      neverBindPose(runner.animator, SPORT_CLIP.idle);
      installSafePlay(runner.animator, 'football');
      ctx.groundLock?.track(runner.root, runner.skeleton);
      ctx.heroRef.current = runner.root;
      animTree = new FootballAnimTree(runner.animator);
      animTree.onSettle = (st) => { if (st === 'juke' || st === 'spin' || st === 'stiff_arm') { move = null; dodging = false; } };
      posture?.dispose();
      posture = mountPostureLayer(ctx.scene, runner.skeleton, runner.root, () => {
        const { window, pose, legs } = runPose(footballWindow(bio));
        // G1 for the run family is the LINE (SPEC-FEL-BIOMECH-GAMEWIDE: "football / freerun / boards — G1 = fall line").
        // The chest squares to where he is running; the EYES go to the man he has to beat. Aiming the chest at a
        // defender off to the side instead turned the carrier's shoulders across his own line — measured, 77/513 carry
        // frames within 30° of it.
        return { pose, legs, aim: lineAhead(), eyes: threat() ?? lineAhead(), window };
      }, 'FB-PP');
      if (process.env.NODE_ENV === 'development') {
        const dev = (window as unknown as { __FEL_DEV__?: { runPosture?: unknown } }).__FEL_DEV__;
        if (dev) dev.runPosture = { me: () => posture?.layer.get() ?? null, bio: () => ({ ...bio }), tree: () => animTree?.state ?? null, aim: () => { const t = lineAhead(); return { x: t.x, y: t.y, z: t.z }; }, eyes: () => { const t = threat() ?? lineAhead(); return { x: t.x, y: t.y, z: t.z }; } };   // BIOMECH-WAVE2 probes
      }
      defenders = []; pool = new MobPool();
      await buildDefenderBodies(ctx);   // the pooled front (see spawnDefense)
      // KICKOFF RETURN: the two lead blockers (my colours), the field's parkour, and the dev seam
      for (const b of blockers) b.char.dispose(); blockers = [];
      for (const side of [1, -1] as const) {
        const char = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, { position: new Vector3(side * 2.4, 0, 2.5), yawRad: 0, tint: '#1f6feb', startClip: SPORT_CLIP.idle });
        neverBindPose(char.animator, SPORT_CLIP.idle); installSafePlay(char.animator, 'football-blocker'); ctx.groundLock?.track(char.root, char.skeleton);
        blockers.push({ char, side, busy: 0, moving: false, speed: 0 });
      }
      buildLanes(ctx);
      if (process.env.NODE_ENV === 'development') {
        (ctx.scene.metadata ??= {}).football = {
          state: () => ({ ...ret, lane, kickK: kick ? kick.k : -1, kickCaught: kick ? kick.caught : true, gauge: slingGauge, launch: launchSec, x: runner.root.position.x, y: runner.root.position.y, z: runner.root.position.z, vx: run.vx, vz: run.vz, preSnap, downed, fumble: !!fumble, vault: !!vault, hurdleReady: hurdleRead(me2(), vel2(), downedGunners()), stiffReady: standingGunners().some((g) => stiffArmRead(me2(), vel2(), g)), ended, slingCool, parallel: blockers.some((b) => b.speed >= SLINGSHOT.mateMinSpeed && parallelRead(me2(), vel2(), { x: b.char.root.position.x, z: b.char.root.position.z })), drafting: blockers.some((b) => draftingRead(me2(), vel2(), { x: b.char.root.position.x, z: b.char.root.position.z })), gunsling: !!gunslingNow, blockers: blockers.map((b) => ({ x: b.char.root.position.x, z: b.char.root.position.z, busy: b.busy })), gunners: defenders.map((m) => ({ x: m.char.root.position.x, z: m.char.root.position.z, state: m.state, pouncing: pounces.has(m) })), score, drive, down }),
          snapNow: () => snap(ctx),
          slideHeld: () => slideHeld,
          place: (x: number, z: number) => { runner.root.position.set(x, 0, z); run = { vx: 0, vz: RUN.base }; },   // the probe's instrument: start a run beside the wall / the bench
        };
      }
      score = 0; evades = 0; trucks = 0; ended = false; iframeSec = 0; dodging = false; downed = false; drive = 1;
      driveEvades = 0; breakawaySec = 0; truckSec = 0; truckCooldown = 0;
      truckLatch = false; tackleLatch = false; tdLatch = false;
      ctx.camDirector.snapTo(runner.root.position, runner.root.position.add(new Vector3(0, 0, 12)));
      assertSpawned(ctx.scene, { hero: runner.root, minWorldMeshes: 6, modeId: 'football' });
      SoundKit.startAmbient('stadium');
      EffectsKit.ambient(ctx.scene, 'gridiron');
      // L4 — a drive is watched. Two sideline banks outside the playing
      // width (FIELD_HALF_X 20), in the runner-cam's frame edges.
      gallery = new Onlookers(ctx.scene, [
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector3(-21.5, 0, 4 + i * 4)),
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector3(21.5, 0, 6 + i * 4)),
      ]);
      newDrive(ctx, 'TAKE THE FIELD');
      ctx.setHud({ score: 0, yards: 0, evades: 0, hint: 'Juke, spin, hurdle — or HOLD TRUCK and run THROUGH them', weather: weather.describe() });
    },

    onInput(ctx: ModeContext, e: FelInput) {
      SoundKit.unlock();
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      if (e.t === 'trigger' && e.side === 'L') slideHeld = e.value > 0.5;   // KICKOFF RETURN: LT is the slide (the tunnel's key)

      // THE SNAP — the player snaps on their call: forward push (or any
      // evade button) with the defense set. Everything before it is the read.
      if (preSnap && !ended) {
        const snapCall = (e.t === 'stick' && e.side === 'L' && e.y < -0.4)
          || (e.t === 'button' && e.pressed && ['A', 'B', 'X', 'Y'].includes(e.btn ?? ''))
          || (e.t === 'trigger' && e.side === 'R' && e.value > 0.5);
        // KICKOFF RETURN: while the kick is up, a press is the CATCH (graded on the landing), not the snap
        if (kick && !kick.caught) { if (snapCall && e.t !== 'stick' && kick.pressed === null) { kick.pressed = catchGrade(kick.k); console.info(`[FB-RETURN] catch press at k ${kick.k.toFixed(2)} → ${kick.pressed}`); } }
        else if (snapCall) snap(ctx);
      }
      // KICKOFF RETURN verbs: L1 the slingshot, R1 the stiff-arm clothesline, B on a diver the gunslinger vault, A over a downed man the catapult
      if (e.t === 'button' && e.pressed && !ended && !preSnap && !downed && !fumble) {
        if (e.btn === 'L1') {
          const beside = blockers.some((b) => b.speed >= SLINGSHOT.mateMinSpeed && parallelRead(me2(), vel2(), { x: b.char.root.position.x, z: b.char.root.position.z }));
          if (slingCool > 0) refuse(ctx, `SLINGSHOT COOLING — ${slingCool.toFixed(1)}s`);
          else if (beside || slingGauge >= SLINGSHOT.full) {
            burst(SLINGSHOT.blastSec, SLINGSHOT.blastMult); immuneSec = SLINGSHOT.immuneSec; slingGauge = 0; slingCool = SLINGSHOT.cooldownSec; ret.slings++; score += SLINGSHOT.pts;
            styleCredit(ctx, 'slingshot'); SoundKit.play('powerUp', { pitch: 1.2 }); ctx.juice.flash('#9ad7ff', 60); ctx.feel?.impact?.(0.3);
            flash(ctx, beside ? 'FIELD-LATERAL SLINGSHOT!' : 'SLINGSHOT — the seam!', 700); console.info(`[FB-RETURN] slingshot ${beside ? 'lateral' : 'gauge'}`);
          } else refuse(ctx, slingGauge > 0 ? `SLINGSHOT ${Math.round(slingGauge)}% — draft a blocker` : 'NO BLOCKER RUNNING BESIDE YOU');
          return;
        }
        if (e.btn === 'R1') {
          const g = stiffCool === 0 ? standingGunners().find((x) => stiffArmRead(me2(), vel2(), x)) : undefined;
          if (g) {
            g.mob.down(); ret.stiffs++; score += STIFF.pts; stiffCool = STIFF.cooldownSec;
            move = 'stiffArm'; moveClip = 'football_stiff_arm'; moveUntil = performance.now() + MOVE_SEC * 1000;
            styleCredit(ctx, 'stiffArm'); EffectsKit.burst(ctx.scene, g.mob.char.root.position.add(new Vector3(0, TURF_Y, 0)), 'dust');
            SoundKit.play('impact', { pitch: 0.8, volume: 0.5 }); ctx.juice.hitStop(35); ctx.feel?.impact?.(0.3);
            flash(ctx, 'CLOTHESLINE!', 600); console.info('[FB-RETURN] stiff-arm');
          } else refuse(ctx, stiffCool > 0 ? 'ARM COOLING' : 'NOBODY BESIDE YOU');
          return;
        }
        if (e.btn === 'B' && !dodging && !vault) { const diver = gunslingTarget(); if (diver) { gunslingerVault(ctx, diver); return; } }
        if (e.btn === 'A' && !dodging && hurdleRead(me2(), vel2(), downedGunners())) {
          burst(BLOCK.catapultSec, BLOCK.catapultMult); ret.catapults++; score += BLOCK.catapultPts;
          SoundKit.play('powerUp', { pitch: 1.4, volume: 0.4 }); flash(ctx, 'HURDLE-CATAPULT!', 600); console.info('[FB-RETURN] hurdle-catapult');
          // the generic hurdle below plays the clip and buys the iframes
        }
      }

      // TRUCK — trigger hold, windowed + cooldown.
      // SCORECARD CONTROLS (2026-09-15): 7 of 29 TRUCK pulls were silent, every one thrown while the last truck was
      // still cooling, mid-dodge or on the floor. A cooldown the player cannot see is indistinguishable from a dead
      // button, so the pull now says which it is. The truck itself is unchanged, and only the FIRST frame of a hold
      // speaks — a held trigger is one pull, not sixty.
      if (e.t === 'trigger' && e.side === 'R') {
        const down = e.value > 0.5;
        if (down && !truckHeldWas && !ended && (truckCooldown > 0 || truckSec > 0 || dodging || downed)) {
          refuse(ctx, downed ? 'DOWN — WAIT FOR THE SNAP' : dodging ? 'IN THE DODGE' : truckSec > 0 ? 'ALREADY TRUCKING'
            : `TRUCK COOLING — ${truckCooldown.toFixed(1)}s`);
        }
        truckHeldWas = down;
      }
      if (e.t === 'trigger' && e.side === 'R' && e.value > 0.5 && !ended
          && truckCooldown === 0 && truckSec === 0 && !dodging && !downed) {
        truckSec = TRUCK_WINDOW_SEC;
        truckCooldown = TRUCK_COOLDOWN_SEC;
        truckLatch = false;                       // A+ P0: a fresh window gets one break punch
        SoundKit.play('powerUp', { pitch: 0.8, volume: 0.4 });
        ctx.setHud({ truckReady: false, banner: 'TRUCK!' });   // the tree reads truckSec — it never needed a play() here
        setTimeout(() => ctx.setHud({ banner: '' }), 400);
      }

      // An evade thrown ON TOP of the one still playing, or from the floor, used to vanish (1 of 6 JUKE and 1 of 5
      // HURDLE presses in the rc19 capture). A move you cannot cancel is a rule, and a rule has to be audible.
      if (e.t === 'button' && e.pressed && !ended && (dodging || downed) && DODGES[e.btn as keyof typeof DODGES]) {
        refuse(ctx, downed ? 'DOWN — WAIT FOR THE SNAP' : 'ONE MOVE AT A TIME');
      }
      if (e.t === 'button' && e.pressed && !dodging && !downed && !ended) {
        const d = DODGES[e.btn as keyof typeof DODGES];
        if (!d) return;
        dodging = true;
        iframeSec = d.iframes;
        lastDodgeType = e.btn === 'B' ? 'spin' : e.btn === 'A' ? 'hurdle' : 'juke';
        SoundKit.play('whoosh', { pitch: 1.15 });
        // the tree plays it (its settle ends the dodge); A = the hurdle, which has no lateral cut and rides the
        // 'stiffArm' slot's own clip through moveClip
        move = e.btn === 'B' ? 'spin' : e.btn === 'A' ? 'stiffArm' : 'juke';
        moveClip = SPORT_CLIP[d.gesture]; moveUntil = performance.now() + MOVE_SEC * 1000;
        if (d.dx) {
          // G3: the cut is a SLIDE across the move's own window. It used to be `position.x += 3.2` in the frame the
          // button went down — the runner arrived a lane over before the juke clip had played a single frame.
          cutFrom = runner.root.position.x;
          cutTo = Math.max(-FIELD_HALF_X, Math.min(FIELD_HALF_X, runner.root.position.x + d.dx));
          cutT = 0; cutSec = cutSlideSec(MOVE_SEC * 0.7, weather.gripMult());   // a wet cut takes longer to bite
        }
        ctx.feel?.impact?.(0.12);
      }
    },

    update(ctx: ModeContext, dt: number) {
      if (ended) return;

      // HIT-CAM: when a stack closes on the runner, pull up and back for half a second so
      // the hit reads as a hit rather than something that happened behind the shoulder.
      // `downed` is the module's `cleared`: a trucked defender is on the floor and is no
      // longer converging on anything. Radius is metres here, the same unit as the
      // positions — the module compares against whatever unit it is handed.
      const conv = countConverging(
        defenders.map((m) => ({
          yd: -m.char.root.position.z,
          x: m.char.root.position.x,
          cleared: m.state === 'downed',
        })),
        { x: runner.root.position.x, z: runner.root.position.z },
        CONVERGE_RADIUS_YD * YARD,
      );
      updateBroadcastCut(hitCut, conv, dt);
      ctx.camDirector.broadcast = broadcastBlend(hitCut);
      // SET AT THE LINE — nobody moves until the snap (the player calls it,
      // or the auto-snap so an idle phone never stalls)
      if (preSnap) {
        preSnapT += dt;
        if (showBlitz) {
          // the show: he creeps toward the line while everyone else is set
          showBlitz.char.root.position.z -= SHOW_BLITZ_CREEP * dt;
          if (preSnapT < 0.1) ctx.setHud({ hint: 'SHOWING BLITZ — snap into it, or wait him out' });
        }
        if (kick && !kick.caught) tickKick(ctx, dt);
        else if (preSnapT >= PRESNAP_AUTOSNAP_SEC) snap(ctx);
        tickBlockers(ctx, dt, true);
        drive3D(0, false);   // the tree runs every phase: SET at the line is a window, not the absence of one
        weather.update(dt); weatherFx?.update(dt); run = { vx: 0, vz: 0 }; lineArrow?.show(false); pursuit?.show(false);
        ctx.camDirector.look(lookX, lookY, dt);   // read the front from the R stick
        ctx.camDirector.update(runner.root.position, Vector3.Zero(), null);
        return;
      }
      iframeSec = Math.max(0, iframeSec - dt);
      breakawaySec = Math.max(0, breakawaySec - dt);
      truckSec = Math.max(0, truckSec - dt);
      const cooldownWas = truckCooldown;
      truckCooldown = Math.max(0, truckCooldown - dt);
      if (cooldownWas > 0 && truckCooldown === 0) ctx.setHud({ truckReady: true });
      if (breakawaySec === 0) ctx.setHud({ breakaway: false });
      // KICKOFF RETURN clocks: the burst, the immunity, the arm, the gauge, the scramble, the gunners' velocities
      launchSec = Math.max(0, launchSec - dt); if (launchSec === 0) launchMult = 1;
      immuneSec = Math.max(0, immuneSec - dt); stiffCool = Math.max(0, stiffCool - dt); slingCool = Math.max(0, slingCool - dt);
      slingGauge = slingshotStep(slingGauge, !downed && blockers.some((b) => draftingRead(me2(), vel2(), { x: b.char.root.position.x, z: b.char.root.position.z })), dt);
      if (dt > 1e-4) for (const m of defenders) { const p = m.char.root.position; const prev = defPrev.get(m); if (prev) { const v = p.subtract(prev).scaleInPlace(1 / dt); if (v.length() > 14) v.setAll(0); defVel.set(m, v); } defPrev.set(m, p.clone()); }
      gunslingNow = downed ? null : gunslingTarget();
      if (tickFumble(ctx, dt) === 'turnover') { if (loseDrive(ctx, 'FUMBLE — TURNOVER')) return; }

      const boost = (breakawaySec > 0 ? BREAKAWAY_SPEED_MULT : 1) * launchMult * (lane === 'rail' ? LANES.railMult : lane === 'tunnel' ? LANES.tunnelMult : 1) * (slideHeld && lane === 'turf' ? LANES.slideMult : 1);   // KICKOFF RETURN: the bursts and the lanes stack on the breakaway
      const trucking = truckSec > 0;
      const held = downed || tdPending;   // a scored runner HOLDS the spike; he does not keep running out of the end zone
      // MOMENTUM: the stick is an intent the body chases — a heavy body under a light stick (NFL Street). The weather
      // takes hold here: wet turf answers a cut slower, snow underfoot slows the run.
      weather.update(dt); weatherFx?.update(dt);
      run = stepRun(run, { x: stickX, y: stickY }, dt, { boost, trucking, held, grip: weather.gripMult(), drag: weather.boardDragMult() });
      const vel = new Vector3(run.vx, 0, run.vz);
      runner.root.position.addInPlace(vel.scale(dt));
      // G3: the juke's lateral cut rides its own window (it was a one-frame 3.2 m teleport)
      if (cutSec > 0) {
        cutT = Math.min(cutSec, cutT + dt);
        const k = cutT / cutSec, e = 1 - (1 - k) * (1 - k);
        runner.root.position.x = cutFrom + (cutTo - cutFrom) * e;
        if (cutT >= cutSec) cutSec = 0;
      }
      runner.root.position.x = Math.max(-FIELD_HALF_X, Math.min(FIELD_HALF_X, runner.root.position.x));
      // KICKOFF RETURN: the lanes, the blocking wall, the gunners' pounce
      tickLanes(ctx, dt, vel);
      tickBlockers(ctx, dt, false);
      { const pounced = tickPounces(ctx, dt);
        if (pounced && !downed && !fumble) {
          if (fumbleRead(exposure())) { pounced.onContactResolved(); stripBall(ctx); }
          else if (iframeSec > 0 || immuneSec > 0) { pounced.onContactResolved(); evades++; driveEvades++; score += 25; flash(ctx, 'POUNCE MISSED!', 500); }
          else { if (tackledBy(ctx, pounced, 'POUNCED')) return; }
        } }
      if (!dodging && !held) {
        // MODE-STICK-FACE (2026-09-07): the runner FACES his line — yaw from the ground velocity, slewed. It was HALF
        // the angle: a 42° cut ran at 21°, the body sliding sideways across the field. (The stick itself was never
        // mirrored here: the runner camera looks up the field, +z, where screen-right IS world +x.)
        runner.root.rotation.y = stepYaw(runner.root.rotation.y, Math.atan2(vel.x, vel.z), dt, TURN_RATE);
      }

      if (!downed) yards = Math.max(yards, Math.floor((runner.root.position.z - lineOfScrimmage) / 0.9144));
      driveYards = Math.max(driveYards, Math.floor(runner.root.position.z / YARD));
      // A+ mission #9: the field strip (ball, line of scrimmage, first-down line, all in yards) and the TARGET — where the
      // nearest defender is relative to the runner, so the next move is a read, not a guess
      let nearest: Mob | null = null, nd = Infinity;
      for (const m of defenders) { const d = Vector3.Distance(m.char.root.position, runner.root.position); if (d < nd) { nd = d; nearest = m; } }
      const dx = nearest ? nearest.char.root.position.x - runner.root.position.x : 0;
      const target = !nearest || nd > 9 ? '' : Math.abs(dx) < 1.2 ? 'AHEAD — juke or truck' : dx > 0 ? 'RIGHT — cut left' : 'LEFT — cut right';
      const bm = breakawayMeter(driveEvades, BREAKAWAY_THRESHOLD, breakawaySec, BREAKAWAY_SEC);
      ctx.setHud({ yards, evades, ballOn: Math.max(0, Math.round(runner.root.position.z / YARD)), los: Math.round(lineOfScrimmage / YARD), firstDown: Math.round((lineOfScrimmage + toGo * YARD) / YARD), target, breakawayFill: Number(bm.fill01.toFixed(3)), breakawayTicks: bm.ticks.map((t) => t.toFixed(3)).join(',') });
      // THE READ ON THE TURF: your line ahead, and the ring where the nearest man meets it (no ring = he cannot catch you)
      // the arrow starts a stride AHEAD of the body: from the chase camera a line under the runner's own feet is hidden by him
      if (lineArrow) { const sp = Math.hypot(vel.x, vel.z); lineArrow.show(!held && sp > 0.5); if (sp > 0.5) { const yaw = Math.atan2(vel.x, vel.z); lineArrow.set(runner.root.position.add(new Vector3(Math.sin(yaw) * 1.4, 0, Math.cos(yaw) * 1.4)), yaw, Math.min(7, 1.5 + sp * 0.6), null); } }
      if (pursuit) { const ip = nearest && nd < 16 && !held ? interceptPoint({ x: runner.root.position.x, z: runner.root.position.z }, { x: vel.x, z: vel.z }, { x: nearest.char.root.position.x, z: nearest.char.root.position.z }, DEF_SPEED) : null; pursuit.show(!!ip); if (ip) pursuit.set(ip.x, ip.z); }

      const gained = coins?.update(dt, runner.root.position) ?? 0;
      if (gained > 0) {
        score += gained * 5;
        SoundKit.play('uiTick', { pitch: 1.4 });
        ctx.setHud({ score, coins: coins?.collected ?? 0 });
      }

      const contacts = pool.update(dt, runner.root.position, vel);
      for (const mob of contacts) {
        if (downed) break;
        if (fumble || vault || lane === 'air' || lane === 'tunnel') { continue; }   // KICKOFF RETURN: up in the air / under the bench / a live ball — the gunner's wrap finds nothing
        if (lane === 'rail') { ret.outOfBounds++; lane = 'turf'; runner.root.position.y = 0; mob.onContactResolved(); flash(ctx, 'KNOCKED OUT OF BOUNDS!', 800); console.info('[FB-RETURN] out of bounds'); if (tackledBy(ctx, mob, 'OUT OF BOUNDS')) return; break; }
        if (immuneSec > 0) { evades++; driveEvades++; score += 20; mob.onContactResolved(); flash(ctx, 'THROUGH THE SEAM!', 500); continue; }   // a downed runner cannot be tackled (or trucked) again before the reset
        // TRUCK RESOLUTION — the defender goes down, not you
        if (truckSec > 0) {
          trucks++; evades++; driveEvades++;
          score += TRUCK_PTS * (breakawaySec > 0 ? 2 : 1);
          mob.onContactResolved();
          mob.char.animator.play(SPORT_CLIP.footballTackled, {});
          truckPunch(ctx);   // A+ P0: hit-stop + shake + ONE low thud, once per window (replaces feel.impact + a second impact SFX)
          EffectsKit.burst(ctx.scene, mob.char.root.position.add(new Vector3(0, TURF_Y, 0)), 'dust');   // turf at his feet (ANIM-SURGICAL)
          ctx.setHud({ score, banner: 'TRUCKED!' });
          gallery?.cheer(0.6);
          setTimeout(() => ctx.setHud({ banner: '' }), 600);
          styleCredit(ctx, 'truck');
          if (driveEvades >= BREAKAWAY_THRESHOLD && breakawaySec <= 0) {
            breakawaySec = BREAKAWAY_SEC;
            SoundKit.play('powerUp');
            ctx.setHud({ banner: 'BREAKAWAY!', breakaway: true });
            setTimeout(() => ctx.setHud({ banner: '' }), 900);
          }
          continue;
        }
        if (iframeSec > 0) {
          evades++; driveEvades++;
          const mult = breakawaySec > 0 ? 2 : 1;
          score += 20 * mult;
          mob.onContactResolved();
          ctx.feel?.impact?.(0.3);
          SoundKit.play('impact', { pitch: 1.3, volume: 0.35 });
          styleCredit(ctx, lastDodgeType || 'juke');   // credit the move that earned these iframes
          if (driveEvades >= BREAKAWAY_THRESHOLD && breakawaySec <= 0) {
            breakawaySec = BREAKAWAY_SEC;
            SoundKit.play('powerUp');
            ctx.setHud({ banner: 'BREAKAWAY!', breakaway: true });
            setTimeout(() => ctx.setHud({ banner: '' }), 900);
          } else {
            ctx.setHud({ banner: 'EVADED!', score });
            setTimeout(() => ctx.setHud({ banner: '' }), 500);
          }
          continue;
        }
        if (tackledBy(ctx, mob, 'TACKLED')) return;
      }

      if (runner.root.position.z >= FIELD_LENGTH && !tdPending) {
        const mult = breakawaySec > 0 ? 1.5 : 1;
        score += Math.round((100 + evades * 10) * mult);
        // G5: the SPIKE is this mode's biggest end pose and it had never been seen — the per-frame carry run cut it on
        // the next frame and `newDrive` reset the body on this one. It holds for TD_HOLD_SEC now, feet planted.
        tdPending = true; celebrateUntil = performance.now() + TD_HOLD_SEC * 1000; move = null; cutSec = 0; vault = null; lane = 'turf'; runner.root.position.y = 0; launchSec = 0;
        animTree?.clearBeat('celebrate');
        tdPunch(ctx);   // A+ P0: hit-stop + shake + gold flash + ONE slam, once per drive (replaces the bare feel.impact)
        SoundKit.play('score');
        SoundKit.play('crowdCheer');
        EffectsKit.burst(ctx.scene, runner.root.position.add(new Vector3(0, 1.8, 0)), 'confetti');
        ctx.setHud({ score, banner: 'TOUCHDOWN!' });
        gallery?.cheer(1);
        logDrive('TOUCHDOWN');
        if (drive >= DRIVES) {
          ended = true;
          SoundKit.play('whistle');
          return ctx.end('DRIVES_DONE', score, { yards, evades, trucks, coinsCollected: coins?.collected ?? 0, drives: DRIVES });
        }
        const next = drive + 1;
        setTimeout(() => { if (ended) return; drive = next; newDrive(ctx, `TOUCHDOWN! · DRIVE ${next}/${DRIVES}`); }, TD_HOLD_SEC * 1000);
      }

      drive3D(Math.min(1, vel.length() / 8), trucking);
      gallery?.update(dt);
      ctx.camDirector.look(lookX, lookY, dt);
      ctx.camDirector.update(runner.root.position, vel, null);
    },

    dispose() {
      posture?.dispose(); posture = null; animTree = null;
      rushVenue?.dispose?.(); rushVenue = null;
      gallery?.dispose(); gallery = null;
      lineArrow?.dispose(); lineArrow = null; pursuit?.dispose(); pursuit = null; weatherFx?.dispose(); weatherFx = null;
      runner?.dispose();
      for (const b of blockers) b.char.dispose(); blockers = [];
      for (const m of laneMeshes) m.dispose(); laneMeshes = [];
      kickBall?.dispose(); kickBall = null; kick = null; if (fumble) { fumble.ball.dispose(); fumble = null; } pounces.clear(); defPrev.clear(); defVel.clear();
      for (const char of defenderBodies) char.dispose();
      defenderBodies = []; defenders = [];
      coins?.dispose();
      SoundKit.stopAmbient();
    },
  };
})();

// HUD fields: down, toGo, yards, evades, score, coins, breakaway (bool),
// banner, hint — unchanged from M45 — plus NEW truckReady (bool; dim the
// TRUCK chip while false) and trucks in the end-of-session stats.
