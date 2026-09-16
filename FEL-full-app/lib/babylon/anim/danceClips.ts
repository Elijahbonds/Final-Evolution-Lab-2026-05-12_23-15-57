// danceClips — makes DANCE_LIBRARY's eight ids resolve to real motion.
//
// M28's ChoreographyEngine shipped with this comment:
//     "Clip library — ids resolve via DANCE_ALIASES until the authored pack
//      lands."
// The authored pack never landed and DANCE_ALIASES was never written, so every
// id resolved to nothing. That is why Dance has no mode: the engine had
// nothing to play.
//
// RE-AUTHORED as pose targets (ANIM-READABILITY creative, 2026-09-07), the way
// the rest of the suite is authored since ship pass 3: torso and legs in degrees
// about the parent's bind axes, the HANDS as body-local metres fitted by the
// two-bone solver. The first cut keyed the arms as Euler guesses about the
// bind axes — on this rig the toprock's arms came out reaching forward at
// shoulder height (a zombie, measured: hands 1.41 m up, 0.50 m forward), the
// two-step and the windmill keyed no arms at all (they froze on whatever the
// previous step left), and the freeze / six-step / windmill started standing
// and ENDED on the floor, so their loop wrap snapped the body upright. Every
// clip now starts AND ends in the same standing groove, so a step that
// overruns its beat repeats a standing frame and the next step crossfades from
// a matching pose; the floor moves drop in over their first 3/4 beat and rise
// over their last.
//
// HONEST STATUS: these are procedural stand-ins, not motion-captured dance.
// They are readable, on-beat and clearly distinct from one another, which is
// what the rhythm game needs to be playable. They are not what ships in a
// finished product — replace them with an authored pack and delete this file.
// The alias fallback below means that swap needs no code change.

import type { AnimationGroup, Scene, Skeleton } from '@babylonjs/core';
import { buildPoseClip, type Deg3, type PoseKey } from './poseClip';
import { MOCAP_STYLE_CLIPS } from './authored/mocapStyles';
import { sampleRootTrack, type RootTrack } from './MoveRootLayer';
import type { RootKey } from './mocapRetarget';
type V3 = [number, number, number];

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
  dance_stumble: 'karate_hit_react',   // the net if the pose clip cannot build on a rig: what the mode played before
};

/** beats → seconds at a reference 120 BPM. Clips are authored at this tempo
 *  and the animator's speedRatio rescales them, so one clip serves every BPM. */
const REF_BPM = 120;
const beats = (n: number) => (n * 60) / REF_BPM;

// ── the standing groove every clip starts and ends in ──────────────────────
const HANG = { Left: [-0.26, 0.86, 0.08] as V3, Right: [0.26, 0.86, 0.08] as V3 };
const HANG_POLES = { Left: [-0.4, -0.3, -0.9] as V3, Right: [0.4, -0.3, -0.9] as V3 };
const STAND_BONES: Record<string, Deg3> = { Hips: [0, 0, 0], Spine: [3, 0, 0], Neck: [0, 0, 0], LeftUpLeg: [-6, 0, 4], LeftLeg: [10, 0, 0], RightUpLeg: [-6, 0, -4], RightLeg: [10, 0, 0] };
const STAND: Omit<PoseKey, 't'> = { bones: STAND_BONES, hands: HANG, poles: HANG_POLES, hipsY: 0 };
const key = (t: number, k: Omit<PoseKey, 't'>): PoseKey => ({ t, ...k });

function toprock(): PoseKey[] {
  // Weight shifts side to side, one foot crossing in front on the beat, the opposite arm swinging low across the body;
  // the feet come together on the off-beat with a bounce. 4 beats.
  const cross = (s: 1 | -1): Omit<PoseKey, 't'> => ({
    bones: {
      Hips: [0, 10 * s, 3 * s], Spine: [6, -8 * s, -2 * s], Neck: [0, 6 * s, 0],
      ...(s > 0
        ? { LeftUpLeg: [-28, 0, -6], LeftLeg: [12, 0, 0], RightUpLeg: [8, 0, -4], RightLeg: [8, 0, 0] }
        : { RightUpLeg: [-28, 0, 6], RightLeg: [12, 0, 0], LeftUpLeg: [8, 0, 4], LeftLeg: [8, 0, 0] }),
    },
    hands: s > 0
      ? { Right: [0.06, 0.96, 0.36], Left: [-0.32, 0.90, -0.20] }    // right arm swings across low, left arm back
      : { Left: [-0.06, 0.96, 0.36], Right: [0.32, 0.90, -0.20] },
    poles: HANG_POLES, hipsY: -0.02,
  });
  const together: Omit<PoseKey, 't'> = { bones: { ...STAND_BONES, LeftLeg: [16, 0, 0], RightLeg: [16, 0, 0] }, hands: { Left: [-0.30, 0.86, 0.02], Right: [0.30, 0.86, 0.02] }, poles: HANG_POLES, hipsY: -0.06 };
  return [key(0, cross(1)), key(beats(1), together), key(beats(2), cross(-1)), key(beats(3), together), key(beats(4), cross(1))];
}

function twoStep(): PoseKey[] {
  // A knee bounce on every half beat, the thighs alternating each beat, the arms loose and pumping opposite the legs. 4 beats.
  const out: PoseKey[] = [];
  for (let h = 0; h <= 8; h++) {
    const t = beats(h / 2), down = h % 2 === 1, phase = Math.floor(h / 2) % 2 === 0 ? 1 : -1;
    out.push(key(t, {
      bones: {
        Hips: [down ? 3 : -1, 0, 0], Spine: [down ? 8 : 3, 0, 0], Neck: [down ? 4 : 0, 0, 0],
        LeftUpLeg: [-6 - 10 * phase, 0, 4], LeftLeg: [down ? 30 : 12, 0, 0], RightUpLeg: [-6 + 10 * phase, 0, -4], RightLeg: [down ? 30 : 12, 0, 0],
      },
      hands: { Left: [-0.27, down ? 0.82 : 0.88, 0.08 - 0.10 * phase], Right: [0.27, down ? 0.82 : 0.88, 0.08 + 0.10 * phase] },
      poles: HANG_POLES, hipsY: down ? -0.07 : 0,
    }));
  }
  return out;
}

function armWave(): PoseKey[] {
  // A travelling wave: both arms out at shoulder height, the right hand rises and falls, then the left — the lag is the
  // whole illusion. The torso rolls with it. 2 beats.
  const OUT_POLES = { Left: [-0.3, -0.9, 0] as V3, Right: [0.3, -0.9, 0] as V3 };   // elbows down: a wave, not a shrug
  const wave = (rY: number, lY: number, roll: number): Omit<PoseKey, 't'> => ({
    bones: { ...STAND_BONES, Spine: [2, 0, roll], Neck: [0, 0, -roll * 0.5] },
    hands: { Right: [0.60, rY, 0.06], Left: [-0.60, lY, 0.06] }, poles: OUT_POLES, hipsY: 0,
  });
  return [key(0, wave(1.34, 1.34, 0)), key(beats(0.5), wave(1.62, 1.28, -5)), key(beats(1), wave(1.22, 1.48, 4)), key(beats(1.5), wave(1.34, 1.62, 6)), key(beats(2), wave(1.34, 1.34, 0))];
}

/** The floor: hips as low as the ground lock allows, torso folded forward, hands planted out front. */
const FLOOR_HIPS = -0.52;   // the ground lock allows 0.45 × the bind hips (0.43 m): this is as low as a body gets
const floorPose = (legs: Record<string, Deg3>, spineYaw: number): Omit<PoseKey, 't'> => ({
  bones: { Hips: [0, 0, 0], Spine: [70, spineYaw, 0], Neck: [-24, 0, 0], ...legs },
  hands: { Left: [-0.26, 0.08, 0.42], Right: [0.26, 0.08, 0.42] },   // within a straight arm of the folded shoulders — the palms reach the floor
  poles: { Left: [-0.9, 0.3, 0.2], Right: [0.9, 0.3, 0.2] }, hipsY: FLOOR_HIPS,
});

function sixStep(): PoseKey[] {
  // Drop to the floor over the first 3/4 beat, the legs circle under the body for six beats (one leg sweeping forward as
  // the other tucks), rise over the last 3/4 beat. 8 beats.
  const out: PoseKey[] = [key(0, STAND)];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = beats(0.75 + (6.5 * i) / N), phase = (i / N) * Math.PI * 2, s = Math.sin(phase), c = Math.cos(phase);
    out.push(key(t, floorPose({
      LeftUpLeg: [-45 + 35 * s, 0, 22 + 12 * c], LeftLeg: [70 - 40 * s, 0, 0],
      RightUpLeg: [-45 - 35 * s, 0, -22 + 12 * c], RightLeg: [70 + 40 * s, 0, 0],
    }, 18 * c)));
  }
  out.push(key(beats(8), STAND));
  return out;
}

function babyFreeze(): PoseKey[] {
  // Drop into the freeze over the first half beat: hands planted, the left knee driven up onto the elbow, the right leg
  // folded; hold; rise over the last half beat. 2 beats.
  const freeze = floorPose({ LeftUpLeg: [-100, 0, 22], LeftLeg: [110, 0, 0], RightUpLeg: [-30, 0, -10], RightLeg: [95, 0, 0] }, 12);
  return [key(0, STAND), key(beats(0.5), freeze), key(beats(1.5), { ...freeze, bones: { ...freeze.bones, Neck: [-24, 0, 0] } }), key(beats(2), STAND)];
}

function windmill(): PoseKey[] {
  // Drop onto the back over the first 3/4 beat, the hips turn two full circles with the legs scissoring wide, rise over
  // the last 3/4 beat. The hands stay planted by the hips. 8 beats.
  const out: PoseKey[] = [key(0, STAND)];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = beats(0.75 + (6.5 * i) / N), yaw = (720 * i) / N, s = Math.sin((i / N) * Math.PI * 4);
    out.push(key(t, {
      bones: { Hips: [0, yaw, 0], Spine: [-62, 0, 8 * s], Neck: [34, 0, 0], LeftUpLeg: [-55 + 30 * s, 0, 48], LeftLeg: [12, 0, 0], RightUpLeg: [-55 - 30 * s, 0, -48], RightLeg: [12, 0, 0] },
      hands: { Left: [-0.42, 0.10, -0.12], Right: [0.42, 0.10, -0.12] }, poles: { Left: [-0.9, 0.3, -0.3], Right: [0.9, 0.3, -0.3] }, hipsY: FLOOR_HIPS,
    }));
  }
  out.push(key(beats(8), STAND));
  return out;
}

function spin(): PoseKey[] {
  // A full turn on the spot: arms pulled in to the chest for the spin, flung out at the half, back in to land. 2 beats.
  const at = (yaw: number, out: number): Omit<PoseKey, 't'> => ({
    bones: { ...STAND_BONES, Hips: [0, yaw, 0], LeftLeg: [14, 0, 0], RightLeg: [14, 0, 0] },
    hands: { Left: [-0.12 - 0.45 * out, 1.24 + 0.06 * out, 0.22 - 0.16 * out], Right: [0.12 + 0.45 * out, 1.24 + 0.06 * out, 0.22 - 0.16 * out] },
    poles: { Left: [-0.9, -0.3, -0.3], Right: [0.9, -0.3, -0.3] }, hipsY: -0.02,
  });
  return [key(0, STAND), key(beats(0.35), at(60, 0)), key(beats(1), at(180, 1)), key(beats(1.65), at(300, 0)), key(beats(2), { ...STAND, bones: { ...STAND_BONES, Hips: [0, 360, 0] } })];
}

function shoulderBop(): PoseKey[] {
  // The groove: the torso rolls side to side on the beat, the head nods against it, the shoulder that rises lifts its hand
  // a touch. 4 beats.
  const bop = (s: 1 | -1): Omit<PoseKey, 't'> => ({
    bones: { ...STAND_BONES, Spine: [4, 0, 7 * s], Neck: [6, -8 * s, -4 * s], LeftLeg: [14, 0, 0], RightLeg: [14, 0, 0] },
    hands: { Left: [-0.27, 0.86 + 0.05 * s, 0.10], Right: [0.27, 0.86 - 0.05 * s, 0.10] }, poles: HANG_POLES, hipsY: -0.03,
  });
  return [key(0, bop(1)), key(beats(1), bop(-1)), key(beats(2), bop(1)), key(beats(3), bop(-1)), key(beats(4), bop(1))];
}

/**
 * THE MISS (SCORECARD VISUALS, 2026-09-15). A missed step used to play `karate_hit_react` over the running step: a
 * fighter's flinch blended into a dance loop, which is what the frame review called "the MISS stumble crosses the
 * limbs" — and it is also the wrong move, a hit taken in a game where nobody is hitting you. A dancer who misses
 * OVERBALANCES: the weight falls past the leading foot, the trailing leg swings out to catch it, both arms fly wide,
 * and the body comes back up onto the groove. One beat, standing at both ends like every step in this pack.
 */
function stumble(): PoseKey[] {
  const fall: Omit<PoseKey, 't'> = {
    bones: {
      Hips: [6, -14, 8], Spine: [16, 10, -10], Neck: [-6, 8, 4],
      LeftUpLeg: [-34, 0, 16], LeftLeg: [46, 0, 0],      // the leading leg takes it all
      RightUpLeg: [10, 0, -26], RightLeg: [30, 0, 0],    // the trailing leg swings out wide to catch the weight
    },
    hands: { Left: [-0.56, 1.14, 0.18], Right: [0.54, 1.06, -0.14] },   // arms out, not crossed: the catch is wide
    poles: { Left: [-0.9, -0.2, -0.3] as V3, Right: [0.9, -0.2, -0.3] as V3 }, hipsY: -0.14,
  };
  const catchIt: Omit<PoseKey, 't'> = {
    bones: {
      Hips: [2, -6, 3], Spine: [10, 4, -4], Neck: [-2, 3, 0],
      LeftUpLeg: [-18, 0, 8], LeftLeg: [28, 0, 0], RightUpLeg: [-2, 0, -14], RightLeg: [22, 0, 0],
    },
    hands: { Left: [-0.40, 1.00, 0.16], Right: [0.38, 0.96, 0.02] }, poles: HANG_POLES, hipsY: -0.07,
  };
  // thirds of the beat, not 0.3/0.7: a pose clip's keys are laid on 30 fps frames, and a key at 4.5 frames is a key
  // nobody ever sees in full — the catch read half as wide as it is authored because every sample blended it with the
  // standing pose on either side.
  return [key(0, STAND), key(beats(1 / 3), fall), key(beats(2 / 3), catchIt), key(beats(1), STAND)];
}

const BUILDERS: Record<string, { keys: () => PoseKey[]; beats: number }> = {
  dance_stumble: { keys: stumble, beats: 1 },
  dance_toprock_basic: { keys: toprock, beats: 4 },
  dance_bounce_two_step: { keys: twoStep, beats: 4 },
  dance_wave_arm: { keys: armWave, beats: 2 },
  dance_footwork_six: { keys: sixStep, beats: 8 },
  dance_freeze_baby: { keys: babyFreeze, beats: 2 },
  dance_power_windmill: { keys: windmill, beats: 8 },
  dance_trans_spin: { keys: spin, beats: 2 },
  dance_bounce_shoulder: { keys: shoulderBop, beats: 4 },
};

/**
 * CAPTURED STEPS (RECOGNISABLE, 2026-09-15). The power move and the six-step are floor work no pose-key set reads as:
 * the procedural windmill was a crouch that turned its hips. The breaker vocabulary built for the capoeira style
 * (authored/mocapStyles: CMU 90_34 windmill, 85_04 fancy footwork) plays them instead — the body keys ride inside the
 * pelvis frame and the ROOT TRACK turns the whole body over (MoveRootLayer, which DanceMode mounts with
 * `danceRootTracks`). A step whose capture cannot build still falls back to its procedural keys.
 */
export const DANCE_CAPTURES: Readonly<Record<string, string>> = {
  dance_power_windmill: 'brk_windmill',
  dance_footwork_six: 'brk_footwork',
};

/**
 * The closed CYCLE inside a capture: the sub-window [i, j] (at least `minSec` long) whose end pose best matches its start —
 * hands, feet, pelvis orientation and height — so the step can repeat with no snap at the seam. Pure.
 */
export function closedCycle(keys: readonly PoseKey[], root: readonly RootKey[], minSec = 0.5): { from: number; to: number; err: number } {
  const track: RootTrack = { name: '', duration: 0, keys: root as RootKey[] };
  const pt = (k: PoseKey): number[] => ['Left', 'Right'].flatMap((sd) => [...((k.hands as Record<string, V3> | undefined)?.[sd] ?? [0, 0, 0]), ...((k.feet as Record<string, V3> | undefined)?.[sd] ?? [0, 0, 0])]);
  const rs = keys.map((k) => sampleRootTrack(track, k.t));
  let best = { from: 0, to: keys.length - 1, err: Infinity };
  for (let i = 0; i < keys.length; i++) {
    const a = pt(keys[i]);
    for (let j = i + 1; j < keys.length; j++) {
      if (keys[j].t - keys[i].t < minSec) continue;
      const b = pt(keys[j]);
      let e = 0; for (let n = 0; n < a.length; n++) e += Math.abs(a[n] - b[n]);
      const dot = Math.min(1, Math.abs(rs[i].q.x * rs[j].q.x + rs[i].q.y * rs[j].q.y + rs[i].q.z * rs[j].q.z + rs[i].q.w * rs[j].q.w));
      e += 2 * Math.acos(dot) + Math.abs(rs[i].h - rs[j].h) * 2;
      if (e < best.err) best = { from: i, to: j, err: e };
    }
  }
  return best;
}

/**
 * A captured step as the dance contract wants it: STANDING at 0, the capture's closed cycle dropped in over ¾ beat and
 * repeated to fill the step (evenly re-timed, never more than a few percent), and back up to STANDING over the last
 * beat — so a step that overruns its slot wraps on the standing groove like every procedural step. Body keys and the
 * root track come out on one timeline. Pure.
 */
export function composeCapturedStep(id: string): { keys: PoseKey[]; root: RootKey[]; duration: number } | null {
  const def = BUILDERS[id];
  const cap = MOCAP_STYLE_CLIPS.find((x) => x.name === DANCE_CAPTURES[id]);
  if (!def || !cap?.root?.length) return null;
  const T = beats(def.beats), tIn = beats(0.75), tOut = T - beats(1);
  const cyc = closedCycle(cap.keys, cap.root);
  const src = cap.keys.slice(cyc.from, cyc.to + 1);
  const t0 = src[0].t, len = src[src.length - 1].t - t0;
  // the generated captures are time-compressed against their source (`source: 'cmu:90_34.bvh 2.35–4.45s'` in 1.1 s): repeat
  // the cycle as often as fits the step at the CAPTURE'S REAL SPEED, so a windmill turns at a breaker's pace, not double time
  const span = /([\d.]+)[–-]([\d.]+)s/.exec(cap.source);
  const real = span ? (Number(span[2]) - Number(span[1])) / cap.duration : 1;
  const reps = Math.max(1, Math.round((tOut - tIn) / (len * real)));
  const scale = (tOut - tIn) / (reps * len);
  const track: RootTrack = { name: id, duration: cap.duration, keys: cap.root };
  const keys: PoseKey[] = [key(0, STAND)];
  const root: RootKey[] = [[0, 0, 0, 0, 1, 0]];
  for (let r = 0; r < reps; r++) {
    src.forEach((k, n) => {
      if (r > 0 && n === 0) return;                                   // the seam key is the previous cycle's last
      const last = n === src.length - 1;
      const base = last ? src[0] : k;                                // the cycle closes EXACTLY on its first pose
      const t = tIn + (r * len + (k.t - t0)) * scale;
      keys.push({ ...base, t });
      const q = sampleRootTrack(track, base.t);
      root.push([t, q.q.x, q.q.y, q.q.z, q.q.w, q.h]);
    });
  }
  keys.push(key(T, STAND));
  root.push([T, 0, 0, 0, 1, 0]);
  return { keys, root, duration: T };
}

/** The root tracks for the captured steps registered on a rig, the mirrored `.M` step included (a sagittal reflection
 *  of the pelvis orientation: x, −y, −z, w — the same reflection registerMirroredClips applies to the bones). */
export function danceRootTracks(registeredIds: Iterable<string>): RootTrack[] {
  const out: RootTrack[] = [];
  for (const id of registeredIds) {
    const c = composeCapturedStep(id);
    if (!c) continue;
    out.push({ name: id, duration: c.duration, keys: c.root });
    out.push({ name: `${id}.M`, duration: c.duration, keys: c.root.map(([t, x, y, z, w, h]) => [t, x, -y, -z, w, h] as RootKey) });
  }
  return out;
}

/** The ids this file builds (the mode registers exactly these). */
export const DANCE_CLIP_IDS = Object.keys(BUILDERS);

/** Build one dance clip on a live skeleton (the rig tests use this). */
export function buildDanceClip(scene: Scene, skeleton: Skeleton, id: string): AnimationGroup | null {
  const def = BUILDERS[id];
  if (!def) return null;
  if (DANCE_CAPTURES[id]) {
    try {
      const c = composeCapturedStep(id);
      const g = c ? buildPoseClip(scene, skeleton, id, c.duration, c.keys) : null;
      if (g) return g;
    } catch (e) {
      console.warn(`[FEL-ANIM] danceClips: capture for "${id}" failed (${String(e).slice(0, 120)}) — procedural keys instead`);
    }
  }
  return buildPoseClip(scene, skeleton, id, beats(def.beats), def.keys());
}

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

  for (const id of DANCE_CLIP_IDS) {
    let group: AnimationGroup | null = null;
    try {
      group = buildDanceClip(scene, skeleton, id);
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
