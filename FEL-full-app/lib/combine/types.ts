// lib/combine/types.ts — COMBINE-DAY (2026-10-25): the combine as the coach's phone holds it, and as the server sends it.
//
// NUMBERS ONLY. An attempt is a number (or "no mark"), the time it was taken and, for an approach jump, a touch height;
// a standing reach is one share-of-the-leg number. No frame, no picture, no video is ever part of a combine.
//
// Pure, client-safe.
import type { StationConfig } from './catalogue';
import type { TodayHolds } from './today';

/** Why an athlete cannot be tested. The first three are the coach loop's own teen-gate refusals (lib/coach/teenGate.ts). */
export type HeldReason = 'age_required' | 'guardian_consent_required' | 'under_13' | 'age_unknown';

/** What the gates allow for one athlete (lib/combine/gate.ts decides it; the server decides it again on every save). */
export interface AthleteAccess {
  /** Any station at all: the team gate passed. */
  testable: boolean;
  /** The camera and video stations: a verified adult (Mirror scans are adults-only). */
  camera: boolean;
  /** Their camera numbers may be kept on the server: a verified adult with the live movement-numbers opt-in. */
  saveCamera: boolean;
  held: HeldReason | null;
  /** THE JUMP GATE today (lib/combine/today.ts): which camera stations are held. Booleans only, never the reason. */
  today: TodayHolds;
}

export interface CombineAthlete {
  /** An account id, or `adhoc:<n>` for a name the coach typed (never sent to the server). */
  id: string;
  name: string;
  source: 'roster' | 'adhoc';
  access: AthleteAccess;
}

/** One attempt. `value` null = taken, no mark (a foul, a false start, a read that failed and the coach moved on). */
export interface Attempt {
  value: number | null;
  /** Approach jumps only: the touch height (cm), when this athlete's standing reach was read in this combine. */
  touchCm?: number | null;
  /** SPRINT-SPEED: a sprint or 5-10-5 attempt timed by the camera (an estimate); absent = the station's own method. */
  method?: 'camera';
  at: number;
}

/** Per athlete, per station: one slot per attempt the station asks for; null = not taken yet. */
export type Slots = (Attempt | null)[];
export type ResultGrid = Record<string, Record<string, Slots>>;

/** A standing reach, numbers only: lib/jump/reach.ts StandingReach's two shares. */
export interface Reach { reachOverLeg: number; reachOverLegSd: number }

export interface CombineEvent {
  v: 1;
  /** The draft's own id on this phone. */
  localId: string;
  /** Once saved to the account (the pending SQL applied): the CombineEvent row's id. */
  serverId: string | null;
  name: string;
  createdAt: number;
  updatedAt: number;
  teamId: string | null;
  teamName: string | null;
  athletes: CombineAthlete[];
  stations: StationConfig[];
  /** Station id → weight in the composite (0 leaves the station out). Equal (1) by default. */
  weights: Record<string, number>;
  results: ResultGrid;
  /** Athlete id → their standing reach as a share of the leg and its SD (lib/jump/reach.ts), read in this combine. */
  reach: Record<string, Reach>;
}
