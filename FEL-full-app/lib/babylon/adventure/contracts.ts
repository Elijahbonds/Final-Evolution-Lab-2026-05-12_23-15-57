/**
 * The Adventure: the shared contracts (ADVENTURE PLAN, 2026-10-06; docs/ADVENTURE-PLAN.md).
 *
 * WHY THIS FILE EXISTS. Phase A is three lanes building at once: A1 (movement, rails, flight, riding), A2 (combat,
 * magic, monsters, bosses) and A3 (partner, fusion, stats, energy, saves, the Mirror hook). They meet only here. Each
 * lane codes against these types, tests against fakes built from them, and never imports another lane's folder. A4
 * then composes the three systems through `AdventureSystem`.
 *
 * RULES FOR THIS FILE.
 * - Pure: types, constant tables and tiny pure helpers. No Babylon import, no DOM, no `Date.now()`, no randomness.
 *   Everything in the Adventure's simulation must run headless (vitest today, a dedicated server later), so the data
 *   it trades in cannot depend on a scene.
 * - Frozen during Phase A. A lane that needs a change writes `contract request:` in its PR body; A4 applies it. New
 *   fields are added as OPTIONAL so nothing already coded against the contract breaks.
 * - IP line: every name in here is generic. No character, place, move or spell name from a feel reference ships.
 */

import type { PrqAttr, PrqGrade } from '@/lib/prq';
import type { StyleBlend } from '@/lib/babylon/combat/schools';

/** Bumped only when a contract changes shape in a way a lane must react to (pinned by contracts.test.ts). */
export const ADVENTURE_CONTRACTS_VERSION = 1;

// ── Space ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** World metres, +y up, Babylon's left-handed axes (+z forward at yaw 0). A plain object: never a Babylon Vector3. */
export interface Vec3 { x: number; y: number; z: number }
export interface Vec2 { x: number; y: number }

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

// ── Unions (pinned by the test: a change here is a change every lane feels) ──────────────────────────────────────

/**
 * Who is in control of an actor's body this tick. A1's state machine is the ONLY writer; A2 and A3 request a change
 * through the actor's fields (`hp` at zero → 'ko', `stunSec` > 0 → 'stunned', `ridingId` set → 'riding',
 * `fusion.active && wantsFlight` → 'flight').
 */
export const MOVEMENT_STATES = ['ground', 'air', 'grind', 'wallrun', 'flight', 'riding', 'stunned', 'ko'] as const;
export type MovementState = (typeof MOVEMENT_STATES)[number];

/** Generic elements. The partner's element is the player's too, and it grows with fusion (owner, 2026-10-06). */
export const ELEMENTS = ['fire', 'water', 'earth', 'wind', 'lightning', 'ice', 'light', 'shadow'] as const;
export type Element = (typeof ELEMENTS)[number];

/** Mind powers: learned through the story, powered by energy (owner's "A and C"). */
export const MIND_POWERS = ['telekinesis', 'slowTime', 'barrier', 'foresight'] as const;
export type MindPower = (typeof MIND_POWERS)[number];

/** Where a spell's power comes from: an element you learned, your mind, or your partner's element. */
export const SPELL_KINDS = ['element', 'mind', 'partner'] as const;
export type SpellKind = (typeof SPELL_KINDS)[number];

export const SPELL_SHAPES = ['bolt', 'cone', 'nova', 'wall', 'zone', 'grab', 'self'] as const;
export type SpellShape = (typeof SPELL_SHAPES)[number];

/** The player's choice (owner, 2026-10-06): an evolving creature, or a second built character (a Creator slot). */
export const PARTNER_KINDS = ['creature', 'character'] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

export const ACTOR_KINDS = ['player', 'partner', 'bot', 'monster', 'boss', 'npc'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

/** The PRQ band, as ModeContext.prqBand carries it. Absent = a guest = READY (core/PrqVitals: never a penalty). */
export type PrqBand = PrqGrade['key'];
export const PRQ_BANDS: readonly PrqBand[] = ['RECOVERING', 'READY', 'PRIMED', 'ELITE'];

export type ActorId = string;
/** Team 0 is the player's party in story; in the BR every solo fighter or duo has its own team. Monsters use -1. */
export type TeamId = number;
export const MONSTER_TEAM: TeamId = -1;

// ── Input ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * One tick of intent for one actor. A human's comes from A4's mapper (InputBus FelInput → MoveInput); a partner's from
 * A3's brain; a bot's from the BR brain; a net peer's from the wire. The systems cannot tell them apart, which is the
 * point (the same seam as PlayerSlot's ControlSource).
 *
 * Booleans without `Held` are EDGES (true on the tick the press happened, once). `...Held` are levels.
 */
export interface MoveInput {
  /** Left stick, −1..1, INTENT space: +y = away from the camera (PlayerSlot's convention, not the pad's). */
  move: Vec2;
  /** The camera's yaw in radians, so `move` can be made camera-relative (see wishDir). */
  camYaw: number;
  /** Right stick, −1..1: camera, or a lock-switch flick while locked (|x| > 0.7 on the edge). */
  look: Vec2;
  jump: boolean;
  jumpHeld: boolean;
  /** Ground: Storm dash (dodge while locked). Air: air dash. Flight: burst. Double-tap: homing dash to the lock. */
  dash: boolean;
  /** Held dash: sprint on the ground, the high-speed cruise in flight. */
  dashHeld: boolean;
  attackLight: boolean;
  attackHeavy: boolean;
  /** Toggle lock-on. */
  lock: boolean;
  /** Guard; a press inside the parry window is a parry. */
  guardHeld: boolean;
  /** Cast the selected spell. */
  magic: boolean;
  magicHeld: boolean;
  /** Spell slot 0..3 picked this tick, or null. */
  magicSlot: number | null;
  /** Slow-time (the mind power), held. */
  focusHeld: boolean;
  /** Partner command (cycle follow / engage / guard me). */
  partner: boolean;
  /** Fuse when the meter is full; unfuse while fused. Mount / dismount when beside a rideable partner. */
  fuse: boolean;
  /** Rail lean and flight bank, −1..1 (left negative). On a rail: lean into a curve for speed, hold + jump to switch. */
  lean: number;
  /** Flight only. */
  ascendHeld: boolean;
  descendHeld: boolean;
}

export const NEUTRAL_MOVE_INPUT: Readonly<MoveInput> = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }), camYaw: 0, look: Object.freeze({ x: 0, y: 0 }),
  jump: false, jumpHeld: false, dash: false, dashHeld: false, attackLight: false, attackHeavy: false, lock: false,
  guardHeld: false, magic: false, magicHeld: false, magicSlot: null, focusHeld: false, partner: false, fuse: false,
  lean: 0, ascendHeld: false, descendHeld: false,
}) as Readonly<MoveInput>;

/** A fresh, mutable neutral input (systems may consume edges by clearing them). */
export function neutralInput(): MoveInput {
  return { ...NEUTRAL_MOVE_INPUT, move: { x: 0, y: 0 }, look: { x: 0, y: 0 } };
}

/**
 * The stick as a world-space XZ wish, camera-relative, magnitude 0..1. Forward on the stick is the camera's forward
 * (+z rotated by camYaw); right is the camera's right. The one conversion every lane would otherwise write its own of.
 */
export function wishDir(input: Pick<MoveInput, 'move' | 'camYaw'>): { x: number; z: number; mag: number } {
  const mx = input.move.x, my = input.move.y;
  const mag = Math.min(1, Math.hypot(mx, my));
  if (mag < 1e-6) return { x: 0, z: 0, mag: 0 };
  const s = Math.sin(input.camYaw), c = Math.cos(input.camYaw);
  // forward = (sin, cos), right = (cos, −sin): yaw 0 looks down +z with +x on the right.
  const x = my * s + mx * c;
  const z = my * c - mx * s;
  const len = Math.hypot(x, z) || 1;
  return { x: (x / len) * mag, z: (z / len) * mag, mag };
}

// ── Stats and energy ──────────────────────────────────────────────────────────────────────────────────────────────

/** A meter: current and max. Every lane may SPEND (spendPool); regen and max belong to one owner (CombatStats). */
export interface Pool { cur: number; max: number }

export const pool = (max: number, cur = max): Pool => ({ cur: Math.max(0, Math.min(max, cur)), max });

/** Spend `n` if it is all there. Returns false (and spends nothing) when the pool is short: no half-casts. */
export function spendPool(p: Pool, n: number): boolean {
  if (!(n >= 0) || p.cur + 1e-9 < n) return false;
  p.cur = Math.max(0, p.cur - n);
  return true;
}

/**
 * The fight numbers. A2 writes hp and poise, and owns stamina outright (spend AND regen: the Souls-like delay is a
 * combat feel). A3 owns every max value, energy regen and `special`. Anyone may spend energy (spendPool).
 */
export interface CombatStats {
  hp: Pool;
  /** Souls-like stamina: attacks, dodges, guard hits and sprint spend it; it regenerates after a short delay. */
  stamina: Pool;
  /** Magic and specials. */
  energy: Pool;
  /** Stagger resistance; at zero the actor is staggered (bosses and brutes mostly). */
  poise: Pool;
  /** The Mirror-charged special, 0..1. Fills from combat too, so the camera is never required. */
  special: number;
}

/** Everything that shapes an actor's numbers. Derived by A3 (stats/derive) from PRQ, level, school and gear. */
export interface ActorStats extends CombatStats {
  level: number;
  prqBand: PrqBand;
  /** The fighting school blend (lib/babylon/combat/schools.ts): the actor's "style". */
  school: StyleBlend;
  /** The actor's element: for a player, their partner's (owner: "the partner's element is yours"). */
  element: Element | null;
  /** The 8 PRQ attributes, 0..100, when known (a guest has none). */
  attrs?: Partial<Record<PrqAttr, number>>;
}

// ── Actor ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LockTarget {
  actorId: ActorId;
  /** A boss weak point's id (BossDef part), when the lock is on a part rather than the body. */
  part?: string;
  /** Sim time the lock was taken, seconds. */
  sinceSec: number;
  /** Soft = auto-aim for one strike (no lock pressed); hard = the player pressed lock. */
  hard: boolean;
}

export interface FusionState {
  active: boolean;
  /** 0 = never fused; 1..3 grows with bond (A3). Tier drives the partner-element spell power and flight speed. */
  tier: 0 | 1 | 2 | 3;
  /** 0..1; fills from fighting beside the partner. Fuse at 1. */
  meter: number;
  /** Seconds of fusion left while active. */
  remainingSec: number;
  partnerId: ActorId | null;
  element: Element | null;
  /** Fusion grants flight (owner, 2026-10-06). */
  grantsFlight: boolean;
}

export const NO_FUSION: Readonly<FusionState> = Object.freeze({
  active: false, tier: 0, meter: 0, remainingSec: 0, partnerId: null, element: null, grantsFlight: false,
}) as Readonly<FusionState>;

/**
 * One body in the Adventure: the player, their partner, a BR bot, a monster or a boss.
 *
 * WHO WRITES WHAT (the rule that lets three lanes share one object):
 *   A1 movement: pos, vel, facingYaw, grounded, state, stateSec, rail, ridingId (mount/dismount), wantsFlight.
 *   A2 combat:   stats.hp.cur, stats.poise.cur, stats.stamina.cur (spend and regen), energy SPEND, lock, stunSec,
 *                iframeSec, impulse.
 *   A3 partner:  every pool's max, energy regen, special, level, element, school, attrs, fusion, partnerId.
 * A reader may read anything. A field is written only by its owner; a request to another owner goes through the
 * owner's input field (impulse, stunSec) or an event.
 */
export interface AdventureActor {
  id: ActorId;
  kind: ActorKind;
  team: TeamId;
  pos: Vec3;
  vel: Vec3;
  /** Radians; 0 faces +z. */
  facingYaw: number;
  grounded: boolean;
  state: MovementState;
  /** Seconds in the current state. */
  stateSec: number;
  /** Capsule, metres. */
  radius: number;
  height: number;
  stats: ActorStats;
  lock: LockTarget | null;
  /** > 0 = stunned for that long (A2 sets; A1 turns it into the 'stunned' state). */
  stunSec: number;
  /** > 0 = invulnerable (dodge, phase change). */
  iframeSec: number;
  /** A velocity change A2 asks for (knockback, launch); A1 adds it on its next step and zeroes it. */
  impulse: Vec3 | null;
  /** While grinding: where on which rail. */
  rail: RailCursor | null;
  /** The mount this actor rides, or null. */
  ridingId: ActorId | null;
  /** The player asked to fly (fused, or riding a flyer); A1 decides whether it may. */
  wantsFlight: boolean;
  fusion: FusionState;
  /** This actor's partner (player ↔ partner both point at each other). */
  partnerId: ActorId | null;
}

// ── Rails ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Where a rail lets you hop to another. Lean toward `side` and press jump inside [atM − windowM, atM + windowM]. */
export interface RailSwitch {
  /** Arc length along this segment, metres. */
  atM: number;
  windowM: number;
  side: -1 | 1;
  toSegment: string;
  /** Arc length on the target where you land. */
  toAtM: number;
}

export interface RailSegment {
  id: string;
  /** ≥ 2 points. Read as a polyline, or as a Catmull-Rom spline through them when `smooth`. */
  points: Vec3[];
  smooth?: boolean;
  /** The side a rider stands on (default world up). A loop or a wall rail turns it. */
  up?: Vec3;
  /**
   * m/s² along the rail on top of gravity: + a booster, − drag. Gravity on the slope is A1's; this is the authored
   * extra so a designer can make a flat rail fast without tilting it.
   */
  speedBias: number;
  /** Below this the rider is pushed to it (a rail that should never stall, e.g. a loop). 0 = none. */
  minSpeed?: number;
  switches: RailSwitch[];
  /** Exits at either end chain onto these (a rail network without gaps). */
  next?: string | null;
  prev?: string | null;
  tags?: ReadonlyArray<'booster' | 'trickZone' | 'noExitJump' | 'grindable-cable'>;
}

export interface RailNetwork { id: string; segments: RailSegment[] }

/** A rider's place on a rail. */
export interface RailCursor { segmentId: string; sM: number; dir: 1 | -1; speed: number }

export function polylineLength(points: readonly Vec3[]): number {
  let L = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    L += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return L;
}

/** Authoring errors, as messages (empty = valid). A world piece's rails must validate before it ships. */
export function validateRailNetwork(net: RailNetwork): string[] {
  const errs: string[] = [];
  const byId = new Map<string, RailSegment>();
  for (const s of net.segments) {
    if (byId.has(s.id)) errs.push(`${net.id}: duplicate segment ${s.id}`);
    byId.set(s.id, s);
  }
  for (const s of net.segments) {
    if (s.points.length < 2) { errs.push(`${s.id}: needs at least 2 points`); continue; }
    if (s.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) {
      errs.push(`${s.id}: non-finite point`);
    }
    const L = polylineLength(s.points);
    if (!(L > 0.5)) errs.push(`${s.id}: shorter than 0.5 m`);
    for (const k of [s.next, s.prev]) if (k && !byId.has(k)) errs.push(`${s.id}: links to unknown segment ${k}`);
    for (const w of s.switches) {
      const to = byId.get(w.toSegment);
      if (!to) { errs.push(`${s.id}: switch to unknown segment ${w.toSegment}`); continue; }
      if (w.toSegment === s.id) errs.push(`${s.id}: switch to itself`);
      if (w.atM < 0 || w.atM > L) errs.push(`${s.id}: switch at ${w.atM} m is off the rail (0..${L.toFixed(1)})`);
      const toL = polylineLength(to.points);
      if (w.toAtM < 0 || w.toAtM > toL) errs.push(`${s.id}: switch lands at ${w.toAtM} m, off ${to.id}`);
      if (!(w.windowM > 0)) errs.push(`${s.id}: switch window must be > 0`);
    }
  }
  return errs;
}

// ── Flight and riding ─────────────────────────────────────────────────────────────────────────────────────────────

/** Free = hover, strafe, ascend/descend, dash (the open-world brawler feel). Cruise = high speed, banked turns. */
export const FLIGHT_MODES = ['free', 'cruise'] as const;
export type FlightMode = (typeof FLIGHT_MODES)[number];

/** Flight is fused-only, or on a flying partner's back (owner, 2026-10-06). */
export type FlightSource = 'fusion' | 'mount';

export interface FlightParams {
  freeSpeed: number;          // m/s, free flight top speed
  freeAccel: number;          // m/s²
  ascendSpeed: number;        // m/s
  descendSpeed: number;       // m/s
  dashSpeed: number;          // m/s at the burst's peak
  dashSec: number;
  cruiseEnterSpeed: number;   // m/s; holding dash past this enters cruise
  cruiseSpeed: number;        // m/s, cruise top speed
  cruiseAccel: number;        // m/s²
  cruiseTurnRate: number;     // rad/s at full bank
  cruiseBankMaxRad: number;
  /** Energy per second (fusion) or partner stamina per second (mount), per mode, and per dash. */
  drainPerSec: Record<FlightMode, number>;
  dashCost: number;
  /** Hard ceiling (the BR zone has one too) and the height above ground below which flight lands you. */
  ceilingY: number;
  landClearanceM: number;
}

/** Whether an actor may fly this tick, and from what. Pure so the BR bot brain and A1 agree on one answer. */
export function flightSourceOf(actor: Pick<AdventureActor, 'fusion' | 'ridingId'>, mountCanFly: boolean): FlightSource | null {
  if (actor.fusion.active && actor.fusion.grantsFlight) return 'fusion';
  if (actor.ridingId && mountCanFly) return 'mount';
  return null;
}

// ── Magic ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SpellDef {
  id: string;
  /** Display name: generic, original, never a feel reference's spell. Placeholders say so. */
  name: string;
  kind: SpellKind;
  /** Set for 'element' and 'partner' spells ('partner' resolves to the partner's element at cast time). */
  element: Element | null;
  /** Set for 'mind' spells. */
  mind?: MindPower;
  shape: SpellShape;
  energyCost: number;
  castSec: number;
  cooldownSec: number;
  /** Base damage or effect strength, before level, element and fusion scaling. */
  power: number;
  rangeM: number;
  radiusM?: number;
  /** For a channelled power (slow-time, barrier, telekinesis hold): energy per second while held. */
  channelPerSec?: number;
  /** What unlocks it. A story flag means "learned through the story". */
  requires?: { level?: number; storyFlag?: string; fusionTier?: 1 | 2 | 3 };
  /** True when a Mirror move can charge it (it still charges without the camera). */
  mirrorChargeable?: boolean;
}

/**
 * Element advantage, [TUNE]. A ring of four pairs (each strong against the next) plus light ↔ shadow mutual. Pure and
 * here because A2 (damage) and A3 (partner element) both read it.
 */
const ADVANTAGE: Readonly<Partial<Record<Element, Element>>> = {
  fire: 'ice', ice: 'wind', wind: 'earth', earth: 'lightning', lightning: 'water', water: 'fire',
  light: 'shadow', shadow: 'light',
};
export const ELEMENT_STRONG = 1.25;
export const ELEMENT_WEAK = 0.8;

export function elementMultiplier(attack: Element | null, defend: Element | null): number {
  if (!attack || !defend || attack === defend) return 1;
  if (ADVANTAGE[attack] === defend) return ELEMENT_STRONG;
  if (ADVANTAGE[defend] === attack) return ELEMENT_WEAK;
  return 1;
}

// ── Partner ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CreaturePartner {
  /** An Evolution Garden species id (lib/babylon/core/EvolutionGarden.ts SPECIES, extended by A3). */
  speciesId: string;
  stage: number;
  /** Stage from which the creature can carry the player on the ground / in the air; null = never. */
  rideableAtStage: number | null;
  flyableAtStage: number | null;
}

export interface CharacterPartner {
  /** A Creator slot id (face.creatorSlots, lib/creator/look/slots.ts). Spawned through the identity layer. */
  creatorSlotId: string;
}

export interface PartnerDef {
  id: string;
  kind: PartnerKind;
  /** The player names the partner. Sanitised with the jersey-name sanitiser. */
  name: string;
  element: Element;
  creature?: CreaturePartner;
  character?: CharacterPartner;
  /** The PRQ mirror (EvolutionGarden's idea): the partner trains the same 8 attributes. */
  attrs: Record<PrqAttr, number>;
  /** 0..100. Grows with fusion and shared fights; sets the fusion tier. */
  bond: number;
  /** Move ids the partner can use (A2's move table). */
  moves: string[];
}

/** A creature carries a rider from its rideable stage; a built character never does (it fuses instead). */
export function partnerCanCarry(p: PartnerDef): { ride: boolean; fly: boolean } {
  if (p.kind !== 'creature' || !p.creature) return { ride: false, fly: false };
  const c = p.creature;
  const ride = c.rideableAtStage !== null && c.stage >= c.rideableAtStage;
  const fly = c.flyableAtStage !== null && c.stage >= c.flyableAtStage;
  return { ride: ride || fly, fly };
}

/** Bond → fusion tier, [TUNE]. */
export function fusionTierFor(bond: number): FusionState['tier'] {
  if (bond >= 75) return 3;
  if (bond >= 40) return 2;
  if (bond >= 10) return 1;
  return 0;
}

// ── Combat events ─────────────────────────────────────────────────────────────────────────────────────────────────

export const DAMAGE_OUTCOMES = ['hit', 'blocked', 'parried', 'guardBreak', 'dodged', 'iframe'] as const;
export type DamageOutcome = (typeof DAMAGE_OUTCOMES)[number];

export type DamageSource = 'strike' | 'spell' | 'partner' | 'environment' | 'fall' | 'zone';

export interface DamageEvent {
  tSec: number;
  sourceId: ActorId | null;
  targetId: ActorId;
  /** HP removed after every multiplier (0 when blocked clean, parried, dodged). */
  amount: number;
  source: DamageSource;
  element: Element | null;
  outcome: DamageOutcome;
  staminaDamage: number;
  poiseDamage: number;
  staggerSec: number;
  launch: boolean;
  knockback: Vec3 | null;
  /** The move or spell id. */
  via?: string;
  /** A boss part hit. */
  part?: string;
  finisher?: boolean;
}

/** What a camera should do this tick. Systems suggest; A4's camera blends the highest-priority hint. */
export interface CameraHint {
  preset: 'follow' | 'lock' | 'grind' | 'flight' | 'cruise' | 'ride' | 'boss' | 'cutscene';
  priority: number;
  targetId?: ActorId;
  /** Extra FOV at speed, degrees. */
  fovBoost?: number;
}

/** XP sources, so the save can show where a level came from. */
export type XpSource = 'combat' | 'story' | 'trick' | 'mirror' | 'br' | 'boss';

/** A Mirror move as the Adventure sees it. Labelled estimated engagement, never a measurement (owner rule). */
export interface MirrorMove { kind: 'punch' | 'kick' | 'guard' | 'slip' | 'squat' | 'jump' | 'pose'; quality01: number }

// ── Event bus ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every event the Adventure's systems trade. Add an event by adding a key (optional payload fields only). */
export interface AdventureEvents {
  'damage': DamageEvent;
  'ko': { actorId: ActorId; byId: ActorId | null };
  'state': { actorId: ActorId; from: MovementState; to: MovementState };
  'rail:enter': { actorId: ActorId; segmentId: string; speed: number };
  'rail:switch': { actorId: ActorId; from: string; to: string };
  'rail:trick': { actorId: ActorId; trick: string; points: number };
  'rail:exit': { actorId: ActorId; segmentId: string; reason: 'end' | 'jump' | 'fall' | 'hit' };
  'homing': { actorId: ActorId; targetId: ActorId; hit: boolean };
  'lock': { actorId: ActorId; target: LockTarget | null };
  'spell:cast': { actorId: ActorId; spellId: string; element: Element | null };
  /** Slow-time and hit-stop: the host owns the clock; systems ask. */
  'time:scale': { byId: ActorId; world: number; self: number; sec: number };
  'fusion': { actorId: ActorId; partnerId: ActorId; active: boolean; tier: FusionState['tier'] };
  'mount': { riderId: ActorId; mountId: ActorId; on: boolean };
  'xp': { actorId: ActorId; amount: number; source: XpSource };
  'level': { actorId: ActorId; level: number };
  'mirror:move': MirrorMove & { actorId: ActorId };
  'boss:phase': { bossId: ActorId; phase: number };
  'story:flag': { flag: string; value: boolean | number | string };
  'loot': { actorId: ActorId; lootId: string };
  'zone': { phase: number; radiusM: number; center: Vec3 };
}

export type AdventureEventName = keyof AdventureEvents;
export type AdventureHandler<K extends AdventureEventName> = (payload: AdventureEvents[K]) => void;

export interface AdventureBus {
  on<K extends AdventureEventName>(name: K, fn: AdventureHandler<K>): () => void;
  emit<K extends AdventureEventName>(name: K, payload: AdventureEvents[K]): void;
}

/**
 * A synchronous bus. Handlers run in subscription order, inside emit. A handler that throws does not stop the others
 * (it is reported to `onError`), because one lane's bug must not silence another lane's listener.
 */
export function createAdventureBus(onError: (e: unknown) => void = () => {}): AdventureBus {
  const subs = new Map<AdventureEventName, Set<(p: unknown) => void>>();
  return {
    on(name, fn) {
      let set = subs.get(name);
      if (!set) { set = new Set(); subs.set(name, set); }
      const h = fn as (p: unknown) => void;
      set.add(h);
      return () => { set!.delete(h); };
    },
    emit(name, payload) {
      const set = subs.get(name);
      if (!set) return;
      for (const h of [...set]) {
        try { h(payload); } catch (e) { onError(e); }
      }
    },
  };
}

// ── The world, as the sim sees it ─────────────────────────────────────────────────────────────────────────────────

/** A runnable wall (MatrixFocus.WallSeg's shape): XZ segment, outward normal, height. */
export interface WallSegment { a: { x: number; z: number }; b: { x: number; z: number }; nx: number; nz: number; height: number }

/**
 * The read-only world a system steps against. A4 builds it from world pieces; every lane's tests build a fake.
 * Chunk-addressable from day one (docs/ADVENTURE-PLAN.md, open world): nothing may assume one arena.
 */
export interface AdventureWorld {
  /** Ground height under (x, z), or null over a void. */
  groundY(x: number, z: number): number | null;
  rails: RailNetwork;
  walls: readonly WallSegment[];
  actors: ReadonlyMap<ActorId, AdventureActor>;
  /** Actors within `r` metres of `p` (A4 answers from a spatial grid). */
  near(p: Vec3, r: number): AdventureActor[];
  /** Line of sight for lock-on and homing. */
  clear(a: Vec3, b: Vec3): boolean;
}

/** What a system gets each fixed step. */
export interface AdventureStepContext {
  /** Sim time, seconds (the host's fixed clock, already slowed by time:scale). */
  tSec: number;
  world: AdventureWorld;
  inputs: ReadonlyMap<ActorId, MoveInput>;
  bus: AdventureBus;
  /** The time scale an actor runs at this step (slow-time slows the world, not the caster). */
  timeScaleOf(id: ActorId): number;
  /** Systems push camera hints here for the local player. */
  hint(h: CameraHint): void;
}

/**
 * The unit A4 composes. Step order per fixed tick (60 Hz): input → partner brain (A3) → movement (A1) → combat and
 * magic (A2) → stats (A3) → view sync. A system mutates only the actor fields it owns (see AdventureActor).
 */
export interface AdventureSystem {
  readonly id: string;
  step(ctx: AdventureStepContext, dt: number): void;
  dispose?(): void;
}

export const SIM_HZ = 60;

// ── The save ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Pinned by contracts.test.ts. Bump only with a migration step in save/ and a test for the old shape. */
export const ADVENTURE_SAVE_VERSION = 1 as const;
/** The Creator doc's pattern: a size-capped document. [TUNE] */
export const ADVENTURE_SAVE_MAX_BYTES = 48 * 1024;
export const SPELL_SLOTS = 4;

export interface AdventureSave {
  version: typeof ADVENTURE_SAVE_VERSION;
  /** Epoch ms of the last write (the caller passes the clock in). */
  updatedAt: number;
  player: {
    level: number;
    xp: number;
    school: StyleBlend;
    spells: { known: string[]; equipped: (string | null)[] };
    /** Adventure-side stat training (from play and the Mirror). Never written back to PRQ. */
    training: Partial<Record<PrqAttr, number>>;
  };
  partner: PartnerDef | null;
  story: {
    chapterId: string | null;
    beatId: string | null;
    flags: Record<string, boolean | number | string>;
    worldsVisited: string[];
    clearedBosses: string[];
    checkpoint: { worldId: string; spawnId: string } | null;
  };
  br: { matches: number; wins: number; bestPlace: number | null };
  settings: { mirror: boolean; invertFlightY: boolean };
}

export function emptyAdventureSave(now: number): AdventureSave {
  return {
    version: ADVENTURE_SAVE_VERSION,
    updatedAt: now,
    player: {
      level: 1, xp: 0,
      school: { primary: 'straight', secondary: 'straight', mix: 0 },
      spells: { known: [], equipped: Array.from({ length: SPELL_SLOTS }, () => null) },
      training: {},
    },
    partner: null,
    story: { chapterId: null, beatId: null, flags: {}, worldsVisited: [], clearedBosses: [], checkpoint: null },
    br: { matches: 0, wins: 0, bestPlace: null },
    settings: { mirror: false, invertFlightY: false },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A SHAPE check, not a sanitiser: is this a v1 save at the top level? A3's save/ sanitises fields and caps sizes
 * (the Creator doc's rules); this is the gate both the device store and a server route call first.
 */
export function isAdventureSave(x: unknown): x is AdventureSave {
  if (!isObj(x) || x.version !== ADVENTURE_SAVE_VERSION) return false;
  if (typeof x.updatedAt !== 'number' || !Number.isFinite(x.updatedAt)) return false;
  const p = x.player, s = x.story, b = x.br, st = x.settings;
  if (!isObj(p) || !isObj(s) || !isObj(b) || !isObj(st)) return false;
  if (typeof p.level !== 'number' || typeof p.xp !== 'number' || !isObj(p.spells) || !isObj(p.school)) return false;
  if (!Array.isArray((p.spells as Record<string, unknown>).known)) return false;
  if (!Array.isArray((p.spells as Record<string, unknown>).equipped)) return false;
  if (!isObj(s.flags) || !Array.isArray(s.worldsVisited) || !Array.isArray(s.clearedBosses)) return false;
  if (x.partner !== null && !isObj(x.partner)) return false;
  return true;
}
