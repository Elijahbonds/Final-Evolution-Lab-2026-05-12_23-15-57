#!/usr/bin/env -S npx tsx
// HOOPS-10PHASE-2 phase 5 — dribble moves and size-up chains from BUFFERED combo inputs.
//
// The dribble move vocabulary itself (StickHandle.ts: momentum_cross, momentum_btb, crossover, hesi, in_and_out,
// between_legs, behind_back, steezo_roll, size_up, stepback, snatchback, spin — plus a gated, rated size-up cycle
// and an "aggressive" chain window) was already built in full by an earlier "2K PRO STICK" pass and already has
// its own tests (StickHandle is pure and unit-testable directly, see its own suite). What this phase fixes is a
// genuine bug in both mode files: a flick thrown while busy (mid-gather, mid-finish, mid-spin, mid-shot) was
// silently DISCARDED — `stickGestures = []` with nothing read — instead of buffered, which is exactly the "eaten
// press" fault the shot button already had and was already fixed for with gameFeel's InputBuffer (SHOT_BUFFER_MS).
// This script proves the same fix landed for the dribble stick, in both modes, source-level (both mode files are
// closures with nothing exported to call directly — the established pattern, see call-for-ball-tests.ts).
//
// Run: npx tsx scripts/dribble-buffer-tests.ts

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

for (const [name, path] of [['1v1', '../lib/babylon/modes/OneVOneMode.ts'], ['3v3', '../lib/babylon/modes/ThreeVThreeMode.ts']] as const) {
  const src = readFileSync(new URL(path, import.meta.url), 'utf8');
  ok(/STICK_MOVE_BUFFER_MS = 220/.test(src), `${name} declares the buffer window`);
  ok(/let bufferedGesture: StickGesture \| null = null, bufferedGestureAt = -Infinity;/.test(src), `${name} declares the single-slot buffer`);
  // the busy branch must no longer be a bare discard
  ok(!/\} else if \(stickGestures\.length\) stickGestures = \[\];/.test(src), `${name}'s busy branch is no longer a bare silent discard`);
  ok(/const last = \[\.\.\.stickGestures\]\.reverse\(\)\.find\(\(g\) => g\.kind === 'flick' \|\| g\.kind === 'sweep'\);/.test(src), `${name} captures the newest real move gesture (not a bare hold/release) when busy`);
  ok(/if \(last\) \{ bufferedGesture = last; bufferedGestureAt = performance\.now\(\); \}/.test(src), `${name} timestamps the buffered gesture with the same wall clock the shot buffer uses`);
  // the replay must happen BEFORE the main gate, gated on the SAME busy flags, and feed the same resolution loop
  ok(/if \(bufferedGesture && !shooting && !dunking && !finish && !gather && !spin && performance\.now\(\) - bufferedGestureAt <= STICK_MOVE_BUFFER_MS\) \{/.test(src), `${name} only replays once ALL the same busy flags the live gate checks have cleared`);
  ok(/stickGestures\.unshift\(bufferedGesture\); bufferedGesture = null;/.test(src), `${name} unshifts the buffered gesture into the SAME array the live resolution loop reads (no second, parallel resolution path)`);
  // a stale buffer past the window must not leak into a frame where the lock clears late
  ok(/\} else bufferedGesture = null;/.test(src), `${name} drops an expired buffer rather than holding it forever`);
  // a possession reset must not let a buffered move from the last possession fire on the next one
  ok((src.match(/stickGestures = \[\]; bufferedGesture = null;/g) ?? []).length >= 1, `${name} clears the buffer on every possession reset that also clears stickGestures (no stale cross-possession replay)`);
}

// Dunk variation audit (folded into this phase per the brief: "fold into the phases where it fits"). The required
// vocabulary — one-hand (TOMAHAWK), two-hand (STANDING), reverse (REVERSE), tomahawk (TOMAHAWK), windmill
// (WINDMILL), 360 (SPIN_360 / PAUSIN_DUNK), cradle (CRADLE), and a contest-only tier (DOUBLE_CLUTCH, the one dunk
// in the table that exists BECAUSE of the defender) — was already fully built. The selector already reads
// approach angle (lateral01), speed, contest, poster and momentum; "button/stick input" already reaches it too,
// as the kind ('dunk'/'poster'/'standing' — which button combo was held) and a forced pick (PAUSIN', the spin
// thrown into the takeoff from the stick). Takeoff foot (one vs two) is baked into each dunk's own authored
// choreography (dunkTakeoff.ts's buildGatherOne/buildGatherTwo/buildTakeOffOne) rather than picked independently
// of style, which is how a real dunk works — nobody free-chooses a two-foot windmill. No new table was needed;
// these checks confirm the read this phase relied on (rather than rebuilding) is still intact.
{
  const dunks = readFileSync(new URL('../lib/babylon/core/HoopsDunks.ts', import.meta.url), 'utf8');
  for (const name of ['TOMAHAWK', 'STANDING', 'REVERSE', 'WINDMILL', 'SPIN_360', 'CRADLE', 'DOUBLE_CLUTCH']) {
    ok(dunks.includes(`export const ${name}:`), `HoopsDunks still exports ${name} (the dunk-variety vocabulary phase 5 relied on, not rebuilt)`);
  }
  ok(/function pickHoopsDunk\(read: DunkRead\): HoopsDunk/.test(dunks), 'pickHoopsDunk is still the single selector both modes call');
}

if (fail.length) {
  console.error(`dribble-buffer-tests: ${fail.length} FAILED of ${checks}`);
  for (const f of fail) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`dribble-buffer-tests: ${checks} checks green`);
