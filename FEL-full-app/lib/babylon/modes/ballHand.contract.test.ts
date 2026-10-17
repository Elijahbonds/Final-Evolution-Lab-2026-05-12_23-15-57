// hoops-handle (owner 2026-10-17: "The model only dribbles right handed, let's fix that"): the modes keep the ball in the hand a move left
// it in, and the 3v3 AI handlers dribble with either hand.
//   · H2d's strong-hand return (the ball back to the right on a stop / after 1.2 s) is behind STRONG_HAND_RETURNS, which is off: measured
//     on the rig, it took the ball back 1.55 s after a crossover with no input;
//   · every 3v3 body has the left-hand loops (the AI handlers' were never made), and the AI handlers' trees are told the ball's hand;
//   · the AI handler's crossing is a carry path (runMove) stepped by core/AiBallHand — never a requestMove (a chain move that reads a
//     defender and rolls odds) and never a roll of its own.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STRONG_HAND_RETURNS } from '../core/StrongHand';

const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8');
const three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');

describe('the ball stays in the hand a move left it in', () => {
  it('the strong-hand return is off', () => { expect(STRONG_HAND_RETURNS).toBe(false); });
  for (const [name, src] of [['1v1', one], ['3v3', three]] as const) {
    it(`${name}: the return's whole block is gated on the switch (its rule and wiring kept for a flip back)`, () => {
      const at = src.indexOf('const sh = stepStrongHand(strongHand, dt, {'); expect(at, name).toBeGreaterThan(0);
      const head = src.slice(src.lastIndexOf('\n', at - 200), at);
      expect(head, name).toMatch(/if \(STRONG_HAND_RETURNS\) \{ \/\/ hoops-handle/);
      expect(src.match(/stepStrongHand\(/g)?.length, name).toBe(1);
    });
  }
});

describe('3v3: the AI handlers dribble with either hand', () => {
  it('every body gets the left-hand loops (not only the hero)', () => {
    expect(three).not.toMatch(/if \(!ai\) leftDribbleTwins/);
    expect(three).toMatch(/\n\s+leftDribbleTwins\(char\.animator, char\.skeleton\);/);
  });
  it('the mates\' and their driver\'s trees are told the ball\'s hand (and a running crossing)', () => {
    const mate = three.slice(three.indexOf('body.tree.update({'), three.indexOf('body.tree.update({') + 600);
    expect(mate).toMatch(/ballHand: carries\.get\(body\)\?\.hand === 'Left' \? 'left' : 'right', moveActive: !!carries\.get\(body\)\?\.move/);
    const drv = three.slice(three.indexOf('if (!foeDunkFlight) f.tree.update({'), three.indexOf('if (!foeDunkFlight) f.tree.update({') + 400);
    expect(drv).toMatch(/ballHand: carries\.get\(f\)\?\.hand === 'Left' \? 'left' : 'right', moveActive: !!carries\.get\(f\)\?\.move/);
  });
  it('the AI handler\'s hand is stepped every frame on the dribbler that is not me, and crosses on his carry — no requestMove, no roll', () => {
    const at = three.indexOf('const st = stepAiHand(aiHand, dt, {'); expect(at).toBeGreaterThan(0);
    const blk = three.slice(three.lastIndexOf('{ // hoops-handle', at), at + 700);
    expect(blk).toMatch(/const ab = cbNow && cbNow !== me \? cbNow : null;/);
    expect(blk).toMatch(/sideAwayFrom\(ab\.char\.root\.position, ab\.char\.root\.rotation\.y, near\.char\.root\.position\)/);
    expect(blk).toMatch(/if \(st\.cross && ac\.runMove\('crossover', \{ pace: 1 \}\)\) \{ aiCrosses\+\+;/);
    expect(blk).not.toMatch(/requestMove\(|roll\(|Math\.random/);
  });
});
