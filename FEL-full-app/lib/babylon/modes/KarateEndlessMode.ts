// KarateEndlessMode v6 — "AGENT WAVES." REPLACES the M45 file. A structural
// rebuild toward the third-person action-horde feel: you (and an ally)
// against escalating waves of identical, suited pursuers in a stylized
// digital arena. Four concrete systems, all new:
//   1. THIRD-PERSON OVER-THE-SHOULDER CAMERA — CameraDirector's new
//      'overShoulder' preset (M50), locked behind your facing direction
//      rather than the nearest-enemy midpoint, the way action games frame
//      combat instead of a fighting-game side-view.
//   2. CO-OP-READY ALLY — a second fighter built on PlayerSlot (M48): today
//      driven by a simple always-on AI (PartnerAISource), but because both
//      bodies already read from the same ControlSource abstraction, turning
//      this into real two-player co-op later is "implement
//      NetworkInputSource against a transport," not "rewrite combat." Same
//      honest scope boundary M48 drew for basketball.
//   3. DODGE WITH A REWARD WINDOW — quick-tap BLOCK (X) instead of holding
//      it: a directional dodge roll with real i-frames, and slipping a
//      strike at the last instant triggers a brief slow-motion beat local
//      to this mode (not a global engine hijack) — the "you weren't fast
//      enough" moment these games are built around.
//   4. HORDE-SCALE WAVES — bigger counts, faster ramp, and every new enemy
//      materializes with a glitch-burst spawn-in instead of just appearing.
//
// KARATE-NEO-COOP (2026-09-07) — the owner's eye on the live soft-OPEN: "co-op beat-em-up, waves of hordes, feel like
// Neo, Matrix slow-mo juice, NOT knocked down so easily, clean". Measured per rendered frame before this pass (fake
// pad, 24 s): the hero was DOWN 0.16 s after START on the first touch and spent 20 of the 24 s on the floor (three
// downs from three contacts — the one-tap the owner rejected); an agent that had touched you stood in idle_stand at
// 0.24 m for the rest of the wave (contact → MobSteering's `onContactResolved` → idle forever: the zombie); a KO'd
// agent stood back up into the stance while it sank (neverBindPose's chain after the knockdown); 0 slow-mo beats.
// The LOGIC lives in core/NeoCombatCore (pure, headless-tested by scripts/karate-neo-tests.ts); this file renders it:
//   · TOUGHNESS (PlayerVitals): an HP pool — an agent's STRIKE (not its touch) costs enemyHitDamage(wave) (18 → 26,
//     the kick ×1.4), a landed hit buys VITALS.hurtIframeSec (the horde cannot double-tap), the guard chips and floors
//     at 1 (a guard never drops you), HP regens after HP_REGEN_DELAY_SEC out of contact, a revive restores
//     VITALS.reviveRatio with VITALS.reviveIframeSec. DOWN only at 0.
//   · AGENTS ATTACK, READABLY (EnemyBrain): contact starts a WIND-UP (karate_windup_hold, a held telegraph), then the
//     strike clip with the hit on the clip's contact beat, then a recovery in the stance, then the chase again. At most
//     maxAttackers(wave) agents wind up at once; the rest ORBIT in the guard step (ENEMY_ATTACK.orbitSpeed) and press
//     again; the pack fans out (separate()). A BeatOwner per agent is the ONE owner of its clips (MobSteering reports
//     loco through a hook, never plays); they chase on the guard step, not the shared jog.
//   · MATRIX SLOW-MO (SlowMoLatch): one clock on the gameplay dt AND scene.animationTimeScale (the bodies themselves
//     slow — dt-scaling alone left every clip at full speed), latched once with a cooldown, short: a perfect dodge, a
//     heavy KO, the jab-jab-UPPERCUT finisher (ComboTracker), the wave clear, the chi burst (the player's special —
//     always fires). Never a soft freeze: input runs, the camera runs.
//   · REAL MOVES: jab / kick / heavy are the GLB clips; the dodge is the authored slip (karate_evade) with a stick held
//     and the bullet-time LEAN (karate_lean_dodge) with none; a perfect read is the lean in slow motion.
//   · PERKS / PICKUPS (PerkShop, DropDirector): the between-wave shop is REAL (◀ ▶ browse, A buy, B fight, SHOP_SEC),
//     priced in the run's shards; KOs drop shards, a chi orb every fourth, a health orb when you are hurt (with pity);
//     a wave clear drops DROPS.waveClearShards — walk over them.
//
// IP NOTE: built to match the requested FEEL (third-person combat vs waves
// of identical suited pursuers, a slow-motion dodge) using entirely
// original naming, dialogue-free enemies, and a cyan/white palette — no
// franchise names, characters, or their specific green-code visual motif
// appear anywhere in this file, consistent with this project's standing
// original-content-only rule (already enforced for NeuroArena/Who Scene It).

import { tintGarmentSlot, SLOT_KEYS } from '../core/playerIdentity';   // EYE SORES: the agents wear a kit, their skin stays skin
import { mountPlayerRing, type PlayerRingHandle } from '../visual/PlayerRing';   // PLAYER RING (owner): who you are, and the gauge at your feet
import { readPlayerIcon } from '../visual/playerIcon';
import { prqMaxHp, prqSpeedMult } from '../core/PrqVitals';
import { prqGrade } from '../../prq';
import { mookMaxHp, damageMook, mookHp01, mookBarHex } from '../core/MookHealth';
import { EvadeMoves } from '../core/EvadeMoves';
import { FOCUS, FocusMeter, WALL_RUN, wallRunAvailable, startWallRun, wallRunAt, startWallKick, wallKickAt, kickHits, type WallRunState, type WallKickState } from '../core/MatrixFocus';   // MATRIX FOCUS (2026-09-18)
import { HORDE_WINDOW_SEC } from '../core/DodgeRead';
import { Color3, Mesh, MeshBuilder, PBRMaterial, StandardMaterial, Vector3 } from '@babylonjs/core';
import { CharacterLibrary, type SpawnedCharacter } from '../core/CharacterLibrary';
import { Mob, MobPool, STEERING_PRESETS } from '../core/MobSteering';
// BIOMECH-WAVE2 (2026-09-09) — the game-wide bar on the gauntlet (SPEC-FEL-BIOMECH-GAMEWIDE G1–G6). Two findings:
//   G1/G4  a strike SNAPPED the fighter onto the nearest agent in one frame (`player.root.rotation.y = atan2(to)` at
//          the top of `strike()`, up to 180° in a single frame with the swing clip already crossfading in) — the exact
//          "random mid-clip pop that inverts facing" the spec names. It is a TURN now: aimed on the press, and slewed
//          to arrive inside the strike's own 150 ms startup so the arc test still measures the line it committed to.
//   G5     nothing in the mode touched the thoracic chain or the head, so the hero and the ally never looked at the
//          horde — the Posture Poses layer now carries them (the agents keep the clip-only body they had: up to 20
//          rigs a wave is not a budget this layer belongs in, and their read is the WIND-UP silhouette, not the chest).
import { mountPostureLayer, type PostureLayer } from '../anim/PostureLayer';
import { combatPose, COMBAT_INPUT_IDLE, type CombatPostureInput } from '../core/CombatPosture';
import { BodyMotion, dynamicPose, COMBAT_DYNAMIC } from '../core/DynamicPosture';   // footwork answers its MOTION
import { slewYaw, wrapYaw } from '../core/Biomech';
import { neverBindPose } from '../anim/importSanitizer';
import { installSafePlay, SPORT_CLIP } from '../anim/clipRegistry';
import { CombatAnimTree, type CombatAnimInput, type StrikeWeight } from '../anim/combatTree';
import { BeatOwner } from '../anim/beatOwner';
import type { ControlSource, Intent } from '../core/PlayerSlot';
import { PlayerSlot, LocalInputSource } from '../core/PlayerSlot';
import { attachNetplay, type NetplayHandle } from '../../net/attach';   // opt-in co-op: ?net=<room>
import { SoundKit } from '../audio/SoundKit';
import { refuse } from '../core/Refusal';   // SCORECARD CONTROLS: a press a rule forbids is answered, not swallowed
import {
  BASELINE_RATINGS, ratingsFrom, routeFor, routeHitStopMs, routeShake, cancelWindowSec, hasFightMove,
  type FightRatings, type RouteStrike,
} from '../core/FighterStyle';   // the same named routes the duel modes use, read for a CROWD
import { EffectsKit } from '../visual/EffectsKit';
import { Onlookers } from '../visual/Onlookers';
import { VenueKit } from '../visual/VenueKit';
import { mountVenue, type VenueHandle } from '../core/NexusVenue';  // M74
import type { ModeContext, ModeDefinition } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import { KARATE_CONFIG as CFG } from './modeConfigs';
import { waveSpec, spawnRing, DownRevive, REVIVE_RANGE, surroundedCount, inArc } from '../core/OnslaughtCore';
import {
  PlayerVitals, VITALS, enemyHitDamage, SlowMoLatch, SLOWMO, type SlowMoKind,
  EnemyBrain, ENEMY_ATTACK, windupSecFor, maxAttackers,
  DropDirector, DROPS, type DropKind, PerkShop, separate,
} from '../core/NeoCombatCore';
// THE-HUNDRED-COMBAT-DYNAMICS (2026-09-14) — the feel layer: cancel + queue, the string book, crowd stun, redirect, the
// body throw. Pure and tested in core/HordeDynamics(.test); this file only renders it. See that header for the base
// measurement (12 presses → 3 swings: nine eaten by a full-clip lock under a 140 ms buffer).
import {
  StringBook, StrikeQueue, STRIKE_TIMING, QUEUE_SEC, MOVES, THROW, FLINCH_SEC, TARGET,
  pickTarget, stickDirTo, lungeFor, crowdStun, pathHits, pickGrab,
  type HordeMove, type StrikeBtn,
} from '../core/HordeDynamics';
import { readBlend, blendTraits, blendName, SCHOOLS } from '../combat/schools';
import { hordeStyle, type HordeStyle } from '../combat/loadout';
import { styleVariant, styleLabel, hasRootTrack, styleMotionOf } from '../anim/styleMotion';   // the picked style's own moves (2026-09-15)
import { Freeflow, type FlowEvent, type FlowBroken } from '../core/Freeflow';   // THE HUNDRED: Arkham freeflow — the count means something

/**
 * Half-extent of the playable floor, INSET from the 24x24 mat.
 *
 * The camera's bounds come from the ground mesh, so a play area the same size as
 * the mat leaves it nowhere to stand: at the old ±8 on a 16x16 mat the camera was
 * clamped to ±6.8 and ended up 1.2m behind a player at the edge, putting them out
 * of frame. 7.5 on a 24x24 mat keeps 3.3m clear behind the overShoulder rig.
 */
/**
 * The fighter is held inside a DISC of this radius, not a square of this half-
 * width. A square clamp has corners, and a corner is the one place a
 * facing-derived camera at a 3.1m radius cannot swing behind its subject:
 * every [FEL-FRAME] this mode had left was a fighter pinned at (+-7.5, +-7.5).
 * Karate VS is fought on a disc for the same reason, and the venue now paints
 * this ring on the mat so the edge is seen rather than only felt.
 */
const ARENA_RADIUS = 7.5;
const STANCE = SPORT_CLIP.karateStance;
// ANIM-READABILITY (combat, 2026-09-07): the player and the partner are driven by the CombatAnimTree, the ONE owner of
// their clips — the same jumble Karate VS had (a per-frame stance / step play racing the strike's onEnd chain, the
// knockdown cut to 0.08 s by the per-frame stance, guard steps on the spot). KARATE-NEO-COOP: the agents are owned by
// a BeatOwner each (stance / guard step / wind-up loops, strike / knockdown beats) — MobSteering never plays a clip here.
const IDLE_CLIP = 'karate_idle_stance';
const AGENT_STEP = SPORT_CLIP.combatStep;          // the chase: guard up, a fighter's step (was the shared jog)
const AGENT_WINDUP = SPORT_CLIP.karateWindup;      // the telegraph: rear fist chambered, weight back (a HOLD)
const AGENT_FLOOR = 'karate_floor_hold';
const LEAN_DODGE = 'karate_lean_dodge';            // the bullet-time lean (dodge with no stick held)
const DODGE_SLIP = 'karate_evade';                 // the directional slip (the tree's default — authored, not the football juke)
const IMPACT_SEC = 0.24, STRIKE_MAX_SEC = 1.5, REACT_SEC = 0.32;
type Strike = { weight: StrikeWeight; clip: string; until: number } | null;
// THE HORDE GRAMMAR (owner lock 2026-09-03: Matrix Revolutions / Pirate
// Warriors). Every strike hits EVERYONE in its arc; the heavy LAUNCHES, and an
// airborne enemy is helpless and takes JUGGLE_DAMAGE_MULT. Before this each
// strike resolved against the single nearest enemy — a queue of duels.
const STRIKES = {
  A: { clip: SPORT_CLIP.karateJab, dmg: 12, range: 1.5, arcDeg: 100, launch: false },
  B: { clip: SPORT_CLIP.karateKick, dmg: 18, range: 1.9, arcDeg: 150, launch: false },
  Y: { clip: SPORT_CLIP.karateHeavy, dmg: 24, range: 1.6, arcDeg: 90, launch: true },
} as const;
/** THE-HUNDRED: ground speed (m/s) — was 3 (2.83 measured under the stride filter). The horde is circled, not walked. */
const MOVE_SPEED = 4.4;
/** A held stick cuts a swing's recovery this long after its cancel point (the jab keeps its extension on screen). */
const MOVE_CANCEL_EXTRA_SEC = 0.1;
/** The ring the crowd stun throws (unlit, on the floor): peak radius is the move's stun radius. */
const SHOCK_SEC = 0.32;
/** The running hit count decays after this long without a hit (the Musou number). */
const HIT_CHAIN_MS = 1400;
/** A takedown reaches the nearest body this close (metres). */
const TAKEDOWN_REACH = 2.8;
/** The partner revives this many knockdowns in a run; the next one is out. */
const MAX_REVIVES = 2;
/** A launched body is helpless for the knockdown and the get-up (the two captures, 0.7 s + 1.05 s, less the blend). */
const LAUNCH_FLOOR_SEC = 1.6;

// horde sizing — deliberately bigger/faster than the old wave-survival pace
// A+ identity P0 (PM brief 2026-09-06): ONE SOLID STRIKE DROPS A BODY. No enemy HP pool, no chip — the wave escalates
// by count and speed, never by sponge. (hpBase 22 / hpPerWave 4 made jab 12 / kick 18 chip and only heavy one-tapped.)
const DODGE_TAP_MS = 220;          // hold longer than this = block, not dodge
const DODGE_IFRAME_SEC = 0.38;
const DODGE_DISTANCE = 3.2;
const DODGE_SLIDE_SEC = 0.36;      // the slide, on the GAME clock — a perfect read stretches it with the slow-mo
// The perfect-read window now lives in core/DodgeRead alongside the duel's, so the two cannot drift apart
// unnoticed — they are deliberately different sizes (a horde is not one telegraph) and that difference is
// documented there rather than being an accident of two files.
// (M45 had this backwards: it rewarded a strike landing in the LAST 90 ms — a dodge thrown 0.3 s early.)
const PERFECT_WINDOW_SEC = HORDE_WINDOW_SEC;

// ── KARATE-NEO-COOP: the player's toughness (VITALS in NeoCombatCore) + what only the renderer knows ──
const HP_REGEN_DELAY_SEC = 3.5, HP_REGEN_PER_SEC = 4;   // out of contact the pool refills — a beating survived, not attrition
const ORBIT_SEC = 0.5;             // a capped-out agent circles this long before it presses again
const AGENT_STRIKE_ARC_DEG = ENEMY_ATTACK.arcDeg + 20;  // the renderer's arc is a hair wider than the core's (the hit-check happens on a body that may have stepped)
const AGENT_TURN_RATE = 9;         // rad/s — a wound-up agent tracks you
/** The middle of each band, for re-deriving the grade's own speedMult from a band name. */
const BAND_SCORE = { RECOVERING: 20, READY: 50, PRIMED: 70, ELITE: 90 } as const;
const SEPARATION_M = 0.9;          // the pack fans out: no two agents inside this
/** The floating health bar: width in metres and how far above the root it rides. */
const BAR_W = 0.62, BAR_Y = 2.05;

// M110 — CHI BURST. The chi meter (filled by hits/dodges) used to top out at
// 100 and do nothing. It now powers a screen-clearing special: at full chi,
// press R1 to knock back + heavily damage every enemy in range, then chi
// resets. Code-level rollback: flip CHI_BURST_ENABLED to false.
const CHI_BURST_ENABLED = true;
const CHI_BURST_RADIUS = 4.6;
const CHI_BURST_KNOCKBACK = 3.4;

// ── pickups (DropDirector decides WHAT drops; this is how they look and how close you walk) and the shop ──
const PICKUP_BOB_HZ = 1.6;
const SHOP_SEC = 6;                            // the between-wave window; B fights early (8 s was a third of a horde run standing still, measured)
const PICKUP_STYLE: Record<DropKind, { hex: string }> = { shard: { hex: '#FFC53D' }, chi: { hex: '#22d3ee' }, health: { hex: '#7CFFB2' } };

interface Enemy {
  mob: Mob; anim: BeatOwner; brain: EnemyBrain; hp: number; maxHp: number; /** launched: helpless and takes more until this timestamp */ airUntil: number;
  /** The floating health bar over this body (2026-09-14). Null until the first hit — a full bar on an
   *  untouched mook is eight bars of clutter the player has not earned any information from yet. */ bar: Mesh | null;
  /** capped out of a strike: circling until this game-clock time (0 = not orbiting) */ orbitUntil: number; orbitDir: 1 | -1;
  /** THE-HUNDRED: staggered (helpless, steering held) until this GAME-clock time; 0 = standing */ stunUntil: number;
  /** game-clock time of the last hit this body took (a freshly hit body is grabbable) */ hitAt: number;
  /** in the hero's hands (or in flight): out of the brain, the steering, the arcs and the targeting */ carried: boolean;
}
interface Pickup { kind: DropKind; mesh: Mesh; life: number; phase: number }
/** A tween on the GAME clock (so slow-mo stretches the sink, the knockback, the slide — one clock, not two). */
interface Tween { t: number; dur: number; step: (k: number) => void; done?: () => void }

// ── Ally: a self-contained AI ControlSource. Doesn't reuse PlayerSlot's
//    basketball-flavored AIBehavior (ball/hoop shape doesn't fit melee) —
//    this is the melee equivalent, same ControlSource contract so it slots
//    into PlayerSlot identically. KARATE-NEO-COOP: a downed ally comes first —
//    the partner runs to you and stands on the revive (the co-op beat). ──────
class PartnerAISource implements ControlSource {
  private cooldown = 0;
  constructor(private self: () => Vector3, private nearestEnemy: () => Vector3 | null, private range: number, private downedAlly: () => Vector3 | null = () => null) {}
  poll(dt: number): Intent {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const neutral: Intent = { moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false };
    const ally = this.downedAlly();
    if (ally) {
      const to = ally.subtract(this.self()); to.y = 0;
      const dist = to.length();
      if (dist > REVIVE_RANGE * 0.7) { const dir = to.normalize(); return { ...neutral, moveX: dir.x, moveY: -dir.z, sprint: true }; }
      return neutral;   // in range: the channel runs (the mode counts it)
    }
    const target = this.nearestEnemy();
    if (!target) return neutral;
    const to = target.subtract(this.self()); to.y = 0;
    const dist = to.length();
    if (dist > this.range) {
      const dir = to.normalize();
      return { ...neutral, moveX: dir.x, moveY: -dir.z, sprint: dist > 4 };
    }
    const attack = this.cooldown === 0;
    if (attack) this.cooldown = 0.9 + Math.random() * 0.4;
    return { ...neutral, action: attack };
  }
}

export const KarateEndlessMode: ModeDefinition = (() => {
  let karateVenue: VenueHandle | null = null;  // M74
  let crowd: Onlookers | null = null;   // L4 — the gauntlet's audience
  let player: SpawnedCharacter, partner: SpawnedCharacter;
  let playerSlot: PlayerSlot, partnerSlot: PlayerSlot, localSource: LocalInputSource;
  /** Null unless ?net=<room>. The PARTNER is the remote seat here — this is co-op, not versus. */
  let net: NetplayHandle | null = null;
  let pool: MobPool;
  let enemies: Enemy[] = [];
  let wave = 0, kos = 0, totalKos = 0, chi = 0;
  // KARATE-NEO-COOP: the core's objects (NeoCombatCore) — the mode renders them
  // THE POOL IS THE ATHLETE'S NOW (2026-09-14). VITALS.maxHp was a flat 100 for everyone, and prqGrade has
  // published a speedMult per band this whole time that nothing read. Rebuilt at load once the band is
  // known; a guest has none and is treated as READY, never penalised -- see core/PrqVitals.
  let vitals = new PlayerVitals();
  /** Movement multiplier from the band, 1 for a guest. Multiplies the perk tree's own, never replaces it. */
  let prqSpeed = 1;
  const slowmo = new SlowMoLatch();
  // MATRIX FOCUS (owner 2026-09-18, "add enter the matrix physics and combat"): bullet time you HOLD on the right trigger. The
  // room runs at FOCUS.worldScale on its own clocks (the enemies' and the partner's animators, the game clock) while the
  // hero moves and swings at his own (dtHero, his animator at heroScale) — the strikes come at you slow enough to step
  // around, yours land at full pace and LAUNCH. Inside Focus, L1 at the arena's edge is a WALL RUN along it and the next
  // press (or the run's end) is the KICK off it back through the pack. The latch above stays the game's own beats.
  const focus = new FocusMeter();
  let focusHeld = false, focusHud = -1, focusHudOn = false;
  let wallRun: WallRunState | null = null, wallKick: WallKickState | null = null, wallKickY0 = 0;
  const heroVel = new Vector3();
  const matrixStats = { wallRuns: 0, wallKicks: 0, kickHits: 0, focusStrikes: 0 };
  const enemyLastPos = new Map<Enemy, Vector3>(); let roomMps = 0, heroMps = 0; const heroLastPos = new Vector3();   // MATRIX telemetry: who is moving at what speed
  const FOCUS_TINT = 'rgba(16, 70, 34, 0.75)';
  // THE-HUNDRED: the string book replaces the jab-only ComboTracker (A A A is still the uppercut finisher, now one of six
  // strings); the queue holds a press made before the swing's cancel point.
  const book = new StringBook();
  const queue = new StrikeQueue();
  /** The GAME clock (slow-mo scaled). Strike timing lives on it — the hit used to land on a real-time setTimeout. */
  let gameSec = 0;
  let strikeSeq = 0, strikeStartedAt = -Infinity, strikeMove: HordeMove | null = null, strikeHitDone = true;
  /** The body in the hero's hands. `swinging` while the 360 sweep runs. */
  let carry: { e: Enemy; since: number; swinging: boolean } | null = null;
  let shockRings: { mesh: Mesh; t: number; r: number }[] = [];
  /** SCORECARD VISUALS (2026-09-15): WHICH ONE IS ME. The frame review could not find the hero inside a mob of identical
   *  bodies — a ring on the floor under the player, the one thing a beat-em-em-up crowd cannot cover. */
  let youRing: Mesh | null = null;
  let ring: PlayerRingHandle | null = null;   // PLAYER RING (owner): the hp gauge at the feet + the creator glyph — replaces the bare torus
  let turnClock: { at: number; deg: number } | null = null;
  /** L1 pressed inside a swing before its hit: the grab waits for the hit (QUEUE_SEC), like a queued strike. */
  let grabQueuedAt = -Infinity;
  const dyn = { swings: 0, cancels: 0, queued: 0, eatenPresses: 0, redirects: 0, maxTurnDeg: 0, lunges: 0, stuns: 0, stunnedMax: 0, flinches: 0, grabs: 0, weaponSwings: 0, throws: 0, weaponHits: 0, lastMove: '', lastString: '', lastRedirect: '', lastGrabMiss: '', bowled: 0 };
  /** DYNAMIC POSTURE for the hero's footwork. A horde mode is ALL circling — you are always moving around bodies —
   *  so a flat, unbanked body is most of what the mode looks like. Exertion comes off the vitals: a fighter deep in a
   *  wave on low health carries himself like it. */
  const meMotion = new BodyMotion();
  /** The hero's planar speed in m/s this frame, for stride matching (animate() is handed normalised speeds only). */
  let myMps = 0;
  // ROUTES IN A HORDE. The duel modes pay a route off in DAMAGE, which is meaningless here: Endless is one solid
  // strike = one body down, by owner lock, so there is no damage to multiply. The horde's currency is how many
  // bodies you clear, so a completed route pays off in REACH AND ARC — the ender becomes a crowd move. That is
  // what makes a mixed-verb route worth learning in a mode where mashing one button already works.
  //
  // This sits ALONGSIDE the existing jab-jab-UPPERCUT finisher rather than replacing it: ComboTracker counts
  // LIGHT strikes and any other verb resets it, so the two cover different sequences and neither breaks.
  let myRatings: FightRatings = { ...BASELINE_RATINGS };
  let landed: RouteStrike[] = [];
  let lastLandAt = -Infinity;
  /** The Endless button -> the shared route vocabulary. */
  const ROUTE_KIND: Record<'A' | 'B' | 'Y', RouteStrike> = { A: 'jab', B: 'kick', Y: 'heavy' };
  const drops = new DropDirector();
  const shop = new PerkShop();
  let perks = shop.state();
  /** The school picked on the start-up screen, translated into this mode's grammar. Read in load(). */
  let style: HordeStyle = hordeStyle(SCHOOLS[0].traits);
  let hpShown = -1, lastHurtAt = -1e9;
  let hitWeight: StrikeWeight = 'light', hitUntil = 0;
  // Phase 8: down/revive, crowd-clear
  const myDown = new DownRevive();
  const partnerDown = new DownRevive();
  let revivingPartner = false;
  let shards = 0;                      // the run's shards (dropped by the horde, spent in the shop) — the bezel's `coins`
  let shopOpen = false, shopUntil = 0;
  let clockSec = 0;
  let striking = false, blocking = false, dodging = false, bursting = false;
  let dodgeClip = DODGE_SLIP;
  // THE ONE VERB THIS MODE DID NOT HAVE (2026-09-14). Endless already owns the most developed dodge in the
  // game -- a directional roll with i-frames, the lean-vs-slip clips and a perfect read -- so it does NOT
  // take EvadeMoves' roll; it would be two rolls fighting over one body. It takes only the JUMP, which was
  // missing here as it was missing everywhere.
  const meAir = new EvadeMoves();
  let meTree: CombatAnimTree, partnerTree: CombatAnimTree;
  let myStrike: Strike = null, pStrike: Strike = null, impactUntil = 0, outFlag = false;
  let hitCount = 0, lastHitAt = 0;                 // the Musou number
  // FREEFLOW (owner 2026-09-15): the flow is kept by landing and reading, lost by whiffing near a body or getting hit. A
  // multiplier every 5, a meter the hits fill, a TAKEDOWN at 8 (L1). `hitCount` stays as the flow's mirror for the HUD's HITS.
  const flow = new Freeflow();
  const flowStats = { takedowns: 0, counters: 0, whiffBreaks: 0, hurtBreaks: 0, drops: 0, milestones: 0, clips: [] as string[] };
  /** The flow event → what a player sees and hears: the count, milestones with a camera beat, the takedown call. */
  function onFlow(ctx: ModeContext, fe: FlowEvent, label?: string): void {
    hitCount = fe.count; lastHitAt = now();
    pushFlowHud(ctx);
    if (fe.milestone) {
      flowStats.milestones++;
      ctx.camDirector.pulse?.(fe.milestone >= 20 ? 0.7 : 0.45, 0.28);
      SoundKit.play('powerUp', { pitch: 1 + Math.min(0.6, fe.milestone / 100), volume: 0.5 });
      flowBanner(ctx, `FREEFLOW ×${fe.milestone}${fe.mult > 1 ? ` · ${fe.mult}× POINTS` : ''}`, 900);
    } else if (fe.takedownUnlocked) {
      SoundKit.play('uiTick', { pitch: 1.5, volume: 0.6 });
      flowBanner(ctx, 'TAKEDOWN READY — L1', 1100);
    } else if (label) flowBanner(ctx, label, 650);
  }
  function onFlowBroken(ctx: ModeContext, br: FlowBroken | null): void {
    if (br) { if (br.reason === 'whiff') flowStats.whiffBreaks++; else if (br.reason === 'hurt') flowStats.hurtBreaks++; else flowStats.drops++; }
    hitCount = 0;
    pushFlowHud(ctx);
    if (!br || br.lost < 3) return;
    SoundKit.play('miss', { pitch: 0.8, volume: 0.45 });
    flowBanner(ctx, `COMBO ${br.reason === 'whiff' ? 'MISSED' : br.reason === 'hurt' ? 'BROKEN' : 'DROPPED'} ×${br.lost}`, 900);
  }
  let flowBannerUntil = 0;
  function flowBanner(ctx: ModeContext, text: string, ms: number): void {
    ctx.setHud({ banner: text }); flowBannerUntil = now() + ms;
    setTimeout(() => { if (now() >= flowBannerUntil - 5) ctx.setHud({ banner: '' }); }, ms);
  }
  function pushFlowHud(ctx: ModeContext): void {
    ctx.setHud({ hits: flow.count, flowMult: flow.mult(), flowMeter: Math.round(flow.meter * 100), flowReady: flow.takedownReady, flowBest: flow.best });
  }
  /** TAKEDOWN — the flow cashed in on the nearest body in reach: it ends outright, the hero throws the hammer fist, the
   *  crowd around staggers, and the whole beat is a slow-motion camera punch. Returns false when there was nothing to take. */
  function takedown(ctx: ModeContext): boolean {
    if (!flow.takedownReady || carry || myDown.downed) return false;
    const origin = player.root.position;
    let best: Enemy | null = null, bd = TAKEDOWN_REACH;
    for (const e of liveBodies()) { const d = Math.hypot(e.mob.char.root.position.x - origin.x, e.mob.char.root.position.z - origin.z); if (d < bd) { bd = d; best = e; } }
    if (!best) return false;
    const fe = flow.takedown(gameSec); if (!fe) return false;
    const tp = best.mob.char.root.position;
    faceTarget = Math.atan2(tp.x - origin.x, tp.z - origin.z); faceRate = 40;
    striking = true; strikeSeq++; strikeMove = MOVES.hammer; strikeStartedAt = gameSec; strikeHitDone = true;
    myStrike = { weight: 'finisher', clip: MOVES.hammer.clip, until: now() + STRIKE_MAX_SEC * 1000 };
    book.reset(); queue.clear();
    matrix(ctx, 'finisher');
    ctx.camDirector.pulse?.(0.9, 0.4);
    ctx.juice.hitStop(110); ctx.juice.shake(0.16, 260);
    SoundKit.play('impact', { pitch: 0.55, volume: 0.9 });
    best.hp = 0;
    landHit(ctx, best, true, 'finisher');
    stunCrowd(ctx, origin, 2.6, 0.8);
    stats.finishers++; flowStats.takedowns++;
    onFlow(ctx, fe);
    flowBanner(ctx, `TAKEDOWN ×${fe.count}`, 1000);
    return true;
  }
  let camCrowd = false;                             // H8: surrounded → the crowd preset
  let xHoldSec = -1, iframeSec = 0;
  let lastXTapSec = -1e9, lastDashSec = -1e9;   // STORM: the double tap, and the rush out of a dash
  let stickX = 0, stickY = 0;
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  /** BIOMECH-WAVE2 G1: the yaw a committed strike is turning ONTO, and the rate that gets it there inside the startup. */
  let faceTarget: number | null = null, faceRate = 0;
  // THE SPIN LAYER (RECOGNISABLE ON SIGHT, 2026-09-15): a spinning move's whole-body turn, added AFTER the facing is written
  // and taken back before it is written again, so re-aiming and travel never see it and a 360 always comes back to the aim.
  let spinApplied = 0;
  let spinMove: { deg: number; sec: number; at: number } | null = null;
  /** BIOMECH-WAVE2 G5: the Posture Poses layer on the hero and the ally, and the bodies it is fed. */
  let mePosture: { layer: PostureLayer; dispose(): void } | null = null, partnerPosture: { layer: PostureLayer; dispose(): void } | null = null;
  const meBio: CombatPostureInput = { ...COMBAT_INPUT_IDLE }, pBio: CombatPostureInput = { ...COMBAT_INPUT_IDLE };
  let pickups: Pickup[] = [];
  let tweens: Tween[] = [];
  let sceneRef: ModeContext['scene'] | null = null;
  // dev telemetry (the fake-pad probe reads scene.metadata.karateNeo) — counts, never gameplay
  const stats = { downs: 0, strikesAt: 0, hitsTaken: 0, traded: 0, blocked: 0, dodged: 0, perfect: 0, finishers: 0, pickups: 0, shardsTotal: 0, perksBought: 0, orbits: 0 };

  const now = () => performance.now();
  /** The floor under a strike's aim turn (rad/s): a pivot on the balls of the feet, never a snap. */
  const STRIKE_TURN_RATE = 12;
  /** How fast the fighter turns onto a new travel line (rad/s): a 180° stick reversal is ~0.26 s of body, not one frame. */
  const TRAVEL_TURN_RATE = 22;   // THE-HUNDRED: was 12 (180° in 0.26 s) — 0.14 s now; a crowd fight turns on a dime
  const facingVec = () => new Vector3(Math.sin(player.root.rotation.y), 0, Math.cos(player.root.rotation.y));
  const tween = (dur: number, step: (k: number) => void, done?: () => void) => { tweens.push({ t: 0, dur, step, done }); };
  const clampDisc = (p: Vector3) => { const r = Math.hypot(p.x, p.z); if (r > ARENA_RADIUS) { const k = ARENA_RADIUS / r; p.x *= k; p.z *= k; } };

  /** The Matrix beat. One clock: the latch counts real seconds; the gameplay dt and the scene's animation time both
   *  run at its scale while it holds. Latched once (cooldown in the core); the chi burst always fires. */
  function matrix(ctx: ModeContext, kind: SlowMoKind): boolean {
    if (!slowmo.fire(kind)) return false;
    ctx.scene.animationTimeScale = slowmo.scale;      // the bodies slow too — the read IS the bodies
    ctx.camDirector.pulse?.(kind === 'chiBurst' ? 0.8 : 0.55, SLOWMO[kind]);
    SoundKit.play('powerUp', { pitch: kind === 'perfectDodge' ? 0.6 : 0.5, volume: 0.45 });
    return true;
  }
  function endSlowMo(ctx: ModeContext): void { slowmo.reset(); ctx.scene.animationTimeScale = 1; }

  function publishHp(ctx: ModeContext, force = false): void {
    const shown = Math.round(100 * vitals.ratio);
    if (force || shown !== hpShown) { hpShown = shown; ctx.setHud({ hp: shown }); }
  }
  /** The shop's perk state, applied to the run. */
  function applyPerks(ctx: ModeContext, bought: string): void {
    perks = shop.state();
    vitals.setMax(perks.maxHp, bought === 'iron');    // IRON BODY heals to full
    publishHp(ctx, true);
  }

  async function spawnEnemy(ctx: ModeContext, angle: number, i: number): Promise<void> {
    const pos = new Vector3(Math.sin(angle) * 6, 0, Math.cos(angle) * 6);
    const char = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, {
      position: pos, yawRad: Math.atan2(-pos.x, -pos.z),
      tint: i % 2 ? '#a67c5b' : '#8d6e52',   // EYE SORES (2026-09-17): the old near-black tint blackened the SKIN — brown heads and leopard tops floated over invisible bodies; a natural tint (a roster seed), the suit is the KIT (tintGarmentSlot below)
      scale: 0.95 + ((wave * 7 + i * 13) % 12) / 100,
      startClip: STANCE,
    });
    tintGarmentSlot(char, SLOT_KEYS.jersey, i % 2 ? '#2b3550' : '#1f2735'); if ((SLOT_KEYS as Record<string, readonly string[]>).shorts) tintGarmentSlot(char, (SLOT_KEYS as Record<string, readonly string[]>).shorts, '#161b24');   // the agents' dark suit: navy / charcoal kit
    neverBindPose(char.animator, STANCE);
    installSafePlay(char.animator, 'agent');
    ctx.groundLock?.track(char.root, char.skeleton);
    // materialize, don't just appear
    const targetScale = char.root.scaling.clone();
    char.root.scaling.scaleInPlace(0.001);
    EffectsKit.burst(ctx.scene, pos.add(new Vector3(0, 1, 0)), 'glitch');
    SoundKit.play('powerUp', { pitch: 1.6, volume: 0.25 });
    tween(0.32, (k) => { char.root.scaling = Vector3.Lerp(new Vector3(0.001, 0.001, 0.001), targetScale, k); });
    const archetype = (['striker', 'rusher', 'flanker'] as const)[i % 3];
    const preset = STEERING_PRESETS[archetype];
    // ONE owner of this body's clips: the steering reports (idle / move / down), the owner shows it.
    const anim = new BeatOwner(char.animator);
    char.animator.setTimeScale(focus.worldScale);   // MATRIX: a body spawned inside Focus arrives on the room's clock
    const mob = new Mob(char, preset, (st) => {
      if (st === 'move') anim.loop(AGENT_STEP, { fadeSec: 0.16, speedRatio: Math.max(0.9, Math.min(1.5, preset.maxSpeed / 3)) });
      else if (st === 'idle') anim.loop(STANCE, { fadeSec: 0.2 });
      else { anim.beat(SPORT_CLIP.karateKnockdown, { fadeSec: 0.08 }); anim.loop(AGENT_FLOOR, { fadeSec: 0.15 }); }   // down: knockdown → the floor (was: the stance, standing back up while it sank). Beat BEFORE loop: a loop set first plays for a frame (a 1.45 m floor-pose flash, measured)
    });
    mob.startPursuit();
    pool.add(mob);
    // 2026-09-14 (owner: three hits at wave 1). These were spawned at hp 1 / maxHp 1 — a body dropped on one
    // touch, so the health fields existed and meant nothing and there was no bar worth drawing. MookHealth
    // owns the curve; it is shallow and capped on purpose, because one swing still has to clear a crowd.
    const hpPool = mookMaxHp(wave);   // `pool` above is the MOB pool — different thing, same word
    enemies.push({ mob, anim, brain: new EnemyBrain(wave), hp: hpPool, maxHp: hpPool, airUntil: 0, orbitUntil: 0, orbitDir: i % 2 ? 1 : -1, bar: null, stunUntil: 0, hitAt: -1e9, carried: false });
  }

  async function spawnWave(ctx: ModeContext): Promise<void> {
    wave++; kos = 0;
    SoundKit.play('powerUp', { pitch: 0.9, volume: 0.5 });   // wave-start horn
    SoundKit.play('crowdCheer', { volume: Math.min(0.3 + wave * 0.06, 0.9) });
    // horde size by tier: the desktop budget takes 20 bodies, a phone 12
    const spec = waveSpec(wave, ctx.scene.metadata?.felTier === 'mobile' ? 12 : 20);
    const count = spec.count;
    void spawnRing(wave, count);
    const proms: Promise<void>[] = [];
    for (let i = 0; i < count; i++) proms.push(spawnEnemy(ctx, (i / count) * Math.PI * 2 + wave, i));
    await Promise.all(proms);
    ctx.setHud({ wave, enemies: count, chi, banner: `WAVE ${wave}` });
    setTimeout(() => { if (!shopOpen) ctx.setHud({ banner: '' }); }, 900);
  }

  const nearest = (from: Vector3): Enemy | null =>
    enemies.reduce<Enemy | null>((best, e) =>
      e.carried ? best : !best || Vector3.Distance(e.mob.char.root.position, from) < Vector3.Distance(best.mob.char.root.position, from) ? e : best, null);

  function gainChi(ctx: ModeContext, amount: number): void {
    const before = chi;
    chi = Math.min(100, chi + amount * perks.chiMult * style.chiMult);
    ctx.setHud({ chi: Math.round(chi) });
    // The burst is the finisher-class move here, so it is EARNED the way the DRAGON is in the duel modes:
    // full chi is the cost, FORCE is the licence. A baseline body fills the gauge and still cannot throw it.
    if (CHI_BURST_ENABLED && !bursting && before < 100 && chi >= 100 && hasFightMove('dragon', myRatings)) {
      ctx.setHud({ banner: 'CHI READY · R1' });
      setTimeout(() => ctx.setHud({ banner: '' }), 900);
    }
  }

  // ── the shop (between waves; the run's shards — PerkShop) ──
  function publishShop(ctx: ModeContext): void {
    ctx.setHud({ perks: shop.hudLine(), coins: shards, banner: `WAVE ${wave} CLEAR · ${shop.selected.blurb} · ◀ ▶ browse · A buy · B fight` });
  }
  function openShop(ctx: ModeContext): void {
    if (shop.allOwned) { void spawnWave(ctx); return; }   // nothing left to buy: straight on
    shopOpen = true; shop.sel = 0; shopUntil = now() + SHOP_SEC * 1000;
    publishShop(ctx);
  }
  function closeShop(ctx: ModeContext): void {
    if (!shopOpen) return;
    shopOpen = false;
    ctx.setHud({ perks: '', banner: '' });
    void spawnWave(ctx);
  }
  function buySelected(ctx: ModeContext): void {
    const r = shop.buy(shards);
    if (!r.ok) { ctx.setHud({ banner: r.reason ?? 'NO' }); setTimeout(() => { if (shopOpen) publishShop(ctx); }, 600); SoundKit.play('miss', { volume: 0.3 }); return; }
    shards -= r.cost; stats.perksBought++;
    applyPerks(ctx, r.id);
    SoundKit.play('score', { pitch: 1.2, volume: 0.5 });
    EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.2, 0)), 'sparks');
    shopUntil = Math.max(shopUntil, now() + 2500);   // a buy buys a moment to read the next one
    if (shop.allOwned) { closeShop(ctx); return; }
    publishShop(ctx);
  }

  // ── pickups ──
  function dropPickup(ctx: ModeContext, at: Vector3, kind: DropKind): void {
    if (pickups.length >= DROPS.maxAlive) { const old = pickups.shift()!; old.mesh.material?.dispose(); old.mesh.dispose(); }
    const style = PICKUP_STYLE[kind];
    const mesh = kind === 'shard'
      ? MeshBuilder.CreateCylinder(`ke_pick_${kind}`, { diameter: 0.34, height: 0.06, tessellation: 24 }, ctx.scene)
      : kind === 'chi' ? MeshBuilder.CreateSphere(`ke_pick_${kind}`, { diameter: 0.32, segments: 12 }, ctx.scene)
      : MeshBuilder.CreateBox(`ke_pick_${kind}`, { size: 0.28 }, ctx.scene);
    mesh.material = unlitMat(ctx, `ke_pick_mat_${kind}_${now()}`, style.hex);
    mesh.position.copyFromFloats(at.x, 0.45, at.z); clampDisc(mesh.position);
    if (kind === 'shard') mesh.rotation.x = Math.PI / 2;   // a standing disc
    mesh.isPickable = false;
    pickups.push({ kind, mesh, life: DROPS.lifeSec, phase: Math.random() * Math.PI * 2 });
  }
  function collect(ctx: ModeContext, p: Pickup): void {
    stats.pickups++;
    if (p.kind === 'shard') { shards++; stats.shardsTotal++; ctx.setHud({ coins: shards }); SoundKit.play('score', { pitch: 1.5, volume: 0.35 }); }
    else if (p.kind === 'chi') { gainChi(ctx, DROPS.chiGain / perks.chiMult); SoundKit.play('powerUp', { pitch: 1.3, volume: 0.35 }); }
    else { vitals.heal(DROPS.healthHeal); publishHp(ctx); SoundKit.play('powerUp', { pitch: 1.0, volume: 0.4 }); }
    EffectsKit.burst(ctx.scene, p.mesh.position.clone(), 'sparks');
    p.mesh.material?.dispose(); p.mesh.dispose();
  }
  function tickPickups(ctx: ModeContext, dt: number): void {
    if (!pickups.length) return;
    const t = clockSec;
    const keep: Pickup[] = [];
    for (const p of pickups) {
      p.life -= dt;
      p.mesh.rotation.y += 3.2 * dt;
      p.mesh.position.y = 0.42 + 0.07 * Math.sin(t * PICKUP_BOB_HZ * Math.PI * 2 + p.phase);
      p.mesh.isVisible = p.life > DROPS.blinkSec || Math.floor(p.life * 8) % 2 === 0;   // blinks out
      if (p.life <= 0) { p.mesh.material?.dispose(); p.mesh.dispose(); continue; }
      const dx = player.root.position.x - p.mesh.position.x, dz = player.root.position.z - p.mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (!myDown.downed && d < DROPS.collectM) { collect(ctx, p); continue; }
      if (!myDown.downed && d < DROPS.magnetM) { const k = Math.min(1, 6 * dt); p.mesh.position.x += dx * k; p.mesh.position.z += dz * k; }   // the magnet: it comes to you
      keep.push(p);
    }
    pickups = keep;
  }

  // M110 — spend a full chi bar: an AoE knockback + heavy damage that reuses the
  // existing landHit/ko/wave-clear path, so a burst can clear a wave cleanly.
  function chiBurst(ctx: ModeContext): void {
    if (!CHI_BURST_ENABLED || chi < 100 || !swingCancelable() || carry || dodging || bursting || myDown.downed || shopOpen) return;   // a downed fighter cannot swing (the tree holds the floor)
    // Phase 8: surrounded 3+ makes this the CROWD-CLEAR finisher — bigger
    // radius read, brief invulnerability feel (dodge window), huge payoff.
    const surrounded = surroundedCount(player.root.position,
      enemies.map((e) => ({ id: 'e', pos: e.mob.char.root.position, hp: e.hp, airborneSec: 0 })));
    const isCrowdClear = surrounded >= 3;
    if (isCrowdClear) {
      ctx.setHud({ banner: 'CROWD CLEAR!' });
      SoundKit.play('crowdCheer', { volume: 0.9 });
    }
    bursting = true; chi = 0;
    ctx.setHud({ chi, banner: isCrowdClear ? 'CROWD CLEAR!' : 'CHI BURST' });
    setTimeout(() => { ctx.setHud({ banner: '' }); }, 900);
    matrix(ctx, 'chiBurst');                                    // the special is a Matrix beat: the uppercut at full length, the ring slowed
    vitals.iframeSec = Math.max(vitals.iframeSec, SLOWMO.chiBurst);   // untouchable through the burst
    book.reset(); queue.clear();
    SoundKit.play('crowdCheer', { volume: 0.5 });
    ctx.feel?.impact?.(0.9);
    const origin = player.root.position.clone();
    EffectsKit.burst(ctx.scene, origin.add(new Vector3(0, 1.1, 0)), 'glitch');
    EffectsKit.burst(ctx.scene, origin.add(new Vector3(0, 0.4, 0)), 'sparks');
    striking = true; strikeSeq++; strikeMove = MOVES.typhoon; strikeStartedAt = gameSec; strikeHitDone = true;
    myStrike = { weight: 'finisher', clip: STRIKES.Y.clip, until: now() + STRIKE_MAX_SEC * 1000 };   // the tree plays it; its settle ends the swing
    for (const e of liveBodies()) {
      const to = e.mob.char.root.position.subtract(origin); to.y = 0;
      const d = to.length();
      if (d > CHI_BURST_RADIUS + perks.burstRadius) continue;
      const dir = d > 0.001 ? to.scale(1 / d) : facingVec();
      const from = e.mob.char.root.position.clone();
      const target = from.add(dir.scale(CHI_BURST_KNOCKBACK));
      const root = e.mob.char.root;
      tween(0.26, (k) => { root.position = Vector3.Lerp(from, target, k); });
      EffectsKit.burst(ctx.scene, from.add(new Vector3(0, 1, 0)), 'sparks');
      landHit(ctx, e, true, 'finisher');                        // the burst clears outright — that is what full chi buys
    }
    chi = 0; ctx.setHud({ chi });
    bursting = false;
  }

  // ── THE-HUNDRED-COMBAT-DYNAMICS: the strike pipeline ─────────────────────────────────────────────────────────────
  /** Bodies still in the fight (not in the hero's hands, not in flight). */
  const liveBodies = (): Enemy[] => enemies.filter((e) => !e.carried);
  const xz = (e: Enemy) => ({ x: e.mob.char.root.position.x, z: e.mob.char.root.position.z });
  /** The L stick in WORLD space, or null inside the dead zone. */
  const stickWorld = (ctx: ModeContext): { x: number; z: number } | null => {
    if (Math.hypot(stickX, stickY) <= TARGET.stickDead) return null;
    const v = ctx.camDirector.stickWorldLatched(stickX, stickY);
    return { x: v.x, z: v.z };
  };
  const cancelSec = (m: HordeMove) => STRIKE_TIMING[m.weight].cancelAt * style.startupMult;
  /** A new command may cut the swing in flight: its hit has resolved and its cancel point has passed. */
  const swingCancelable = () => !striking || (!!strikeMove && strikeHitDone && gameSec - strikeStartedAt >= cancelSec(strikeMove));
  function endSwing(): void { striking = false; myStrike = null; strikeMove = null; strikeHitDone = true; }

  // ── MATRIX FOCUS ─────────────────────────────────────────────────────────────────────────────────────────────────
  function applyFocusClocks(): void {
    const room = focus.worldScale;
    for (const e of enemies) e.mob.char.animator.setTimeScale(room);
    partner?.animator.setTimeScale(room);
    player.animator.setTimeScale(focus.heroScale);
  }
  function onFocusStart(ctx: ModeContext): void {
    ctx.juice.tint(FOCUS_TINT);
    ctx.camDirector.pulse(0.45, 0.35);
    SoundKit.play('powerUp', { pitch: 0.55, volume: 0.5 });
    ctx.setHud({ banner: 'FOCUS' }); setTimeout(() => ctx.setHud({ banner: '' }), 500);
    console.info(`[MATRIX] focus on at ${Math.round(focus.value)}`);
  }
  function onFocusEnd(ctx: ModeContext, dry: boolean): void {
    ctx.juice.tint(null);
    SoundKit.play('whoosh', { pitch: 0.6, volume: 0.4 });
    if (dry) { ctx.setHud({ banner: 'FOCUS DRAINED' }); setTimeout(() => ctx.setHud({ banner: '' }), 600); }
    console.info(`[MATRIX] focus off (${dry ? 'dry' : 'released'}) after ${focus.heldSec.toFixed(2)} s`);
  }
  /** L1 inside Focus, running INTO the arena's edge: up onto the wall and along it. */
  function tryWallRun(ctx: ModeContext): boolean {
    const pos = player.root.position;
    if (!wallRunAvailable({ x: pos.x, z: pos.z }, { x: heroVel.x, z: heroVel.z }, ARENA_RADIUS)) return false;
    wallRun = startWallRun({ x: pos.x, z: pos.z }, { x: heroVel.x, z: heroVel.z });
    matrixStats.wallRuns++;
    SoundKit.play('whoosh', { pitch: 1.1, volume: 0.45 });
    ctx.setHud({ banner: 'WALL RUN' }); setTimeout(() => ctx.setHud({ banner: '' }), 500);
    ctx.momentum.report({ kind: 'near_miss', weight: 10 });
    console.info(`[MATRIX] wall run at r ${Math.hypot(pos.x, pos.z).toFixed(2)} dir ${wallRun.dir}`);
    return true;
  }
  /** Off the wall: a flying kick back through the ring at the nearest body (or the middle), dropping whoever it passes. */
  function wallKickOff(ctx: ModeContext): void {
    if (!wallRun) return;
    const pos = player.root.position;
    const n = nearest(pos);
    wallKick = startWallKick({ x: pos.x, z: pos.z }, n ? { x: n.mob.char.root.position.x, z: n.mob.char.root.position.z } : null);
    wallKickY0 = pos.y; wallRun = null; player.root.rotation.z = 0;
    player.root.rotation.y = Math.atan2(wallKick.dx, wallKick.dz);
    const clip = player.animator.clipNames.has('trick_jump_spin_kick') ? 'trick_jump_spin_kick' : SPORT_CLIP.karateKick;
    myStrike = { weight: 'heavy', clip, until: now() + 900 };   // the tree plays the kick; endSwing on its settle
    matrixStats.wallKicks++;
    SoundKit.play('whoosh', { pitch: 0.8, volume: 0.6 });
    ctx.setHud({ banner: 'WALL KICK' }); setTimeout(() => ctx.setHud({ banner: '' }), 600);
    console.info(`[MATRIX] wall kick toward ${n ? 'a body' : 'the middle'}`);
  }
  function tickMatrix(ctx: ModeContext, dt: number): void {
    if (wallRun) {
      wallRun.t += dt;
      const p = wallRunAt(wallRun, ARENA_RADIUS, wallRun.t);
      player.root.position.set(p.x, p.y, p.z);
      player.root.rotation.y = p.yaw;
      player.root.rotation.z = -wallRun.dir * 0.42;   // leaning into the wall
      if (p.done) wallKickOff(ctx);
      return;
    }
    if (wallKick) {
      const prev = { x: player.root.position.x, z: player.root.position.z };
      wallKick.t += dt;
      const p = wallKickAt(wallKick, wallKick.t, wallKickY0);
      player.root.position.set(p.x, p.y, p.z);
      const bodies = liveBodies();
      for (const i of kickHits(prev, { x: p.x, z: p.z }, bodies.map((e) => ({ x: e.mob.char.root.position.x, z: e.mob.char.root.position.z })), WALL_RUN.kickHitM, wallKick.hit)) {
        wallKick.hit.add(i);
        const e = bodies[i];
        e.hp -= WALL_RUN.kickDamage; e.hitAt = gameSec; matrixStats.kickHits++; focus.gain(FOCUS.hitGain);
        ctx.juice.hitStop(60); ctx.feel?.impact?.(0.5);
        EffectsKit.burst(ctx.scene, e.mob.char.root.position.add(new Vector3(0, 1.1, 0)), 'sparks');
        if (e.hp <= 0) { focus.gain(FOCUS.koGain); ko(ctx, e); }
        else staggerEnemy(e, WALL_RUN.kickStunSec, WALL_RUN.kickPush01, wallKick.dx, wallKick.dz, ctx);
        console.info(`[MATRIX] wall kick hit ${i}`);
      }
      if (p.done) { wallKick = null; player.root.position.y = 0; }
    }
  }

  /** A strike button. Carrying a body: the weapon verbs. Mid-swing before the cancel point: QUEUED (fires the frame it
   *  opens). Otherwise the string book names the move, the redirect picks its target, and the swing starts NOW. */
  function strike(ctx: ModeContext, key: StrikeBtn): void {
    if (blocking || dodging || myDown.downed || shopOpen) {
      // A swing thrown from the floor, out of a block, or mid-dodge is a RULE, and the rule used to be enforced in
      // silence (1 of 9 X and 2 of 9 Y presses in the rc19 capture answered nothing). Refusal throttles the line, so
      // a mashed button stays one callout.
      if (!shopOpen) refuse(ctx, myDown.downed ? 'GET UP FIRST' : blocking ? 'BLOCKING — LET GO TO SWING' : 'IN THE DODGE');
      return;   // a downed fighter cannot swing (the tree holds the floor)
    }
    if (carry) { if (key === 'Y') throwCarried(ctx); else swingCarried(ctx); return; }
    if (striking && !swingCancelable()) { queue.push(key, 'n', gameSec); grabQueuedAt = -Infinity; dyn.queued++; return; }
    if (striking) dyn.cancels++;
    const origin = player.root.position;
    const stick = stickWorld(ctx);
    const bodies = liveBodies();
    const ti = pickTarget({ x: origin.x, z: origin.z }, stick, bodies.map((e) => ({ x: e.mob.char.root.position.x, z: e.mob.char.root.position.z, threat: e.brain.attacking })));
    const target = ti >= 0 ? bodies[ti] : null;
    // the stick variant reads against the FACING before the turn: pulled back + B is the spin kick that hits behind
    const dir = stickDirTo(stick, player.root.rotation.y);
    const tpC = target ? target.mob.char.root.position : null;
    const move = book.press(key, dir, gameSec, { afterDash: gameSec - lastDashSec < 0.3, airborne: meAir.airborne, close: !!tpC && Math.hypot(tpC.x - origin.x, tpC.z - origin.z) < 1.35 });   // STORM: the rush out of a dash, the jump attacks in the air, the elbow chest to chest
    const reachMult = perks.reach * style.reachMult;
    // REDIRECT: every press re-aims — onto the target, or down the stick's line when nobody is in its cone. The turn
    // arrives inside the hit beat (never a one-frame pop: G1/G4 still hold, it is just a faster pivot).
    const lineYaw = target
      ? Math.atan2(target.mob.char.root.position.x - origin.x, target.mob.char.root.position.z - origin.z)
      : stick ? Math.atan2(stick.x, stick.z) : player.root.rotation.y;
    const turn = Math.abs(wrapYaw(lineYaw - player.root.rotation.y));
    faceTarget = lineYaw; faceRate = Math.max(STRIKE_TURN_RATE, turn / (STRIKE_TIMING[move.weight].hitAt * 0.7));
    if (turn > (100 * Math.PI) / 180) { dyn.redirects++; turnClock = { at: now(), deg: Math.round((turn * 180) / Math.PI) }; }
    dyn.maxTurnDeg = Math.max(dyn.maxTurnDeg, Math.round((turn * 180) / Math.PI));
    // the gap-close: a far target inside the move's lunge is closed on during the startup (on the game clock)
    if (target) {
      const tp = target.mob.char.root.position;
      const L = lungeFor(Math.hypot(tp.x - origin.x, tp.z - origin.z), move, reachMult);
      if (L > 0.05) {
        const from = origin.clone(), to = from.add(new Vector3(Math.sin(lineYaw), 0, Math.cos(lineYaw)).scale(L)); clampDisc(to);
        tween(Math.max(0.06, STRIKE_TIMING[move.weight].hitAt * 0.9), (k) => { if (!dodging && !myDown.downed) { player.root.position.x = from.x + (to.x - from.x) * k; player.root.position.z = from.z + (to.z - from.z) * k; } });
        dyn.lunges++;
      }
    }
    striking = true; strikeSeq++; strikeStartedAt = gameSec; strikeMove = move; strikeHitDone = false;
    // a picked STYLE's move may be a captured flip / spin with its own root track: it turns itself, so the spin layer stands down
    const played = styleVariant(move.clip, styleMotionOf(player.animator)?.vocab ?? null, player.animator.clipNames);
    const styleName = styleLabel(played);
    spinMove = move.spinDeg && !hasRootTrack(played) ? { deg: (move.spinDeg * Math.PI) / 180, sec: move.spinSec ?? 0.45, at: gameSec } : null;
    const tok = strikeSeq;
    myStrike = { weight: move.weight, clip: move.clip, until: now() + STRIKE_MAX_SEC * 1000 };   // the tree plays it (strikeSeq replays a same-weight link)
    if (!flowStats.clips.includes(move.clip)) flowStats.clips.push(move.clip);
    dyn.swings++; dyn.lastMove = move.id; dyn.lastString = [...book.history].join('') || key;
    SoundKit.play('whoosh', move.ender ? { pitch: 0.8, volume: 0.7 } : { pitch: 1 + book.history.length * 0.08 });
    if (move.ender || move.id === 'rush' || move.id === 'backSpin' || styleName) { ctx.setHud({ banner: styleName ?? move.label }); setTimeout(() => ctx.setHud({ banner: '' }), 600); }
    tween(STRIKE_TIMING[move.weight].hitAt * style.startupMult, () => {}, () => resolveHit(ctx, key, move, tok));
  }

  /** The hit beat of swing `tok` (game clock). */
  function resolveHit(ctx: ModeContext, key: StrikeBtn, move: HordeMove, tok: number): void {
    if (tok !== strikeSeq || !myStrike) return;          // the swing was interrupted (a clean hit taken, a dodge, a grab)
    strikeHitDone = true;
    // THE PROSPECTIVE ROUTE. It has to be resolved BEFORE the arc test, because the payoff IS the arc: the strike that
    // completes a route swings wider and further than the same strike on its own. The chain is only consumed if the
    // swing actually connects, so a whiffed route-finisher does not eat the sequence.
    const kind = ROUTE_KIND[key];
    const fresh = clockSec - lastLandAt > cancelWindowSec(myRatings) * style.chainMult;
    const seq = fresh ? [kind] : [...landed, kind];
    const route = routeFor(seq, myRatings);
    const reach = move.range * perks.reach * style.reachMult * (route ? 1.45 : 1);
    const arc = Math.min(360, move.arcDeg + perks.arcDeg + style.arcBonusDeg + (route ? (route.fx === 3 ? 110 : 60) : 0));

    // everyone in the arc, not the nearest one
    const origin = player.root.position;
    const hit = liveBodies().filter((e) => inArc(origin, player.root.rotation.y, e.mob.char.root.position, reach, arc));
    if (!hit.length) {
      // FREEFLOW: a swing that reached nobody while a body stood within a step of its reach is a MISS — the flow breaks.
      // With nobody near (between waves) it is shadow-boxing, and costs nothing.
      const near = liveBodies().some((e) => Vector3.Distance(origin, e.mob.char.root.position) <= reach + 1.2);
      const br = flow.whiff(near);
      if (br) onFlowBroken(ctx, br);
      return;
    }

    // the swing connected, so the sequence advances
    landed = seq.slice(-6);
    lastLandAt = clockSec;

    const t = now();
    if ((move.launch && move.ender) || route) matrix(ctx, 'finisher');
    else if (move.launch) matrix(ctx, 'heavyKo');
    const launches = move.launch || (route ? route.ender !== 'stun' : false) || focus.active;   // MATRIX: inside Focus every connect LAUNCHES
    if (move.ender) stats.finishers++;
    // SOUL CALIBUR WEIGHT: the connect holds for a beat that grows with the weight (hit-stop is the harness's, not a slow-mo)
    ctx.juice.hitStop(move.weight === 'light' ? 28 : move.weight === 'medium' ? 45 : 70);
    for (const e of [...hit]) landHit(ctx, e, launches, move.weight);   // the arc still reaches every body; each takes damage rather than dropping
    // FREEFLOW: every body the arc reached extends the flow (the ender's own banner already names the move)
    const fe = flow.hit(hit.length, move.weight, gameSec);
    onFlow(ctx, fe);
    // a CINEMATIC ENDER: a string's last link landing inside a real flow gets the camera punch and a longer hold
    if (move.ender && fe.count >= 5) { ctx.camDirector.pulse?.(0.6, 0.3); ctx.juice.hitStop(80); }
    if (hit.length >= 3) ctx.feel?.impact?.(0.55);
    // CROWD STUN: an ender (or the heavy) that connects staggers the whole pack around you, not only the arc
    if (move.stunRadius > 0) stunCrowd(ctx, origin, move.stunRadius * perks.reach, move.stunSec);
    // THE HORDE FEEDS THE METER. Clearing three bodies with one swing is the fantasy this mode sells and
    // the Game-Breaker layer could not see it happen.
    ctx.momentum.report({ kind: 'clean_hit', weight: Math.min(24, 6 * hit.length) });

    if (route) {
      landed = [];                                  // a completed route is spent
      const shake = routeShake(route.fx);
      ctx.juice.hitStop(routeHitStopMs(route.fx));
      ctx.juice.shake(shake.amp, shake.ms);
      ctx.feel?.impact?.(route.fx === 3 ? 0.7 : 0.45);
      ctx.momentum.report({ kind: 'chain', weight: route.fx === 3 ? 26 : 14 });
      SoundKit.play('impact', { pitch: route.fx === 3 ? 0.72 : 0.9, volume: 0.65 });
      EffectsKit.burst(ctx.scene, origin.add(new Vector3(0, 1.2, 0)), route.fx === 3 ? 'glitch' : 'sparks');
      stats.finishers += route.fx === 3 ? 1 : 0;
      ctx.setHud({ banner: `${route.label}! — ${hit.length} DOWN` });
      setTimeout(() => ctx.setHud({ banner: '' }), 900);
      console.info(`[KE-ROUTE] ${route.label} fx${route.fx} cleared ${hit.length} arc ${arc.toFixed(0)}deg reach ${reach.toFixed(2)}`);
    }
  }

  /**
   * A body takes a stagger: whatever it was doing is cancelled, the steering holds, it reacts and slides out.
   *
   * REACTIVE ENEMIES (THE HUNDRED, owner 2026-09-15). Every hit used to play the same flinch whatever landed — a jab and
   * a hammer fist read identically on the body that took them. The reaction now reads the WEIGHT of the blow:
   *   flinch  a light hit: the captured flinch (karate_mc_hit_react), a short slide
   *   reel    a medium / heavy hit or a crowd stun: the guard broken, the body reels back on its feet (karate_mc_stagger)
   *   launch  a launcher, a throw, a big stun push: knocked off the feet (karate_mc_knockdown) and back up (karate_mc_get_up),
   *           helpless for the whole fall — and a launched body BOWLS whoever it slides into (they reel, and the flow counts them)
   * The body turns to the blow first, so the reaction plays toward the hit instead of whichever way it was walking.
   */
  function staggerEnemy(e: Enemy, sec: number, push: number, dx: number, dz: number, ctx?: ModeContext): void {
    if (e.carried) return;
    e.brain.interrupt(); e.orbitUntil = 0; e.mob.hold();
    const kind = push >= 0.6 ? 'launch' : sec >= FLINCH_SEC * 1.25 ? 'reel' : 'flinch';
    const root = e.mob.char.root;
    if (Math.hypot(dx, dz) > 1e-3) root.rotation.y = Math.atan2(-dx, -dz);   // face the blow (dx,dz points away from the hitter)
    if (kind === 'launch') {
      e.stunUntil = Math.max(e.stunUntil, gameSec + Math.max(sec, LAUNCH_FLOOR_SEC));
      e.airUntil = Math.max(e.airUntil, now() + 450);
      e.anim.beat(SPORT_CLIP.karateKnockdown, { fadeSec: 0.05, onSettle: () => { if (enemies.includes(e) && !e.carried) e.anim.beat('karate_get_up', { fadeSec: 0.12 }); } });
    } else {
      e.stunUntil = Math.max(e.stunUntil, gameSec + sec);
      e.anim.beat(kind === 'reel' ? 'karate_stagger' : SPORT_CLIP.karateHitReact, { fadeSec: 0.05 });   // beat BEFORE loop (a loop set first plays for a frame)
    }
    e.anim.loop(STANCE, { fadeSec: 0.15 });
    if (push > 0.01) {
      const from = root.position.clone();
      const to = from.add(new Vector3(dx, 0, dz).scale(push)); clampDisc(to);
      const bowled = new Set<Enemy>([e]);
      tween(kind === 'launch' ? 0.3 : 0.18, (k) => {
        if (e.carried) return;
        const q = 1 - (1 - k) * (1 - k);
        const px = root.position.x, pz = root.position.z;
        root.position.x = from.x + (to.x - from.x) * q; root.position.z = from.z + (to.z - from.z) * q;
        if (kind !== 'launch' || !ctx) return;
        // BOWLING: a flying body knocks down the path — each body it passes reels off it once
        const others = liveBodies().filter((o) => !bowled.has(o));
        const hits = pathHits({ x: px, z: pz }, { x: root.position.x, z: root.position.z }, others.map(xz), 0.6);
        if (!hits.length) return;
        for (const i of hits) {
          const o = others[i]; bowled.add(o);
          staggerEnemy(o, FLINCH_SEC * 1.6, 0.4, dx, dz);
          EffectsKit.burst(ctx.scene, o.mob.char.root.position.add(new Vector3(0, 1, 0)), 'sparks');
        }
        dyn.bowled += hits.length;
        onFlow(ctx, flow.hit(hits.length, 'light', gameSec), bowled.size >= 3 ? `BOWLED ×${bowled.size - 1}` : undefined);
        SoundKit.play('impact', { pitch: 0.9, volume: 0.5 });
      });
    }
  }

  /** CROWD STUN — every body inside the radius staggers (falloff to the edge), a floor shock-ring, a hit-stop and a shake. */
  function stunCrowd(ctx: ModeContext, origin: Vector3, radius: number, sec: number): number {
    const bodies = liveBodies();
    const hits = crowdStun({ x: origin.x, z: origin.z }, bodies.map((e) => ({ x: e.mob.char.root.position.x, z: e.mob.char.root.position.z })), radius, sec);
    shockRing(ctx, origin, radius);
    if (!hits.length) return 0;
    for (const h of hits) staggerEnemy(bodies[h.index], h.sec, h.push, h.dx, h.dz, ctx);
    dyn.stuns++; dyn.stunnedMax = Math.max(dyn.stunnedMax, hits.length);
    ctx.juice.hitStop(hits.length >= 3 ? 90 : 60);
    ctx.juice.shake(0.1 + 0.03 * Math.min(6, hits.length), 240);
    ctx.feel?.impact?.(0.6);
    SoundKit.play('impact', { pitch: 0.6, volume: 0.8 });
    if (hits.length >= 3) { ctx.setHud({ banner: `CROWD STUN ×${hits.length}` }); setTimeout(() => ctx.setHud({ banner: '' }), 800); }
    return hits.length;
  }
  function shockRing(ctx: ModeContext, at: Vector3, radius: number): void {
    const mesh = MeshBuilder.CreateTorus(`ke_shock_${strikeSeq}_${shockRings.length}`, { diameter: 1, thickness: 0.06, tessellation: 40 }, ctx.scene);
    mesh.material = unlitMat(ctx, `${mesh.name}_m`, '#9FF6FF');
    mesh.position.copyFromFloats(at.x, 0.08, at.z); mesh.isPickable = false;
    shockRings.push({ mesh, t: 0, r: radius });
  }
  function tickShock(dt: number): void {
    if (!shockRings.length) return;
    shockRings = shockRings.filter((s) => {
      s.t += dt; const k = Math.min(1, s.t / SHOCK_SEC);
      const d = 2 * s.r * (0.25 + 0.75 * (1 - (1 - k) * (1 - k)));
      s.mesh.scaling.copyFromFloats(d, 1 + 3 * (1 - k), d);
      s.mesh.visibility = 1 - k;
      if (k >= 1) { s.mesh.material?.dispose(); s.mesh.dispose(); return false; }
      return true;
    });
  }

  // ── THE BODY AS A WEAPON: L1 on a staggered body grabs it; carried, A/B swings it round (a 360° sweep), Y or L1 throws
  //    it down the aim. The grab cancels a swing once its hit has resolved, so it lives INSIDE a string. X drops it. ──
  const grabbable = (e: Enemy) => !e.carried && (e.stunUntil > gameSec || gameSec - e.hitAt < THROW.grabbableSec);
  function tryGrab(ctx: ModeContext): boolean {
    if (carry || myDown.downed || dodging || blocking || shopOpen || meAir.airborne) return false;
    if (striking && !strikeHitDone) return false;
    const bodies = liveBodies();
    const gi = pickGrab({ x: player.root.position.x, z: player.root.position.z, yaw: player.root.rotation.y },
      bodies.map((e) => ({ x: e.mob.char.root.position.x, z: e.mob.char.root.position.z, grabbable: grabbable(e) })));
    if (gi < 0) {
      const g = bodies.filter(grabbable).map((b) => Math.hypot(b.mob.char.root.position.x - player.root.position.x, b.mob.char.root.position.z - player.root.position.z));
      dyn.lastGrabMiss = `${g.length} grabbable, nearest ${g.length ? Math.min(...g).toFixed(2) : '-'} m of ${bodies.length}`;
      return false;
    }
    const e = bodies[gi];
    queue.clear(); book.reset();
    e.carried = true; e.brain.interrupt(); e.mob.hold(); e.orbitUntil = 0; e.stunUntil = 0;
    ctx.groundLock?.release(e.mob.char.root);          // it leaves the floor now
    e.anim.beat(SPORT_CLIP.karateKnockdown, { fadeSec: 0.06 }); e.anim.loop(AGENT_FLOOR, { fadeSec: 0.12 });   // limp
    carry = { e, since: gameSec, swinging: false };
    strikeSeq++; striking = true; strikeMove = MOVES.jab; strikeStartedAt = gameSec; strikeHitDone = true;   // the reach
    myStrike = { weight: 'light', clip: 'jab', until: now() + STRIKE_MAX_SEC * 1000 };
    faceTarget = Math.atan2(e.mob.char.root.position.x - player.root.position.x, e.mob.char.root.position.z - player.root.position.z); faceRate = 30;
    dyn.grabs++;
    ctx.juice.hitStop(50);
    SoundKit.play('impact', { pitch: 0.75, volume: 0.5 });
    ctx.setHud({ banner: 'GRABBED · A SWING · Y THROW' }); setTimeout(() => ctx.setHud({ banner: '' }), 700);
    return true;
  }
  /** The carried body rides in front of the hero (limp, tilted) until it is swung or thrown. */
  function holdCarried(ctx: ModeContext): void {
    if (!carry || carry.swinging) return;
    const r = carry.e.mob.char.root; const f = facingVec();
    r.position.copyFromFloats(player.root.position.x + f.x * THROW.carryDist, 0.55, player.root.position.z + f.z * THROW.carryDist);
    r.rotation.y = player.root.rotation.y + Math.PI / 2; r.rotation.z = 1.25;
    if (gameSec - carry.since > THROW.carryMaxSec) throwCarried(ctx);   // nobody holds a body for ever: it goes
  }
  /** A body the weapon (or the thrown body) passes: damage, a long stagger, a big shove outward. */
  function weaponHit(ctx: ModeContext, e: Enemy, dx: number, dz: number, weight: 'medium' | 'heavy'): void {
    dyn.weaponHits++;
    landHit(ctx, e, true, weight);
    if (enemies.includes(e)) staggerEnemy(e, THROW.hitStunSec, 1.5, dx, dz);
    ctx.juice.shake(0.14, 160);
  }
  function swingCarried(ctx: ModeContext): void {
    if (!carry || carry.swinging) return;
    const c = carry; c.swinging = true; dyn.weaponSwings++;
    const r = c.e.mob.char.root;
    strikeSeq++; striking = true; strikeMove = MOVES.whirl; strikeStartedAt = gameSec; strikeHitDone = true;
    myStrike = { weight: 'medium', clip: 'roundhouse', until: now() + STRIKE_MAX_SEC * 1000 };
    faceTarget = null;
    const y0 = player.root.rotation.y, hitSet = new Set<Enemy>();
    let prev = { x: r.position.x, z: r.position.z };
    SoundKit.play('whoosh', { pitch: 0.6, volume: 0.8 });
    ctx.setHud({ banner: 'BODY SWING' }); setTimeout(() => ctx.setHud({ banner: '' }), 600);
    tween(THROW.swingSec, (k) => {
      if (carry !== c) return;
      const a = y0 + k * Math.PI * 2;
      player.root.rotation.y = a;
      const p = { x: player.root.position.x + Math.sin(a) * THROW.swingRadius, z: player.root.position.z + Math.cos(a) * THROW.swingRadius };
      r.position.copyFromFloats(p.x, 0.85, p.z); r.rotation.y = a + Math.PI / 2; r.rotation.z = 1.45;
      const bodies = liveBodies();
      for (const i of pathHits(prev, p, bodies.map(xz), THROW.swingHitM)) {
        const e = bodies[i]; if (hitSet.has(e)) continue; hitSet.add(e);
        const ox = e.mob.char.root.position.x - player.root.position.x, oz = e.mob.char.root.position.z - player.root.position.z; const ol = Math.hypot(ox, oz) || 1;
        weaponHit(ctx, e, ox / ol, oz / ol, 'medium');
      }
      prev = p;
    }, () => {
      if (carry !== c) return;
      c.swinging = false; endSwing();
      if (hitSet.size >= 2) { ctx.setHud({ banner: `BODY SWING ×${hitSet.size}` }); setTimeout(() => ctx.setHud({ banner: '' }), 700); }
      throwCarried(ctx);                              // the swing lets go at the end of the turn: swing → throw is one verb
    });
  }
  function throwCarried(ctx: ModeContext): void {
    if (!carry || carry.swinging) return;
    const e = carry.e; carry = null; dyn.throws++;
    const r = e.mob.char.root; const origin = player.root.position;
    // the aim: the stick, else the most urgent body, else straight ahead
    const stick = stickWorld(ctx);
    const bodies = liveBodies();
    const ti = stick ? -1 : pickTarget({ x: origin.x, z: origin.z }, null, bodies.map((b) => ({ x: b.mob.char.root.position.x, z: b.mob.char.root.position.z, threat: b.brain.attacking })));
    const yaw = stick ? Math.atan2(stick.x, stick.z)
      : ti >= 0 ? Math.atan2(bodies[ti].mob.char.root.position.x - origin.x, bodies[ti].mob.char.root.position.z - origin.z)
      : player.root.rotation.y;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    faceTarget = yaw; faceRate = 40;
    strikeSeq++; striking = true; strikeMove = MOVES.heavy; strikeStartedAt = gameSec; strikeHitDone = true;
    myStrike = { weight: 'heavy', clip: 'hook', until: now() + STRIKE_MAX_SEC * 1000 };
    const from = new Vector3(origin.x + dx * 0.8, 1.0, origin.z + dz * 0.8);
    const to = from.add(new Vector3(dx, 0, dz).scale(THROW.throwDist)); clampDisc(to);
    const hitSet = new Set<Enemy>(); let prev = { x: from.x, z: from.z };
    ctx.juice.hitStop(70);
    SoundKit.play('whoosh', { pitch: 0.5, volume: 0.9 });
    tween(THROW.throwSec, (k) => {
      const x = from.x + (to.x - from.x) * k, z = from.z + (to.z - from.z) * k;
      r.position.copyFromFloats(x, Math.max(0.15, from.y + THROW.throwApex * 4 * k * (1 - k) - 0.85 * k), z);
      r.rotation.y = yaw + Math.PI / 2; r.rotation.z = 1.4; r.rotation.x = k * Math.PI * 3;   // the tumble
      const live = liveBodies();
      for (const i of pathHits(prev, { x, z }, live.map(xz), THROW.throwHitM)) {
        const b = live[i]; if (hitSet.has(b)) continue; hitSet.add(b);
        weaponHit(ctx, b, dx, dz, 'heavy');
      }
      prev = { x, z };
    }, () => {
      r.rotation.x = 0; r.rotation.z = 0; r.position.y = 0;
      e.carried = false;
      EffectsKit.burst(ctx.scene, r.position.add(new Vector3(0, 0.3, 0)), 'dust');
      ctx.juice.shake(0.2, 260); SoundKit.play('impact', { pitch: 0.55, volume: 0.9 });
      stunCrowd(ctx, r.position.clone(), 1.9, 0.6);   // the landing knocks the ones it lands among off their feet
      ctx.setHud({ banner: hitSet.size ? `BODY THROW ×${hitSet.size}` : 'BODY THROW' }); setTimeout(() => ctx.setHud({ banner: '' }), 800);
      if (enemies.includes(e)) { e.hp = 0; ko(ctx, e); }   // a body used as a weapon is done
    });
    if (striking) tween(0.28, () => {}, () => { if (strikeMove === MOVES.heavy && !carry) endSwing(); });
  }
  /** Hands open: the carried body drops where it is (a hit taken, a dodge). */
  function dropCarried(ctx: ModeContext): void {
    if (!carry) return;
    const e = carry.e; carry = null;
    const r = e.mob.char.root; r.rotation.x = 0; r.rotation.z = 0; r.position.y = 0; clampDisc(r.position);
    e.carried = false;
    ctx.groundLock?.track(r, e.mob.char.skeleton);
    staggerEnemy(e, 0.6, 0, 0, 0);
  }

  /**
   * A land takes HEALTH off, and a KO is what happens when it runs out.
   *
   * This used to be `t.hp = 0` under a "Revolutions weight" comment — one solid strike, one body down. The
   * owner asked for the One Piece read instead (2026-09-14): bodies that absorb, with a bar you watch come
   * down. A finisher still drops a wave-1 body outright, which is what a finisher is for.
   *
   * The chi still comes on every LAND, not on every kill — a wave that takes three times the hits must not
   * also take three times as long to charge the burst, or the retune quietly nerfs the special.
   */
  function landHit(ctx: ModeContext, t: Enemy, launch: boolean, weight: 'light' | 'medium' | 'heavy' | 'finisher' = 'light'): void {
    const hpBefore = t.hp;
    t.hp = damageMook(t.hp, weight, launch || now() < t.airUntil);
    if (focus.active) { t.hp = Math.max(0, hpBefore - Math.round((hpBefore - t.hp) * FOCUS.damageMult)); matrixStats.focusStrikes++; }   // MATRIX: a Focus strike hits harder
    focus.gain(FOCUS.hitGain);
    gainChi(ctx, 8);
    ctx.feel?.impact?.(launch ? 0.55 : 0.35);
    EffectsKit.burst(ctx.scene, t.mob.char.root.position.add(new Vector3(0, 1.1, 0)), 'sparks');
    if (launch) EffectsKit.burst(ctx.scene, t.mob.char.root.position.add(new Vector3(0, 0.2, 0)), 'dust');
    t.hitAt = gameSec;
    if (t.hp <= 0) { focus.gain(FOCUS.koGain); ko(ctx, t); return; }
    // THE-HUNDRED: a connect STAGGERS — the wind-up it was in is gone, it slides back off the hit. Before this a body
    // took a jab mid-wind-up and hit you anyway (landHit never touched the brain).
    const ox = t.mob.char.root.position.x - player.root.position.x, oz = t.mob.char.root.position.z - player.root.position.z, ol = Math.hypot(ox, oz) || 1;
    const k = weight === 'light' ? 1 : weight === 'medium' ? 1.3 : 1.7;
    staggerEnemy(t, FLINCH_SEC * k * (launch ? 1.6 : 1), (launch ? 0.7 : 0.22) * k, ox / ol, oz / ol, ctx);
    dyn.flinches++;
    // still standing: the bar is the feedback that the hit counted
    SoundKit.play('impact', { pitch: 1.15, volume: 0.35 });
    updateBar(ctx, t);
  }

  /**
   * The ONE place this mode makes an unlit material.
   *
   * The StandardMaterial ratchet (visual/standardMaterialRatchet.test.ts) allows deliberately unlit
   * markers — a material with `disableLighting` cannot clip to white under a PBR rig because nothing lights
   * it — but it still counts occurrences, and it should: the point is that new ones stop appearing. The
   * pickups and the health bars want exactly the same thing, so they share one factory and the file's
   * count stays where it was rather than creeping because two features each wrote their own.
   */
  function unlitMat(ctx: ModeContext, name: string, hex: string): StandardMaterial {
    const m = new StandardMaterial(name, ctx.scene);
    m.disableLighting = true;
    m.emissiveColor = Color3.FromHexString(hex);
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    return m;
  }

  /**
   * The floating health bar (2026-09-14).
   *
   * A billboarded unlit quad, built ON FIRST DAMAGE rather than at spawn: a full bar over every untouched
   * body in a wave of eight is eight pieces of clutter telling the player nothing they did not already
   * know. It appears when you hit something, which is also when it starts being information.
   *
   * Scaled on x from the left edge rather than centred, so it drains in one direction like a bar and not
   * like a shrinking stick, and coloured through MookHealth so no surface picks its own thresholds.
   */
  function updateBar(ctx: ModeContext, e: Enemy): void {
    const k = mookHp01(e.hp, e.maxHp);
    if (!e.bar) {
      const bar = MeshBuilder.CreatePlane(`mook_bar_${Math.random().toString(36).slice(2, 8)}`, { width: BAR_W, height: 0.055 }, ctx.scene);
      bar.billboardMode = Mesh.BILLBOARDMODE_ALL;
      bar.isPickable = false;
      bar.renderingGroupId = 1;                      // over the bodies, never inside one
      bar.material = unlitMat(ctx, `${bar.name}_m`, mookBarHex(k));   // unlit: a lit bar reads as world geometry
      e.bar = bar;
    }
    const mat = e.bar.material as StandardMaterial;
    mat.emissiveColor = Color3.FromHexString(mookBarHex(k));
    e.bar.scaling.x = Math.max(0.001, k);
    e.bar.position.copyFrom(e.mob.char.root.position).addInPlace(new Vector3(0, BAR_Y, 0));
    // the left edge stays put while the right one comes in
    e.bar.position.x -= (BAR_W * (1 - k)) / 2;
  }

  function ko(ctx: ModeContext, e: Enemy): void {
    if (carry?.e === e) carry = null;
    e.bar?.dispose(); e.bar = null;
    enemies = enemies.filter((x) => x !== e);
    kos++; totalKos++;
    e.mob.down();                                               // the owner: knockdown → the floor hold
    ctx.groundLock?.release(e.mob.char.root);
    SoundKit.play('crowdCheer', { volume: 0.4 });
    EffectsKit.burst(ctx.scene, e.mob.char.root.position.add(new Vector3(0, 1, 0)), 'glitch');
    const root = e.mob.char.root;
    const at = root.position.clone();
    const drop = drops.onKo(vitals.ratio);
    if (drop) dropPickup(ctx, at, drop);
    // the body holds the floor for a beat, then sinks and shrinks out (on the game clock — a slow-mo beat slows it too)
    const y0 = at.y, s0 = root.scaling.clone();
    tween(2.4, (k) => {
      const q = Math.max(0, (k - 0.3) / 0.7);                  // the first 0.7 s: the body lies there
      root.position.y = y0 - 1.6 * q;
      root.scaling = s0.scale(Math.max(0.02, 1 - q * q));
    }, () => e.mob.char.dispose());
    ctx.setHud({ kos: totalKos });
    if (enemies.length === 0) {
      SoundKit.play('whistle');
      matrix(ctx, 'waveClear');
      ctx.setHud({ banner: `WAVE ${wave} CLEAR · ${kos} DOWN` });
      for (let i = 0; i < DROPS.waveClearShards; i++) { const a = (i / DROPS.waveClearShards) * Math.PI * 2; dropPickup(ctx, at.add(new Vector3(Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7)), 'shard'); }
      setTimeout(() => { ctx.setHud({ banner: '' }); openShop(ctx); }, CFG.waveClearBeatMs);
    }
  }

  // ── the agents' attack cycle (EnemyBrain steps on the GAME clock — the slow-mo slows the telegraph, that is the point) ──
  const attackers = () => enemies.filter((e) => e.brain.attacking).length;

  /** The steering reached the player: the agent squares up and winds up — or, capped out, circles and presses again. */
  function agentContact(ctx: ModeContext, e: Enemy, i: number): void {
    e.mob.hold();
    if (attackers() < maxAttackers(wave)) {
      const kick = wave >= ENEMY_ATTACK.kick.fromWave && (i + wave) % 3 === 0;
      e.brain.engage(kick ? 'kick' : 'jab');
      e.anim.loop(AGENT_WINDUP, { fadeSec: 0.12 });
      SoundKit.play('uiTick', { pitch: 0.7, volume: 0.25 });
    } else {
      e.orbitUntil = clockSec + ORBIT_SEC; stats.orbits++;
      e.anim.loop(AGENT_STEP, { fadeSec: 0.16, speedRatio: 0.8 });   // circling on the guard step
    }
  }
  function tickAgents(ctx: ModeContext, dt: number): void {
    // the pack fans out (separate()) — a horde, not a conga line; only the chasers move for it
    // THE-HUNDRED: a stagger that ran out puts the body straight back on the chase
    for (const e of enemies) if (e.stunUntil > 0 && !e.carried && gameSec >= e.stunUntil) { e.stunUntil = 0; e.mob.resume(); }
    const chasers = enemies.filter((e) => e.brain.phase === 'pursue' && e.orbitUntil === 0 && !e.carried);
    if (chasers.length > 1) {
      const off = separate(chasers.map((e) => ({ x: e.mob.char.root.position.x, z: e.mob.char.root.position.z })), SEPARATION_M);
      const k = Math.min(1, 6 * dt);
      chasers.forEach((e, j) => { const p = e.mob.char.root.position; p.x += off[j].x * k; p.z += off[j].z * k; clampDisc(p); });
    }
    for (const e of enemies) {
      const root = e.mob.char.root;
      const busy = e.brain.phase !== 'pursue' || e.orbitUntil > 0;
      if (!busy || e.carried) continue;
      // a squared-up agent tracks you (the wind-up faces where you ARE — the read is honest)
      if (e.brain.phase !== 'strike') {
        const to = player.root.position.subtract(root.position);
        const want = Math.atan2(to.x, to.z); let d = want - root.rotation.y;
        while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        const step = AGENT_TURN_RATE * dt;
        e.mob.setYaw(root.rotation.y + Math.max(-step, Math.min(step, d)));
      }
      if (e.orbitUntil > 0) {
        // capped out: circle the player at ENEMY_ATTACK.orbitSpeed, then press again
        const to = player.root.position.subtract(root.position); to.y = 0; const dist = to.length();
        if (dist > 0.01) { const tang = new Vector3(-to.z, 0, to.x).scale(e.orbitDir / dist); root.position.addInPlace(tang.scale(ENEMY_ATTACK.orbitSpeed * dt)); clampDisc(root.position); }
        if (clockSec >= e.orbitUntil) { e.orbitUntil = 0; e.mob.resume(); }
        continue;
      }
      const ev = e.brain.step(dt);
      if (ev === 'strike') {
        e.anim.beat(e.brain.strike === 'kick' ? SPORT_CLIP.karateKick : SPORT_CLIP.karateJab, { fadeSec: 0.09 });   // 0.09: the chambered fist → the jab's start is a long hop (0.34 m/frame at 0.06, measured)
        e.anim.loop(STANCE, { fadeSec: 0.12 });         // where the swing settles (recorded, never played under the beat)
        SoundKit.play('whoosh', { pitch: 0.85, volume: 0.35 });
        stats.strikesAt++;
      } else if (ev === 'land') {
        if (inArc(root.position, root.rotation.y, player.root.position, ENEMY_ATTACK.hitRange, AGENT_STRIKE_ARC_DEG)) agentHitsPlayer(ctx, e);
      } else if (ev === 'resume') e.mob.resume();
    }
  }

  /** An agent's strike reaches the player: dodge i-frames (a late one = the perfect read), then the core's vitals —
   *  the post-hit window, the guard's chip (never a drop), or a clean hit on the pool. DOWN only at zero. */
  function agentHitsPlayer(ctx: ModeContext, e: Enemy): void {
    if (myDown.downed) return;
    if (iframeSec > 0) {
      stats.dodged++; focus.gain(FOCUS.dodgeGain);   // MATRIX: a dodge refills Focus
      if (iframeSec > DODGE_IFRAME_SEC + perks.iframeBonus - PERFECT_WINDOW_SEC && matrix(ctx, 'perfectDodge')) {
        stats.perfect++;
        gainChi(ctx, 12);
        // FREEFLOW COUNTER: the perfect read strikes back. The attacker in reach takes a cross it walked into, the flow
        // extends and the meter fills faster than a hit would — reading beats mashing.
        const d = Vector3.Distance(player.root.position, e.mob.char.root.position);
        if (d <= 2.6 && !carry) {
          const tp = e.mob.char.root.position, op = player.root.position;
          faceTarget = Math.atan2(tp.x - op.x, tp.z - op.z); faceRate = 30;
          striking = true; strikeSeq++; strikeMove = MOVES.cross; strikeStartedAt = gameSec; strikeHitDone = true;
          myStrike = { weight: 'medium', clip: MOVES.cross.clip, until: now() + STRIKE_MAX_SEC * 1000 };
          landHit(ctx, e, false, 'medium');
          flowStats.counters++;
          onFlow(ctx, flow.counter(gameSec), 'COUNTER');
        } else flowBanner(ctx, 'BULLET TIME', 800);
      } else gainChi(ctx, 5);
      return;
    }
    const outcome = vitals.takeHit(enemyHitDamage(wave, e.brain.strike), { blocking, blockChipMult: style.blockChipMult });
    if (outcome === 'iframe') return;                          // still reeling from the last one — no double-tap
    lastHurtAt = clockSec; book.reset(); queue.clear(); landed = [];   // a route dies when you do
    if (outcome === 'blocked') {
      // the guard ABSORBS — a shove, a sliver of chip, pressure not a beating
      stats.blocked++;
      impactUntil = now() + IMPACT_SEC * 1000; meTree.clearBeat('guard_impact');
      gainChi(ctx, 2); ctx.feel?.impact?.(0.2);
      SoundKit.play('impact', { pitch: 0.8, volume: 0.3 });
      shove(e, VITALS.knockbackM * 0.4);
      publishHp(ctx);
      return;
    }
    // a CLEAN hit: the pool takes it, the body reels, the horde waits out the stagger. NEO ARMOUR: a jab never
    // interrupts a swing in flight (the fighter trades through it — the pool pays, the punch lands); a kick does.
    stats.hitsTaken++;
    onFlowBroken(ctx, flow.hurt());                             // FREEFLOW: a clean hit taken breaks the flow (a block does not)
    if (!striking || e.brain.strike === 'kick') {
      hitWeight = e.brain.strike === 'kick' ? 'medium' : 'light'; hitUntil = now() + REACT_SEC * 1000;
      meTree.clearBeat('react_light', 'react_medium');
      endSwing();                                               // the hit interrupts the swing
      dropCarried(ctx);                                         // and opens the hands
    } else stats.traded++;
    gainChi(ctx, 4);
    ctx.feel?.impact?.(e.brain.strike === 'kick' ? 0.55 : 0.4);
    ctx.momentum.report({ kind: 'blunder', weight: -10 });   // taking one cools the run
    EffectsKit.burst(ctx.scene, player.root.position.add(new Vector3(0, 1.2, 0)), 'sparks');
    shove(e, VITALS.knockbackM);
    publishHp(ctx);
    if (outcome === 'down') downPlayer(ctx);
  }
  function shove(e: Enemy, metres: number): void {
    const dir = player.root.position.subtract(e.mob.char.root.position); dir.y = 0;
    if (dir.lengthSquared() < 1e-4) dir.copyFrom(facingVec().scale(-1)); else dir.normalize();
    const from = player.root.position.clone(), to = from.add(dir.scale(metres)); clampDisc(to);
    tween(0.14, (k) => { if (!dodging) player.root.position = Vector3.Lerp(from, to, k); });
  }
  function downPlayer(ctx: ModeContext): void {
    vitals.hp = 0; publishHp(ctx); stats.downs++; book.reset(); queue.clear(); landed = []; hitUntil = 0;   // the knockdown, not a flinch first
    dropCarried(ctx); endSwing(); blocking = false;
    // THE RUN ENDS (MECHANICS PASS, 2026-09-15). The partner revived every knockdown, so a fighter who stopped fighting sat in
    // an endless run that could never end (the release gauntlet: 90 s mashing + 60 s hands-off, no card). Arcade lives: the
    // partner can pick you up MAX_REVIVES times; the knockdown after that is the end of the run, and the HUD says how many are left.
    if (!partnerDown.downed && stats.downs <= MAX_REVIVES) {
      // Phase 8 co-op rule kept: DOWN (not out) while the partner stands — they can revive you
      myDown.down(clockSec);
      SoundKit.play('crowdGroan');   // the tree: knockdown → the floor until the revive, then the get-up
      const left = MAX_REVIVES - stats.downs;
      ctx.setHud({ banner: left > 0 ? `YOU ARE DOWN — PARTNER CAN REVIVE YOU (${left} MORE)` : 'YOU ARE DOWN — LAST REVIVE' });
    } else {
      SoundKit.play('crowdGroan');
      outFlag = true; animate(0, 0);   // KO: the tree's knockdown → floor
      endSlowMo(ctx);
      ctx.end(`WAVE_${wave}`, totalKos * 100 + wave * 50 + Math.round(flow.points), { wave, kos: totalKos, bestFlow: flow.best });
    }
  }

  /** Once per frame: the player's and the partner's trees (ANIM-READABILITY — the one owner of their clips). */
  function animate(mySpeed01: number, partnerSpeed01: number): void {
    if (!meTree || !partnerTree) return;
    const t = now();
    if (myStrike && t > myStrike.until) { striking = false; myStrike = null; }   // a strike the tree never settled (safety, never measured)
    if (pStrike && t > pStrike.until) pStrike = null;
    const mine: CombatAnimInput = {
      speed01: blocking || myDown.downed ? 0 : mySpeed01, dashing: false, hasWeapon: false,
      speedMps: blocking || myDown.downed ? 0 : myMps,   // STRIDE MATCHING: real ground speed
      striking: myStrike?.weight ?? null, strikeClip: myStrike?.clip,
      strikeSpeed: myStrike && strikeMove ? strikeMove.speed : undefined, strikeSeq,   // THE-HUNDRED: the de-lagged rate; a cancelled link replays
      blocking, dodging, dodgeClip, airborne: meAir.airborne, parryFlash: false, guardImpactFlash: t < impactUntil,
      hitBy: t < hitUntil ? hitWeight : null, down: myDown.downed, out: outFlag, ulting: false,
    };
    // BIOMECH-WAVE2 G5: the same reads, as a BODY. `engaged` is "there is a horde in the ring" — between waves and in
    // the shop the hero stands in the idle instead of guarding an empty arena.
    meBio.speed01 = mine.speed01; meBio.strafe = 0; meBio.approach = 0;
    meBio.striking = myStrike?.weight ?? null; meBio.blocking = blocking; meBio.dodging = dodging;
    meBio.guardImpact = t < impactUntil; meBio.hitBy = t < hitUntil ? hitWeight : null;
    meBio.down = myDown.downed || outFlag; meBio.out = outFlag;
    meBio.rising = myDown.downed && myDown.channelSec > 0; meBio.engaged = enemies.length > 0 && !shopOpen;
    pBio.speed01 = partnerSpeed01; pBio.striking = pStrike?.weight ?? null; pBio.down = partnerDown.downed;
    pBio.engaged = enemies.length > 0 && !shopOpen;
    meTree.update(mine);
    partnerTree.update({
      speed01: partnerSpeed01, dashing: false, hasWeapon: false, striking: pStrike?.weight ?? null, strikeClip: pStrike?.clip,
      blocking: false, parryFlash: false, guardImpactFlash: false, hitBy: null, down: partnerDown.downed, out: false, ulting: false,
    });
  }

  function tryDodge(ctx: ModeContext, kind: 'dash' | 'homing' = 'dash'): void {   // STORM: the dodge IS the dash (i-frames, the perfect read); the chakra dash homes on the target
    if (myDown.downed || shopOpen) return;
    if (dodging && kind !== 'homing') return;   // the double tap lands mid-dash by definition: the chakra dash takes the running dash over
    if (dodging) { dodging = false; dyn.cancels++; }
    if (carry?.swinging) return;
    if (striking && !swingCancelable()) return;
    if (striking) { dyn.cancels++; endSwing(); }        // THE-HUNDRED: dodge-cancel — the beat-em-up's signature move
    dropCarried(ctx); queue.clear();
    dodging = true;
    iframeSec = DODGE_IFRAME_SEC + perks.iframeBonus;
    // A dodge breaks the LIGHT chain (ComboTracker's own rule) but deliberately NOT a route: dodge-cancelling
    // into the next link is the signature move of every beat-em-up worth playing, and a route that a dodge
    // killed would punish the exact thing the mode should reward.
    book.reset();
    const steered = Math.hypot(stickX, stickY) > 0.2;
    // STORM: the chakra dash homes on the target the stick (or the facing) picks — a rush in, stopping a reach short
    const bodiesD = liveBodies(); const tiD = kind === 'homing' ? pickTarget({ x: player.root.position.x, z: player.root.position.z }, stickWorld(ctx), bodiesD.map((e) => ({ x: e.mob.char.root.position.x, z: e.mob.char.root.position.z, threat: e.brain.attacking }))) : -1;
    const homeTo = tiD >= 0 ? bodiesD[tiD].mob.char.root.position : null;
    const dir = homeTo
      ? new Vector3(homeTo.x - player.root.position.x, 0, homeTo.z - player.root.position.z).normalize()
      : steered
        ? ctx.camDirector.stickWorldLatched(stickX, stickY).normalize()
        : kind === 'homing' ? facingVec() : facingVec().scale(-1);            // no input = dodge backward: the LEAN (a chakra dash with nobody: forward)
    dodgeClip = kind === 'homing' ? 'karate_rush' : steered ? DODGE_SLIP : LEAN_DODGE;
    lastDashSec = gameSec;
    SoundKit.play('whoosh', { pitch: 1.5, volume: 0.4 });
    const from = player.root.position.clone();
    const dashM = homeTo ? Math.max(0.5, Math.min(6.5, Math.hypot(homeTo.x - from.x, homeTo.z - from.z) - 1.4)) : kind === 'homing' ? 6.0 : DODGE_DISTANCE * perks.dodgeMult;   // STORM: the chakra dash covers the gap
    let to = from.add(dir.scale(dashM)); clampDisc(to);
    let slideSec = kind === 'homing' ? Math.max(0.22, Math.min(0.5, dashM / 13)) : DODGE_SLIDE_SEC;
    // PARKOUR IN THE HUNDRED (2026-09-15, owner decision): the dodge reads the ring. Steered OUT at the edge it is a WALL
    // FLIP back into the fight; steered AT a staggered or downed body close in front it is a VAULT over it. Both are the
    // captured moves (pk_*), with the dodge's i-frames held for the whole move.
    const owned = player.animator.clipNames;
    if (steered) {
      const pos = player.root.position, r = Math.hypot(pos.x, pos.z);
      const outward = r > 1e-3 ? (dir.x * pos.x + dir.z * pos.z) / r : 0;
      const over = liveBodies().find((e) => {
        const p = e.mob.char.root.position, dx = p.x - pos.x, dz = p.z - pos.z, d = Math.hypot(dx, dz);
        return d > 0.4 && d < 2.4 && (e.stunUntil > gameSec || e.airUntil > gameSec) && (dx * dir.x + dz * dir.z) / d > 0.8;
      });
      if (r > ARENA_RADIUS - 1.3 && outward > 0.6 && owned.has('pk_backflip')) {
        dodgeClip = 'pk_backflip';
        to = from.subtract(dir.scale(2.2)); clampDisc(to);
        slideSec = Math.max(DODGE_SLIDE_SEC, (player.animator.durationOf('pk_backflip') ?? 0.85) * 0.85);
        ctx.setHud({ banner: 'WALL FLIP' }); setTimeout(() => ctx.setHud({ banner: '' }), 600);
      } else if (over && owned.has('pk_vault')) {
        dodgeClip = 'pk_vault';
        const p = over.mob.char.root.position;
        to = new Vector3(p.x + dir.x * 1.6, from.y, p.z + dir.z * 1.6); clampDisc(to);
        slideSec = Math.max(DODGE_SLIDE_SEC, (player.animator.durationOf('pk_vault') ?? 1) * 0.7);
        ctx.setHud({ banner: 'VAULT' }); setTimeout(() => ctx.setHud({ banner: '' }), 600);
      }
    }
    // a picked style's evade (a side flip, the esquiva) is a whole captured move: the dodge lasts as long as it does
    const playedDodge = styleVariant(dodgeClip, styleMotionOf(player.animator)?.vocab ?? null, owned);
    if (hasRootTrack(playedDodge)) slideSec = Math.max(slideSec, (player.animator.durationOf(dodgeClip) ?? 0.8) * 0.85);
    iframeSec = Math.max(iframeSec, slideSec);
    // on the GAME clock: a perfect read's slow-mo stretches the slide with the lean
    tween(slideSec, (k) => { player.root.position = Vector3.Lerp(from, to, 1 - (1 - k) * (1 - k)); }, () => { dodging = false; });   // the tree's dodge settles on its own
  }

  const nextLandIn = (): number => {
    let best = -1;
    for (const e of enemies) {
      const b = e.brain; if (!b.attacking) continue;
      const left = b.phase === 'windup' ? windupSecFor(b.wave) - b.t + b.landAt : b.landAt - b.t;
      if (left >= 0 && (best < 0 || left < best)) best = left;
    }
    return best;
  };
  function publishTelemetry(ctx: ModeContext): void {
    if (process.env.NODE_ENV !== 'development') return;
    const md = (ctx.scene.metadata ??= {}) as Record<string, unknown>;
    md.karateNeo = {
      focus: { value: Math.round(focus.value), active: focus.active, starts: focus.starts, heldSec: +focus.heldSec.toFixed(2), ...matrixStats, wallRun: !!wallRun, wallKick: !!wallKick, roomClock: enemies[0]?.mob.char.animator.currentTimeScale ?? 1, heroClock: player.animator.currentTimeScale, roomMps: +roomMps.toFixed(2), heroMps: +heroMps.toFixed(2) },   // MATRIX FOCUS
      hp: Math.round(vitals.hp), hpMax: vitals.maxHp, wave, coins: shards, chi: Math.round(chi), slowMo: +slowmo.sec.toFixed(3), slowMoKind: slowmo.kind ?? '', slowMos: slowmo.episodes, timeScale: ctx.scene.animationTimeScale,
      attackers: attackers(), enemies: enemies.length, shop: shopOpen, down: myDown.downed, partnerRoot: partner?.root.name ?? '',
      nextLandIn: +nextLandIn().toFixed(3),   // seconds until the nearest agent's strike lands (−1 = none in flight) — the probe's perfect-dodge driver
      pp: mePosture?.layer.get() ?? null, ppAlly: partnerPosture?.layer.get() ?? null, bio: { ...meBio },   // BIOMECH-WAVE2 probes
      aim: (() => { const n = nearest(player.root.position); return n ? { x: n.mob.char.root.position.x, y: n.mob.char.root.position.y + 1.32, z: n.mob.char.root.position.z } : null; })(),
      ...stats,
      flow: { count: flow.count, best: flow.best, mult: flow.mult(), meter: +flow.meter.toFixed(2), points: Math.round(flow.points), ready: flow.takedownReady, ...flowStats, lastClip: myStrike?.clip ?? '' },
      dyn: { ...dyn, string: book.history.join(''), queued: queue.pending, carrying: !!carry, stunnedNow: enemies.filter((e) => e.stunUntil > gameSec).length, strikeSeq },
      nearestM: (() => { const n = nearest(player.root.position); return n ? +Math.hypot(n.mob.char.root.position.x - player.root.position.x, n.mob.char.root.position.z - player.root.position.z).toFixed(2) : -1; })(),
      heroYaw: +((player.root.rotation.y * 180) / Math.PI).toFixed(1),
    };
  }

  return {
    modeId: 'karate', mood: 'dojoWarm', camPreset: 'overShoulder',

    async load(ctx) {
      sceneRef = ctx.scene;
      // THE POOL IS THE ATHLETE'S. The band arrives from the host through the harness; absent is a guest,
      // and a guest is READY rather than penalised (core/PrqVitals).
      vitals = new PlayerVitals(prqMaxHp(VITALS.maxHp, ctx.prqBand));
      prqSpeed = prqSpeedMult(ctx.prqBand ? prqGrade(BAND_SCORE[ctx.prqBand]) : null);
      // THE SCHOOL, read HERE and not in the factory body — that runs when the mode registry is built, which
      // on Next is during SSR with no window and no URL, so every pick would resolve to the default. See
      // combat/loadout.ts hordeStyle() for why POWER becomes arc rather than damage in this mode.
      style = hordeStyle(blendTraits(readBlend()));
      // logged like [KE-ROUTE] beside it: the one line that lets a probe (or a bug report) confirm the pick
      // actually reached the fight, rather than only that the screen stored it
      console.info(`[KE-STYLE] ${blendName(readBlend())} reach ${style.reachMult.toFixed(2)} startup ${style.startupMult.toFixed(2)} arc ${style.arcBonusDeg >= 0 ? '+' : ''}${style.arcBonusDeg.toFixed(0)} block ${style.blockChipMult.toFixed(2)} chi ${style.chiMult.toFixed(2)} chain ${style.chainMult.toFixed(2)}`);
      // Build the arena FIRST so the M37 spawn guard sees a populated world
      // (>=8 meshes) and the dojoWarm ambient bed has somewhere to live.
      karateVenue = mountVenue(ctx, 'karate_endless', { keepGameplayCamera: true });
      // L4 — the Shadow Gauntlet is a gauntlet, and a gauntlet has an audience.
      // Ringed OUTSIDE the fighting disc (radius 7.5) and inside the mat (12),
      // so nobody stands anywhere the fight can reach. Instanced silhouettes,
      // never rigs: this mode already carries up to twelve pursuers plus an
      // ally, and L4's own rule is that a crowd must not compete with
      // characters for frame budget.
      crowd = new Onlookers(ctx.scene, Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2 + 0.22;
        return new Vector3(Math.sin(a) * 10.2, 0, Math.cos(a) * 10.2);
      }), '#3B2A52');
      if (!karateVenue) VenueKit.buildDojo(ctx.scene);
      EffectsKit.ambient(ctx.scene, 'dojo');
      player = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, { position: new Vector3(0, 0, 1.5), startClip: IDLE_CLIP });
      neverBindPose(player.animator, IDLE_CLIP);
      installSafePlay(player.animator, 'agent-player');
      ctx.groundLock?.track(player.root, player.skeleton);
      ctx.heroRef.current = player.root;
      youRing?.dispose(); youRing = null;
      ring?.dispose(); ring = mountPlayerRing(ctx.scene, player.root, { color: '#38bdf8', icon: readPlayerIcon() });   // PLAYER RING: the hp gauge at the feet, the glyph beside it

      partner = await CharacterLibrary.spawn(ctx.scene, CFG.heroUrl, { position: new Vector3(1.6, 0, 0.8), tint: '#22d3ee', startClip: IDLE_CLIP });
      neverBindPose(partner.animator, IDLE_CLIP);
      installSafePlay(partner.animator, 'agent-partner');
      ctx.groundLock?.track(partner.root, partner.skeleton);
      meTree = new CombatAnimTree(player.animator);
      partnerTree = new CombatAnimTree(partner.animator);
      // G5: the hero and the ally carry the chest / shoulders / head; the aim is the nearest agent's chest (the ring's
      // objective), the eyes go with it. No horde body gets a layer — see the header.
      mePosture?.dispose(); partnerPosture?.dispose();
      const chestOfNearest = (from: Vector3): Vector3 | null => { const n = nearest(from); return n ? n.mob.char.root.position.add(new Vector3(0, 1.32, 0)) : null; };
      mePosture = mountPostureLayer(ctx.scene, player.skeleton, player.root, () => {
        const { window, pose, legs } = combatPose(meBio);
        const at = chestOfNearest(player.root.position);
        const spent = 1 - Math.max(0, Math.min(1, vitals.hp / VITALS.maxHp));
        const dyn = dynamicPose(pose, meMotion.signals(meBio.speed01, spent, false), window, COMBAT_DYNAMIC);
        return { pose: dyn, legs, aim: at, eyes: at, window };
      }, 'KE-PP');
      partnerPosture = mountPostureLayer(ctx.scene, partner.skeleton, partner.root, () => { const { window, pose, legs } = combatPose(pBio); const at = chestOfNearest(partner.root.position); return { pose, legs, aim: at, eyes: at, window }; }, 'KE-PP-ALLY');
      faceTarget = null;
      meTree.onSettle = (st) => {
        if (!st.startsWith('strike_')) return;
        if (carry?.swinging) return;                     // the body swing owns the turn until its tween ends
        endSwing();
        // THE-HUNDRED: a press made inside the swing waits in the StrikeQueue (0.4 s) and fires at the cancel point in
        // update() — this used to consume the harness's 140 ms buffer here, at the clip's END, which ate 9 of 12 presses
        const q = queue.take(gameSec); if (q) strike(ctx, q.btn);
      };
      partnerTree.onSettle = (st) => { if (st.startsWith('strike_')) pStrike = null; };
      myStrike = null; pStrike = null; impactUntil = 0; outFlag = false; hitUntil = 0;

      localSource = new LocalInputSource();
      playerSlot = new PlayerSlot('player', localSource, true);
      // NETPLAY CO-OP (2026-09-12): the partner is an ALLY, so ?net=<room> seats a second human
      // beside you against the horde rather than opposite you. Same one-line source swap as 1v1;
      // with no flag present the PartnerAISource is constructed exactly as before.
      net = attachNetplay('karate');
      partnerSlot = net
        ? new PlayerSlot('partner', net.sourceFor('partner'), false)
        : new PlayerSlot('partner', new PartnerAISource(
          () => partner.root.position, () => nearest(partner.root.position)?.mob.char.root.position ?? null, 1.6,
          () => (myDown.downed ? player.root.position : null),
        ), false);

      pool = new MobPool();
      wave = 0; totalKos = 0; chi = 0; enemies = []; pickups = []; tweens = []; shards = 0; shop.owned.clear(); shop.sel = 0;
      landed = []; lastLandAt = -Infinity;
      // `?fight=` sets the ratings so the earned routes and the chi burst can be driven and measured; without a
      // PRQ scan plumbed into the modes a fighter is a baseline body. Same seam as Karate VS and Mixed Combat.
      myRatings = { ...BASELINE_RATINGS };
      if (typeof window !== 'undefined') {
        const v = Number(new URLSearchParams(window.location.search).get('fight'));
        if (Number.isFinite(v) && v > 0) {
          myRatings = ratingsFrom({ agility: v, speed: v, flexibility: v, power: v, strength: v, mental: v });
          console.info(`[KE-STYLE] ratings quickness ${myRatings.quickness.toFixed(0)} force ${myRatings.force.toFixed(0)} (override)`);
        }
      }
      perks = shop.state(); vitals.setMax(perks.maxHp, true); vitals.iframeSec = 0; hpShown = -1; lastHurtAt = -1e9;
      flow.reset(); hitCount = 0;
      book.reset(); queue.clear(); carry = null; gameSec = 0; strikeSeq = 0; strikeMove = null; strikeHitDone = true; landed = []; shopOpen = false;
      striking = false; blocking = false; dodging = false; xHoldSec = -1; iframeSec = 0; lastXTapSec = -1e9; lastDashSec = -1e9; endSlowMo(ctx);
      ctx.camDirector.snapTo(player.root.position, player.root.position.add(facingVec()));
      karateVenue?.hidePlaceholders();  // M74
      SoundKit.startAmbient('dojo');
      await spawnWave(ctx);
      publishHp(ctx, true);
      ctx.setHud({ chi, coins: shards, hint: 'Strings: A A A · A A B WHIRLWIND · A B Y HAMMER · B B Y TYPHOON · stick AT a body + Y = RUSH · pull back + B = SPIN BACK KICK · L1 on a staggered body = GRAB (A swing · Y throw) · tap BLOCK late on a wind-up = COUNTER · land 8 = TAKEDOWN (L1) · a miss or a hit taken breaks the flow · R1 = CHI BURST' });
    },

    onInput(ctx, e: FelInput) {
      SoundKit.unlock();
      localSource.feed(e);
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
      if (e.t === 'trigger' && e.side === 'R') focusHeld = e.value > 0.35;   // MATRIX FOCUS: the right trigger holds bullet time
      if (e.t === 'stick' && e.side === 'R') { lookX = e.x; lookY = e.y; }   // MODE-STICK-FACE: R stick → the director's look orbit
      if (shopOpen) {
        // the shop: ◀ ▶ (or ▲ ▼) browse, A buys, B fights now
        if (e.t === 'dpad' && e.pressed) {
          shop.move(e.dir === 'right' || e.dir === 'down' ? 1 : -1);
          SoundKit.play('uiTick', { volume: 0.3 }); publishShop(ctx);
        }
        if (e.t === 'button' && e.pressed && e.btn === 'A') buySelected(ctx);
        if (e.t === 'button' && e.pressed && e.btn === 'B') closeShop(ctx);
        if (e.t === 'button' && e.btn === 'X') { xHoldSec = -1; blocking = false; }
        return;
      }
      if (e.t === 'button' && e.pressed) {
        if (e.btn === 'A' || e.btn === 'B' || e.btn === 'Y') strike(ctx, e.btn);
        if (e.btn === 'X') xHoldSec = 0;
        if (e.btn === 'R1') chiBurst(ctx);
        // L1 JUMPS. R1 is the chi burst in this mode and A/B/Y are the strikes, so the shoulder that is
        // free here is the opposite one to the duels' -- the verb is the same, the button is what was left.
        // THE-HUNDRED: L1 is the GRAB when a staggered body is in reach (and the THROW while carrying one) — the jump
        // otherwise, so the verb only exists where it can do something.
        if (e.btn === 'L1' && !carry && flow.takedownReady && takedown(ctx)) { /* FREEFLOW: the takedown is L1's first meaning when it is ready */ }
        else if (e.btn === 'L1' && wallRun) wallKickOff(ctx);                                      // MATRIX: the kick off the wall
        else if (e.btn === 'L1' && focus.active && !carry && !striking && !wallKick && !myDown.downed && tryWallRun(ctx)) { /* MATRIX: up onto the wall */ }
        else if (e.btn === 'L1' && carry) throwCarried(ctx);
        else if (e.btn === 'L1' && striking && !strikeHitDone && !myDown.downed) { grabQueuedAt = gameSec; queue.clear(); }
        else if (e.btn === 'L1' && !myDown.downed && !tryGrab(ctx) && !striking && meAir.jump()) SoundKit.play('whoosh', { pitch: 0.9, volume: 0.3 });
      }
      if (e.t === 'button' && !e.pressed && e.btn === 'X') {
        const held = xHoldSec;
        xHoldSec = -1;
        if (held >= 0 && held * 1000 < DODGE_TAP_MS) { const dbl = gameSec - lastXTapSec < 0.32; console.info(`[KE-STORM] x tap held ${(held * 1000).toFixed(0)} ms dbl ${dbl} (since ${(gameSec - lastXTapSec).toFixed(2)} s) dodging ${dodging}`); lastXTapSec = dbl ? -1e9 : gameSec; tryDodge(ctx, dbl ? 'homing' : 'dash'); }   // STORM: a tap is the DASH, a double tap the CHAKRA DASH at the target
        blocking = false;
      }
    },

    update(ctx, dtReal) {
      if (spinApplied) { player.root.rotation.y -= spinApplied; spinApplied = 0; }   // the spin layer: back to the real facing first
      clockSec += dtReal;
      ring?.set(Math.max(0, Math.min(1, vitals.hp / Math.max(1, vitals.maxHp))));   // PLAYER RING: hp as the gauge
      { const br = flow.update(gameSec); if (br) onFlowBroken(ctx, br); else if (flow.count > 0) ctx.setHud({ flowDrop: Math.round(flow.drop01(gameSec) * 100) }); }
      // Phase 8: down/revive tick
      if (myDown.downed) {
        const near = Vector3.Distance(partner.root.position, player.root.position) <= REVIVE_RANGE;
        if (myDown.channel(dtReal, near)) {
          myDown.revive();
          vitals.revive(); publishHp(ctx);                      // VITALS.reviveRatio of the pool, with room to stand up (reviveIframeSec)
          lastHurtAt = clockSec;
          SoundKit.play('powerUp', { pitch: 1.1 });
          ctx.setHud({ banner: 'REVIVED — BACK IN THE FIGHT' });   // the tree rises through the get-up
          setTimeout(() => ctx.setHud({ banner: '' }), 900);
        } else ctx.setHud({ revive: near ? `PARTNER REVIVING ${Math.round(myDown.channelSec / 3 * 100)}%` : '' });
        if (myDown.bledOut(clockSec)) {
          endSlowMo(ctx);
          return ctx.end(`WAVE_${wave}`, totalKos * 100 + wave * 50 + Math.round(flow.points), { wave, kos: totalKos, bestFlow: flow.best });
        }
      }
      if (partnerDown.downed) {
        if (revivingPartner && Vector3.Distance(player.root.position, partner.root.position) <= REVIVE_RANGE) {
          if (partnerDown.channel(dtReal, true)) {
            partnerDown.revive();
            SoundKit.play('powerUp', { pitch: 1.1 });
            ctx.setHud({ banner: 'PARTNER REVIVED!' });
            setTimeout(() => ctx.setHud({ banner: '' }), 900);
          } else {
            ctx.setHud({ revive: Math.round(partnerDown.channelSec / 3 * 100) });
          }
        } else {
          partnerDown.channel(dtReal, false);
          ctx.setHud({ revive: 0 });
        }
        if (partnerDown.bledOut(clockSec)) {
          ctx.setHud({ banner: 'PARTNER BLED OUT' });
        }
      }
      // the one clock: the Matrix beat counts down on the real clock, everything in the ring runs at its scale
      const wasSlow = slowmo.active;
      slowmo.tick(dtReal);
      if (wasSlow && !slowmo.active) ctx.scene.animationTimeScale = 1;
      // MATRIX FOCUS: the trigger holds bullet time — the room at a third on the game clock, the hero on his own
      const wasFocus = focus.active;
      if (focusHeld && !focus.active && !myDown.downed && !shopOpen) { if (focus.start()) onFocusStart(ctx); }
      else if (!focusHeld && focus.active) focus.stop();
      if (focus.tick(dtReal)) onFocusEnd(ctx, true);
      else if (wasFocus && !focus.active) onFocusEnd(ctx, false);
      if (wasFocus !== focus.active) applyFocusClocks();
      { const fv = Math.round(focus.value); if (fv !== focusHud || focus.active !== focusHudOn) { focusHud = fv; focusHudOn = focus.active; ctx.setHud({ focus: fv, focusOn: focus.active }); } }
      const dt = dtReal * slowmo.scale * focus.worldScale;
      const dtHero = dtReal * slowmo.scale * focus.heroScale;   // the hero's clock: his movement, his air, the tweens that are his swing
      gameSec += dt;
      // the shop: the horde is down, the clock runs out into the next wave
      if (shopOpen && now() >= shopUntil) closeShop(ctx);

      if (xHoldSec >= 0) {
        xHoldSec += dtReal;
        if (xHoldSec * 1000 >= DODGE_TAP_MS && !blocking && !dodging) blocking = true;   // the tree shows the block
      }
      iframeSec = Math.max(0, iframeSec - dtReal);
      vitals.tick(dtReal);
      // out of contact the pool refills — the run is a beating survived, not attrition
      if (!myDown.downed && vitals.hp < vitals.maxHp && clockSec - lastHurtAt > HP_REGEN_DELAY_SEC) { vitals.heal(HP_REGEN_PER_SEC * dt); publishHp(ctx); }

      // game-clock tweens (the dodge slide, the shove, the spawn-in, the burst knockback, the KO sink)
      if (tweens.length) {
        const keep: Tween[] = [];
        for (const tw of tweens) { tw.t += dtHero; const k = Math.min(1, tw.t / tw.dur); tw.step(k); if (k >= 1) tw.done?.(); else keep.push(tw); }
        tweens = keep;
      }

      tickShock(dt);
      // THE-HUNDRED: a queued press fires the frame its swing's cancel point opens (or the moment the swing is over)
      if (queue.pending && swingCancelable() && !dodging && !blocking) { const q = queue.take(gameSec); if (q) strike(ctx, q.btn); }
      if (grabQueuedAt > -Infinity && (strikeHitDone || !striking)) { const fresh = gameSec - grabQueuedAt <= QUEUE_SEC; grabQueuedAt = -Infinity; if (fresh) tryGrab(ctx); }

      playerSlot.poll(dt);
      partnerSlot.poll(dt);
      net?.tick(playerSlot.intent);   // no-op without ?net=

      // MODE-STICK-FACE (2026-09-07): the stick is CAMERA-relative. The over-shoulder camera follows the FACING, so a
      // world-axis stick turned the fighter and the camera together until "right" meant "forward" (measured: stick-right
      // ran screen-LEFT once the camera had swung). Up = the camera's flat forward, right = screen right; no axis flipped.
      // The basis LATCHES while the stick is held (the over-shoulder camera swings behind every turn — a live basis
      // spun the fighter on the spot on a held stick-right: 0.26 m/s net, measured); a push runs straight.
      const vel = ctx.camDirector.stickWorldLatched(stickX, stickY).scaleInPlace(MOVE_SPEED * perks.speedMult * prqSpeed * (carry ? 0.7 : 1));
      // THE-HUNDRED: a held stick cuts a swing's recovery (past its cancel point + a hair, so the strike still reads) —
      // no more standing in the last third of a jab while the horde walks round you
      if (striking && strikeMove && !carry?.swinging && !queue.pending && vel.lengthSquared() > 0.05 && swingCancelable()
        && gameSec - strikeStartedAt >= cancelSec(strikeMove) + MOVE_CANCEL_EXTRA_SEC) { dyn.cancels++; endSwing(); }
      // the posture tracker: resolved in the fighter's own frame, so circling a body reads as a bank and backing off
      // a swing reads as sitting back
      // the bars ride their bodies: built on first damage, moved every frame after
      for (const e of enemies) if (e.bar) updateBar(ctx, e);
      meAir.update(dtHero);
      player.root.position.y = meAir.height;
      tickMatrix(ctx, dtHero);   // MATRIX: the wall run and the kick own the root while they last
      if (process.env.NODE_ENV === 'development' && dtReal > 0) {   // MATRIX telemetry: the room's and the hero's real-time speeds
        let sum = 0, n = 0;
        for (const e of enemies) { const r = e.mob.char.root.position; const l = enemyLastPos.get(e); if (l) { sum += Math.hypot(r.x - l.x, r.z - l.z) / dtReal; n++; enemyLastPos.set(e, l.copyFrom(r)); } else enemyLastPos.set(e, r.clone()); }
        roomMps = n ? sum / n : 0;
        heroMps = Math.hypot(player.root.position.x - heroLastPos.x, player.root.position.z - heroLastPos.z) / dtReal; heroLastPos.copyFrom(player.root.position);
      }   // the arc is EvadeMoves'; nothing here integrates gravity
      meMotion.update(vel.x, vel.z, player.root.rotation.y, dt);
      myMps = Math.hypot(vel.x, vel.z);
      heroVel.copyFrom(vel);
      let mySpeed01 = Math.min(1, vel.length() / (MOVE_SPEED * perks.speedMult * prqSpeed));
      if (wallRun) mySpeed01 = 1;   // MATRIX: three strides on the wall   // the INTENT, striking or not: a strike that runs out under a held stick settles straight into the guard step
      if (!striking && !blocking && !dodging && !myDown.downed && vel.lengthSquared() > 0.05) {   // the shop never freezes the feet: the ring is empty, the drops are yours to walk over
        const before = player.root.position.clone();
        player.root.position.addInPlace(vel.scale(dtHero));
        // Inset from the mat so the camera always has somewhere to stand behind
        // the player — see ARENA_RADIUS.
        clampDisc(player.root.position);
        // G1/G3: the body TURNS onto its travel. This was `rotation.y = atan2(vel)` — a stick reversal moved the whole
        // body (and the over-shoulder camera behind it) in ONE frame; measured 172° between two rendered frames.
        player.root.rotation.y = slewYaw(player.root.rotation.y, Math.atan2(vel.x, vel.z), TRAVEL_TURN_RATE, dt);
        faceTarget = null;                       // the stick owns the facing again the moment the feet are free
        if (dt > 0 && Vector3.Distance(before, player.root.position) / dt < 0.3) mySpeed01 = 0;   // pinned on the ring's edge: no stepping on the spot
      }
      // G1: a committed strike TURNS onto its target across the startup (it used to arrive in one frame)
      if (faceTarget !== null) {
        player.root.rotation.y = slewYaw(player.root.rotation.y, faceTarget, faceRate, dtReal);
        if (Math.abs(wrapYaw(faceTarget - player.root.rotation.y)) < 1e-3) {
          faceTarget = null;
          if (turnClock) { dyn.lastRedirect = `${turnClock.deg}deg in ${Math.round(now() - turnClock.at)}ms`; turnClock = null; }
        }
      if (spinMove) {
        const k = Math.min(1, (gameSec - spinMove.at) / spinMove.sec);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        spinApplied = spinMove.deg * e;
        player.root.rotation.y += spinApplied;
        if (k >= 1) { player.root.rotation.y -= spinApplied; spinApplied = 0; spinMove = null; }
      }
      }

      holdCarried(ctx);

      // partner movement/attacks
      const pIntent = partnerSlot.intent;
      const pVel = new Vector3(pIntent.moveX, 0, -pIntent.moveY).scale(2.6);
      partner.root.position.addInPlace(pVel.scale(dt));
      partner.root.position.x = Math.max(-8, Math.min(8, partner.root.position.x));
      partner.root.position.z = Math.max(-8, Math.min(8, partner.root.position.z));
      if (pVel.lengthSquared() > 0.05) partner.root.rotation.y = slewYaw(partner.root.rotation.y, Math.atan2(pVel.x, pVel.z), TRAVEL_TURN_RATE, dt);   // the ally turns too
      if (pIntent.action && !shopOpen) {
        const t = nearest(partner.root.position);
        if (!pStrike) pStrike = { weight: 'light', clip: SPORT_CLIP.karateJab, until: now() + STRIKE_MAX_SEC * 1000 };   // one jab per swing — the tree plays it
        if (t && Vector3.Distance(t.mob.char.root.position, partner.root.position) < 1.8) landHit(ctx, t, false);   // the partner's land drops a body too
      }

      // the horde: the steering closes; a contact is a SQUARE-UP, the hit comes off the wind-up (tickAgents)
      const contacts = pool.update(dt, player.root.position, vel, ENEMY_ATTACK.engageRange);
      for (const mob of contacts) {
        const idx = enemies.findIndex((e) => e.mob === mob);
        if (idx >= 0 && enemies[idx].brain.phase === 'pursue' && enemies[idx].orbitUntil === 0 && !enemies[idx].carried && enemies[idx].stunUntil === 0) agentContact(ctx, enemies[idx], idx);
      }
      tickAgents(ctx, dt);
      tickPickups(ctx, dt);

      // camera: locked behind the player's FACING (not the nearest enemy) —
      // pass a full-magnitude facing-direction vector as "velocity" so the
      // existing velocity-derived back-vector branch does the work (see
      // CameraDirector v2.4 header). Must stay near unit length: the branch
      // gates on lengthSquared() > 0.01, and the same vector also drives the
      // look-ahead target, which is exactly the desired effect here — the
      // camera looks slightly down the direction you're facing.
      crowd?.update(dt);
      // surrounded by three or more inside the crowd-clear radius: the camera
      // pulls back and up so the horde is the shot (preset change on the
      // transition only — setPreset re-derives the venue bounds)
      const surroundedNow = surroundedCount(player.root.position,
        enemies.map((e) => ({ id: 'e', pos: e.mob.char.root.position, hp: e.hp, airborneSec: 0 }))) >= 3;
      if (surroundedNow !== camCrowd) { camCrowd = surroundedNow; ctx.camDirector.setPreset(camCrowd ? 'crowd' : 'overShoulder'); }
      ctx.camDirector.look(lookX, lookY, dtReal);
      ctx.camDirector.update(player.root.position, facingVec(), nearest(player.root.position)?.mob.char.root.position ?? null);
      animate(mySpeed01, Math.min(1, pVel.length() / 2.6));
      publishTelemetry(ctx);
    },

    dispose() {
      net?.dispose(); net = null;
      if (sceneRef) { sceneRef.animationTimeScale = 1; sceneRef = null; }
      for (const p of pickups) { p.mesh.material?.dispose(); p.mesh.dispose(); }
      for (const r of shockRings) { r.mesh.material?.dispose(); r.mesh.dispose(); }
      pickups = []; tweens = []; shockRings = []; carry = null; queue.clear();
      mePosture?.dispose(); mePosture = null; partnerPosture?.dispose(); partnerPosture = null;
      youRing?.material?.dispose(); youRing?.dispose(); youRing = null; ring?.dispose(); ring = null;
      crowd?.dispose(); crowd = null; karateVenue?.dispose(); karateVenue = null; player?.dispose(); partner?.dispose(); pool?.dispose(); playerSlot?.dispose(); partnerSlot?.dispose(); SoundKit.stopAmbient();
    },
  };
})();

// HUD fields: hp (KARATE-NEO-COOP: the toughness pool, 0–100 of the max — the bezel draws the bar when a mode publishes
// one), chi, wave, enemies, kos, hits, coins (= the run's shards), perks (PerkShop.hudLine: '▶' the cursor, '✓' owned),
// revive (the partner's channel), banner, hint. partnerHp is not published (the ally cannot be knocked out in this pass).
