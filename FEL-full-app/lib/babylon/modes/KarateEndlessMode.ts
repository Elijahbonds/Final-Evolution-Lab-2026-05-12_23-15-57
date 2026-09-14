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

import { Color3, MeshBuilder, StandardMaterial, Vector3, type Mesh } from '@babylonjs/core';
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
  EnemyBrain, ENEMY_ATTACK, windupSecFor, maxAttackers, ComboTracker, isFinisher,
  DropDirector, DROPS, type DropKind, PerkShop, separate,
} from '../core/NeoCombatCore';
import { readBlend, blendTraits, blendName, SCHOOLS } from '../combat/schools';
import { hordeStyle, type HordeStyle } from '../combat/loadout';

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
const STRIKE_WEIGHT: Record<'A' | 'B' | 'Y', StrikeWeight> = { A: 'light', B: 'medium', Y: 'heavy' };
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
/** The running hit count decays after this long without a hit (the Musou number). */
const HIT_CHAIN_MS = 1400;

// horde sizing — deliberately bigger/faster than the old wave-survival pace
// A+ identity P0 (PM brief 2026-09-06): ONE SOLID STRIKE DROPS A BODY. No enemy HP pool, no chip — the wave escalates
// by count and speed, never by sponge. (hpBase 22 / hpPerWave 4 made jab 12 / kick 18 chip and only heavy one-tapped.)
const DODGE_TAP_MS = 220;          // hold longer than this = block, not dodge
const DODGE_IFRAME_SEC = 0.38;
const DODGE_DISTANCE = 3.2;
const DODGE_SLIDE_SEC = 0.36;      // the slide, on the GAME clock — a perfect read stretches it with the slow-mo
const PERFECT_WINDOW_SEC = 0.12;   // a strike that lands inside the FIRST window of the i-frames = you moved at the last instant = the perfect read
                                   // (M45 had it backwards: it rewarded a strike landing in the LAST 90 ms — a dodge thrown 0.3 s early)

// ── KARATE-NEO-COOP: the player's toughness (VITALS in NeoCombatCore) + what only the renderer knows ──
const HP_REGEN_DELAY_SEC = 3.5, HP_REGEN_PER_SEC = 4;   // out of contact the pool refills — a beating survived, not attrition
const ORBIT_SEC = 0.5;             // a capped-out agent circles this long before it presses again
const AGENT_STRIKE_ARC_DEG = ENEMY_ATTACK.arcDeg + 20;  // the renderer's arc is a hair wider than the core's (the hit-check happens on a body that may have stepped)
const AGENT_TURN_RATE = 9;         // rad/s — a wound-up agent tracks you
const SEPARATION_M = 0.9;          // the pack fans out: no two agents inside this

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
  /** capped out of a strike: circling until this game-clock time (0 = not orbiting) */ orbitUntil: number; orbitDir: 1 | -1;
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
  const vitals = new PlayerVitals();
  const slowmo = new SlowMoLatch();
  const combo = new ComboTracker();
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
  let meTree: CombatAnimTree, partnerTree: CombatAnimTree;
  let myStrike: Strike = null, pStrike: Strike = null, impactUntil = 0, outFlag = false;
  let hitCount = 0, lastHitAt = 0;                 // the Musou number
  let camCrowd = false;                             // H8: surrounded → the crowd preset
  let xHoldSec = -1, iframeSec = 0;
  let stickX = 0, stickY = 0;
  let lookX = 0, lookY = 0;   // R stick → camera look (MODE-STICK-FACE family, 2026-09-07)
  /** BIOMECH-WAVE2 G1: the yaw a committed strike is turning ONTO, and the rate that gets it there inside the startup. */
  let faceTarget: number | null = null, faceRate = 0;
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
  const TRAVEL_TURN_RATE = 12;
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
      tint: i % 2 ? '#1a1f26' : '#0d1117',            // dark suit, no franchise color palette
      scale: 0.95 + ((wave * 7 + i * 13) % 12) / 100,
      startClip: STANCE,
    });
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
    const mob = new Mob(char, preset, (st) => {
      if (st === 'move') anim.loop(AGENT_STEP, { fadeSec: 0.16, speedRatio: Math.max(0.9, Math.min(1.5, preset.maxSpeed / 3)) });
      else if (st === 'idle') anim.loop(STANCE, { fadeSec: 0.2 });
      else { anim.beat(SPORT_CLIP.karateKnockdown, { fadeSec: 0.08 }); anim.loop(AGENT_FLOOR, { fadeSec: 0.15 }); }   // down: knockdown → the floor (was: the stance, standing back up while it sank). Beat BEFORE loop: a loop set first plays for a frame (a 1.45 m floor-pose flash, measured)
    });
    mob.startPursuit();
    pool.add(mob);
    enemies.push({ mob, anim, brain: new EnemyBrain(wave), hp: 1, maxHp: 1, airUntil: 0, orbitUntil: 0, orbitDir: i % 2 ? 1 : -1 });   // one-knock: any land sets hp 0 → KO
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
      !best || Vector3.Distance(e.mob.char.root.position, from) < Vector3.Distance(best.mob.char.root.position, from) ? e : best, null);

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
    const mat = new StandardMaterial(`ke_pick_mat_${kind}_${now()}`, ctx.scene);
    mat.emissiveColor = Color3.FromHexString(style.hex); mat.diffuseColor = Color3.Black(); mat.specularColor = Color3.Black();
    mesh.material = mat;
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
    if (!CHI_BURST_ENABLED || chi < 100 || striking || dodging || bursting || myDown.downed || shopOpen) return;   // a downed fighter cannot swing (the tree holds the floor)
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
    combo.reset();
    SoundKit.play('crowdCheer', { volume: 0.5 });
    ctx.feel?.impact?.(0.9);
    const origin = player.root.position.clone();
    EffectsKit.burst(ctx.scene, origin.add(new Vector3(0, 1.1, 0)), 'glitch');
    EffectsKit.burst(ctx.scene, origin.add(new Vector3(0, 0.4, 0)), 'sparks');
    striking = true;
    myStrike = { weight: 'finisher', clip: STRIKES.Y.clip, until: now() + STRIKE_MAX_SEC * 1000 };   // the tree plays it; its settle ends the swing
    for (const e of [...enemies]) {
      const to = e.mob.char.root.position.subtract(origin); to.y = 0;
      const d = to.length();
      if (d > CHI_BURST_RADIUS + perks.burstRadius) continue;
      const dir = d > 0.001 ? to.scale(1 / d) : facingVec();
      const from = e.mob.char.root.position.clone();
      const target = from.add(dir.scale(CHI_BURST_KNOCKBACK));
      const root = e.mob.char.root;
      tween(0.26, (k) => { root.position = Vector3.Lerp(from, target, k); });
      EffectsKit.burst(ctx.scene, from.add(new Vector3(0, 1, 0)), 'sparks');
      landHit(ctx, e, true);                                   // the burst launches every body it clears
    }
    chi = 0; ctx.setHud({ chi });
    bursting = false;
  }

  function strike(ctx: ModeContext, key: keyof typeof STRIKES): void {
    if (striking || blocking || dodging || myDown.downed || shopOpen) return;   // a downed fighter cannot swing (the tree holds the floor)
    striking = true;
    // REAL MOVES: jab-jab-UPPERCUT — the third light inside the combo window is the finisher (ComboTracker)
    const finisher = key === 'A' ? isFinisher(combo.light(clockSec)) : (combo.reset(), false);
    const s = finisher ? STRIKES.Y : STRIKES[key];
    const target = nearest(player.root.position);
    if (target) {
      // G1/G4: AIM the swing, do not teleport onto it. The startup is 150 ms; the rate is whatever gets the body there
      // inside 120 ms of it, floored at a normal pivot — so the arc test below still measures the committed line, and
      // a 180° turn reads as seven frames of body instead of one frame of pop.
      const to = target.mob.char.root.position.subtract(player.root.position);
      const want = Math.atan2(to.x, to.z);
      const d = Math.abs(wrapYaw(want - player.root.rotation.y));
      faceTarget = want; faceRate = Math.max(STRIKE_TURN_RATE, d / 0.12);
    }
    SoundKit.play('whoosh', finisher ? { pitch: 0.8, volume: 0.7 } : {});
    myStrike = { weight: finisher ? 'finisher' : STRIKE_WEIGHT[key], clip: s.clip, until: now() + STRIKE_MAX_SEC * 1000 };   // the tree plays it; its settle ends the swing
    if (finisher) { stats.finishers++; ctx.setHud({ banner: 'FINISHER' }); setTimeout(() => ctx.setHud({ banner: '' }), 600); }
    setTimeout(() => {
      // THE PROSPECTIVE ROUTE. It has to be resolved BEFORE the arc test, because the payoff IS the arc: the
      // strike that completes a route swings wider and further than the same strike on its own. The chain is
      // only consumed if the swing actually connects, so a whiffed route-finisher does not eat the sequence.
      const kind = ROUTE_KIND[key];
      const fresh = clockSec - lastLandAt > cancelWindowSec(myRatings) * style.chainMult;
      const seq = fresh ? [kind] : [...landed, kind];
      const route = routeFor(seq, myRatings);
      const reach = s.range * perks.reach * style.reachMult * (route ? 1.45 : 1);
      const arc = s.arcDeg + perks.arcDeg + style.arcBonusDeg + (route ? (route.fx === 3 ? 110 : 60) : 0);

      // everyone in the arc, not the nearest one
      const origin = player.root.position;
      const hit = enemies.filter((e) => inArc(origin, player.root.rotation.y, e.mob.char.root.position, reach, arc));
      if (!hit.length) { if (now() - lastHitAt > HIT_CHAIN_MS) { hitCount = 0; ctx.setHud({ hits: 0 }); } return; }

      // the swing connected, so the sequence advances
      landed = seq.slice(-6);
      lastLandAt = clockSec;

      const t = now();
      if (t - lastHitAt > HIT_CHAIN_MS) hitCount = 0;
      if (s.launch || route) matrix(ctx, finisher || route?.fx === 3 ? 'finisher' : 'heavyKo');
      const launches = !!s.launch || (route ? route.ender !== 'stun' : false);
      for (const e of [...hit]) landHit(ctx, e, launches);   // one contact = one body down; heavy adds launch juice
      hitCount += hit.length; lastHitAt = t;
      ctx.setHud({ hits: hitCount });
      if (hit.length >= 3) ctx.feel?.impact?.(0.55);
      // THE HORDE FEEDS THE METER. Clearing three bodies with one swing is the fantasy this mode sells and
      // the Game-Breaker layer could not see it happen.
      if (hit.length) ctx.momentum.report({ kind: 'clean_hit', weight: Math.min(24, 6 * hit.length) });

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
    }, 150 * style.startupMult);
  }

  /** A land is a KO. Revolutions weight: the body drops on ONE solid strike — no damage math, no second hit to
   *  finish. A heavy (launch) strike lands harder for juice; it never needs a follow-up. */
  function landHit(ctx: ModeContext, t: Enemy, launch: boolean): void {
    t.hp = 0;
    gainChi(ctx, 8);
    ctx.feel?.impact?.(launch ? 0.55 : 0.35);
    EffectsKit.burst(ctx.scene, t.mob.char.root.position.add(new Vector3(0, 1.1, 0)), 'sparks');
    if (launch) EffectsKit.burst(ctx.scene, t.mob.char.root.position.add(new Vector3(0, 0.2, 0)), 'dust');
    ko(ctx, t);
  }

  function ko(ctx: ModeContext, e: Enemy): void {
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
    const chasers = enemies.filter((e) => e.brain.phase === 'pursue' && e.orbitUntil === 0);
    if (chasers.length > 1) {
      const off = separate(chasers.map((e) => ({ x: e.mob.char.root.position.x, z: e.mob.char.root.position.z })), SEPARATION_M);
      const k = Math.min(1, 6 * dt);
      chasers.forEach((e, j) => { const p = e.mob.char.root.position; p.x += off[j].x * k; p.z += off[j].z * k; clampDisc(p); });
    }
    for (const e of enemies) {
      const root = e.mob.char.root;
      const busy = e.brain.phase !== 'pursue' || e.orbitUntil > 0;
      if (!busy) continue;
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
      stats.dodged++;
      if (iframeSec > DODGE_IFRAME_SEC + perks.iframeBonus - PERFECT_WINDOW_SEC && matrix(ctx, 'perfectDodge')) {
        stats.perfect++;
        gainChi(ctx, 12);
        ctx.setHud({ banner: 'BULLET TIME' });
        setTimeout(() => ctx.setHud({ banner: '' }), 800);
      } else gainChi(ctx, 5);
      return;
    }
    const outcome = vitals.takeHit(enemyHitDamage(wave, e.brain.strike), { blocking, blockChipMult: style.blockChipMult });
    if (outcome === 'iframe') return;                          // still reeling from the last one — no double-tap
    lastHurtAt = clockSec; combo.reset(); landed = [];   // a route dies when you do
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
    if (!striking || e.brain.strike === 'kick') {
      hitWeight = e.brain.strike === 'kick' ? 'medium' : 'light'; hitUntil = now() + REACT_SEC * 1000;
      meTree.clearBeat('react_light', 'react_medium');
      striking = false; myStrike = null;                        // the hit interrupts the swing
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
    vitals.hp = 0; publishHp(ctx); stats.downs++; combo.reset(); landed = []; hitUntil = 0;   // the knockdown, not a flinch first
    striking = false; myStrike = null; blocking = false;
    if (!partnerDown.downed) {
      // Phase 8 co-op rule kept: DOWN (not out) while the partner stands — they can revive you
      myDown.down(clockSec);
      SoundKit.play('crowdGroan');   // the tree: knockdown → the floor until the revive, then the get-up
      ctx.setHud({ banner: 'YOU ARE DOWN — PARTNER CAN REVIVE YOU' });
    } else {
      SoundKit.play('crowdGroan');
      outFlag = true; animate(0, 0);   // KO: the tree's knockdown → floor
      endSlowMo(ctx);
      ctx.end(`WAVE_${wave}`, totalKos * 100 + wave * 50, { wave, kos: totalKos });
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
      blocking, dodging, dodgeClip, parryFlash: false, guardImpactFlash: t < impactUntil,
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

  function tryDodge(ctx: ModeContext): void {
    if (dodging || striking || myDown.downed || shopOpen) return;
    dodging = true;
    iframeSec = DODGE_IFRAME_SEC + perks.iframeBonus;
    // A dodge breaks the LIGHT chain (ComboTracker's own rule) but deliberately NOT a route: dodge-cancelling
    // into the next link is the signature move of every beat-em-up worth playing, and a route that a dodge
    // killed would punish the exact thing the mode should reward.
    combo.reset();
    const steered = Math.hypot(stickX, stickY) > 0.2;
    const dir = steered
      ? ctx.camDirector.stickWorldLatched(stickX, stickY).normalize()
      : facingVec().scale(-1);            // no input = dodge backward: the LEAN
    dodgeClip = steered ? DODGE_SLIP : LEAN_DODGE;
    SoundKit.play('whoosh', { pitch: 1.5, volume: 0.4 });
    const from = player.root.position.clone();
    const to = from.add(dir.scale(DODGE_DISTANCE * perks.dodgeMult)); clampDisc(to);
    // on the GAME clock: a perfect read's slow-mo stretches the slide with the lean
    tween(DODGE_SLIDE_SEC, (k) => { player.root.position = Vector3.Lerp(from, to, 1 - (1 - k) * (1 - k)); }, () => { dodging = false; });   // the tree's dodge settles on its own
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
      hp: Math.round(vitals.hp), hpMax: vitals.maxHp, wave, coins: shards, chi: Math.round(chi), slowMo: +slowmo.sec.toFixed(3), slowMoKind: slowmo.kind ?? '', slowMos: slowmo.episodes, timeScale: ctx.scene.animationTimeScale,
      attackers: attackers(), enemies: enemies.length, shop: shopOpen, down: myDown.downed, partnerRoot: partner?.root.name ?? '',
      nextLandIn: +nextLandIn().toFixed(3),   // seconds until the nearest agent's strike lands (−1 = none in flight) — the probe's perfect-dodge driver
      pp: mePosture?.layer.get() ?? null, ppAlly: partnerPosture?.layer.get() ?? null, bio: { ...meBio },   // BIOMECH-WAVE2 probes
      aim: (() => { const n = nearest(player.root.position); return n ? { x: n.mob.char.root.position.x, y: n.mob.char.root.position.y + 1.32, z: n.mob.char.root.position.z } : null; })(),
      ...stats,
    };
  }

  return {
    modeId: 'karate', mood: 'dojoWarm', camPreset: 'overShoulder',

    async load(ctx) {
      sceneRef = ctx.scene;
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
        striking = false; myStrike = null;
        // a press inside the swing is not eaten: the harness buffers every button-down (gameFeel) — the next strike
        // fires on the settle, so jab-jab-jab chains into the finisher at the clip's own cadence
        for (const k of ['A', 'B', 'Y'] as const) if (ctx.feel?.buffer?.consume(k)) { strike(ctx, k); break; }
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
      combo.reset(); landed = []; shopOpen = false;
      striking = false; blocking = false; dodging = false; xHoldSec = -1; iframeSec = 0; endSlowMo(ctx);
      ctx.camDirector.snapTo(player.root.position, player.root.position.add(facingVec()));
      karateVenue?.hidePlaceholders();  // M74
      SoundKit.startAmbient('dojo');
      await spawnWave(ctx);
      publishHp(ctx, true);
      ctx.setHud({ chi, coins: shards, hint: 'Agents wind up before they swing — tap BLOCK at the last instant for BULLET TIME · hold BLOCK to guard · JAB ×3 = FINISHER · R1 = CHI BURST · walk over the drops' });
    },

    onInput(ctx, e: FelInput) {
      SoundKit.unlock();
      localSource.feed(e);
      if (e.t === 'stick' && e.side === 'L') { stickX = e.x; stickY = e.y; }
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
      }
      if (e.t === 'button' && !e.pressed && e.btn === 'X') {
        const held = xHoldSec;
        xHoldSec = -1;
        if (held >= 0 && held * 1000 < DODGE_TAP_MS) tryDodge(ctx);
        blocking = false;
      }
    },

    update(ctx, dtReal) {
      clockSec += dtReal;
      if (hitCount > 0 && now() - lastHitAt > HIT_CHAIN_MS) { hitCount = 0; ctx.setHud({ hits: 0 }); }
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
          return ctx.end(`WAVE_${wave}`, totalKos * 100 + wave * 50, { wave, kos: totalKos });
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
      const dt = dtReal * slowmo.scale;
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
        for (const tw of tweens) { tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.step(k); if (k >= 1) tw.done?.(); else keep.push(tw); }
        tweens = keep;
      }

      playerSlot.poll(dt);
      partnerSlot.poll(dt);
      net?.tick(playerSlot.intent);   // no-op without ?net=

      // MODE-STICK-FACE (2026-09-07): the stick is CAMERA-relative. The over-shoulder camera follows the FACING, so a
      // world-axis stick turned the fighter and the camera together until "right" meant "forward" (measured: stick-right
      // ran screen-LEFT once the camera had swung). Up = the camera's flat forward, right = screen right; no axis flipped.
      // The basis LATCHES while the stick is held (the over-shoulder camera swings behind every turn — a live basis
      // spun the fighter on the spot on a held stick-right: 0.26 m/s net, measured); a push runs straight.
      const vel = ctx.camDirector.stickWorldLatched(stickX, stickY).scaleInPlace(3 * perks.speedMult);
      // the posture tracker: resolved in the fighter's own frame, so circling a body reads as a bank and backing off
      // a swing reads as sitting back
      meMotion.update(vel.x, vel.z, player.root.rotation.y, dt);
      myMps = Math.hypot(vel.x, vel.z);
      let mySpeed01 = Math.min(1, vel.length() / (3 * perks.speedMult));   // the INTENT, striking or not: a strike that runs out under a held stick settles straight into the guard step
      if (!striking && !blocking && !dodging && !myDown.downed && vel.lengthSquared() > 0.05) {   // the shop never freezes the feet: the ring is empty, the drops are yours to walk over
        const before = player.root.position.clone();
        player.root.position.addInPlace(vel.scale(dt));
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
        if (Math.abs(wrapYaw(faceTarget - player.root.rotation.y)) < 1e-3) faceTarget = null;
      }

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
        if (idx >= 0 && enemies[idx].brain.phase === 'pursue' && enemies[idx].orbitUntil === 0) agentContact(ctx, enemies[idx], idx);
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
      pickups = []; tweens = [];
      mePosture?.dispose(); mePosture = null; partnerPosture?.dispose(); partnerPosture = null;
      crowd?.dispose(); crowd = null; karateVenue?.dispose(); karateVenue = null; player?.dispose(); partner?.dispose(); pool?.dispose(); playerSlot?.dispose(); partnerSlot?.dispose(); SoundKit.stopAmbient();
    },
  };
})();

// HUD fields: hp (KARATE-NEO-COOP: the toughness pool, 0–100 of the max — the bezel draws the bar when a mode publishes
// one), chi, wave, enemies, kos, hits, coins (= the run's shards), perks (PerkShop.hudLine: '▶' the cursor, '✓' owned),
// revive (the partner's channel), banner, hint. partnerHp is not published (the ally cannot be knocked out in this pass).
