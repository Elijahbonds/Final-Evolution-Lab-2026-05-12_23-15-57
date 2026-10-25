// pilot — the force-plate pilot's capture mode (JUMP-TESTS, 2026-10-25; docs/JUMP-PILOT-PROTOCOL.md). OFF unless the
// build sets NEXT_PUBLIC_JUMP_PILOT_CAPTURE=1 (an owner call: the lab's build only).
//
// WHAT IT DOES. Every trial the app times on this page — the live jump check, the slow-mo read, each jump test — is
// logged here with its RAW timing: take-off and landing (ms on the capture's own clock), the flight, the frame rate and
// stretch, how it was timed (re-timed / frame edges / frames picked by hand), its own ± and flags, and the velocity and
// power estimates (lib/jump/velocity.ts). The lab exports the log as CSV and lines it up with the plates' trials by
// participant, session, test and trial number (and, for the live camera, the wall clock). scripts/jump-pilot/analyze.ts
// then pairs the files.
//
// WHERE IT LIVES. In this page's memory only (a module-level log): nothing is stored on the phone or sent; leaving the
// page forgets it, so the lab exports after each participant. The participant and session are codes the lab types
// (letters, digits, - and _ only), never a name. A body mass, when the lab types one, is used for the power columns of
// that export and kept nowhere. Adults only: the panel mounts on an adult's jump result, as every other jump tool does.
//
// Pure apart from the module-level log.
import type { JumpRead, T5Extra } from '@/lib/assess/scoring';
import type { FrontCalibration } from '@/lib/assess/calibration';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { toCsv, csvFileName, type CsvValue } from '@/lib/csv/csv';
import { JUMP_REGISTER_VERSION } from './PROPOSED-jump';
import { jumpKinematics, jumpPower } from './velocity';
import type { ManualRead } from './manualFrames';

type PilotEnv = { readonly NEXT_PUBLIC_JUMP_PILOT_CAPTURE?: string };

/**
 * Is pilot capture on? Exactly '1'. The default spells the variable out in full because Next inlines a NEXT_PUBLIC_
 * value only where the code names it (lib/marketing/joinLab.ts says why); turning it on takes a rebuild.
 */
export function pilotEnabled(env: PilotEnv = { NEXT_PUBLIC_JUMP_PILOT_CAPTURE: process.env.NEXT_PUBLIC_JUMP_PILOT_CAPTURE }): boolean {
  return env.NEXT_PUBLIC_JUMP_PILOT_CAPTURE === '1';
}

export type PilotTest = 'check' | 'slowmo' | 'sj' | 'cmjHips' | 'cmjArms' | 'singleLeft' | 'singleRight' | 'rj105';

export interface PilotRow {
  capture: number;
  test: PilotTest;
  trial: number;
  source: 'live' | 'video';
  /** 'page': performance.now() ms of the live camera; 'file': the video's own time, divided by the stretch (real ms). */
  clock: 'page' | 'file';
  fps: number;
  stretch: number;
  method: 'refined' | 'frames' | 'manual';
  valid: boolean;
  why: string;
  takeoffMs: number;
  landingMs: number;
  flightMs: number;
  heightTovCm: number;
  heightFlightCm: number | null;
  heightSdCm: number | null;
  flags: string;
  v0Mps: number;
  v0SdMps: number | null;
  pushOffCm: number | null;
  timeToTakeoffMs: number | null;
  rsiMod: number | null;
  /** The contact before this jump, when it rebounded (ms). */
  contactMs: number | null;
  loadKg: number;
  /** The wall clock at take-off (live camera only): performance.timeOrigin + takeoffMs. */
  wallClock: string | null;
}

const log: PilotRow[] = [];
let captures = 0;

/** Every row logged on this page so far. */
export const pilotRows = (): readonly PilotRow[] => log;
export function clearPilot(): void { log.length = 0; captures = 0; }

/**
 * Log one capture's trials. `frames` + `front` (a video) add the push-off and RSI-mod; the live check has neither.
 * `manual` replaces one trial's timing with the frames picked by hand (it is logged as its own capture).
 */
export function logCapture(o: {
  test: PilotTest; source: 'live' | 'video'; t5: T5Extra; fps: number; stretch?: number; loadKg?: number;
  frames?: readonly PoseFrame[] | null; front?: FrontCalibration | null; timeOrigin?: number | null;
  manual?: { index: number; read: ManualRead } | null;
}): PilotRow[] {
  const capture = ++captures;
  const contactBefore = new Map((o.t5.rebounds?.rebounds ?? []).map((r) => [r.to, r.contactMs]));
  const cm = o.test !== 'sj' && o.test !== 'rj105';
  const rows = o.t5.jumps.map((j: JumpRead): PilotRow => {
    const man = o.manual && o.manual.index === j.index ? o.manual.read : null;
    const height = man ? man.heightCm : j.heightCm;
    const take = man ? man.takeoffT : j.takeoffT;
    const k = jumpKinematics({ takeoffT: take, heightCm: height, heightSdCm: man ? null : j.heightSdCm }, { frames: o.frames, front: o.front, countermovement: cm && !contactBefore.has(j.index) });
    return {
      capture, test: o.test, trial: j.index, source: o.source, clock: o.source === 'live' ? 'page' : 'file',
      fps: Math.round(o.fps * 10) / 10, stretch: o.stretch ?? 1, method: man ? 'manual' : j.method ?? 'frames',
      valid: j.valid, why: j.invalidWhy ?? '',
      takeoffMs: Math.round(take * 10) / 10, landingMs: Math.round((man ? man.landT : j.landT) * 10) / 10, flightMs: man ? man.flightMs : j.flightMs,
      heightTovCm: height, heightFlightCm: man ? man.heightCm : j.heightFlightCm ?? null, heightSdCm: man ? null : j.heightSdCm ?? null,
      flags: (j.quality?.flags ?? []).join(' '),
      v0Mps: k.v0Mps, v0SdMps: k.v0SdMps, pushOffCm: k.pushOffCm, timeToTakeoffMs: k.timeToTakeoffMs, rsiMod: k.rsiMod,
      contactMs: contactBefore.get(j.index) ?? null, loadKg: o.loadKg ?? 0,
      wallClock: o.source === 'live' && o.timeOrigin ? new Date(o.timeOrigin + take).toISOString() : null,
    };
  });
  log.push(...rows);
  return rows;
}

export const PILOT_HEADER = [
  'participant', 'session', 'test', 'trial', 'capture', 'source', 'clock', 'fps', 'stretch', 'method', 'valid', 'why',
  'takeoff_ms', 'landing_ms', 'flight_ms', 'height_tov_cm', 'height_flight_cm', 'height_sd_cm', 'flags',
  'v0_mps', 'v0_sd_mps', 'push_off_cm', 'time_to_takeoff_ms', 'rsi_mod', 'contact_ms', 'load_kg', 'body_mass_kg',
  'peak_power_w', 'mean_force_n', 'mean_power_w', 'wall_clock', 'app_register',
] as const;

/** A code the lab types for a participant or a session: letters, digits, - and _ (never a name), 1–24 long. */
export const PILOT_CODE = /^[A-Za-z0-9_-]{1,24}$/;

/** The pilot CSV. `massKg` (the lab's, optional) fills the power columns; nothing else uses it. */
export function pilotCsv(meta: { participant: string; session: string; massKg?: number | null }, rows: readonly PilotRow[] = log): string {
  const p = PILOT_CODE.test(meta.participant) ? meta.participant : '';
  const s = PILOT_CODE.test(meta.session) ? meta.session : '';
  const out: CsvValue[][] = rows.map((r) => {
    const pw = meta.massKg ? jumpPower({ adult: true, massKg: meta.massKg, loadKg: r.loadKg, heightCm: r.heightTovCm, plusMinusCm: r.heightSdCm != null ? 1.96 * r.heightSdCm : null, pushOffCm: r.pushOffCm, kind: r.test === 'check' || r.test === 'slowmo' || r.test === 'cmjHips' ? 'cmj' : 'other' }) : null;
    const ok = pw && pw.ok ? pw : null;
    return [
      p, s, r.test, r.trial, r.capture, r.source, r.clock, r.fps, r.stretch, r.method, r.valid, r.why,
      r.takeoffMs, r.landingMs, r.flightMs, r.heightTovCm, r.heightFlightCm, r.heightSdCm, r.flags,
      r.v0Mps, r.v0SdMps, r.pushOffCm, r.timeToTakeoffMs, r.rsiMod, r.contactMs, r.loadKg, meta.massKg ?? null,
      ok?.p?.peakW ?? null, ok?.mean?.forceN ?? null, ok?.mean?.powerW ?? null, r.wallClock, JUMP_REGISTER_VERSION,
    ];
  });
  return toCsv(PILOT_HEADER, out);
}

export const pilotFileName = (participant: string, session: string, at: Date = new Date()) =>
  csvFileName(`fel-pilot-${PILOT_CODE.test(participant) ? participant : 'p'}-${PILOT_CODE.test(session) ? session : 's'}`, at);
