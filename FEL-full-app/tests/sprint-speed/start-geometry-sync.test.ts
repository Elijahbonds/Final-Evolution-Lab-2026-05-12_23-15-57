// The start (the Go, first movement), the line calibration maths, and the two-phone clock (SPRINT-SPEED, 2026-10-25).
import { describe, expect, it } from 'vitest';
import { alongM, bodyPoint, CENTRE_LINE, heightScale, lineFromTaps, lineTiltDeg, markerScale, signedDistance } from '@/lib/sprint/geometry';
import { detectOnset, goPlan, goStart } from '@/lib/sprint/start';
import { answerPings, estimateOffset, measureOffset, offsetOf, remoteStart, type SyncLink, type SyncMessage } from '@/lib/sprint/sync';
import { SOUND_MPS, SPRINT, SPRINT_IDS } from '@/lib/sprint/PROPOSED-sprint';
import { bisect, film, gauss, sprinter } from '../helpers/sprintSynth';
import { mulberry32 } from '@/lib/pose/synth';

describe('the line, tapped', () => {
  it('two taps make a line; too close or outside the picture is refused with a reason', () => {
    expect(lineFromTaps({ x: 0.5, y: 0.2 }, { x: 0.52, y: 0.9 }, 16 / 9).ok).toBe(true);
    const near = lineFromTaps({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.55 }, 16 / 9);
    expect(near.ok).toBe(false);
    expect(lineFromTaps({ x: 1.2, y: 0.5 }, { x: 0.5, y: 0.5 }, 1).ok).toBe(false);
  });

  it('signed distance is in picture heights, + on one side, − on the other, whatever the aspect', () => {
    const line = { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } };
    // landscape 16:9: 0.1 of the width is 0.1 × 16/9 picture heights
    expect(signedDistance(line, { x: 0.6, y: 0.4 }, 16 / 9)).toBeCloseTo(-0.1 * 16 / 9, 9);
    expect(signedDistance(line, { x: 0.4, y: 0.4 }, 16 / 9)).toBeCloseTo(0.1 * 16 / 9, 9);
    // a slanted line: the distance is perpendicular to it
    const slant = { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } };
    expect(Math.abs(signedDistance(slant, { x: 1, y: 0 }, 1))).toBeCloseTo(Math.SQRT1_2, 9);
    expect(lineTiltDeg(CENTRE_LINE, 1)).toBe(0);
    expect(lineTiltDeg(slant, 1)).toBeCloseTo(45, 6);
  });

  it('two markers a known distance apart: metres along the run, projected onto the marker axis', () => {
    const r = markerScale({ x: 0.1, y: 0.8 }, { x: 0.9, y: 0.8 }, 10, 16 / 9);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(alongM(r.scale, { x: 0.1, y: 0.8 })).toBeCloseTo(0, 9);
    expect(alongM(r.scale, { x: 0.9, y: 0.8 })).toBeCloseTo(10, 9);
    expect(alongM(r.scale, { x: 0.5, y: 0.3 })).toBeCloseTo(5, 9);     // off the axis: only the along-run part counts
    expect(alongM(r.scale, { x: 0, y: 0.8 })).toBeCloseTo(-1.25, 9);
    expect(markerScale({ x: 0.1, y: 0.8 }, { x: 0.9, y: 0.8 }, 0, 1).ok).toBe(false);
  });

  it('the athlete\'s height scales the picture from their rigid leg (thigh + shank) within 3 % (jitter reads a leg long: −0.8 % clean, −2.5 % at σ 0.0015)', () => {
    const H = 1.8;
    const { frames, aspect } = film(sprinter({ vmax: 9, tau: 1.1, startX: -6, H }), H, 0.5, 1.6, 0, { fps: 60, camera: { distance: 12, hfovDeg: 60 }, noise: 0.0015, seed: 5 });
    const hs = heightScale(frames, H, aspect);
    expect(hs.ok).toBe(true);
    if (!hs.ok) return;
    // truth: the camera's metres per picture height at the runner's depth (12 m, 60° horizontal, 16:9)
    const vfov = 2 * Math.atan(Math.tan(Math.PI / 6) / aspect);
    const truth = 2 * 12 * Math.tan(vfov / 2);
    expect(Math.abs(hs.mPerUnit / truth - 1)).toBeLessThan(0.03);
    expect(heightScale(frames, 0.5, aspect).ok).toBe(false);
  });
});

describe('the start', () => {
  it('the Go: marks, set, then a random hold inside the register\'s range', () => {
    const lo = SPRINT['sprint.goHoldMinS'].value, hi = SPRINT['sprint.goHoldMaxS'].value;
    for (const r of [0, 0.5, 0.999]) {
      const p = goPlan(() => r);
      expect(p.setS).toBe(2.5);
      expect(p.goS - p.setS).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(p.goS - p.setS).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it('the Go\'s start: the beep plus its output delay plus the sound\'s travel to the athlete, reaction included', () => {
    const g = goStart({ goAt: 1000, outputLatencyMs: 20, distanceM: 36.576 });
    expect(g.t).toBeCloseTo(1000 + 20 + (36.576 / SOUND_MPS) * 1000, 6);   // 40 yd: +106.6 ms
    expect(g.reactionIncluded).toBe(true);
    const unknown = goStart({ goAt: 1000, outputLatencyMs: null, distanceM: 0 });
    expect(unknown.t).toBe(1000);
    expect(unknown.sdMs).toBe(SPRINT['sprint.audioLatencySdMs'].value);
  });

  it.each([30, 60, 240])('first movement at %i fps: the start from rest, within a frame and inside its own ±', (fps) => {
    const frame = 1000 / fps;
    const errs: number[] = [];
    let inside = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const { frames, aspect } = film(sprinter({ vmax: 8.5, tau: 1.2, startX: -2 }), 1.8, -1.2, 1.2, 5000, { fps, camera: { distance: 7, hfovDeg: 66 }, noise: 0.002, seed });
      const pts = frames.map((f) => ({ t: f.t, p: bodyPoint(f, 'torso') }));
      const on = detectOnset(pts, aspect);
      expect(on.ok).toBe(true);
      if (!on.ok) continue;
      const e = on.t - 5000;
      errs.push(Math.abs(e));
      if (Math.abs(e) <= 2 * on.sdMs + frame / 2) inside++;
    }
    const mean = errs.reduce((s, x) => s + x, 0) / errs.length;
    expect(mean).toBeLessThan(Math.max(frame, 12));
    expect(inside / errs.length).toBeGreaterThan(0.85);
  });

  it('nobody moving is no start; nobody standing still first is no start', () => {
    const { frames, aspect } = film(sprinter({ vmax: 8.5, tau: 1.2, startX: -2 }), 1.8, -1.5, -0.1, 0, { fps: 30, noise: 0.002, seed: 2 });
    expect(detectOnset(frames.map((f) => ({ t: f.t, p: bodyPoint(f, 'torso') })), aspect).ok).toBe(false);
    expect(detectOnset([{ t: 0, p: { x: 0.5, y: 0.5 } }], 1).ok).toBe(false);
  });
});

describe('two phones, one clock', () => {
  it('NTP\'s offset: exact with a symmetric wire, within half the round trip when it is not', () => {
    expect(offsetOf({ t0: 100, t1: 1110, t2: 1111, t3: 121 })).toEqual({ offsetMs: 1000, delayMs: 20 });
    const rand = mulberry32(9), n = gauss(rand);
    const TRUE = -3456.7;
    const samples = Array.from({ length: 10 }, (_, k) => {
      const t0 = 1000 + k * 60, up = 8 + Math.abs(n()) * 30, down = 5 + Math.abs(n()) * 60;
      const t1 = t0 + up + TRUE, t2 = t1 + 0.4;
      return { t0, t1, t2, t3: t2 - TRUE + down };
    });
    const r = estimateOffset(samples);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.abs(r.offsetMs - TRUE)).toBeLessThanOrEqual(r.boundMs + 1e-9);
    expect(estimateOffset(samples.slice(0, 2)).ok).toBe(false);
  });

  it('the handshake over a link, and the other phone\'s start on this phone\'s clock', async () => {
    // two clocks 2500 ms apart, a link with 12 ms one way and 30 ms back
    let now = 0;
    const local = () => now, remote = () => now + 2500;
    const a: ((m: SyncMessage) => void)[] = [], b: ((m: SyncMessage) => void)[] = [];
    const queue: { at: number; fn: () => void }[] = [];
    const later = (ms: number, fn: () => void) => queue.push({ at: now + ms, fn });
    const linkA: SyncLink = { send: (m) => later(12, () => b.forEach((cb) => cb(m))), onMessage: (cb) => { a.push(cb); return () => a.splice(a.indexOf(cb), 1); } };
    const linkB: SyncLink = { send: (m) => later(30, () => a.forEach((cb) => cb(m))), onMessage: (cb) => { b.push(cb); return () => b.splice(b.indexOf(cb), 1); } };
    answerPings(linkB, remote);
    const wait = async (ms: number) => {
      const end = now + ms;
      queue.sort((x, y) => x.at - y.at);
      while (queue.length && queue[0].at <= end) { const q = queue.shift()!; now = q.at; q.fn(); queue.sort((x, y) => x.at - y.at); }
      now = end;
    };
    const r = await measureOffset(linkA, local, { count: 6, gapMs: 50, wait });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.abs(r.offsetMs - 2500)).toBeLessThanOrEqual(r.boundMs);
    expect(r.boundMs).toBeCloseTo(21, 6);
    const st = remoteStart({ type: 'sync.start', t: 12_500, sdMs: 5, kind: 'movement' }, r);
    expect(Math.abs(st.t - 10_000)).toBeLessThanOrEqual(r.boundMs);
    expect(st.reactionIncluded).toBe(false);
  });
});

describe('the register', () => {
  it('every entry is TUNE and unsigned, with a source and a label (the jump rule: nothing signed off before the pilot)', () => {
    for (const id of SPRINT_IDS) {
      const e = SPRINT[id];
      expect(e.tune).toBe(true);
      expect(e.signedOff).toBe(false);
      expect(e.label.length).toBeGreaterThan(20);
      expect(Number.isFinite(e.value)).toBe(true);
    }
  });
});

// bisect is the synth's truth finder; pin it here so a broken helper cannot pass the other suites
it('bisect finds a zero', () => { expect(bisect((t) => t * t - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 9); });
