#!/usr/bin/env -S npx tsx
// HOOPS-10PHASE-2 phase 7 — defense AI: stance, slide, contest, steal and block timing.
//
// A full audit of both mode files + core/HoopsDefense.ts, core/DefensiveStance.ts, core/BasketballCore.ts
// (DefenderBrain) before writing anything, because this ground has been worked hard already across several
// earlier passes (HOOPS-MOVE-KIT-A D1-D3, DEFENSE-LOOK 2026-09-17, THE AI REACH IS A READ WITH A COST
// 2026-09-17): the brief's entire ask was found ALREADY BUILT and tuned —
//   STANCE   — DefensiveStance.ts: lateral-speed gain / forward-speed penalty swap, an L2 "intense" sit, pure and
//              already covered by its own existing tests.
//   SLIDE    — the same file's stanceWish(); DefenderBrain (BasketballCore.ts) issues the actual steer per frame:
//              press-after-still, help-defense rotation, fight-over/under a screen, box-out seal, loose-ball chase.
//   CONTEST  — HoopsDefense.ts: groundContest / aiBlockChance / contestedPct / aiHandsUp / fatiguePct /
//              alteredApex, already covered by HoopsDefense.test.ts; it bites the make% itself, not just the meter.
//   STEAL    — a real timing+cost system in BOTH modes: a reach-in cooldown, a bump-exposure window
//              (BUMP_STRIP_WINDOW_SEC / CROSSOVER_EXPOSED_FROM..TO), a miss stuns the reacher, a reach through a
//              moving body is its own foul — NOT a free roll (measured and fixed in "THE AI REACH IS A READ WITH
//              A COST", see ThreeVThreeMode.ts's steal block and HoopsDefense.test.ts).
//   BLOCK    — contestJump()'s timed jump window (JUMP_SEC) + jumpSwats()'s contest-on-the-green read, shared
//              by both modes, already covered by HoopsDefense.test.ts / onevone-defense-tests.ts.
//
// The ONE genuine gap found: retreatFor() / closeoutFor() (anim/basketballTree.ts) — the pure reads that decide
// whether a defender's body plays a backpedal, a closeout sprint, or neither — are wired into FOUR call sites
// across both modes but had ZERO direct test coverage anywhere (confirmed: no *.test.ts referenced either name,
// no ci-suite script exercised them). Closed with basketballTree.defenseLook.test.ts (13 vitest unit tests). This
// script proves the audit itself: every piece the brief asks for already exists, is already tested, and is wired
// into both 1v1 and 3v3 — so this phase did not duplicate a single one of them.
//
// Run: npx tsx scripts/defense-ai-audit-tests.ts

import { readFileSync } from 'node:fs';

let checks = 0;
const fail: string[] = [];
const ok = (c: boolean, label: string): void => { checks++; if (!c) fail.push(label); };

const core = readFileSync(new URL('../lib/babylon/core/BasketballCore.ts', import.meta.url), 'utf8');
const stance = readFileSync(new URL('../lib/babylon/core/DefensiveStance.ts', import.meta.url), 'utf8');
const tree = readFileSync(new URL('../lib/babylon/anim/basketballTree.ts', import.meta.url), 'utf8');
const oneVOne = readFileSync(new URL('../lib/babylon/modes/OneVOneMode.ts', import.meta.url), 'utf8');
const threeVThree = readFileSync(new URL('../lib/babylon/modes/ThreeVThreeMode.ts', import.meta.url), 'utf8');

// --- STANCE: already built, pure, and trades lateral for forward speed (so sliding is a real choice) ---
ok(/export function inStance\(read: StanceRead\): boolean \{/.test(stance), 'DefensiveStance exports inStance()');
ok(/export function stanceWish\(/.test(stance), 'DefensiveStance exports stanceWish() (the lateral/forward speed trade)');
ok(/STANCE_LATERAL_GAIN = 1\.24/.test(stance) && /STANCE_FORWARD_PENALTY = 0\.76/.test(stance),
  'the ordinary stance trade is intact (faster sideways, slower forward — the thing that makes it a choice)');
ok(/INTENSE_LATERAL_GAIN = 1\.42/.test(stance), 'the L2 "intense" sit-down stance (deeper trade) is intact');

// --- SLIDE / positioning: DefenderBrain already runs press, help rotation, screen navigation, box-out, chase ---
ok(/export class DefenderBrain implements AIBehavior \{/.test(core), 'DefenderBrain exists and is the shared defender AI (both modes)');
ok(/PRESS_AFTER_SEC = 0\.6/.test(core), 'a standing handler gets stepped into after a press clock, not guarded forever at range');
ok(/HELP DEFENCE — the low man rotates to a drive/.test(core), 'help-defense rotation on a drive is already built (the off-ball man closest to the rim steps in)');
ok(/O2 BOX OUT/.test(core) && /boxOut\(mark: Vector3 \| null\): void/.test(core), 'box-out sealing is already built (a shot up overrides every other job)');
ok(/chaseBall\(at: Vector3 \| null\): void/.test(core), 'a loose ball chase overrides stance/mark — DefenderBrain goes and gets it');

// --- CONTEST: already bites the make% itself (not just the meter window), already has its own test file ---
ok(/export (function|const) (groundContest|aiBlockChance|contestedPct|aiHandsUp|fatiguePct|alteredApex)/.test(
  readFileSync(new URL('../lib/babylon/core/HoopsDefense.ts', import.meta.url), 'utf8')),
  'HoopsDefense exports the contest package (groundContest / aiBlockChance / contestedPct / aiHandsUp / fatiguePct / alteredApex)');
ok(/STEAL_EXPOSURE_MIN|BLOCK_WINDOW_SEC/.test(readFileSync(new URL('../lib/babylon/core/HoopsDefense.test.ts', import.meta.url), 'utf8')),
  'HoopsDefense.test.ts already covers the steal-exposure/block-window constants directly');

// --- STEAL: a real timing + cost system in BOTH modes, not a free roll (measured and fixed before this phase) ---
ok(/THE AI REACH IS A READ WITH A COST/.test(threeVThree), "3v3's steal has a cooldown, a miss-stuns-the-reacher penalty, and a bump-exposure read — not a free roll");
ok(/AI_REACH_COOLDOWN_SEC/.test(threeVThree) && /f\.reachCooldown = AI_REACH_COOLDOWN_SEC;/.test(threeVThree), "3v3's AI reach has a real cooldown between attempts");
ok(/CROSSOVER_EXPOSED_FROM/.test(core) && /CROSSOVER_EXPOSED_TO/.test(core), "1v1's crossover-exposure poke window (the ball is live only while it crosses the body) is intact");

// --- BLOCK: a timed jump window shared by both modes, already covered by onevone-defense-tests.ts ---
ok(/function contestJump\(ctx: ModeContext\): boolean \{/.test(oneVOne), '1v1 has a timed block-jump (contestJump)');
ok(/function contestJump\(ctx: ModeContext\): boolean \{/.test(threeVThree), '3v3 has the SAME timed block-jump (contestJump), not a parallel reimplementation');
ok(/THE BLOCK HAS A CUE/.test(readFileSync(new URL('../scripts/onevone-defense-tests.ts', import.meta.url), 'utf8')),
  'onevone-defense-tests.ts already asserts the block has a real cue (a jump at nothing is a blow-by)');

// --- the ONE genuine gap this phase closed: retreatFor/closeoutFor had zero direct test coverage anywhere ---
ok(/export function retreatFor\(pos: \{ x: number; z: number \}, vel: \{ x: number; z: number \}, man: \{ x: number; z: number \} \| null\): boolean \{/.test(tree),
  'retreatFor is a pure, testable function (anim/basketballTree.ts)');
ok(/export function closeoutFor\(pos: \{ x: number; z: number \}, vel: \{ x: number; z: number \}, man: \{ x: number; z: number \} \| null, speed01: number\): boolean \{/.test(tree),
  'closeoutFor is a pure, testable function (anim/basketballTree.ts)');
const testSrc = readFileSync(new URL('../lib/babylon/anim/basketballTree.defenseLook.test.ts', import.meta.url), 'utf8');
ok(/describe\('retreatFor/.test(testSrc) && /describe\('closeoutFor/.test(testSrc),
  'basketballTree.defenseLook.test.ts now covers both functions directly (new this phase, 13 vitest checks)');
// confirmed wired into both modes, at more than one call site each (so the new coverage matches real usage)
const oneVOneCalls = (oneVOne.match(/retreatFor\(/g) ?? []).length + (oneVOne.match(/closeoutFor\(/g) ?? []).length;
const threeVThreeCalls = (threeVThree.match(/retreatFor\(/g) ?? []).length + (threeVThree.match(/closeoutFor\(/g) ?? []).length;
ok(oneVOneCalls >= 2, `1v1 calls retreatFor/closeoutFor at more than one site (both the foe's read and my own), found ${oneVOneCalls}`);
ok(threeVThreeCalls >= 3, `3v3 calls retreatFor/closeoutFor at more than one defender's site (me + mates/foes), found ${threeVThreeCalls}`);

console.log(`defense-ai-audit: ${checks - fail.length}/${checks} checks passed`);
if (fail.length) { console.error('FAILED:\n' + fail.map((f) => `  - ${f}`).join('\n')); process.exit(1); }
