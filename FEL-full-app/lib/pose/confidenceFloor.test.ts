// MIRROR PHASE 3: the lite model's confidence floor. Silent on every good fixture the repo has; the line on degraded
// data (dim, far), after a full second, and gone again once the body is seen clearly.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONFIDENCE_FLOOR, CONFIDENCE_FLOOR_LINE, ConfidenceFloor, FLOOR_CLEAR_MARGIN, FLOOR_WINDOW_MS, floorApplies, frameConfidence,
} from './confidenceFloor';
import { toPoseFrames } from '@/lib/mirror/fixtures';
import { quickCapture } from '@/lib/assess/replay';
import type { PoseFrame } from './landmarks';

const ROOT = join(__dirname, '../..');

/** Every good stream the repo has: the Mirror's fixtures, lib/pose's recorded and synthetic streams, the Quick Screen's
 *  synthetic captures clean and with the synth's jitter. */
function goodStreams(): [string, PoseFrame[]][] {
  const out: [string, PoseFrame[]][] = [];
  const mdir = join(ROOT, 'lib/mirror/fixtures');
  for (const n of readdirSync(mdir).filter((f) => f.endsWith('.json'))) {
    const fx = JSON.parse(readFileSync(join(mdir, n), 'utf8'));
    if (fx.format === 'fel-mirror-fixture/1') out.push([`mirror/${n}`, toPoseFrames(fx)]);
  }
  const pdir = join(ROOT, 'lib/pose/__fixtures__');
  for (const n of readdirSync(pdir).filter((f) => f.endsWith('.json'))) {
    const fx = JSON.parse(readFileSync(join(pdir, n), 'utf8'));
    if (Array.isArray(fx.frames)) out.push([`pose/${n}`, fx.frames]);
  }
  for (const noise of [false, true]) {
    const c = quickCapture({ noise, seed: 5 });
    out.push([`qs-T1-front-${noise}`, [...c.T1!.front]], [`qs-T1-side-${noise}`, [...c.T1!.side]], [`qs-T2-${noise}`, [...c.T2!.left!, ...c.T2!.right!.map((f) => ({ ...f, t: f.t + 20000 }))]],
      [`qs-T3-${noise}`, [...c.T3!.left!]], [`qs-T5-${noise}`, [...c.T5!]]);
  }
  return out;
}

const run = (frames: readonly PoseFrame[], f = new ConfidenceFloor()) => frames.map((fr) => f.step(fr, fr.t));
const dimmed = (fs: readonly PoseFrame[], v: number) => fs.map((f) => ({ ...f, image: f.image.map((l) => ({ ...l, v })) }));
/** 30 fps of one standing frame for `ms`, starting at `t0`. */
const hold = (frame: PoseFrame, ms: number, t0 = 0) => Array.from({ length: Math.round(ms / (1000 / 30)) }, (_, i) => ({ ...frame, t: t0 + i * (1000 / 30) }));

describe('the confidence floor is silent on good data', () => {
  const streams = goodStreams();

  it('finds the fixtures it measures (more than 30 streams)', () => {
    expect(streams.length).toBeGreaterThan(30);
  });

  it('never says the line on any good fixture, and every 1 s median sits far above the floor', () => {
    const fired: string[] = [];
    let lowest = 1;
    for (const [name, frames] of streams) {
      const f = new ConfidenceFloor();
      for (const fr of frames) {
        if (f.step(fr, fr.t)) fired.push(name);
        if (f.confidence !== null) lowest = Math.min(lowest, f.confidence);
      }
    }
    expect([...new Set(fired)]).toEqual([]);
    // measured 2026-10-07: 0.928 (jump_two_foot_high, the owner's recorded max jump); the floor is 0.5
    expect(lowest).toBeGreaterThan(CONFIDENCE_FLOOR + 0.3);
  });
});

describe('the confidence floor speaks on degraded data', () => {
  const stand = toPoseFrames(JSON.parse(readFileSync(join(ROOT, 'lib/mirror/fixtures/stand_front.json'), 'utf8')))[0];

  it('dim light: the line after a full second under the floor, not before', () => {
    const frames = hold({ ...stand, image: stand.image.map((l) => ({ ...l, v: 0.3 })) }, 2000);
    const lines = run(frames);
    const first = lines.findIndex((l) => l !== null);
    expect(first).toBeGreaterThan(0);
    expect(frames[first].t).toBeGreaterThanOrEqual(FLOOR_WINDOW_MS * 0.9);
    expect(lines[first]).toBe(CONFIDENCE_FLOOR_LINE);
    expect(lines.slice(first).every((l) => l === CONFIDENCE_FLOOR_LINE)).toBe(true);
  });

  it('a dim squat (the capture\'s light take) fires; the same squat in good light does not', () => {
    const squat = toPoseFrames(JSON.parse(readFileSync(join(ROOT, 'lib/mirror/fixtures/squat_clean.json'), 'utf8')));
    expect(run(dimmed(squat, 0.35)).some((l) => l !== null)).toBe(true);
    expect(run(squat).some((l) => l !== null)).toBe(false);
  });

  it('a few bad frames in a good second do not fire (a median, not a frame)', () => {
    const frames = hold(stand, 3000).map((f, i) => (i % 5 === 0 ? { ...f, image: f.image.map((l) => ({ ...l, v: 0.1 })) } : f));
    expect(run(frames).some((l) => l !== null)).toBe(false);
  });

  it('goes again only once the read is back over the floor plus the margin (no flicker)', () => {
    const low = hold({ ...stand, image: stand.image.map((l) => ({ ...l, v: 0.3 })) }, 1500);
    const justOver = hold({ ...stand, image: stand.image.map((l) => ({ ...l, v: CONFIDENCE_FLOOR + FLOOR_CLEAR_MARGIN / 2 })) }, 1500, 1500);
    const good = hold(stand, 1500, 3000);
    const f = new ConfidenceFloor();
    run(low, f);
    expect(f.low).toBe(true);
    expect(run(justOver, f).every((l) => l === CONFIDENCE_FLOOR_LINE)).toBe(true);
    const back = run(good, f);
    expect(back.at(-1)).toBeNull();
    expect(f.low).toBe(false);
  });

  it('full is the steadier model: the floor is lite only (and the Mirror and the feed run lite)', () => {
    const frames = dimmed(hold(stand, 2000), 0.2);
    expect(run(frames, new ConfidenceFloor({ model: 'full' })).some((l) => l !== null)).toBe(false);
    expect(run(frames, new ConfidenceFloor({ model: 'lite' })).some((l) => l !== null)).toBe(true);
    expect(floorApplies(null)).toBe(true);
    expect(floorApplies(undefined)).toBe(true);
    expect(floorApplies('full')).toBe(false);
  });
});

describe('what is framing\'s job, not the floor\'s', () => {
  const stand = toPoseFrames(JSON.parse(readFileSync(join(ROOT, 'lib/mirror/fixtures/stand_front.json'), 'utf8')))[0];

  it('no body is no read', () => {
    expect(frameConfidence({ present: false, image: [] })).toBeNull();
    expect(run(hold({ t: 0, present: false, image: [] }, 2000)).some((l) => l !== null)).toBe(false);
  });

  it('a joint out of the picture does not count as unseen; too little of the body in the picture is no read', () => {
    // the feet cut off at the bottom: the ankles leave the read, the other three pairs carry it
    const cut = { ...stand, image: stand.image.map((l, i) => (i === 27 || i === 28 ? { ...l, y: 1.2, v: 0.05 } : l)) };
    expect(frameConfidence(cut)).toBeGreaterThan(0.9);
    const half = { ...stand, image: stand.image.map((l, i) => ([25, 26, 27, 28].includes(i) ? { ...l, y: 1.3, v: 0.05 } : l)) };
    expect(frameConfidence(half)).toBeNull();
  });

  it('a side-on body is read on its better side (a hinge or a push-up hides the far side honestly)', () => {
    const side = { ...stand, image: stand.image.map((l, i) => ([12, 24, 26, 28].includes(i) ? { ...l, v: 0.1 } : l)) };
    expect(frameConfidence(side)).toBeGreaterThan(0.9);
  });

  it('reads the MediaPipe adapter\'s frame shape too (what the Mirror harness hands over)', () => {
    const adapter = { present: true, landmarks: stand.image.map((l) => ({ x: l.x, y: l.y, visibility: 0.3 })) };
    const f = new ConfidenceFloor();
    let line: string | null = null;
    for (let t = 0; t <= 1500; t += 33) line = f.step(adapter, t);
    expect(line).toBe(CONFIDENCE_FLOOR_LINE);
  });
});

describe('on the device, for every age (minors included)', () => {
  it('the floor sends nothing, stores nothing and reads no age: one line on the device for everyone', () => {
    const src = readFileSync(join(__dirname, 'confidenceFloor.ts'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(|localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest/);
    expect(src).not.toMatch(/from '@\/lib\/age|youth|canSaveScanNumbers|isMinor/);
    expect(CONFIDENCE_FLOOR_LINE).toMatch(/^Move closer, or add more light/);
  });
});
