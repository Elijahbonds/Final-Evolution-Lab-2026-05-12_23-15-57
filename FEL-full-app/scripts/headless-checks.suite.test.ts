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
