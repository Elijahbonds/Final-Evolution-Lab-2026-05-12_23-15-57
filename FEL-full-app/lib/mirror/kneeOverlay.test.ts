// The knee correction's arrows point OUT, away from the hip midline (MIRROR-COACH P2, 2026-09-26). The knee cue is on
// (cue-engine.ts VALGUS_CUE_VERIFIED), so the overlay paints; P1 fixed its direction but nothing tested it. Frames come
// from the app's own virtual webcam (lib/pose/synth.ts): not mirrored, and mirrored (a selfie stream).
import { describe, expect, it } from 'vitest';
import { KNEE_OVERLAY_LINE, kneeArrows } from './kneeOverlay';
import { readFileSync } from 'node:fs';
import { filmSquat } from '@/lib/babylon/nexus/neuro-mirror/rules/__fixtures__/synthSquat';
import { stripComments } from '@/lib/testing/sourceScan';

const W = 640, H = 480;
const bottomOf = (frames: ReturnType<typeof filmSquat>) => frames[30 + 21 + 6];   // mid-hold at the bottom

describe('kneeArrows', () => {
  for (const [name, mirrored] of [['the Mirror\'s stream (not mirrored)', false], ['a mirrored (selfie) stream', true]] as const) {
    it(`${name}: two arrows, each pointing out from the hip midline, tail outside its knee`, () => {
      for (const shape of [{ shiftL: -0.06, shiftR: -0.06 }, {}, { shiftL: -0.06 }]) {
        const f = bottomOf(filmSquat(shape, undefined, mirrored));
        const L = f.landmarks;
        const midX = ((L[23].x + L[24].x) / 2) * W;
        const arrows = kneeArrows(L, W, H);
        expect(arrows).toHaveLength(2);
        for (const a of arrows) {
          const kx = L[a.knee].x * W;
          const hipSide = Math.sign(L[a.knee === 25 ? 23 : 24].x * W - midX);
          expect(a.dir, `${name} ${JSON.stringify(shape)} knee ${a.knee}`).toBe(hipSide);        // out = this leg's side
          expect(Math.sign(a.tip.x - a.tail.x)).toBe(a.dir);                                       // shaft runs outward
          expect(Math.abs(a.tip.x - midX)).toBeGreaterThan(Math.abs(a.tail.x - midX));           // away from the midline
          expect(Math.sign(a.tail.x - kx)).toBe(a.dir);                                            // starts outside the knee
          for (const b of a.barbs) expect(Math.sign(a.tip.x - b.x)).toBe(a.dir);                   // barbs trail the tip
          expect(a.tail.y).toBeCloseTo(L[a.knee].y * H, 6);
        }
        // the two knees' arrows point opposite ways
        expect(arrows[0].dir).toBe(-arrows[1].dir as 1 | -1);
      }
    });
  }

  it('a knee caving past the midline still gets its arrow pointing back OUT', () => {
    const L = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
    L[23] = { x: 0.55, y: 0.5, visibility: 1 }; L[24] = { x: 0.45, y: 0.5, visibility: 1 };   // hips; midline 0.5
    L[25] = { x: 0.49, y: 0.7, visibility: 1 };                                               // left knee crossed over
    L[26] = { x: 0.44, y: 0.7, visibility: 1 };
    const a = kneeArrows(L, W, H);
    expect(a.find((x) => x.knee === 25)!.dir).toBe(1);        // its hip is on the +x side
    expect(a.find((x) => x.knee === 26)!.dir).toBe(-1);
  });

  it('no hips, no arrows; a knee the model cannot see gets none', () => {
    expect(kneeArrows([], W, H)).toEqual([]);
    const f = bottomOf(filmSquat({ shiftL: -0.06, shiftR: -0.06 }));
    const L = f.landmarks.map((l, i) => (i === 26 ? { ...l, visibility: 0.2 } : l));
    expect(kneeArrows(L, W, H).map((a) => a.knee)).toEqual([25]);
  });

  it('the line under them names the action, never a band, a muscle or a cause', () => {
    expect(KNEE_OVERLAY_LINE).toMatch(/KNEES OUT/);
    expect(KNEE_OVERLAY_LINE).not.toMatch(/band|glute|muscle|weak|injur|pain/i);
  });
});

describe('the harness paints these arrows, only for a cueable knee fault', () => {
  // the code, not the comments (the comments quote the band line this replaced)
  const h = stripComments(readFileSync(new URL('../../app/play/mirror/_components/mirror-harness.tsx', import.meta.url), 'utf8'));
  it('paintSkeleton draws kneeArrows behind VALGUS_CUE_VERIFIED and the cueable faults', () => {
    expect(h).toMatch(/if \(VALGUS_CUE_VERIFIED && faults\.includes\('kneeValgus'\)\) \{\s*const arrows = kneeArrows\(pose\.landmarks, W, H\);/);
    expect(h).toContain('paintSkeleton(pose, p, paintableFaults(was, cueableFaults(squat.faults)))');
    expect(h).not.toMatch(/\bband\b/i);
  });
});
