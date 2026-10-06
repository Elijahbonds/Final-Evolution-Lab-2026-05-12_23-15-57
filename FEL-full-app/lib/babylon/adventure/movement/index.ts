/**
 * The Adventure's movement system (lane A1; docs/ADVENTURE-PLAN.md "movement/index.ts"): run, spin jump, homing dash,
 * wall run, rail grind, free flight and cruise, and riding, for every body in the world, one fixed step at a time.
 *
 *   const movement = createMovementSystem({ mountCanFly: (id) => canFly(id) });   // A4 composes it in AdventureHost
 *   movement.step(ctx, 1 / SIM_HZ);
 *
 * WHAT IT WRITES (contracts.ts field ownership): pos, vel, facingYaw, grounded, state, stateSec, rail, ridingId,
 * wantsFlight — and it SPENDS energy for fused flight (spendPool). It reads hp and stunSec (A2), fusion (A3) and impulse
 * (A2: applied once, then zeroed — the one A2 field the contract hands A1 to clear).
 *
 * ORDER INSIDE A STEP. Bodies that carry nobody step first (mounts included, driven by their rider's stick), then
 * riders sit on their mounts. So a rider is always exactly where its mount ended the tick.
 *
 * Pure: no Babylon, no DOM, no clock (ctx.tSec), no Math.random (a seed). The per-actor working state lives in
 * BodyState records made once; a tick allocates nothing for a body on the ground, in the air, on a rail or in flight.
 */

import type {
  ActorId, AdventureActor, AdventureStepContext, AdventureSystem, FlightParams, FlightSource, MoveInput, MovementState,
} from '../contracts';
import { NEUTRAL_MOVE_INPUT } from '../contracts';
import { DEFAULT_FLIGHT, DEFAULT_FLIGHT_EXTRA, type FlightExtra, type WorldBounds } from '../flight/params';
import { canTakeOff, flightSpeedMult } from '../flight/gate';
import { dropFromFlight, takeOff } from '../flight/common';
import { stepFree } from '../flight/free';
import { stepCruise } from '../flight/cruise';
import { buildRailIndex, type RailIndex } from '../rails/railMath';
import { enterGrind, exitGrind, findRailCatch, railCatch, stepGrind } from '../rails/grind';
import { integrateAir, startAirDash, tryLand } from './air';
import { newBody, type BodyState, type MountSpec, type StepEnv } from './body';
import { groundJump, leaveGround, stepGround } from './ground';
import { pushHint } from './hints';
import { pickHomingTarget, startHoming, stepHoming } from './homing';
import { wish, wishInto, type Wish } from './input';
import { isFiniteVec } from './math';
import { movementFeelFor, movementParams, type MovementParams } from './params';
import { defaultMountSpec, dismount, glueRider, mount, mountReason } from './riding';
import { enterState, forcedState, settleState } from './state';
import { stepWallRun, tryWallRun } from './wallrun';

export { DEFAULT_FLIGHT } from '../flight/params';
export { DEFAULT_MOVEMENT, movementParams, movementFeelFor } from './params';
export { mountSpecFromPartner, defaultMountSpec } from './riding';
export type { MountSpec } from './body';

export interface MovementSystemOptions {
  /** The plan's signature: can the mount fly? One answer for every mount, or per mount id. */
  mountCanFly?: boolean | ((mountId: ActorId) => boolean);
  /** A mount's carry and pace (riding.mountSpecFromPartner). Without it: defaultMountSpec(mountCanFly). */
  mountSpecOf?: (mountId: ActorId) => MountSpec | null;
  params?: { [K in keyof MovementParams]?: Partial<MovementParams[K]> };
  flight?: Partial<FlightParams>;
  flightExtra?: Partial<FlightExtra>;
  /** The world's sides for flight (contract request: AdventureWorld.bounds). */
  bounds?: WorldBounds | null;
  /** Whose camera hints to push. Default: the first actor of kind 'player'. */
  localId?: ActorId | null;
  /** Bodies another system moves (this one leaves them alone). */
  skip?: (a: AdventureActor) => boolean;
  /** The seed for every body's generator (the rail balance's wander). */
  seed?: number;
}

/** What a view (or a test, or A2's spin-attack check) can read about a body's traversal. Refreshed by inspect(). */
export interface MovementTelemetry {
  id: ActorId;
  state: MovementState;
  /** The speed that matters in this state: run, rail, or airspeed (m/s), and it over that state's top. */
  speed: number;
  speed01: number;
  flowTier: number;
  flow01: number;
  /** In the spin ball (a jump, a homing dash): a damaging body for A2. */
  spinning: boolean;
  skidding: boolean;
  airDashing: boolean;
  homingTargetId: ActorId | null;
  homingChain: number;
  rail: { lean: number; needle: number; turn: number; tricking: boolean; trickChain: number; switching: boolean };
  flight: { mode: 'free' | 'cruise'; bank: number; pitch: number; glide: boolean; dashing: boolean; boomAtSec: number | null; reserve01: number };
  /** A mount's flight stamina 0..1, or null for a body that is not a mount. */
  mountStamina01: number | null;
  jumpedAt: number;
  landedAt: number;
}

export interface MovementSystem extends AdventureSystem {
  /** The body's traversal telemetry (one object per body, refreshed by this call). Null for a body never stepped. */
  inspect(id: ActorId): Readonly<MovementTelemetry> | null;
  /** The rail network as baked for the current world (rebuilt when world.rails changes identity). */
  railIndex(): RailIndex | null;
  /** The working record of a body (tests and the debug overlay). */
  bodyOf(id: ActorId): Readonly<BodyState> | null;
  /** Forget a body (respawn, a net handover): the next step rebuilds it from the actor. */
  reset(id?: ActorId): void;
  readonly params: MovementParams;
  readonly flight: FlightParams;
}

const NEUTRAL: MoveInput = NEUTRAL_MOVE_INPUT as MoveInput;
const ZERO_WISH: Wish = wish();

function newTelemetry(id: ActorId): MovementTelemetry {
  return {
    id, state: 'ground', speed: 0, speed01: 0, flowTier: 0, flow01: 0, spinning: false, skidding: false,
    airDashing: false, homingTargetId: null, homingChain: 0,
    rail: { lean: 0, needle: 0, turn: 0, tricking: false, trickChain: 0, switching: false },
    flight: { mode: 'free', bank: 0, pitch: 0, glide: false, dashing: false, boomAtSec: null, reserve01: 0 },
    mountStamina01: null, jumpedAt: -Infinity, landedAt: -Infinity,
  };
}

export function createMovementSystem(opts: MovementSystemOptions = {}): MovementSystem {
  const params = movementParams(opts.params ?? {});
  const flight: FlightParams = {
    ...DEFAULT_FLIGHT, ...opts.flight,
    drainPerSec: { ...DEFAULT_FLIGHT.drainPerSec, ...opts.flight?.drainPerSec },
  };
  const fx: FlightExtra = { ...DEFAULT_FLIGHT_EXTRA, ...opts.flightExtra };
  const seed = opts.seed ?? 0x5eed;
  const bodies = new Map<ActorId, BodyState>();
  const telemetry = new Map<ActorId, MovementTelemetry>();
  const feelBand = new Map<ActorId, string>();
  const riderOf = new Map<ActorId, AdventureActor>();
  const w: Wish = wish();
  const caught = railCatch();
  /** The ground's catch: the air's window, tighter (a rail at the feet, not one beside the runner). [TUNE] 0.6 m */
  const groundRail = { ...params.rail, catchReach: Math.min(0.6, params.rail.catchReach) };
  const lastGood = { x: 0, y: 0, z: 0 };
  let rails: RailIndex | null = null;

  const canFly = (id: ActorId): boolean =>
    typeof opts.mountCanFly === 'function' ? opts.mountCanFly(id) : !!opts.mountCanFly;
  const specOf = (id: ActorId): MountSpec | null => {
    if (opts.mountSpecOf) return opts.mountSpecOf(id);
    return defaultMountSpec(canFly(id));
  };

  const env: StepEnv = {
    tSec: 0, world: null as unknown as StepEnv['world'], bus: null as unknown as StepEnv['bus'], p: params, flight, fx,
    rails: null as unknown as RailIndex, bounds: opts.bounds ?? null, hint: null,
  };

  function bodyFor(a: AdventureActor): BodyState {
    let b = bodies.get(a.id);
    if (!b) {
      b = newBody(a.id, seed);
      b.heading = a.facingYaw;
      b.speed = Math.hypot(a.vel.x, a.vel.z);
      bodies.set(a.id, b);
    }
    const key = `${a.stats.prqBand}|${a.stats.attrs?.mental ?? ''}`;
    if (feelBand.get(a.id) !== key) { b.feel = movementFeelFor(a.stats); feelBand.set(a.id, key); }
    return b;
  }

  /** An A2 impulse: added to the velocity once, then cleared. A launch takes a body off the ground or a rail. */
  function applyImpulse(a: AdventureActor, b: BodyState): void {
    const im = a.impulse!;
    a.impulse = null;
    if (!isFiniteVec(im)) return;
    if (a.state === 'grind') exitGrind(a, b, 'hit', env);
    if (a.state === 'wallrun') { b.wall = null; enterState(a, 'air', env.bus); }
    if (b.homingId) { const id = b.homingId; b.homingId = null; env.bus.emit('homing', { actorId: a.id, targetId: id, hit: false }); }
    if (a.state === 'flight' && b.fl.mode === 'cruise') { b.fl.mode = 'free'; b.fl.bank = 0; }
    if (a.state === 'ground') {
      a.vel.x = Math.sin(b.heading) * b.speed; a.vel.z = Math.cos(b.heading) * b.speed;
    }
    a.vel.x += im.x; a.vel.y += im.y; a.vel.z += im.z;
    if (a.state === 'ground') {
      b.speed = Math.hypot(a.vel.x, a.vel.z);
      if (b.speed > 0.1) b.heading = Math.atan2(a.vel.x, a.vel.z);
      if (im.y > 0.5) { leaveGround(a, b, env); b.coyote = Infinity; }
    }
  }

  /** No control (stunned, down): the body keeps moving, slows, falls and lands. */
  function passive(a: AdventureActor, b: BodyState, dt: number): void {
    if (a.grounded) {
      const st = a.state;
      stepGround(a, b, NEUTRAL, ZERO_WISH, env, dt);
      if (a.state !== st) enterState(a, st, env.bus);   // a ledge does not end a stun
      if (!a.grounded) b.coyote = Infinity;
      return;
    }
    integrateAir(a, b, NEUTRAL, ZERO_WISH, env, dt);
    const gy = env.world.groundY(a.pos.x, a.pos.z);
    if (gy !== null && a.pos.y <= gy && a.vel.y <= 0) {
      a.pos.y = gy; a.vel.y = 0; a.grounded = true;
      b.speed = Math.hypot(a.vel.x, a.vel.z);
      if (b.speed > 0.1) b.heading = Math.atan2(a.vel.x, a.vel.z);
    }
  }

  function leaveForced(a: AdventureActor, b: BodyState): void {
    if (a.state === 'grind') exitGrind(a, b, 'hit', env);
    if (a.state === 'flight') dropFromFlight(a, b, env);
    if (b.wall) b.wall = null;
    if (b.homingId) { const id = b.homingId; b.homingId = null; env.bus.emit('homing', { actorId: a.id, targetId: id, hit: false }); }
    a.wantsFlight = false;
    b.spinning = false; b.rising = false; b.airDashT = 0;
  }

  function flightStep(a: AdventureActor, b: BodyState, inp: MoveInput, dt: number, source: FlightSource, spec: MountSpec | null): void {
    const mult = flightSpeedMult(source, a.fusion.tier, spec?.flySpeedMult ?? 1, fx, b.feel.flight);
    if (b.fl.mode === 'cruise') stepCruise(a, b, inp, env, dt, source, mult);
    else stepFree(a, b, inp, w, env, dt, source, mult);
    if (a.state === 'flight') {
      if (b.fl.mode === 'cruise') pushHint(env, 'cruise', a.id, 8 + 12 * Math.min(1, b.fl.speed / (flight.cruiseSpeed * mult)));
      else pushHint(env, 'flight', a.id, 4 * Math.min(1, Math.hypot(a.vel.x, a.vel.y, a.vel.z) / (flight.freeSpeed * mult)));
    }
  }

  /** The air's one button, in priority order: coyote jump, homing, wall run, take off, air dash, else buffer it. */
  function airPress(a: AdventureActor, b: BodyState, source: FlightSource | null, isMount: boolean, rider: AdventureActor | null): void {
    if (b.coyote <= params.air.coyoteSec) { groundJump(a, b, env); return; }
    if (!isMount) {
      const t = pickHomingTarget(a, env.world, params.homing);
      if (t) { startHoming(a, b, t); return; }
      if (tryWallRun(a, b, env)) return;
    }
    if (source) {
      takeOff(a, b, env);
      if (rider) rider.wantsFlight = true;
      return;
    }
    if (!isMount && startAirDash(a, b, w, env)) return;
    b.jumpBuffer = params.air.jumpBufferSec;
  }

  function stepBody(a: AdventureActor, ctx: AdventureStepContext, dt: number): void {
    const b = bodyFor(a);
    a.stateSec += dt;
    if (b.recatchT > 0) b.recatchT = Math.max(0, b.recatchT - dt);
    const rider = riderOf.get(a.id) ?? null;
    const isMount = !!rider;
    const spec = isMount ? specOf(a.id) : null;
    const inp = (rider ? ctx.inputs.get(rider.id) : ctx.inputs.get(a.id)) ?? NEUTRAL;
    wishInto(inp, params.ground.deadzone, w);
    lastGood.x = a.pos.x; lastGood.y = a.pos.y; lastGood.z = a.pos.z;

    if (a.impulse) applyImpulse(a, b);

    // Another lane's field forces the state: down or stunned.
    const forced = forcedState(a);
    if (forced === 'ko' || forced === 'stunned') {
      if (a.state !== forced) { leaveForced(a, b); enterState(a, forced, env.bus); }
      passive(a, b, dt);
      return;
    }
    if (a.state === 'ko' || a.state === 'stunned' || a.state === 'riding') enterState(a, settleState(a.grounded), env.bus);

    // The mount verb (a body that carries nobody, beside its partner).
    if (!isMount && inp.fuse && a.partnerId && (a.state === 'ground' || a.state === 'air')) {
      const m = env.world.actors.get(a.partnerId);
      const mSpec = m ? specOf(m.id) : null;
      const taken = m ? riderOf.get(m.id)?.id ?? null : null;
      if (m && mountReason(a, m, mSpec, params.ride.mountReach, taken) === 'ok') {
        mount(a, b, m, env);
        riderOf.set(m.id, a);
        glueRider(a, m, mSpec!.seatHeight);
        return;
      }
    }

    // Flight's source: the fusion for a body on its own, the mount's wings for a body carrying a rider.
    if (isMount && spec && spec.canFly && b.mountStaminaMax === 0) { b.mountStaminaMax = spec.staminaMax; b.mountStamina = spec.staminaMax; }
    const source: FlightSource | null = isMount
      ? (spec?.canFly && a.stats.hp.cur > 0 ? 'mount' : null)
      : canTakeOff(a, false);
    const groundTop = isMount && spec ? spec.groundSpeed * b.feel.run : undefined;

    switch (a.state) {
      case 'flight': {
        if (!source) { dropFromFlight(a, b, env); if (rider) rider.wantsFlight = false; break; }
        flightStep(a, b, inp, dt, source, spec);
        break;
      }
      case 'grind':
        stepGrind(a, b, inp, w, env, dt);
        break;
      case 'wallrun':
        stepWallRun(a, b, inp, env, dt);
        break;
      case 'ground': {
        b.coyote = 0;
        if (inp.jump || b.jumpBuffer > 0) { groundJump(a, b, env); integrateAir(a, b, inp, w, env, dt); break; }
        stepGround(a, b, inp, w, env, dt, groundTop);
        // A low rail run onto from the ground (a tighter window than the air's catch).
        if (!isMount && a.state === 'ground' && b.speed > 2 && b.recatchT <= 0) {
          if (findRailCatch(env.rails, a.pos, a.vel, a.facingYaw, groundRail, b.recatchId, caught)) enterGrind(a, b, caught, env);
        }
        break;
      }
      case 'air':
      default: {
        if (b.homingId) { stepHoming(a, b, env, dt); break; }
        if (inp.jump) airPress(a, b, source, isMount, rider);
        if (a.state !== 'air') break;
        if (b.homingId) { stepHoming(a, b, env, dt); break; }
        if (inp.dash && !isMount && b.airDashT <= 0) startAirDash(a, b, w, env);
        integrateAir(a, b, inp, w, env, dt);
        if (!isMount && findRailCatch(env.rails, a.pos, a.vel, a.facingYaw, params.rail, b.recatchT > 0 ? b.recatchId : null, caught)) {
          enterGrind(a, b, caught, env);
          break;
        }
        if (tryLand(a, b, env) && b.jumpBuffer > 0) groundJump(a, b, env);
        break;
      }
    }

    // A mount's wings rest on the ground (FlightController: +6/s while not flying).
    if (b.mountStaminaMax > 0 && a.state !== 'flight') {
      b.mountStamina = Math.min(b.mountStaminaMax, b.mountStamina + fx.mountRegenPerSec * dt);
    }
    // The last line of defence: a non-finite position never leaves this system.
    if (!isFiniteVec(a.pos) || !isFiniteVec(a.vel)) {
      a.pos.x = lastGood.x; a.pos.y = lastGood.y; a.pos.z = lastGood.z;
      a.vel.x = 0; a.vel.y = 0; a.vel.z = 0; b.speed = 0;
    }
  }

  function stepRider(r: AdventureActor, ctx: AdventureStepContext, dt: number): void {
    const b = bodyFor(r);
    r.stateSec += dt;
    const m = env.world.actors.get(r.ridingId!);
    const inp = ctx.inputs.get(r.id) ?? NEUTRAL;
    const forced = !(r.stats.hp.cur > 0) ? 'ko' : r.stunSec > 0 ? 'stunned' : null;
    const mountDown = !m || !(m.stats.hp.cur > 0) || m.state === 'ko' || m.stunSec > 0;
    const thrown = !!r.impulse && Math.hypot(r.impulse.x, r.impulse.y, r.impulse.z) >= params.ride.throwOffImpulse;
    if (forced || mountDown || thrown || inp.fuse) {
      dismount(r, b, m, env);
      if (r.impulse) applyImpulse(r, b);
      if (forced) enterState(r, forced, env.bus);
      return;
    }
    r.impulse = null;   // a small knock is absorbed by the mount
    if (r.state !== 'riding') enterState(r, 'riding', env.bus);
    const spec = specOf(m!.id) ?? defaultMountSpec(false);
    glueRider(r, m!, spec.seatHeight);
    r.wantsFlight = m!.state === 'flight';
    b.speed = Math.hypot(r.vel.x, r.vel.z);
    if (env.hint) {
      const mb = bodies.get(m!.id);
      if (m!.state === 'flight' && mb?.fl.mode === 'cruise') pushHint(env, 'cruise', r.id, 8 + 12 * Math.min(1, mb.fl.speed / flight.cruiseSpeed));
      else if (m!.state === 'flight') pushHint(env, 'flight', r.id, 2);
      else pushHint(env, 'ride', r.id, 3 * Math.min(1, b.speed / Math.max(1, spec.groundSpeed)));
    }
  }

  function inspect(id: ActorId): Readonly<MovementTelemetry> | null {
    const b = bodies.get(id);
    const a = env.world?.actors.get(id);
    if (!b || !a) return null;
    let t = telemetry.get(id);
    if (!t) { t = newTelemetry(id); telemetry.set(id, t); }
    t.state = a.state;
    const g = params.ground;
    if (a.state === 'grind' && a.rail) { t.speed = a.rail.speed; t.speed01 = a.rail.speed / (params.rail.topSpeed * b.feel.grind); }
    else if (a.state === 'flight') {
      t.speed = b.fl.mode === 'cruise' ? b.fl.speed : Math.hypot(a.vel.x, a.vel.y, a.vel.z);
      t.speed01 = t.speed / (b.fl.mode === 'cruise' ? flight.cruiseSpeed : flight.freeSpeed);
    } else { t.speed = Math.hypot(a.vel.x, a.vel.z); t.speed01 = t.speed / (g.flowTopSpeeds[3] * b.feel.run); }
    t.flowTier = b.flow.tier; t.flow01 = b.flow.frac;
    t.spinning = b.spinning; t.skidding = b.skidding; t.airDashing = b.airDashT > 0;
    t.homingTargetId = b.homingId; t.homingChain = b.homingChain;
    t.rail.lean = b.lean; t.rail.needle = b.balance.needle; t.rail.turn = b.turn; t.rail.tricking = b.trickT > 0;
    t.rail.trickChain = b.trickChain; t.rail.switching = b.hopT > 0;
    t.flight.mode = b.fl.mode; t.flight.bank = b.fl.bank; t.flight.pitch = b.fl.pitch; t.flight.glide = b.fl.glide;
    t.flight.dashing = b.fl.dashT > 0; t.flight.boomAtSec = b.fl.boomAtSec;
    t.flight.reserve01 = a.state === 'flight'
      ? (b.mountStaminaMax > 0 && riderOf.has(id) ? b.mountStamina / b.mountStaminaMax : a.stats.energy.cur / Math.max(1, a.stats.energy.max))
      : 1;
    t.mountStamina01 = b.mountStaminaMax > 0 ? b.mountStamina / b.mountStaminaMax : null;
    t.jumpedAt = b.jumpedAt; t.landedAt = b.landedAt;
    return t;
  }

  return {
    id: 'adventure.movement',
    params,
    flight,
    step(ctx: AdventureStepContext, dt: number): void {
      const world = ctx.world;
      if (!rails || rails.net !== world.rails) rails = buildRailIndex(world.rails);
      env.tSec = ctx.tSec; env.world = world; env.bus = ctx.bus; env.rails = rails;
      let localId = opts.localId ?? null;
      riderOf.clear();
      for (const a of world.actors.values()) {
        if (!localId && opts.localId === undefined && a.kind === 'player') localId = a.id;
        if (a.ridingId) riderOf.set(a.ridingId, a);
      }
      for (const a of world.actors.values()) {
        if (a.ridingId || opts.skip?.(a)) continue;
        env.hint = a.id === localId ? ctx.hint : null;
        stepBody(a, ctx, dt * ctx.timeScaleOf(a.id));
      }
      for (const a of world.actors.values()) {
        if (!a.ridingId || opts.skip?.(a)) continue;
        env.hint = a.id === localId ? ctx.hint : null;
        stepRider(a, ctx, dt * ctx.timeScaleOf(a.id));
      }
      env.hint = null;
    },
    inspect,
    railIndex: () => rails,
    bodyOf: (id) => bodies.get(id) ?? null,
    reset(id?: ActorId): void {
      if (id === undefined) { bodies.clear(); telemetry.clear(); feelBand.clear(); return; }
      bodies.delete(id); telemetry.delete(id); feelBand.delete(id);
    },
    dispose(): void { bodies.clear(); telemetry.clear(); feelBand.clear(); riderOf.clear(); rails = null; },
  };
}
