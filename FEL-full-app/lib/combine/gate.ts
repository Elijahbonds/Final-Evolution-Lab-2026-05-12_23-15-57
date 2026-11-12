// lib/combine/gate.ts — COMBINE-DAY (2026-10-25): who a coach may test, at which stations, and whose numbers are kept.
// Every rule is one the app already has; this file only says which applies where. Nothing here is looser than teams.
//
//   · ON THE COMBINE AT ALL: the TEAM gate, unchanged (lib/groups/gates.ts groupGate('team'), which is the coach loop's
//     teen gate, lib/coach/teenGate.ts): adults yes; 13–17 only with a guardian consent asked under the coach-training
//     wording — none is live (COACH_TRAINING_CONSENT_SINCE is null), so every teen is HELD today, as teams holds them;
//     under 13 never; a blank birth year is asked for first. An athlete must also be on the coach's live roster
//     (server.ts reads CoachClient). A name the coach types (ad hoc) has no birth year at all: unknown age is treated
//     as a minor everywhere, so it is held too, until that athlete is on the roster with their own account.
//   · THE CAMERA AND VIDEO STATIONS (jump, approach, skill drill): Mirror scans are adults-only, so a VERIFIED ADULT
//     (lib/privacy/verifiedAdult.ts). A consented teen (none today) would get the hand-timed stations only.
//   · KEPT ON THE SERVER: a hand-timed number for any athlete the team gate passed (coach-recorded training data); a
//     camera or video number only for a verified adult with the live movement-numbers opt-in (lib/privacy/scanSaveGate
//     canSaveScanNumbers, via profileGates — row 1m of SCAN_SAVE_ROUTES). Otherwise that number stays on the coach's
//     phone, and the combine says so.
//
// Pure.
import { groupGate } from '@/lib/groups/gates';
import type { TeenGateConsent } from '@/lib/coach/teenGate';
import { profileGates, type OptInRow } from '@/lib/profile-v2/gate';
import { STATIONS, type StationKind } from './catalogue';
import { HELD_TODAY, stationHeldToday, type TodayHolds } from './today';
import type { StationConfig } from './catalogue';
import type { AthleteAccess, CombineAthlete } from './types';

export interface AccessInput {
  dobYear: number | null | undefined;
  consents: readonly TeenGateConsent[];
  optIn: OptInRow | null | undefined;
}

/**
 * What the gates allow for one roster athlete. `today`: the jump gate's holds (lib/combine/today.ts), read by the server
 * for camera athletes; absent = not read = everything held (the careful side).
 */
export function athleteAccess(input: AccessInput, now: Date = new Date(), today: TodayHolds = HELD_TODAY): AthleteAccess {
  const g = groupGate('team', { dobYear: input.dobYear, consents: input.consents }, now);
  if (!g.ok) return { testable: false, camera: false, saveCamera: false, held: g.error, today: HELD_TODAY };
  const gates = profileGates(input.dobYear ?? null, input.optIn ?? null, now);
  const camera = g.band === 'adult' && gates.adult;
  return { testable: true, camera, saveCamera: camera && gates.canSaveScan, held: null, today: camera ? today : HELD_TODAY };
}

/** A name the coach typed: no account, no birth year — held, as an unknown age always is. */
export const ADHOC_ACCESS: AthleteAccess = { testable: false, camera: false, saveCamera: false, held: 'age_unknown', today: HELD_TODAY };

/** Is this station held for this athlete TODAY by the jump gate (shown in the line, no attempt taken, ranked as missing)? */
export function heldToday(a: Pick<CombineAthlete, 'access'>, st: Pick<StationConfig, 'kind' | 'variant'>): boolean {
  return stationHeldToday(a.access.today, st);
}

/** May this athlete be tested at a station of this kind? */
export function canTest(a: Pick<CombineAthlete, 'access'>, kind: StationKind): boolean {
  return a.access.testable && (STATIONS[kind].method === 'hand' || a.access.camera);
}

/** May this athlete's number at a station of this kind be kept on the server (the age and opt-in rules; not today's gate)? */
export function canKeepOnServer(a: Pick<CombineAthlete, 'access' | 'source'>, kind: StationKind): boolean {
  if (a.source !== 'roster' || !canTest(a, kind)) return false;
  return STATIONS[kind].method === 'hand' || a.access.saveCamera;
}
