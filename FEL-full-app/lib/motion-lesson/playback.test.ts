// EDU-05 motion lessons, phase B: what the player decides, with no 3D in it (lib/motion-lesson/playback.ts), and who sees
// the preview (access.ts).
//   · a clip is the stretch asked for, starting at 0, and ENDS ON ITS FIRST POSE after the return — so poseClip reads it
//     as a loop (closesLoop) and the seam is a move, not a cut;
//   · a mirrored clip is the mirror (left and right swap, x flips), and mirroring twice is the recording again;
//   · the cue shows from its moment for CUE_SHOW_S, the latest one winning; nothing before the first;
//   · the framing fits the lesson's highest moment (a jump's top), and never comes closer than the library's stage;
//   · the preview is dark: signed out, or signed in without the admin role or authoring, is "no".
import { describe, expect, it } from 'vitest';
import type { PoseKey } from '@/lib/babylon/anim/poseClip';
import { closesLoop } from '@/lib/babylon/anim/poseClip';
import { CUE_SHOW_S, RETURN_S, askKey, clipKeys, cueAt, framingOf, phraseAt, weakAt, wholeOf } from './playback';
import { canPreviewMotion } from './access';
import { loadSample } from './samples';

const key = (t: number, x: number, hipsY = 0): PoseKey => ({
  t, hipsY, bones: { Hips: [0, 10, 0], Spine: [5, -4, 2] },
  hands: { Left: [-0.3 + x, 1.0, 0.1], Right: [0.4 + x, 1.2, 0.2] }, feet: { Left: [-0.15, 0.07, 0], Right: [0.15, 0.07, 0.05] },
  poles: { Left: [-0.7, -0.2, -0.5], Right: [0.7, -0.2, -0.5] },
});
const KEYS: PoseKey[] = Array.from({ length: 41 }, (_, i) => key(i * 0.05, i * 0.01, i === 20 ? 0.6 : 0));   // 2 s

describe('a clip: the stretch asked for, then the return', () => {
  it('the whole lesson starts at 0, keeps every key, and ends on its first pose RETURN_S after the movement', () => {
    const c = clipKeys(KEYS, { from: 0, to: 2, mirror: false })!;
    expect(c.keys).toHaveLength(KEYS.length + 1);
    expect(c.movement).toBeCloseTo(2, 6);
    expect(c.total).toBeCloseTo(2 + RETURN_S, 6);
    expect(c.keys.at(-1)).toEqual({ ...c.keys[0], t: c.total });
    expect(closesLoop(c.keys, c.total)).toBe(true);   // poseClip smooths it as a loop
    expect(closesLoop(c.keys.slice(0, -1), c.movement)).toBe(false);   // the control: without the return it is not one
  });

  it('a phrase is cut out and rebased to 0', () => {
    const c = clipKeys(KEYS, { from: 0.5, to: 1.2, mirror: false })!;
    expect(c.keys[0].t).toBe(0);
    expect(c.keys[0].hands).toEqual(KEYS[10].hands);
    expect(c.movement).toBeCloseTo(0.7, 3);
    expect(c.keys.at(-2)!.hands).toEqual(KEYS[24].hands);
    expect(c.keys.map((k) => k.t)).toEqual([...c.keys.map((k) => k.t)].sort((a, b) => a - b));
  });

  it('a mirrored clip is the mirror, and mirroring is its own undo', () => {
    const a = clipKeys(KEYS, { from: 0, to: 2, mirror: false })!, m = clipKeys(KEYS, { from: 0, to: 2, mirror: true })!;
    expect(m.keys[5].hands!.Left![0]).toBeCloseTo(-a.keys[5].hands!.Right![0], 6);
    expect(m.keys[5].hands!.Right![0]).toBeCloseTo(-a.keys[5].hands!.Left![0], 6);
    expect(m.keys[5].hands!.Left![1]).toBe(a.keys[5].hands!.Right![1]);
    expect(m.keys[5].bones!.Spine).toEqual([5, 4, -2]);
    expect(m.keys[5].hipsY).toBe(a.keys[5].hipsY);
    const twice = clipKeys(m.keys.slice(0, -1), { from: 0, to: 2, mirror: true })!;
    expect(twice.keys[5].hands!.Left![0]).toBeCloseTo(a.keys[5].hands!.Left![0], 6);
  });

  it('under two keys in the stretch: no clip; different asks have different names', () => {
    expect(clipKeys(KEYS, { from: 0.51, to: 0.54, mirror: false })).toBeNull();
    expect(clipKeys([], wholeOf({ duration: 2 }))).toBeNull();
    const names = new Set([askKey({ from: 0, to: 2, mirror: false }), askKey({ from: 0, to: 2, mirror: true }), askKey({ from: 0.5, to: 2, mirror: false }), askKey({ from: 0, to: 1.99, mirror: false })]);
    expect(names.size).toBe(4);
  });
});

describe('the moment on screen', () => {
  const l = { cues: [{ t: 0.5, text: 'Jump' }, { t: 1.0, text: 'Land' }], phrases: [{ from: 0, to: 1, label: 'A' }, { from: 1, to: 2, label: 'B' }], weak: [[1.5, 1.7]] as [number, number][] };
  it('a cue shows from its moment for CUE_SHOW_S; the latest wins; nothing before the first', () => {
    expect(cueAt(l, 0.2)).toBeNull();
    expect(cueAt(l, 0.5)).toBe('Jump');
    expect(cueAt(l, 0.99)).toBe('Jump');
    expect(cueAt(l, 1.0)).toBe('Land');
    expect(cueAt(l, 1.0 + CUE_SHOW_S + 0.01)).toBeNull();
  });
  it('the phrase and the weak stretch for a moment', () => {
    expect([phraseAt(l, 0), phraseAt(l, 0.99), phraseAt(l, 1), phraseAt(l, 2.5)]).toEqual([0, 0, 1, -1]);
    expect([weakAt(l, 1.4), weakAt(l, 1.6), weakAt(l, 1.8)]).toEqual([false, true, false]);
  });
});

describe('the framing: one for the whole lesson', () => {
  it('a standing lesson is framed as the library frames a body; a jump pulls the camera back and up to fit its top', async () => {
    const stand = framingOf([key(0, 0), key(1, 0)]);
    expect(stand.radius).toBe(2.55);
    expect(stand.targetY).toBeCloseTo(1.05, 2);
    const jump = framingOf(KEYS);   // one key 0.6 m up
    expect(jump.radius).toBeGreaterThan(stand.radius + 0.5);
    expect(jump.targetY).toBeGreaterThan(stand.targetY + 0.25);
    // the real max jump: its top (the head 0.8 m up) is inside the frame, with air over it
    const real = (await loadSample('max-jump'))!;
    const f = framingOf(real.keys);
    const top = Math.max(...real.keys.map((k) => 1.8 + (k.hipsY ?? 0)));
    expect(f.targetY + f.radius * Math.tan(0.4)).toBeGreaterThan(top + 0.2);
    expect(f.radius).toBeLessThan(6.5);   // inside the stage camera's far limit
  });
});

describe('the preview is dark', () => {
  it('the admin role or an author, signed in; nobody else', () => {
    expect(canPreviewMotion({ signedIn: true, admin: true, author: false })).toBe(true);
    expect(canPreviewMotion({ signedIn: true, admin: false, author: true })).toBe(true);
    expect(canPreviewMotion({ signedIn: true, admin: false, author: false })).toBe(false);
    expect(canPreviewMotion({ signedIn: false, admin: true, author: true })).toBe(false);
  });
});
