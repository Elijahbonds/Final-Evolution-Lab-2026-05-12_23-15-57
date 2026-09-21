/**
 * ingest-films — match a folder of filmed exercises to the drills in the book.
 *
 * The owner filmed their exercises into a Google Drive folder ("Bonds Bounce Blueprint"). Drive is not mounted on
 * this machine, so this script is written to be pointed at the folder whenever it IS reachable — a synced Drive
 * path, an external disk, or a plain download.
 *
 *   npx tsx scripts/education/ingest-films.ts "/path/to/Bonds Bounce Blueprint"          # dry run: what matches
 *   npx tsx scripts/education/ingest-films.ts "/path/to/folder" --write                  # write the manifest
 *   npx tsx scripts/education/ingest-films.ts --names films.txt                          # match a LIST of names
 *   ls "Bonds Bounce Blueprint" | npx tsx scripts/education/ingest-films.ts --names -     # ...or from a pipe
 *
 * THE NAMES MODE EXISTS BECAUSE THE FOLDER IS IN GOOGLE DRIVE (2026-09-21). Deciding how to move thirty videos
 * onto this machine is much easier once you know whether their names match the book at all — and that question
 * only needs the names. Paste the file list out of Drive and the same report comes out, without moving a byte.
 * It refuses --write, because a manifest of drill -> source path is a lie when there are no paths.
 *
 * IT DOES NOT COPY THE VIDEO FILES INTO THE REPO, on purpose. public/ is copied wholesale into the deployed
 * function bundle (that is how the Prisma client ships — see docs/DEPLOY-NOTES-PRISMA.md), so dropping thirty
 * exercise films in there would go into every deploy. It writes a manifest of drill key -> source path, and the
 * upload step puts them somewhere a URL can point at.
 *
 * Matching is by name, scored, and it PRINTS WHAT IT IS UNSURE ABOUT rather than guessing quietly: a film
 * attached to the wrong drill teaches somebody the wrong movement.
 */
import { readdirSync, statSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { DRILLS } from '../../lib/education/course';
import { matchFilms } from '../../lib/education/filmMatch';

const VIDEO = new Set(['.mp4', '.mov', '.m4v', '.webm', '.avi']);
const MANIFEST = join(process.cwd(), 'lib', 'education', 'films.json');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (VIDEO.has(extname(p).toLowerCase())) out.push(p);
  }
  return out;
}

/** The names to match: a real folder, or a list the owner pasted out of Drive. */
function collect(): { files: string[]; realPaths: boolean } | null {
  const namesAt = process.argv.indexOf('--names');
  if (namesAt !== -1) {
    const src = process.argv[namesAt + 1];
    if (!src) { console.error('--names wants a file of names, one per line, or - for stdin'); return null; }
    const raw = src === '-' ? readFileSync(0, 'utf8') : existsSync(src) ? readFileSync(src, 'utf8') : '';
    if (!raw.trim()) { console.error(`nothing to read in ${src}`); return null; }
    // A pasted Drive listing may carry paths, sizes or no extension at all. Take the name and move on.
    const files = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => basename(l));
    return { files, realPaths: false };
  }
  const dir = process.argv[2];
  if (!dir || dir.startsWith('--') || !existsSync(dir)) {
    console.error('Point me at the folder of films, or at a list of their names:\n'
      + '  npx tsx scripts/education/ingest-films.ts "/path/to/Bonds Bounce Blueprint"\n'
      + '  npx tsx scripts/education/ingest-films.ts --names films.txt');
    return null;
  }
  return { files: walk(dir), realPaths: true };
}

function main() {
  const got = collect();
  if (!got) { process.exit(1); return; }
  const { files, realPaths } = got;
  const write = process.argv.includes('--write');

  const nonVideo = realPaths ? 0 : files.filter((f) => !VIDEO.has(extname(f).toLowerCase())).length;
  console.log(`${files.length} ${realPaths ? 'video files' : 'names'} · ${DRILLS.length} drills in the book`);
  if (nonVideo) console.log(`(${nonVideo} of the names have no video extension — matched anyway, on the name)`);
  console.log('');

  const { matched, unsure, unmatched, missing } = matchFilms(files, DRILLS);

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
  if (missing.length) {
    console.log(`\nDRILLS STILL WITHOUT FILM (${missing.length})`);
    for (const d of missing) console.log(`  ch${d.chapter}  ${d.title}`);
  }

  if (write && !realPaths) {
    console.log('\n--write needs the real folder: a manifest of drill → source path is a lie without the paths.');
    process.exit(1);
  }
  if (write) {
    const films = Object.fromEntries(matched.map((m) => [m.key, { source: m.file, url: '' }]));
    writeFileSync(MANIFEST, JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), films }, null, 2));
    console.log(`\nwrote ${MANIFEST} — fill each 'url' once the file is hosted, or leave it and the drill shows its steps only.`);
  } else {
    console.log(realPaths ? '\n(dry run — pass --write to record the matches)' : '\n(names only — point me at the folder to record the matches)');
  }
}

main();
