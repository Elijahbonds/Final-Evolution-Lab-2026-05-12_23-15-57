// MIRROR-COACH P9 (2026-09-30) — the external-focus lint (lib/coach/cueLint.ts lintCue) and the screen rules
// (lib/share/screen.ts screenText) over the written correctives' copy, BEFORE (git HEAD 72b49537, extracted to the
// session scratchpad by the caller) and AFTER (the working tree). Writes one JSON to the path in argv[3]. Throwaway
// evidence script for the P9 report; the durable check is lib/mirror/correctives.test.ts.
import { writeFileSync } from 'node:fs';
const oldDir = process.argv[2];
const outPath = process.argv[3];
const { lintCue } = await import('@/lib/coach/cueLint');
const { screenText } = await import('@/lib/share/screen');
const C = await import('@/lib/mirror/correctives');
const oldR: any = await import(`${oldDir}/rnt.ts`);
const oldS: any = await import(`${oldDir}/smr.ts`);
const oldP: any = await import(`${oldDir}/program.ts`);
type Row = { id: string; text: string; tier: 'attention' | 'instruction' };
const before: Row[] = [];
for (const [z, e] of Object.entries<any>(oldR.PLAYBOOK)) {
  before.push({ id: `rnt:${z}:title`, text: e.title, tier: 'instruction' });
  for (const k of ['feed', 'direction', 'load', 'why']) before.push({ id: `rnt:${z}:${k}`, text: e.rnt[k], tier: 'instruction' });
  const b = oldR.breathFor(z, 4);
  before.push({ id: `rnt:${z}:breath`, text: b.pattern, tier: 'attention' }, { id: `rnt:${z}:breathTiming`, text: b.timing, tier: 'attention' });
}
for (const [z, p] of Object.entries<any>(oldS.PROTOCOLS)) {
  for (const k of ['tissue', 'tool', 'pin', 'stretch', 'avoid']) before.push({ id: `smr:${z}:${k}`, text: p[k], tier: 'instruction' });
  before.push({ id: `smr:${z}:breath`, text: p.breath, tier: 'attention' });
}
for (const [z, kinds] of Object.entries<any>(oldP.PLAYBOOK)) for (const [k, b] of Object.entries<any>(kinds)) {
  before.push({ id: `program:${z}:${k}:title`, text: b.title, tier: 'instruction' });
  b.movements.forEach((m: string, i: number) => before.push({ id: `program:${z}:${k}:move${i}`, text: m, tier: 'instruction' }));
}
const after: Row[] = C.correctiveCueCorpus();
const judge = (rows: Row[]) => rows.map((r) => ({ ...r, lint: lintCue(r.text, r.tier), screen: screenText(r.text).map((f) => f.found) }))
  .filter((r) => r.lint.length || r.screen.length);
const b = judge(before), a = judge(after);
const out = { before: { lines: before.length, failing: b.length, fails: b }, after: { lines: after.length, failing: a.length, fails: a } };
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`before: ${b.length}/${before.length} failing; after: ${a.length}/${after.length} failing`);
