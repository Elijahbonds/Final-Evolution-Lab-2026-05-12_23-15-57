// The press/row set's zone accounting reads the rules, not the rig (MIRROR-COACH P9 fix, 2026-09-30).
//
// P9's proof found every press/row summary at 0 faults in every zone: the compositor counted inside its loop over the
// rig's highlight meshes, and with /models/candidate.glb absent from public/ the rig never spawned, so that loop never
// ran. The per-set correctives block then said "every zone held" straight after the coach had cued the elbow twice.
// These tests hold the pure accounting, then run the REAL KinematicEngine over a synthetic flared set (the geometry of
// lib/mirror/pressRowStage.test.ts, trimmed) through it and into setCorrectives — with a clean set as the control — and
// pin the compositor to it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createZoneAccounting } from './zone-accounting';
import { KinematicEngine } from '../rules/kinematic-engine';
import { RepCounter } from '../rules/rep-counter';
import { DEFAULT_THRESHOLDS, type ZoneState } from '../rules/config';
import { PATTERN_ZONES, type ZoneId } from '../patterns/split-stance-press-row';
import type { PoseFrame, PoseLandmark } from '../pose/mediapipe-adapter';
import { setCorrectives } from '@/lib/mirror/correctives';

const all = (state: ZoneState, over: Partial<Record<ZoneId, ZoneState>> = {}) =>
  Object.fromEntries(PATTERN_ZONES.map((id) => [id, { state: over[id] ?? state }])) as Record<ZoneId, { state: ZoneState }>;

describe('createZoneAccounting', () => {
  it('counts an entry into fault once per run, and stable time per zone', () => {
    const a = createZoneAccounting();
    a.step(all('stable', { posterior_chain: 'fault' }), 33);
    a.step(all('stable', { posterior_chain: 'fault' }), 33); // held: still one entry
    a.step(all('stable'), 33);
    a.step(all('stable', { posterior_chain: 'fault' }), 33); // back: a second entry
    expect(a.faultCounts.posterior_chain).toBe(2);
    expect(a.timeInStableMs.posterior_chain).toBe(33);
    expect(a.timeInStableMs.upper_traps).toBe(4 * 33);
    for (const id of PATTERN_ZONES.filter((z) => z !== 'posterior_chain')) expect(a.faultCounts[id]).toBe(0);
  });

  it('a warning or an unavailable read is neither a fault nor stable time; a missing zone reads unavailable', () => {
    const a = createZoneAccounting();
    const states = a.step(all('warning', { lat_rhomboid: 'unavailable' }), 50);
    expect(Object.values(a.faultCounts).every((n) => n === 0)).toBe(true);
    expect(Object.values(a.timeInStableMs).every((n) => n === 0)).toBe(true);
    const partial = { posterior_chain: { state: 'fault' as ZoneState } } as Record<ZoneId, { state: ZoneState }>;
    expect(a.step(partial, 50).upper_traps).toBe('unavailable');
    expect(states.lat_rhomboid).toBe('unavailable');
  });

  it('reports every PATTERN_ZONES id every frame (the HUD never loses a zone the rig has no mesh for)', () => {
    const a = createZoneAccounting();
    expect(Object.keys(a.step(all('stable'), 33)).sort()).toEqual([...PATTERN_ZONES].sort());
  });
});

// ── end to end: landmarks → KinematicEngine → accounting → the per-set correctives ──────────────────────────────────
// A front-view body, the right arm (the one the engine reads) swinging 170° → 90° → 170° at 30 fps; `flare` raises the
// elbow above the shoulder line (past DEFAULT_THRESHOLDS' flare line), the clean arm stays below and inside it.
const FPS_MS = 1000 / 30;
function landmarks(elbowDeg: number, flare: boolean): PoseLandmark[] {
  const lm: PoseLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const ls = { x: 0.6, y: 0.35 }, rs = { x: 0.4, y: 0.35 };
  const re = flare ? { x: rs.x - 0.1, y: rs.y - 0.09 } : { x: rs.x - 0.04, y: rs.y + 0.12 };
  const ux = rs.x - re.x, uy = rs.y - re.y, n = Math.hypot(ux, uy), a = (elbowDeg * Math.PI) / 180;
  const set = (i: number, x: number, y: number) => { lm[i] = { x, y, z: 0, visibility: 1 }; };
  set(11, ls.x, ls.y); set(12, rs.x, rs.y);
  set(13, ls.x + 0.04, ls.y + 0.12); set(15, ls.x + 0.05, ls.y + 0.23);
  set(14, re.x, re.y);
  set(16, re.x + 0.11 * ((ux / n) * Math.cos(a) - (uy / n) * Math.sin(a)), re.y + 0.11 * ((ux / n) * Math.sin(a) + (uy / n) * Math.cos(a)));
  set(23, 0.57, 0.6); set(24, 0.43, 0.6);
  return lm;
}
function repAngles(): number[] {
  const out: number[] = [];
  const seg = (sec: number, from: number, to: number) => {
    const k = Math.round((sec * 1000) / FPS_MS);
    for (let i = 0; i < k; i++) out.push(from + ((to - from) * i) / k);
  };
  seg(0.6, 170, 170); seg(1.0, 170, 90); seg(0.3, 90, 90); seg(1.0, 90, 170); seg(0.6, 170, 170);
  return out;
}
/** A set of `reps` reps, `flaredReps` of them (the first ones) with the elbow flared; the summary the compositor returns. */
function filmSet(reps: number, flaredReps: number) {
  const kin = new KinematicEngine(DEFAULT_THRESHOLDS);
  const counter = new RepCounter();
  const acc = createZoneAccounting();
  let t = 1_000;
  for (let r = 0; r < reps; r++) {
    for (const deg of repAngles()) {
      const frame: PoseFrame = { landmarks: landmarks(deg, r < flaredReps), timestampMs: t, present: true };
      const res = kin.evaluate(frame);
      acc.step(res.zones, res.dtMs);
      counter.feed(res.phase, t);
      t += FPS_MS;
    }
  }
  return {
    durationMs: t - 1_000, reps: counter.state.reps,
    timeInStableMs: { ...acc.timeInStableMs }, faultCounts: { ...acc.faultCounts }, avgTempo: counter.state.avg,
  };
}

describe('a real press/row set through the accounting (no rig at all)', () => {
  it('a clean set: counted reps, 0 faults in every zone — the control', () => {
    const s = filmSet(6, 0);
    expect(s.reps).toBe(6);
    expect(Object.values(s.faultCounts).every((n) => n === 0)).toBe(true);
    expect(s.timeInStableMs.posterior_chain).toBeGreaterThan(0);
  });

  it('a flared set: the elbow zone counts its faults (it read 0 before the fix), and the card no longer says "every zone held"', () => {
    const s = filmSet(6, 6);
    expect(s.reps).toBe(6);
    expect(s.faultCounts.posterior_chain).toBeGreaterThanOrEqual(6);
    const card = setCorrectives(s, null);
    expect(card.clean ?? '').not.toMatch(/every zone held/);
    expect(card.band.length + card.release.length).toBeGreaterThan(0);
    // the control's card is the clean line — the same function, the same wording
    expect(setCorrectives(filmSet(6, 0), null).clean).toMatch(/every zone held/);
  });
});

describe('the compositor counts through the accounting, not through the rig\'s meshes', () => {
  const src = readFileSync(new URL('./overlay-compositor.ts', import.meta.url), 'utf8');
  it('one step per evaluated frame over result.zones; the meshes only recolour', () => {
    expect(src).toMatch(/const zoneStates = accounting\.step\(result\.zones, result\.dtMs\);/);
    expect(src).toMatch(/for \(const z of zones\) applyZoneState\(z, zoneStates\[z\.id\]\);/);
    expect(src).not.toMatch(/faultCounts\[z\.id\]|timeInStableMs\[z\.id\]/);
  });
  it('the summary reads the accounting', () => {
    expect(src).toMatch(/timeInStableMs: \{ \.\.\.accounting\.timeInStableMs \}/);
    expect(src).toMatch(/faultCounts: \{ \.\.\.accounting\.faultCounts \}/);
  });
});
