// MUSIC-SUITE P5 FIX PASS (2026-09-25): THE RENDER PATH of a Flip-pack generator — every local module its audio depends
// on, by repo path, with its sha256. install-pack.ts writes it into each PROVENANCE entry; lib/babylon/music/provenance.test.ts
// recomputes it and holds the record to it.
//
// What was wrong: install-pack.ts followed a script's imports only inside songgen/. The finisher (songgen/flip_pack.py)
// also puts ../flippack on sys.path and imports onsets_check — whose resample, energy_envelope, GATE and MIN_GAP_MS every
// chop goes through — so no record named it, and the repo copy had been edited after the renders with nothing to notice.
// This follows the finisher's own sys.path (songgen/, then flippack/), and the keys are repo paths, resolved from the app
// root (they were bare file names resolved beside the script, which cannot name a module in another folder).

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const APP_ROOT = path.resolve(__dirname, '..', '..', '..');
/** Where a generator's `import x` is looked for, in the finisher's order (flip_pack.py: _HERE, then _REAL_PACK). */
export const RENDER_DIRS = ['scripts/music/flip-pack/songgen', 'scripts/music/flip-pack/flippack'] as const;

const sha = (p: string): string => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/** The repo path of a module named in a top-level `import x` / `from x import …`, or null when it is not a local file. */
function resolveModule(name: string, app: string): string | null {
  for (const dir of RENDER_DIRS) {
    const rel = `${dir}/${name}.py`;
    if (fs.existsSync(path.join(app, rel))) return rel;
  }
  return null;
}

/**
 * `script` (a repo path, e.g. scripts/music/flip-pack/songgen/flip_chops.py) and every local module it imports at the
 * top level, recursively: { repo path: sha256 }.
 */
export function renderPath(script: string, app = APP_ROOT, seen = new Set<string>()): Record<string, string> {
  if (seen.has(script)) return {};
  seen.add(script);
  const abs = path.join(app, script);
  const out: Record<string, string> = { [script]: sha(abs) };
  const src = fs.readFileSync(abs, 'utf8');
  for (const m of src.matchAll(/^(?:import\s+([A-Za-z_]\w*)|from\s+([A-Za-z_]\w*)\s+import)\b/gm)) {
    const rel = resolveModule(m[1] ?? m[2], app);
    if (rel) Object.assign(out, renderPath(rel, app, seen));
  }
  return out;
}

/** A render path with its keys sorted (the comparison and the record's order). */
export function sortedPath(p: Record<string, string>): [string, string][] {
  return Object.entries(p).sort(([a], [b]) => a.localeCompare(b));
}
