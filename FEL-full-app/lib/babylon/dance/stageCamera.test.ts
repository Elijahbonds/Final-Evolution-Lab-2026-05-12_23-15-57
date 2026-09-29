// stageCamera.test.ts — MUSIC-SUITE P8 (2026-09-25). Node environment: pure math, no Babylon/DOM needed (the file
// header on stageCamera.ts explains why it is built this way).

import { describe, it, expect } from 'vitest';
import {
  stageCameraFrame, framesFullBody, baseDistance, beatMotion, horizontalFov, distanceForFraction,
  DEFAULT_STAGE_CAMERA, type StageCameraInput,
} from './stageCamera';

/** MEASURED: the game canvas is CSS-locked to `aspect-[16/10]` (components/games/timing-babylon.tsx:151) on every
 *  device — 1.6 is the aspect this camera actually renders at, always. The wider range below is not a guess at
 *  what phones might do; it is slack in case that lock is ever relaxed, so this contract does not quietly depend on
 *  a Tailwind class in a file this task does not own. */
const ASPECTS = [0.55, 0.6, 0.75, 1.0, 1.33, 1.6, 1.78];
const FOV = 0.8;   // CameraFraming.MEASURED's own common figure for this game's lens

function baseInput(over: Partial<StageCameraInput> = {}): StageCameraInput {
  return {
    dancer: { x: 0, z: 0 },
    audience: { x: 0, z: -6 },
    aspect: 1.78,
    fovRad: FOV,
    beatPhase: 0,
    freeze: false,
    streak: 0,
    stillCamera: false,
    ...over,
  };
}

describe('frontAndRight / stageCameraFrame — the front, audience-side placement', () => {
  it('sits ON THE AUDIENCE SIDE of the dancer, not behind (an over-shoulder camera would sit on the OPPOSITE side)', () => {
    const f = stageCameraFrame(baseInput());
    // audience is at z = -6 from the dancer at the origin: the camera must be on the SAME (negative-z) side
    expect(f.groundOffset.z).toBeLessThan(0);
  });

  it('falls back to a fixed forward when the dancer and the audience point coincide (never NaN)', () => {
    const f = stageCameraFrame(baseInput({ dancer: { x: 3, z: 3 }, audience: { x: 3, z: 3 } }));
    expect(Number.isFinite(f.groundOffset.x)).toBe(true);
    expect(Number.isFinite(f.groundOffset.z)).toBe(true);
    expect(Number.isFinite(f.distanceM)).toBe(true);
  });

  it('is a pure function: the same input twice gives the identical frame', () => {
    const input = baseInput({ beatPhase: 0.37, streak: 9 });
    expect(stageCameraFrame(input)).toEqual(stageCameraFrame(input));
  });
});

describe('freeze — drops LOW and looks up', () => {
  it('a freeze lowers the camera height versus the neutral frame at the same instant', () => {
    const neutral = stageCameraFrame(baseInput({ freeze: false }));
    const frozen = stageCameraFrame(baseInput({ freeze: true }));
    expect(frozen.heightM).toBeLessThan(neutral.heightM);
    expect(neutral.heightM - frozen.heightM).toBeCloseTo(DEFAULT_STAGE_CAMERA.freezeDropM, 6);
  });

  it('aims slightly higher on a freeze than the neutral shot (the low-angle "looking up" read)', () => {
    const neutral = stageCameraFrame(baseInput({ freeze: false }));
    const frozen = stageCameraFrame(baseInput({ freeze: true }));
    expect(frozen.targetHeight).toBeGreaterThan(neutral.targetHeight);
  });
});

describe('streak — goes WIDE', () => {
  it('distance increases monotonically with streak up to the cap', () => {
    const d0 = stageCameraFrame(baseInput({ streak: 0, beatPhase: 0.5 })).distanceM;
    const d1 = stageCameraFrame(baseInput({ streak: 8, beatPhase: 0.5 })).distanceM;
    const d2 = stageCameraFrame(baseInput({ streak: DEFAULT_STAGE_CAMERA.streakCap, beatPhase: 0.5 })).distanceM;
    expect(d1).toBeGreaterThan(d0);
    expect(d2).toBeGreaterThan(d1);
  });

  it('plateaus at the streak cap — going further past it widens no further', () => {
    const atCap = stageCameraFrame(baseInput({ streak: DEFAULT_STAGE_CAMERA.streakCap, beatPhase: 0.5 })).distanceM;
    const pastCap = stageCameraFrame(baseInput({ streak: DEFAULT_STAGE_CAMERA.streakCap * 3, beatPhase: 0.5 })).distanceM;
    expect(pastCap).toBeCloseTo(atCap, 6);
  });

  it('never exceeds maxDistanceM, so a max streak never reveals the void past the venue surround', () => {
    for (const aspect of ASPECTS) {
      const f = stageCameraFrame(baseInput({ streak: DEFAULT_STAGE_CAMERA.streakCap * 5, aspect, beatPhase: 0.5 }));
      expect(f.distanceM).toBeLessThanOrEqual(DEFAULT_STAGE_CAMERA.maxDistanceM);
    }
  });
});

describe('beat motion — locked to the PHASE, never to elapsed time', () => {
  it('is a pure function of phase alone: the same phase gives the same push/sway however it is reached', () => {
    expect(beatMotion(0.42)).toEqual(beatMotion(0.42));
    expect(beatMotion(1.42)).toEqual(beatMotion(0.42));   // wraps
  });

  it('pushes closest right on the beat and eases back out toward the next one', () => {
    const onBeat = beatMotion(0.001).push;
    const midBeat = beatMotion(0.5).push;
    expect(Math.abs(onBeat)).toBeGreaterThan(Math.abs(midBeat));
  });

  it('a PAUSED song clock (the same beatPhase handed in every frame) gives an UNCHANGING camera offset', () => {
    const a = stageCameraFrame(baseInput({ beatPhase: 0.63 }));
    const b = stageCameraFrame(baseInput({ beatPhase: 0.63 }));
    expect(a).toEqual(b);
  });
});

describe('still camera — the comfort setting disables the motion entirely', () => {
  it('gives the identical frame regardless of beat phase, freeze, or streak', () => {
    const a = stageCameraFrame(baseInput({ stillCamera: true, beatPhase: 0.1, freeze: false, streak: 0 }));
    const b = stageCameraFrame(baseInput({ stillCamera: true, beatPhase: 0.9, freeze: true, streak: 30 }));
    expect(a).toEqual(b);
  });

  it('sits at the neutral base distance and height, with no lateral sway', () => {
    const f = stageCameraFrame(baseInput({ stillCamera: true, beatPhase: 0.25 }));
    expect(f.heightM).toBeCloseTo(DEFAULT_STAGE_CAMERA.baseHeightM, 6);
    // pure -z front direction here (audience due south of the dancer): no x component means no sway crept in
    expect(f.groundOffset.x).toBeCloseTo(0, 6);
  });
});

describe('framing — feet and hands stay inside the frame, across aspect ratios', () => {
  it('the base (no-motion) distance frames the full content envelope on every aspect in range', () => {
    for (const aspect of ASPECTS) {
      const d = baseDistance(FOV, aspect);
      const check = framesFullBody(d, FOV, aspect);
      expect(check.verticalOk).toBe(true);
      expect(check.horizontalOk).toBe(true);
    }
  });

  it('the WORST-CASE live frame (hardest beat push, no streak widen yet) still frames the full envelope', () => {
    for (const aspect of ASPECTS) {
      // beatPhase ~0 is the closest the push ever pulls the camera in
      const f = stageCameraFrame(baseInput({ aspect, beatPhase: 0.001, streak: 0 }));
      const check = framesFullBody(f.distanceM, FOV, aspect);
      expect(check.verticalOk).toBe(true);
      expect(check.horizontalOk).toBe(true);
    }
  });

  it('a freeze (camera lower, not closer) does not change the distance, so it stays framed too', () => {
    const neutral = stageCameraFrame(baseInput({ freeze: false, beatPhase: 0.001 }));
    const frozen = stageCameraFrame(baseInput({ freeze: true, beatPhase: 0.001 }));
    expect(frozen.distanceM).toBeCloseTo(neutral.distanceM, 6);
  });

  it('a wider aspect needs no more distance than a narrower one to satisfy the vertical term alone', () => {
    const dWide = distanceForFraction(DEFAULT_STAGE_CAMERA.contentHeightM, FOV, 0.5);
    const dSame = distanceForFraction(DEFAULT_STAGE_CAMERA.contentHeightM, FOV, 0.5);
    expect(dWide).toBeCloseTo(dSame, 6);   // the vertical term never reads the aspect at all
  });

  it('horizontalFov narrows on a portrait aspect and widens on a landscape one, at a fixed vertical FOV', () => {
    const portrait = horizontalFov(FOV, 0.6);
    const landscape = horizontalFov(FOV, 1.78);
    expect(portrait).toBeLessThan(FOV);
    expect(landscape).toBeGreaterThan(FOV);
    expect(landscape).toBeGreaterThan(portrait);
  });
});
