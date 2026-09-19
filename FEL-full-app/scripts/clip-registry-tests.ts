#!/usr/bin/env -S npx tsx
/**
 * scripts/clip-registry-tests.ts — THE STATIC CLIP TABLE MATCHES THE AUTHORED REGISTRY.
 *
 * `clipRegistry.REAL_CLIPS` is a hand-maintained list, and `isResolvable()` — which every blend-tree proof and every
 * static coverage check asks — consults it rather than the animator's live groups. The file has carried a comment
 * saying "anything added to anim/authored MUST be added here too" since the board suite drifted; comments do not
 * enforce. Measured 2026-09-18, it was 42 clips behind: the whole hoops handle kit (shammgod, yoyo, snatch-back, both
 * ankle breakers), the layup/finish kit, the hard defensive slides, karate's elbows and three dunk finishes.
 *
 * Nothing was broken on screen — installSafePlay accepts any name the animator has registered, so those clips played.
 * What broke is the ability to ASK: a proof that every state in a tree resolves was reading a table that had nothing
 * to do with the library. This is that comment, as a test.
 *
 * Both sides are read FROM SOURCE. Importing clipRegistry would give the same answer, but reading the authored index
 * as text is what keeps this honest when a clip is registered through a path the module graph does not expose.
 *
 * Run: npx tsx scripts/clip-registry-tests.ts
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..', 'lib', 'babylon', 'anim');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

const authored = [...read(path.join('authored', 'index.ts'))
  .matchAll(/\[\s*'([a-z0-9_]+)'\s*,\s*\(\)\s*=>/g)].map((m) => m[1]);

const registrySrc = read('clipRegistry.ts');
const realBlock = /const REAL_CLIPS = new Set<string>\(\[([\s\S]*?)\n\]\);/.exec(registrySrc);
assert.ok(realBlock, 'REAL_CLIPS set not found in clipRegistry.ts');
const real = new Set([...realBlock[1].matchAll(/'([a-z0-9_.]+)'/g)].map((m) => m[1]));

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

console.log('\nthe static clip table vs. the authored registry');

ok('the authored registry is actually being read', () => {
  assert.ok(authored.length > 100, `expected >100 authored clips, read ${authored.length}`);
  assert.ok(real.size > 100, `expected >100 REAL_CLIPS entries, read ${real.size}`);
});

ok('every authored clip is in REAL_CLIPS, so isResolvable() agrees with the library', () => {
  const missing = authored.filter((c) => !real.has(c));
  assert.deepEqual(missing, [],
    `authored but absent from clipRegistry.REAL_CLIPS (isResolvable() would say no):\n   ${missing.join('\n   ')}`);
});

ok('the authored registry has no duplicate names', () => {
  const seen = new Set<string>(), dupes: string[] = [];
  for (const c of authored) { if (seen.has(c)) dupes.push(c); seen.add(c); }
  assert.deepEqual(dupes, [], `duplicate authored clip names: ${dupes.join(', ')}`);
});

console.log(`\n✅ clip-registry-tests: ${pass} checks green — ${authored.length} authored clips all resolvable`);
