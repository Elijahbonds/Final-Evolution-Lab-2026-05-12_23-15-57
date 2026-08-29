// danceClips — makes DANCE_LIBRARY's eight ids resolve to real motion.
//
// M28's ChoreographyEngine shipped with this comment:
//     "Clip library — ids resolve via DANCE_ALIASES until the authored pack
//      lands."
// The authored pack never landed and DANCE_ALIASES was never written, so every
// id resolved to nothing. That is why Dance has no mode: the engine had
// nothing to play.
//
// These are built the same way M64 built the locomotion set — quaternion keys
// on the LIVE skeleton via buildQuatClip, so a bone-name mismatch is
// impossible and a missing bone warns instead of breaking. Bone names are
// UNPREFIXED (`Hips`, `LeftArm`), per AvatarSkeletonSpec.md.
//
// HONEST STATUS: these are procedural stand-ins, not motion-captured dance.
// They are readable, on-beat and clearly distinct from one another, which is
// what the rhythm game needs to be playable. They are not what ships in a
// finished product — replace them with an authored pack and delete this file.
// The alias fallback below means that swap needs no code change.

import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { buildQuatClip, eulerQ, type QuatKeys } from './restPose';

/** If a procedural clip cannot be built, fall back to motion that definitely
 *  exists. A dancer doing a jumpshot on beat is wrong but legible; a dancer
 *  frozen in bind pose reads as a broken build. */
export const DANCE_ALIASES: Record<string, string> = {
  dance_toprock_basic: 'walk',
  dance_bounce_two_step: 'walk',
  dance_wave_arm: 'jumpshot',
  dance_footwork_six: 'run',
  dance_freeze_baby: 'guard',
  dance_power_windmill: 'roundhouse',
  dance_trans_spin: 'strafe_left',
  dance_bounce_shoulder: 'idle_stand',
};

const D = (deg: number) => deg;

/** beats → seconds at a reference 120 BPM. Clips are authored at this tempo
 *  and the animator's speedRatio rescales them, so one clip serves every BPM. */
const REF_BPM = 120;
const beats = (n: number) => (n * 60) / REF_BPM;

function toprock(): QuatKeys {
  // Weight shifts side to side, opposite arm swings across. 4 beats.
  return {
    Hips: [[0, eulerQ(0, D(-8), D(3))], [beats(1), eulerQ(0, D(8), D(-3))],
           [beats(2), eulerQ(0, D(-8), D(3))], [beats(3), eulerQ(0, D(8), D(-3))],
           [beats(4), eulerQ(0, D(-8), D(3))]],
    LeftArm: [[0, eulerQ(D(-30), 0, D(62))], [beats(1), eulerQ(D(-55), 0, D(48))],
              [beats(2), eulerQ(D(-30), 0, D(62))], [beats(3), eulerQ(D(-55), 0, D(48))],
              [beats(4), eulerQ(D(-30), 0, D(62))]],
    RightArm: [[0, eulerQ(D(-55), 0, D(-48))], [beats(1), eulerQ(D(-30), 0, D(-62))],
               [beats(2), eulerQ(D(-55), 0, D(-48))], [beats(3), eulerQ(D(-30), 0, D(-62))],
               [beats(4), eulerQ(D(-55), 0, D(-48))]],
    Spine: [[0, eulerQ(D(4), D(6), 0)], [beats(2), eulerQ(D(4), D(-6), 0)], [beats(4), eulerQ(D(4), D(6), 0)]],
  };
}

function twoStep(): QuatKeys {
  return {
    Hips: [[0, eulerQ(D(2), 0, 0)], [beats(0.5), eulerQ(D(-3), 0, 0)],
           [beats(1), eulerQ(D(2), 0, 0)], [beats(1.5), eulerQ(D(-3), 0, 0)],
           [beats(2), eulerQ(D(2), 0, 0)], [beats(3), eulerQ(D(-3), 0, 0)],
           [beats(4), eulerQ(D(2), 0, 0)]],
    LeftUpLeg: [[0, eulerQ(D(-14), 0, 0)], [beats(1), eulerQ(D(10), 0, 0)],
                [beats(2), eulerQ(D(-14), 0, 0)], [beats(3), eulerQ(D(10), 0, 0)],
                [beats(4), eulerQ(D(-14), 0, 0)]],
    RightUpLeg: [[0, eulerQ(D(10), 0, 0)], [beats(1), eulerQ(D(-14), 0, 0)],
                 [beats(2), eulerQ(D(10), 0, 0)], [beats(3), eulerQ(D(-14), 0, 0)],
                 [beats(4), eulerQ(D(10), 0, 0)]],
  };
}

function armWave(): QuatKeys {
  // A travelling wave: shoulder leads, forearm follows a beat later. The lag
  // is the whole illusion — key them together and it reads as a shrug.
  return {
    RightArm: [[0, eulerQ(0, 0, D(-55))], [beats(0.5), eulerQ(0, 0, D(-95))],
               [beats(1), eulerQ(0, 0, D(-55))], [beats(2), eulerQ(0, 0, D(-55))]],
    RightForeArm: [[0, eulerQ(0, D(-10), 0)], [beats(0.75), eulerQ(0, D(-55), 0)],
                   [beats(1.25), eulerQ(0, D(-10), 0)], [beats(2), eulerQ(0, D(-10), 0)]],
    LeftArm: [[0, eulerQ(0, 0, D(55))], [beats(1), eulerQ(0, 0, D(95))],
              [beats(1.5), eulerQ(0, 0, D(55))], [beats(2), eulerQ(0, 0, D(55))]],
    Spine: [[0, eulerQ(0, 0, D(-5))], [beats(1), eulerQ(0, 0, D(5))], [beats(2), eulerQ(0, 0, D(-5))]],
  };
}

function sixStep(): QuatKeys {
  const k: QuatKeys = { Hips: [], LeftUpLeg: [], RightUpLeg: [], Spine: [] };
  for (let i = 0; i <= 8; i++) {
    const t = beats(i);
    const phase = (i / 8) * Math.PI * 2;
    k.Hips.push([t, eulerQ(D(38), D(Math.sin(phase) * 40), 0)]);
    k.LeftUpLeg.push([t, eulerQ(D(-40 + Math.sin(phase) * 35), 0, D(18))]);
    k.RightUpLeg.push([t, eulerQ(D(-40 - Math.sin(phase) * 35), 0, D(-18))]);
    k.Spine.push([t, eulerQ(D(-18), D(Math.cos(phase) * 20), 0)]);
  }
  return k;
}

function babyFreeze(): QuatKeys {
  return {
    Hips: [[0, eulerQ(0, 0, 0)], [beats(0.5), eulerQ(D(55), D(20), D(28))], [beats(2), eulerQ(D(55), D(20), D(28))]],
    Spine: [[0, eulerQ(0, 0, 0)], [beats(0.5), eulerQ(D(28), 0, D(16))], [beats(2), eulerQ(D(28), 0, D(16))]],
    LeftArm: [[0, eulerQ(0, 0, D(62))], [beats(0.5), eulerQ(D(-70), 0, D(30))], [beats(2), eulerQ(D(-70), 0, D(30))]],
    RightUpLeg: [[0, eulerQ(0, 0, 0)], [beats(0.5), eulerQ(D(-75), 0, 0)], [beats(2), eulerQ(D(-75), 0, 0)]],
  };
}

function windmill(): QuatKeys {
  const k: QuatKeys = { Hips: [], Spine: [], LeftUpLeg: [], RightUpLeg: [] };
  for (let i = 0; i <= 8; i++) {
    const t = beats(i);
    const a = (i / 8) * Math.PI * 4;                 // two full rotations
    k.Hips.push([t, eulerQ(D(60), D((a * 180) / Math.PI), D(25))]);
    k.Spine.push([t, eulerQ(D(20), 0, D(Math.sin(a) * 22))]);
    k.LeftUpLeg.push([t, eulerQ(D(-60 + Math.sin(a) * 45), 0, D(38))]);
    k.RightUpLeg.push([t, eulerQ(D(-60 - Math.sin(a) * 45), 0, D(-38))]);
  }
  return k;
}

function spin(): QuatKeys {
  return {
    Hips: [[0, eulerQ(0, 0, 0)], [beats(1), eulerQ(0, D(180), 0)], [beats(2), eulerQ(0, D(360), 0)]],
    LeftArm: [[0, eulerQ(0, 0, D(70))], [beats(1), eulerQ(0, 0, D(88))], [beats(2), eulerQ(0, 0, D(70))]],
    RightArm: [[0, eulerQ(0, 0, D(-70))], [beats(1), eulerQ(0, 0, D(-88))], [beats(2), eulerQ(0, 0, D(-70))]],
  };
}

function shoulderBop(): QuatKeys {
  return {
    Spine: [[0, eulerQ(0, 0, D(-7))], [beats(1), eulerQ(0, 0, D(7))],
            [beats(2), eulerQ(0, 0, D(-7))], [beats(3), eulerQ(0, 0, D(7))],
            [beats(4), eulerQ(0, 0, D(-7))]],
    Head: [[0, eulerQ(D(6), D(-8), 0)], [beats(1), eulerQ(D(-4), D(8), 0)],
           [beats(2), eulerQ(D(6), D(-8), 0)], [beats(3), eulerQ(D(-4), D(8), 0)],
           [beats(4), eulerQ(D(6), D(-8), 0)]],
    LeftArm: [[0, eulerQ(D(-18), 0, D(64))], [beats(2), eulerQ(D(-34), 0, D(56))], [beats(4), eulerQ(D(-18), 0, D(64))]],
    RightArm: [[0, eulerQ(D(-34), 0, D(-56))], [beats(2), eulerQ(D(-18), 0, D(-64))], [beats(4), eulerQ(D(-34), 0, D(-56))]],
  };
}

const BUILDERS: Record<string, { keys: () => QuatKeys; beats: number; hipsY?: [number, number][] }> = {
  dance_toprock_basic: { keys: toprock, beats: 4 },
  dance_bounce_two_step: { keys: twoStep, beats: 4, hipsY: [[0, 0], [beats(0.5), -0.06], [beats(1), 0], [beats(1.5), -0.06], [beats(2), 0], [beats(3), -0.06], [beats(4), 0]] },
  dance_wave_arm: { keys: armWave, beats: 2 },
  dance_footwork_six: { keys: sixStep, beats: 8, hipsY: [[0, -0.45], [beats(8), -0.45]] },
  dance_freeze_baby: { keys: babyFreeze, beats: 2, hipsY: [[0, 0], [beats(0.5), -0.55], [beats(2), -0.55]] },
  dance_power_windmill: { keys: windmill, beats: 8, hipsY: [[0, -0.6], [beats(8), -0.6]] },
  dance_trans_spin: { keys: spin, beats: 2 },
  dance_bounce_shoulder: { keys: shoulderBop, beats: 4 },
};

export interface RegisteredDanceClips {
  built: string[];
  aliased: string[];
}

/**
 * Register every dance clip on this skeleton.
 *
 * Anything that fails to build falls back to its alias, so the mode is always
 * playable. Returns both lists so the caller can log honestly rather than
 * assume success.
 */
export function registerDanceClips(
  scene: Scene, skeleton: Skeleton,
  register: (id: string, group: AnimationGroup) => void,
): RegisteredDanceClips {
  const built: string[] = [];
  const aliased: string[] = [];

  for (const [id, def] of Object.entries(BUILDERS)) {
    let group: AnimationGroup | null = null;
    try {
      group = buildQuatClip(scene, skeleton, id, beats(def.beats), def.keys(), def.hipsY);
    } catch (e) {
      console.warn(`[FEL-ANIM] danceClips: "${id}" failed to build (${String(e).slice(0, 120)})`);
    }
    if (group) { register(id, group); built.push(id); }
    else { aliased.push(id); }
  }

  console.info(`[FEL-ANIM] dance clips: ${built.length} built procedurally`
    + (aliased.length ? `, ${aliased.length} falling back to aliases (${aliased.join(', ')})` : ''));
  return { built, aliased };
}

/** Resolve an id for playback, honouring the alias fallback. */
export function resolveDanceClip(id: string, isRegistered: (x: string) => boolean): string {
  if (isRegistered(id)) return id;
  return DANCE_ALIASES[id] ?? 'idle_stand';
}
