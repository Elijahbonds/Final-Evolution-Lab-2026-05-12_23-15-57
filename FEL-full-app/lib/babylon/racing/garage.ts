// THE GARAGE — the karts and the aircraft you can pick, and what picking one actually changes (2026-09-13).
//
// Owner: "Different maps, different vehicles, like the start up screen from the dunk mode", and on whether a
// vehicle changes how the game plays: "Handling, with honest trade-offs."
//
// HONEST TRADE-OFFS is the whole design rule here, and it is a testable one rather than a slogan: no vehicle
// may be better than another at everything. Every kart below is the best kart on SOME course and the worst on
// some other, and a test in garage.test.ts holds that — if a future tune makes one strictly dominant, the
// suite says so instead of a player finding out and never touching the rest of the garage again.
//
// The two handling models already took a spec object for exactly this ("One object so a mode can offer
// different planes later" — FlightModel.ts). So a vehicle IS its spec plus the things a picker needs to draw
// it. Nothing in either model changes.
//
// Pure: no Babylon, no scene, no DOM beyond the remembered pick.

import { KART_STARTER, type KartSpec } from '../core/KartModel';
import { AERO_TRAINER, type Airframe } from '../core/FlightModel';

/** What the picker draws under a name: three bars, 0..1, and what the vehicle is bad at. */
export interface VehicleBars {
  /** Outright pace. */
  speed: number;
  /** How well it holds a line — grip on the ground, stability in the air. */
  hold: number;
  /** Reward for driving it well: boost banked, or how fast it rolls into the next gate. */
  edge: number;
}

export interface Vehicle<S> {
  id: string;
  name: string;
  /** One line on the picker, and it names the COST — a pick with no downside is not a choice. */
  sub: string;
  tint: string;
  spec: S;
  bars: VehicleBars;
  /** Unready vehicles are authored but hidden until their pass lands. */
  ready: boolean;
}

export type Kart = Vehicle<KartSpec>;
export type Plane = Vehicle<Airframe>;

// ── KARTS ────────────────────────────────────────────────────────────────────────────────────────────────
//
// Tuned against KART_STARTER rather than from nothing, so the model's solved relationships survive. The one
// that matters: `grip` sets the tightest corner the kart can hold at all (v²/a), and the boardwalk loop was
// deliberately scaled so a corner CAN be held on grip — that is what makes drifting a decision. A kart with
// less grip is not simply worse; it reaches the point of choosing sooner, and banks more boost for doing it.

export const KARTS: readonly Kart[] = [
  {
    id: 'runabout', name: 'RUNABOUT', sub: 'The balanced one. Nothing to fight, nothing for free.',
    tint: '#f25f5c', ready: true,
    spec: KART_STARTER,
    bars: { speed: 0.6, hold: 0.6, edge: 0.55 },
  },
  {
    id: 'slipstream', name: 'SLIPSTREAM', sub: 'Fastest down a straight — and it will not hold a hairpin.',
    tint: '#4cc9f0', ready: true,
    // more top end and more push, paid for in grip: it reaches the corner first and cannot take it tidily
    spec: { ...KART_STARTER, vMax: 30.5, accel: 15, grip: 8.6, brake: 20, scrub: 1.05 },
    bars: { speed: 0.92, hold: 0.32, edge: 0.5 },
  },
  {
    id: 'tailspin', name: 'TAILSPIN', sub: 'Built to slide. Banks boost fast, runs out of road faster.',
    tint: '#ffd75e', ready: true,
    // the drift specialist: low grip and a lazy recovery make it slide early, and it is PAID for the slide
    spec: {
      ...KART_STARTER, vMax: 25, accel: 12.5, grip: 8.0, slipRecover: 2.3,
      driftCharge: 0.95, boostSpeed: 14, boostSec: 1.9, driftScrubRelief: 0.92,
    },
    bars: { speed: 0.5, hold: 0.28, edge: 0.95 },
  },
  {
    id: 'anvil', name: 'ANVIL', sub: 'Sticks to the road and shrugs off the dirt. Slow to wake up.',
    tint: '#8fe0a0', ready: true,
    // the grip kart: holds corners nobody else can and barely cares about leaving the track, but it is
    // sluggish and banks almost no boost because it so rarely slides
    spec: {
      ...KART_STARTER, vMax: 24.5, accel: 10.5, brake: 26, grip: 13.5,
      slipRecover: 4.2, driftCharge: 0.32, offTrack: 0.72, scrub: 0.6,
    },
    bars: { speed: 0.38, hold: 0.95, edge: 0.3 },
  },
];

// ── AIRCRAFT ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Same rule. The flight model's drag is SOLVED from thrust and cruise (`drag = thrust * 0.7 / cruise²`), so
// every airframe below recomputes it instead of being hand-typed — a hand-typed drag is how the first pass
// put the full-throttle equilibrium above vMax and made the word "cruise" describe nothing.

/** Drag that makes `cruise` true at 0.7 throttle. Never hand-type this. */
export function solvedDrag(thrust: number, cruise: number): number {
  return (thrust * 0.7) / (cruise * cruise);
}

const frame = (f: Omit<Airframe, 'drag'>): Airframe => ({ ...f, drag: solvedDrag(f.thrust, f.cruise) });

export const PLANES: readonly Plane[] = [
  {
    id: 'trainer', name: 'TRAINER', sub: 'Forgiving. Rolls quickly, punishes a flat turn.',
    tint: '#22d3ee', ready: true,
    spec: AERO_TRAINER,
    bars: { speed: 0.55, hold: 0.7, edge: 0.5 },
  },
  {
    id: 'darter', name: 'DARTER', sub: 'Quickest through a straight ring line. Stalls if you get greedy.',
    tint: '#ff7b54', ready: true,
    // fast and slippery, with a high stall speed — it cannot afford to bleed energy in a tight gate
    spec: frame({
      cruise: 72, vMax: 138, vStall: 31, thrust: 34,
      pitchRate: 1.35, rollRate: 3.0, turnFromBank: 1.15, yawRate: 0.3, turnDrag: 9,
    }),
    bars: { speed: 0.95, hold: 0.4, edge: 0.55 },
  },
  {
    id: 'kestrel', name: 'KESTREL', sub: 'Turns inside anything. Nothing left for the straights.',
    tint: '#c99bf7', ready: true,
    // the agility airframe: it can take the tight rings on the canyon run that the darter has to line up for
    spec: frame({
      cruise: 49, vMax: 96, vStall: 17, thrust: 21,
      pitchRate: 2.1, rollRate: 3.8, turnFromBank: 1.75, yawRate: 0.55, turnDrag: 5,
    }),
    bars: { speed: 0.32, hold: 0.62, edge: 0.95 },
  },
  {
    id: 'bastion', name: 'BASTION', sub: 'Steady as a table. Slow to point anywhere new.',
    tint: '#8fe0a0', ready: true,
    // the stable one: low stall and low turn drag mean it holds a line through anything, but it is lazy
    spec: frame({
      cruise: 54, vMax: 104, vStall: 15, thrust: 23,
      pitchRate: 1.1, rollRate: 1.9, turnFromBank: 0.95, yawRate: 0.25, turnDrag: 4,
    }),
    bars: { speed: 0.42, hold: 0.95, edge: 0.34 },
  },
];

// ── THE PICK ─────────────────────────────────────────────────────────────────────────────────────────────

export type RaceKind = 'kart' | 'aero';

export function vehiclesFor(kind: RaceKind): readonly Vehicle<KartSpec | Airframe>[] {
  return kind === 'kart' ? KARTS : PLANES;
}

export function readyVehicles(kind: RaceKind): Vehicle<KartSpec | Airframe>[] {
  return vehiclesFor(kind).filter((v) => v.ready);
}

export const VEHICLE_KEY_PREFIX = 'fel-race-vehicle-';

/** The player's pick: `?vehicle=` wins, then the remembered pick, then the first ready one. */
export function readVehicle(kind: RaceKind): Vehicle<KartSpec | Airframe> {
  const list = readyVehicles(kind);
  const first = list[0] ?? vehiclesFor(kind)[0];
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('vehicle');
      const byQuery = list.find((v) => v.id === q);
      if (byQuery) return byQuery;
      const s = window.localStorage.getItem(VEHICLE_KEY_PREFIX + kind);
      const byStore = list.find((v) => v.id === s);
      if (byStore) return byStore;
    }
  } catch { /* private mode: the default */ }
  return first;
}

export function writeVehicle(kind: RaceKind, id: string): void {
  try { window.localStorage.setItem(VEHICLE_KEY_PREFIX + kind, id); } catch { /* convenience only */ }
}

/** The kart's spec, already narrowed — so a mode never casts. */
export function readKart(): Kart {
  return (readVehicle('kart') as Kart);
}

export function readPlane(): Plane {
  return (readVehicle('aero') as Plane);
}
