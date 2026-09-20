/**
 * ingest-films — match a folder of filmed exercises to the drills in the book.
 *
 * The owner filmed their exercises into a Google Drive folder ("Bonds Bounce Blueprint"). Drive is not mounted on
 * this machine, so this script is written to be pointed at the folder whenever it IS reachable — a synced Drive
 * path, an external disk, or a plain download.
 *
 *   npx tsx scripts/education/ingest-films.ts "/path/to/Bonds Bounce Blueprint"          # dry run: what matches
 *   npx tsx scripts/education/ingest-films.ts "/path/to/folder" --write                  # write the manifest
 *
 * IT DOES NOT COPY THE VIDEO FILES INTO THE REPO, on purpose. public/ is copied wholesale into the deployed
 * function bundle (that is how the Prisma client ships — see docs/DEPLOY-NOTES-PRISMA.md), so dropping thirty
 * exercise films in there would go into every deploy. It writes a manifest of drill key -> source path, and the
 * upload step puts them somewhere a URL can point at.
 *
 * Matching is by name, scored, and it PRINTS WHAT IT IS UNSURE ABOUT rather than guessing quietly: a film
 * attached to the wrong drill teaches somebody the wrong movement.
 */
import { readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { DRILLS } from '../../lib/education/course';

const VIDEO = new Set(['.mp4', '.mov', '.m4v', '.webm', '.avi']);
const MANIFEST = join(process.cwd(), 'lib', 'education', 'films.json');

/** Confident enough to attach without a human looking at it. */
const STRONG = 0.62;
/** Worth showing as a maybe. Below this it is not offered at all. */
const WEAK = 0.4;

function words(s: string): string[] {
  return s.toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/\b(final|v\d+|copy|edit|export|render|clip|video|hd|4k|1080p?|720p?)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['the', 'and', 'for', 'with', 'your'].includes(w));
}

/** Jaccard over meaningful words — robust to "Drill 2 - Pogo Progression FINAL.mov" vs "The Oscillatory Pogo…". */
function score(file: string, drillTitle: string): number {
  const a = new Set(words(file));
  const b = new Set(words(drillTitle));
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / new Set([...a, ...b]).size;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (VIDEO.has(extname(p).toLowerCase())) out.push(p);
  }
  return out;
}

function main() {
  const dir = process.argv[2];
  const write = process.argv.includes('--write');
  if (!dir || !existsSync(dir)) {
    console.error('Point me at the folder of films:\n  npx tsx scripts/education/ingest-films.ts "/path/to/Bonds Bounce Blueprint"');
    process.exit(1);
  }

  const files = walk(dir);
  console.log(`${files.length} video files · ${DRILLS.length} drills in the book\n`);

  const taken = new Set<string>();
  const matched: { key: string; title: string; file: string; score: number }[] = [];
  const unsure: { file: string; best: string; score: number }[] = [];
  const unmatched: string[] = [];

  // Best-first across every pair, so one strong film is not stolen by an earlier weak match.
  const pairs = files.flatMap((f) => DRILLS.map((d) => ({ f, d, s: score(basename(f), d.title) })));
  pairs.sort((a, b) => b.s - a.s);
  const usedFiles = new Set<string>();

  for (const { f, d, s } of pairs) {
    if (s < WEAK || taken.has(d.key) || usedFiles.has(f)) continue;
    if (s >= STRONG) {
      matched.push({ key: d.key, title: d.title, file: f, score: s });
      taken.add(d.key); usedFiles.add(f);
    } else {
      unsure.push({ file: f, best: d.title, score: s });
    }
  }
  for (const f of files) if (!usedFiles.has(f) && !unsure.some((u) => u.file === f)) unmatched.push(f);

  console.log(`MATCHED (${matched.length})`);
  for (const m of matched) console.log(`  ${m.score.toFixed(2)}  ${m.title}\n          ${basename(m.file)}`);

  if (unsure.length) {
    console.log(`\nNOT SURE (${unsure.length}) — name the file after the drill, or map it by hand in films.json`);
    for (const u of unsure) console.log(`  ${u.score.toFixed(2)}  ${basename(u.file)}  →  ${u.best}?`);
  }
  if (unmatched.length) {
    console.log(`\nNO MATCH (${unmatched.length})`);
    for (const f of unmatched) console.log(`  ${basename(f)}`);
  }

  const missing = DRILLS.filter((d) => !taken.has(d.key));
  if (missing.length) {
    console.log(`\nDRILLS STILL WITHOUT FILM (${missing.length})`);
    for (const d of missing) console.log(`  ch${d.chapter}  ${d.title}`);
  }

  if (write) {
    const films = Object.fromEntries(matched.map((m) => [m.key, { source: m.file, url: '' }]));
    writeFileSync(MANIFEST, JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), films }, null, 2));
    console.log(`\nwrote ${MANIFEST} — fill each 'url' once the file is hosted, or leave it and the drill shows its steps only.`);
  } else {
    console.log('\n(dry run — pass --write to record the matches)');
  }
}

main();
