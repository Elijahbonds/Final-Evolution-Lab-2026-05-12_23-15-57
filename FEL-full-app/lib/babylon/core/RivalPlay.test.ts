// DUNK MOTION phase 11 — the rival plays like a person (owner: "it needs to look like one of the users attempts or like another
// person was playing"). His pad's two decisions: what he goes for, and where his SLAM lands.
import { describe, it, expect } from 'vitest';
import { rivalTricksFor, rivalSlamOffset, RIVAL_REACH } from './RivalPlay';
import { DUNK_TRICKS, SIGNATURE_DUNKS, SLAM_EDGE_EXEC, slamExecution } from './DunkSystem';
import { DUNK_RIVALS } from './DunkRivals';

const fixed = (v: number) => () => v;

describe('what the rival goes for', () => {
  it('a plain one when he is not reaching, his OWN dunk in the middle', () => {
    expect(rivalTricksFor(RIVAL_REACH.plain - 0.1, 'TOMAHAWK')).toEqual([]);
    expect(rivalTricksFor(RIVAL_REACH.plain + 0.5, 'TOMAHAWK').map((t) => t.id)).toEqual(['tomahawk']);
    expect(rivalTricksFor(RIVAL_REACH.plain + 0.5, 'BETWEEN THE LEGS').map((t) => t.id)).toEqual(['betweenlegs']);
  });
  it('every rival on the roster has a signature the vocabulary can throw', () => {
    for (const r of DUNK_RIVALS) expect(DUNK_TRICKS.some((t) => t.label === r.signature), `${r.name}: ${r.signature}`).toBe(true);
  });
  it('reaching harder: his own dunk or one a notch harder than it', () => {
    const sig = DUNK_TRICKS.find((t) => t.id === 'tomahawk')!;
    for (const r of [0, 0.3, 0.6, 0.9]) {
      const [t] = rivalTricksFor(RIVAL_REACH.signature + 0.5, 'TOMAHAWK', fixed(r));
      expect(t.id === 'tomahawk' || (t.difficulty > sig.difficulty && t.difficulty <= sig.difficulty + 1.2), t.id).toBe(true);
    }
  });
  it('going for it: a NAMED chain that opens with his dunk when there is one', () => {
    const chain = rivalTricksFor(RIVAL_REACH.harder + 1, '360', fixed(0));
    expect(chain.length).toBe(2);
    expect(chain[0].id).toBe('spin360');
    expect(SIGNATURE_DUNKS.some((d) => !d.runway && d.air.join() === chain.map((t) => t.id).join())).toBe(true);
    // a signature no chain opens with still gets a real, named chain
    const other = rivalTricksFor(RIVAL_REACH.harder + 1, 'TOMAHAWK', fixed(0));
    expect(SIGNATURE_DUNKS.some((d) => !d.runway && d.air.join() === other.map((t) => t.id).join())).toBe(true);
  });
});

describe('where his SLAM lands', () => {
  const half = 0.14, reach = 0.3;   // (the buffer's reach only shapes presses EARLIER than the window — his never are)
  it('the execution the card reads IS the one he rolled — late or early', () => {
    for (const acc of [1, 0.9, 0.75, 0.5, 0.2]) {
      expect(slamExecution(1.25 + rivalSlamOffset(acc, false, half), 1.25, half, reach)).toBeCloseTo(Math.min(1, acc + 0.02 * (1 - acc)), 2);
      if (acc >= SLAM_EDGE_EXEC) expect(slamExecution(1.25 + rivalSlamOffset(acc, true, half), 1.25, half, reach)).toBeCloseTo(acc, 5);
    }
  });
  it('a clean one can be early; a leaky one is late (never refused as too early)', () => {
    expect(rivalSlamOffset(0.95, true, half)).toBeLessThan(0);
    expect(rivalSlamOffset(0.5, true, half)).toBeGreaterThan(0);
    expect(rivalSlamOffset(0.5, false, half)).toBeLessThan(half);   // still inside the window
  });
});
