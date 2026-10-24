// bench — the jump accuracy bench (JUMP-PRO, 2026-10-24): ground-truth takes (./ballistic) through a jump reader,
// scored per condition. Bias, error spread and the false-trial rate, against BOTH truths:
//   v0     the force-plate height (v0²/2g) — what "closest to a force plate" means
//   flight g·T²/8 of the true flight — what a perfect flight-time reader would say (isolates timing error)
//
// Pure, deterministic. scripts/jump-accuracy.ts prints the table; tests/jump-pro pins the targets.
import type { PoseFrame } from '@/lib/pose/landmarks';
import { calibrateFront, type Calibration } from '@/lib/assess/calibration';
import { buildTake, filmTake, type Beat, type FilmOptions, type TrialSpec, type TrialTruth } from './ballistic';

/** One jump as a reader reports it. */
export interface ReadJump { takeoffT: number; landT?: number; heightCm: number; valid: boolean; why?: string }
/** A reader under test: the frames and the athlete's calibration in, the jumps out. */
export type JumpReaderFn = (frames: readonly PoseFrame[], calib: Calibration, fps: number) => ReadJump[];

export interface Condition {
  name: string;
  fps: number;
  /** The trials of one take (three jumps by default). */
  trials: TrialSpec[];
  film?: Omit<FilmOptions, 'fps' | 'seed'>;
  /** Decoys mixed into the take (the false-trial set). */
  decoys?: Beat[];
  seeds?: number;
}

export interface ConditionResult {
  name: string;
  fps: number;
  trials: number;
  /** Matched valid reads. */
  read: number;
  /** Real jumps refused (with a reason) or never found. */
  missed: number;
  /** Reads with no real jump under them (a decoy or a split flight) that were VALID. */
  falseValid: number;
  decoys: number;
  /** Takes whose stand the live flow would have refused (read here with a loose sway). */
  calibRefused: number;
  /** Mean signed error (cm) vs each truth, and the spread. */
  biasV0: number; sdV0: number; maeV0: number; p95V0: number;
  biasFlight: number; sdFlight: number;
  /** Share of take-off and of landing events within ±1 camera frame of the truth (matched valid reads with landT). */
  takeoffIn1: number; landIn1: number;
  /** Every matched pair, for the record. */
  pairs: { truth: TrialTruth; read: ReadJump }[];
  reasons: Record<string, number>;
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v: number[]) => { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const p95 = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(0.95 * (s.length - 1) + 0.5))] : NaN; };
const r2 = (x: number) => Math.round(x * 100) / 100;

const LEAD_S = 3.2;
const MATCH_MS = 150;

/** The athlete's calibration from the take's own opening stand (as the live flow calibrates before the jump). */
export function calibrateTake(frames: readonly PoseFrame[], aspect = 4 / 3, maxSway?: number): Calibration | null {
  const r = calibrateFront(frames.filter((f) => f.t < (LEAD_S - 0.1) * 1000), aspect, 2500, maxSway);
  return r.ok ? { aspect, front: r.value, side: null } : null;
}

export function runCondition(c: Condition, reader: JumpReaderFn): ConditionResult {
  const seeds = c.seeds ?? 6;
  const pairs: { truth: TrialTruth; read: ReadJump }[] = [];
  let trials = 0, missed = 0, falseValid = 0, decoys = 0, calibRefused = 0;
  const reasons: Record<string, number> = {};
  for (let seed = 1; seed <= seeds; seed++) {
    const beats: Beat[] = [];
    c.trials.forEach((t, i) => { if (c.decoys?.[i]) beats.push(c.decoys[i]); beats.push({ trial: t }); });
    for (const d of c.decoys?.slice(c.trials.length) ?? []) beats.push(d);
    const take = buildTake(beats, { leadS: LEAD_S });
    decoys += take.decoys;
    const { frames, truth } = filmTake(take, { fps: c.fps, seed, ...c.film });
    trials += truth.length;
    // the live flow refuses a stand this jittery ("stand still"); the bench notes it and reads on with a loose sway
    let calib = calibrateTake(frames);
    if (!calib) { calibRefused++; calib = calibrateTake(frames, 4 / 3, 0.3); }
    if (!calib) { missed += truth.length; reasons['no calibration'] = (reasons['no calibration'] ?? 0) + truth.length; continue; }
    const reads = reader(frames, calib, c.fps);
    const used = new Set<ReadJump>();
    for (const tr of truth) {
      const r = reads.find((x) => !used.has(x) && Math.abs(x.takeoffT - tr.takeoffT) < MATCH_MS);
      if (r) used.add(r);
      if (r && r.valid) pairs.push({ truth: tr, read: r });
      else {
        missed++;
        const why = r?.why ?? 'not found';
        reasons[why] = (reasons[why] ?? 0) + 1;
      }
    }
    falseValid += reads.filter((x) => !used.has(x) && x.valid).length;
  }
  const eV0 = pairs.map((p) => p.read.heightCm - p.truth.heightV0Cm);
  const eFl = pairs.map((p) => p.read.heightCm - p.truth.heightFlightCm);
  const fr = 1000 / c.fps;
  const within = (k: 'takeoffT' | 'landT') => { const ok = pairs.filter((p) => p.read[k] !== undefined); return ok.length ? r2(ok.filter((p) => Math.abs(p.read[k]! - p.truth[k]) <= fr).length / ok.length) : NaN; };
  return {
    takeoffIn1: within('takeoffT'), landIn1: within('landT'),
    name: c.name, fps: c.fps, trials, read: pairs.length, missed, falseValid, decoys, calibRefused,
    biasV0: r2(mean(eV0)), sdV0: r2(sd(eV0)), maeV0: r2(mean(eV0.map(Math.abs))), p95V0: r2(p95(eV0.map(Math.abs))),
    biasFlight: r2(mean(eFl)), sdFlight: r2(sd(eFl)),
    pairs, reasons,
  };
}

// ── the standard conditions ──────────────────────────────────────────────────────────────────────────────────────

/** Three jumps a take: a modest, a good and a big standing vertical (cm 25 / 40 / 55). */
export const STD_TRIALS = (o: Partial<TrialSpec> = {}): TrialSpec[] => [0.25, 0.4, 0.55].map((h) => ({ heightM: h, ...o }));

export const FPS_SET = [30, 60, 120, 240] as const;

/** The audit matrix: each condition at each frame rate. */
export function auditConditions(seeds = 6): Condition[] {
  const out: Condition[] = [];
  for (const fps of FPS_SET) {
    out.push({ name: 'clean (no noise)', fps, trials: STD_TRIALS(), film: { noise: 0, dropRate: 0, missRate: 0 }, seeds: 1 });
    out.push({ name: 'realistic noise', fps, trials: STD_TRIALS(), seeds });
    out.push({ name: 'heavy noise (2x)', fps, trials: STD_TRIALS(), film: { noise: 2 }, seeds });
    out.push({ name: 'bent-knee landing', fps, trials: STD_TRIALS({ landKnee: 0.2 }), seeds });
    out.push({ name: 'tucked flight', fps, trials: STD_TRIALS({ tuck: 0.35 }), seeds });
    out.push({ name: 'flat-foot landing', fps, trials: STD_TRIALS({ landToeDeg: 0 }), seeds });
    out.push({ name: 'partial occlusion', fps, trials: STD_TRIALS(), film: { occlusion: { burstsPerS: 0.6, burstMs: 120 } }, seeds });
    out.push({ name: 'motion blur', fps, trials: STD_TRIALS(), film: { blur: true }, seeds });
    out.push({ name: 'drops 10%', fps, trials: STD_TRIALS(), film: { dropRate: 0.1, missRate: 0.03 }, seeds });
    out.push({
      name: 'decoys (squat, calf raise, hop, step)', fps, trials: STD_TRIALS(),
      decoys: [{ decoy: { kind: 'squat', depth: 0.6 } }, { decoy: { kind: 'calfRaise', deg: 35 } }, { decoy: { kind: 'hop', heightM: 0.025 } }, { decoy: { kind: 'step', dz: 0.25 } }],
      seeds,
    });
  }
  return out;
}

/** A markdown table of results. */
export function table(rs: readonly ConditionResult[]): string {
  const head = '| condition | fps | trials | read | missed | false valid | bias vs force plate (cm) | SD | MAE | p95 abs | bias vs true flight (cm) | SD | take-off ±1 frame | landing ±1 frame |';
  const pc = (x: number) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '–');
  const rows = rs.map((r) => `| ${r.name}${r.calibRefused ? ` (stand refused ${r.calibRefused}×)` : ''} | ${r.fps} | ${r.trials} | ${r.read} | ${r.missed} | ${r.falseValid}${r.decoys ? `/${r.decoys}` : ''} | ${fmt(r.biasV0)} | ${fmt(r.sdV0).replace('+', '')} | ${fmt(r.maeV0).replace('+', '')} | ${fmt(r.p95V0).replace('+', '')} | ${fmt(r.biasFlight)} | ${fmt(r.sdFlight).replace('+', '')} | ${pc(r.takeoffIn1)} | ${pc(r.landIn1)} |`);
  return [head, '|' + '---|'.repeat(14), ...rows].join('\n');
}
const fmt = (x: number) => (Number.isFinite(x) ? (x > 0 ? `+${x.toFixed(2)}` : x.toFixed(2)) : '–');
