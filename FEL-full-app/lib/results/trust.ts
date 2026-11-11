// lib/results/trust — EVERY-SCREEN P4 (2026-11-11): how each number was measured, and how sure it is, in one line under
// the number (components/result-card, the jump check's result, My progress).
//
// The numbers are MEASURED, not written: scripts/every-screen/trust.mts runs the code a phone runs over the fixtures the
// repository holds and writes ./trust.json (the jump and the Mirror's screen on recorded takes; the Quick Screen, the sprint
// and bar speed on synthetic benches, because no recorded screen, run or set exists yet — the line says so). A test (trust.test.ts) holds the
// lines to the file and the file to its source; re-run the script when a reader changes.
//
// Words: plain, a ± first, then what it was measured on. Never "accurate", never a claim past what was measured (the
// force-plate pilot is the validity claim, lib/results/view.ts OWN-12).
//
// Pure. Client-safe (the JSON is small).
import TRUST from './trust.json';

export interface HowSure {
  /** How it was measured, in a phrase. */
  method: string;
  /** How sure: the ± and what it was measured on. */
  sure: string;
}

const IN = 2.54;
const num = (x: number, places: number) => x.toFixed(places).replace(/\.0+$/, '');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The jump (the jump check, the jump tests, readiness's jump): cm or inches, as the screen shows it. */
export function jumpSure(unit: 'in' | 'cm' = 'in'): HowSure {
  const j = TRUST.jump;
  // whole units, at least 1: a jump's height is never shown to a decimal (lib/screen/flight-jump.test.ts)
  const f = (cm: number) => (unit === 'cm' ? `${Math.max(1, Math.round(cm))} cm` : `${Math.max(1, Math.round(cm / IN))} in`);
  return {
    method: j.method,
    sure: `± ${f(j.meanMiss)} on average across ${plural(j.jumpsRead, 'recorded jump')}; the same jump read again moves ± ${f(j.repeatSpread)}.`,
  };
}

/** The Quick Screen (Train → Screen my movement): a colour per check, never a score. SYNTHETIC: said so. */
export function quickScreenSure(): HowSure {
  const q = TRUST.quickScreen;
  return {
    method: q.method,
    sure: `The same clean mover got the same colour ${q.sameColourPct}% of the time (angles ± ${num(q.angleSpreadDeg ?? 0, 1)}°) across ${q.runs} computer-made screens; no recorded screen yet.`,
  };
}

/** The Mirror's own movement screen score (/play/mirror). */
export function mirrorScreenSure(): HowSure {
  const s = TRUST.mirrorScreen;
  return {
    method: s.method,
    sure: `± ${num(s.repeatSpread, 0)} points: recorded movements read ${plural(s.runs, 'time')} gave the same score, with ${s.flagsNotInTheKey === 0 ? 'no flag' : plural(s.flagsNotInTheKey, 'flag')} the recording did not have.`,
  };
}

/** A sprint time (s) or top speed (m/s). SYNTHETIC: said so. */
export function sprintSure(): HowSure {
  const s = TRUST.sprint;
  return {
    method: s.method,
    sure: `± ${num(s.p95Miss, 3)} s on ${s.runs} computer-made runs. No recorded run yet: a real phone will miss by more.`,
  };
}

/** A bar's speed (m/s). SYNTHETIC: said so. */
export function vbtSure(): HowSure {
  const v = TRUST.vbt;
  return {
    method: v.method,
    sure: `± ${num(v.meanMiss, 3)} m/s on ${v.reps} computer-made reps; the same set read again moves ± ${num(v.repeatSpread, 3)}. No recorded set yet.`,
  };
}

/** Readiness reads a jump against your own normal: the jump's own ±. */
export function readinessSure(): HowSure {
  const j = jumpSure('in');
  return { method: 'Your jump check, against your own last few days', sure: j.sure };
}

/** A count, not a measurement (a quiz score, the sets you marked done): exact, said so. */
export function countSure(of: string): HowSure {
  return { method: `Counted from ${of}`, sure: 'An exact count, not an estimate.' };
}

/** A combine station, as it was taken (lib/combine/catalogue.ts STATIONS: the vertical by camera, the approach on video,
 *  the sprint and agility by hand or camera, the skill drill counted on camera). */
export function stationSure(kind: string, timing?: string | null): HowSure {
  if (kind === 'cmj') return jumpSure('in');
  if (kind === 'approach') return { method: 'Side-on video of the run-up and jump', sure: 'Not yet measured on recorded approach jumps: treat it as a camera estimate.' };
  if (kind === 'skill') return countSure('the makes the camera saw');
  if (timing === 'camera') return sprintSure();
  return { method: 'Timed by hand at the combine', sure: 'As sure as the person timing: not a camera estimate.' };
}

/** What the trust file was measured on, for the page that lists it. */
export const TRUST_BASIS = { jump: TRUST.jump.basis, quickScreen: TRUST.quickScreen.basis, mirrorScreen: TRUST.mirrorScreen.basis, sprint: TRUST.sprint.basis, vbt: TRUST.vbt.basis } as const;
