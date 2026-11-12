// CLIP-SMOOTH (2026-11-03): the single-frame snaps INSIDE a clip, re-keyed. Owner: "Yes, smooth them."
//
// The gameplay-clean audit (docs/GAMEPLAY-CLEAN-AUDIT.md §4c) counts a HARD pop where one bone turns ≥ 1500°/s (25° in a 60 fps
// frame) and ≥ 3.5× its ±6-frame median. Measured on the clips alone (each clip played on the hero, the kit bodies and the scan,
// sampled at 60 fps — clipDesnap.test), twelve clips carry such a snap in their own keys, all captures retargeted to pose keys:
// six karate opponents' (the hit react's right thigh, 52° in a frame; the knockdown, the get-up's right arm, the high kick, the
// roundhouse, the typhoon) and six style captures (the wall flip karate plays, the dive roll, the backflip, the au kick, the
// windmill, the helicopter). Every other "in-clip" pop the audit attributes to a clip is not in the clip's keys (see the lane report).
//
// The fix is local: where one key-to-key step is a snap, the keys either side of it stay where they are and the step is spread
// over the interval before and after it (the bone's path between the same two poses, at constant speed) — the pose before and
// the pose after are kept, and so is the move's timing to within one key either side. Keys at a hold (a contact the clip
// pins) are never moved. Feel knob `anim.clipSmooth` (default ON): 0 builds the clip exactly as before, for comparison.
import { Quaternion } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';

/** Feel knob `anim.clipSmooth` default: 1 = the listed clips' snaps re-keyed, 0 = the clips as captured. */
export const CLIP_SMOOTH_ON = 1;
/** The audit's hard pop (°/s): 25° in one 60 fps frame. */
export const SNAP_DEG_PER_SEC = 1500;
/** …and this many times the bone's own speed around it (the audit's ±6 frames = ±0.1 s). */
export const SNAP_OVER_MEDIAN = 3.5;
const NEIGHBOUR_SEC = 0.1;
const MEDIAN_FLOOR_DEG_PER_SEC = 60;

/** The clips whose own keys snap (measured, clipDesnap.test holds the list to the measurement). */
export const DESNAP_CLIPS: ReadonlySet<string> = new Set([
  // the karate opponents' captures (mocapOpponents.ts)
  'karate_mc_hit_react', 'karate_mc_knockdown', 'karate_mc_get_up', 'karate_mc_high_kick', 'karate_mc_roundhouse', 'karate_mc_typhoon',
  // the style captures (mocapStyles.ts): karate's wall flip (pk_backflip, a thigh snap at 0.57 s the audit saw in play), the
  // dive roll, the backflip, the au kick, the windmill and the helicopter
  'pk_backflip', 'pk_dive_roll', 'trick_backflip', 'cap_au_kick', 'brk_windmill', 'brk_helicopter',
]);

/** Is the re-keying on (feel knob `anim.clipSmooth`, default on)? Read when a clip is built (at spawn). */
export function clipSmoothOn(): boolean {
  return feel('anim.clipSmooth', CLIP_SMOOTH_ON) >= 0.5;
}

export type QuatTrack = [number, Quaternion][];

const angleDeg = (a: Quaternion, b: Quaternion): number => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
const median = (xs: number[]): number => { if (!xs.length) return 0; const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/** The key-to-key speeds of one track (°/s): speeds[i] is the step from key i to key i + 1. */
export function stepSpeeds(track: QuatTrack): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < track.length; i++) {
    const dt = track[i + 1][0] - track[i][0];
    out.push(dt > 1e-6 ? angleDeg(track[i][1], track[i + 1][1]) / dt : 0);
  }
  return out;
}

/** The steps that are snaps: ≥ SNAP_DEG_PER_SEC and ≥ SNAP_OVER_MEDIAN × the median of the bone's steps within ±0.1 s. */
export function snapSteps(track: QuatTrack): number[] {
  const sp = stepSpeeds(track), out: number[] = [];
  for (let i = 0; i < sp.length; i++) {
    if (sp[i] < SNAP_DEG_PER_SEC) continue;
    const mid = (track[i][0] + track[i + 1][0]) / 2, around: number[] = [];
    for (let k = 0; k < sp.length; k++) {
      if (k === i) continue;
      const mk = (track[k][0] + track[k + 1][0]) / 2;
      if (Math.abs(mk - mid) <= NEIGHBOUR_SEC + 1e-9) around.push(sp[k]);
    }
    if (sp[i] >= SNAP_OVER_MEDIAN * Math.max(median(around), MEDIAN_FLOOR_DEG_PER_SEC)) out.push(i);
  }
  return out;
}

/**
 * Re-key one track's snaps in place. A snap step i (key i → i + 1) is spread over keys a = i − r … b = i + 1 + r (r = 1, widened to
 * 2 and 3 if the step still snaps): the keys strictly between a and b move onto the bone's path from key a to key b at constant
 * speed; a and b — and any key at a `protect` time — keep their poses. Returns the number of keys moved.
 */
export function desnapTrack(track: QuatTrack, protect: readonly number[] = []): number {
  const isProtected = (t: number) => protect.some((p) => Math.abs(p - t) < 1e-4);
  let moved = 0;
  for (let pass = 0; pass < 3; pass++) {
    const snaps = snapSteps(track);
    if (!snaps.length) break;
    const r = pass + 1;
    for (const i of snaps) {
      let a = Math.max(0, i - r), b = Math.min(track.length - 1, i + 1 + r);
      // a protected key is an end, never an interior key
      for (let k = i; k > a; k--) if (isProtected(track[k][0])) { a = k; break; }
      for (let k = i + 1; k < b; k++) if (isProtected(track[k][0])) { b = k; break; }
      if (b - a < 2) continue;
      const [ta, qa] = track[a], [tb, qb] = track[b];
      for (let k = a + 1; k < b; k++) {
        const u = (track[k][0] - ta) / (tb - ta);
        track[k] = [track[k][0], Quaternion.Slerp(qa, qb, u)];
        moved++;
      }
    }
  }
  return moved;
}

/** Re-key every track of a clip being built (poseClip's bone → keys map). Returns the keys moved. */
export function desnapTracks(tracks: Record<string, QuatTrack>, protect: readonly number[] = []): number {
  let moved = 0;
  for (const bone of Object.keys(tracks)) moved += desnapTrack(tracks[bone], protect);
  return moved;
}

/**
 * GAMEPLAY-CLEAN-7 (2026-11-11): A FAST STRETCH, NOT A SNAP — re-keyed under a speed cap, for the listed clips and bones only.
 *
 * The hoops made-shot celebration (`bball_score_celebrate` → `dunk_celebrate_big`, which the hero and the rivals play as the capture
 * `dunk_mc_celebrate_big`) turns the upper arms 28–32° a 60 fps frame by itself at 0.43–0.57 s, the elbows swinging out as the fists
 * come up (key steps 41–66° on 30 fps keys). The audit's hard pop is 25° a frame. It is not a one-step snap (its neighbours are fast
 * too), so the desnap rule above leaves it. Here each step over the cap is spread over the keys either side, widened one key at a
 * time until the constant-speed path across the window is under the cap (at most CAP_MAX_SPREAD keys a side); the window's end poses,
 * and any hold, are kept. Feel knob `anim.celebrateEase` (default ON): 0 builds the clip exactly as before. The clip file is untouched.
 */
export const SPEED_CAP_CLIPS: ReadonlyMap<string, readonly string[]> = new Map([
  ['dunk_mc_celebrate_big', ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm']],
]);
/** The cap (°/s): 20° a 60 fps frame, under the audit's 25° hard pop. */
export const SPEED_CAP_DEG_PER_SEC = 1200;
const CAP_MAX_SPREAD = 6;
/** Feel knob `anim.celebrateEase` default: 1 = the listed clips' fast stretches re-keyed under the cap, 0 = as captured. */
export const CELEBRATE_EASE_ON = 1;
export function celebrateEaseOn(): boolean {
  return feel('anim.celebrateEase', CELEBRATE_EASE_ON) >= 0.5;
}

/** Re-key one track so no key step is faster than `capDegPerSec` where a window of ≤ CAP_MAX_SPREAD keys a side allows it. Returns
 *  the keys moved. */
export function capTrackSpeed(track: QuatTrack, capDegPerSec = SPEED_CAP_DEG_PER_SEC, protect: readonly number[] = []): number {
  const isProtected = (t: number) => protect.some((p) => Math.abs(p - t) < 1e-4);
  let moved = 0;
  for (let pass = 0; pass < 24; pass++) {
    const sp = stepSpeeds(track);
    let i = -1;
    for (let k = 0; k < sp.length; k++) if (sp[k] > capDegPerSec + 1e-6 && (i < 0 || sp[k] > sp[i])) i = k;
    if (i < 0) break;
    let done = false;
    for (let r = 1; r <= CAP_MAX_SPREAD && !done; r++) {
      let a = Math.max(0, i - r), b = Math.min(track.length - 1, i + 1 + r);
      for (let k = i; k > a; k--) if (isProtected(track[k][0])) { a = k; break; }
      for (let k = i + 1; k < b; k++) if (isProtected(track[k][0])) { b = k; break; }
      if (b - a < 2) continue;
      const [ta, qa] = track[a], [tb, qb] = track[b];
      if (angleDeg(qa, qb) / (tb - ta) > capDegPerSec && r < CAP_MAX_SPREAD) continue;
      for (let k = a + 1; k < b; k++) { track[k] = [track[k][0], Quaternion.Slerp(qa, qb, (track[k][0] - ta) / (tb - ta))]; moved++; }
      done = true;
    }
    if (!done) break;
  }
  return moved;
}

/** Re-key the listed bones of a clip being built (poseClip's bone → keys map) under the cap. Returns the keys moved. */
export function capTracks(tracks: Record<string, QuatTrack>, bones: readonly string[], protect: readonly number[] = []): number {
  let moved = 0;
  for (const bone of bones) if (tracks[bone]) moved += capTrackSpeed(tracks[bone], SPEED_CAP_DEG_PER_SEC, protect);
  return moved;
}
