// THE VERDICT CONTRACT (2026-09-12 mechanic pass).
//
// A mode ends with ctx.end('SOME_STRING', ...). Its host component decides whether the player
// won by comparing r.outcome to a string literal it holds independently. Nothing links the two,
// and the pair has silently drifted apart FOUR times:
//
//   dunk        — "the mode emits CONTEST_WON, not WIN — dunk sessions had always posted as losses"
//   mixedcombat — "made every recap read DEFEATED"
//   karate_vs   — emitted MATCH_WON, host compared 'WIN': every won fight recorded as a loss
//   duel        — emitted DUEL_WON, host compared 'WIN' (retired, so it harmed nobody yet)
//
// Each was found by hand, months apart. This test reads both sides of the contract from source
// and fails the build the moment they disagree again.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/** mode source -> host component. Add a row when you add a mode; that is the point. */
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['lib/babylon/modes/OneVOneMode.ts', 'components/games/basketball-babylon.tsx'],
  ['lib/babylon/modes/DunkMode.ts', 'components/games/dunk-babylon.tsx'],
  ['lib/babylon/modes/KarateVSMode.ts', 'components/games/karate-vs-babylon.tsx'],
  ['lib/babylon/modes/MixedCombatMode.ts', 'components/games/mixedcombat-babylon.tsx'],
  ['lib/babylon/modes/CourtCarnivalMode.ts', 'components/games/carnival-babylon.tsx'],
  ['lib/babylon/modes/ShowdownMode.ts', 'components/games/showdown-babylon.tsx'],
  ['lib/babylon/modes/DuelMode.ts', 'components/games/duel-babylon.tsx'],
  ['lib/babylon/modes/FootballMode.ts', 'components/games/football-babylon.tsx'],
];

/** Every literal the mode can pass as ctx.end's first argument. */
function emittedOutcomes(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/ctx\.end\(\s*([^,]+?),/g)) {
    for (const lit of m[1].matchAll(/'([A-Za-z_][A-Za-z_0-9]*)'/g)) out.add(lit[1]);
  }
  return [...out];
}

/** Every outcome literal the host compares against. */
function checkedOutcomes(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/r\.outcome\s*===\s*'([A-Za-z_][A-Za-z_0-9]*)'/g)) out.add(m[1]);
  return [...out];
}

describe('mode -> host verdict contract', () => {
  for (const [modePath, hostPath] of PAIRS) {
    it(`${modePath.split('/').pop()} and its host agree on the win string`, () => {
      expect(existsSync(modePath), `missing ${modePath}`).toBe(true);
      expect(existsSync(hostPath), `missing ${hostPath}`).toBe(true);
      const emitted = emittedOutcomes(readFileSync(modePath, 'utf8'));
      const checked = checkedOutcomes(readFileSync(hostPath, 'utf8'));
      expect(emitted.length, `${modePath} emits no outcome literal`).toBeGreaterThan(0);
      expect(checked.length, `${hostPath} checks no outcome literal`).toBeGreaterThan(0);
      // every string the host tests for must be one the mode can actually produce,
      // otherwise that branch is dead and the player's result is silently wrong
      const dead = checked.filter((c) => !emitted.includes(c));
      expect(dead, `${hostPath} compares outcomes ${JSON.stringify(dead)} that ${modePath} never emits (emits ${JSON.stringify(emitted)})`).toEqual([]);
    });
  }

  it('covers every pair listed', () => { expect(PAIRS.length).toBeGreaterThanOrEqual(8); });
});
