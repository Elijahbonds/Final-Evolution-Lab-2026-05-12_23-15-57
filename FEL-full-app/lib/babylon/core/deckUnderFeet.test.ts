// ANIM-RESIDUAL (2026-09-14): in the air the skate deck follows the feet (BoardPhysics.deckUnderFeet), on the ground it
// stays where the wheels are.
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, MeshBuilder, TransformNode } from '@babylonjs/core';
import { BoardSync, deckUnderFeet, DECK_LIFT_MAX, DECK_SHIFT_MAX, DECK_DROP_MAX } from './BoardPhysics';

const G = { x: 0.04, y: -0.06, z: -0.03 };   // the ride stance's own feet midpoint, root-local (measured live)

describe('the deck under the feet', () => {
  it('on the ground the deck never moves, whatever the feet do', () => {
    expect(deckUnderFeet({ x: 0.3, y: 0.4, z: 0.2 }, G, false)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('in the air it keeps the ground offset: a still stance is a still deck', () => {
    const d = deckUnderFeet(G, G, true);
    expect(Math.hypot(d.x, d.y, d.z)).toBeLessThan(1e-9);
  });

  it('a grab that draws the feet up and across carries the deck with them (the eye\'s detached frame)', () => {
    // measured on the pre-fix grab: ankles 0.11 m up and 0.23 m across the parked deck
    const d = deckUnderFeet({ x: G.x + 0.23, y: G.y + 0.11, z: G.z + 0.1 }, G, true);
    expect(d.x).toBeCloseTo(0.23, 5); expect(d.y).toBeCloseTo(0.11, 5); expect(d.z).toBeCloseTo(0.1, 5);
  });

  it('is clamped: the deck never leaves the rider, never sinks under the root, and a NaN foot is ignored', () => {
    const far = deckUnderFeet({ x: 5, y: 5, z: -5 }, G, true);
    expect(far).toEqual({ x: DECK_SHIFT_MAX, y: DECK_LIFT_MAX, z: -DECK_SHIFT_MAX });
    expect(deckUnderFeet({ x: G.x, y: -3, z: G.z }, G, true).y).toBe(-DECK_DROP_MAX);
    expect(deckUnderFeet({ x: NaN, y: NaN, z: NaN }, G, true)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('BoardSync places the deck at the offset and still refuses a detached prop', () => {
    const scene = new Scene(new NullEngine());
    const root = new TransformNode('rider', scene);
    const board = MeshBuilder.CreateBox('board', { width: 0.26, height: 0.06, depth: 0.84 }, scene);
    board.parent = root;
    const sync = new BoardSync(board, root);
    sync.update(0, true, 0, { x: 0.1, y: 0.2, z: -0.1 });
    expect([board.position.x, board.position.y, board.position.z].map((v) => +v.toFixed(3))).toEqual([0.1, 0.23, -0.1]);
    sync.update(0, false);
    expect([board.position.x, board.position.y, board.position.z].map((v) => +v.toFixed(3))).toEqual([0, 0.03, 0]);
    board.parent = null;
    expect(() => sync.update(0, true, 0, { x: 0, y: 0, z: 0 })).toThrow(/detached/);
    scene.dispose();
  });
});
