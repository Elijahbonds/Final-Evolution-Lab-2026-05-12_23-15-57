#!/usr/bin/env -S npx tsx
// Spawn-path guard — the player's identity has to actually reach the player.
//
// characterPipeline calls itself "the only sanctioned spawn paths" and means it:
// spawnPlayer applies the user's Closet wardrobe, skin tone and scanned body
// proportions; spawnNpc deliberately does not. A mode that calls
// CharacterLibrary.spawn directly gets neither — and gets no error either. It
// spawns a perfectly good character wearing none of the things the player chose.
//
// That is what the Dunk Contest did, which is the worst possible mode for it:
// /try mounts dunk, so it is the guest onboarding path and the first mode
// anybody plays.
//
// This is a RATCHET, not a sweep. 28 other modes still spawn directly, and
// converting them belongs to their own passes (bible §0: one mode at a time).
// What this locks is that a mode already converted cannot quietly regress.

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

/** Modes that have been through a pass and must stay on the sanctioned paths. */
const CONVERTED = [
  'DunkMode.ts', 'FootballMode.ts', 'BoardRunMode.ts', 'TimingSportMode.ts',
];

/** Strip comments so a mention in prose is not read as a call. */
const codeOf = (src: string): string => src
  .split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
  .join('\n');

for (const file of CONVERTED) {
  const src = readFileSync(`lib/babylon/modes/${file}`, 'utf8');
  const code = codeOf(src);

  // The invariant that matters is about the PLAYER. Football and BoardRun still
  // spawn some NPCs through CharacterLibrary directly; that costs those NPCs
  // nothing, because spawnNpc deliberately applies no identity anyway. Failing
  // the build over it would be this guard enforcing tidiness rather than the
  // thing it exists to protect — and would drag two other modes into a pass
  // that is supposed to be about one (bible §0). Recorded as a follow-up, not
  // asserted here.
  ok(code.includes('CharacterPipeline.spawnPlayer'),
    `${file} spawns its player through CharacterPipeline.spawnPlayer, so the ` +
    'Closet wardrobe, skin tone and scanned proportions actually reach them');
}

// Dunk specifically: the player gets identity, the rival must NOT.
const dunk = codeOf(readFileSync('lib/babylon/modes/DunkMode.ts', 'utf8'));
ok(/player\s*=\s*await CharacterPipeline\.spawnPlayer/.test(dunk),
  'dunk: the PLAYER is spawned with spawnPlayer, so the Closet reaches the mode ' +
  'that /try mounts');
ok(/rival\s*=\s*await CharacterPipeline\.spawnNpc/.test(dunk),
  'dunk: the RIVAL is spawnNpc — an opponent wearing your identity means dunking ' +
  'against yourself');
ok(!/rival\s*=\s*await CharacterPipeline\.spawnPlayer/.test(dunk),
  'dunk: the rival must never be spawned as the player');

if (fail.length) {
  console.error(`spawn-path-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`spawn-path-tests: ${checks} checks green — converted modes keep the player's identity`);
