// lane/online-play: the Online play knobs are registered with their shipped defaults (knobs.ts rows pin these constants).
import { describe, it, expect } from 'vitest';
import { FEEL_KNOB_BY_ID } from '../feel-panel/knobs';
import { NET_MIRROR_ON, NET_RENDER_DELAY_MS, NET_POSE_HZ, NET_POSSESSION_SWAP, netMirrorOn, netPossessionSwap } from './knobs';
import { NET_KARATE_TOGETHER, startableModes } from '../party/social/startable';

describe('Online play knobs', () => {
  it('registered at their shipped defaults', () => {
    const def = (id: string) => FEEL_KNOB_BY_ID.get(id)?.def;
    expect(def('net.mirrorOn')).toBe(NET_MIRROR_ON);
    expect(def('net.renderDelayMs')).toBe(NET_RENDER_DELAY_MS);
    expect(def('net.poseHz')).toBe(NET_POSE_HZ);
    expect(def('net.possessionSwap')).toBe(NET_POSSESSION_SWAP);
    expect(def('net.karateTogether')).toBe(NET_KARATE_TOGETHER);
  });
  it('as shipped: one shared game, the ball carrier runs 1v1, Karate co-op not offered', () => {
    expect(netMirrorOn()).toBe(true);
    expect(netPossessionSwap()).toBe(true);
    expect(startableModes().map((m) => m.id)).toEqual(['onevone', 'threevthree']);
  });
});
