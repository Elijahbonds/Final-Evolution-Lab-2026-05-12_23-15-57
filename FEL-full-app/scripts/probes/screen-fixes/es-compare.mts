// SCREEN-FIXES (2026-11-10): two every-screen crawls side by side (scripts/every-screen/score.mts route folders). Prints the
// scorecard's number for each (screens passing all four checks, and per check), every screen whose verdict changed, and
// every fault a screen has AFTER that it did not have BEFORE (the "no new fault anywhere" gate). Re-judges both crawls with
// the CURRENT rules (lib/every-screen/judge.ts) so a rule change between them cannot pass for a fix.
//   npx tsx scripts/probes/screen-fixes/es-compare.mts <before routes dir> <after routes dir> [--json=<out>]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as judgeNs from '../../../lib/every-screen/judge.ts';

const { judge } = ((judgeNs as { default?: unknown }).default ?? judgeNs) as typeof judgeNs;
const [beforeDir, afterDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const jsonOut = process.argv.find((a) => a.startsWith('--json='))?.slice(7);
type R = { route: string; state: string; facts?: Parameters<typeof judge>[0] };
const read = (dir: string) => new Map(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => { const r = JSON.parse(readFileSync(join(dir, f), 'utf8')) as R; return [r.route, r] as const; }));
const B = read(beforeDir), A = read(afterDir);
const verdict = (r?: R) => (r?.state === 'scored' && r.facts ? judge(r.facts) : null);
const tally = (m: Map<string, R>) => {
  const t = { screens: m.size, scored: 0, passAll: 0, clear: 0, finished: 0, fast: 0, right: 0 };
  for (const r of m.values()) { const v = verdict(r); if (!v) continue; t.scored++; if (v.passAll) t.passAll++; for (const c of ['clear', 'finished', 'fast', 'right'] as const) if (v.checks[c] === 'pass') t[c]++; }
  return t;
};
const tb = tally(B), ta = tally(A);
console.log('before', JSON.stringify(tb));
console.log('after ', JSON.stringify(ta));
const changed: unknown[] = [], newFaults: unknown[] = [], missing: string[] = [];
for (const route of new Set([...B.keys(), ...A.keys()])) {
  const vb = verdict(B.get(route)), va = verdict(A.get(route));
  if (!A.has(route)) { missing.push(route); continue; }
  if (B.get(route)?.state !== A.get(route)?.state) changed.push({ route, state: `${B.get(route)?.state} -> ${A.get(route)?.state}` });
  if (!vb || !va) continue;
  const fb = new Set(vb.faults.map((f) => f.id)), fa = new Set(va.faults.map((f) => f.id));
  const gone = [...fb].filter((x) => !fa.has(x)), added = [...fa].filter((x) => !fb.has(x));
  if (gone.length || added.length || vb.passAll !== va.passAll) changed.push({ route, passAll: `${vb.passAll} -> ${va.passAll}`, gone, added });
  for (const id of added) newFaults.push({ route, id, say: va.faults.find((f) => f.id === id)?.say });
}
console.log(`\nchanged screens: ${changed.length}`);
for (const c of changed) console.log('  ', JSON.stringify(c));
console.log(`\nfaults present after and not before: ${newFaults.length}`);
for (const n of newFaults) console.log('  ', JSON.stringify(n));
if (missing.length) console.log(`\nnot in the after crawl: ${missing.join(' ')}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ before: tb, after: ta, changed, newFaults, missing }, null, 1));
