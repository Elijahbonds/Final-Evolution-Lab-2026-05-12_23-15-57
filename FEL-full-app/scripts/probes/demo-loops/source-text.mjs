// DEMO-LOOPS: print the free-exercise-db instructions for library entries, so a new loop is read against the movement its
// entry was imported as. The source file is public (Unlicense) and is NOT in the repo: fetch it once, pinned to the commit the
// entries cite (their `source.url`):
//   curl -o <dir>/exercises.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/dist/exercises.json
//   FEDB=<dir>/exercises.json node scripts/probes/demo-loops/source-text.mjs <family | variation>…
// Prints, per approved entry of each named family (or with that base variation): name, [variation | equipment], the steps.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const fedb = new Map(JSON.parse(readFileSync(process.env.FEDB, 'utf8')).map((e) => [e.id, e]));
const want = new Set(process.argv.slice(2));
for (const dir of ['seed', 'authored']) for (const f of readdirSync(join(ROOT, 'data/library', dir)).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(ROOT, 'data/library', dir, f), 'utf8'));
  for (const e of Array.isArray(d) ? d : d.entries ?? []) {
    if (e?.review?.status !== 'approved' || !(want.has(e.family) || want.has(String(e.variation).split('+')[0]))) continue;
    const src = fedb.get(e.source?.ref);
    console.log(`\n## ${e.name} [${e.family} | ${e.variation} | ${(e.equipment ?? []).join(',')}]`);
    console.log(src ? src.instructions.join(' ') : `(no free-exercise-db source: ${e.source?.kind} ${e.source?.ref ?? ''}) setup: ${e.setup} cues: ${(e.cues ?? []).join(' ')}`);
  }
}
