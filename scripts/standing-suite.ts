#!/usr/bin/env -S yarn tsx
/**
 * scripts/standing-suite.ts — standing regression suite.
 *
 * Runs ALL invariant/regression tests. A failing test exits non-zero,
 * blocking the build/deploy pipeline. Promoted from M7-QA1.
 *
 * Run:  yarn tsx scripts/standing-suite.ts
 *
 * Coverage:
 *   - M7-QA1 scene invariants (m7d-tests.ts) — T-pose, locomotion, idle, one-shot
 *   - Ledger integrity invariants (ledger-invariants.ts)
 *   - Economy acceptance (economy-tests.ts) — earn/spend/own/unlock
 *   - PRQ foundation integrity (prq-tests.ts) — source+timestamp, unmeasured
 *   - M9 feel systems (feel-tests.ts) — fixed-step / input-buffer / FSM /
 *     variable-gravity / arc-drive / sensory-bus measured-target harness
 */

import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const suites = [
  { name: 'M7-QA1 scene invariants', script: 'scripts/m7d-tests.ts' },
  { name: 'Ledger integrity', script: 'scripts/ledger-invariants.ts' },
  { name: 'Economy acceptance', script: 'scripts/economy-tests.ts' },
  { name: 'PRQ foundation integrity', script: 'scripts/prq-tests.ts' },
  { name: 'M9 feel systems', script: 'scripts/feel-tests.ts' },
  { name: 'M9 Court core (dunk skin)', script: 'scripts/court-core-tests.ts' },
  { name: 'M9 Karate skin (Court core)', script: 'scripts/karate-skin-tests.ts' },
  { name: 'M9 Ride core (skate skin)', script: 'scripts/ride-core-tests.ts' },
  { name: 'M9 Snowboard skin (Ride core)', script: 'scripts/snowboard-skin-tests.ts' },
  { name: 'M9 Surf skin (Ride core)', script: 'scripts/surf-skin-tests.ts' },
  { name: 'M9 Air-session core (big-air skin)', script: 'scripts/air-session-core-tests.ts' },
  { name: 'M9 Vault skin (Air-session core)', script: 'scripts/vault-skin-tests.ts' },
  { name: 'M9 Brain Brawl skin (QuizCore)', script: 'scripts/quiz-core-tests.ts' },
  { name: 'M9 Who-Scene-It skin (QuizCore)', script: 'scripts/who-scene-it-tests.ts' },
  { name: 'M9 Sprint core (rhythm dash)', script: 'scripts/sprint-core-tests.ts' },
  { name: 'M9 Clay Rally skin (Court-rally core)', script: 'scripts/court-rally-core-tests.ts' },
  { name: 'M9 Penalty Shootout skin (Court-rally core)', script: 'scripts/penalty-shootout-tests.ts' },
  { name: 'M9 Links Golf skin (Court-rally core)', script: 'scripts/links-golf-tests.ts' },
  { name: 'M9 Sand Volleyball skin (Court-rally core)', script: 'scripts/sand-volleyball-tests.ts' },
  { name: 'M9 Home Run Derby skin (Court-rally core)', script: 'scripts/home-run-derby-tests.ts' },
  { name: 'M9 Story core (Board/Story family)', script: 'scripts/story-core-tests.ts' },
  { name: 'M9 IRL session core (IRL Dunk skin)', script: 'scripts/irl-session-tests.ts' },
  { name: 'M10 Sprint retrofit (sprint-game -> SprintCore)', script: 'scripts/sprint-retrofit-tests.ts' },
  { name: 'M10 Brain Brawl retrofit (brain-brawl -> QuizCore)', script: 'scripts/brain-brawl-retrofit-tests.ts' },
  { name: 'M10 Who-Scene-It retrofit (who-scene-it -> QuizCore, IP-screened)', script: 'scripts/who-scene-it-retrofit-tests.ts' },
  { name: 'M10 Big Air retrofit (big-air-3d -> AirSessionCore)', script: 'scripts/big-air-retrofit-tests.ts' },
  { name: 'M10 Board-sports retrofit (skate/snow/surf themes -> RideCore)', script: 'scripts/board-sports-retrofit-tests.ts' },
  { name: 'M10 Story retrofit (hub + boss/rail -> StoryCore board engine)', script: 'scripts/story-retrofit-tests.ts' },
  { name: 'M10 Street Football retrofit (synth on Court/free-3D archetype)', script: 'scripts/football-retrofit-tests.ts' },
  { name: 'M10 Gymnastics retrofit (floor->vault on AirSessionCore)', script: 'scripts/gymnastics-retrofit-tests.ts' },
  { name: 'M12.5 One input contract (kb+touch+gamepad unified)', script: 'scripts/input-contract-tests.ts' },
  { name: 'M12.6 Feedback-parity invariant (no silent scoring)', script: 'scripts/feedback-parity-tests.ts' },
  { name: 'M12.9 Self-playtest harness (window.__felTest getState/sendInput)', script: 'scripts/playtest-harness-tests.ts' },
  { name: 'M13.2 Season engine (SeasonPassCore semantics)', script: 'scripts/season-pass-core-tests.ts' },
  { name: 'M13.3 Mastery ladder (MasteryCore semantics)', script: 'scripts/mastery-core-tests.ts' },
  { name: 'M13.4 Challenge links (ChallengeLinkCore K-factor engine)', script: 'scripts/challenge-link-core-tests.ts' },
  { name: 'M13.3 Signature challenge (weekly seed determinism)', script: 'scripts/m13-signature-tests.ts' },
  { name: 'M14 Triumph Arena (LC skill duels: fee/rake/payout/refund)', script: 'scripts/arena-tests.ts' },
  { name: 'M13 game-feel: shared character-facing system', script: 'scripts/facing-tests.ts' },
  { name: 'M-handoff Phase1 Dunk feel invariants (scoring/gather/toss/modifier)', script: 'scripts/dunk-feel-tests.ts' },
  { name: 'M-handoff Phase4 Defender-bite (fake-then-commit shared 1v1/3v3)', script: 'scripts/defender-bite-tests.ts' },
  { name: 'M-handoff Phase5 Karate clash QTE + camera-kick swing', script: 'scripts/karate-clash-tests.ts' },
  { name: 'M-handoff Phase6 Karate Endless economy (currency/spike/extract/power-ups/revive)', script: 'scripts/karate-endless-economy-tests.ts' },
  { name: 'M-handoff Phase7 Board-flow (ghost arc / anti-stall boost / grind chain)', script: 'scripts/board-flow-tests.ts' },
  { name: 'SSX3 Snowboard rebuild (directional Uber tricks / rhythm boost / combo chain)', script: 'scripts/board-ssx-tests.ts' },
  { name: 'M-handoff Phase8 Court-Rally (3 failure states / ghost landing / GK dive commit)', script: 'scripts/rally-outcome-tests.ts' },
  { name: 'M-handoff Phase9 Rhythm-calibrate (audio offset tap-test math)', script: 'scripts/rhythm-calibrate-tests.ts' },
  { name: 'M-handoff Phase9 Football-cam (FOV law + stacked-tackle broadcast cut)', script: 'scripts/football-cam-tests.ts' },
  { name: 'M14-P1 Anim binding (audit / rebinder / clip-select fallback)', script: 'scripts/anim-rebind-tests.ts' },
  { name: 'M14-P2 Locomotion (blend tree / stride-sync / root motion)', script: 'scripts/loco-tests.ts' },
  { name: 'M14-P3 Unified input (dual sticks / shoulders / right-stick)', script: 'scripts/input-layer-tests.ts' },
  { name: 'M14-P4 Camera director (profiles / orbit-look / recenter)', script: 'scripts/camera-director-tests.ts' },
  { name: 'M14-P5 Cinematic engine (timeline / dunk pre-launch cinematics)', script: 'scripts/cinematic-tests.ts' },
  { name: 'M14-P6 Lighting & Environment (tone/lighting maps / 4-wall enclosure)', script: 'scripts/environment-tests.ts' },
  { name: 'M14-P7 Venice Court Environment (perimeter dressing / court surround)', script: 'scripts/venice-tests.ts' },
  { name: 'M14-P8 1v1 Duel (class attacks / guard-break / cosmetic weapons / 8-way)', script: 'scripts/combat-tests.ts' },
  { name: 'M14-P9 Lighting floor & collision (defender visibility / swept reflect)', script: 'scripts/physics-tests.ts' },
  { name: 'M14-P10 Mode rebuilds (baseball/golf 3D + skate 3-zone/pump)', script: 'scripts/sports-tests.ts' },
  { name: 'FEL Wallet (coins/shards ledger: idempotency/no-negative/coin+shard packs/rate-cap)', script: 'scripts/wallet-tests.ts' },
  { name: 'M17-M21 pure cores (workout scan/plan/avatar, closet, stream, sessions, exchange, obstacles)', script: 'scripts/m17-m21-tests.ts' },
  { name: 'M22-M27 Babylon anim coverage (no silent T-pose)', script: 'scripts/babylon-anim-coverage-tests.ts' },
];

let failed = 0;
const results: { name: string; ok: boolean; error?: string }[] = [];

for (const suite of suites) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUITE: ${suite.name}`);
  console.log('='.repeat(60));
  try {
    execSync(`yarn tsx ${suite.script}`, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test' },
    });
    results.push({ name: suite.name, ok: true });
  } catch (err: any) {
    failed++;
    results.push({ name: suite.name, ok: false, error: err?.message?.slice(0, 200) });
    console.error(`\n\u274c SUITE FAILED: ${suite.name}`);
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log('STANDING SUITE SUMMARY');
console.log('='.repeat(60));
for (const r of results) {
  console.log(`  ${r.ok ? '\u2713' : '\u274c'} ${r.name}${r.ok ? '' : ' \u2014 FAILED'}`);
}
console.log(`\n${failed === 0 ? '\u2705 ALL SUITES GREEN' : `\u274c ${failed} SUITE(S) FAILED`}`);

if (failed > 0) process.exit(1);
