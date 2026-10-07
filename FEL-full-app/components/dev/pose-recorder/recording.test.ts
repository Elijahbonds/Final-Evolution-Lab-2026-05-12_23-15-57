import { describe, expect, it } from 'vitest';
import {
  CAPTURE_TAKE_SPECS, TAKES, buildTakesFile, captureDownloadName, captureMetaOf, measureFps, shortUserAgent, takesFileName, toRecordedFrame,
  type RecordedTake,
} from './recording';
import { CAPTURE_TAKES } from '@/lib/pose/captureProtocol';
import { poseTakeProblems } from '@/lib/pose/recordingsGuard';
import { ingestTakesFile } from '@/lib/mirror/fixtures/capture/format';

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

// MIRROR PHASE 3: the Mirror capture set (owner + 2 adults, 2 phones, numbers only, never video, no minors).
describe('the Mirror capture set', () => {
  const take = (id: string, highRate = false): RecordedTake => ({
    id, label: id, prompt: '', recordedAt: '', device: 'x', video: { width: 480, height: 640 }, clock: 'capture',
    detectFps: 30, inferMs: 9, goT: 3000, endT: 6000, ...(highRate ? { highRate: true } : {}),
    frames: [{ t: 0, present: true, image: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, v: 0.9 })) }],
  });
  const choice = { person: 'P2', device: 'iphone', adult: true, consent: true };

  it('walks the protocol\'s takes in order; the jump takes ask for 60 fps', () => {
    expect(CAPTURE_TAKE_SPECS.map((s) => s.id)).toEqual(CAPTURE_TAKES.map((t) => t.id));
    expect(CAPTURE_TAKE_SPECS.filter((s) => s.highRate).map((s) => s.id)).toEqual(CAPTURE_TAKES.filter((t) => t.movement === 'jump').map((t) => t.id));
    for (const s of CAPTURE_TAKE_SPECS) expect(s.label).toMatch(/: /);
  });

  it('will not save without an alias, a phone and both statements', () => {
    expect(captureMetaOf(choice)).toEqual({ protocol: 'mirror-capture-1', person: 'P2', device: 'iphone', adult: true, consent: true });
    expect(captureMetaOf({ ...choice, person: '' })).toBeNull();
    expect(captureMetaOf({ ...choice, person: 'Jordan' })).toBeNull();
    expect(captureMetaOf({ ...choice, device: '' })).toBeNull();
    expect(captureMetaOf({ ...choice, consent: false })).toBeNull();
  });

  it('a minor: without "everyone is 18 or over" ticked, nothing is saved', () => {
    expect(captureMetaOf({ ...choice, adult: false })).toBeNull();
  });

  it('the file is an owner capture of adults, drops the free-text notes, and the ingest takes it', () => {
    const meta = captureMetaOf(choice)!;
    const file = buildTakesFile({ 'jump.good': take('jump.good', true), 'stand.front': take('stand.front') },
      { device: 'Safari 18.0 · iOS', model: 'pose_landmarker_lite/float16/1', notes: 'with Jordan in the kitchen', savedAt: new Date(0), capture: meta });
    expect(file).toMatchObject({ origin: 'owner-capture', child: false, capture: meta, notes: '' });
    expect(file.takes.map((t) => t.id)).toEqual(['stand.front', 'jump.good']);
    expect(file.takes[1].highRate).toBe(true);
    expect(poseTakeProblems(file)).toEqual([]);
    const r = ingestTakesFile(JSON.parse(JSON.stringify(file)), captureDownloadName(meta, new Date(2026, 9, 9, 15, 30)));
    expect(r.problems).toEqual([]);
    expect(JSON.stringify(r.fixture)).not.toMatch(/Jordan|kitchen/);
    expect(captureDownloadName(meta, new Date(2026, 9, 9, 15, 30))).toBe('fel-capture-P2-iphone-2026-10-09-1530.json');
  });

  it('the movement-play set is unchanged: no capture block, the notes kept', () => {
    const file = buildTakesFile({ still: take('still') }, { device: 'x', model: 'm', notes: 'orthodox', savedAt: new Date(0) });
    expect(file).not.toHaveProperty('capture');
    expect(file).not.toHaveProperty('origin');
    expect(file.notes).toBe('orthodox');
  });
});
