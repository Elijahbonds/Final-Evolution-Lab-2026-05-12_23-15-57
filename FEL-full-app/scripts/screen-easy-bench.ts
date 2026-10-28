// screen-easy-bench — the FULL Quick Screen's live flow on the bench (SCREEN-EASY, 2026-10-28). Not a test suite (no
// -tests suffix); tests/screen-easy pins what it found.
//   npx tsx scripts/screen-easy-bench.ts [--seeds 4] [--fps 30] [--only <condition substring>] [--json] [--said]
// Per condition: runs that reached the result, camera-on → result (s, mean / max), the taps inside the camera flow, the
// refusals per part (spoken line ×n), the lines cut off by the next one, and how the time splits by runner step. The
// athlete is lib/screen-easy/sim.ts (how long a person takes to turn or reach a wall is its MOVE_S assumption).
import { simulateFullScreen, type FullSimOptions, type FullSimResult } from '../lib/screen-easy/sim';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const seeds = Number(arg('seeds') ?? 4);
const fpsList = (arg('fps') ?? '30').split(',').map(Number);
const only = arg('only');

export interface Cond { name: string; o: Omit<FullSimOptions, 'fps' | 'seed'> }
/** A first-timer's mistakes: one rep of each check that does not count (heel up, foot down, hands off the hips). */
export const FIRST_TIMER: FullSimOptions['moves'] = {
  t2: { left: { perRep: (i) => (i === 1 ? { heelLiftM: 0.04 } : {}) } },
  t3: { left: { perRep: (i) => (i === 1 ? { touchDown: true } : {}) } },
  t5: [{ heightM: 0.4 }, { heightM: 0.45, armSwing: true }, { heightM: 0.42 }],
};
export const CONDITIONS: Cond[] = [
  { name: 'clean', o: {} },
  { name: 'realistic noise', o: { noise: true } },
  { name: 'realistic + 1% missed frames', o: { noise: true, dropRate: 0.01 } },
  { name: 'realistic + 10% missed frames', o: { noise: true, dropRate: 0.1 } },
  { name: 'first-timer mistakes (realistic)', o: { noise: true, dropRate: 0.01, moves: FIRST_TIMER } },
  { name: "no wall (realistic)", o: { noise: true, dropRate: 0.01, wall: false } },
];

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '–');

export interface Row {
  name: string; fps: number; runs: number; done: number; sec: number; secMax: number; taps: number; hands: number; cut: number;
  refused: Record<string, Record<string, number>>; restarts: number; perPart: Record<string, number>; bySteps: Record<string, number>;
  scores: string[];
}

export function runBench(conds: readonly Cond[], fpsSet: readonly number[], nSeeds: number, extra: Partial<FullSimOptions> = {}): Row[] {
  const rows: Row[] = [];
  for (const fps of fpsSet) for (const c of conds) {
    const runs: FullSimResult[] = [];
    for (let seed = 1; seed <= nSeeds; seed++) runs.push(simulateFullScreen({ ...c.o, ...extra, fps, seed }));
    const secs = runs.filter((r) => r.numberMs != null).map((r) => r.numberMs! / 1000);
    const refused: Row['refused'] = {};
    const perPart: Record<string, number[]> = {};
    const bySteps: Record<string, number[]> = {};
    for (const r of runs) {
      for (const p of r.parts) {
        for (const x of p.refused) { (refused[p.part] ??= {}); refused[p.part][x] = (refused[p.part][x] ?? 0) + 1; }
        (perPart[p.part] ??= []).push(((p.endMs ?? p.startMs) - p.startMs) / 1000);
      }
      for (const [k, ms] of Object.entries(r.steps)) (bySteps[k] ??= []).push((ms ?? 0) / 1000);
    }
    rows.push({
      name: c.name, fps, runs: runs.length, done: runs.filter((r) => r.done).length, sec: mean(secs), secMax: secs.length ? Math.max(...secs) : NaN,
      taps: mean(runs.map((r) => r.taps)), hands: mean(runs.map((r) => r.handsUp)), cut: mean(runs.map((r) => r.cut.length)),
      refused, restarts: runs.reduce((a, r) => a + r.parts.reduce((b, p) => b + p.restarts, 0), 0),
      perPart: Object.fromEntries(Object.entries(perPart).map(([k, v]) => [k, mean(v)])),
      bySteps: Object.fromEntries(Object.entries(bySteps).map(([k, v]) => [k, mean(v)])),
      scores: [...new Set(runs.map((r) => (r.result?.tests ?? []).map((x) => `${x.id}:${x.status === 'scored' ? x.score03 : x.status}`).join(' ')))],
    });
  }
  return rows;
}

export function benchTable(rows: readonly Row[]): string {
  const head = '| condition | fps | runs to a result | camera → result (s, mean / max) | walks to the phone (taps) | hands-up answers | lines cut off | refusals (part: line ×n) | part restarts | scores |';
  return [head, '|---|---|---|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.name} | ${r.fps} | ${r.done}/${r.runs} | ${f1(r.sec)} / ${f1(r.secMax)} | ${f1(r.taps)} | ${f1(r.hands)} | ${f1(r.cut)} | ${Object.entries(r.refused).map(([p, m]) => `${p}: ${Object.entries(m).map(([k, n]) => `"${k}" ×${n}`).join(', ')}`).join('; ') || '–'} | ${r.restarts} | ${r.scores.join(' / ')} |`)].join('\n');
}

export function stepTable(rows: readonly Row[]): string {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.bySteps)))];
  return [`| condition | ${keys.join(' | ')} |`, `|---|${keys.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.name} (${r.fps}) | ${keys.map((k) => f1(r.bySteps[k] ?? 0)).join(' | ')} |`)].join('\n');
}

if (process.argv[1]?.includes('screen-easy-bench')) {
  const t0 = Date.now();
  const rows = runBench(CONDITIONS.filter((c) => !only || c.name.includes(only)), fpsList, seeds);
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows));
  else { console.log(benchTable(rows)); console.log('\nseconds by runner step (mean):\n'); console.log(stepTable(rows)); }
  if (process.argv.includes('--parts')) {
    // where the time goes, part by part (one realistic run): hearing the move and getting there (the athlete), waiting on
    // the runner once in place (the set-up line, the 1 s shot hold, the still hold), the 3-2-1, the reps, then the beat after
    const r = simulateFullScreen({ noise: true, dropRate: 0.01, fps: fpsList[0], seed: 1 });
    const s = (ms: number) => (ms / 1000).toFixed(1);
    console.log('\n| part | hear + get there | wait in place | 3-2-1 | reps | after (done beat / pain check) |\n|---|---|---|---|---|---|');
    r.parts.forEach((p, i) => {
      const next = r.parts[i + 1]?.startMs ?? r.numberMs!;
      const go = p.countMs ?? p.activeMs!;
      console.log(`| ${p.part} | ${s(p.arriveMs - p.startMs)} | ${s(Math.max(0, go - p.arriveMs))} | ${s(p.activeMs! - go)} | ${s(p.endMs! - p.activeMs!)} | ${s(next - p.endMs!)} |`);
    });
    console.log(`\nbefore the first part (framing + the 3 s stand): ${s(r.parts[0].startMs)} s; total ${s(r.numberMs!)} s`);
  }
  if (process.argv.includes('--said')) {
    const r = simulateFullScreen({ noise: true, dropRate: 0.01, fps: fpsList[0], seed: 1 });
    for (const s of r.said) console.log(`${(s.at / 1000).toFixed(1).padStart(6)}  ${s.text}`);
    console.log('\ncut off:'); for (const c of r.cut) console.log(`${(c.at / 1000).toFixed(1).padStart(6)}  heard ${(c.heardMs / 1000).toFixed(1)} of ${(c.needMs / 1000).toFixed(1)} s: ${c.text}`);
    console.log('\nparts:'); for (const p of r.parts) console.log(`${p.part.padEnd(9)} start ${(p.startMs / 1000).toFixed(1)} go ${p.activeMs != null ? (p.activeMs / 1000).toFixed(1) : '–'} end ${p.endMs != null ? (p.endMs / 1000).toFixed(1) : '–'} clips ${p.attempts} restarts ${p.restarts}`);
  }
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
