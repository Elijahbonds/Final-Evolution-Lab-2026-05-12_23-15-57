// Does a throw solved in a corner pane's frame reach the pane, and does the world flight land where it was aimed?
import { describe, it, expect } from 'vitest';
import { paneLobVelocity, lobAt, GRAVITY } from './DunkLob';
import { cornerPanes } from './DunkParkour';

describe('the corner-billboard lob', () => {
  const pane = cornerPanes(5.6, -7.5)[1];   // the left front corner, facing the runway centre
  it('the hit lies on the pane and the flight before it is a plain arc from the throw', () => {
    // the passer on the RUNWAY side of the line near the centre (the panes face up the runway; from behind them there is no bank)
    const from = { x: -1.2, y: 1.6, z: -4.5 }, to = { x: 0, y: 3.4, z: -10.5 };
    const g = paneLobVelocity(from, to, pane, 1.2)!;
    expect(g).not.toBeNull();
    const onPane = (g.hitWorld.x - pane.cx) * pane.nx + (g.hitWorld.z - pane.cz) * pane.nz;
    expect(Math.abs(onPane)).toBeLessThan(1e-6);
    const p = lobAt(from, g.v, g.t1);   // the world arc at the contact time meets the contact point (plus the ball's radius off the face)
    expect(Math.hypot(p.x - g.hitWorld.x, p.z - g.hitWorld.z)).toBeLessThan(0.2); expect(Math.abs(p.y - g.hitWorld.y)).toBeLessThan(1e-3);
    expect(GRAVITY).toBeGreaterThan(9);
  });
  it('refuses a throw from behind the pane', () => {
    expect(paneLobVelocity({ x: -8, y: 1, z: -3 }, { x: 0, y: 3, z: -13 }, pane, 1.2)).toBeNull();
  });
});
