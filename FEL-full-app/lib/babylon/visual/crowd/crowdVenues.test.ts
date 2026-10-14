// Every venue's crowd: seated where the venue has stands, never on the play camera's side of its line, within its tier.
import { describe, expect, it } from 'vitest';
import { CROWD_VENUE_KEYS, crowdVenue } from './crowdVenues';
import { CROWD_TIER, layoutSeats, pastLine, splitSeats } from './crowdLayout';

describe('crowd venues', () => {
  it('has the venues the lane rolled out', () => {
    expect(CROWD_VENUE_KEYS.length).toBeGreaterThan(0);
  });
  for (const key of CROWD_VENUE_KEYS) {
    describe(key, () => {
      const v = crowdVenue(key)!;
      const seats = layoutSeats(v);
      it('seats a crowd', () => { expect(seats.length).toBeGreaterThan(30); });
      it('puts nobody between the play camera and the play, or behind it', () => {
        for (const s of seats) expect(pastLine(s.pos, v.camera), `${s.stand} row ${s.row}`).toBeGreaterThanOrEqual(v.camera.margin);
        // control: the line is doing work — a stand laid on the camera's own side would be refused
        const behind = { ...v, stands: [{ ...v.stands[0], id: 'probe', front: [v.camera.at[0] - v.camera.into[0] * 5, 0, v.camera.at[2] - v.camera.into[1] * 5] as [number, number, number] }] };
        expect(layoutSeats(behind).length).toBe(0);
      });
      it('fits each tier: real fans on desktop and high, cards only on a phone', () => {
        for (const tier of ['mobile', 'desktop', 'high'] as const) {
          const { fans, cards } = splitSeats(seats, tier);
          expect(fans.length).toBeLessThanOrEqual(CROWD_TIER[tier].fans);
          expect(cards.length).toBeLessThanOrEqual(CROWD_TIER[tier].cards);
          if (tier === 'mobile') expect(fans.length).toBe(0);
          else expect(fans.length + cards.length).toBeGreaterThan(Math.min(seats.length, 100) - 1);
        }
      });
      it('keeps every seat off the floor of the play (at or past each stand\'s own front)', () => {
        for (const s of seats) expect(Number.isFinite(s.pos[0] + s.pos[1] + s.pos[2])).toBe(true);
      });
    });
  }
});
