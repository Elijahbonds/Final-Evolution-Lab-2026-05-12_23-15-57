/**
 * The Battle Royale match (ADVENTURE PLAN Phase C: "zone, loot tables, bot brain, match flow … solos and duos
 * offline"). The BR's host: what AdventureHost is to the story (one world, one bus, one clock, the lanes' systems at a
 * fixed 60 Hz), built for twelve fighters instead of one party. It REUSES the story's systems unchanged — A1's
 * movement, A2's combat and magic, A3's stats — and adds the BR's own: the bond (fusion, summons, shards, the drop
 * glide), the zone, downs and revives, the loot field and the bots.
 *
 *   input   human seats (A4's mapper, through setInputSource) and the bots' brains (time-sliced) fill MoveInputs;
 *           the drop's glide shapes them (descend, nothing else)
 *   bond (A3's role) → summons' brains → movement (A1) → combat → magic (A2) → stats (A3) → zone → downs
 *   events  loot (pickups, chests, swaps), the match flow (landing, eliminations, placement, the end)
 *
 * MATCH FLOW. DROP: every fighter starts high over a ring round the map, fused (the partner's wings), and glides down
 * where it steers; it lands into PLAY. The zone runs from the first step. A fighter at zero is out (solos) or downed
 * (duos: a teammate revives within the bleed-out, br/downs.ts). When one team is left the match is OVER. Placement is
 * by team, in the order teams went out.
 *
 * FAIRNESS (owner: "the BR uses a normalised level"): every fighter is the BR's normalised fighter (tuning.ts BR_LEVEL,
 * BR_ATTR, BR_BOND), whatever the save holds; XP is not earned inside a match (the match's bus does not carry `xp`), so
 * nobody levels mid-match. Loot is the only power curve, and it ends with the match.
 *
 * PHASE D (designed for, not built): the state is plain data — `snapshot()` is JSON-safe and carries the clock, the
 * zone, the loot field and every fighter and body — and every seat's intent is a MoveInput, so a net peer is a seat
 * whose input comes off the wire and the host runs this class.
 *
 * Pure: no Babylon, no DOM, no wall clock (frame() takes real seconds), no global random (the seed).
 */

import {
  createAdventureBus, neutralInput, NO_FUSION, SIM_HZ, type ActorId, type AdventureActor, type AdventureBus,
  type AdventureStepContext, type AdventureSystem, type CameraHint, type MoveInput, type PartnerDef, type Vec3,
} from '../contracts';
import { PRQ_ATTRS, type PrqAttr } from '@/lib/prq';
import type { StyleBlend } from '@/lib/babylon/combat/schools';
import { SCHOOLS } from '@/lib/babylon/combat/schools';
import { createMovementSystem, mountSpecFromPartner, type MovementSystem } from '../movement';
import { createCombatSystem, type CombatSystem } from '../combat';
import { createMagicSystem, type MagicSystem } from '../magic';
import { actorStatsFrom, createStatsSystem, deriveActorStats, xpForAdventureLevel, type StatsSystem } from '../stats';
import { createCharacterPartner, createCreaturePartner, partnerGear, ADVENTURE_SPECIES_IDS } from '../partner/defs';
import { PartnerBrain, copyMoveInput } from '../partner/brain';
import { HostClock } from '../host/clock';
import { AdventureCamera } from '../host/camera';
import { HostWorld } from '../host/hostWorld';
import { buildRailIndex, type RailIndex } from '../rails/railMath';
import { buildBRMap, brWorldSource, type BRMap } from './map';
import { createZone, createZoneSystem, inStorm, zoneSecondsLeft, type ZoneState, type ZoneSystem } from './zone';
import { createBondSystem, type BondSystem } from './bond';
import { createDownsSystem, type DownsSystem } from './downs';
import { LootField, type LootFieldState } from './lootField';
import { kitAttrs, kitGear, kitItems, newKit, type Kit } from './kit';
import { BotBrain } from './botBrain';
import { forkSeed, seededRng, pickWeighted } from './rng';
import {
  BOT_ELEMENTS, BOT_MIX, BR_ATTR, BR_BOND, BR_FIGHTERS, BR_LEVEL, BR_PARTNER_STAGE, DOWNS, DROP, ZONE_START, type BotTier,
} from './tuning';

export type BRMode = 'solo' | 'duo';
export type BRPhase = 'drop' | 'play' | 'over';
export type FighterStatus = 'dropping' | 'alive' | 'downed' | 'out';

/** One fighter of the match, as plain data (the snapshot carries it). */
export interface BRFighter {
  id: ActorId;
  seat: number;
  team: number;
  human: boolean;
  /** A bot's tier (null for a human seat). */
  tier: BotTier | null;
  /** Duos: this seat is the human's own partner fighting as a full fighter (the KarateEndless partner seat). */
  partnerSeat: boolean;
  name: string;
  /** The match's copy of the bonded partner (normalised; never the save's object). */
  partner: PartnerDef;
  school: StyleBlend;
  kit: Kit;
  shardsUsed: number;
  summonId: ActorId | null;
  summonLeftSec: number;
  summonCooldownSec: number;
  dropFused: boolean;
  status: FighterStatus;
  zeroAt: number | null;
  /** Where the drop is steering (a bot's pick; a human steers themselves). */
  dropTarget: Vec3 | null;
  landedAtSec: number | null;
  outAtSec: number | null;
  /** Final team place (1 = the winners), set when the team goes out or wins. */
  place: number | null;
  kos: number;
  damageDealt: number;
}

export interface BRMatchOptions {
  seed?: number;
  mode?: BRMode;
  /** Fighters in the match (default 12: the plan's phone count). */
  fighters?: number;
  /** Human seats: 1 (the offline match: you + bots) or 0 (every seat a bot: the headless match). */
  humans?: 0 | 1;
  /** Duos: the human's second seat — a bot teammate, or their own partner as a full fighter. */
  duoSeat?: 'bot' | 'partner';
  /** The human's style and partner (from the save; the BR normalises everything else). */
  player?: { name?: string; school?: StyleBlend | null; partner?: PartnerDef | null };
  /** The bots' tiers, seat by seat (default BOT_MIX). */
  tiers?: readonly BotTier[];
  /** Every body passes through this as it enters the world (the ownership test's write tracker). */
  instrument?: (a: AdventureActor) => AdventureActor;
  onError?: (e: unknown) => void;
}

export interface BRResult {
  mode: BRMode;
  place: number;
  teams: number;
  won: boolean;
  kos: number;
  damage: number;
  survivedSec: number;
  matchSec: number;
}

/** A JSON-safe picture of the whole match (Phase D's snapshot; the tests' determinism hash). */
export interface BRSnapshot {
  v: 1;
  seed: number;
  tick: number;
  tSec: number;
  phase: BRPhase;
  zone: ZoneState;
  loot: LootFieldState;
  fighters: BRFighter[];
  bodies: {
    id: ActorId; kind: string; team: number; pos: Vec3; vel: Vec3; facingYaw: number; state: string; hp: number;
    stamina: number; energy: number; fusion: { active: boolean; meter: number; remainingSec: number }; ridingId: ActorId | null;
  }[];
}

/** The level anchor every fighter's level follows (stats: `levelFrom`); never a body. */
const LEVEL_ANCHOR = 'br:level';
/** The human seat's actor id (the story's id, so A4's mapper and the camera read the same). */
export const BR_PLAYER_ID = 'player';

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

export class BRMatch {
  readonly seed: number;
  readonly mode: BRMode;
  readonly bus: AdventureBus;
  readonly map: BRMap;
  readonly world: HostWorld;
  readonly clock = new HostClock();
  readonly camera = new AdventureCamera();
  readonly inputs = new Map<ActorId, MoveInput>();
  readonly movement: MovementSystem;
  readonly combat: CombatSystem;
  readonly magic: MagicSystem;
  readonly stats: StatsSystem;
  readonly bond: BondSystem;
  readonly zoneSystem: ZoneSystem;
  readonly downs: DownsSystem;
  readonly loot: LootField;
  readonly rails: RailIndex;
  readonly fighters: BRFighter[] = [];
  readonly bots = new Map<ActorId, BotBrain>();
  readonly systems: readonly AdventureSystem[];
  readonly errors: unknown[] = [];
  /** The human seat's id, or null in an all-bot match. */
  readonly playerId: ActorId | null;
  phase: BRPhase = 'drop';
  tick = 0;
  overAtSec: number | null = null;
  /** The team that won (null until the match is over). */
  winnerTeam: number | null = null;
  /** The most summoned partners out at once, ever (the body cap test). */
  peakSummons = 0;
  /** The most bodies in the world at once, ever. */
  peakBodies = 0;

  private readonly ctx: AdventureStepContext;
  private readonly byId = new Map<ActorId, BRFighter>();
  private readonly summonBrains = new Map<ActorId, { brain: PartnerBrain; owner: BRFighter; input: MoveInput; bornTick: number }>();
  private readonly noiseAt = new Map<ActorId, number>();
  private readonly removeAt = new Map<ActorId, number>();
  private readonly sources: { id: ActorId; fill: (out: MoveInput) => void; inp: MoveInput }[] = [];
  private readonly owned: MoveInput[] = [];
  private readonly instrument: (a: AdventureActor) => AdventureActor;
  private readonly botView;
  private disposed = false;

  constructor(o: BRMatchOptions = {}) {
    this.seed = (o.seed ?? 0x5eed) >>> 0;
    this.mode = o.mode ?? 'solo';
    this.instrument = o.instrument ?? ((a) => a);
    const onError = o.onError ?? ((e: unknown) => { console.error('[adventure-br] a system threw in a bus handler', e); });
    const raw = createAdventureBus((e) => { this.errors.push(e); onError(e); });
    // FAIRNESS: no XP inside a match (the normalised level never moves); every other event passes
    this.bus = { on: raw.on, emit: (name, payload) => { if (name !== 'xp') raw.emit(name, payload); } };
    this.map = buildBRMap();
    const src = brWorldSource(this.map);
    this.world = new HostWorld(src);
    this.rails = buildRailIndex(this.map.rails);
    const n = Math.max(2, Math.min(16, o.fighters ?? BR_FIGHTERS));
    const humans = o.humans ?? 1;
    this.playerId = humans ? BR_PLAYER_ID : null;
    const rng = seededRng(forkSeed(this.seed, 'fighters'));

    // ── the systems ──
    this.stats = createStatsSystem({ actors: [{ id: LEVEL_ANCHOR, progress: { xp: xpForAdventureLevel(BR_LEVEL) } }] });
    const fighterList = () => this.fighters;
    this.bond = createBondSystem({
      fighters: fighterList,
      spawnSummon: (f) => this.spawnSummon(f as BRFighter),
      despawnSummon: (f) => this.despawnSummon(f as BRFighter),
      flightModeOf: (id) => this.movement.inspect(id)?.flight.mode ?? null,
      get flight() { return DEFAULT_FLIGHT_DRAIN; },
    });
    this.movement = createMovementSystem({
      mountCanFly: (id) => this.bond.mountCanFly(id),
      mountSpecOf: (id) => { const def = this.bond.summonDefOf(id); return def ? mountSpecFromPartner(def) : null; },
      localId: this.playerId,
      seed: forkSeed(this.seed, 'movement'),
      flight: { ceilingY: ZONE_START.ceilingY },
      bounds: this.map.bounds,
    });
    this.combat = createCombatSystem({ localPlayerId: this.playerId ?? undefined, seed: forkSeed(this.seed, 'combat') });
    this.magic = createMagicSystem({ loadoutOf: (a) => this.byId.get(a.id)?.kit.spells ?? null });
    const zone = createZone(this.seed, this.map.bounds);
    this.zoneSystem = createZoneSystem({
      zone,
      hurts: (a) => a.kind === 'player' || a.kind === 'bot' || (a.kind === 'partner' && !a.fusion.active),
      damageMult: (id) => (this.byId.get(id)?.kit.abilities.includes('stormSkin') ? 0.6 : 1),
      setCeiling: (y) => { this.movement.flight.ceilingY = y; },
    });
    this.downs = createDownsSystem({ fighters: fighterList, eliminate: (f, by) => this.eliminate(f as BRFighter, by), duos: this.mode === 'duo' });
    this.loot = new LootField(this.seed, this.map.loot, this.map.chests);
    const summons: AdventureSystem = { id: 'br.summons', step: (c, dt) => this.stepSummons(c, dt) };
    this.systems = [this.bond, summons, this.movement, this.combat, this.magic, this.stats, this.zoneSystem, this.downs];

    // ── the fighters ──
    const tiers = o.tiers ?? BOT_MIX;
    let botIx = 0;
    for (let seat = 0; seat < n; seat++) {
      const human = seat === 0 && humans === 1;
      const team = this.mode === 'duo' ? Math.floor(seat / 2) + 1 : seat + 1;
      const partnerSeat = this.mode === 'duo' && seat === 1 && humans === 1 && o.duoSeat === 'partner';
      const tier: BotTier | null = human ? null : tiers[botIx++ % tiers.length] ?? 'normal';
      const id = human ? BR_PLAYER_ID : partnerSeat ? 'partner.fighter' : `bot.${seat}`;
      const partner = human || partnerSeat ? normalisedPartner(o.player?.partner ?? null, `${id}:partner`, rng) : randomPartner(`${id}:partner`, rng);
      const school: StyleBlend = human && o.player?.school ? { ...o.player.school } : randomSchool(rng);
      const f: BRFighter = {
        id, seat, team, human, tier, partnerSeat,
        name: human ? (o.player?.name ?? 'YOU') : partnerSeat ? partner.name : `[PLACEHOLDER] Rival ${seat}`,
        partner, school, kit: newKit(), shardsUsed: 0, summonId: null, summonLeftSec: 0, summonCooldownSec: 0,
        dropFused: false, status: 'dropping', zeroAt: null, dropTarget: null, landedAtSec: null, outAtSec: null, place: null,
        kos: 0, damageDealt: 0,
      };
      this.fighters.push(f);
      this.byId.set(id, f);
    }
    this.spawnFighters(rng);

    // ── noise (what bots hear), damage dealt ──
    this.bus.on('damage', (e) => {
      if (e.source === 'zone') return;
      const t = this.clock.tSec;
      if (e.sourceId) this.noiseAt.set(e.sourceId, t);
      this.noiseAt.set(e.targetId, t);
      const dealer = e.sourceId ? this.fighterOf(e.sourceId) : null;
      if (dealer && e.outcome === 'hit') dealer.damageDealt += e.amount;
    });
    this.bus.on('spell:cast', (e) => { this.noiseAt.set(e.actorId, this.clock.tSec); });
    this.bus.on('time:scale', (e) => this.clock.request(e));

    // ── the bots' window on the match ──
    const clock = this.clock, loot = this.loot;   // both readonly and set above: the getters read them live
    this.botView = {
      world: this.world,
      get tSec() { return clock.tSec; },
      zone,
      rails: this.rails,
      bodies: () => this.world.actors.values(),
      noisy: (id: ActorId) => { const at = this.noiseAt.get(id); return at !== undefined && this.clock.tSec - at <= 1; },
      get items() { return loot.items; },
      get chests() { return loot.chests; },
      kitOf: (id: ActorId) => this.byId.get(id)?.kit ?? null,
      spell: (id: string) => this.magic.spells.get(id),
      spellCooldown: (aid: ActorId, sid: string) => this.magic.cooldownOf(aid, sid),
      summonReady: (id: ActorId) => { const f = this.byId.get(id); return !!f && !f.summonId && f.summonCooldownSec <= 0 && this.bond.summoned() < 4; },
      teammates: (id: ActorId) => {
        const f = this.byId.get(id);
        if (!f || this.mode !== 'duo') return [];
        const out: { actor: AdventureActor; downed: boolean }[] = [];
        for (const m of this.fighters) {
          if (m === f || m.team !== f.team || m.status === 'out') continue;
          const a = this.world.actors.get(m.id);
          if (a) out.push({ actor: a, downed: m.status === 'downed' });
        }
        return out;
      },
      dropTarget: (id: ActorId) => this.byId.get(id)?.dropTarget ?? null,
      dropping: (id: ActorId) => this.byId.get(id)?.status === 'dropping',
      flightMode: (id: ActorId) => (this.world.actors.get(id)?.state === 'flight' ? this.movement.inspect(id)?.flight.mode ?? null : null),
    };

    const camera = this.camera;
    this.ctx = {
      tSec: 0, world: this.world, inputs: this.inputs, bus: this.bus,
      timeScaleOf: (id) => this.clock.scaleOf(id),
      hint: (h: CameraHint) => camera.offer(h),
    };
  }

  // ── setup ──

  private spawnFighters(rng: () => number): void {
    const n = this.fighters.length;
    const R = 100;
    const turn = rng() * Math.PI * 2;
    for (const f of this.fighters) {
      // duos drop side by side; solos spread round the ring
      const slot = this.mode === 'duo' ? Math.floor(f.seat / 2) * 2 : f.seat;
      const ang = turn + (slot / n) * Math.PI * 2 + (this.mode === 'duo' && f.seat % 2 ? 0.05 : 0);
      const x = Math.sin(ang) * R, z = Math.cos(ang) * R;
      const g = this.world.groundY(x, z) ?? 0;
      const base = deriveActorStats({ level: BR_LEVEL, band: 'READY', attrs: kitAttrs(f.kit, BASE_ATTRS), school: f.school, element: f.partner.element });
      const kind = f.human ? 'player' : 'bot';
      const a: AdventureActor = {
        id: f.id, kind, team: f.team, pos: { x, y: g + DROP.heightM, z }, vel: { x: 0, y: 0, z: 0 },
        facingYaw: Math.atan2(-x, -z), grounded: false, state: 'air', stateSec: 0, radius: 0.4, height: 1.8,
        stats: actorStatsFrom(base), lock: null, stunSec: 0, iframeSec: 0, impulse: null, rail: null, ridingId: null,
        wantsFlight: true, fusion: { ...NO_FUSION }, partnerId: null,
      };
      const added = this.world.add(this.instrument(a));
      this.stats.register({
        id: f.id, band: 'READY', attrs: kitAttrs(f.kit, BASE_ATTRS), school: f.school, gear: kitGear(f.kit),
        element: f.partner.element, levelFrom: LEVEL_ANCHOR,
      });
      this.bond.beginDrop(f, added);
      if (f.human) {
        const inp = neutralInput();
        this.inputs.set(f.id, inp);
        this.owned.push(inp);
      } else {
        const brain = new BotBrain(f.id, f.tier ?? 'normal', this.seed, f.seat);
        this.bots.set(f.id, brain);
        this.inputs.set(f.id, brain.out);
        f.dropTarget = this.pickDropTarget(rng, x, z, f.tier ?? 'normal');
      }
    }
  }

  /** A bot's landing pick: loot-rich places within the glide's reach of where it starts (hard bots favour landmarks). */
  private pickDropTarget(rng: () => number, x: number, z: number, tier: BotTier): Vec3 {
    const spots: Vec3[] = [], w: number[] = [];
    const reach = 85;
    for (const c of this.map.chests) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < reach) { spots.push(c); w.push(tier === 'hard' ? 4 : 2); }
    }
    for (const l of this.map.loot) {
      const d = Math.hypot(l.pos.x - x, l.pos.z - z);
      if (d < reach) { spots.push(l.pos); w.push(l.table === 'landmark' ? (tier === 'easy' ? 1 : 2.5) : 1); }
    }
    const i = pickWeighted(rng, w);
    if (i < 0) return { x: x * 0.5, y: 0, z: z * 0.5 };
    const p = spots[i];
    return { x: p.x + (rng() - 0.5) * 6, y: p.y, z: p.z + (rng() - 0.5) * 6 };
  }

  // ── the summons (A3's PartnerBrain on 'engage') ──

  private spawnSummon(f: BRFighter): AdventureActor | null {
    const owner = this.world.actors.get(f.id);
    if (!owner) return null;
    const id = `${f.id}:summon`;
    if (this.world.actors.has(id)) return null;
    const side = 1.4;
    const x = owner.pos.x + Math.cos(owner.facingYaw) * side, z = owner.pos.z - Math.sin(owner.facingYaw) * side;
    const g = this.world.groundY(x, z) ?? owner.pos.y;
    const d = deriveActorStats({ level: BR_LEVEL, band: null, attrs: BASE_ATTRS, element: f.partner.element, gear: partnerGear(f.partner) });
    const a: AdventureActor = {
      id, kind: 'partner', team: f.team, pos: { x, y: g, z }, vel: { x: 0, y: 0, z: 0 }, facingYaw: owner.facingYaw,
      grounded: true, state: 'ground', stateSec: 0, radius: 0.5, height: f.partner.kind === 'creature' ? 1.4 : 1.8,
      stats: actorStatsFrom(d), lock: null, stunSec: 0, iframeSec: 0, impulse: null, rail: null, ridingId: null,
      wantsFlight: false, fusion: { ...NO_FUSION }, partnerId: f.id,
    };
    const added = this.world.add(this.instrument(a));
    this.stats.register({ id, band: null, attrs: BASE_ATTRS, element: f.partner.element, gear: partnerGear(f.partner), levelFrom: LEVEL_ANCHOR });
    const brain = new PartnerBrain(forkSeed(this.seed, `summon:${f.id}:${this.tick}`));
    const input = neutralInput();
    this.inputs.set(id, input);
    this.summonBrains.set(id, { brain, owner: f, input, bornTick: this.tick });
    this.peakSummons = Math.max(this.peakSummons, this.summonBrains.size);
    return added;
  }

  private despawnSummon(f: BRFighter): void {
    const id = f.summonId;
    if (!id) return;
    this.summonBrains.delete(id);
    this.removeBody(id);
  }

  private stepSummons(ctx: AdventureStepContext, dt: number): void {
    for (const [id, s] of this.summonBrains) {
      const self = ctx.world.actors.get(id), owner = ctx.world.actors.get(s.owner.id);
      // its first step it only arrives (A3's stats fill a new body's pools on their first step: nothing spends before)
      if (!self || !owner || s.bornTick === this.tick) continue;
      const out = s.brain.think({ self, player: owner, world: ctx.world, command: 'engage', playerDowned: s.owner.status === 'downed' }, dt);
      copyMoveInput(out, s.input);
    }
  }

  // ── bodies ──

  private removeBody(id: ActorId): void {
    this.movement.reset(id);
    this.combat.unregister(id);
    this.stats.unregister(id);
    this.inputs.delete(id);
    this.world.remove(id);
  }

  /** The fighter a body acts for (a summon acts for its owner). */
  fighterOf(id: ActorId): BRFighter | null {
    const f = this.byId.get(id);
    if (f) return f;
    return this.summonBrains.get(id)?.owner ?? null;
  }

  fighter(id: ActorId): BRFighter | null { return this.byId.get(id) ?? null; }
  get player(): AdventureActor | null { return this.playerId ? this.world.actors.get(this.playerId) ?? null : null; }
  get zone(): ZoneState { return this.zoneSystem.zone; }
  get tSec(): number { return this.clock.tSec; }

  private teamsAlive(): number {
    const teams = new Set<number>();
    for (const f of this.fighters) if (f.status !== 'out') teams.add(f.team);
    return teams.size;
  }

  get teams(): number { return new Set(this.fighters.map((f) => f.team)).size; }
  get alive(): number { return this.fighters.filter((f) => f.status !== 'out').length; }

  /** A fighter is out (downs): place the team when its last member goes, spill the kit, clear the body away. */
  private eliminate(f: BRFighter, byId: ActorId | null): void {
    if (f.status === 'out') return;
    f.status = 'out';
    f.outAtSec = this.clock.tSec;
    const a = this.world.actors.get(f.id);
    if (a) this.loot.spill(kitItems(f.kit), a.pos, (x, z) => this.world.groundY(x, z));
    const killer = byId ? this.fighterOf(byId) : null;
    if (killer && killer.team !== f.team) killer.kos++;
    if (!this.fighters.some((m) => m.team === f.team && m.status !== 'out')) {
      const place = this.teamsAlive() + 1;
      for (const m of this.fighters) if (m.team === f.team) m.place = place;
    }
    this.removeAt.set(f.id, this.clock.tSec + DOWNS.corpseSec);
  }

  // ── input ──

  /** Who fills `id`'s MoveInput each step (a human seat's mapper; later, a net peer's wire). */
  setInputSource(id: ActorId, fill: ((out: MoveInput) => void) | null): void {
    const i = this.sources.findIndex((x) => x.id === id);
    if (i >= 0) this.sources.splice(i, 1);
    if (!fill) return;
    let inp = this.inputs.get(id);
    if (!inp) { inp = neutralInput(); this.inputs.set(id, inp); }
    if (!this.owned.includes(inp)) this.owned.push(inp);
    this.sources.push({ id, fill, inp });
  }

  // ── stepping ──

  frame(realDt: number): number {
    if (this.disposed) return 0;
    const n = this.clock.stepsFor(realDt);
    for (let i = 0; i < n; i++) this.step();
    return n;
  }

  /** One fixed step. */
  step(): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    const t = this.clock.tSec;
    ctx.tSec = t;
    const dt = this.clock.stepSec;
    // input: human seats, then the bots (time-sliced inside BotBrain)
    for (let i = 0; i < this.sources.length; i++) { const s = this.sources[i]; s.fill(s.inp); }
    this.world.reindex();
    for (const [id, brain] of this.bots) {
      const a = this.world.actors.get(id);
      const f = this.byId.get(id);
      if (!a || !f || f.status === 'out') continue;
      brain.step(this.botView, a, this.tick, dt);
    }
    // the drop's glide: down, steering, nothing else
    for (const f of this.fighters) {
      if (f.status !== 'dropping') continue;
      const inp = this.inputs.get(f.id);
      if (!inp) continue;
      inp.descendHeld = true; inp.ascendHeld = false; inp.jump = false; inp.jumpHeld = false; inp.dash = false; inp.dashHeld = false;
      inp.attackLight = false; inp.attackHeavy = false; inp.lock = false; inp.magic = false; inp.magicSlot = null;
      inp.partner = false; inp.fuse = false; inp.guardHeld = false; inp.focusHeld = false;
    }
    const sys = this.systems;
    for (let i = 0; i < sys.length; i++) {
      const s = sys[i];
      if (s === this.combat) this.world.reindex();
      s.step(ctx, dt);
    }
    this.events(t, dt);
    this.camera.endStep(t);
    // a press lands on exactly one step
    for (let i = 0; i < this.owned.length; i++) {
      const inp = this.owned[i];
      inp.jump = false; inp.dash = false; inp.attackLight = false; inp.attackHeavy = false; inp.lock = false;
      inp.magic = false; inp.partner = false; inp.fuse = false; inp.magicSlot = null;
    }
    this.peakBodies = Math.max(this.peakBodies, this.world.actors.size);
    this.tick++;
    this.clock.advance();
  }

  /** The events stage: landing, loot, the bodies leaving, the end. */
  private events(t: number, dt: number): void {
    this.loot.decay(dt);
    for (const f of this.fighters) {
      const a = this.world.actors.get(f.id);
      if (!a) continue;
      if (f.status === 'dropping') {
        if (a.state === 'ground' || a.state === 'grind' || (t > 30 && a.state !== 'flight')) { f.status = 'alive'; f.landedAtSec = t; }
        continue;
      }
      if (f.status !== 'alive' || !(a.stats.hp.cur > 0)) continue;
      const slot = f.human ? this.magic.selectedSlot(f.id) : null;
      this.loot.visit(f.id, a.pos, f.kit, t, dt, slot, this.bus, (x, z) => this.world.groundY(x, z), (r) => {
        if (r.restat) this.stats.refresh(f.id, { attrs: kitAttrs(f.kit, BASE_ATTRS), gear: kitGear(f.kit) });
      });
    }
    if (this.phase === 'drop' && this.fighters.every((f) => f.status !== 'dropping')) this.phase = 'play';
    for (const [id, at] of this.removeAt) {
      if (t < at) continue;
      this.removeAt.delete(id);
      this.bots.delete(id);
      this.removeBody(id);
    }
    if (this.phase !== 'over' && this.teamsAlive() <= 1) {
      this.phase = 'over';
      this.overAtSec = t;
      const last = this.fighters.find((f) => f.status !== 'out');
      this.winnerTeam = last ? last.team : null;
      for (const f of this.fighters) if (f.team === this.winnerTeam) f.place = 1;
    }
  }

  // ── reading the match ──

  /** The human's result (or seat 0's in an all-bot match), once their run is over. */
  result(id: ActorId | null = this.playerId ?? this.fighters[0]?.id ?? null): BRResult | null {
    const f = id ? this.byId.get(id) : null;
    if (!f || f.place === null) return null;
    const end = f.outAtSec ?? this.overAtSec ?? this.clock.tSec;
    return {
      mode: this.mode, place: f.place, teams: this.teams, won: f.place === 1, kos: f.kos, damage: Math.round(f.damageDealt),
      survivedSec: Math.round(end), matchSec: Math.round(this.overAtSec ?? this.clock.tSec),
    };
  }

  /** What the HUD shows (minimal: the owner's "nothing on screen but the HUD"). */
  hud(id: ActorId | null = this.playerId): Record<string, string | number | boolean | null> {
    const z = this.zone;
    const f = id ? this.byId.get(id) : null;
    const a = id ? this.world.actors.get(id) : null;
    const down = id ? this.downs.downOf(id) : null;
    return {
      alive: this.alive,
      zone: Math.ceil(zoneSecondsLeft(z)),
      zoneStage: z.stage,
      zonePhase: z.phase,
      storm: !!a && inStorm(z, a.pos),
      phase: this.phase,
      kos: f?.kos ?? 0,
      hp: a ? Math.round(a.stats.hp.cur) : 0,
      hpMax: a ? Math.round(a.stats.hp.max) : 0,
      energy: a ? Math.round(a.stats.energy.cur) : 0,
      energyMax: a ? Math.round(a.stats.energy.max) : 0,
      fusion: a ? Math.round(a.fusion.meter * 100) : 0,
      fused: a?.fusion.active ? Math.ceil(a.fusion.remainingSec) : 0,
      summon: f ? (f.summonId ? `ON ${Math.ceil(f.summonLeftSec)}` : f.summonCooldownSec > 0 ? `${Math.ceil(f.summonCooldownSec)}s` : 'READY') : null,
      downed: !!down,
      bleed: down ? Math.ceil(down.bleedLeftSec) : 0,
      place: f?.place ?? null,
    };
  }

  snapshot(): BRSnapshot {
    const bodies: BRSnapshot['bodies'] = [];
    for (const a of this.world.actors.values()) {
      bodies.push({
        id: a.id, kind: a.kind, team: a.team,
        pos: { x: round3(a.pos.x), y: round3(a.pos.y), z: round3(a.pos.z) },
        vel: { x: round3(a.vel.x), y: round3(a.vel.y), z: round3(a.vel.z) },
        facingYaw: round3(a.facingYaw), state: a.state, hp: round3(a.stats.hp.cur), stamina: round3(a.stats.stamina.cur),
        energy: round3(a.stats.energy.cur),
        fusion: { active: a.fusion.active, meter: round3(a.fusion.meter), remainingSec: round3(a.fusion.remainingSec) },
        ridingId: a.ridingId,
      });
    }
    return JSON.parse(JSON.stringify({
      v: 1, seed: this.seed, tick: this.tick, tSec: round3(this.clock.tSec), phase: this.phase, zone: this.zone,
      loot: this.loot.state, fighters: this.fighters, bodies,
    })) as BRSnapshot;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.systems) s.dispose?.();
    this.sources.length = 0;
  }
}

// ── the normalised fighter ────────────────────────────────────────────────────────────────────────────────────────

/** Every attribute at BR_ATTR: the fair base the weapon's bonus sits on. */
export const BASE_ATTRS: Readonly<Record<PrqAttr, number>> = Object.freeze(
  Object.fromEntries(PRQ_ATTRS.map((k) => [k, BR_ATTR])) as Record<PrqAttr, number>,
);

/** The flight drain the bond's cruise refund reads (A1's DEFAULT_FLIGHT, by value). */
const DEFAULT_FLIGHT_DRAIN = { drainPerSec: { free: 4, cruise: 8 } };

/** The human's partner for the match: their own (copied), normalised to the BR's bond and stage. */
export function normalisedPartner(def: PartnerDef | null, id: string, rng: () => number): PartnerDef {
  const base = def ? (JSON.parse(JSON.stringify(def)) as PartnerDef) : createCreaturePartner({ id, speciesId: ADVENTURE_SPECIES_IDS[Math.floor(rng() * ADVENTURE_SPECIES_IDS.length)] })!;
  base.id = id;
  base.bond = BR_BOND;
  for (const k of PRQ_ATTRS) base.attrs[k] = BR_ATTR;
  // a creature starts at its riding stage (a ground mount); shards take it on toward flight
  if (base.kind === 'creature' && base.creature) base.creature.stage = base.creature.rideableAtStage ?? BR_PARTNER_STAGE;
  return base;
}

/** A bot's bonded partner: a creature most of the time, sometimes a built character, with an element. */
function randomPartner(id: string, rng: () => number): PartnerDef {
  if (rng() < 0.7) return normalisedPartner(null, id, rng);
  const element = BOT_ELEMENTS[Math.floor(rng() * BOT_ELEMENTS.length)];
  return normalisedPartner(createCharacterPartner({ id, creatorSlotId: 'bot', element, name: 'RIVAL' }), id, rng);
}

function randomSchool(rng: () => number): StyleBlend {
  const ready = SCHOOLS.filter((s) => s.ready);
  const a = ready[Math.floor(rng() * ready.length)], b = ready[Math.floor(rng() * ready.length)];
  return { primary: a.id, secondary: b.id, mix: Math.round(rng() * 10) / 10 };
}

export { SIM_HZ };
