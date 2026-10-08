/**
 * The BR bot (ADVENTURE PLAN Phase C: "bots loot, rotate with the zone, use rails and flight when they have it, fight
 * with lock-on / strings / spells / dodge, and have difficulty tiers"; the reuse table: "RivalCombatBrain + MobSteering
 * (bots)"). A bot is a FIGHTER like the player: it only writes a MoveInput, which the same movement, combat and magic
 * systems read, so a bot can do nothing a human seat cannot (and Phase D's net peers slot in beside them).
 *
 * TWO CLOCKS (the plan's "bot brains time-sliced"):
 *   think  at the tier's rate, staggered across bots by seat (so twelve bots never think on one tick): perceive
 *          (br/perception: sight inside a field of view with a clear line, hearing, memory — never the live world),
 *          then pick a goal: revive a downed teammate, leave the storm, fight what it knows of, take loot it can see
 *          that improves its kit, open a chest, or move toward the next circle.
 *   act    every tick, cheap: steer to the goal (around blocks; a hop over low ones), ride a rail heading the right way,
 *          fly when fused, and in a fight run RivalCombatBrain's decision as presses.
 *
 * THE FIGHT is RivalCombatBrain's, unchanged: spacing, the attack mix (jab / kick / heavy → light / light / heavy, so
 * light-light-heavy strings come out of it), the guard read (guard held; a parry when its timing lands), the dash and
 * the substitution (guard + dash) — DETERMINISTIC through br/rng.withSeededRandom (its inner RivalFightBrain draws
 * from the global random; the core file stays import-only). On top: lock-on (the lock press while facing the target),
 * spells from its slots when the target is in a spell's range, the summon, and fusion when the meter is full.
 *
 * STEERING is MobSteering's pursuit, on plain numbers (Mob itself drives a SpawnedCharacter): lead the target by its
 * velocity, capped at 0.6 s, and the preset's reaction delay before a chase (`STEERING_PRESETS`: "aware, not psychic").
 *
 * Pure: no Babylon, no clock, no global random of its own. Allocation: the bot's records are made once; a think may
 * walk arrays, an act allocates nothing.
 */

import {
  neutralInput, type ActorId, type AdventureActor, type AdventureWorld, type MoveInput, type SpellDef, type Vec3,
} from '../contracts';
import { RivalCombatBrain, type RivalMoveSpec } from '@/lib/babylon/core/RivalCombatBrain';
import { FighterState } from '@/lib/babylon/core/FightCore';
import { STEERING_PRESETS } from '@/lib/babylon/core/MobSteering';
import { fightStateOf } from '../combat/fightState';
import { STAMINA, SUBSTITUTION } from '../combat/tuning';
import { nearestOnPath, railNearest, sampleRail, type RailIndex } from '../rails/railMath';
import { canSeePoint, perceive, type Memory } from './perception';
import { inStorm, nextCircle, type ZoneState } from './zone';
import { lootById, FISTS } from './loot';
import { upgradeScore, type Kit } from './kit';
import type { Chest, FloorItem } from './lootField';
import { forkSeed, seededRng, withSeededRandom } from './rng';
import { BOT_TIERS, type BotTier, type BotTierDef } from './tuning';
import { ARSENAL_REACH } from './weapons';

export type BotGoal = 'drop' | 'revive' | 'storm' | 'fight' | 'flee' | 'loot' | 'chest' | 'rotate' | 'roam';

/** What the match shows a bot. Everything a bot reads goes through here (and its perception), never the whole world. */
export interface BotView {
  world: AdventureWorld;
  tSec: number;
  zone: ZoneState;
  rails: RailIndex;
  /** Every body a bot could perceive (fighters and summons, alive). Perception filters it. */
  bodies(): Iterable<AdventureActor>;
  noisy(id: ActorId): boolean;
  items: readonly FloorItem[];
  chests: readonly Chest[];
  kitOf(id: ActorId): Kit | null;
  spell(id: string): SpellDef | undefined;
  spellCooldown(actorId: ActorId, spellId: string): number;
  summonReady(id: ActorId): boolean;
  /** The bot's teammates (duos), downed or not. A teammate is always known (they talk). */
  teammates(id: ActorId): readonly { actor: AdventureActor; downed: boolean }[];
  dropTarget(id: ActorId): Vec3 | null;
  dropping(id: ActorId): boolean;
  /** A1's flight mode for a flyer (cruise steers by banking, free flight by the stick). */
  flightMode(id: ActorId): 'free' | 'cruise' | null;
}

/** MobSteering's pursuit lead, capped (Mob.update: `ahead = min(dist / maxSpeed, 0.6)`). */
export const LEAD_CAP_SEC = 0.6;

/** [TUNE] how far a bot looks for loot, and how far it will detour for it. */
const LOOT_SIGHT_M = 32;
/** [TUNE] engage a known enemy within this; past it, a rotation or loot wins. */
const ENGAGE_M = 30;
/** [TUNE] while gearing up (early, or a thin kit), only an enemy this close pulls a bot off its loot. */
const CLOSE_M = 12;
/** [TUNE] the opening: the first seconds a bot loots before it hunts. */
const EARLY_SEC = 50;
/** [TUNE] the fight runs on RivalCombatBrain inside this range; outside it the bot closes in. */
const BRAWL_M = 7;
/** [TUNE] press lock inside this range. */
const LOCK_M = 16;
/** [TUNE] a rotation longer than this is worth a rail or a flight. */
const LONG_TRIP_M = 55;
/** [TUNE] a rail entry this close is worth a detour. */
const RAIL_REACH_M = 26;
/** [TUNE] a sprint, once started, is held at least this long (a shorter hold would read as a dodge tap). */
const SPRINT_MIN_SEC = 0.6;
/** [TUNE] a fight target not perceived for longer than this is hunted at its last known place, not followed live. */
const STALE_SEC = 0.4;

/** World direction (wx, wz) → the stick in INTENT space for a camera at `camYaw` (the inverse of contracts.wishDir). */
export function stickFor(wx: number, wz: number, camYaw: number, out: { x: number; y: number }): void {
  const c = Math.cos(camYaw), s = Math.sin(camYaw);
  out.x = wx * c - wz * s;
  out.y = wx * s + wz * c;
  const m = Math.hypot(out.x, out.y);
  if (m > 1) { out.x /= m; out.y /= m; }
}

const yawTo = (ax: number, az: number, bx: number, bz: number): number => Math.atan2(bx - ax, bz - az);

/** The bot's moves for RivalCombatBrain: A2's strike book, read through the weapon's reach. */
function rivalMoves(reach: number, jab: number): RivalMoveSpec[] {
  return [
    { id: 'light', kind: 'jab', range: jab },
    { id: 'light2', kind: 'kick', range: (jab + reach) / 2 },
    { id: 'heavy', kind: 'heavy', range: reach },
  ];
}

interface RailPlan { segId: string; entry: Vec3; tx: number; tz: number; startedSec: number }

export class BotBrain {
  readonly out: MoveInput = neutralInput();
  readonly memory = new Map<ActorId, Memory>();
  readonly tier: BotTierDef;
  goal: BotGoal = 'drop';
  readonly goalPos: Vec3 = { x: 0, y: 0, z: 0 };
  targetId: ActorId | null = null;
  lootUid: number | null = null;
  /** Bodies this bot has EVER perceived (tests: proof it knew only what it sensed). */
  readonly everPerceived = new Set<ActorId>();
  /** Counters for tests and the perf row. */
  thinks = 0;
  railEntries = 0;
  takeoffs = 0;

  private readonly rng: () => number;
  private rival: RivalCombatBrain;
  private readonly fstate = new FighterState(100);
  private readonly thinkEvery: number;
  private readonly thinkPhase: number;
  private weaponId = FISTS.id;
  private engageAtSec = 0;
  private newTargetFrom: ActorId | null = null;
  private detourSec = 0;
  private detourSide = 1;
  private stuckClock = 0;
  private stuckX = 0;
  private stuckZ = 0;
  private jumpCd = 0;
  private railPlan: RailPlan | null = null;
  private railCdSec = 0;
  private castSlot: number | null = null;
  private wantFuse = false;
  private wantSummon = false;
  private wantFly = false;
  private flyPressCd = 0;
  private trickCd = 0;
  private lockCd = 0;
  private sprinting = false;
  private cruising = false;
  private sprintSec = 0;
  private wantSprint = false;
  private readonly near = railNearest();
  private readonly scratchP: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly scratchT: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly stick = { x: 0, y: 0 };
  private readonly resource = { value: 0, max: 100, dashCost: STAMINA.dodge, subCost: STAMINA.dodge, subReady: true };

  constructor(readonly id: ActorId, readonly tierId: BotTier, seed: number, readonly seat: number) {
    this.tier = BOT_TIERS[tierId];
    this.rng = seededRng(forkSeed(seed, `bot:${id}`));
    const reach = ARSENAL_REACH.fists;
    this.rival = withSeededRandom(this.rng, () => new RivalCombatBrain({ difficulty: this.tier.skill, moves: rivalMoves(reach.reach, reach.jab), canSpecial: false, rng: this.rng }));
    this.rival.setStepping(false);
    this.thinkEvery = Math.max(1, Math.round(60 / this.tier.thinkHz));
    this.thinkPhase = seat % this.thinkEvery;
  }

  /** One tick: think when it is this bot's turn, then act. Returns the MoveInput (written in place). */
  step(view: BotView, self: AdventureActor, tick: number, dt: number): MoveInput {
    const kit = view.kitOf(this.id);
    if (kit && kit.weapon !== this.weaponId) this.arm(kit.weapon);
    if (tick % this.thinkEvery === this.thinkPhase) this.think(view, self, kit);
    this.act(view, self, kit, dt);
    return this.out;
  }

  private arm(weaponLootId: string): void {
    this.weaponId = weaponLootId;
    const w = lootById(weaponLootId)?.weapon ?? 'fists';
    const r = ARSENAL_REACH[w];
    this.rival.setFoeReach(r.reach);
    // a new weapon: the brain's spacing reads its reach (a fresh brain, same seed stream)
    this.rival = withSeededRandom(this.rng, () => new RivalCombatBrain({ difficulty: this.tier.skill, moves: rivalMoves(r.reach, r.jab), canSpecial: false, rng: this.rng }));
    this.rival.setStepping(false);
  }

  // ── think ───────────────────────────────────────────────────────────────────────────────────────────────────────

  private think(view: BotView, self: AdventureActor, kit: Kit | null): void {
    this.thinks++;
    const t = view.tSec;
    if (view.dropping(this.id)) {
      const d = view.dropTarget(this.id);
      this.goal = 'drop';
      if (d) { this.goalPos.x = d.x; this.goalPos.y = d.y; this.goalPos.z = d.z; }
      return;
    }
    if (!(self.stats.hp.cur > 0)) return;
    perceive(self, view.bodies(), view.world, this.tier, view.noisy, this.memory, t);
    for (const id of this.memory.keys()) {
      const a = view.world.actors.get(id);
      if (!a || !(a.stats.hp.cur > 0)) this.memory.delete(id);   // it saw (or heard) them fall
      else this.everPerceived.add(id);
    }

    // 1. a downed teammate, when nothing is on top of us
    const nearest = this.nearestMemory(self);
    const threatClose = nearest !== null && nearest.d < 9;
    for (const m of view.teammates(this.id)) {
      if (!m.downed || threatClose) continue;
      this.setGoal('revive', m.actor.pos, m.actor.id);
      return;
    }

    // 2. the storm: get in (unless a fight is right on top of us)
    const z = view.zone;
    const next = nextCircle(z);
    const inNow = !inStorm(z, self.pos);
    const dn = Math.hypot(self.pos.x - next.x, self.pos.z - next.z);
    const closingSoon = z.stage === 'shrink' || (z.stage === 'wait' && z.stageLen - z.stageSec < 12);
    if ((!inNow || (closingSoon && dn > next.r * 0.85)) && !(threatClose && inNow)) {
      // a point inside the coming circle, on our side of it
      const k = next.r > 0 && dn > 1e-3 ? Math.min(1, (next.r * 0.55) / dn) : 0;
      this.goalPos.x = next.x + (self.pos.x - next.x) * k;
      this.goalPos.z = next.z + (self.pos.z - next.z) * k;
      this.goalPos.y = 0;
      this.goal = 'storm';
      this.targetId = null;
      this.planTrip(view, self, dn);
      return;
    }

    // 3. what it can see to take: loot that improves its kit, a shut chest
    const pick = kit ? this.lootPick(view, self, kit, t) : null;
    // 4. a known enemy: fight it (after the reaction beat), or break off when hurt. Early, or with a weak kit, a bot
    //    loots first unless the enemy is right there (the genre's opening: land, gear up, then fight)
    const gearing = pick !== null && (t < EARLY_SEC || (kit !== null && kit.spells.equipped.filter(Boolean).length < 2));
    if (nearest && nearest.d < (gearing ? CLOSE_M : ENGAGE_M)) {
      const hp01 = self.stats.hp.cur / Math.max(1, self.stats.hp.max);
      if (this.tier.fleeHp01 > 0 && hp01 < this.tier.fleeHp01 && nearest.d < 14) {
        const dx = self.pos.x - nearest.m.x, dz = self.pos.z - nearest.m.z, d = Math.hypot(dx, dz) || 1;
        this.goal = 'flee';
        this.targetId = null;
        this.goalPos.x = self.pos.x + (dx / d) * 20 + (next.x - self.pos.x) * 0.1;
        this.goalPos.z = self.pos.z + (dz / d) * 20 + (next.z - self.pos.z) * 0.1;
        return;
      }
      if (this.newTargetFrom !== nearest.m.id) {
        this.newTargetFrom = nearest.m.id;
        // the reaction beat: the tier's own, never shorter than MobSteering's striker preset ("aware, not psychic")
        this.engageAtSec = t + Math.max(this.tier.reactSec, STEERING_PRESETS.striker.reactionSec ?? 0);
      }
      this.goal = 'fight';
      this.targetId = nearest.m.id;
      this.goalPos.x = nearest.m.x; this.goalPos.y = nearest.m.y; this.goalPos.z = nearest.m.z;
      this.decideExtras(view, self, kit, nearest.d);
      return;
    }
    this.newTargetFrom = null;
    if (pick) {
      this.setGoal(pick.chest ? 'chest' : 'loot', pick.pos, null);
      this.lootUid = pick.uid;
      return;
    }

    // 5. nothing to do: drift toward the next circle (and the landmarks on the way)
    const roamR = Math.max(6, next.r * 0.5);
    if (this.goal !== 'roam' || Math.hypot(self.pos.x - this.goalPos.x, self.pos.z - this.goalPos.z) < 4 || this.rng() < 0.05) {
      const ang = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * roamR;
      this.goalPos.x = next.x + Math.sin(ang) * r; this.goalPos.z = next.z + Math.cos(ang) * r; this.goalPos.y = 0;
    }
    this.goal = 'roam';
    this.targetId = null;
    this.planTrip(view, self, Math.hypot(self.pos.x - this.goalPos.x, self.pos.z - this.goalPos.z));
  }

  /** The best thing in sight to take: an item that improves the kit (by worth over distance), or a nearer shut chest. */
  private lootPick(view: BotView, self: AdventureActor, kit: Kit, t: number): { pos: Vec3; uid: number | null; chest: boolean } | null {
    let best: FloorItem | null = null, bestScore = 0;
    for (const it of view.items) {
      const d = Math.hypot(it.pos.x - self.pos.x, it.pos.z - self.pos.z);
      if (d > LOOT_SIGHT_M) continue;
      const def = lootById(it.lootId);
      if (!def) continue;
      if (it.droppedBy === this.id && t < it.holdUntil) continue;
      const s = upgradeScore(kit, def) / (1 + d / 12);
      if (s > bestScore && canSeePoint(self, it.pos, view.world, LOOT_SIGHT_M)) { bestScore = s; best = it; }
    }
    let chest: Chest | null = null, chestD = Infinity;
    for (const c of view.chests) {
      if (c.open) continue;
      const d = Math.hypot(c.pos.x - self.pos.x, c.pos.z - self.pos.z);
      if (d < chestD && d < LOOT_SIGHT_M && canSeePoint(self, c.pos, view.world, LOOT_SIGHT_M)) { chestD = d; chest = c; }
    }
    if (chest && (!best || chestD < Math.hypot(best.pos.x - self.pos.x, best.pos.z - self.pos.z) * 0.8)) return { pos: chest.pos, uid: null, chest: true };
    return best ? { pos: best.pos, uid: best.uid, chest: false } : null;
  }

  private setGoal(g: BotGoal, p: Vec3, targetId: ActorId | null): void {
    this.goal = g;
    this.goalPos.x = p.x; this.goalPos.y = p.y; this.goalPos.z = p.z;
    this.targetId = targetId;
    this.lootUid = null;
  }

  private nearestMemory(self: AdventureActor): { m: Memory; d: number } | null {
    let best: Memory | null = null, bd = Infinity;
    for (const m of this.memory.values()) {
      const d = Math.hypot(m.x - self.pos.x, m.z - self.pos.z);
      if (d < bd) { bd = d; best = m; }
    }
    return best ? { m: best, d: bd } : null;
  }

  /** In a fight: a spell to cast, the summon, the fusion. */
  private decideExtras(view: BotView, self: AdventureActor, kit: Kit | null, dist: number): void {
    this.castSlot = null;
    if (kit && this.rng() < this.tier.castChance) {
      for (let i = 0; i < kit.spells.equipped.length; i++) {
        const id = kit.spells.equipped[i];
        const sp = id ? view.spell(id) : undefined;
        if (!sp || sp.shape === 'self' && sp.mind !== 'barrier') continue;
        if (view.spellCooldown(this.id, sp.id) > 0 || self.stats.energy.cur < sp.energyCost) continue;
        const reach = sp.shape === 'nova' ? (sp.radiusM ?? 4) : sp.shape === 'self' ? 99 : sp.rangeM;
        if (dist > reach || (sp.shape === 'bolt' && dist < 3)) continue;
        if (sp.mind === 'barrier' && self.stats.hp.cur > self.stats.hp.max * 0.6) continue;
        this.castSlot = i;
        break;
      }
    }
    this.wantSummon = dist < 14 && view.summonReady(this.id) && this.rng() < 0.5;
    this.wantFuse = self.fusion.meter >= 1 && !self.fusion.active && self.stats.energy.cur >= 25 && dist < 18;
  }

  /** A long trip: fuse and fly when the meter is full; else a rail heading the right way. */
  private planTrip(view: BotView, self: AdventureActor, dist: number): void {
    this.wantFuse = false;
    if (!this.tier.traverses || dist < LONG_TRIP_M) { this.railPlan = null; return; }
    if (self.fusion.meter >= 1 && !self.fusion.active && self.stats.energy.cur >= 25) { this.wantFuse = true; return; }
    if (self.fusion.active) { this.wantFly = true; return; }
    if (this.railPlan || this.railCdSec > 0 || self.state === 'grind') return;
    const dx = this.goalPos.x - self.pos.x, dz = this.goalPos.z - self.pos.z, dl = Math.hypot(dx, dz) || 1;
    let best: RailPlan | null = null, bestD = RAIL_REACH_M;
    for (const path of view.rails.paths) {
      nearestOnPath(path, self.pos, this.near);
      if (this.near.d > bestD || this.near.s < 2 || this.near.s > path.length - 6) continue;
      sampleRail(path, this.near.s, this.scratchP, this.scratchT);
      const tl = Math.hypot(this.scratchT.x, this.scratchT.z) || 1;
      let tx = this.scratchT.x / tl, tz = this.scratchT.z / tl;
      const along = (tx * dx + tz * dz) / dl;
      if (Math.abs(along) < 0.6) continue;
      if (along < 0) { tx = -tx; tz = -tz; }
      bestD = this.near.d;
      best = { segId: path.id, entry: { x: this.scratchP.x, y: this.scratchP.y, z: this.scratchP.z }, tx, tz, startedSec: view.tSec };
    }
    this.railPlan = best;
  }

  // ── act ─────────────────────────────────────────────────────────────────────────────────────────────────────────

  private act(view: BotView, self: AdventureActor, kit: Kit | null, dt: number): void {
    const o = this.out;
    o.jump = false; o.dash = false; o.attackLight = false; o.attackHeavy = false; o.lock = false; o.magic = false;
    o.magicSlot = null; o.partner = false; o.fuse = false; o.jumpHeld = false; o.dashHeld = false; o.guardHeld = false;
    o.ascendHeld = false; o.descendHeld = false; o.interactHeld = false; o.focusHeld = false; o.magicHeld = false;
    o.lean = 0; o.look.x = 0; o.look.y = 0; o.move.x = 0; o.move.y = 0; o.camYaw = 0;
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    this.railCdSec = Math.max(0, this.railCdSec - dt);
    this.flyPressCd = Math.max(0, this.flyPressCd - dt);
    this.trickCd = Math.max(0, this.trickCd - dt);
    this.lockCd = Math.max(0, this.lockCd - dt);
    this.detourSec = Math.max(0, this.detourSec - dt);
    this.wantSprint = false;
    if (!(self.stats.hp.cur > 0) || self.state === 'ko') { this.sprinting = false; return; }
    const t = view.tSec;
    this.actGoal(view, self, kit, dt, t);
    this.sprint(self, dt);
  }

  /**
   * The sprint is the held dash: a real press, then held (so A2's dash reader sees a hold, never a tap: a dodge is a
   * decision, not a side effect of running), kept for at least SPRINT_MIN_SEC.
   */
  private sprint(self: AdventureActor, dt: number): void {
    const o = this.out;
    if (o.dash) { this.sprinting = false; return; }   // a dodge this tick: the fight's own press
    const want = this.wantSprint && self.state === 'ground' && self.stats.stamina.cur > 15;
    if (!this.sprinting && want) { this.sprinting = true; this.sprintSec = 0; o.dash = true; o.dashHeld = true; return; }
    if (this.sprinting) {
      this.sprintSec += dt;
      if (want || this.sprintSec < SPRINT_MIN_SEC) o.dashHeld = true;
      else this.sprinting = false;
    }
  }

  private actGoal(view: BotView, self: AdventureActor, kit: Kit | null, dt: number, t: number): void {
    const o = this.out;

    if (this.goal === 'drop') { this.steer(view, self, this.goalPos, false, dt); return; }

    if (this.wantFuse && self.fusion.meter >= 1 && !self.fusion.active) { o.fuse = true; this.wantFuse = false; this.wantFly = true; }

    // on a rail: ride it while it carries us the right way; a trick now and then (A1 pays energy for it)
    if (self.state === 'grind' && self.rail) {
      const path = view.rails.byId.get(self.rail.segmentId);
      if (path) {
        sampleRail(path, self.rail.sM, this.scratchP, this.scratchT);
        const tl = Math.hypot(this.scratchT.x, this.scratchT.z) || 1;
        const tx = (this.scratchT.x / tl) * self.rail.dir, tz = (this.scratchT.z / tl) * self.rail.dir;
        const dx = this.goalPos.x - self.pos.x, dz = this.goalPos.z - self.pos.z, dl = Math.hypot(dx, dz) || 1;
        this.railPlan = null;
        if ((tx * dx + tz * dz) / dl < 0.25 || dl < 20 || this.goal === 'fight') { o.jump = true; this.railCdSec = 6; }
        else {
          // the tuck: the stick along the rail (A1 speeds a rider up on a straight); a trick now and then
          stickFor(tx, tz, 0, this.stick);
          o.move.x = this.stick.x; o.move.y = this.stick.y;
          if (this.trickCd <= 0 && this.memory.size === 0) { o.attackLight = true; this.trickCd = 1.6 + this.rng(); }
        }
      }
      return;
    }

    // flying (fused): head for the goal, climb a little, land near it
    if (self.state === 'flight') { this.fly(view, self); return; }
    if (self.fusion.active && this.wantFly && this.goal !== 'fight') {
      const d = Math.hypot(this.goalPos.x - self.pos.x, this.goalPos.z - self.pos.z);
      if (d > 30 && this.flyPressCd <= 0) {
        if (self.state === 'ground') { o.jump = true; this.flyPressCd = 0.25; }
        else if (self.state === 'air' && self.vel.y < 3) { o.jump = true; this.flyPressCd = 0.5; this.takeoffs++; }
      }
    }

    switch (this.goal) {
      case 'fight': this.fight(view, self, kit, dt, t); return;
      case 'revive': {
        const d = Math.hypot(this.goalPos.x - self.pos.x, this.goalPos.z - self.pos.z);
        if (d > 1.2) this.steer(view, self, this.goalPos, d > 6, dt);
        else o.interactHeld = true;
        return;
      }
      default: {
        if (this.railPlan && self.state !== 'grind') { this.followRail(view, self, dt); return; }
        const d = Math.hypot(this.goalPos.x - self.pos.x, this.goalPos.z - self.pos.z);
        this.steer(view, self, this.goalPos, d > 12 && self.stats.stamina.cur > 30, dt);
      }
    }
  }

  private fight(view: BotView, self: AdventureActor, kit: Kit | null, dt: number, t: number): void {
    const o = this.out;
    const mem = this.targetId ? this.memory.get(this.targetId) : undefined;
    const target = this.targetId ? view.world.actors.get(this.targetId) : undefined;
    if (!mem || !target || !(target.stats.hp.cur > 0)) { this.goal = 'roam'; return; }
    // no omniscience in a fight either: a target out of the senses for a beat is hunted where it was last known
    if (t - mem.atSec > STALE_SEC) {
      this.scratchP.x = mem.x; this.scratchP.y = mem.y; this.scratchP.z = mem.z;
      this.steer(view, self, this.scratchP, true, dt);
      return;
    }
    // MobSteering's lead: aim where the target will be, never more than LEAD_CAP_SEC ahead
    const dist = Math.hypot(target.pos.x - self.pos.x, target.pos.z - self.pos.z);
    const lead = Math.min(dist / 9, LEAD_CAP_SEC);
    this.scratchP.x = target.pos.x + target.vel.x * lead; this.scratchP.y = target.pos.y; this.scratchP.z = target.pos.z + target.vel.z * lead;
    if (t < this.engageAtSec) { this.steer(view, self, this.scratchP, false, dt); return; }
    const camYaw = yawTo(self.pos.x, self.pos.z, target.pos.x, target.pos.z);
    o.camYaw = camYaw;
    // the lock: pressed while facing the target (the pick reads the camera's centre), dropped when it went elsewhere
    const locked = !!self.lock && self.lock.hard;
    if (dist < LOCK_M && this.lockCd <= 0 && (!locked || self.lock!.actorId !== target.id)) { o.lock = true; this.lockCd = locked ? 0.2 : 0.6; }
    // spells, the summon, the fusion
    if (this.castSlot !== null && dist > 2.5) { o.magicSlot = this.castSlot; o.magic = true; this.castSlot = null; }
    if (this.wantSummon) { o.partner = true; this.wantSummon = false; }
    // a flyer we cannot reach: keep spells on it and stay under it
    const above = target.pos.y - self.pos.y;
    if (dist > BRAWL_M || above > 3) {
      this.steer(view, self, this.scratchP, dist > 10 && self.stats.stamina.cur > 30, dt, camYaw);
      return;
    }
    // the brawl: RivalCombatBrain decides, with the bot's own seeded stream
    const fs = this.fstate;
    fs.stunSec = self.stunSec;
    fs.chi = 0;
    const tfs = fightStateOf(target);
    const mine = fightStateOf(self);
    const r = this.resource;
    r.value = self.stats.stamina.cur; r.max = self.stats.stamina.max;
    r.subReady = self.stats.energy.cur >= SUBSTITUTION.energyCost;
    const incoming = Number.isFinite(mine.incomingSec) ? mine.incomingSec : -1;
    const foeOpen = !!tfs.move && tfs.moveHitDone;
    const d = withSeededRandom(this.rng, () => this.rival.decide(dt, self.pos, target.pos, fs, !!tfs.move && !tfs.moveHitDone, r, incoming, foeOpen));
    // RivalCombatBrain's stick is INTENT space (moveY = −world z): back to world, then to our camera
    stickFor(d.moveX, -d.moveY, camYaw, this.stick);
    o.move.x = this.stick.x; o.move.y = this.stick.y;
    if (d.attack === 'heavy') o.attackHeavy = true;
    else if (d.attack) o.attackLight = true;
    if (d.block) o.guardHeld = true;
    if (d.spend === 'dash') { o.dash = true; }
    else if (d.spend === 'substitution') { o.guardHeld = true; o.dash = true; }
    void kit;
  }

  private fly(view: BotView, self: AdventureActor): void {
    const o = this.out;
    const dx = this.goalPos.x - self.pos.x, dz = this.goalPos.z - self.pos.z, d = Math.hypot(dx, dz);
    const g = view.world.groundY(self.pos.x, self.pos.z) ?? 0;
    const want = Math.min(view.zone.cur.ceilingY - 3, g + 14);
    if (d < 18 || this.goal === 'fight') { o.descendHeld = true; this.wantFly = false; }
    else if (self.pos.y < want) o.ascendHeld = true;
    else if (self.pos.y > want + 4) o.descendHeld = true;
    // cruise past 70 m: the burst (a press), then the hold carries it into cruise
    if (d > 70) { o.dashHeld = true; if (!this.cruising) o.dash = true; this.cruising = true; } else this.cruising = false;
    if (view.flightMode(this.id) === 'cruise') {
      // cruise steers by banking toward the goal (A1: the stick's x is the bank)
      let err = Math.atan2(dx, dz) - self.facingYaw;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      o.move.x = Math.max(-1, Math.min(1, err * 1.5)); o.move.y = 0;
      return;
    }
    if (d > 1e-3) stickFor(dx / d, dz / d, 0, this.stick);
    o.move.x = this.stick.x; o.move.y = this.stick.y;
  }

  /** Walk to a rail's entry along its direction and jump onto it (A1 catches a rider dropping onto a rail). */
  private followRail(view: BotView, self: AdventureActor, dt: number): void {
    const o = this.out;
    const p = this.railPlan!;
    if (view.tSec - p.startedSec > 7) { this.railPlan = null; this.railCdSec = 10; return; }
    // a run-up point a few metres before the entry, then along the rail
    const ax = p.entry.x - p.tx * 4, az = p.entry.z - p.tz * 4;
    const toA = Math.hypot(ax - self.pos.x, az - self.pos.z);
    const toE = Math.hypot(p.entry.x - self.pos.x, p.entry.z - self.pos.z);
    // lateral distance from the rail line
    const lx = self.pos.x - p.entry.x, lz = self.pos.z - p.entry.z;
    const along = lx * p.tx + lz * p.tz;
    const lateral = Math.abs(lx * p.tz - lz * p.tx);
    if (along > -5.5 && along < 3 && lateral < 2.2 && toE < 6) {
      // on the line: run along it and jump onto it
      stickFor(p.tx, p.tz, 0, this.stick);
      o.move.x = this.stick.x; o.move.y = this.stick.y;
      this.wantSprint = self.stats.stamina.cur > 20;
      if (self.state === 'ground' && this.jumpCd <= 0 && lateral < 1.1) { o.jump = true; o.jumpHeld = true; this.jumpCd = 0.8; this.railEntries++; }
      if (self.state === 'air') o.jumpHeld = true;
      return;
    }
    this.scratchT.x = toA > 2 ? ax : p.entry.x; this.scratchT.y = 0; this.scratchT.z = toA > 2 ? az : p.entry.z;
    this.steer(view, self, this.scratchT, true, dt);
  }

  /** Steer toward `dest` around blocks: a probe ahead; a hop over a low block; a detour round a tall one; unstick. */
  private steer(view: BotView, self: AdventureActor, dest: { x: number; z: number }, sprint: boolean, dt: number, camYaw = 0): void {
    const o = this.out;
    let dx = dest.x - self.pos.x, dz = dest.z - self.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) return;
    dx /= d; dz /= d;
    if (self.state === 'ground') {
      // stuck? (wanting to move, barely moving)
      this.stuckClock += dt;
      if (this.stuckClock >= 1) {
        const moved = Math.hypot(self.pos.x - this.stuckX, self.pos.z - this.stuckZ);
        if (moved < 1.2 && this.detourSec <= 0) { this.detourSec = 1.2; this.detourSide = this.rng() < 0.5 ? -1 : 1; if (this.jumpCd <= 0) { o.jump = true; this.jumpCd = 1; } }
        this.stuckClock = 0; this.stuckX = self.pos.x; this.stuckZ = self.pos.z;
      }
      const w = view.world;
      const probe = (ux: number, uz: number): number => {
        const g = w.groundY(self.pos.x + ux * 1.8, self.pos.z + uz * 1.8);
        return g === null ? 99 : g - self.pos.y;
      };
      const rise = probe(dx, dz);
      if (rise > 0.45) {
        if (rise < 1.7 && this.jumpCd <= 0) { o.jump = true; o.jumpHeld = true; this.jumpCd = 0.7; }
        else if (rise >= 1.7 && this.detourSec <= 0) {
          // round it: the side whose probe is clear
          const c = Math.cos(1.2), s = Math.sin(1.2);
          const lx = dx * c - dz * s, lz = dx * s + dz * c, rx = dx * c + dz * s, rz = -dx * s + dz * c;
          this.detourSide = probe(lx, lz) <= 0.45 ? 1 : probe(rx, rz) <= 0.45 ? -1 : this.detourSide;
          this.detourSec = 0.7;
        }
      }
      if (this.detourSec > 0) {
        const a = 1.2 * this.detourSide, c = Math.cos(a), s = Math.sin(a);
        const nx = dx * c - dz * s, nz = dx * s + dz * c;
        dx = nx; dz = nz;
      }
    } else if (self.state === 'air') {
      o.jumpHeld = true;   // a full hop over what we jumped at
    }
    stickFor(dx, dz, camYaw, this.stick);
    o.move.x = this.stick.x; o.move.y = this.stick.y;
    if (sprint && self.state === 'ground') this.wantSprint = true;
  }
}
