// grade — the body reader's events against a fixture's ground truth (movement play, phase 2, 2026-09-24): the phase
// gate's numbers, shared by lib/pose/BodyReader.test.ts and the READER.md report (scripts/body/reader.mts), and kept
// for phase 11's re-measure.
//
// Frames follow the ground truth's own conventions (lib/pose/synth.ts groundTruth): a take-off or landing instant
// belongs to the first stream frame at or after it ("the first frame with both feet off / a foot down"), an apex or
// a wrist event to the nearest frame.
//
// Pure: no DOM, no fs.
import type { PoseFrame } from './landmarks';
import type { PoseFixture, GtJump } from './synth';
import type { BodyEvent, BodyReaderOptions } from './BodyReader';
import { replay, MAX_FLIGHT_MS } from './BodyReader';
import { holdStill, type HoldOptions } from './streamKit';
import { calibrate, type Calibration } from './calibrate';

type Ev<K extends BodyEvent['kind']> = Extract<BodyEvent, { kind: K }>;

/** Events are matched to the truth inside these windows (ms); the gate is then asserted in frames. */
export const MATCH_JUMP_MS = 150;
export const MATCH_ARM_MS = 200;
/**
 * Events this close to the take's first frame (ms) are the stand → take splice, not the take: ungraded (a take that
 * opens with the arms up jumps them there in one frame, and the swing it reads peaks ~100 ms in).
 */
export const SPLICE_MS = 150;
/**
 * A truth event this close to the take's end (ms) is ungraded: its swing may finish after the last frame (the truth
 * reads the source clip, which runs on), so no reader could have told it — jump_two_foot_high's last reach, 266 ms from
 * the end, has not cleared the head in any frame the stream holds.
 */
export const END_MS = 300;
/** Seconds of still stand held before a take. */
export const STAND_SEC = 1.2;

export const nextFrame = (frames: PoseFrame[], t: number): number => {
  const i = frames.findIndex((f) => f.t >= t - 1e-6);
  return i < 0 ? frames.length - 1 : i;
};
export const nearFrame = (frames: PoseFrame[], t: number): number => {
  let b = 0;
  for (let i = 1; i < frames.length; i++) if (Math.abs(frames[i].t - t) < Math.abs(frames[b].t - t)) b = i;
  return b;
};

/**
 * The frame of the take the player "stood on" for the space check: its tallest frame with both feet down, the hips
 * quiet (< 0.3 m/s) and ≥ 150 ms from any take-off or landing (a toe-off frame has both feet down and the hips already
 * high — baseline.ts uprightFrame's rule), whose held copy calibrates (facing, whole). A take with none borrows
 * `fallback`, the same player's stand.
 */
export function standFrame(fx: PoseFixture, fallback?: PoseFrame): { frame: PoseFrame; from: string } {
  const { contact, hipH } = fx.gt.perFrame;
  const fps = fx.settings.synth.fps, near = Math.round(0.15 * fps);
  const edges = [...fx.gt.jumps, ...fx.gt.flights].flatMap((j) => [j.takeoff.frame, j.landing.frame]);
  const quiet = (i: number) => {
    const a = Math.max(0, i - 1), b = Math.min(hipH.length - 1, i + 1);
    return (Math.abs(hipH[b] - hipH[a]) * fps) / Math.max(1, b - a) < 0.3 && !edges.some((e) => Math.abs(e - i) <= near);
  };
  // both feet down first; a jog that never has both down (or whose two-foot frames hide a core point) stands on one
  const both = fx.frames.map((_, i) => i).filter((i) => fx.frames[i].present && contact[i][0] && contact[i][1]);
  const one = fx.frames.map((_, i) => i).filter((i) => fx.frames[i].present && (contact[i][0] || contact[i][1]) && !both.includes(i));
  const pool = [...both.sort((a, b) => hipH[b] - hipH[a]), ...one.sort((a, b) => hipH[b] - hipH[a])];
  for (const i of [...pool.filter(quiet), ...pool.filter((i) => !quiet(i))].slice(0, 60)) {
    // the pose held: this frame averaged with its quiet two-foot neighbours, so one frame's jitter is not baked into
    // the whole stand (a real stand's median sees ~20 independent frames)
    const group = [i - 2, i - 1, i, i + 1, i + 2].filter((k) => k >= 0 && k < fx.frames.length && fx.frames[k].present
      && contact[k][0] === contact[i][0] && contact[k][1] === contact[i][1] && (k === i || quiet(k)));
    const frame = meanFrame(group.map((k) => fx.frames[k]));
    const held = holdStill(frame, { sec: 0.8, fps, beforeT: 0 });
    if (calibrate(held).ok) return { frame, from: `frame ${i}${group.length > 1 ? ` (± ${group.length - 1} quiet)` : ''}` };
  }
  if (!fallback) throw new Error(`[grade] ${fx.name}: no frame to stand on`);
  return { frame: fallback, from: 'the fallback stand' };
}

/** Landmark-wise mean of frames (visibility: the lowest). */
export function meanFrame(frames: PoseFrame[]): PoseFrame {
  const n = frames.length, f0 = frames[0];
  const image = f0.image.map((_, i) => ({
    x: frames.reduce((a, f) => a + f.image[i].x, 0) / n, y: frames.reduce((a, f) => a + f.image[i].y, 0) / n,
    z: frames.reduce((a, f) => a + f.image[i].z, 0) / n, v: Math.min(...frames.map((f) => f.image[i].v)),
  }));
  const world = f0.world?.map((_, i) => ({
    x: frames.reduce((a, f) => a + f.world![i].x, 0) / n, y: frames.reduce((a, f) => a + f.world![i].y, 0) / n,
    z: frames.reduce((a, f) => a + f.world![i].z, 0) / n,
  }));
  return world ? { ...f0, image, world } : { ...f0, image };
}

/** The take with its stand held before it, replayed. `lead` = how many stand frames come first. */
export function readTake(fx: PoseFixture, stand: PoseFrame, opts: BodyReaderOptions = {}, hold: Partial<HoldOptions> = {}) {
  const lead = holdStill(stand, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: fx.frames[0].t, ...hold });
  const out = replay([...lead, ...fx.frames], opts);
  return { ...out, lead: lead.length };
}

export interface JumpRow {
  gt: GtJump;
  takeoff: Ev<'takeoff'> | null;
  apex: Ev<'apex'> | null;
  land: Ev<'land'> | null;
  /** Frame errors (detected − truth), ms errors, and the height error (m) against g·t²/8 of the true flight. */
  dTakeoffF: number | null; dApexF: number | null; dLandF: number | null;
  dTakeoffMs: number | null; dApexMs: number | null; dLandMs: number | null;
  dHeightM: number | null;
}
export interface ArmRow { kind: string; hand: string; gtT: number; gtFrame: number; t: number | null; dF: number | null; speed: number | null; gtSpeed: number }
export interface Graded {
  name: string;
  calibration: Calibration | null;
  jumps: JumpRow[];
  /**
   * Take-offs that match no true jump, landed or not, save those that may still be in the air when the take ends
   * (`dangling`); how many of them sit on a true non-jump flight. REVIEW (2026-09-24): only the landed ones counted,
   * so a take-off whose flight the reader then dropped (lost in the air, past MAX_FLIGHT_MS) passed the "0 false
   * jumps" gate, while a mode acts on the take-off alone (lib/drills/fromReader.ts: a takeoff is a jump at once).
   */
  falseJumps: Ev<'takeoff'>[];
  falseFromFlights: number;
  /**
   * Take-offs matching no true jump that may still be in the air when the take ends: no landing, no take-off after
   * them, and less than MAX_FLIGHT_MS before the last frame. The truth grades no flight without a landing either.
   */
  dangling: number;
  arms: ArmRow[];
  /** Detected arm events matching no truth (strike / reach / release / punch). */
  extraArms: BodyEvent[];
  kicks: ArmRow[];
  extraKicks: number;
  steps: { gt: number; detected: number; cadenceGt: number | null; cadence: number | null };
  events: BodyEvent[];
}

export function grade(fx: PoseFixture, events: BodyEvent[], calibration: Calibration | null): Graded {
  const F = fx.frames, t0 = F[0].t;
  const inTake = (e: BodyEvent) => e.t >= t0 + SPLICE_MS;
  const evs = events.filter(inTake);
  const takeoffs = evs.filter((e): e is Ev<'takeoff'> => e.kind === 'takeoff');
  const lands = evs.filter((e): e is Ev<'land'> => e.kind === 'land');
  const apexes = evs.filter((e): e is Ev<'apex'> => e.kind === 'apex');
  // a take-off owns the apex and landing that follow it, before the next take-off
  const own = (to: Ev<'takeoff'>) => {
    const next = takeoffs.find((x) => x.t > to.t)?.t ?? Infinity;
    return { apex: apexes.find((a) => a.t > to.t && a.t < next) ?? null, land: lands.find((l) => l.t > to.t && l.t < next) ?? null };
  };
  const used = new Set<Ev<'takeoff'>>();
  const jumps: JumpRow[] = fx.gt.jumps.map((gt) => {
    const cand = takeoffs.filter((x) => !used.has(x) && Math.abs(x.t - gt.takeoff.t) <= MATCH_JUMP_MS)
      .sort((a, b) => Math.abs(a.t - gt.takeoff.t) - Math.abs(b.t - gt.takeoff.t))[0] ?? null;
    if (cand) used.add(cand);
    const { apex, land } = cand ? own(cand) : { apex: null, land: null };
    return {
      gt, takeoff: cand, apex, land,
      dTakeoffF: cand ? nextFrame(F, cand.t) - gt.takeoff.frame : null,
      dApexF: apex ? nearFrame(F, apex.t) - gt.apex.frame : null,
      dLandF: land ? nextFrame(F, land.t) - gt.landing.frame : null,
      dTakeoffMs: cand ? cand.t - gt.takeoff.t : null,
      dApexMs: apex ? apex.t - gt.apex.t : null,
      dLandMs: land ? land.t - gt.landing.t : null,
      dHeightM: land ? land.heightM - gt.heightFlightM : null,
    };
  });
  const unmatched = takeoffs.filter((x) => !used.has(x));
  const tEnd = F[F.length - 1].t;
  // still in the air at the end, as far as the take can tell: no landing, nothing after it, and not yet flown longer
  // than any jump can
  const airborneAtEnd = (x: Ev<'takeoff'>) => !own(x).land && !takeoffs.some((y) => y.t > x.t) && x.t >= tEnd - MAX_FLIGHT_MS;
  const falseJumps = unmatched.filter((x) => !airborneAtEnd(x));
  const falseFromFlights = falseJumps.filter((x) => fx.gt.flights.some((fl) => Math.abs(fl.takeoff.t - x.t) <= MATCH_JUMP_MS)).length;
  // arms: each truth event against the nearest detection of its kind and hand
  const handOf = (h: string) => (h === 'left' ? 'L' : 'R');
  const armKinds = ['strike', 'reach', 'release', 'punch'] as const;
  const armEvs = evs.filter((e) => (armKinds as readonly string[]).includes(e.kind)) as (Ev<'strike'> | Ev<'reach'> | Ev<'release'> | Ev<'punch'>)[];
  const armUsed = new Set<BodyEvent>();
  const arms: ArmRow[] = fx.gt.wrist.filter((w) => w.at.t >= t0 + SPLICE_MS && w.at.t <= tEnd - END_MS).map((w) => {
    const c = armEvs.filter((e) => !armUsed.has(e) && e.kind === w.kind && e.hand === handOf(w.hand) && Math.abs(e.t - w.at.t) <= MATCH_ARM_MS)
      .sort((a, b) => Math.abs(a.t - w.at.t) - Math.abs(b.t - w.at.t))[0] ?? null;
    if (c) armUsed.add(c);
    return { kind: w.kind, hand: handOf(w.hand), gtT: w.at.t, gtFrame: w.at.frame, t: c?.t ?? null, dF: c ? nearFrame(F, c.t) - w.at.frame : null, speed: c?.speed ?? null, gtSpeed: w.speed };
  });
  const extraArms = armEvs.filter((e) => !armUsed.has(e));
  const kickEvs = evs.filter((e): e is Ev<'kick'> => e.kind === 'kick');
  const kickUsed = new Set<BodyEvent>();
  const kicks: ArmRow[] = fx.gt.kicks.map((kq) => {
    const c = kickEvs.filter((e) => !kickUsed.has(e) && e.foot === handOf(kq.side) && Math.abs(e.t - kq.at.t) <= MATCH_ARM_MS)[0] ?? null;
    if (c) kickUsed.add(c);
    return { kind: 'kick', hand: handOf(kq.side), gtT: kq.at.t, gtFrame: kq.at.frame, t: c?.t ?? null, dF: c ? nearFrame(F, c.t) - kq.at.frame : null, speed: c?.speed ?? null, gtSpeed: kq.speed };
  });
  // steps: true touch-downs that are not a jump's landing, against the step events
  const landF = fx.gt.jumps.map((j) => j.landing.frame);
  const gtDowns = fx.gt.steps.filter((s) => s.down && s.down.t >= t0 + SPLICE_MS && !landF.some((f) => Math.abs(f - s.down!.frame) <= 2));
  const steps = evs.filter((e): e is Ev<'step'> => e.kind === 'step');
  const cadence = (ts: number[]) => (ts.length >= 3 ? ((ts.length - 1) * 1000) / (ts[ts.length - 1] - ts[0]) : null);
  return {
    name: fx.name, calibration, jumps, falseJumps, falseFromFlights,
    dangling: unmatched.filter(airborneAtEnd).length,
    arms, extraArms, kicks, extraKicks: kickEvs.length - kickUsed.size,
    steps: { gt: gtDowns.length, detected: steps.length, cadenceGt: cadence(gtDowns.map((s) => s.down!.t).sort((a, b) => a - b)), cadence: cadence(steps.map((s) => s.t)) },
    events,
  };
}
