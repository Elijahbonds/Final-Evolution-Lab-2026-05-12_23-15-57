// crowdVat — the frame arithmetic of a baked vertex-animation crowd (w3-crowds, A9.9).
//
// A crowd body's clips are baked once into a texture (one row of bone matrices per frame) and every fan is a thin
// instance that carries four numbers — start frame, end frame, offset, speed — which the shader turns into the frame it
// draws (Babylon's `bakedVertexAnimation` include). Nothing on the CPU moves a bone per frame. That makes the shader's
// arithmetic the clock every reaction has to agree with, so it is replicated here exactly and tested:
//
//   total = end − start + 1;  time = T · speed / total;  corr = time < 1 ? 0 : 1;  n = total − corr
//   frame = floor(mod(fract(time) · n + offset, n)) + start + corr
//
// Two quirks follow, and the layout below is built around them rather than fighting them:
//   · once time ≥ 1 (always, here: the crowd's clock starts at CLOCK_T0) the first frame of a range is never drawn, so every
//     baked range opens with a PAD row (a copy of its first pose) and its content is the K rows after it;
//   · the playhead runs at speed · K / (K + 1) frames a second, so a clip authored at FPS is played at speed FPS·(K+1)/K.
// A one-shot reaction is started by choosing the offset that puts the playhead on content row 0 at the moment it starts
// (`startOffset`); the CPU then switches the fan to its next clip after the clip's own length (`clipSeconds`).
//
// PURE: no Babylon import. The bake and the instances live in BakedCrowd.ts.

/** The rate the crowd clips are authored and baked at (frames a second). */
export const CROWD_FPS = 30;
/** The crowd's VAT clock starts here (s), so `time ≥ 1` for every range from the first frame (see the header). */
export const CLOCK_T0 = 1000;

export type Posture = 'seated' | 'standing';

/** One baked clip: a name, its length, whether it loops, and the posture it starts and ends in. */
export interface CrowdClipSpec {
  name: CrowdClipName;
  seconds: number;
  loop: boolean;
  /** The posture the clip starts in and (for every clip but rise / sit_down) ends in. */
  from: Posture;
  to: Posture;
}

export type CrowdClipName =
  | 'sit_idle' | 'sit_clap' | 'sit_cheer' | 'sit_groan' | 'rise'
  | 'stand_idle' | 'stand_clap' | 'stand_cheer' | 'stand_groan' | 'sit_down';

/** The crowd's whole vocabulary. Order is the texture's row order. */
export const CROWD_CLIPS: readonly CrowdClipSpec[] = [
  { name: 'sit_idle', seconds: 3.0, loop: true, from: 'seated', to: 'seated' },
  { name: 'sit_clap', seconds: 1.2, loop: true, from: 'seated', to: 'seated' },
  { name: 'sit_cheer', seconds: 1.6, loop: false, from: 'seated', to: 'seated' },
  { name: 'sit_groan', seconds: 1.8, loop: false, from: 'seated', to: 'seated' },
  { name: 'rise', seconds: 0.6, loop: false, from: 'seated', to: 'standing' },
  { name: 'stand_idle', seconds: 3.0, loop: true, from: 'standing', to: 'standing' },
  { name: 'stand_clap', seconds: 1.2, loop: true, from: 'standing', to: 'standing' },
  { name: 'stand_cheer', seconds: 1.2, loop: true, from: 'standing', to: 'standing' },
  { name: 'stand_groan', seconds: 1.6, loop: false, from: 'standing', to: 'standing' },
  { name: 'sit_down', seconds: 0.6, loop: false, from: 'standing', to: 'seated' },
];

/** Where one clip lives in the baked texture. `start` is the PAD row; content rows are start+1 … end (K = end − start). */
export interface ClipRange { name: CrowdClipName; start: number; end: number; frames: number; speed: number; seconds: number; loop: boolean }

/** Content frames for a clip of `seconds` at CROWD_FPS (at least 2). */
export function clipFrames(seconds: number): number {
  return Math.max(2, Math.round(seconds * CROWD_FPS));
}

/** Lay the clips out one after another, each behind its pad row. Pure; the texture has `rows` rows. */
export function layoutClips(clips: readonly CrowdClipSpec[] = CROWD_CLIPS): { ranges: Record<CrowdClipName, ClipRange>; rows: number } {
  const ranges = {} as Record<CrowdClipName, ClipRange>;
  let row = 0;
  for (const c of clips) {
    const k = clipFrames(c.seconds);
    const start = row, end = row + k;
    ranges[c.name] = { name: c.name, start, end, frames: k, speed: (CROWD_FPS * (k + 1)) / k, seconds: k / CROWD_FPS, loop: c.loop };
    row = end + 1;
  }
  return { ranges, rows: row };
}

const fract = (x: number): number => x - Math.floor(x);
/** GLSL's mod (always toward −∞), not JS's %. */
const glslMod = (x: number, y: number): number => x - y * Math.floor(x / y);

/** The row the shader draws at clock `t` for one instance's settings — Babylon's include, line for line. */
export function vatFrame(t: number, start: number, end: number, offset: number, speed: number): number {
  const total = end - start + 1;
  const time = (t * speed) / total;
  const corr = time < 1 ? 0 : 1;
  const n = total - corr;
  let f = fract(time) * n;
  f = glslMod(f + offset, n);
  return Math.floor(f) + start + corr;
}

/** Content index (0 … K−1) the shader draws for a range at clock `t` with `offset`. */
export function contentIndex(t: number, r: Pick<ClipRange, 'start' | 'end' | 'speed'>, offset: number): number {
  return vatFrame(t, r.start, r.end, offset, r.speed) - r.start - 1;
}

/** A small push past the row boundary so the GPU's float32 clock and this double-precision one agree on the row. */
export const OFFSET_EPS = 0.05;

/** The offset that puts `r`'s playhead on its first content row at clock `t` (a one-shot starting now). */
export function startOffset(t: number, r: Pick<ClipRange, 'start' | 'end' | 'speed'>): number {
  const total = r.end - r.start + 1;
  const n = total - 1;
  const ft = Math.fround(t);   // the uniform the GPU is handed is a float32
  const at = fract((ft * r.speed) / total) * n;
  return glslMod(n - at + OFFSET_EPS, n);
}

/** A looping clip's offset for a fan whose own phase (0..1) desynchronises it from its neighbours. */
export function loopOffset(r: Pick<ClipRange, 'frames'>, phase01: number): number {
  return glslMod(phase01, 1) * r.frames;
}

/** A frozen pose: a range of one row (start = end) draws that row whatever the clock (the impostor snapshot uses it). */
export function holdSettings(row: number): [number, number, number, number] {
  return [row, row, 0, 0];
}
