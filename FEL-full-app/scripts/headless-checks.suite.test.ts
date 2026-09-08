// §7.6 — brings the headless check scripts under vitest.
//
// These checks were written as standalone `tsx` scripts because vitest was not
// installed in this tree, so the bible's "vitest suite still green" gate had
// never actually been runnable here. Rather than rewrite nine working suites and
// risk changing what they assert, each is executed as its own vitest test: the
// script's exit code is the pass/fail, and its "N checks green" line is parsed
// so the real check count shows up in the report instead of being hidden behind
// a single boolean.
//
// The scripts remain runnable on their own (`npx tsx scripts/<name>.ts`), which
// is how they are used while iterating on a mode.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Every headless suite, with the subsystem it guards. */
const SUITES: { script: string; guards: string }[] = [
  { script: 'gate0-rig-tests.ts', guards: 'Gate 0 — Mixamo 65-bone rig standard' },
  { script: 'verb-key-alignment-tests.ts', guards: 'touch verb keys resolve for every mode' },
  { script: 'threepoint-contest-tests.ts', guards: '3PT — NBA 2K9 contest format + real arc' },
  { script: 'air-session-tests.ts', guards: 'gymnastics vault + big air on the shared core' },
  { script: 'air-trick-spin-tests.ts', guards: 'AirTrick discrete vs time-based spin (big air can crash)' },
  { script: 'controller-link-tests.ts', guards: 'Controller Link transport + schemas' },
  { script: 'kv-signal-store-tests.ts', guards: 'Controller Link KV store is multi-instance safe' },
  { script: 'crossfade-orphan-tests.ts', guards: 'animation crossfade does not strand clips' },
  { script: 'environment-ibl-tests.ts', guards: 'procedural IBL environment maths' },
  { script: 'dunk-system-tests.ts', guards: 'dunk trick recognition' },
  { script: 'fight-balance-tests.ts', guards: 'the Karate VS rival is beatable' },
  { script: 'dunk-balance-tests.ts', guards: 'the dunk contest is winnable and losable' },
  { script: 'judge-panel-tests.ts', guards: 'five judges, ceiling 50, staged reveal' },
  { script: 'procedural-skin-tests.ts', guards: 'the athlete is a skinned mesh that deforms' },
  { script: 'threevthree-core-tests.ts', guards: '3v3 spacing, matchups and the real arc' },
  { script: 'venue-bounds-tests.ts', guards: 'the camera box matches the court it clamps to' },
  { script: 'stick-convention-tests.ts', guards: 'hardware and movement agree on which way is forward' },
  { script: 'basketball-rules-tests.ts', guards: 'rims, arcs and scoring agree across every basketball mode' },
  { script: 'spawn-path-tests.ts', guards: "converted modes keep the player's identity" },
  { script: 'dunk-animation-tests.ts', guards: 'dunk clips resolve AND move the rig' },
  { script: 'board-stance-tests.ts', guards: 'the board rider stands across the deck, looking down the line' },
  { script: 'skate-run-tests.ts', guards: 'Skate 3 rules — switch on a 180, bank or lose the pot' },
  { script: 'surf-run-tests.ts', guards: 'SSX economy — the flow meter is spendable, not a readout' },
  { script: 'snowboard-run-tests.ts', guards: 'SSX boost is spendable and every slalom gate is reachable' },
  { script: 'volleyball-rally-tests.ts', guards: 'bump / set / spike are three different shots, and tennis is untouched' },
  { script: 'tennis-rally-tests.ts', guards: 'Mario Tennis Aces vocabulary — four shots, four real trades' },
  { script: 'precision-modes-tests.ts', guards: "baseball's PCI is a real decision and golf's bag is a real bag" },
  { script: 'onevone-depth-tests.ts', guards: '1v1 depth — the hesi is a move, the steal is a read, feedback says why' },
  { script: 'threevthree-depth-tests.ts', guards: '3v3 depth — the low man helps, and the lane picks off bad passes' },
  { script: 'dunk-depth-tests.ts', guards: 'dunk depth — the run-up buys the air, the chair is physical' },
  { script: 'threepoint-depth-tests.ts', guards: '3PT depth — the contest is rendered, the reveal is staged, the final has a number' },
  { script: 'derby-depth-tests.ts', guards: 'derby depth — the slider breaks late, the changeup is timed on its own speed' },
  { script: 'penalty-depth-tests.ts', guards: 'penalty depth — the keeper reads your history, sudden death can end you' },
  { script: 'football-rush-tests.ts', guards: 'football — the pre-snap is real, a phone can join and steer, the bezel renders the drive' },
  { script: 'air-session-depth-tests.ts', guards: 'air sessions — the bezel renders the cadence, the crowd answers the grade' },
  { script: 'carnival-depth-tests.ts', guards: 'carnival — the rival reacts, one engine per canvas, no retired stops in the lineup' },
  { script: 'arena-quickmatch-tests.ts', guards: 'arena — quick-match draws are deterministic and skill-banded, the house book balances, the roster is covered' },
  { script: 'mixedcombat-depth-tests.ts', guards: 'mixed combat — verticals can be stepped, sweeps catch steppers, the bezel warns about the edge, phones can join' },
  { script: 'dunkduel-depth-tests.ts', guards: 'dunk duel — judges remember each player, the run-up buys air, the chair kills the dunk, the reveal renders' },
  { script: 'dance-depth-tests.ts', guards: 'the cypher — the band is earned: hits turn instruments up, misses duck them, the bezel shows the mix' },
  { script: 'creative-anim-tests.ts', guards: 'carnival / dance / freerun — one owner per body: the FreeRun tree settles, the BeatOwner never strands a step' },
  { script: 'net-anim-tests.ts', guards: 'tennis / volleyball / golf / derby / penalty — one owner per body: the net tree settles onto the shuffle, the beats land on their loops, the ball leaves on the contact key' },
  { script: 'prove-it-tests.ts', guards: 'prove it — synthetic pose streams produce measured flight physics; families separate; PRQ-relative scoring' },
  { script: 'mirror-v2-tests.ts', guards: 'mirror v2 — reps count with tempo, flicker never counts, the jump pattern runs the Prove It tracker, the skeleton paints' },
  { script: 'mirror-coach-tests.ts', guards: "mirror coach — the squat audit measures the book's four faults; the cue engine holds down, escalates, confirms once; the guided flow wires it" },
  { script: 'closet-jersey-tests.ts', guards: 'jersey id — number clamps 0–99, name plate is charset-safe and length-capped, garbage never throws' },
  { script: 'avatar-pipeline-tests.ts', guards: 'shipped avatar GLBs — spec bones, float32 skins, no draco, meter-scale tracks, manifest coverage' },
  { script: 'perf-budget-tests.ts', guards: 'mobile-tier texture memory stays within 2x the median (textureBudget.json, measured)' },
  { script: 'avatar-pose-tests.ts', guards: 'forged avatar POSE gate — clips are anatomically sane, bind is a T-pose, load state is arms-down' },
];

const ROOT = process.cwd();

describe('headless check suites', () => {
  for (const { script, guards } of SUITES) {
    const path = join(ROOT, 'scripts', script);

    it(`${script} — ${guards}`, () => {
      expect(existsSync(path), `${script} is missing`).toBe(true);

      let output = '';
      try {
        output = execFileSync('npx', ['tsx', path], {
          cwd: ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 120_000,
        });
      } catch (err) {
        // A non-zero exit is a real failure — surface the script's own report
        // rather than a bare exit code, so the reason is visible here.
        const e = err as { stdout?: string; stderr?: string };
        throw new Error(`${script} FAILED:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
      }

      // Each script ends with "<name>: N checks green". Parse it so the count is
      // reported, and so a script that silently stops asserting is caught.
      const m = /(\d+)\s+checks green/.exec(output);
      expect(m, `${script} did not report a green check count:\n${output}`).not.toBeNull();
      expect(Number(m![1]), `${script} reported zero checks`).toBeGreaterThan(0);
    });
  }
});
