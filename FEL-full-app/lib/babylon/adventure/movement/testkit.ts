/**
 * A headless rig for the traversal sims (lane A1): a fake AdventureWorld, actors, and a 60 Hz runner with scripted
 * input. The plan's rule is that every lane tests its sim against fakes built from contracts.ts, without a scene; this
 * is A1's fake, exported so A4's sandbox tests and the BR bot tests can drive the same courses.
 *
 * Pure: plain objects. Not imported by the systems themselves.
 */

import type {
  ActorId, ActorKind, AdventureActor, AdventureEventName, AdventureEvents, AdventureSystem, AdventureWorld, CameraHint,
  MoveInput, RailNetwork, Vec3, WallSegment,
} from '../contracts';
import { NO_FUSION, SIM_HZ, createAdventureBus, neutralInput, pool } from '../contracts';

/** An axis-aligned box that blocks line of sight (a wall between a dasher and a target). */
export interface Blocker { min: Vec3; max: Vec3 }

export interface FakeWorldOpts {
  /** Ground height under (x, z); null = a void. Default: flat at y 0 everywhere. */
  ground?: (x: number, z: number) => number | null;
  rails?: RailNetwork;
  walls?: WallSegment[];
  blockers?: Blocker[];
}

export interface FakeWorld extends AdventureWorld {
  actors: Map<ActorId, AdventureActor>;
  add(a: AdventureActor): AdventureActor;
  blockers: Blocker[];
}

/** Segment a→b against a box (slab test). */
export function segmentHitsBox(a: Vec3, b: Vec3, box: Blocker): boolean {
  let t0 = 0, t1 = 1;
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  for (const k of ['x', 'y', 'z'] as const) {
    if (Math.abs(d[k]) < 1e-12) { if (a[k] < box.min[k] || a[k] > box.max[k]) return false; continue; }
    let u0 = (box.min[k] - a[k]) / d[k], u1 = (box.max[k] - a[k]) / d[k];
    if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
}

export function fakeWorld(opts: FakeWorldOpts = {}): FakeWorld {
  const actors = new Map<ActorId, AdventureActor>();
  const ground = opts.ground ?? (() => 0);
  const blockers = opts.blockers ?? [];
  return {
    actors,
    blockers,
    rails: opts.rails ?? { id: 'none', segments: [] },
    walls: opts.walls ?? [],
    groundY: ground,
    near(p, r) {
      const out: AdventureActor[] = [];
      for (const a of actors.values()) if (Math.hypot(a.pos.x - p.x, a.pos.y - p.y, a.pos.z - p.z) <= r) out.push(a);
      return out;
    },
    clear(a, b) { return !blockers.some((box) => segmentHitsBox(a, b, box)); },
    add(a) { actors.set(a.id, a); return a; },
  };
}

/** A fresh actor standing at `pos` (READY band, full pools, no fusion). */
export function makeActor(id: ActorId, kind: ActorKind = 'player', over: Partial<AdventureActor> = {}): AdventureActor {
  return {
    id, kind, team: kind === 'monster' || kind === 'boss' ? -1 : 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, facingYaw: 0, grounded: true, state: 'ground', stateSec: 0,
    radius: 0.4, height: 1.8,
    stats: {
      hp: pool(100), stamina: pool(100), energy: pool(100), poise: pool(50), special: 0,
      level: 1, prqBand: 'READY', school: { primary: 'straight', secondary: 'straight', mix: 0 }, element: null,
    },
    lock: null, stunSec: 0, iframeSec: 0, impulse: null, rail: null, ridingId: null, wantsFlight: false,
    fusion: { ...NO_FUSION }, partnerId: null,
    ...over,
  };
}

/** The edges a runner clears after every tick (contracts: booleans without `Held` are edges). */
const EDGES = ['jump', 'dash', 'attackLight', 'attackHeavy', 'lock', 'magic', 'partner', 'fuse'] as const;
type Edge = (typeof EDGES)[number];

export interface RecordedEvent { tSec: number; name: AdventureEventName; payload: unknown }

/**
 * Steps systems at SIM_HZ against a world, with one mutable MoveInput per actor. Edges set with `press` last one tick.
 * Every bus event is recorded with its time; every camera hint is copied.
 */
export class Runner {
  readonly bus = createAdventureBus((e) => { throw e; });
  readonly inputs = new Map<ActorId, MoveInput>();
  readonly events: RecordedEvent[] = [];
  readonly hints: (CameraHint & { tSec: number })[] = [];
  tSec = 0;
  readonly dt = 1 / SIM_HZ;
  timeScale: (id: ActorId) => number = () => 1;

  constructor(readonly world: FakeWorld, readonly systems: AdventureSystem[]) {
    const names: AdventureEventName[] = ['state', 'rail:enter', 'rail:switch', 'rail:trick', 'rail:exit', 'homing', 'mount'];
    for (const n of names) this.bus.on(n, (p) => this.events.push({ tSec: this.tSec, name: n, payload: p }));
  }

  input(id: ActorId): MoveInput {
    let i = this.inputs.get(id);
    if (!i) { i = neutralInput(); this.inputs.set(id, i); }
    return i;
  }

  press(id: ActorId, edge: Edge): void { this.input(id)[edge] = true; }

  tick(n = 1): void {
    for (let k = 0; k < n; k++) {
      const ctx = {
        tSec: this.tSec, world: this.world, inputs: this.inputs, bus: this.bus,
        timeScaleOf: this.timeScale,
        hint: (h: CameraHint) => { this.hints.push({ ...h, tSec: this.tSec }); },
      };
      for (const s of this.systems) s.step(ctx, this.dt);
      for (const i of this.inputs.values()) for (const e of EDGES) i[e] = false;
      this.tSec += this.dt;
    }
  }

  /** Run `sec` seconds, calling `each` before every tick (to script held input). */
  run(sec: number, each?: (t: number) => void): void {
    const n = Math.round(sec / this.dt);
    for (let k = 0; k < n; k++) { each?.(this.tSec); this.tick(); }
  }

  /** Tick until `until` is true or `maxSec` passes. Returns whether it came true. */
  runUntil(until: () => boolean, maxSec: number, each?: (t: number) => void): boolean {
    const n = Math.round(maxSec / this.dt);
    for (let k = 0; k < n; k++) { if (until()) return true; each?.(this.tSec); this.tick(); }
    return until();
  }

  of<K extends AdventureEventName>(name: K): AdventureEvents[K][] {
    return this.events.filter((e) => e.name === name).map((e) => e.payload as AdventureEvents[K]);
  }
}
