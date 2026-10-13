// Quiz podiums (vis-party, 2026-10-13): what a spectator reads off a podium from across the room, as a table that can be held to it.
import { beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { PODIUM_FLASH_SEC, PODIUM_LOOK, podiumLevelAt, podiumLook, mountQuizPodiums, type PodiumState } from './quizPodiums';

const STATES: PodiumState[] = ['armed', 'buzzed', 'right', 'wrong', 'out'];

describe('quiz podiums: the state table', () => {
  it('every state has its own read: no two states share a colour and level', () => {
    const reads = STATES.map((s) => { const l = podiumLook(s, '#22d3ee'); return `${l.hex}|${l.level}`; });
    expect(new Set(reads).size).toBe(STATES.length);
  });
  it('right is green, wrong is red, the buzz is white-hot, and a locked-out seat goes dim', () => {
    expect(PODIUM_LOOK.right.hex).toBe('#34d399');
    expect(PODIUM_LOOK.wrong.hex).toBe('#ef4444');
    expect(PODIUM_LOOK.buzzed.level).toBeGreaterThan(PODIUM_LOOK.armed.level);
    expect(PODIUM_LOOK.out.level).toBeLessThan(PODIUM_LOOK.armed.level);
  });
  it('an armed seat keeps its own colour so the two players are told apart', () => {
    expect(podiumLook('armed', '#22d3ee').hex).toBe('#22d3ee');
    expect(podiumLook('armed', '#f472b6').hex).toBe('#f472b6');
  });
  it('a flash state eases from its peak toward a resting glow and stays above the armed level', () => {
    for (const s of ['buzzed', 'right', 'wrong'] as const) {
      expect(podiumLevelAt(s, 0)).toBe(PODIUM_LOOK[s].level);
      expect(podiumLevelAt(s, PODIUM_FLASH_SEC)).toBeLessThan(podiumLevelAt(s, 0));
      expect(podiumLevelAt(s, 99)).toBeCloseTo(PODIUM_LOOK[s].level * 0.7, 6);
      expect(podiumLevelAt(s, 99)).toBeGreaterThan(PODIUM_LOOK.armed.level * 0.7);
    }
    expect(podiumLevelAt('armed', 5)).toBe(PODIUM_LOOK.armed.level);
  });
});

describe('quiz podiums: the meshes', () => {
  let scene: Scene;
  beforeAll(() => { scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 1, -3), scene); });
  it('a base and a ring a seat, the ring named for the glow include list', async () => {
    const { glowCandidate } = await import('../scene/EmissiveGlow');
    const p = mountQuizPodiums(scene, ['#22d3ee', '#f472b6']);
    expect(p.meshes.length).toBe(4);
    const ring = scene.getMeshByName('wsi_podium_neon_ring_0')!;
    const m = ring.material as unknown as { emissiveColor: { r: number; g: number; b: number } };
    expect(glowCandidate(ring.name, ring.material!.name, 0.2126 * m.emissiveColor.r + 0.7152 * m.emissiveColor.g + 0.0722 * m.emissiveColor.b, false)).toBe(true);
    p.dispose();
  });
  it('setState lights the ring in the state\'s colour, place stands podiums under the bodies and hides an empty seat, tick settles a flash', () => {
    const p = mountQuizPodiums(scene, ['#22d3ee', '#f472b6']);
    p.place([{ x: -2.4, z: 4.4, yaw: 0.5 }, null]);
    expect(scene.getTransformNodeByName('wsi_podium_0')!.position.x).toBe(-2.4);
    expect(scene.getTransformNodeByName('wsi_podium_1')!.isEnabled()).toBe(false);
    p.setState(0, 'right');
    const em = (scene.getMeshByName('wsi_podium_neon_ring_0')!.material as unknown as { emissiveColor: { g: number } }).emissiveColor;
    const peak = em.g;
    expect(peak).toBeGreaterThan(1);                      // 0xd3/255 × 1.5 for the green
    p.tick(PODIUM_FLASH_SEC);
    expect(em.g).toBeLessThan(peak);
    p.setState(5, 'wrong');                                // a seat that does not exist: nothing throws
    p.dispose();
  });
  it('dispose takes every mesh and material', () => {
    const before = scene.meshes.length;
    mountQuizPodiums(scene, ['#fff', '#000']).dispose();
    expect(scene.meshes.length).toBe(before);
  });
});
