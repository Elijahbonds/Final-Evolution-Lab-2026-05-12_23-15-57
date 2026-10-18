// FDB-2 (PM, 2026-10-17): the menu song preview on /try is not requested before the `fel:dunk1-in` mark.
//
// The preview (`/audio/songs/<id>/preview.mp3`, 0.43–0.51 MB) came from the root layout's soundtrack, started by the first tap —
// on the flyer that tap is /links' "Play FEL", the way into /try. The soundtrack now holds on /try (and on the way there) until
// DunkMode's contest set says the first dunk is in, at the same moment it marks `fel:dunk1-in` (dunkOneBoundary.scan). The
// player's own behaviour is pinned in lib/soundtrack/firstDunk.test.ts; this holds the wiring, and that nothing else on /try's
// graph builds a song preview's URL. The runtime check is scripts/probes/_dunk1-requests.mts (exit 1 on a preview before the mark).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const code = (p: string) => stripComments(read(p));
const between = (src: string, from: string, to: string) => { const a = src.indexOf(from); const b = src.indexOf(to, a + from.length); return a < 0 || b < 0 ? '' : src.slice(a, b); };

/** Files `entry` reaches through static imports (dunkFirstBudget.scan's walk: `@/` and relative; type-only and import() are not edges). */
function staticGraph(entry: string): Set<string> {
  const exts = ['.ts', '.tsx', '/index.ts', '/index.tsx'];
  const resolve = (from: string, spec: string): string | null => {
    const b = spec.startsWith('@/') ? path.join(ROOT, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
    if (!b) return null;
    if (existsSync(b) && statSync(b).isFile()) return b;
    for (const e of exts) if (existsSync(b + e)) return b + e;
    return null;
  };
  const seen = new Set<string>([path.join(ROOT, entry)]);
  const queue = [...seen];
  const edge = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  while (queue.length) {
    const f = queue.shift()!;
    for (const m of stripComments(readFileSync(f, 'utf8')).matchAll(edge)) { const r = resolve(f, m[1]); if (r && !seen.has(r)) { seen.add(r); queue.push(r); } }
  }
  return seen;
}
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, e);
    if (statSync(path.join(ROOT, rel)).isDirectory()) { if (e !== 'node_modules') out.push(...sources(rel)); }
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(rel);
  }
  return out;
}

describe('/try\'s song preview waits for the fel:dunk1-in mark', () => {
  const dunk = read('lib/babylon/modes/DunkMode.ts');   // raw: the slice below ends at a doc comment
  it('the contest set lets the soundtrack go at the mark: after it, before his body — and nothing else ever does', () => {
    const set = between(dunk, 'function startContestSet(ctx: ModeContext)', '\n  /** His body,');
    const mark = set.indexOf("performance.mark('fel:dunk1-in')");
    const go = set.indexOf('soundtrackFirstDunkIn();');
    expect(mark).toBeGreaterThan(0);
    expect(go).toBeGreaterThan(mark);
    expect(set.indexOf('rivalArrival = bringRival(ctx);')).toBeGreaterThan(go);
    expect(dunk).toContain("import { soundtrackFirstDunkIn } from '@/lib/soundtrack/client';");
    const callers = [...sources('lib'), ...sources('components'), ...sources('app')].filter((f) => /soundtrackFirstDunkIn\(\)|setFirstDunkIn\(true\)/.test(code(f)));
    expect(callers.sort()).toEqual(['lib/babylon/modes/DunkMode.ts', 'lib/soundtrack/client.ts']);
  });
  it('the policy holds /try before it reads the tap, so the tap that opens /try starts nothing', () => {
    const decide = between(code('lib/soundtrack/policy.ts'), 'export function decideStage(', '\n}');
    const hold = decide.indexOf("if (holdsForFirstDunk(c)) return { silent: 'first-dunk' };");
    expect(hold).toBeGreaterThan(decide.indexOf("if (c.hidden) return { silent: 'hidden' };"));
    expect(decide.indexOf("if (!c.unlocked) return { silent: 'waiting-for-tap' };")).toBeGreaterThan(hold);
    expect(code('lib/soundtrack/policy.ts')).toContain("export const FIRST_DUNK_PATH = '/try';");
  });
  it('the first tap\'s destination reaches the player BEFORE the unlock (the "Play FEL" tap is still on /links)', () => {
    expect(code('components/soundtrack/soundtrack-dock.tsx')).toContain('unlockSoundtrackFromGesture(tappedLinkPath(e.target));');
    const unlock = between(code('lib/soundtrack/client.ts'), 'export function unlockSoundtrackFromGesture(', '\n}');
    expect(unlock.indexOf('p.headTo(headingTo);')).toBeGreaterThan(0);
    expect(unlock.indexOf('p.primeFromGesture(')).toBeGreaterThan(unlock.indexOf('p.headTo(headingTo);'));
  });
  it('nothing on /try\'s graph builds a song-preview URL: the soundtrack\'s come from /api/v1/soundtrack; the dance and create pickers stay off it', () => {
    const graph = new Set([...staticGraph('app/layout.tsx'), ...staticGraph('app/try/page.tsx'), ...staticGraph('components/games/dunk-babylon.tsx')]);
    const rel = [...graph].map((f) => path.relative(ROOT, f));
    expect(rel).toContain('components/soundtrack/soundtrack-dock.tsx');   // control: the walk reaches the layout's dock …
    expect(rel).toContain('lib/babylon/modes/DunkMode.ts');               // … and the dunk
    expect(rel.filter((f) => /songPreviewUrl\(|preview\.mp3/.test(code(f)))).toEqual([]);
    expect(rel).not.toContain('lib/babylon/modes/DanceMode.ts');
    expect(rel).not.toContain('components/create/previews.tsx');
    expect(code('lib/soundtrack/client.ts')).toContain("fetch('/api/v1/soundtrack')");   // the catalogue: the dock's one source of song URLs
  });
});
