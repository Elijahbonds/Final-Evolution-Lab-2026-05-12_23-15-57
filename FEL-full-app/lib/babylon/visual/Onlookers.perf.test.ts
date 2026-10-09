// Onlookers under the perf governor (perf-guard, 2026-10-06): a phone under load holds the crowd's idle clips; the load
// going lets them move again, and the governor never restarts a clip the animator has since stopped.
import { describe, it, expect, vi } from 'vitest';
import { NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';

class FakeGroup {
  isStarted = true; isPlaying = true; pauses = 0; restarts = 0;
  pause() { this.isPlaying = false; this.pauses++; }
  restart() { this.isPlaying = true; this.restarts++; }
}
const groups: FakeGroup[] = [];
const cheers: number[] = [];
vi.mock('../core/CharacterLibrary', () => ({
  CharacterLibrary: {
    spawn: async (scene: Scene) => {
      const g = new FakeGroup(); groups.push(g);
      return {
        root: new TransformNode('onlooker', scene),
        animator: { currentGroup: g, play: () => { cheers.push(1); } },
        dispose() {},
      };
    },
  },
}));
vi.mock('../core/athleteRoster', () => ({ DEFAULT_HERO_URL: 'hero.glb' }));

const { Onlookers } = await import('./Onlookers');
const { registerPerfTarget } = await import('../core/perfGuard');
const { LEVELS, MAX_LEVEL } = await import('../core/PerfGovernor');

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('Onlookers × perf governor', () => {
  it('holds the idle clips at a "still" level and resumes them at "full"', async () => {
    groups.length = 0;
    const scene = new Scene(new NullEngine());
    const crowd = new Onlookers(scene, [new Vector3(1, 0, 0), new Vector3(2, 0, 0), new Vector3(3, 0, 0)]);
    await settle();
    expect(groups).toHaveLength(3);
    crowd.setPerfLevel(LEVELS[MAX_LEVEL]);
    expect(groups.every((g) => g.pauses === 1 && !g.isPlaying)).toBe(true);
    crowd.setPerfLevel(LEVELS[MAX_LEVEL]);                 // idempotent
    expect(groups.every((g) => g.pauses === 1)).toBe(true);
    crowd.setPerfLevel(LEVELS[0]);
    expect(groups.every((g) => g.restarts === 1 && g.isPlaying)).toBe(true);
    crowd.dispose();
  });

  it('a held crowd cheers with the hop alone; a clip the animator stopped meanwhile is not restarted', async () => {
    groups.length = 0; cheers.length = 0;
    const scene = new Scene(new NullEngine());
    const crowd = new Onlookers(scene, [new Vector3(1, 0, 0)]);
    await settle();
    crowd.setPerfLevel(LEVELS[MAX_LEVEL]);
    crowd.cheer(1);
    expect(cheers).toHaveLength(0);
    groups[0].isStarted = false;                            // the animator moved on
    crowd.setPerfLevel(LEVELS[0]);
    expect(groups[0].restarts).toBe(0);
    crowd.cheer(1);
    expect(cheers).toHaveLength(1);
    crowd.dispose();
  });

  it('registers with the scene\'s governor, and a body that lands while held is held too', async () => {
    groups.length = 0;
    const scene = new Scene(new NullEngine());
    (scene.metadata ??= {}).felPerfLevel = LEVELS[MAX_LEVEL];   // the governor is already down when the crowd spawns
    const crowd = new Onlookers(scene, [new Vector3(1, 0, 0)]);
    await settle();
    expect(groups[0].pauses).toBe(1);
    const seen: string[] = [];
    registerPerfTarget(scene, { setPerfLevel: (l) => seen.push(l.crowd) });
    for (const t of (scene.metadata.felPerfTargets as Array<{ setPerfLevel(l: unknown): void }>)) t.setPerfLevel(LEVELS[0]);
    expect(groups[0].restarts).toBe(1);
    crowd.dispose();
    expect((scene.metadata.felPerfTargets as unknown[]).length).toBe(1);   // the crowd unregistered; the other stays
  });
});
