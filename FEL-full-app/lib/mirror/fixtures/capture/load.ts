// Reads and writes the captured fixtures — node only (the ingest script and the tests), never imported by the app
// (MIRROR PHASE 3, 2026-10-07). One gzip-compressed JSON file per session under lib/mirror/fixtures/captured/: the
// captures are numbers only, but a session is ~25 MB of them as text and about 7 MB compressed (270 bytes a frame).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { captureFixtureProblems } from '@/lib/pose/recordingsGuard';
import { captureFixtureName, type CaptureFixture } from './format';

/** Where the captured fixtures live (tests and the script run from the app root, FEL-full-app). */
export const CAPTURED_DIR = resolve(process.cwd(), 'lib/mirror/fixtures/captured');

/** A fixture file's text, gzipped or plain. */
export function readFixtureText(path: string): string {
  const buf = readFileSync(path);
  return path.endsWith('.gz') ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
}

/** Every session fixture in `dir`; a file the guard refuses throws (it must never reach a grader, or the repo). */
export function readCaptured(dir = CAPTURED_DIR): CaptureFixture[] {
  let names: string[];
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter((n) => /\.json(\.gz)?$/.test(n)).sort().map((n) => {
    const fx = JSON.parse(readFixtureText(join(dir, n))) as CaptureFixture;
    const problems = captureFixtureProblems(fx);
    if (problems.length) throw new Error(`[capture] ${n}: ${problems.join('; ')}`);
    return fx;
  });
}

/** Write one session fixture (gzipped, deterministic: the same fixture gives the same bytes). Returns its path. */
export function writeCaptured(fx: CaptureFixture, dir = CAPTURED_DIR): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, captureFixtureName(fx));
  writeFileSync(path, gzipSync(Buffer.from(JSON.stringify(fx), 'utf8'), { level: 9 }));
  return path;
}

/**
 * A report may only be written as a .md or .json file outside lib/ and scripts/: it can never land on a threshold's
 * file, or on the code that grades. The report never edits a threshold; this is the belt to that brace.
 */
export function reportPathOk(p: string, ext: '.md' | '.json'): boolean {
  const parts = relative(process.cwd(), resolve(p)).split(/[\\/]/);
  return p.endsWith(ext) && !parts.includes('lib') && !parts.includes('scripts');
}
