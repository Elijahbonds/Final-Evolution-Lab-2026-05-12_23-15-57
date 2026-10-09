// MIRROR-COACH P9 fix (2026-09-30): every template primaryCue linted at the ATTENTION tier (lib/coach/cueLint.ts), to show
// which lines are left failing there — exactly the named set-ups in TEMPLATE_SETUP_LINES, which are linted as instructions.
// Before the fix 38 of 200 failed here; after it, the 9 set-ups.
import * as L from '../../lib/coach/cueLint';
const { cueCorpus, lintCue, TEMPLATE_SETUP_LINES } = ((L as any).default ?? L) as typeof L;
let n = 0, total = 0;
for (const e of cueCorpus()) {
  if (!/^template:.*:primary/.test(e.id)) continue;
  total++;
  const f = lintCue(e.text, 'attention');
  if (f.length) { n++; console.log(`${TEMPLATE_SETUP_LINES[e.id] ? 'set-up ' : 'FAIL   '} ${e.id} | ${e.text} | ${f.map((x) => `${x.rule}:${x.word}`).join(',')}`); }
}
console.log(`failing at attention: ${n} of ${total}`);
