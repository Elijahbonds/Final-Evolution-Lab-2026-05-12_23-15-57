// REACH-FREEZE (2026-09-29): the spec's B3 and B4 — combat never reads a body's size, and no outcome code reads a scaled hand
// except in the modes that spawn every body at 1.0 until their routed diffs land. Read-only over the source: nothing here edits
// FightCore.ts or a mode.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { STANDARD_FRAME_MODES } from './playFrame';
import { applyProportions } from './playerIdentity';
import { FighterState, KARATE_ATTACKS, STAFF_ATTACKS, applyHit, resolveStrike } from './FightCore';
import { ATTACK_TABLE, resolveAttack, type AttackClass } from '../../combat/duel-core';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}
const src = (f: string) => readFileSync(f, 'utf8');

/** Any read of a body's size: the scales, the proportions that carry them, the pipe that applies them, or the play frame.
 *  (Not the playerIdentity module as such: Karate Endless takes its garment tinter from it, which is colour, not size.) */
const BODY_SIZE = /\b(heightScale|buildScale|reachScale|felPlayScale|proportions|applyProportions|proportionsFromFrame|playScales|playFramePoint|playFrameWorld|applyIdentity|resolveIdentity)\b/;

// ── B3 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const COMBAT = [
  'lib/combat/duel-core.ts', 'lib/combat/weapons.ts', 'components/games/karate-versus-3d.tsx',
  'lib/babylon/core/FightCore.ts', 'lib/babylon/core/StrikeSystem.ts', 'lib/babylon/core/DefenseSystem.ts',
  ...walk('lib/babylon/combat'),
  ...['DuelMode', 'KarateVSMode', 'KarateEndlessMode', 'MixedCombatMode', 'ShowdownMode'].map((m) => `lib/babylon/modes/${m}.ts`),
];

describe('B3 karate and the combat modes: hits and hitboxes do not change with scale', () => {
  it('B3 no combat file reads a body scale — damage, range and hitboxes come from the attack tables', () => {
    for (const f of COMBAT) expect(BODY_SIZE.exec(src(f))?.[0] ?? null, f).toBeNull();
  });

  it('B3 the same exchange at the min and max cosmetic scale resolves identically (range is root to root)', () => {
    const scene = new Scene(new NullEngine());
    const fight = (s: { heightScale: number; buildScale: number }) => {
      // two fighters on the mat; a body's scale is its ROOT's scaling, never its position
      const me = new TransformNode('me', scene), foe = new TransformNode('foe', scene), bones = new Skeleton('none', 'none', scene);
      applyProportions({ root: me, skeleton: bones }, s, Vector3.One());
      applyProportions({ root: foe, skeleton: bones }, s, Vector3.One());
      const out: unknown[] = [];
      for (const spacing of [0.9, 1.55, 1.7, 1.85, 2.2, 3]) {
        me.position.set(0, 0, 0); foe.position.set(0, 0, spacing);
        const dist = Vector3.Distance(me.position, foe.position);
        for (const table of [KARATE_ATTACKS, STAFF_ATTACKS]) {
          for (const atk of Object.values(table)) {
            const a = new FighterState(), d = new FighterState();
            const outcome = resolveStrike(atk, dist, d, 10_000, 0.1);
            out.push([atk.id, spacing, outcome, outcome === 'hit' ? applyHit(a, d, atk) : 0, d.hp]);
          }
        }
        for (const attack of Object.keys(ATTACK_TABLE) as AttackClass[]) {
          out.push(resolveAttack({ attack, guard: 'none', defenderMotion: 'still', spacing: dist, guardMeter: 0 }));
        }
      }
      me.dispose(); foe.dispose(); bones.dispose();
      return out;
    };
    const lo = fight({ heightScale: 0.96, buildScale: 0.94 }), hi = fight({ heightScale: 1.04, buildScale: 1.08 });
    expect(hi).toEqual(lo);
    expect(new Set(lo.map((x) => JSON.stringify(x))).size).toBeGreaterThan(10);   // the exchange covers whiffs and hits, not one answer
  });
});

// ── B4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT COUNTS AS READING A SCALED HAND, in the outcome layer (the modes, the core systems, the games; the anim layer draws):
//   HAND  — a hand or forearm bone looked up (boneNode(..'RightHand'..), the mode's ballHandNode, HandIK.armChain, the hoops
//           and dunk hand pickers) in a file that reads a world position (`getAbsolutePosition`, `absolutePosition`);
//   BALL  — a ball put on a hand (attachBallToHand, gatherBallToHand, the hand-off paths, ballCarry) in a file that reads that
//           ball's world position (`ball….getAbsolutePosition()`, `ballWorld()`).
// Deliberately wide: a file that does either must be named below, with why its hit is safe.
const HAND_LOOKUP = /boneNode\([^)]*['"`](?:\$\{[^}]*\})?(?:Left|Right)?(?:Hand|ForeArm)['"`]|ballHandNode\(|armChain\(|hoopsHand\(|dunkHand\(/;
const WORLD_READ = /\.getAbsolutePosition\(|\.absolutePosition\b|getAbsolutePositionToRef\(/;
const BALL_ON_HAND = /attachBallToHand\(|gatherBallToHand\(|runHandOffPath\(|runEastbayPath\(|from '\.\.\/anim\/ballCarry'|\bBallCarry\b/;
const BALL_WORLD = /\bball\w*\.getAbsolutePosition\(|\bball\w*\.absolutePosition\b|\bballWorld\(/;
function readsScaledHand(s: string): boolean {
  return (HAND_LOOKUP.test(s) && WORLD_READ.test(s)) || (BALL_ON_HAND.test(s) && BALL_WORLD.test(s));
}

type Allowed =
  | { kind: 'standard-frame'; modeIds: string[]; routed: string }
  | { kind: 'draw-only'; why: string; proof: RegExp[] };
/** Every file the scan finds, and why its hit cannot move an outcome. */
const ALLOWED: Record<string, Allowed> = {
  'lib/babylon/modes/DunkMode.ts': { kind: 'standard-frame', modeIds: ['dunk'], routed: 'R6' },
  'lib/babylon/modes/DunkDuelMode.ts': { kind: 'standard-frame', modeIds: ['dunkduel'], routed: 'R6' },
  'lib/babylon/modes/ThreePointMode.ts': { kind: 'standard-frame', modeIds: ['threepoint'], routed: 'R3' },
  'lib/babylon/modes/OneVOneMode.ts': { kind: 'standard-frame', modeIds: ['onevone'], routed: 'R4' },
  'lib/babylon/modes/ThreeVThreeMode.ts': { kind: 'standard-frame', modeIds: ['threevthree'], routed: 'R5' },
  // the derby's bat is placed through both fists every frame (drawing); the swing's contact is the pitch's timing times where the
  // PCI met the ball — neither reads the bat or a hand
  'lib/babylon/modes/precisionModes.ts': {
    kind: 'draw-only', why: 'the derby bat is drawn through the fists; contact = swingQuality(ball z) × PCI coverage',
    proof: [/const timing = swingQuality\(ball\.position\.z,/, /const off = Math\.hypot\(pci\.pos\.x - ball\.position\.x, pci\.pos\.y - ball\.position\.y\)/],
  },
};

const OUTCOME_LAYER = ['lib/babylon/modes', 'lib/babylon/core', 'lib/babylon/combat', 'lib/babylon/nexus', 'lib/babylon/racing', 'lib/combat', 'components/games'];
const LEGACY_GAMES = ['components/games/dunk-game-3d.tsx', 'components/games/basketball-3d.tsx', 'components/games/one-v-one-3d.tsx', 'components/games/three-point-3d.tsx'];

describe('B4 no gameplay-outcome code reads a scaled hand bone', () => {
  it('B4 the scan tells a hand read from a draw (control)', () => {
    expect(readsScaledHand("const h = boneNode(sk, 'RightHand'); h.getAbsolutePosition();")).toBe(true);
    expect(readsScaledHand('attachBallToHand(ball, sk, hand); arc.start(ball.getAbsolutePosition(), RIM);')).toBe(true);
    expect(readsScaledHand("staff.parent = boneNode(sk, 'RightHand');")).toBe(false);
    expect(readsScaledHand('attachBallToHand(ball, sk, hand); const made = Math.random() < q;')).toBe(false);
  });

  it('B4 every hit is a standard-frame mode (spawned at 1.0 until its routed diff lands) or proven draw-only', () => {
    const hits = OUTCOME_LAYER.flatMap((d) => walk(d)).filter((f) => readsScaledHand(src(f)));
    expect(hits.sort()).toEqual(Object.keys(ALLOWED).sort());
    for (const [f, a] of Object.entries(ALLOWED)) {
      const s = src(f);
      if (a.kind === 'standard-frame') {
        for (const id of a.modeIds) {
          expect(STANDARD_FRAME_MODES[id]?.routed, `${f} ${id}`).toBe(a.routed);
          expect(s, `${f} declares modeId '${id}'`).toMatch(new RegExp(`modeId: '${id}'`));
        }
      } else {
        for (const p of a.proof) expect(s, `${f}: ${a.why}`).toMatch(p);
      }
    }
  });

  it('B4 the legacy three.js games read no body size at all', () => {
    for (const f of LEGACY_GAMES) expect(BODY_SIZE.exec(src(f))?.[0] ?? null, f).toBeNull();
  });
});
