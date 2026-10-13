import { describe, expect, it } from 'vitest';
import { ScuffTracker, RUN_MPS, SCUFF_COOLDOWN_S, TELEPORT_M, type ScuffStamp } from './hoopsScuffs';

const DT = 1 / 60;
/** Drive a tracker along a list of (seconds, vx, vz, y) legs from (0,0,0); returns every stamp with its time. */
function drive(t: ScuffTracker, legs: [number, number, number, number?][]): { at: number; s: ScuffStamp }[] {
  const out: { at: number; s: ScuffStamp }[] = []; let x = 0, z = 0, clock = 0;
  t.step(DT, x, 0, z);
  for (const [sec, vx, vz, y = 0] of legs) for (let i = 0; i < Math.round(sec / DT); i++) { x += vx * DT; z += vz * DT; clock += DT; for (const s of t.step(DT, x, y, z)) out.push({ at: clock, s }); }
  return out;
}

describe('a hard stop', () => {
  it('leaves one mark along the run it ended', () => {
    const r = drive(new ScuffTracker(), [[0.8, 0, 6], [0.6, 0, 0]]);
    expect(r.map((e) => e.s.why)).toEqual(['stop']);
    expect(r[0].s.yaw).toBeCloseTo(0, 1);   // travelling +z
    expect(r[0].s.scale).toBeGreaterThanOrEqual(0.55);
  });
  it('a jog that slows down is not a plant', () => {
    expect(drive(new ScuffTracker(), [[0.8, 0, RUN_MPS * 0.6], [0.6, 0, 0]])).toEqual([]);
  });
  it('standing still, or walking, leaves nothing', () => { expect(drive(new ScuffTracker(), [[2, 0, 0], [2, 0, 1.2]])).toEqual([]); });
});

describe('a planted cut', () => {
  it('a sharp turn at speed leaves one mark pointing the way he went', () => {
    const r = drive(new ScuffTracker(), [[0.7, 0, 6], [0.7, 6, 0]]);
    expect(r.length).toBe(1);
    expect(r[0].s.why).toBe('cut');
    expect(r[0].s.yaw).toBeGreaterThan(1.2);   // now heading +x
  });
  it('a long curve is not a cut', () => {
    const legs: [number, number, number][] = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * (Math.PI / 2); legs.push([0.05, Math.sin(a) * 6, Math.cos(a) * 6]); }
    expect(drive(new ScuffTracker(), legs).filter((e) => e.s.why === 'cut')).toEqual([]);
  });
});

describe('a landing', () => {
  it('coming down after a jump leaves a mark; a hop does not', () => {
    const jump = drive(new ScuffTracker(), [[0.1, 0, 0], [0.5, 0, 0, 0.9], [0.2, 0, 0, 0]]);
    expect(jump.map((e) => e.s.why)).toEqual(['land']);
    const hop = drive(new ScuffTracker(), [[0.1, 0, 0], [0.1, 0, 0, 0.4], [0.2, 0, 0, 0]]);
    expect(hop).toEqual([]);
  });
});

describe('spacing and teleports', () => {
  it('one mark per cooldown per body', () => {
    const legs: [number, number, number][] = [];
    for (let i = 0; i < 8; i++) { legs.push([0.3, 0, 6], [0.15, 0, 0]); }   // eight stop-and-gos in 3.6 s
    const r = drive(new ScuffTracker(), legs);
    for (let i = 1; i < r.length; i++) expect(r[i].at - r[i - 1].at).toBeGreaterThanOrEqual(SCUFF_COOLDOWN_S - 0.02);
  });
  it('a possession reset (a teleport) is not a stop', () => {
    const t = new ScuffTracker();
    let x = 0; t.step(DT, 0, 0, 0);
    for (let i = 0; i < 40; i++) { x += 6 * DT; t.step(DT, x, 0, 0); }
    expect(t.step(DT, x + TELEPORT_M + 3, 0, 8)).toEqual([]);
    for (let i = 0; i < 40; i++) expect(t.step(DT, x + TELEPORT_M + 3, 0, 8)).toEqual([]);
  });
  it('a zero step lays nothing and breaks nothing', () => { const t = new ScuffTracker(); expect(t.step(0, 1, 0, 1)).toEqual([]); expect(t.step(DT, 1, 0, 1)).toEqual([]); });
});
