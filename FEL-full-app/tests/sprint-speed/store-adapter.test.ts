// The phone-only history and its CSV, the combine adapter, the session's read → record, and that nothing in the sprint
// files can send anything (SPRINT-SPEED, 2026-10-25).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { sourceFiles, stripComments } from '@/lib/testing/sourceScan';
import { clearRuns, keepRun, MAX_RUNS, parseRecord, readRuns, RUNS_KEY, runsCsv, type SprintRecord } from '@/lib/sprint/store';
import { cameraAttempt, cameraSprint, timingChoices, variantMetres, TIMING_TAG } from '@/lib/sprint/cameraSprint';
import { SprintSession, toRecord, type RunConfig } from '@/lib/sprint/session';
import { speedWithBand, timeWithBand } from '@/lib/sprint/copy';
import { makeCamera, project } from '@/lib/pose/synth';
import { film, sprinter } from '../helpers/sprintSynth';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };
const rec = (o: Partial<SprintRecord> = {}): SprintRecord => ({
  v: 1, id: 'r1', at: '2026-10-25T18:00:00.000Z', test: 'gate', label: '40 yd', distanceM: 36.576, timeS: 5.12, sdS: 0.012,
  startKind: 'go', reactionIncluded: true, splits: [], topSpeed: null, topSpeedSd: null, vmax: null, vmaxSd: null, tau: null,
  f0PerKg: null, pmaxPerKg: null, poseHz: 60, method: 'camera', ...o,
});

describe('the history, on this phone only', () => {
  it('keeps, reads newest first, caps, clears; a corrupt store reads as empty', () => {
    const s = mem();
    expect(keepRun(s, rec({ id: 'a' }))).toBe(true);
    expect(keepRun(s, rec({ id: 'b', timeS: 5.01 }))).toBe(true);
    expect(readRuns(s).map((r) => r.id)).toEqual(['b', 'a']);
    for (let i = 0; i < MAX_RUNS + 5; i++) keepRun(s, rec({ id: `x${i}` }));
    expect(readRuns(s)).toHaveLength(MAX_RUNS);
    clearRuns(s);
    expect(readRuns(s)).toEqual([]);
    s.setItem(RUNS_KEY, '{not json');
    expect(readRuns(s)).toEqual([]);
    expect(readRuns(null)).toEqual([]);
    expect(keepRun(null, rec())).toBe(false);
  });

  it('a record with a picture, a pose or an impossible number is not a record', () => {
    expect(parseRecord(rec())).not.toBeNull();
    expect(parseRecord({ ...rec(), timeS: 0.01 })).toBeNull();
    expect(parseRecord({ ...rec(), method: 'hand' })).toBeNull();
    const withExtras = parseRecord({ ...rec(), image: 'data:image/png;base64,xx', landmarks: [[0, 0]] }) as Record<string, unknown>;
    expect(Object.keys(withExtras)).not.toContain('image');
    expect(Object.keys(withExtras)).not.toContain('landmarks');
    expect(parseRecord({ ...rec(), test: 'trace', timeS: null, topSpeed: 9.1 })).not.toBeNull();
  });

  // test changed (merge with #455): lib/csv landed, so the CSV is the shared writer's — \r\n rows, its own cell tests
  it('CSV (lib/csv): a header, one row per run, every row says camera estimate; formulas defused, commas quoted', () => {
    const csv = runsCsv([rec(), rec({ id: 'b', label: '=HYPERLINK("x")', splits: [{ label: '5 m', s: 1.1 }, { label: '10 m', s: 1.82 }] })]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0].startsWith('date,test,what,distance_m,time_s,plus_minus_s')).toBe(true);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('camera estimate; not validated against timing gates');
    expect(lines[1]).toContain(',5.12,0.012,go,yes,');
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[2]).toContain('5 m 1.10; 10 m 1.82');
  });

  it('the ± is shown as 2 SD, never below the hundredth', () => {
    expect(timeWithBand(5.123, 0.012)).toBe('5.12 s ± 0.03');
    expect(timeWithBand(5.123, 0.001)).toBe('5.12 s ± 0.01');
    expect(speedWithBand(9.41, 0.08)).toBe('9.4 m/s ± 0.2');
  });
});

describe('the combine adapter (cameraSprint)', () => {
  it('combine\'s sprint variants in metres; the camera offered for straight sprints and the 5-10-5 only', () => {
    expect(variantMetres('40yd')).toBeCloseTo(36.576, 6);
    expect(variantMetres('20m')).toBe(20);
    expect(variantMetres('pro-agility')).toBeNull();
    expect(timingChoices('sprint', '10yd')).toEqual(['hand', 'camera']);
    expect(timingChoices('agility', 'pro-agility')).toEqual(['hand', 'camera']);
    expect(timingChoices('agility', 'three-cone')).toEqual(['hand']);
    expect(cameraSprint.supports('agility', 'lateral-shuffle')).toBe(false);
    expect(TIMING_TAG).toEqual({ hand: 'hand-timed', camera: 'camera' });
  });

  it('a camera time is recorded to the hundredth (combine\'s rounding) with its method and ±', () => {
    expect(cameraAttempt({ timeS: 4.8765, sdS: 0.011, startKind: 'go', reactionIncluded: true })).toEqual({ seconds: 4.88, meta: { method: 'camera', sdS: 0.011, startKind: 'go', reactionIncluded: true } });
  });
});

describe('a session: frames in, a read, a record kept', () => {
  it('a 40 yd on the Go: over() once the line is crossed; the record is numbers only', () => {
    const cfg: RunConfig = { test: 'gate', label: '40 yd', distanceM: 36.576, start: 'go', point: 'torso', line: { a: { x: 0.5, y: 0.1 }, b: { x: 0.5, y: 0.9 } } };
    const { frames, aspect } = film(sprinter({ vmax: 9.2, tau: 1.1, startX: -36.576 }), 1.8, 3.8, 6.5, 0, { fps: 60, camera: { width: 1280, height: 720, distance: 4 }, noise: 0.002, seed: 3 });
    const s = new SprintSession(cfg, aspect);
    s.arm(-200);
    s.setGo({ kind: 'go', t: 0, sdMs: 5, reactionIncluded: true });
    let overAt = -1;
    for (const f of frames) { s.push(f); if (overAt < 0 && s.over()) overAt = f.t; }
    expect(overAt).toBeGreaterThan(0);
    const r = s.read();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.timeS!).toBeGreaterThan(4.5);
    expect(r.timeS!).toBeLessThan(5.6);
    const k = toRecord(r, cfg, new Date('2026-10-25T18:00:00Z'), 'id1');
    expect(parseRecord(k)).toEqual(k);
    expect(JSON.stringify(k)).not.toMatch(/image|landmark|frame/i);
  });

  it('a trace scaled from two markers reads top speed and the profile, and keeps them', () => {
    const cam = makeCamera({ width: 1280, height: 720, hfovDeg: 66, distance: 25, heightM: 1.1 });
    const pic = (x: number) => { const q = project(cam, [x, 0, 0]); return { x: q.x, y: q.y }; };
    const cfg: RunConfig = { test: 'trace', label: 'Speed trace', start: 'movement', markers: [pic(-14), pic(14)], markerM: 28, startAtOrigin: true, statureM: 1.8, massKg: 80 };
    const { frames, aspect } = film(sprinter({ vmax: 9.2, tau: 1.15, startX: -14 }), 1.8, -0.8, 4.4, 1000, { fps: 60, camera: { width: 1280, height: 720, hfovDeg: 66, distance: 25, heightM: 1.1 }, noise: 0.0015, seed: 9 });
    const s = new SprintSession(cfg, aspect);
    s.arm(0);
    for (const f of frames) s.push(f);
    const r = s.read();
    expect(r.ok, r.ok ? '' : r.why).toBe(true);
    if (!r.ok) return;
    expect(r.trace?.model?.vmax).toBeGreaterThan(8.8);
    expect(r.trace?.profile?.f0N).toBeGreaterThan(400);
    const k = toRecord(r, cfg);
    expect(k.vmax).toBe(r.trace!.model!.vmax);
    // the body mass is never kept, nor anything in newtons or watts that would carry it
    for (const key of Object.keys(k)) expect(key).not.toMatch(/mass|f0N|pmaxW|weight/i);
  });
});

describe('the sprint files send nothing (the picture stays on the phone)', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const NETWORK = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|RTCPeerConnection|\bEventSource\b|\bnew Image\s*\(|\.toDataURL\s*\(|\.toBlob\s*\(|getImageData|drawImage/;
  const files = sourceFiles(ROOT, ['lib/sprint', 'components/sprint', 'app/train/speed'], fs, path).filter((f) => !/\.test\.tsx?$/.test(f));
  it('finds the files', () => { expect(files.length).toBeGreaterThanOrEqual(15); });
  it.each(files)('%s', (rel) => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    expect(src).not.toMatch(NETWORK);
    expect(src).not.toMatch(/\.showIn\(/);
  });
});
