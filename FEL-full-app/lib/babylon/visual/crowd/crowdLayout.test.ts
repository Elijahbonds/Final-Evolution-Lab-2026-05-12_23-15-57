import { describe, expect, it } from 'vitest';
import { CARD_BEYOND_M, CROWD_TIER, crowdTierOf, layoutSeats, pastLine, splitSeats, standPoint, type CrowdVenue, type StandSpec } from './crowdLayout';

const stand = (o: Partial<StandSpec> = {}): StandSpec => ({ id: 's', front: [0, 0, 10], yaw: Math.PI, width: 20, rows: 4, step: [0.8, 0.45], posture: 'seated', ...o });
const venue = (stands: StandSpec[], o: Partial<CrowdVenue> = {}): CrowdVenue => ({ stands, focus: [0, 1, 0], eye: [0, 4, -10], camera: { at: [0, 4, -10], into: [0, 1], margin: 2 }, ...o });

describe('stand geometry', () => {
  it('rows climb away from the play: a stand facing −z (yaw π) steps back toward +z and up', () => {
    const s = stand();
    const r0 = standPoint(s, 0, 0), r3 = standPoint(s, 0, 3);
    expect(r3[2]).toBeGreaterThan(r0[2]);
    expect(r3[1]).toBeCloseTo(3 * 0.45, 9);
    // along a row: local +x of a stand turned π runs toward world −x
    expect(standPoint(s, 5, 0)[0]).toBeCloseTo(-5, 9);
  });
  it('a stand facing +x (yaw π/2) climbs toward −x', () => {
    const s = stand({ front: [-20, 0, 0], yaw: Math.PI / 2 });
    expect(standPoint(s, 0, 2)[0]).toBeLessThan(standPoint(s, 0, 0)[0]);
  });
});

describe('seats', () => {
  it('are deterministic, fill most of a stand, and leave some gaps', () => {
    const v = venue([stand()]);
    expect(layoutSeats(v, 3)).toEqual(layoutSeats(v, 3));
    expect(layoutSeats(v, 3)).not.toEqual(layoutSeats(v, 4));
    const n = layoutSeats(v).length, full = Math.floor(20 / 0.62) * 4;
    expect(n).toBeGreaterThan(full * 0.75);
    expect(n).toBeLessThan(full);
  });
  it('never lie on the camera\'s side of its line', () => {
    // a stand straddling the camera line: only the part past it is seated
    const s = stand({ front: [-10, 0, 0], yaw: Math.PI / 2, width: 40 });
    const v = venue([s], { camera: { at: [0, 4, -10], into: [0, 1], margin: 3 } });
    const seats = layoutSeats(v);
    expect(seats.length).toBeGreaterThan(0);
    for (const p of seats) expect(pastLine(p.pos, v.camera)).toBeGreaterThanOrEqual(3);
    // control: with the line moved far back the same stand seats more
    expect(layoutSeats({ ...v, camera: { ...v.camera, at: [0, 4, -60] } }).length).toBeGreaterThan(seats.length);
  });
  it('face the play', () => {
    const v = venue([stand()]);
    for (const p of layoutSeats(v)) {
      const toFocus = Math.atan2(v.focus[0] - p.pos[0], v.focus[2] - p.pos[2]);
      const d = Math.abs(Math.atan2(Math.sin(p.yaw - toFocus), Math.cos(p.yaw - toFocus)));
      expect(d).toBeLessThan(0.75);
    }
  });
});

describe('fans and cards by tier', () => {
  const v = venue([stand({ width: 60, rows: 8 }), stand({ id: 'far', front: [0, 0, 90], width: 60, rows: 8 })]);
  const seats = layoutSeats(v);
  it('a phone gets cards only; desktop and high get real fans, nearest first, then cards', () => {
    expect(splitSeats(seats, 'mobile').fans).toHaveLength(0);
    expect(splitSeats(seats, 'mobile').cards.length).toBeLessThanOrEqual(CROWD_TIER.mobile.cards);
    const d = splitSeats(seats, 'desktop'), h = splitSeats(seats, 'high');
    expect(d.fans.length).toBe(CROWD_TIER.desktop.fans);
    expect(h.fans.length).toBeGreaterThan(d.fans.length);
    const maxFan = Math.max(...d.fans.map((s) => s.dist));
    for (const c of d.cards) expect(c.dist).toBeGreaterThanOrEqual(Math.min(maxFan, CARD_BEYOND_M));
  });
  it('nobody past CARD_BEYOND_M is a real fan, however many the tier affords', () => {
    for (const f of splitSeats(seats, 'high').fans) expect(f.dist).toBeLessThanOrEqual(CARD_BEYOND_M);
  });
  it('scale trims both', () => {
    const half = splitSeats(seats, 'desktop', 0.5);
    expect(half.fans.length).toBe(CROWD_TIER.desktop.fans / 2);
  });
  it('reads the scene tier names', () => {
    expect(crowdTierOf('high')).toBe('high');
    expect(crowdTierOf('mobile')).toBe('mobile');
    expect(crowdTierOf(undefined)).toBe('desktop');
  });
});
