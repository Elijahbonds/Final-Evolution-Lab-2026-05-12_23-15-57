// vertical-easy-bench — the jump-only LIVE flow on the bench (VERTICAL-EASY, 2026-10-27). Not a test suite (no -tests
// suffix); tests/vertical-easy pins what it found.
//   npx tsx scripts/vertical-easy-bench.ts [--seeds 6] [--fps 30,60] [--only <condition substring>] [--json]
// Per condition: how many runs reached a number, the jumps the athlete had to do for three counted, the auto-detect rate
// (counted / jumped), every refusal by its spoken line and the grader's reason, the seconds from the first camera frame
// to the number, and the shown best vs the truth (bias / SD, cm). The athlete is lib/vertical/sim.ts.
import { simulateLiveJump, type LiveSimOptions } from '../lib/vertical/sim';
import type { TrialSpec } from '../lib/jump/ballistic';
import type { PoseFrame } from '../lib/pose/landmarks';
import { readFileSync } from 'node:fs';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const seeds = Number(arg('seeds') ?? 6);
const fpsList = (arg('fps') ?? '30,60').split(',').map(Number);
const only = arg('only');

const H = [0.32, 0.42, 0.5];
const six = (o: Partial<TrialSpec> = {}): TrialSpec[] => [...H, 0.4, 0.45, 0.38].map((h) => ({ heightM: h, ...o }));
interface Cond { name: string; o: Omit<LiveSimOptions, 'fps' | 'seed'> }
export const CONDITIONS: Cond[] = [
  { name: 'clean stand-and-jump', o: { trials: six(), film: { noise: 0, dropRate: 0, missRate: 0 } } },
  { name: 'realistic noise', o: { trials: six() } },
  { name: 'heavy noise (2x)', o: { trials: six(), film: { noise: 2 } } },
  { name: 'bent-knee landing', o: { trials: six({ landKnee: 0.2 }) } },
  { name: 'flat-foot landing', o: { trials: six({ landToeDeg: 0 }) } },
  { name: 'tucked flight', o: { trials: six({ tuck: 0.35 }) } },
  { name: 'partial occlusion', o: { trials: six(), film: { occlusion: { burstsPerS: 0.6, burstMs: 120 } } } },
  { name: 'motion blur (dim room)', o: { trials: six(), film: { blur: true } } },
  { name: 'drops 10%', o: { trials: six(), film: { dropRate: 0.1, missRate: 0.03 } } },
  { name: 'quick re-jump (0.3 s rest)', o: { trials: six(), restS: 0.3 } },
  { name: 'no rest (stands 0 s)', o: { trials: six(), restS: 0 } },
  { name: 'arm swing', o: { trials: six(), style: { armSwing: true } } },
  { name: 'phone close (2 m)', o: { trials: six(), film: { distance: 2.0 } } },
  { name: 'phone far (4.5 m)', o: { trials: six(), film: { distance: 4.5 } } },
];

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v: number[]) => { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const f2 = (x: number) => (Number.isFinite(x) ? (x > 0 ? '+' : '') + x.toFixed(2) : '–');

export interface Row { name: string; fps: number; runs: number; done: number; jumped: number; counted: number; rate: number; sec: number; secMax: number; bias: number; sd: number; reasons: Record<string, number> }
export function runBench(conds: readonly Cond[], fpsSet: readonly number[], nSeeds: number): Row[] {
  const rows: Row[] = [];
  for (const fps of fpsSet) for (const c of conds) {
    let done = 0, jumped = 0, counted = 0;
    const secs: number[] = [], errs: number[] = [];
    const reasons: Record<string, number> = {};
    for (let seed = 1; seed <= nSeeds; seed++) {
      const r = simulateLiveJump({ ...c.o, fps, seed });
      if (r.done) done++;
      const used = r.graded.length;
      jumped += used; counted += r.counted;
      for (const g of r.graded) if (!g.valid) reasons[g.why ?? 'not read'] = (reasons[g.why ?? 'not read'] ?? 0) + 1;
      if (r.numberMs != null) secs.push(r.numberMs / 1000);
      if (r.bestCm != null && r.truthBestCm != null) errs.push(r.bestCm - r.truthBestCm);
      if (!r.done) reasons['no number'] = (reasons['no number'] ?? 0) + 1;
    }
    rows.push({ name: c.name, fps, runs: nSeeds, done, jumped, counted, rate: jumped ? counted / jumped : NaN, sec: mean(secs), secMax: secs.length ? Math.max(...secs) : NaN, bias: mean(errs), sd: sd(errs), reasons });
  }
  return rows;
}

export function benchTable(rows: readonly Row[]): string {
  const head = '| condition | fps | runs to a number | jumps done | counted | auto-detect | camera → number (s, mean / max) | best vs truth bias / SD (cm) | refusals (grader reason ×n) |';
  return [head, '|---|---|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.name} | ${r.fps} | ${r.done}/${r.runs} | ${r.jumped} | ${r.counted} | ${Number.isFinite(r.rate) ? Math.round(r.rate * 100) + '%' : '–'} | ${f1(r.sec)} / ${f1(r.secMax)} | ${f2(r.bias)} / ${f2(r.sd).replace('+', '')} | ${Object.entries(r.reasons).map(([k, n]) => `${k} ×${n}`).join('; ') || '–'} |`)].join('\n');
}

/** The owner's recorded jump streams (lib/pose/__fixtures__), through the live flow. The stand is the take's own last
 *  frame held (the athlete standing after the last landing), so the calibration's floor is the take's own floor. */
export function recordedRuns(): { name: string; jumps: number; counted: number; numberMs: number | null; best: number | null; truthBest: number; reasons: string[] }[] {
  const out = [];
  for (const name of ['jump_two_foot_low', 'jump_two_foot_high']) {
    const fx = JSON.parse(readFileSync(`${__dirname}/../lib/pose/__fixtures__/${name}.json`, 'utf8')) as { frames: PoseFrame[]; gt: { jumps: { heightFlightM: number }[] } };
    const last = fx.frames[fx.frames.length - 1];
    const stand = Array.from({ length: 90 }, () => last);
    const truthCm = fx.gt.jumps.map((g) => g.heightFlightM * 100);
    const r = simulateLiveJump({ fps: 30, trials: [], clip: { stand, jump: fx.frames, truthCm } });
    out.push({ name, jumps: truthCm.length, counted: r.counted, numberMs: r.numberMs, best: r.bestCm, truthBest: Math.max(...truthCm), reasons: r.graded.filter((g) => !g.valid).map((g) => g.why ?? 'not read') });
  }
  return out;
}

if (process.argv[1]?.includes('vertical-easy-bench') && process.argv.includes('--recorded')) {
  console.log(JSON.stringify(recordedRuns(), null, 1));
  process.exit(0);
}

if (process.argv[1]?.includes('vertical-easy-bench')) {
  const t0 = Date.now();
  const rows = runBench(CONDITIONS.filter((c) => !only || c.name.includes(only)), fpsList, seeds);
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows));
  else console.log(benchTable(rows));
  const all = rows.reduce((a, r) => ({ j: a.j + r.jumped, c: a.c + r.counted, d: a.d + r.done, n: a.n + r.runs }), { j: 0, c: 0, d: 0, n: 0 });
  console.log(`\nall: ${all.d}/${all.n} runs reached a number; auto-detect ${all.c}/${all.j} = ${Math.round((all.c / all.j) * 100)}% (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
