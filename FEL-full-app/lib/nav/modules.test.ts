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
  // CREATOR SOUNDTRACK phase 0 (owner, 2026-10-06, "storage = Google Cloud Storage"): the creative-card upload route was
  // this file's only caller and now signs GCS uploads (lib/soundtrack/storage.ts). Cards made before still point at S3
  // objects, and removing the AWS path is the owner's call (a file this lane did not create), so it stays, named here.
  'lib/s3.ts': 'the old public S3 upload signer; its one caller moved to GCS (2026-10-06) and deleting it is the owner\'s call',
  // Test support. Tests are deliberately NOT counted as consumers (a module used only by its own test is still
  // dead), but this one exists to be imported by them: six rule tests strip comments with it before scanning
  // source. Counting tests generally would blind the check; excusing this one file by name does not.
  'lib/testing/sourceScan.ts': 'test support — imported by the rule tests that scan source, and tests are not counted as consumers',
  // R5 / HOOPS-10 round 5 (2026-10-01): training had no headless sim while dance, dunkduel and irl/acting all
  // carry one. The sim is the mode's scoring rules extracted so the integrity ceiling and the win-rate read run
  // headless; its only caller today is its test (same class as sourceScan above — tests are not consumers).
  // A headed-rig probe or the integrity model importing it means deleting this line.
  'lib/babylon/core/trainingSim.ts': 'the training scoring model — run by trainingSim.test.ts and the integrity suite\'s ceiling basis; tests are not counted as consumers',
  // BODY-PLAY-WORKS (2026-10-01): the public-repo rule for a committed pose recording. The walk lives in
  // recordingsGuard.test.ts; tests are not counted as consumers, same as sourceScan above.
  'lib/pose/recordingsGuard.ts': 'repo guard — recordingsGuard.test.ts rejects a committed video, image, or child take; tests are not counted as consumers',
  // MIRROR-COACH P3 review (2026-09-26): a stored Mirror screen row reads as server-graded only with the server's evidence
  // beside results that match it, so the coach tests build their rows the way app/api/mirror/screen writes them — here.
  // CREATOR-PLAN phase 4d (2026-10-06): the creator lane's archetype recipes are TEST-ONLY by design (the game ships tools,
  // never characters, so no shipped module may import them); 4a added the file without its line here.
  'lib/creator/look/__fixtures__/archetypes.ts': 'test support — the ten generic archetype recipes the creator tests build and render (never shipped: tools, not characters); tests are not counted as consumers',
  // INTEGRATION (2026-10-06, integration-2): two test-only modules whose lanes did not add their line (each lane ran its own
  // tests, not this one). Neither was ever imported by shipped code, so no wiring was lost in a merge.
  'lib/ui/hintLiterals.ts': 'test support — the hint-literal reader controlsScreen.scan.test.ts sorts every mode\'s `hint` with (console-view lane); tests are not counted as consumers',
  'lib/babylon/combat/difficultySim.ts': 'test support — the combat difficulty harness "trimmed for the regression test" (its header); difficultyBands.test.ts pins each duel mode\'s bands with it (improve-combat lane); tests are not counted as consumers',
  'lib/mirror/fixtures/storedRows.ts': 'test support — the stored screen rows the coach and attention tests read, built as the Mirror route writes them; tests are not counted as consumers',
  // ADVENTURE (2026-10-06): each Phase A lane tests its sim against a headless rig built from contracts.ts (the plan's
  // rule: no lane imports another's code or a scene); A4's sandbox tests drive A1's. Same class as sourceScan above.
  'lib/babylon/adventure/movement/testkit.ts': 'test support — A1\'s headless world, actors and 60 Hz runner; tests are not counted as consumers',
  'lib/babylon/adventure/combat/testArena.ts': 'test support — A2\'s headless arena with a contract-built stand-in for A1; tests are not counted as consumers',
  'lib/babylon/adventure/partner/testRig.ts': 'test support — A3\'s headless party rig with stand-ins for A1 and A2; tests are not counted as consumers',
  'lib/babylon/adventure/br/testkit.ts': 'test support — Phase C\'s headless BR scenarios (a landed match, placing bodies, steering the zone); tests are not counted as consumers',
  // ECONOMY-SESSIONS-HARDEN (2026-09-28), FIX 2 step 7: written, tested and deliberately NOT imported by any route (FE PM:
  // staged until the live database is back). lib/sessions/sessionsHardening.scan.test.ts fails the day a route imports it
  // without that GO; wiring it is two lines per sessions route, then this line goes.
  'lib/sessions/runRateLimit.ts': 'STAGED, not wired to prod — the sessions rate limits wait for the FE PM\'s GO (live DB back)',
  // STORE-PRICES (2026-10-04): Elijah's approved coach-store prices, typed and flag-gated (COACH_STORE_ENABLED,
  // still off). No route, page or component reads from it yet — this tip writes no database rows and the
  // sellable six still read their price from MarketplaceListing.priceUsd. It is the typed source of truth the
  // eventual DB-seeding step (see ~/Claude/_observe/STORE-PRICES-LIVE-ROWS.txt) and a future listing/settings UI
  // read from; wiring either one up means deleting this line.
  'lib/coach-store/storePrices.ts': 'STAGED, not wired to prod — typed price data for the coach store\'s eventual DB seed; no route/page reads it yet',
  // INTEGRATION (2026-10-06): voiceover v2's production-script parser is run by tools/voice/import-voices.mts (it imports
  // '../../lib/babylon/audio/voice/voiceScript.ts' at lines 35 and 39). tools/ is outside the tree this check scans, so
  // its one real consumer is invisible here; the import runs on the owner's machine when a voice is recorded.
  'lib/babylon/audio/voice/voiceScript.ts': 'run by tools/voice/import-voices.mts (outside the scanned lib/app/components/scripts tree): the voice-take import, an owner step',
  // INTEGRATION (2026-10-06): two pure PIPELINES adapters, built and tested, whose mounts the pipelines lane ROUTED to the
  // lanes that own the hosts (its report, "Routed (not done here)"). Wiring either one means deleting its line.
  'lib/pipelines/celebration.ts': 'ROUTED, not wired — the equipped-routine dunk celebration; DunkMode\'s startLiveCeleb needs the dance clips on the dunk rig and `dance` in clipScope SCOPES.dunk (rig work for the dunk lane)',
  'lib/pipelines/feedCommunity.ts': 'ROUTED, not wired — approved community writing as Knowledge Feed fact cards; lib/knowledge needs a `community` topic in TOPIC_IDS fed by feedCardsOf(fetchCommunity(\'reads\')) (knowledge-feed lane)',
  // MIRROR-COACH P5 FIX (2026-09-29, code review): the excuse this line used to carry ("that consuming route/UI is a
  // separate, not-yet-landed piece of this same phase") was already false the day it was committed — lib/health/pain.ts
  // (imported by app/api/health/pain/route.ts) and components/coach/pain-checkin.tsx both import decide() from this
  // module in the SAME changeset. This orphan-check never re-verifies a NOT_IMPORTED excuse against real usage, so a
  // stale entry like this one sits here silently defeating its own point; the line is deleted now that it has a real
  // caller, per this file's own rule ("wiring one up means deleting its line").
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
  // The movement screen's own machinery. screenRunner and screenReward were wired into the Mirror on
  // 2026-09-20 and came off this list, which is the ratchet doing its job. lungeAudit.ts came off on 2026-09-25
  // (MIRROR-COACH P1 baseline): lib/mirror/fixtures/measure.ts runs it on every landmark fixture, so it is MEASURED
  // now — but it is still not mounted in the Mirror; that is phase 4. This one is still waiting.
  'lib/kitchens/fromScreen.ts',
  // The coach layer — written, tested, unreachable.
  'lib/coach-interfaces.ts',
  'lib/coach-service.ts',
  // Engine and platform pieces. bvh.ts and recognisable.ts came off on 2026-09-21: they were never orphaned,
  // the checker just could not see the .mts scripts importing them. sourceScan.ts moved to NOT_IMPORTED.
  'lib/babylon/anim/mocapClip.ts',
  'lib/babylon/avatar/AvatarBuilder.ts',
  'lib/babylon/error-boundary.tsx',
  'lib/babylon/network/NetworkInputSource.ts',
  'lib/babylon/nutrition/FoodScan.tsx',
  'lib/babylon/platform/GenerationService.ts',
  'lib/babylon/server/subscriptionApi.ts',
  'lib/locomotion/moves/MoveGraph.ts',
  // Everything else.
  'lib/cache/asset-cache.ts',
  'lib/competition/payoutMethods.ts',
  'lib/env.ts',
  'lib/offline-cache.ts',
  'lib/profile/dashboard.ts',
  'lib/story/progression-gates.ts',
  'lib/stream/StreamSession.ts',
  'lib/voice/VoiceRoom.ts',
];

/**
 * Source files under a tree.
 *
 * `.mts` AND `.mjs` COUNT (fixed 2026-09-21). The filter was /\.tsx?$/, which silently skipped 373 of this
 * repo's script and probe files — every scripts/probes/_*.mts among them. A module imported only from one of
 * those read as an orphan: lib/babylon/anim/recognisable.ts sat on the backlog for days while
 * scripts/probes/_scorecard.mts was importing it at line 14. A checker that cannot see a third of the tree
 * reports confident nonsense, which is worse than not checking.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || e === 'node_modules' || e === 'generated') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (!/\.(tsx?|mts|mjs|cjs)$/.test(p)) continue;
    if (/\.(test|spec)\.(tsx?|mts)$/.test(p)) continue;
    if (/\.d\.(ts|mts)$/.test(p)) continue;
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
    ...walk(join(ROOT, 'scripts')),
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
