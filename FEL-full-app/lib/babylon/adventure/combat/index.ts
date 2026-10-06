/**
 * The combat system (plan A2: `createCombatSystem()`). One `AdventureSystem` that runs, per fixed step, after A1's
 * movement and before A3's stats:
 *
 *   1. timers on every actor, on its OWN clock (dt × the host's `timeScaleOf`): stun, i-frames, stamina and poise
 *      regen, the roll, the riposte window, a juggle's air time. Slow-time therefore slows the monsters' tells and
 *      not the caster's swing, without this system knowing slow-time exists.
 *   2. the inputs of every actor that has one (player, partner, bot, net peer): guard and parry presses, lock and
 *      flick, the dash button (dodge / roll / homing dash / substitution / sprint), light and heavy presses.
 *   3. the monster and boss brains: their movement intent goes out through `aiInputs` (A4 feeds it to A1 next
 *      step), their swings land here.
 *   4. swings advance through their frame data; a swing's hit is resolved on its active frame.
 *   5. projectiles; lock upkeep; boss phase checks; camera hints for the local player.
 *
 * Writes only A2's fields: hp, poise, stamina, lock, stunSec, iframeSec, impulse (and spends energy for a
 * substitution). Pure: no Babylon, no clock, no Math.random (the monsters' picks use a seeded generator).
 */

import { MOVES, pickTarget, stickDirTo, lungeFor, DASH_ATTACK_SEC, type Body2, type StickDir } from '@/lib/babylon/core/HordeDynamics';
import { DASH } from '@/lib/babylon/core/StormCombat';
import { ratingsFrom, routeFor } from '@/lib/babylon/core/FighterStyle';
import { threatLandsIn } from '@/lib/babylon/core/RivalCombatBrain';
import {
  neutralInput, spendPool, wishDir, type ActorId, type AdventureActor, type AdventureStepContext, type AdventureSystem,
  type CameraHint, type LockTarget, type MoveInput, type Vec3,
} from '../contracts';
import { applyHit, makeHitSpec, requestPlanarVel, resetHitSpec, type HitSpec } from './damage';
import { startDodge, startHoming, stepDodgeMotion } from './dash';
import { elementOf, fightStateOf, type FightState } from './fightState';
import {
  cycleLock, isHostile, lockCandidates, lockHolds, lockPoint, pickLock, yawTo, type PartsOf,
} from './lock';
import { ProjectilePool } from './projectiles';
import { drainStamina, spendStaminaSwing, tickStamina } from './stamina';
import { ADVENTURE_MOVES, pressString, swingSec, type AdventureMove, type StrikeInput } from './strings';
import { AIR, GUARD, LOCK, POISE, STAMINA, SUBSTITUTION } from './tuning';
import { AttackTokens, MonsterBrain } from './monsters/brain';
import type { MonsterAttack, MonsterDef } from './monsters/defs';
import { BossRuntime } from './bosses/boss';
import type { BossDef } from './bosses/defs';

export interface CombatSystemOptions {
  /** The local player, for camera hints. Default: the first actor of kind 'player'. */
  localPlayerId?: ActorId;
  /** Seed for the monsters' attack picks (deterministic given a seed). */
  seed?: number;
  /** Projectile pool size (the budget). Default 48. */
  projectiles?: number;
}

/** A monster's or boss's tell, for the view (the wind-up the player reads) and for tests. */
export interface Telegraph {
  attackId: string;
  label: string;
  kind: MonsterAttack['kind'];
  phase: 'windup' | 'strike';
  tellSec: number;
  /** 0..1 through the wind-up (1 during the strike). */
  t01: number;
  lineX: number;
  lineZ: number;
  range: number;
  arcDeg: number;
}

export interface CombatSystem extends AdventureSystem {
  /** Spawned monsters and bosses are registered once (A4 spawns them with `createMonsterActor`). */
  registerMonster(actor: AdventureActor, def: MonsterDef): void;
  registerBoss(actor: AdventureActor, def: BossDef): void;
  unregister(id: ActorId): void;
  /** The monsters' and bosses' movement intent from this step; A4 merges it into the next step's inputs. */
  readonly aiInputs: ReadonlyMap<ActorId, MoveInput>;
  telegraphOf(id: ActorId): Telegraph | null;
  /** 1-based phase of a registered boss, 0 for anything else. */
  bossPhaseOf(id: ActorId): number;
  /**
   * A substitution's landing spot, taken once (A1 owns `pos`, so the host applies it). Contract request: an actor
   * field for a warp A1 applies, so this side channel can go.
   */
  takeWarp(id: ActorId): Vec3 | null;
  /** Seconds a combat verb holds the body (A1 should skip its own steering while > 0; contract request). */
  moveLockOf(id: ActorId): number;
  /** Weak points by actor (bosses), for lock-on and the view's reticle. */
  readonly partsOf: PartsOf;
  readonly projectiles: ProjectilePool;
}

interface MonsterRuntime { def: MonsterDef; brain: MonsterBrain; input: MoveInput; lungeStop: boolean }

/** mulberry32: a tiny seeded generator, so a fight replays the same from the same seed. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (a: number): number => {
  let d = a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

export function createCombatSystem(opts: CombatSystemOptions = {}): CombatSystem {
  const rng = seededRng(opts.seed ?? 1);
  const monsters = new Map<ActorId, MonsterRuntime>();
  const bosses = new Map<ActorId, BossRuntime & { input: MoveInput; lungeStop: boolean }>();
  // The fight records of actors this system has stepped, by id (takeWarp / moveLockOf get only an id).
  const warpOf = new Map<ActorId, FightState>();
  const aiInputs = new Map<ActorId, MoveInput>();
  const tokens = new AttackTokens();
  const projectiles = new ProjectilePool(opts.projectiles ?? 48);
  const spec: HitSpec = makeHitSpec();
  const scratchPoint: Vec3 = { x: 0, y: 0, z: 0 };
  const bodies: Body2[] = [];
  const bodyActors: AdventureActor[] = [];
  const hits: AdventureActor[] = [];
  const hintLock: CameraHint = { preset: 'lock', priority: 50 };
  const hintBoss: CameraHint = { preset: 'boss', priority: 60 };
  const hintBeat: CameraHint = { preset: 'boss', priority: 90 };

  const partsOf: PartsOf = (a) => bosses.get(a.id)?.parts ?? null;

  function localId(ctx: AdventureStepContext): ActorId | null {
    if (opts.localPlayerId) return opts.localPlayerId;
    for (const a of ctx.world.actors.values()) if (a.kind === 'player') return a.id;
    return null;
  }

  // ── 1. timers ─────────────────────────────────────────────────────────────────────────────────────────────────
  function tickTimers(a: AdventureActor, fs: FightState, adt: number, dt: number): void {
    fs.localSec += adt;
    a.stunSec = Math.max(0, a.stunSec - adt);
    a.iframeSec = Math.max(0, a.iframeSec - adt);
    if (a.iframeSec === 0) fs.iframeCause = 'other';
    fs.rollCooldownSec = Math.max(0, fs.rollCooldownSec - adt);
    fs.counterSec = Math.max(0, fs.counterSec - adt);
    fs.subArmedSec = Math.max(0, fs.subArmedSec - adt);
    fs.subCooldownSec = Math.max(0, fs.subCooldownSec - adt);
    fs.subVulnerableSec = Math.max(0, fs.subVulnerableSec - adt);
    fs.afterDashSec = Math.max(0, fs.afterDashSec - adt);
    fs.moveLockSec = Math.max(0, fs.moveLockSec - adt);
    fs.comboSec = Math.max(0, fs.comboSec - adt);
    if (fs.comboSec === 0) fs.combo = 0;
    if (fs.airSec > 0) { fs.airSec = Math.max(0, fs.airSec - adt); if (fs.airSec === 0) fs.airLinks = 0; }
    fs.slowMo.tick(dt);
    // Poise regen after a quiet spell.
    fs.poiseIdleSec += adt;
    const p = a.stats.poise;
    if (fs.poiseIdleSec >= POISE.regenDelaySec && p.cur < p.max) p.cur = Math.min(p.max, p.cur + POISE.regenPerSec * adt);
    tickStamina(a, fs, adt, fs.guardWasHeld);
    if (a.stats.hp.cur <= 0) { fs.move = null; fs.rollSec = 0; fs.homingSec = 0; fs.guardWasHeld = false; fs.queue.clear(); }
    fs.incomingSec = fs.incomingNext;
    fs.incomingNext = Infinity;
  }

  // ── 2. inputs ─────────────────────────────────────────────────────────────────────────────────────────────────
  function setLock(ctx: AdventureStepContext, a: AdventureActor, lock: LockTarget | null): void {
    a.lock = lock;
    fightStateOf(a).lockLostSec = 0;
    ctx.bus.emit('lock', { actorId: a.id, target: lock });
  }

  function acquire(ctx: AdventureStepContext, a: AdventureActor, camYaw: number): void {
    const cands = lockCandidates(a, ctx.world, partsOf);
    const i = pickLock(a, camYaw, cands);
    if (i < 0) return;
    setLock(ctx, a, { actorId: cands[i].actorId, part: cands[i].part, sinceSec: ctx.tSec, hard: true });
  }

  function cycle(ctx: AdventureStepContext, a: AdventureActor, dir: 1 | -1): void {
    if (!a.lock) return;
    const cur = lockPoint(a.lock, ctx.world, partsOf, scratchPoint);
    if (!cur) return;
    const cands = lockCandidates(a, ctx.world, partsOf);
    const i = cycleLock(a, { x: cur.x, z: cur.z, actorId: a.lock.actorId, part: a.lock.part }, dir, cands);
    if (i < 0) return;
    setLock(ctx, a, { actorId: cands[i].actorId, part: cands[i].part, sinceSec: ctx.tSec, hard: true });
  }

  function handleInput(ctx: AdventureStepContext, a: AdventureActor, input: MoveInput, dt: number): void {
    const fs = fightStateOf(a);
    if (a.stats.hp.cur <= 0) return;
    const now = fs.localSec;

    // Guard: the press time is the parry's clock.
    if (input.guardHeld && !fs.guardWasHeld) fs.guardPressSec = now;
    fs.guardWasHeld = input.guardHeld;

    // Lock toggle and the flick.
    if (input.lock) {
      if (a.lock && a.lock.hard) setLock(ctx, a, null);
      else acquire(ctx, a, input.camYaw);
    }
    const lx = input.look.x;
    if (a.lock && a.lock.hard && Math.abs(lx) > LOCK.flick && Math.abs(fs.lookXWas) <= LOCK.flick) cycle(ctx, a, lx > 0 ? 1 : -1);
    fs.lookXWas = lx;

    // The dash button: XButtonReader turns press / release into a tap, a double tap, or a hold (the sprint).
    let gesture: 'tap' | 'double' | 'held' | null = null;
    if (input.dash) {
      fs.xButton.press(now);
      fs.dashWasHeld = true;
      if (!input.dashHeld) { gesture = fs.xButton.release(now); fs.dashWasHeld = false; }
    } else if (fs.dashWasHeld && !input.dashHeld) {
      gesture = fs.xButton.release(now);
      fs.dashWasHeld = false;
    }
    const wish = wishDir(input);
    const locked = !!(a.lock && a.lock.hard);
    if (gesture === 'tap' && input.guardHeld) {
      // Substitution (DefenseSystem): guard + dash, armed for a beat, paid in energy up front.
      if (fs.subCooldownSec <= 0 && a.stunSec <= 0 && spendPool(a.stats.energy, SUBSTITUTION.energyCost)) {
        fs.subArmedSec = SUBSTITUTION.armedSec;
      }
    } else if (gesture === 'tap') {
      const r = startDodge(a, fs, locked ? 'roll' : 'dash', wish.x, wish.z, ctx.bus);
      // A strike out of a dash is the dash attack (HordeDynamics' rush): the window runs past the dash's own length.
      if (r.ok) fs.afterDashSec = DASH_ATTACK_SEC + (locked ? 0 : DASH.sec);
    } else if (gesture === 'double') {
      if (locked) startHoming(a, fs, a.lock!.actorId);
      else { const r = startDodge(a, fs, 'dash', wish.x, wish.z, ctx.bus); if (r.ok) fs.afterDashSec = DASH_ATTACK_SEC + DASH.sec; }
    }
    // Sprint: the held button on the ground drains stamina (A1 runs the sprint; it should stop at an empty bar).
    if (input.dashHeld && fs.dashWasHeld && fs.xButton.guardHeld(now) && a.state === 'ground' && !locked
      && Math.hypot(a.vel.x, a.vel.z) > 1) {
      drainStamina(a, fs, STAMINA.sprintPerSec * ctx.timeScaleOf(a.id) * dt);
    }

    if (input.attackLight) press(ctx, a, fs, 'light', wish);
    if (input.attackHeavy) press(ctx, a, fs, 'heavy', wish);
  }

  function press(ctx: AdventureStepContext, a: AdventureActor, fs: FightState, kind: StrikeInput, wish: { x: number; z: number; mag: number }): void {
    if (a.stunSec > 0 || fs.rollSec > 0) return;
    if (fs.homingSec > 0) { fs.homingSec = 0; fs.moveLockSec = 0; fs.afterDashSec = DASH_ATTACK_SEC; }
    const stick = wish.mag > 0 ? { x: wish.x, z: wish.z } : null;
    if (fs.move && fs.moveT < fs.move.cancelAtSec) {
      // Before the cancel point the press waits (HordeDynamics' queue): mashing early still chains.
      const t = aimTarget(ctx, a, stick);
      const dir: StickDir = t ? stickDirTo(stick, yawTo(a.pos.x, a.pos.z, t.pos.x, t.pos.z)) : 'n';
      fs.queue.push(kind === 'heavy' ? 'Y' : 'A', dir, fs.localSec);
      return;
    }
    startSwing(ctx, a, fs, kind, stick, null);
  }

  /** The hard lock, else the best body for a soft lock (HordeDynamics.pickTarget: the stick's cone, else a threat). */
  function aimTarget(ctx: AdventureStepContext, a: AdventureActor, stick: { x: number; z: number } | null): AdventureActor | null {
    if (a.lock && a.lock.hard) return ctx.world.actors.get(a.lock.actorId) ?? null;
    bodies.length = 0; bodyActors.length = 0;
    for (const o of ctx.world.near(a.pos, 6)) {
      if (!isHostile(a, o)) continue;
      const ob = monsters.get(o.id)?.brain ?? bosses.get(o.id)?.brain;
      bodies.push({ x: o.pos.x, z: o.pos.z, threat: !!ob && ob.attacking && ob.targetId === a.id });
      bodyActors.push(o);
    }
    const i = pickTarget(a.pos, stick, bodies);
    return i >= 0 ? bodyActors[i] : null;
  }

  function startSwing(ctx: AdventureStepContext, a: AdventureActor, fs: FightState, kind: StrikeInput,
    stick: { x: number; z: number } | null, queuedDir: StickDir | null): void {
    const cost = kind === 'heavy' ? STAMINA.heavy : STAMINA.light;
    if (!spendStaminaSwing(a, fs, cost)) return;
    const t = aimTarget(ctx, a, stick);
    const tfs = t ? fightStateOf(t) : null;
    const dist = t ? Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z) : Infinity;
    const lineYaw = t ? yawTo(a.pos.x, a.pos.z, t.pos.x, t.pos.z) : a.facingYaw;
    const dir = queuedDir ?? stickDirTo(stick, lineYaw);
    const air = !!(t && tfs && tfs.airSec > 0 && Math.abs(t.pos.y - a.pos.y) <= AIR.verticalReachM);
    const move = pressString(fs.book, kind, dir, fs.localSec, {
      air, airborne: !air && a.state === 'air', close: dist < 0.9, afterDash: fs.afterDashSec > 0,
    });
    fs.afterDashSec = 0;
    fs.move = move; fs.moveT = 0; fs.moveHitDone = false; fs.moveTarget = t ? t.id : null;
    if (t && !(a.lock && a.lock.hard)) a.lock = { actorId: t.id, sinceSec: ctx.tSec, hard: false };
    // The lunge: close on a far target during the startup (HordeDynamics.lungeFor).
    if (t) {
      const l = lungeFor(Math.max(0, dist - t.radius), MOVES[move.id]);
      if (l > 0.05) {
        const v = l / Math.max(0.05, move.startupSec);
        requestPlanarVel(a, Math.sin(lineYaw) * v, Math.cos(lineYaw) * v);
        fs.moveLockSec = Math.max(fs.moveLockSec, move.startupSec);
      }
    }
  }

  // ── 4. a swing's hit ──────────────────────────────────────────────────────────────────────────────────────────
  function resolveSwing(ctx: AdventureStepContext, a: AdventureActor, fs: FightState, move: AdventureMove): void {
    const target = fs.moveTarget ? ctx.world.actors.get(fs.moveTarget) : undefined;
    const aimYaw = target ? yawTo(a.pos.x, a.pos.z, target.pos.x, target.pos.z) : a.facingYaw;
    const half = (move.arcDeg * Math.PI) / 360;
    const vReach = move.air ? AIR.verticalReachM : 1.6;
    hits.length = 0;
    let primary: AdventureActor | null = null, primaryD = Infinity;
    for (const o of ctx.world.near(a.pos, move.range + 3)) {
      if (!isHostile(a, o)) continue;
      const d = Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
      if (d - o.radius > move.range) continue;
      if (Math.abs(o.pos.y - a.pos.y) > vReach + o.height * 0.5) continue;
      if (d > 0.3 && Math.abs(wrap(yawTo(a.pos.x, a.pos.z, o.pos.x, o.pos.z) - aimYaw)) > half) continue;
      hits.push(o);
      const score = o === target ? -1 : d;
      if (score < primaryD) { primaryD = score; primary = o; }
    }
    if (!primary) return;
    // A narrow strike hits one body; a wide one (a sweep, a spin) everything in its arc, at most six.
    const wide = move.arcDeg >= 150;
    const ratings = ratingsFrom(a.stats.attrs ?? {});
    if (!wide) { hits.length = 0; hits.push(primary); }
    let n = 0;
    for (const o of hits) {
      if (n++ >= 6) break;
      resetHitSpec(spec);
      spec.base = move.dmg; spec.source = 'strike'; spec.via = move.id; spec.staggerSec = move.staggerSec;
      spec.knockbackM = move.knockbackM; spec.launch = move.launch; spec.slam = move.slam; spec.air = move.air;
      spec.finisher = move.ender; spec.fromX = a.pos.x; spec.fromZ = a.pos.z;
      spec.element = a.fusion.active ? (a.fusion.element ?? a.stats.element) : null;
      if (o === primary) {
        if (fs.counterSec > 0) { spec.mult *= GUARD.riposteMult; fs.counterSec = 0; }
        fs.landed.push(move.route);
        if (fs.landed.length > 3) fs.landed.shift();
        const route = routeFor(fs.landed, ratings);
        if (route) {
          spec.mult *= route.payoff;
          if (route.ender === 'launch') spec.launch = true;
          spec.finisher = true;
          spec.via = `${move.id}+route:${route.id}`;
        }
        const lk = a.lock;
        if (lk && lk.actorId === o.id && lk.part) {
          const wp = bosses.get(o.id)?.weakPoint(lk.part);
          if (wp) { spec.part = lk.part; spec.partMult = wp.damageMult; spec.poiseMult *= wp.poiseMult; }
        }
        const ev = applyHit(ctx.bus, ctx.tSec, a, o, spec);
        if (!ev || ev.outcome !== 'hit') fs.landed.pop();
        else if (route) fs.landed.length = 0;
      } else {
        applyHit(ctx.bus, ctx.tSec, a, o, spec);
      }
    }
  }

  function advanceSwing(ctx: AdventureStepContext, a: AdventureActor, fs: FightState, adt: number): void {
    const move = fs.move;
    if (!move) return;
    fs.moveT += adt;
    if (!fs.moveHitDone && fs.moveT >= move.startupSec) {
      fs.moveHitDone = true;
      resolveSwing(ctx, a, fs, move);
      if (fs.move !== move) return;   // parried or staggered by the answer
    }
    const pastCancel = fs.moveT >= move.cancelAtSec;
    const done = fs.moveT >= swingSec(move);
    if ((pastCancel && fs.queue.pending) || done) {
      const q = pastCancel ? fs.queue.take(fs.localSec) : null;
      fs.move = null;
      if (a.lock && !a.lock.hard) a.lock = null;
      if (q) startSwing(ctx, a, fs, q.btn === 'Y' ? 'heavy' : 'light', null, q.dir);
    }
  }

  // ── 3. monsters and bosses ────────────────────────────────────────────────────────────────────────────────────
  function stepBrain(ctx: AdventureStepContext, a: AdventureActor, brain: MonsterBrain, input: MoveInput, dt: number,
    rt: { lungeStop: boolean }): void {
    const scale = ctx.timeScaleOf(a.id);
    const adt = dt * scale;
    const was = brain.targetId;
    const ev = brain.step(a, ctx.world, adt, input, tokens);
    if (brain.targetId !== was) a.lock = brain.targetId ? { actorId: brain.targetId, sinceSec: ctx.tSec, hard: false } : null;
    const target = brain.targetId ? ctx.world.actors.get(brain.targetId) : undefined;
    const atk = brain.attack;
    if (target && atk && brain.attacking) {
      // The perfect-dodge read: when this swing lands, in the target's own seconds; only a swing that can reach
      // counts (RivalCombatBrain.threatLandsIn: a whiff already out of range is not a dodge read).
      const reach = atk.kind === 'projectile' || atk.kind === 'nova' ? atk.range : atk.range + target.radius;
      const dist = Math.hypot(target.pos.x - a.pos.x, target.pos.z - a.pos.z);
      const travel = atk.kind === 'projectile' ? dist / Math.max(0.1, atk.projectileSpeed ?? 10) : 0;   // a bolt still has to fly
      const lands = threatLandsIn(dist, reach, (brain.secToLand + travel) / Math.max(1e-3, scale));
      if (lands >= 0) {
        const tfs = fightStateOf(target);
        tfs.incomingNext = Math.min(tfs.incomingNext, lands * ctx.timeScaleOf(target.id));
      }
    }
    // A lunge through the strike, until it lands.
    if (atk && atk.lungeSpeed && brain.phase === 'strike') {
      const v = ev === 'land' || rt.lungeStop ? 0 : atk.lungeSpeed;
      requestPlanarVel(a, brain.lineX * v, brain.lineZ * v);
      if (ev === 'land') rt.lungeStop = true;
    } else rt.lungeStop = false;
    if (ev === 'land' && atk) landMonsterAttack(ctx, a, brain, atk);
  }

  function landMonsterAttack(ctx: AdventureStepContext, a: AdventureActor, brain: MonsterBrain, atk: MonsterAttack): void {
    const blockable = atk.blockable ?? atk.kind !== 'nova';
    const parryable = atk.parryable ?? (atk.kind === 'melee' || atk.kind === 'dive');
    resetHitSpec(spec);
    spec.base = atk.damage; spec.source = 'strike'; spec.element = elementOf(a); spec.via = atk.id;
    spec.staggerSec = atk.staggerSec; spec.knockbackM = atk.knockbackM; spec.launch = !!atk.launch;
    spec.poiseMult = atk.poiseMult ?? 1; spec.blockable = blockable; spec.parryable = parryable;
    spec.fromX = a.pos.x; spec.fromZ = a.pos.z;
    if (atk.kind === 'projectile') {
      const t = brain.targetId ? ctx.world.actors.get(brain.targetId) : undefined;
      const from = { x: a.pos.x + brain.lineX * (a.radius + 0.3), y: a.pos.y + a.height * 0.6, z: a.pos.z + brain.lineZ * (a.radius + 0.3) };
      const ty = t ? t.pos.y + t.height * 0.5 : from.y;
      const dx = brain.lineX, dz = brain.lineZ;
      const flat = t ? Math.hypot(t.pos.x - from.x, t.pos.z - from.z) : 10;
      projectiles.fire(a, from, { x: dx, y: (ty - from.y) / Math.max(1, flat), z: dz }, atk.projectileSpeed ?? 10, atk.range,
        atk.projectileRadius ?? 0.3, spec);
      return;
    }
    const half = (atk.arcDeg * Math.PI) / 360;
    const lineYaw = Math.atan2(brain.lineX, brain.lineZ);
    const vReach = atk.verticalReachM ?? 1.6;
    for (const o of ctx.world.near(a.pos, atk.range + 3)) {
      if (!isHostile(a, o)) continue;
      const d = Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
      if (d - o.radius > atk.range) continue;
      if (Math.abs(o.pos.y - a.pos.y) > vReach + o.height * 0.5) continue;
      if (atk.kind !== 'nova' && d > 0.3 && Math.abs(wrap(yawTo(a.pos.x, a.pos.z, o.pos.x, o.pos.z) - lineYaw)) > half) continue;
      applyHit(ctx.bus, ctx.tSec, a, o, spec);
    }
  }

  // ── 5. upkeep ─────────────────────────────────────────────────────────────────────────────────────────────────
  function upkeepLock(ctx: AdventureStepContext, a: AdventureActor, fs: FightState, adt: number): void {
    const lk = a.lock;
    if (!lk || !lk.hard) return;
    const r = lockHolds(a, lk, ctx.world, fs.lockLostSec, adt);
    fs.lockLostSec = r.lostSec;
    if (r.breakReason) setLock(ctx, a, null);
  }

  const system: CombatSystem = {
    id: 'adventure.combat',
    aiInputs,
    partsOf,
    projectiles,

    registerMonster(actor, def) {
      const fs = fightStateOf(actor);
      fs.weight = def.weight;
      fs.hyperArmor = def.hyperArmor;
      const input = neutralInput();
      const side = monsters.size % 2 === 0 ? 1 : -1;
      monsters.set(actor.id, { def, brain: new MonsterBrain(def, def.attacks, rng, side), input, lungeStop: false });
      aiInputs.set(actor.id, input);
    },

    registerBoss(actor, def) {
      const fs = fightStateOf(actor);
      fs.weight = 'heavy';
      fs.hyperArmor = true;
      const rt = Object.assign(new BossRuntime(def, rng), { input: neutralInput(), lungeStop: false });
      const p0 = def.phases[0];
      if (p0.element !== undefined) fs.element = p0.element;
      bosses.set(actor.id, rt);
      aiInputs.set(actor.id, rt.input);
    },

    unregister(id) {
      const m = monsters.get(id) ?? bosses.get(id);
      if (m) m.brain.interrupt(tokens);
      monsters.delete(id); bosses.delete(id); aiInputs.delete(id);
    },

    telegraphOf(id) {
      const brain = monsters.get(id)?.brain ?? bosses.get(id)?.brain;
      if (!brain || !brain.attack || !brain.attacking) return null;
      const a = brain.attack;
      return {
        attackId: a.id, label: a.label, kind: a.kind, phase: brain.phase === 'windup' ? 'windup' : 'strike',
        tellSec: a.tellSec, t01: brain.phase === 'windup' ? Math.min(1, brain.t / a.tellSec) : 1,
        lineX: brain.lineX, lineZ: brain.lineZ, range: a.range, arcDeg: a.arcDeg,
      };
    },

    bossPhaseOf(id) { const b = bosses.get(id); return b ? b.phase + 1 : 0; },

    takeWarp(id) {
      // Look the actor up through any state we hold; a warp is only ever pending on an actor we have touched.
      const pending = warpOf.get(id);
      if (!pending || !pending.subPending) return null;
      pending.subPending = false;
      return { ...pending.subSpot };
    },

    moveLockOf(id) { return warpOf.get(id)?.moveLockSec ?? 0; },

    step(ctx, dt) {
      const world = ctx.world;
      for (const a of world.actors.values()) {
        const fs = fightStateOf(a);
        warpOf.set(a.id, fs);
        tickTimers(a, fs, dt * ctx.timeScaleOf(a.id), dt);
      }
      for (const [id, input] of ctx.inputs) {
        if (monsters.has(id) || bosses.has(id)) continue;
        const a = world.actors.get(id);
        if (a) handleInput(ctx, a, input, dt);
      }
      for (const [id, rt] of monsters) {
        const a = world.actors.get(id);
        if (a) stepBrain(ctx, a, rt.brain, rt.input, dt, rt);
      }
      for (const [id, rt] of bosses) {
        const a = world.actors.get(id);
        if (!a) continue;
        rt.beatSec = Math.max(0, rt.beatSec - dt);
        if (a.iframeSec > 0 && fightStateOf(a).iframeCause === 'phase') { rt.input.move.x = 0; rt.input.move.y = 0; continue; }
        stepBrain(ctx, a, rt.brain, rt.input, dt, rt);
      }
      for (const a of world.actors.values()) {
        const fs = fightStateOf(a);
        const adt = dt * ctx.timeScaleOf(a.id);
        const m = stepDodgeMotion(a, fs, world, adt);
        if (m === 'arrived') fs.afterDashSec = DASH_ATTACK_SEC;
        advanceSwing(ctx, a, fs, adt);
        upkeepLock(ctx, a, fs, adt);
      }
      projectiles.step(ctx, dt);
      for (const [id, rt] of bosses) {
        const a = world.actors.get(id);
        if (a) rt.checkPhase(a, ctx.bus, tokens);
      }
      // Camera hints for the local player: a boss's phase beat over a boss lock over a lock.
      const me = localId(ctx);
      const mine = me ? world.actors.get(me) : undefined;
      for (const [id, rt] of bosses) if (rt.beatSec > 0) { hintBeat.targetId = id; ctx.hint(hintBeat); }
      if (mine && mine.lock && mine.lock.hard) {
        const t = world.actors.get(mine.lock.actorId);
        if (t && t.kind === 'boss') { hintBoss.targetId = t.id; ctx.hint(hintBoss); }
        hintLock.targetId = mine.lock.actorId; ctx.hint(hintLock);
      }
    },

    dispose() {
      monsters.clear(); bosses.clear(); aiInputs.clear(); projectiles.clear(); warpOf.clear();
    },
  };
  return system;
}

export { ADVENTURE_MOVES };
