// Phase 5 guard — every mode's touch verbs must actually resolve.
//
// This exists because of a real, silent failure: Karate VS rendered
// <TouchOverlay modeId="karate_vs"> while MODE_VERBS was keyed "karate-vs".
// A missing key does not throw — it falls through to MODE_VERBS.default, which
// is a single generic ACTION button, so KICK, HEAVY and BLOCK became completely
// unreachable from touch and nothing anywhere reported a problem.
//
// That is the worst kind of bug: it degrades instead of failing. This scans the
// shipped host components for the modeId they actually pass and asserts each one
// has its own MODE_VERBS entry, so the next mode cannot repeat it.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODE_VERBS } from '../lib/babylon/ui/modeVerbs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const GAMES = join(process.cwd(), 'components', 'games');

/** Every modeId literal handed to a TouchOverlay in a shipped host component. */
function touchOverlayModeIds(): { file: string; modeId: string }[] {
  const out: { file: string; modeId: string }[] = [];
  for (const file of readdirSync(GAMES)) {
    if (!file.endsWith('.tsx')) continue;
    const src = readFileSync(join(GAMES, file), 'utf8');
    if (!src.includes('TouchOverlay')) continue;
    // Static literal form: modeId="threepoint"
    for (const m of src.matchAll(/<TouchOverlay[^>]*?modeId="([a-zA-Z_0-9-]+)"/gs)) {
      out.push({ file, modeId: m[1] });
    }
  }
  return out;
}

const found = touchOverlayModeIds();
ok(found.length > 0, `A1 found TouchOverlay usages to check (got ${found.length})`);

const seen = new Set<string>();
for (const { file, modeId } of found) {
  if (seen.has(modeId)) continue;
  seen.add(modeId);
  const has = Object.prototype.hasOwnProperty.call(MODE_VERBS, modeId);
  ok(has, `A-${modeId} has a MODE_VERBS entry (${file}) — without it the whole `
    + 'moveset silently degrades to the single default ACTION button');
}

// The default entry must still exist as the deliberate fallback, and must stay
// minimal — if it ever grew real verbs, a missing key would look "fine".
ok(Object.prototype.hasOwnProperty.call(MODE_VERBS, 'default'), 'B1 default entry exists');
ok(MODE_VERBS.default.buttons.filter((b) => b.emit !== null).length === 1,
  'B2 default is a single live button, so a missing key stays obvious');

// Every config must be exactly four slots — TouchOverlay places them positionally
// and a short array would leave a hole in the diamond.
for (const [key, cfg] of Object.entries(MODE_VERBS)) {
  ok(cfg.buttons.length === 4, `C-${key} declares exactly 4 slots (got ${cfg.buttons.length})`);
}

if (fail.length) {
  console.error(`verb-key-alignment-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`verb-key-alignment-tests: ${checks} checks green — every touch modeId resolves`);
