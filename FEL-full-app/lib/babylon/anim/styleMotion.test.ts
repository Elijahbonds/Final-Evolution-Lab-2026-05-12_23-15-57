import { describe, expect, it } from 'vitest';
import { Quaternion } from '@babylonjs/core';
import { MOCAP_STYLE_CLIPS } from './authored/mocapStyles';
import { MOCAP_OPPONENT_CLIPS } from './authored/mocapOpponents';
import { styleVariant, STYLE_BORROWS, styleLabel, hasRootTrack, vocabClips } from './styleMotion';
import { sampleRootTrack } from './MoveRootLayer';
import { MOVES } from '../core/HordeDynamics';

const allNames = new Set([...MOCAP_STYLE_CLIPS.map((c) => c.name), ...MOCAP_OPPONENT_CLIPS.map((c) => c.name)]);

describe('style vocabularies', () => {
  it('capoeira and tricking each replace the Hundred finishers with their own captured moves', () => {
    for (const vocab of ['capoeira', 'tricking'] as const) {
      for (const id of ['whirl', 'typhoon', 'hammer', 'uppercut', 'rush'] as const) {
        const played = styleVariant(MOVES[id].clip, vocab, allNames);
        expect(played, `${vocab} ${id}`).not.toBe(MOVES[id].clip);
        expect(played.startsWith(vocab === 'capoeira' ? 'cap_' : 'trick_') || played.startsWith('brk_'), `${vocab} ${id} → ${played}`).toBe(true);
      }
    }
  });

  it('no vocabulary, or a rig that does not own the clip, plays the request unchanged', () => {
    expect(styleVariant('karate_typhoon', null, allNames)).toBe('karate_typhoon');
    expect(styleVariant('karate_typhoon', 'tricking', new Set())).toBe('karate_typhoon');
  });

  it('every borrow points at a real captured clip', () => {
    for (const map of Object.values(STYLE_BORROWS)) for (const to of Object.values(map)) expect(allNames.has(to), to).toBe(true);
    expect(styleVariant('jab', 'capoeira', allNames)).toBe('karate_mc_roundhouse');
  });

  it('every style clip turns the body with a root track and names itself on the banner', () => {
    for (const c of MOCAP_STYLE_CLIPS) {
      expect(hasRootTrack(c.name), c.name).toBe(true);
      expect(styleLabel(c.name)?.length, c.name).toBeGreaterThanOrEqual(2);   // AU is two letters
      expect(c.root!.length, c.name).toBeGreaterThanOrEqual(c.keys.length);
    }
    expect(vocabClips('parkour')).toEqual(expect.arrayContaining(['pk_vault', 'pk_dive_roll', 'pk_backflip', 'pk_duck']));
  });

  it('the flips and cartwheels really go upside down in their root tracks', () => {
    for (const name of ['trick_backflip', 'trick_side_flip', 'cap_au', 'cap_macaco', 'brk_windmill', 'pk_backflip']) {
      const c = MOCAP_STYLE_CLIPS.find((x) => x.name === name)!;
      const tilt = Math.max(...c.root!.map(([, x, , z]) => Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (x * x + z * z)))) * 180 / Math.PI));
      expect(tilt, name).toBeGreaterThan(120);
    }
  });
});

describe('sampleRootTrack', () => {
  it('slerps between keys and holds the ends', () => {
    const q90 = Quaternion.RotationYawPitchRoll(0, Math.PI / 2, 0);
    const track = { name: 't', duration: 1, keys: [[0, 0, 0, 0, 1, 0], [1, q90.x, q90.y, q90.z, q90.w, 0.5]] as [number, number, number, number, number, number][] };
    const mid = sampleRootTrack(track, 0.5);
    const angle = 2 * Math.acos(Math.abs(mid.q.w)) * 180 / Math.PI;
    expect(angle).toBeCloseTo(45, 0);
    expect(mid.h).toBeCloseTo(0.25);
    expect(sampleRootTrack(track, 5).h).toBeCloseTo(0.5);
    expect(sampleRootTrack(track, -1).q.w).toBeCloseTo(1);
  });
});
