// DUNK-FLAGSHIP (b): the lob's catch ring and the ball's shadow — what they show, and that they never linger.
import { describe, expect, it } from 'vitest';
import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { LobMarker, ringRead, shadowRead, LOB_RING_POP_SEC, LOB_SHADOW_NEAR, LOB_SHADOW_FAR } from './LobMarker';

describe('LobMarker', () => {
  it('the ring tightens and brightens as the ball closes on the catch point; the shadow shrinks and darkens as it comes down', () => {
    expect(ringRead(0).scale).toBeLessThan(ringRead(3).scale);
    expect(ringRead(0).alpha).toBeGreaterThan(ringRead(3).alpha);
    expect(shadowRead(0).radius).toBeCloseTo(LOB_SHADOW_NEAR, 6);
    expect(shadowRead(10).radius).toBeCloseTo(LOB_SHADOW_FAR, 6);
    expect(shadowRead(0).alpha).toBeGreaterThan(shadowRead(3).alpha);
  });
  it('shows while a lob is in the air, flashes out on the catch, and is gone after the pop and on a clear', () => {
    const scene = new Scene(new NullEngine());
    const m = new LobMarker(scene);
    const ring = scene.getMeshByName('lob_catch_ring')!, shadow = scene.getMeshByName('lob_ball_shadow')!;
    expect(ring.isVisible || shadow.isVisible).toBe(false);
    m.aim(new Vector3(0, 2.9, -9.6));
    m.update(1 / 60, new Vector3(-3, 2, -8), 0, Math.PI);
    expect(ring.isVisible && shadow.isVisible).toBe(true);
    expect(shadow.position.y).toBeLessThan(0.05);
    m.end(true);
    expect(shadow.isVisible).toBe(false);
    for (let t = 0; t <= LOB_RING_POP_SEC + 0.05; t += 1 / 60) m.update(1 / 60, new Vector3(), 0, 0);
    expect(ring.isVisible).toBe(false);
    m.aim(new Vector3(0, 2.9, -9.6)); m.update(1 / 60, new Vector3(), 0, 0); m.clear();
    expect(ring.isVisible || shadow.isVisible).toBe(false);
    m.dispose(); scene.dispose();
  });
});
