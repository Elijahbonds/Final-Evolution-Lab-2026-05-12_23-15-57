// _dunk-motion-compare — two _dunk-motion-probe tags side by side (the before / after of a phase).
//   npx tsx scripts/probes/_dunk-motion-compare.mts base p2
import fs from 'node:fs';
const [A, B] = process.argv.slice(2);
const dir = `${process.env.HOME}/Claude/outbox/finish-release/dunkmotion`;
type M = { trick: string; sparcMean: number; pops: unknown[]; whips: number; runFrames?: number; runWing?: number; runElbowMean?: number | null; lockedElbow: number; lockedKnee: number; heldFrac: Record<string, number>; ballFar: number; rimHandAtContact: number | null; clips: string[] };
const load = (t: string): M[] => JSON.parse(fs.readFileSync(`${dir}/${t}/metrics.json`, 'utf8'));
const a = new Map(load(A).map((m) => [m.trick, m])), b = new Map(load(B).map((m) => [m.trick, m]));
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const f = (x: number | undefined) => (x == null || !isFinite(x) ? '-' : String(Math.round(x * 100) / 100));
console.log(`${pad('trick', 16)}${pad('SPARC', 16)}${pad('pops', 12)}${pad('whips', 12)}${pad('elbow', 12)}${pad('knee', 10)}${pad('still hands', 14)}${pad('Spine2', 12)}rimH`);
const sum = { sa: 0, sb: 0, pa: 0, pb: 0, ea: 0, eb: 0, wa: 0, wb: 0, n: 0 };
for (const [k, x] of a) {
  const y = b.get(k); if (!y) continue;
  const hands = (m: M) => ((m.heldFrac.LeftHand ?? 0) + (m.heldFrac.RightHand ?? 0)) / 2;
  console.log(`${pad(k, 16)}${pad(`${f(x.sparcMean)} → ${f(y.sparcMean)}`, 16)}${pad(`${x.pops.length} → ${y.pops.length}`, 12)}${pad(`${x.whips} → ${y.whips}`, 12)}${pad(`${x.lockedElbow} → ${y.lockedElbow}`, 12)}${pad(`${x.lockedKnee} → ${y.lockedKnee}`, 10)}${pad(`${f(hands(x))} → ${f(hands(y))}`, 14)}${pad(`${f(x.heldFrac.Spine2)} → ${f(y.heldFrac.Spine2)}`, 12)}${f(x.rimHandAtContact ?? NaN)} → ${f(y.rimHandAtContact ?? NaN)}`);
  sum.sa += x.sparcMean; sum.sb += y.sparcMean; sum.pa += x.pops.length; sum.pb += y.pops.length; sum.wa += x.whips; sum.wb += y.whips; sum.ea += x.lockedElbow; sum.eb += y.lockedElbow; sum.n++;
}
const rw = [...a.values()].map((x) => [x.trick, x.runWing, b.get(x.trick)?.runWing, x.runFrames]).filter((r) => r[1] != null || r[2] != null);
if (rw.length) console.log(`run-up wing frames (of ~${rw[0][3] ?? '?'}): ` + rw.map((r) => `${r[0]} ${r[1] ?? '-'}→${r[2] ?? '-'}`).join(' · '));
console.log(`\nmean over ${sum.n}: SPARC ${f(sum.sa / sum.n)} → ${f(sum.sb / sum.n)} · pops ${f(sum.pa / sum.n)} → ${f(sum.pb / sum.n)} · whips ${f(sum.wa / sum.n)} → ${f(sum.wb / sum.n)} · locked-elbow frames ${f(sum.ea / sum.n)} → ${f(sum.eb / sum.n)}`);
