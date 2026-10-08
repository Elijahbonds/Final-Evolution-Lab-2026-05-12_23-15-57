// The story map (Phase B): the hub and World 1 on one plane, valid as authored, and shaped the way the chapter needs
// (the voids are voids, the wall gap needs the wall, World 1 is cut off from the hub on foot, the body budget holds).
import { describe, expect, it } from 'vitest';
import { DEFAULT_MOVEMENT } from '../../movement';
import { groundYOf } from '../pieces';
import { buildStoryMap, encounterOf, findSpawn, validateStoryMap, worldAt } from './storyMap';
import { W1_GAPS, W1_WALL } from '../ch1/world1';
import { STORY_BESTIARY, STORY_BOSSES } from '../ch1/bestiary';
import { validateMonsterDef } from '../../combat/monsters/defs';
import { validateBossDef } from '../../combat/bosses/defs';

const map = buildStoryMap();
const g = (x: number, z: number) => groundYOf(map.pieces, x, z);

describe('the story map', () => {
  it('validates: rails, spawns on the ground, encounters from the bestiary, gates to real spawns, unique ids, no overlap', () => {
    expect(validateStoryMap(map)).toEqual([]);
    expect([...map.worlds.keys()]).toEqual(['hub', 'w1']);
  });

  it('the bestiary\'s additions keep A2\'s rules (readable tells, [PLACEHOLDER] names)', () => {
    for (const d of Object.values(STORY_BESTIARY)) expect(validateMonsterDef(d), d.id).toEqual([]);
    for (const d of Object.values(STORY_BOSSES)) expect(validateBossDef(d), d.id).toEqual([]);
  });

  it('every void is a void across its width (a fall, then the checkpoint)', () => {
    for (const [k, gap] of Object.entries(W1_GAPS)) {
      for (let z = gap.z0 + 0.5; z < gap.z1; z += 2) expect(g(0, z), `${k} at z ${z}`).toBeNull();
    }
  });

  it('World 1 is reached through its gate and left by air: no ground path joins it to the hub', () => {
    expect(worldAt(map, { x: 0, z: -300 })).toBe('w1');
    expect(worldAt(map, { x: 0, z: 0 })).toBe('hub');
    expect(worldAt(map, { x: 0, z: -70 })).toBeNull();
    for (let x = -60; x <= 60; x += 4) expect(g(x, -70)).toBeNull();
  });

  it('the wall gap needs the wall: longer than a full-speed jump and air dash, shorter than the wall run and its kick', () => {
    const m = DEFAULT_MOVEMENT;
    const top = m.ground.flowTopSpeeds[m.ground.flowTopSpeeds.length - 1];
    const air = (2 * m.air.jumpSpeed) / m.air.gravity;
    const jumpAndDash = top * air + m.air.airDashSpeed * m.air.airDashSec;
    const gap = W1_GAPS.wall.z1 - W1_GAPS.wall.z0;
    expect(gap).toBeGreaterThan(jumpAndDash);              // a plain jump and dash at the top FLOW tier fall short
    // the wall run (MatrixFocus WALL_RUN.sec at the run's speed) and its kick (up kickUp, 0.85 of the run forward) carry
    const wallAndKick = 0.95 * top + 0.85 * top * ((2 * m.wall.kickUp) / m.air.gravity);
    expect(gap).toBeLessThan(wallAndKick);
    expect(W1_WALL.z1).toBeGreaterThan(W1_GAPS.wall.z1);    // the wall spans the gap
    expect(W1_WALL.z0).toBeLessThan(W1_GAPS.wall.z0);
  });

  it('the body budget (plan: ≤ 12 in a story scene): no encounter brings more than five bodies', () => {
    for (const w of map.worlds.values()) for (const e of w.encounters) expect(e.monsters.length + (e.boss ? 1 : 0), e.id).toBeLessThanOrEqual(5);
    expect(encounterOf(map, 'w1.boss')?.enc.boss?.def).toBe('ch1');
    expect(findSpawn(map, 'hub.landing')?.worldId).toBe('hub');
  });

  it('the hub\'s upper level is eight metres up (flight only) and holds the flight-sealed gate', () => {
    expect(g(0, 30)).toBe(8);
    const w2 = map.worlds.get('hub')!.gates.find((x) => x.id === 'gate.w2')!;
    expect(w2).toMatchObject({ requires: 'flight', to: null });
    // only World 1 opens: every other gate leads nowhere yet
    expect(map.worlds.get('hub')!.gates.filter((x) => x.to).map((x) => x.id)).toEqual(['gate.w1']);
  });
});
