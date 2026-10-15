// No venue's camera may sit on the far side of its own wall. buildNexusScene (NexusWebScene) already console.warns this at
// mount ("[NEXUS] framing: camera for "<id>" sits behind the wall ... it will fill the frame with flat colour"), but only
// when someone is looking at a console: the 2026-10-14 bug sweep saw it fire for who_scene_it and market_browse on every
// quiz question that mounted them. The check is the runtime's own, in plain maths (ArcRotateCamera: position = target +
// radius * (cos a sin b, cos b, sin a sin b)), so it runs over every spec in CI.
import { describe, expect, it } from 'vitest';
import { VENUE_SPECS } from './venueSpecs';

function behindWall(id: string): string[] {
  const spec = VENUE_SPECS[id];
  const { alpha, beta, radius, target } = spec.camera;
  const cam = [
    target[0] + radius * Math.cos(alpha) * Math.sin(beta),
    target[1] + radius * Math.cos(beta),
    target[2] + radius * Math.sin(alpha) * Math.sin(beta),
  ];
  const out: string[] = [];
  for (const p of spec.props) {
    if (p.kind !== 'wall') continue;
    const ry = p.rotationY ?? 0;
    const n = [Math.sin(ry), 0, Math.cos(ry)];
    const dot = (v: number[]) => v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    const dCam = dot([cam[0] - p.position[0], cam[1] - p.position[1], cam[2] - p.position[2]]);
    const dTarget = dot([target[0] - p.position[0], target[1] - p.position[1], target[2] - p.position[2]]);
    if (dCam * dTarget < 0 && Math.abs(dCam) > 0.1) out.push(`${id}: camera at z ${cam[2].toFixed(1)} is behind the wall at [${p.position.join(', ')}]`);
  }
  return out;
}

describe('venue cameras', () => {
  it('there are venue specs to check', () => {
    expect(Object.keys(VENUE_SPECS).length).toBeGreaterThan(20);
  });
  it.each(Object.keys(VENUE_SPECS))('%s: the camera is not behind its own wall', (id) => {
    expect(behindWall(id)).toEqual([]);
  });
});
