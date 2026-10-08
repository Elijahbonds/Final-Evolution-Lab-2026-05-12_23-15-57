import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { G, heightFromFlight } from '@/lib/babylon/core/IRLCore';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { clipWindow, CLIP_POST_MS, CLIP_PRE_MS } from './clips';
import { deviceNumbers, dunkHistoryBody } from './history';
import { heightFromFlight as viaDetect, jumpLines, MIN_FLIGHT_MS, readJumps } from './jumpDetect';
import { buildReel } from './reel';
import { summariseJumps } from './summary';
import { cleanJump, smallHop, standStill, walk } from './synthBody';

describe('flight-time math', () => {
  it('h = g · t² / 8', () => {
    expect(heightFromFlight(0.5)).toBeCloseTo((G * 0.25) / 8, 10);
    expect(viaDetect(0.5)).toBe(heightFromFlight(0.5));
    expect(heightFromFlight(0.6)).toBeGreaterThan(heightFromFlight(0.4));
  });
});

describe('jump detector on synthetic pose streams', () => {
  it('reads one clean jump, with both estimates when a height was typed', () => {
    const frames = cleanJump();
    const [jump] = readJumps(frames, { heightCm: 180 });
    expect(readJumps(frames, { heightCm: 180 })).toHaveLength(1);
    expect(jump.flightMs).toBeGreaterThanOrEqual(MIN_FLIGHT_MS);
    expect(jump.flightMs).toBeLessThanOrEqual(700);
    const expected = Math.round(heightFromFlight(jump.flightMs / 1000) * 100);
    expect(jump.airTimeCm).toBe(expected);
    expect(jump.hipCm).not.toBeNull();
    expect(jump.confidence === 'low' || jump.confidence === 'medium' || jump.confidence === 'high').toBe(true);
    expect(jump.kneeLoadDeg).not.toBeNull();
    expect(jump.kneeLoadDeg!).toBeLessThan(170);
    expect(jump.hipLoadDeg).not.toBeNull();
    expect(jump.takeoffAngleDeg).not.toBeNull();
    expect(jump.steps).toBeGreaterThanOrEqual(1);
    expect(jump.approachMps).not.toBeNull();
    expect(jump.landing === 'steady' || jump.landing === 'shifting' || jump.landing === 'off-balance').toBe(true);
  });

  it('without a typed height, the hip estimate is absent rather than invented', () => {
    const [jump] = readJumps(cleanJump(), {});
    expect(jump.hipCm).toBeNull();
    expect(jump.approachMps).toBeNull();
    expect(jump.approachImagePerSec).not.toBeNull();
    expect(jump.airTimeCm).not.toBeNull();
  });

  it('a small hop is not a jump', () => {
    expect(readJumps(smallHop())).toEqual([]);
  });

  it('a walk is not a jump', () => {
    expect(readJumps(walk())).toEqual([]);
  });

  it('standing still is not a jump', () => {
    expect(readJumps(standStill())).toEqual([]);
  });

  it('the words say estimate, and never measured', () => {
    const [jump] = readJumps(cleanJump(), { heightCm: 188 });
    const text = jumpLines(jump).join('\n');
    expect(text).toMatch(/estimate/i);
    expect(text).not.toMatch(/measured/i);
    expect(text).toMatch(/About \d+ cm/);
    expect(text).not.toMatch(/\d+\.\d{2,} cm/);
  });
});

describe('clip windows', () => {
  it('runs from 1.5 s before takeoff to 1 s after landing', () => {
    expect(CLIP_PRE_MS).toBe(1500);
    expect(CLIP_POST_MS).toBe(1000);
    expect(clipWindow(10_000, 10_500, 20_000)).toEqual({ startMs: 8500, endMs: 11_500 });
  });

  it('clamps to the recording', () => {
    expect(clipWindow(1000, 1400, 3000)).toEqual({ startMs: 0, endMs: 2400 });
    expect(clipWindow(5000, 5400, 6000)).toEqual({ startMs: 3500, endMs: 6000 });
  });

  it('the reel uses those windows and a session summary', () => {
    const frames = cleanJump();
    const jumps = readJumps(frames, { heightCm: 180 });
    const duration = frames[frames.length - 1].t + 500;
    const reel = buildReel(jumps, duration);
    expect(reel.clips).toHaveLength(1);
    expect(reel.clips[0].startMs).toBe(Math.max(0, jumps[0].takeoffMs - 1500));
    expect(reel.clips[0].endMs).toBe(Math.min(duration, jumps[0].landingMs + 1000));
    expect(reel.summary.count).toBe(1);
    expect(reel.summary.bestCm).toBe(jumps[0].airTimeCm);
    expect(reel.summaryLines.join(' ')).toMatch(/Best/);
    expect(reel.summaryLines.join(' ')).toMatch(/estimate/);
  });
});

describe('session summary', () => {
  it('best, average, and a trend across the session', () => {
    const up = summariseJumps([
      { airTimeCm: 30 }, { airTimeCm: 32 }, { airTimeCm: 40 }, { airTimeCm: 44 },
    ]);
    expect(up.bestCm).toBe(44);
    expect(up.averageCm).toBe(37);
    expect(up.trend).toBe('up');
    const flat = summariseJumps([{ airTimeCm: 40 }, { airTimeCm: 41 }]);
    expect(flat.trend).toBe('flat');
    const down = summariseJumps([{ airTimeCm: 50 }, { airTimeCm: 48 }, { airTimeCm: 30 }, { airTimeCm: 28 }]);
    expect(down.trend).toBe('down');
  });
});

describe('history numbers, not video', () => {
  it('the server body is the three fields the dunk route already stores', () => {
    const [jump] = readJumps(cleanJump(), { heightCm: 180 });
    const body = dunkHistoryBody(jump);
    expect(body).toEqual({ verticalCm: jump.airTimeCm, flightTimeMs: jump.flightMs, family: 'ATTEMPT' });
    expect(Object.keys(body!)).toEqual(['verticalCm', 'flightTimeMs', 'family']);
    expect(dunkHistoryBody({ airTimeCm: 400, flightMs: 2000 })).toBeNull();
    expect(dunkHistoryBody({ airTimeCm: null, flightMs: 400 })).toBeNull();
  });

  it('the on-device record is numbers only', () => {
    const frames = cleanJump();
    const reel = buildReel(readJumps(frames, { heightCm: 180 }), frames[frames.length - 1].t);
    const record = deviceNumbers(reel, 180);
    const text = JSON.stringify(record);
    expect(text).not.toMatch(/blob|video|landmark|image\//i);
    expect(record.jumps[0].airTimeCm).toBe(reel.clips[0].jump.airTimeCm);
  });
});

describe('fixtures are synthetic pose numbers', () => {
  it('the dunk-film folder has no video and the streams are PoseFrames of numbers', () => {
    const dir = path.resolve(__dirname);
    const names = fs.readdirSync(dir);
    expect(names.some((n) => /\.(mp4|webm|mov|png|jpg|jpeg)$/i.test(n))).toBe(false);
    const text = fs.readFileSync(path.join(dir, 'synthBody.ts'), 'utf8');
    expect(text).not.toMatch(/child|minor|dobYear|birth/i);
    const frames: PoseFrame[] = cleanJump();
    expect(frames.length).toBeGreaterThan(10);
    expect(frames.every((f) => f.image.length === 33 && f.image.every((p) => typeof p.x === 'number'))).toBe(true);
  });
});
