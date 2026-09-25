// _hoops-motion-compare — two _hoops-motion-probe tags side by side (the before / after of a phase), per catalogue action.
// Same shape as _dunk-motion-compare, plus the hoops columns (foot slide, the ball against the palm, the release against the apex,
// which hand, as drawn).
//   npx tsx scripts/probes/_hoops-motion-compare.mts p1-baseline/base p3        (tags under ~/Claude/outbox/finish-release/hoopsmotion, or absolute dirs)
//   ONLY=hero_ · FAMILY=handles — filter the rows
import fs from 'node:fs';
const [A, B] = process.argv.slice(2);
if (!A || !B) { console.log('usage: _hoops-motion-compare.mts <tagA> <tagB>'); process.exit(1); }
const dir = (t: string) => (t.startsWith('/') ? t : `${process.env.HOME}/Claude/outbox/finish-release/hoopsmotion/${t}`);
type M = { id: string; family: string; subject: string; sparcMean: number; popsN: number; severe: number; whips: number; lockedElbow: number; lockedKnee: number; wristStill: number; thoracicStill: number;
  foot: { p90Cm: number; skates: number }; ball: { gapP90: number | null; heldVis: Record<string, number> }; release: { relToApexMs: number | null; vis: string } | null; clips: string[]; visual: { verdict: string } };
const load = (t: string): M[] => JSON.parse(fs.readFileSync(`${dir(t)}/metrics.json`, 'utf8'));
const only = process.env.ONLY ?? '', fam = process.env.FAMILY ?? '';
const keep = (m: M) => (!only || m.id.includes(only)) && (!fam || m.family === fam);
const a = new Map(load(A).filter(keep).map((m) => [m.id, m])), b = new Map(load(B).filter(keep).map((m) => [m.id, m]));
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const f = (x: number | null | undefined) => (x == null || !isFinite(x) ? '-' : String(Math.round(x * 100) / 100));
const ab = (x: number | null | undefined, y: number | null | undefined) => `${f(x)} → ${f(y)}`;
const hand = (m: M) => (m.release?.vis ? m.release.vis : (m.ball.heldVis.R ?? 0) > (m.ball.heldVis.L ?? 0) ? 'R' : (m.ball.heldVis.L ?? 0) > 0 ? 'L' : '-');
console.log(`${pad('action', 26)}${pad('SPARC', 16)}${pad('pops(sev)', 16)}${pad('whips', 11)}${pad('elbow', 11)}${pad('knee', 9)}${pad('wrist still', 14)}${pad('thor still', 14)}${pad('slide p90 cm', 15)}${pad('ball p90', 14)}${pad('rel-apex ms', 14)}hand (drawn)`);
const sum = { sa: 0, sb: 0, pa: 0, pb: 0, va: 0, vb: 0, wa: 0, wb: 0, ea: 0, eb: 0, fa: 0, fb: 0, n: 0 };
for (const [k, x] of a) {
  const y = b.get(k); if (!y) { console.log(`${pad(k, 26)}(only in ${A})`); continue; }
  console.log(`${pad(k, 26)}${pad(ab(x.sparcMean, y.sparcMean), 16)}${pad(`${x.popsN}(${x.severe}) → ${y.popsN}(${y.severe})`, 16)}${pad(`${x.whips} → ${y.whips}`, 11)}${pad(`${x.lockedElbow} → ${y.lockedElbow}`, 11)}${pad(`${x.lockedKnee} → ${y.lockedKnee}`, 9)}${pad(ab(x.wristStill, y.wristStill), 14)}${pad(ab(x.thoracicStill, y.thoracicStill), 14)}${pad(ab(x.foot.p90Cm, y.foot.p90Cm), 15)}${pad(ab(x.ball.gapP90, y.ball.gapP90), 14)}${pad(ab(x.release?.relToApexMs, y.release?.relToApexMs), 14)}${hand(x)} → ${hand(y)}`);
  if (x.clips.join() !== y.clips.join()) console.log(`${pad('', 26)}clips  ${x.clips.join(' → ').slice(0, 90)}\n${pad('', 26)}   →   ${y.clips.join(' → ').slice(0, 90)}`);
  if (x.visual.verdict !== y.visual.verdict) console.log(`${pad('', 26)}visual ${x.visual.verdict} → ${y.visual.verdict}`);
  sum.sa += x.sparcMean; sum.sb += y.sparcMean; sum.pa += x.popsN; sum.pb += y.popsN; sum.va += x.severe; sum.vb += y.severe; sum.wa += x.whips; sum.wb += y.whips; sum.ea += x.lockedElbow; sum.eb += y.lockedElbow; sum.fa += x.foot.p90Cm; sum.fb += y.foot.p90Cm; sum.n++;
}
for (const k of b.keys()) if (!a.has(k)) console.log(`${pad(k, 26)}(only in ${B})`);
const n = sum.n || 1;
console.log(`\nmean over ${sum.n} actions: SPARC ${f(sum.sa / n)} → ${f(sum.sb / n)} · pops ${f(sum.pa / n)} → ${f(sum.pb / n)} · severe ${f(sum.va / n)} → ${f(sum.vb / n)} · whips ${f(sum.wa / n)} → ${f(sum.wb / n)} · locked-elbow frames ${f(sum.ea / n)} → ${f(sum.eb / n)} · slide p90 ${f(sum.fa / n)} → ${f(sum.fb / n)} cm`);
