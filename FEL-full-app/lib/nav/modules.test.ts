import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * THE ORPHANED-MODULE TEST.
 *
 * lib/nav/reachability.test.ts catches a ROUTE nothing links to. It does not catch a MODULE nothing imports,
 * and in one session three of those turned up, each of them correct, tested-by-nobody and completely dead:
 *
 *   lib/guidance/pathways.ts   19 career pathways, written 2026-09-12, zero consumers
 *   lib/babylon/music/MusicTiers.ts  the tier ladder whose own header says it closes the
 *                              "full DAW on the first visit" problem — nothing imported it, so it closed nothing
 *   the `spendShards` seam     marked honestly in StudioMode and never passed, so every kit was free
 *
 * None of them failed. Nothing threw, nothing logged, no test went red. They just never ran. That is the most
 * expensive kind of bug in this codebase because the work is already done and paid for.
 *
 * So: a module under lib/ must be imported by something, or say why not.
 */

const ROOT = join(__dirname, '..', '..');

/** Files that are reached some way other than an import, each with the reason. */
const NOT_IMPORTED: Record<string, string> = {
  'lib/babylon/modes/registry.ts': 'the mode registry — loaded by key at runtime, not by a static import',
};

/** Whole subtrees that are entered by a runtime lookup rather than an import from elsewhere. */
const DYNAMIC_TREES = [
  'lib/babylon/modes/',   // every mode is resolved from the registry by key
  'lib/babylon/nexus/',   // the mirror pipeline is code-split and imported through its own barrel
];


/**
 * THE BACKLOG, AS A RATCHET.
 *
 * The test found thirty-two of these on the day it was written, several of them mine. Excusing them would make
 * the list a place to hide things, and blocking on all thirty-two would mean the test never lands and catches
 * nothing. So they are NAMED, the count may only go DOWN, and anything not on this list fails immediately.
 *
 * Wiring one up means deleting its line. If a module here turns out to be genuinely dead, delete the FILE — an
 * orphan is either work waiting to be finished or work that should not be in the tree.
 */
const KNOWN_ORPHANS: readonly string[] = [
  // The movement screen's own machinery — built for the Mirror and never mounted.
  'lib/mirror/screenRunner.ts',
  'lib/mirror/screenReward.ts',
  'lib/mirror/lungeAudit.ts',
  'lib/kitchens/fromScreen.ts',
  // The coach layer — written, tested, unreachable.
  'lib/coach/compliance.ts',
  'lib/coach/mirrorToProgram.ts',
  'lib/coach/triage.ts',
  'lib/coach-interfaces.ts',
  'lib/coach-service.ts',
  // Engine and platform pieces.
  'lib/babylon/anim/bvh.ts',
  'lib/babylon/anim/mocapClip.ts',
  'lib/babylon/anim/recognisable.ts',
  'lib/babylon/avatar/AvatarBuilder.ts',
  'lib/babylon/error-boundary.tsx',
  'lib/babylon/network/NetworkInputSource.ts',
  'lib/babylon/nutrition/FoodScan.tsx',
  'lib/babylon/platform/GenerationService.ts',
  'lib/babylon/server/subscriptionApi.ts',
  'lib/babylon/ui/CaptionRegion.tsx',
  'lib/locomotion/moves/MoveGraph.ts',
  // Everything else.
  'lib/cache/asset-cache.ts',
  'lib/competition/payoutMethods.ts',
  'lib/env.ts',
  'lib/input-schemes.board.ts',
  'lib/mode-menu.ts',
  'lib/offline-cache.ts',
  'lib/profile/dashboard.ts',
  'lib/story/progression-gates.ts',
  'lib/stream/StreamSession.ts',
  'lib/testing/sourceScan.ts',
  'lib/theme-tokens.ts',
  'lib/voice/VoiceRoom.ts',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || e === 'node_modules' || e === 'generated') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (!/\.tsx?$/.test(p)) continue;
    if (/\.(test|spec)\.tsx?$/.test(p)) continue;
    if (/\.d\.ts$/.test(p)) continue;
    out.push(p);
  }
  return out;
}

/** Every source file that could import something. */
function allSources(): string[] {
  return [
    ...walk(join(ROOT, 'lib')),
    ...walk(join(ROOT, 'app')),
    ...walk(join(ROOT, 'components')),
    ...walk(join(ROOT, 'scripts')).filter((p) => /\.tsx?$/.test(p)),
  ];
}

/** The import specifiers a file mentions, however it spells them. */
function importsOf(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  for (const m of src.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

describe('no module under lib/ is written and then never used', () => {
  const sources = allSources();
  const libFiles = walk(join(ROOT, 'lib'));

  // Every specifier anywhere, reduced to its basename-ish tail so '@/lib/x/y', '../x/y' and './y' all match.
  const mentioned = new Set<string>();
  for (const f of sources) {
    for (const spec of importsOf(readFileSync(f, 'utf8'))) {
      const clean = spec.replace(/\.(tsx?|jsx?|json)$/, '');
      const parts = clean.split('/').filter((p) => p && p !== '.' && p !== '..' && p !== '@');
      if (parts.length) {
        mentioned.add(parts[parts.length - 1]);
        if (parts.length > 1) mentioned.add(parts.slice(-2).join('/'));
      }
    }
  }

  it('found the tree it is meant to be checking', () => {
    expect(libFiles.length).toBeGreaterThan(100);
    expect(sources.length).toBeGreaterThan(libFiles.length);
  });

  it('every lib module is imported somewhere, or excused BY NAME with a reason', () => {
    const orphans: string[] = [];

    for (const file of libFiles) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (rel in NOT_IMPORTED) continue;
      if (DYNAMIC_TREES.some((t) => rel.startsWith(t))) continue;
      if (rel.endsWith('/index.ts') || rel.endsWith('/index.tsx')) continue; // a barrel is imported as its folder

      const base = rel.replace(/\.(tsx?|json)$/, '').split('/').pop()!;
      const parent = rel.replace(/\.(tsx?|json)$/, '').split('/').slice(-2).join('/');
      if (mentioned.has(base) || mentioned.has(parent)) continue;

      orphans.push(rel);
    }

    const known = new Set(KNOWN_ORPHANS);
    const fresh = orphans.filter((o) => !known.has(o));
    expect(fresh, 'written and imported by nothing — wire it up, or name it in NOT_IMPORTED with a reason')
      .toEqual([]);
  });

  it('THE BACKLOG ONLY SHRINKS', () => {
    // The ratchet. Wiring a module up means deleting its line here; a line that outlives its orphanhood would
    // let the next one hide behind it.
    const stillOrphaned = new Set(
      libFiles
        .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
        .filter((rel) => {
          if (rel in NOT_IMPORTED) return false;
          if (DYNAMIC_TREES.some((t) => rel.startsWith(t))) return false;
          if (rel.endsWith('/index.ts') || rel.endsWith('/index.tsx')) return false;
          const base = rel.replace(/\.(tsx?|json)$/, '').split('/').pop()!;
          const parent = rel.replace(/\.(tsx?|json)$/, '').split('/').slice(-2).join('/');
          return !mentioned.has(base) && !mentioned.has(parent);
        }),
    );
    const fixedOrGone = KNOWN_ORPHANS.filter((o) => !stillOrphaned.has(o));
    expect(fixedOrGone, 'these are no longer orphaned — delete them from KNOWN_ORPHANS').toEqual([]);
  });

  it('the excuse list has not gone stale', () => {
    const present = new Set(libFiles.map((f) => relative(ROOT, f).replace(/\\/g, '/')));
    expect(Object.keys(NOT_IMPORTED).filter((f) => !present.has(f))).toEqual([]);
  });

  it('every excuse actually says something', () => {
    for (const [f, why] of Object.entries(NOT_IMPORTED)) expect(why.length, f).toBeGreaterThan(15);
  });
});
