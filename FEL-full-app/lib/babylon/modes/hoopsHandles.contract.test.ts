// HOOPS MOTION phase 4 — the handles' wiring in the two modes (contract: the source), beside handleMotion.test's render counts.
//
// 4b review F3: THE BITE KEEPS ITS SIDE. doMove's clip side became the ball's END hand in 4b (one value for the clip and the ball, S31), and
// reactToBreak took that value too — so the defender's ANKLE_BITE slide (victimSlide: 0.45 m at 2.6 m/s, a direct root write) lunged the
// other way on a left-stick reversal cut away from him, on every hesi, and on the drop step's momentum cross (3v3 t_hesi~2 logged "bite
// right" at base, "bite left" at 4b). Plan §3.7 keeps the bite where it was: the side the call site named, else away from him.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sideAwayFrom } from '../anim/athleteSide';

const src = (f: string) => readFileSync(`lib/babylon/modes/${f}`, 'utf8');
const fnOf = (s: string, name: string, len = 9000) => s.slice(s.indexOf(`function ${name}(`), s.indexOf(`function ${name}(`) + len);

describe('4b review F3: reactToBreak\'s bite side is phase 3\'s (the side named, else away from him), not the ball\'s end hand', () => {
  it('1v1: doMove hands reactToBreak `dirHint ?? sideAwayFrom(me, facing, him)`; the clip keeps the ball\'s side', () => {
    const fn = fnOf(src('OneVOneMode.ts'), 'doMove');
    expect(fn).toMatch(/const moveDir: 'left' \| 'right' = r\.clipDir;/);
    expect(fn).toMatch(/const biteDir: 'left' \| 'right' = dirHint \?\? sideAwayFrom\(me\.root\.position, me\.root\.rotation\.y, foe\.root\.position\);/);
    expect(fn).toMatch(/reactToBreak\(ctx, outcome, biteDir\);/);
    expect(fn).not.toMatch(/reactToBreak\(ctx, outcome, moveDir\)/);
  });
  it('3v3: the same, with its no-foe default (phase 3\'s `dirHint ?? \'right\'` when nobody is there)', () => {
    const fn = fnOf(src('ThreeVThreeMode.ts'), 'doMove');
    expect(fn).toMatch(/const biteDir: 'left' \| 'right' = dirHint \?\? \(foe \? sideAwayFrom\(me\.char\.root\.position, me\.char\.root\.rotation\.y, foe\.char\.root\.position\) : 'right'\);/);
    expect(fn).toMatch(/reactToBreak\(ctx, outcome, foe, move, biteDir\);/);
  });
  it('the side: a defender on my left → the move goes right → he bites LEFT (the side the ball left); reactToBreak reads it that way', () => {
    // facing +z (yaw 0), his body 1 m to my left (−x: athleteRight(0) = +x)
    expect(sideAwayFrom({ x: 0, z: 0 }, 0, { x: -1, z: 0.3 })).toBe('right');
    expect(sideAwayFrom({ x: 0, z: 0 }, 0, { x: 1, z: 0.3 })).toBe('left');
    for (const f of ['OneVOneMode.ts', 'ThreeVThreeMode.ts']) {
      const fn = fnOf(src(f), 'reactToBreak', 4000);
      expect(fn, f).toMatch(/const bite = right\.scale\(moveDir === 'right' \? -1 : 1\);/);   // moveDir 'right' → the bite toward his LEFT (−right)
    }
  });
});

// 4b review F4: the rival's crossover keeps its ball until 4f (plan §4.20) routes him through HandleMotion — the ledger's L1 was over its
// limit in two runs with the hero's crossover path on his carry, and under it in two with his ball held (p4/4c/review/f4-rival.txt).
describe('4b review F4: the rival\'s crossover plays its clip and runs no crossing path (until 4f)', () => {
  it('1v1: the beat stays; foeCarry.toSide is not called', () => {
    const one = src('OneVOneMode.ts');
    const at = one.indexOf("if (dec.crossover) {");
    const block = one.slice(at, at + 2400);
    // (phase 4c) the beat names the CAPTURE he played before 4c (opponentMotion swapped it in for bball_crossover_*; since 4c the hero's
    // crossover is the v2 clip keyed on a ball path his held ball does not run) — the authored clip only on a rig without the capture
    expect(block).toMatch(/const cap = `bball_mc_crossover_\$\{dec\.crossover === 'left' \? 'left' : 'right'\}`;/);
    expect(block).toMatch(/foeAnimTree\.beat\(foe\.animator\.clipNames\.has\(cap\) \? cap : dec\.crossover === 'left' \? 'bball_crossover_left' : 'bball_crossover_right', \{ fadeSec: 0\.12 \}\);/);
    expect(one).not.toMatch(/^\s*foeCarry\?\.toSide\(/m);
  });
  it('(phase 4c) the capture he names is the one that stood in for the authored crossover before 4c, and still builds by that name', async () => {
    const { MOCAP_OPPONENT_CLIPS } = await import('../anim/authored/mocapOpponents');
    for (const d of ['left', 'right'] as const) {
      const c = MOCAP_OPPONENT_CLIPS.find((x) => x.name === `bball_mc_crossover_${d}`);
      expect(c?.source).toMatch(/06_13\.bvh 6\.20–6\.68s/);
      expect(c?.replaces).not.toBe(`bball_crossover_${d}`);   // the hero's authored crossover is not swapped out any more
    }
  });
});
