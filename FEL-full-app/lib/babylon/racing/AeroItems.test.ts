import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { collectBalloon, balloonsHit, useItem, stepMissiles, stepMines, bananasAfterHit, type Balloon, type Missile, type Mine } from './AeroItems';

describe('balloons', () => {
  it('the same colour levels the item up to 3; another colour replaces it', () => {
    let h = collectBalloon(null, 'missile');
    h = collectBalloon(h, 'missile'); h = collectBalloon(h, 'missile'); h = collectBalloon(h, 'missile');
    expect(h).toEqual({ kind: 'missile', level: 3 });
    expect(collectBalloon(h, 'shield')).toEqual({ kind: 'shield', level: 1 });
  });

  it('a fast plane still pops a balloon it passes through between frames', () => {
    const b: Balloon[] = [{ id: 0, kind: 'boost', pos: new Vector3(0, 10, 5), respawn: 0 }];
    expect(balloonsHit(b, new Vector3(0, 10, 0), new Vector3(0, 10, 12)).length).toBe(1);
    b[0].respawn = 2;
    expect(balloonsHit(b, new Vector3(0, 10, 0), new Vector3(0, 10, 12)).length).toBe(0);
  });
});

describe('items', () => {
  const from = new Vector3(0, 10, 0), aim = new Vector3(0, 0, 1), back = new Vector3(0, 0, -1);

  it('level 1 missile flies straight, level 2 homes, level 3 fires three', () => {
    expect(useItem({ kind: 'missile', level: 1 }, 0, from, aim, back, 2).missiles[0].homing).toBe(false);
    expect(useItem({ kind: 'missile', level: 2 }, 0, from, aim, back, 2).missiles[0].target).toBe(2);
    expect(useItem({ kind: 'missile', level: 3 }, 0, from, aim, back, 2).missiles.length).toBe(3);
  });

  it('boost and shield scale with level; mines drop behind', () => {
    expect(useItem({ kind: 'boost', level: 3 }, 0, from, aim, back, null).boostSec).toBeGreaterThan(useItem({ kind: 'boost', level: 1 }, 0, from, aim, back, null).boostSec);
    expect(useItem({ kind: 'shield', level: 2 }, 0, from, aim, back, null).shieldSec).toBe(6);
    const mines = useItem({ kind: 'mine', level: 3 }, 0, from, aim, back, null).mines;
    expect(mines.length).toBe(3);
    for (const m of mines) expect(m.pos.z).toBeLessThan(0);
  });

  it('a homing missile catches a racer that moved off its first line; a shield absorbs it', () => {
    const target = { id: 1, pos: new Vector3(25, 10, 60), protected: false };
    const ms: Missile[] = useItem({ kind: 'missile', level: 2 }, 0, from, aim, back, 1).missiles;
    let hit: number[] = [];
    for (let i = 0; i < 120 && !hit.length; i++) hit = stepMissiles(ms, [target], 1 / 60).hit;
    expect(hit).toEqual([1]);
    const ms2: Missile[] = useItem({ kind: 'missile', level: 2 }, 0, from, aim, back, 1).missiles;
    let absorbed: number[] = [];
    for (let i = 0; i < 120 && !absorbed.length; i++) absorbed = stepMissiles(ms2, [{ ...target, pos: target.pos.clone(), protected: true }], 1 / 60).absorbed;
    expect(absorbed).toEqual([1]);
  });

  it('you cannot hit your own missile, and a mine arms before it can hit', () => {
    const ms: Missile[] = useItem({ kind: 'missile', level: 1 }, 0, from, aim, back, null).missiles;
    expect(stepMissiles(ms, [{ id: 0, pos: from.add(aim.scale(5)), protected: false }], 1 / 60).hit).toEqual([]);
    const mines: Mine[] = [{ pos: new Vector3(0, 10, 0), life: 20, owner: 0, armT: 0.6 }];
    expect(stepMines(mines, [{ id: 1, pos: new Vector3(0, 10, 0), protected: false }], 0.1).hit).toEqual([]);
    expect(stepMines(mines, [{ id: 1, pos: new Vector3(0, 10, 0), protected: false }], 0.6).hit).toEqual([1]);
  });

  it('a hit knocks bananas loose', () => {
    expect(bananasAfterHit(7)).toBe(5);
    expect(bananasAfterHit(1)).toBe(0);
  });
});
