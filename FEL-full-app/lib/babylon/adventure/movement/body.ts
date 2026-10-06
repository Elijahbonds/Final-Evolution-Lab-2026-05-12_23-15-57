/**
 * The movement system's per-actor working state (lane A1), and the environment one step runs against.
 *
 * WHY THIS IS NOT ON THE ACTOR. `AdventureActor` is shared by three lanes and carries only what another lane reads
 * (contracts.ts: A1 writes pos, vel, facing, grounded, state, stateSec, rail, ridingId, wantsFlight). The momentum,
 * the FLOW meter, the coyote timer, the homing target, the balance needle and the cruise bank are A1's own business,
 * so they live here, one record per actor, made once and reused every tick (no per-tick allocation).
 *
 * It is plain data plus a seeded generator, so a host can rebuild it from the actor after a net handover: losing it
 * costs a FLOW tier and a timer, never a position.
 */

import type {
  ActorId, AdventureBus, AdventureWorld, CameraHint, FlightMode, FlightParams, Vec3, WallSegment,
} from '../contracts';
import { FlowMeter } from '@/lib/babylon/core/FreeRunFlow';
import type { WallRunOn } from '@/lib/babylon/core/MatrixFocus';
import type { FlightExtra, WorldBounds } from '../flight/params';
import type { RailIndex } from '../rails/railMath';
import { RailBalance } from '../rails/balance';
import { hashString, mulberry32 } from './math';
import { NEUTRAL_FEEL, type MoveFeel, type MovementParams } from './params';

/** What a mount brings: whether it carries, whether it flies, and how fast (lane A1's view of a PartnerDef). */
export interface MountSpec {
  canRide: boolean;
  canFly: boolean;
  /** The mount's run top speed with a rider, m/s. */
  groundSpeed: number;
  /** Flight speed multiplier on DEFAULT_FLIGHT. */
  flySpeedMult: number;
  /** The mount's flight stamina pool (EvolutionGarden.FlightController: its endurance). */
  staminaMax: number;
  /** The rider's feet above the mount's feet, m. */
  seatHeight: number;
}

export interface FlightBody {
  mode: FlightMode;
  /** Seconds left in a dash burst, and its direction (unit, 3D). */
  dashT: number;
  dashDir: Vec3;
  /** Cruise: heading (yaw), nose pitch, bank (right wing down +), airspeed. */
  heading: number;
  pitch: number;
  bank: number;
  speed: number;
  /** Out of energy / stamina: sinking, no climb, no dash, no cruise. */
  glide: boolean;
  /** Sim time of the last boom (null = none this cruise), and whether this cruise has boomed. */
  boomAtSec: number | null;
  boomed: boolean;
}

export interface BodyState {
  id: ActorId;
  rnd: () => number;
  feel: MoveFeel;
  flow: FlowMeter;
  /** Ground: planar speed and the heading it runs along. */
  speed: number;
  heading: number;
  skidding: boolean;
  /** Air: time since the ground (coyote), a buffered jump, a rising jump that a release can cut. */
  coyote: number;
  jumpBuffer: number;
  rising: boolean;
  spinning: boolean;
  airDashes: number;
  airDashT: number;
  /** Homing: the target, time in the dash, and how many hits in a row (reset on landing). */
  homingId: ActorId | null;
  homingT: number;
  homingChain: number;
  /** Wall run. */
  wall: WallRunOn<WallSegment> | null;
  wallT: number;
  wallSpeed: number;
  wallBaseY: number;
  /** Rail. */
  balance: RailBalance;
  lean: number;
  turn: number;
  trickT: number;
  trickChain: number;
  hopT: number;
  hopFrom: Vec3;
  recatchId: string | null;
  recatchT: number;
  /** Flight. */
  fl: FlightBody;
  /** As a mount: flight stamina (internal: A2 owns the actor's stamina pool, so the carry has its own). */
  mountStamina: number;
  mountStaminaMax: number;
  /** Sim times of the last take-off and touchdown, for the view's one-beat clips. */
  jumpedAt: number;
  landedAt: number;
}

export function newBody(id: ActorId, seed: number): BodyState {
  const rnd = mulberry32((seed ^ hashString(id)) >>> 0);
  return {
    id,
    rnd,
    feel: { ...NEUTRAL_FEEL },
    flow: new FlowMeter(),
    speed: 0, heading: 0, skidding: false,
    coyote: Infinity, jumpBuffer: 0, rising: false, spinning: false, airDashes: 1, airDashT: 0,
    homingId: null, homingT: 0, homingChain: 0,
    wall: null, wallT: 0, wallSpeed: 0, wallBaseY: 0,
    balance: new RailBalance(rnd),
    lean: 0, turn: 0, trickT: 0, trickChain: 0, hopT: 0, hopFrom: { x: 0, y: 0, z: 0 }, recatchId: null, recatchT: 0,
    fl: {
      mode: 'free', dashT: 0, dashDir: { x: 0, y: 0, z: 1 }, heading: 0, pitch: 0, bank: 0, speed: 0, glide: false,
      boomAtSec: null, boomed: false,
    },
    mountStamina: 0, mountStaminaMax: 0,
    jumpedAt: -Infinity, landedAt: -Infinity,
  };
}

/** What one step runs against. Built once per system step (the fields are references, not copies). */
export interface StepEnv {
  tSec: number;
  world: AdventureWorld;
  bus: AdventureBus;
  p: MovementParams;
  flight: FlightParams;
  fx: FlightExtra;
  rails: RailIndex;
  bounds: WorldBounds | null;
  /** Camera hints for the local player only (null for everyone else). */
  hint: ((h: CameraHint) => void) | null;
}
