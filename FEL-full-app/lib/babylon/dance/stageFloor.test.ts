// The dance floor's lit tiles (vis-party, 2026-10-13): a pure function of the beat/bar position, held for the bar under reduced
// flashing, and one disc and one material on the deck.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { FLOOR_TILES, floorKey, floorTile, mountStageFloor, tileOnDeck, type FloorState } from './stageFloor';

const ctx2d = new Proxy({}, { get: () => () => {}, set: () => true });
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class { width = 1; height = 1; getContext() { return ctx2d; } };

const st = (beatIndex: number, beatPhase = 0, barIndex = Math.floor(beatIndex / 4), calm = false): FloorState => ({ beatIndex, beatPhase, barIndex, calm });
const grid = (s: FloorState): number[] => { const o: number[] = []; for (let r = 0; r < FLOOR_TILES; r++) for (let c = 0; c < FLOOR_TILES; c++) o.push(floorTile(c, r, s)); return o; };

describe('the dance floor tiles', () => {
  it('every tile is lit between 0 and 1', () => {
    for (let b = 0; b < 12; b++) for (const p of [0, 0.4, 0.99]) for (const v of grid(st(b, p))) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
  it('the checker flips on the beat: a tile bright on one beat is dim on the next', () => {
    const a = floorTile(2, 2, st(4, 0.5)), b = floorTile(2, 2, st(5, 0.5));
    expect(Math.abs(a - b)).toBeGreaterThan(0.1);
  });
  it('the same song position is the same floor (a pause holds it, a rewind returns to it)', () => {
    const a = grid(st(9, 0.3)); grid(st(40, 0.9));
    expect(grid(st(9, 0.3))).toEqual(a);
  });
  it('reduced flashing holds the floor for the whole bar and moves on at the next', () => {
    const first = grid(st(8, 0, 2, true));
    for (const [b, p] of [[8, 0.6], [9, 0], [10, 0.9], [11, 0.5]] as const) expect(grid(st(b, p, 2, true))).toEqual(first);
    expect(grid(st(12, 0, 3, true))).not.toEqual(first);
  });
  it('the corners of the square canvas are off the deck, the middle is on it', () => {
    expect(tileOnDeck(0, 0)).toBe(false);
    expect(tileOnDeck(FLOOR_TILES - 1, FLOOR_TILES - 1)).toBe(false);
    expect(tileOnDeck(5, 5)).toBe(true);
    expect(tileOnDeck(4, 0)).toBe(true);
  });
  it('repaints on a third of a beat live and once a bar calm', () => {
    expect(floorKey(st(5, 0.1))).toBe(floorKey(st(5, 0.3)));
    expect(floorKey(st(5, 0.1))).not.toBe(floorKey(st(5, 0.5)));
    expect(floorKey(st(5, 0.1, 1, true))).toBe(floorKey(st(7, 0.9, 1, true)));
  });
});

describe('the dance floor: the mesh', () => {
  let scene: Scene;
  beforeAll(() => { scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene); });
  it('is one disc on the deck, repainting only when the step changes, and disposes clean', () => {
    const before = scene.meshes.length;
    const f = mountStageFloor(scene, { radius: 2, y: 0.7, small: false });
    expect(scene.meshes.length).toBe(before + 1);
    expect(f.mesh.position.y).toBe(0.7);
    expect(f.update(st(5, 0.1))).toBe(true);
    expect(f.update(st(5, 0.2))).toBe(false);
    expect(f.update(st(6, 0.1))).toBe(true);
    f.dispose();
    expect(scene.meshes.length).toBe(before);
  });
});
