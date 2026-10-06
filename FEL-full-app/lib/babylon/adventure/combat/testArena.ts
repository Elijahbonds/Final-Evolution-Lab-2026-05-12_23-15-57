/**
 * A headless arena for A2's scripted simulations: a fake `AdventureWorld`, a fake host (the bus, the time scale, the
 * camera hints, the fixed step) and a STAND-IN for A1's movement, built only from `contracts.ts` (the plan's rule: a
 * lane tests against fakes built from the contracts, never another lane's code).
 *
 * The stand-in movement is deliberately simple and does exactly what the contract says A1 does with A2's fields: it
 * adds `impulse` to the velocity and zeroes it, turns `stunSec` into 'stunned' and zero HP into 'ko', integrates under
 * gravity, and steers from the stick when nothing holds the body. It is a fake, not A1: the numbers (6 m/s, 19.5 m/s²)
 * are the assumptions A2's tuning already states. Not used by the game; A4 may use it for a headless smoke.
 */

import {
  createAdventureBus, neutralInput, NO_FUSION, pool, vec3, wishDir, type ActorId, type ActorKind, type AdventureActor,
  type AdventureBus, type AdventureEvents, type AdventureStepContext, type AdventureSystem, type AdventureWorld,
  type CameraHint, type Element, type MoveInput, type TeamId, type Vec3,
} from '../contracts';
import { AIR } from './tuning';

export interface ArenaOptions {
  /** Segments that block line of sight (XZ). */
  blockers?: { a: { x: number; z: number }; b: { x: number; z: number } }[];
  /** The stand-in's run speed for a full stick, m/s. */
  runSpeed?: number;
}

export interface ArenaActorOpts {
  kind?: ActorKind;
  team?: TeamId;
  hp?: number;
  stamina?: number;
  energy?: number;
  poise?: number;
  level?: number;
  element?: Element | null;
  radius?: number;
  height?: number;
  facingYaw?: number;
}

export function makeActor(id: ActorId, pos: Partial<Vec3>, o: ArenaActorOpts = {}): AdventureActor {
  return {
    id, kind: o.kind ?? 'player', team: o.team ?? 0,
    pos: vec3(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0), vel: vec3(), facingYaw: o.facingYaw ?? 0, grounded: true, state: 'ground',
    stateSec: 0, radius: o.radius ?? 0.4, height: o.height ?? 1.8,
    stats: {
      hp: pool(o.hp ?? 100), stamina: pool(o.stamina ?? 100), energy: pool(o.energy ?? 100), poise: pool(o.poise ?? 30),
      special: 0, level: o.level ?? 1, prqBand: 'READY', school: { primary: 'straight', secondary: 'straight', mix: 0 },
      element: o.element ?? null,
    },
    lock: null, stunSec: 0, iframeSec: 0, impulse: null, rail: null, ridingId: null, wantsFlight: false,
    fusion: { ...NO_FUSION }, partnerId: null,
  };
}

type Logged = { [K in keyof AdventureEvents]: AdventureEvents[K][] };

export interface Arena {
  readonly actors: Map<ActorId, AdventureActor>;
  readonly world: AdventureWorld;
  readonly bus: AdventureBus;
  readonly inputs: Map<ActorId, MoveInput>;
  readonly log: Logged;
  readonly hints: CameraHint[];
  tSec: number;
  readonly dt: number;
  add(a: AdventureActor): AdventureActor;
  /** The input an actor sends this step (edges are cleared after each step). */
  input(id: ActorId): MoveInput;
  timeScaleOf(id: ActorId): number;
  /** Systems run in order after the stand-in movement. `aiInputs` maps are merged into the next step's inputs. */
  step(systems: readonly AdventureSystem[], n?: number, opts?: { aiInputs?: ReadonlyMap<ActorId, MoveInput>[]; moveLockOf?: (id: ActorId) => number; takeWarp?: (id: ActorId) => Vec3 | null }): void;
  /** Run until `pred` or `maxSec`. Returns the seconds it took, or Infinity. */
  runUntil(systems: readonly AdventureSystem[], pred: () => boolean, maxSec: number, opts?: Parameters<Arena['step']>[2]): number;
}

const EDGES: (keyof MoveInput)[] = ['jump', 'dash', 'attackLight', 'attackHeavy', 'lock', 'magic', 'partner', 'fuse'];

function segCross(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false;
  const u = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
  const v = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

export function createArena(opts: ArenaOptions = {}): Arena {
  const actors = new Map<ActorId, AdventureActor>();
  const inputs = new Map<ActorId, MoveInput>();
  const blockers = opts.blockers ?? [];
  const runSpeed = opts.runSpeed ?? 6;
  const errors: unknown[] = [];
  const bus = createAdventureBus((e) => errors.push(e));
  const log = {} as Logged;
  const names: (keyof AdventureEvents)[] = ['damage', 'ko', 'state', 'lock', 'spell:cast', 'time:scale', 'boss:phase', 'homing', 'fusion'];
  for (const n of names) {
    (log as Record<string, unknown[]>)[n] = [];
    bus.on(n, (p: unknown) => { (log as Record<string, unknown[]>)[n].push(p); });
  }
  // The host's clock: slow-time slows everyone but the caster (contracts: time:scale).
  let slow: { byId: ActorId; world: number; self: number; left: number } | null = null;
  bus.on('time:scale', (e) => {
    if (e.sec <= 0 || (e.world >= 1 && e.self >= 1)) { if (!slow || slow.byId === e.byId) slow = null; return; }
    slow = { byId: e.byId, world: e.world, self: e.self, left: e.sec };
  });
  const hints: CameraHint[] = [];

  const world: AdventureWorld = {
    groundY: () => 0,
    rails: { id: 'none', segments: [] },
    walls: [],
    actors,
    near(p, r) {
      const out: AdventureActor[] = [];
      for (const a of actors.values()) if (Math.hypot(a.pos.x - p.x, a.pos.z - p.z) <= r) out.push(a);
      return out;
    },
    clear(a, b) {
      for (const w of blockers) if (segCross(a.x, a.z, b.x, b.z, w.a.x, w.a.z, w.b.x, w.b.z)) return false;
      return true;
    },
  };

  const arena: Arena = {
    actors, world, bus, inputs, log, hints, tSec: 0, dt: 1 / 60,
    add(a) { actors.set(a.id, a); return a; },
    input(id) {
      let i = inputs.get(id);
      if (!i) { i = neutralInput(); inputs.set(id, i); }
      return i;
    },
    timeScaleOf(id) {
      if (!slow) return 1;
      return id === slow.byId ? slow.self : slow.world;
    },
    step(systems, n = 1, o = {}) {
      for (let k = 0; k < n; k++) {
        const dt = arena.dt;
        // ── the stand-in for A1 ──
        for (const a of actors.values()) {
          const adt = dt * arena.timeScaleOf(a.id);
          const warp = o.takeWarp?.(a.id);
          if (warp) { a.pos.x = warp.x; a.pos.z = warp.z; }
          const input = inputs.get(a.id);
          const locked = (o.moveLockOf?.(a.id) ?? 0) > 0;
          if (a.impulse) {
            a.vel.x += a.impulse.x; a.vel.y += a.impulse.y; a.vel.z += a.impulse.z;
            a.impulse = null;
          } else if (a.stats.hp.cur > 0 && a.stunSec <= 0 && !locked && input) {
            const w = wishDir(input);
            const sp = a.kind === 'monster' || a.kind === 'boss' ? 9 : runSpeed;
            a.vel.x = w.x * sp; a.vel.z = w.z * sp;
            if (input.ascendHeld && a.pos.y < 6) a.vel.y = Math.max(a.vel.y, 3);
          } else if (!locked) {
            const f = Math.exp(-10 * adt);
            a.vel.x *= f; a.vel.z *= f;
          }
          const hovering = !!input?.ascendHeld;
          if (a.pos.y > 0 || a.vel.y > 0) if (!hovering) a.vel.y -= AIR.gravity * adt;
          a.pos.x += a.vel.x * adt; a.pos.y += a.vel.y * adt; a.pos.z += a.vel.z * adt;
          if (a.pos.y <= 0) { a.pos.y = 0; if (a.vel.y < 0) a.vel.y = 0; }
          a.grounded = a.pos.y <= 0.001;
          const prev = a.state;
          a.state = a.stats.hp.cur <= 0 ? 'ko' : a.stunSec > 0 ? 'stunned' : a.grounded ? 'ground' : 'air';
          a.stateSec = prev === a.state ? a.stateSec + adt : 0;
          // Face the lock, else the way the body moves.
          const t = a.lock ? actors.get(a.lock.actorId) : undefined;
          if (t && a.stunSec <= 0) a.facingYaw = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
          else if (Math.hypot(a.vel.x, a.vel.z) > 0.5) a.facingYaw = Math.atan2(a.vel.x, a.vel.z);
        }
        // ── the systems ──
        hints.length = 0;
        const ctx: AdventureStepContext = {
          tSec: arena.tSec, world, inputs, bus, timeScaleOf: arena.timeScaleOf, hint: (h) => { hints.push(h); },
        };
        for (const s of systems) s.step(ctx, dt);
        if (errors.length) throw errors[0];
        // ── edges last one step; AI intent goes out to the next step ──
        for (const i of inputs.values()) for (const e of EDGES) (i as unknown as Record<string, unknown>)[e] = false;
        for (const i of inputs.values()) i.magicSlot = null;
        for (const m of o.aiInputs ?? []) for (const [id, mi] of m) inputs.set(id, mi);
        if (slow) { slow.left -= dt; if (slow.left <= 0) slow = null; }
        arena.tSec += dt;
      }
    },
    runUntil(systems, pred, maxSec, o) {
      const start = arena.tSec;
      while (arena.tSec - start < maxSec) {
        arena.step(systems, 1, o);
        if (pred()) return arena.tSec - start;
      }
      return Infinity;
    },
  };
  return arena;
}
