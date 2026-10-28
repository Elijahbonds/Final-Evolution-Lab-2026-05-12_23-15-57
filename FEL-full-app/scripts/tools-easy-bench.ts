// tools-easy-bench — the readiness check's and the combine jump station's LIVE takes on the bench (TOOLS-EASY, 2026-10-28).
// Not a test suite (no -tests suffix); tests/tools-easy pins what it found.
//   npx tsx scripts/tools-easy-bench.ts [--tool readiness|combine] [--impl after|before] [--seeds 4] [--fps 30,60] [--only <substr>] [--json]
// `--impl before` reads the lane's base takes from .tools-easy-before/ (copied from git objects, never a worktree):
//   git show e4c72630:FEL-full-app/lib/coach/readiness/capture.ts > .tools-easy-before/capture.ts   (and lib/combine/jumpTake.ts)
// Per condition: runs that reached a number on the first try, seconds from the first camera frame to the stand read and
// to the number, the jumps the athlete had to do, every on-screen refusal line, and the shown best vs the truth
// (bias / SD, cm). The athlete is lib/tools-easy/sim.ts.
import { simulateTake, type TakeLike, type TakeSimOptions, type TrialBlock } from '../lib/tools-easy/sim';
import type { TrialSpec } from '../lib/jump/ballistic';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const tool = (arg('tool') ?? 'readiness') as 'readiness' | 'combine';
const impl = arg('impl') ?? 'after';
const seeds = Number(arg('seeds') ?? 4);
const fpsList = (arg('fps') ?? '30,60').split(',').map(Number);
const only = arg('only');

// a day's jumps sit close together (a real athlete's jump-to-jump spread is a few percent; a spread like the vertical
// bench's 32 / 42 / 50 cm reads its top jump as an outlier, lib/jump/session.ts)
const H = [0.42, 0.43, 0.41, 0.44, 0.42, 0.4];
const hips = (n = 6, o: Partial<TrialSpec> = {}): TrialSpec[] => H.slice(0, n).map((h) => ({ heightM: h, ...o }));
interface Cond { name: string; blocks: TrialBlock[]; film?: TakeSimOptions['film']; restS?: number }
export const CONDITIONS: Cond[] = [
  { name: 'clean', blocks: [{ trials: hips() }], film: { noise: 0, dropRate: 0, missRate: 0 } },
  { name: 'realistic noise', blocks: [{ trials: hips() }] },
  { name: 'drops 10%', blocks: [{ trials: hips() }], film: { dropRate: 0.1, missRate: 0.03 } },
  { name: 'heavy noise (2x)', blocks: [{ trials: hips() }], film: { noise: 2 } },
  { name: 'bent-knee landing', blocks: [{ trials: hips(6, { landKnee: 0.2 }) }] },
  { name: 'quick re-jump (0.3 s rest)', blocks: [{ trials: hips() }], restS: 0.3 },
  // a first-timer swings the arms on the first jump (the hands-on-hips rule), then keeps the hands on the hips
  { name: 'first jump with arm swing', blocks: [{ trials: [{ heightM: 0.44 }], style: { armSwing: true } }, { trials: hips(5) }] },
  { name: 'first two with arm swing', blocks: [{ trials: [{ heightM: 0.44 }, { heightM: 0.46 }], style: { armSwing: true } }, { trials: hips(5) }] },
];

async function maker(fps: number): Promise<() => TakeLike> {
  const aspect = 4 / 3;   // the synth's camera is 640 × 480
  if (tool === 'readiness') {
    const m = impl === 'before' ? await import('../.tools-easy-before/capture') : await import('../lib/coach/readiness/capture');
    return () => new m.ReadinessCapture({ aspect, cameraFps: fps }) as unknown as TakeLike;
  }
  const m = impl === 'before' ? await import('../.tools-easy-before/jumpTake') : await import('../lib/combine/jumpTake');
  return () => new m.JumpTake({ jumps: 3, aspect, cameraFps: fps }) as unknown as TakeLike;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

async function main() {
const rows: Record<string, unknown>[] = [];
for (const fps of fpsList) {
  const make = await maker(fps);
  for (const c of CONDITIONS) {
    if (only && !c.name.includes(only)) continue;
    const runs = Array.from({ length: seeds }, (_, s) => simulateTake({ fps, seed: s + 1, blocks: c.blocks, film: c.film, restS: c.restS, make }));
    const ok = runs.filter((r) => r.ok);
    const err = ok.filter((r) => r.bestCm != null && r.truthBestCm != null).map((r) => r.bestCm! - r.truthBestCm!);
    const lines = new Map<string, number>();
    for (const r of runs) for (const l of r.shown) lines.set(l, (lines.get(l) ?? 0) + 1);
    const whys = new Map<string, number>();
    for (const r of runs) if (!r.ok && r.why) whys.set(r.why, (whys.get(r.why) ?? 0) + 1);
    const counted = ok.map((r) => {
      const res = r.result as { jumps?: { jumps: number }; attempts?: { value: number | null }[] };
      return res.jumps?.jumps ?? res.attempts?.filter((a) => a.value != null).length ?? 0;
    });
    rows.push({
      tool, impl, fps, condition: c.name,
      firstTry: `${ok.length}/${runs.length}`,
      standS: r1(mean(runs.filter((r) => r.standMs != null).map((r) => r.standMs! / 1000))),
      numberS: ok.length ? `${r1(mean(ok.map((r) => r.numberMs! / 1000)))} / ${r1(Math.max(...ok.map((r) => r.numberMs! / 1000)))}` : '–',
      jumpsDone: r1(mean(runs.map((r) => r.jumpsDone))),
      counted: counted.length ? r1(mean(counted)) : 0,
      biasSd: err.length ? `${r2(mean(err))} / ${r2(sd(err))}` : '–',
      shown: [...lines].map(([l, n]) => `${l} ×${n}`).join(' | ') || '–',
      noNumber: [...whys].map(([l, n]) => `${l} ×${n}`).join(' | ') || '–',
      said: runs[0]?.said.join(' / ') || '–',
    });
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else for (const r of rows) console.log(Object.values(r).join('\t'));
}
void main();
