// MIRROR-COACH P9 (2026-09-30): print the external-focus lint over the whole cue corpus (lib/coach/cueLint.ts).
import * as L from '../../lib/coach/cueLint';
const { cueCorpus, lintCue, CUE_ALLOW } = ((L as any).default ?? L) as typeof L;
const corpus = cueCorpus();
let fails = 0, allowed = 0;
const rows: unknown[] = [];
for (const e of corpus) {
  const f = lintCue(e.text, e.tier);
  if (!f.length) continue;
  if (CUE_ALLOW[e.id]) { allowed++; continue; }
  fails++;
  rows.push({ id: e.id, tier: e.tier, text: e.text, why: f.map((x) => `${x.rule}(${x.word})`).join(' ') });
}
if (process.argv.includes('--json')) console.log(JSON.stringify({ total: corpus.length, fails, allowed, rows }, null, 1));
else { for (const r of rows as any[]) console.log(`${r.id} [${r.tier}] ${r.why}\n    ${r.text}`); console.log(`\n${corpus.length} cues · ${fails} fail · ${allowed} allow-listed`); }
