import { describe, expect, it } from 'vitest';
import { MediaPipePoseAdapter } from './mediapipe-adapter';

// A stand-in landmarker (no WASM in node): it records the timestamps it is given and returns one body.
function withFakeModel(adapter: MediaPipePoseAdapter) {
  const seen: number[] = [];
  const pt = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
  (adapter as any).landmarker = {
    detectForVideo: (_v: unknown, ts: number) => {
      seen.push(ts);
      return { landmarks: [[pt, pt]], worldLandmarks: [[{ x: 0.1, y: -0.2, z: 0.3, visibility: 0.9 }, { x: 0, y: 0, z: 0 }]] };
    },
  };
  return seen;
}
const video = (currentTime: number) => ({ readyState: 4, currentTime }) as unknown as HTMLVideoElement;

describe('MediaPipePoseAdapter', () => {
  it('existing callers: no world on the frame, deduped on video.currentTime', () => {
    const a = new MediaPipePoseAdapter();
    const seen = withFakeModel(a);
    const f1 = a.detect(video(1), 100);
    expect(f1.present).toBe(true);
    expect(f1.world).toBeUndefined();
    expect(a.detect(video(1), 116)).toBe(f1);   // same video time: not re-run
    expect(seen).toEqual([100]);
  });

  it('world: true keeps the world landmarks as x, y, z', () => {
    const a = new MediaPipePoseAdapter({ world: true });
    withFakeModel(a);
    expect(a.detect(video(1), 100).world).toEqual([{ x: 0.1, y: -0.2, z: 0.3 }, { x: 0, y: 0, z: 0 }]);
  });

  it('a frame id dedupes instead of currentTime, and a repeated capture stamp is nudged for the model only', () => {
    const a = new MediaPipePoseAdapter();
    const seen = withFakeModel(a);
    const f1 = a.detect(video(1), 500, { frameId: 7 });
    const f2 = a.detect(video(1), 500, { frameId: 8 });   // new frame, same currentTime and same stamp
    expect(f2).not.toBe(f1);
    expect(a.detect(video(2), 520, { frameId: 8 })).toBe(f2);
    expect(seen).toEqual([500, 501]);
    expect(f2.timestampMs).toBe(500);
  });
});
