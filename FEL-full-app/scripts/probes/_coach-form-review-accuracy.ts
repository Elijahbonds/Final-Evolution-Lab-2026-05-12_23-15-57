// COACH-VIDEO-REVIEW (2026-10-24): rep counting and flag accuracy on the Mirror's pose fixtures, printed as a table.
//   npx tsx scripts/probes/_coach-form-review-accuracy.ts [seeds=1,2,3,4,5,6]
// The same sets tests/coach-video-review/accuracy.test.ts asserts on (tests/helpers/formReviewSets.ts).
import { readSet } from '@/lib/coach/formReview/reader';
import { flagsFor, scoreReps } from '@/lib/coach/formReview/score';
import { REVIEW_MOVEMENTS } from '@/lib/coach/formReview/movements';
import { labelledSets, realNegatives } from '@/tests/helpers/formReviewSets';
import { scoreSet, type SetScore } from '@/tests/helpers/formReviewAccuracy';

const seeds = (process.argv[2] ?? '1,2,3,4,5,6').split(',').map(Number);
const rows: (SetScore & { name: string; kind: string; movement: string })[] = [];
for (const s of labelledSets(seeds)) rows.push({ name: s.name, kind: s.kind, movement: s.movement, ...scoreSet(s) });
const tot = (k: keyof SetScore, f: (r: (typeof rows)[number]) => boolean = () => true) => rows.filter(f).reduce((a, r) => a + (r[k] as number), 0);
console.log('| set | true reps | counted | flags | flags on an injected rep | injected reps flagged |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.name} | ${r.trueReps} | ${r.counted} | ${r.flags} | ${r.truePositiveFlags} | ${r.injectedFlagged}/${r.injected} |`);
for (const m of [...REVIEW_MOVEMENTS, null]) {
  const f = (r: (typeof rows)[number]) => m === null || r.movement === m;
  const flags = tot('flags', f), tp = tot('truePositiveFlags', f);
  console.log(`${m ?? 'ALL'}: reps true ${tot('trueReps', f)} counted ${tot('counted', f)} (missed ${tot('missed', f)}, extra ${tot('extra', f)}); flags ${flags}, precision ${flags ? (tp / flags * 100).toFixed(1) : '—'}%; injected reps flagged ${tot('injectedFlagged', f)}/${tot('injected', f)}; flags on clean sets ${tot('flags', (r) => f(r) && r.injected === 0)}`);
}
for (const n of realNegatives()) {
  console.log(`real negative ${n.name} (${n.frames.length} frames): ` + REVIEW_MOVEMENTS.map((m) => { const reps = scoreReps(m, readSet(m, n.frames)); return `${m} ${reps.length} reps / ${flagsFor(m, reps).length} flags`; }).join(', '));
}
