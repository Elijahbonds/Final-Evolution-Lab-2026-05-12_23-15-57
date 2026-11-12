// dropBench — the drop-jump conditions of the accuracy bench (JUMP-PRO 2, 2026-10-25). Each take is one drop jump
// (lib/jump/dropTake.ts) filmed side-on through lib/pose/synth.ts, read by lib/jump/drop.ts, scored against the
// joints' truth: the rebound's force-plate height, the contact time, RSI. Run it: `npx tsx scripts/jump-accuracy.ts --drop`.
//
// Pure, deterministic.
import { filmTake, type FilmOptions } from './ballistic';
import { APPROACH_CAMERA } from './approachTake';
import { buildDrop, type DropSpec, type DropTruth } from './dropTake';
import { readDrop } from './drop';

export interface DropCondition { name: string; fps: number; specs: Omit<DropSpec, 'heightM'>[]; heights?: number[]; film?: Omit<FilmOptions, 'fps' | 'seed'>; seeds?: number }

export interface DropRow {
  name: string; fps: number; trials: number; read: number; missed: number;
  /** The rebound's height vs the force plate (cm). */
  biasCm: number; sdCm: number;
  /** Contact time (ms) and RSI (%) errors; the share of contacts inside their own 95 % range. */
  contactBiasMs: number; contactSdMs: number; contactWithin95: number;
  /** The contact's own claimed ±1 SD, averaged (ms): what the ± promises, against the SD it keeps. */
  claimedSdMs: number;
  rsiBiasPct: number; rsiSdPct: number;
  /** The box's height read against its truth (cm). */
  boxBiasCm: number; boxSdCm: number;
  reasons: Record<string, number>;
}

/** The drop-jump camera: side-on, 3 m out (a box and a rebound need less room than a run-up, so the phone comes closer). */
export const DROP_CAMERA_M = 3;

/** The rebound heights (m, centre of mass): a modest and a good drop-jump rebound. */
export const DROP_HEIGHTS = [0.25, 0.38];

export function dropConditions(seeds = 4): DropCondition[] {
  const out: DropCondition[] = [];
  const boxes = [0.3, 0.38, 0.45];
  for (const fps of [30, 60, 120, 240]) {
    out.push({ name: '30–45 cm box, 200 ms contact', fps, specs: boxes.map((boxM) => ({ boxM, contactMs: 200 })), seeds });
    out.push({ name: 'fast contact (150 ms)', fps, specs: boxes.map((boxM) => ({ boxM, contactMs: 150 })), seeds });
    out.push({ name: 'slow contact (300 ms)', fps, specs: boxes.map((boxM) => ({ boxM, contactMs: 300 })), seeds });
    out.push({ name: 'bent-knee landing', fps, specs: boxes.map((boxM) => ({ boxM, contactMs: 200, landKnee: 0.3 })), seeds });
    out.push({ name: 'motion blur', fps, specs: boxes.map((boxM) => ({ boxM, contactMs: 200 })), film: { blur: true }, seeds });
  }
  return out;
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v: number[]) => { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Every take of a condition, filmed: frames and truth. */
export function dropTakes(c: DropCondition) {
  const out: { frames: ReturnType<typeof filmTake>['frames']; truth: DropTruth }[] = [];
  for (let seed = 1; seed <= (c.seeds ?? 4); seed++) {
    for (const sp of c.specs) for (const h of c.heights ?? DROP_HEIGHTS) {
      const take = buildDrop({ ...sp, heightM: h });
      const { frames } = filmTake({ clip: take.clip, truth: take.truth, decoys: 0 }, { fps: c.fps, seed: seed * 131 + Math.round(sp.boxM * 100) + Math.round(h * 1000), distance: DROP_CAMERA_M, ...c.film });
      out.push({ frames, truth: take.truth[0] });
    }
  }
  return out;
}

export function runDrop(c: DropCondition): DropRow {
  const h: number[] = [], ct: number[] = [], rsi: number[] = [], bx: number[] = [], cl: number[] = [];
  let inside = 0, trials = 0, missed = 0;
  const reasons: Record<string, number> = {};
  for (const { frames, truth } of dropTakes(c)) {
    trials++;
    const r = readDrop(frames, { aspect: 4 / 3, poseHz: c.fps });
    const d = r.drops.find((x) => Math.abs(x.takeoffT - truth.takeoffT) < 150);
    if (!d || !d.valid || d.rsi === null) { missed++; const why = d?.invalidWhy ?? r.why ?? 'not found'; reasons[why] = (reasons[why] ?? 0) + 1; continue; }
    h.push(d.heightCm - truth.heightV0Cm);
    ct.push(d.contactMs - truth.contactMs);
    cl.push(d.contactSdMs);
    if (Math.abs(d.contactMs - truth.contactMs) <= 1.96 * d.contactSdMs) inside++;
    rsi.push((d.rsi / truth.rsi - 1) * 100);
    if (d.boxCm !== null) bx.push(d.boxCm - truth.boxCm);
  }
  return {
    name: c.name, fps: c.fps, trials, read: h.length, missed,
    biasCm: r2(mean(h)), sdCm: r2(sd(h)), contactBiasMs: r2(mean(ct)), contactSdMs: r2(sd(ct)), contactWithin95: h.length ? r2(inside / h.length) : NaN, claimedSdMs: r2(mean(cl)),
    rsiBiasPct: r2(mean(rsi)), rsiSdPct: r2(sd(rsi)), boxBiasCm: r2(mean(bx)), boxSdCm: r2(sd(bx)), reasons,
  };
}

const f = (x: number) => (Number.isFinite(x) ? (x > 0 ? `+${x.toFixed(2)}` : x.toFixed(2)) : '–');
export function dropTable(rs: readonly DropRow[]): string {
  return ['| condition | fps | trials | read | missed | height bias (cm) | SD | contact bias (ms) | SD | claimed SD | contact inside its ±95 % | RSI bias (%) | SD | box bias (cm) | SD |', '|' + '---|'.repeat(15),
    ...rs.map((r) => `| ${r.name} | ${r.fps} | ${r.trials} | ${r.read} | ${r.missed} | ${f(r.biasCm)} | ${r.sdCm.toFixed(2)} | ${f(r.contactBiasMs)} | ${r.contactSdMs.toFixed(2)} | ${r.claimedSdMs.toFixed(1)} | ${Number.isFinite(r.contactWithin95) ? Math.round(r.contactWithin95 * 100) + '%' : '–'} | ${f(r.rsiBiasPct)} | ${r.rsiSdPct.toFixed(2)} | ${f(r.boxBiasCm)} | ${r.boxSdCm.toFixed(2)} |`)].join('\n');
}
