import { describe, expect, it } from 'vitest';
import {
  TAKES, buildTakesFile, measureFps, shortUserAgent, takesFileName, toRecordedFrame, type RecordedTake,
} from './recording';

const lm = (x: number) => ({ x, y: 0.5, z: -0.123456, visibility: 0.98765 });

describe('pose recorder file', () => {
  it('keeps 33 image and 33 world points per detected frame, rounded', () => {
    const f = toRecordedFrame({
      present: true,
      landmarks: Array.from({ length: 33 }, (_, i) => lm(i / 100 + 0.000049)),
      world: Array.from({ length: 33 }, () => ({ x: 0.123456, y: -0.9, z: 0.00004 })),
    }, 33.3333);
    expect(f.t).toBe(33.3);
    expect(f.image).toHaveLength(33);
    expect(f.world).toHaveLength(33);
    expect(f.image[1]).toEqual({ x: 0.01, y: 0.5, z: -0.1235, v: 0.988 });
    expect(f.world?.[0]).toEqual({ x: 0.1235, y: -0.9, z: 0 });
  });

  it('a frame with no body carries no points, and a missing world is never invented', () => {
    expect(toRecordedFrame({ present: false, landmarks: [] }, 10)).toEqual({ t: 10, present: false, image: [] });
    expect(toRecordedFrame({ present: true, landmarks: [lm(0.5)] }, 0).world).toBeUndefined();
    expect(toRecordedFrame({ present: false, landmarks: [] }, 10, 71.26).arrive).toBe(71.3);
  });

  it('measures detection fps from the frames themselves', () => {
    expect(measureFps([])).toBe(0);
    expect(measureFps([{ t: 5 }])).toBe(0);
    expect(measureFps(Array.from({ length: 31 }, (_, i) => ({ t: i * 33.333 })))).toBe(30);
  });

  it('names the device without the whole user agent', () => {
    expect(shortUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'))
      .toBe('Chrome 140 · macOS');
    expect(shortUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'))
      .toBe('Safari 18.0 · iOS');
  });

  it('writes the takes in the guided order, with the privacy line, under a dated name', () => {
    const take = (id: string): RecordedTake => ({
      id, label: id, prompt: '', recordedAt: '', device: 'x', video: { width: 1280, height: 720 }, clock: 'capture',
      detectFps: 30, inferMs: 12, goT: 3000, endT: 6000, frames: [],
    });
    const file = buildTakesFile({ 'wheel-turn': take('wheel-turn'), still: take('still') },
      { device: 'x', model: 'm', notes: 'orthodox, dunks right', savedAt: new Date(0) });
    expect(file.takes.map((t) => t.id)).toEqual(['still', 'wheel-turn']);
    expect(file.privacy).toMatch(/nothing was uploaded/);
    expect(file.landmarks).toHaveLength(33);
    expect(takesFileName(new Date(2026, 8, 24, 15, 5))).toBe('fel-pose-takes-2026-09-24-1505.json');
  });

  it('every guided take has a unique id and a prompt', () => {
    expect(new Set(TAKES.map((t) => t.id)).size).toBe(TAKES.length);
    for (const t of TAKES) expect(t.prompt.length).toBeGreaterThan(10);
  });

  it('records the space check at the owner\'s play spot (movement play P4: the gate\'s real-camera row)', () => {
    // scripts/body/space.mts TAKES=<file> finds it by this id: a stand, the reach held 2 s, the arms down, a stand
    const space = TAKES.find((t) => t.id === 'space')!;
    expect(space.prompt).toMatch(/play spot/);
    expect(space.prompt).toMatch(/both arms overhead for 2 seconds/);
    expect(space.seconds).toBeGreaterThanOrEqual(8);
  });
});
