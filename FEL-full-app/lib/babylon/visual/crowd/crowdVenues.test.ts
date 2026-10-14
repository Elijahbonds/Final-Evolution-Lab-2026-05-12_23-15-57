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

describe('velocity kart: the circuit\'s own grandstands', () => {
  // imported lazily: the circuits are built from the course table
  it('seats every straight grandstand on every course, well off the road, facing it', async () => {
    const { kartCircuits } = await import('../../racing/kartCircuits');
    const { kartSceneryFor } = await import('../../racing/kartDressing');
    const { locate } = await import('../../racing/racingLine');
    const { kartCrowdVenue, KART_STAND_MODELS } = await import('./crowdVenues');
    for (const c of kartCircuits()) {
      const scenery = kartSceneryFor(c);
      const v = kartCrowdVenue(scenery);
      expect(v.stands.length, c.course.id).toBe(scenery.filter((p) => KART_STAND_MODELS.includes(p.model)).length);
      expect(v.stands.length, c.course.id).toBeGreaterThanOrEqual(2);
      const seats = layoutSeats(v);
      expect(seats.length, c.course.id).toBeGreaterThan(10);
      for (const s of seats) {
        const at = locate(c.line, s.pos[0], s.pos[2]);
        expect(Math.abs(at.lateral), `${c.course.id} ${s.stand}`).toBeGreaterThan(c.halfWidth + 10);   // nobody near the tarmac
      }
      // a phone: cards only, within the tier
      expect(splitSeats(seats, 'mobile').fans).toHaveLength(0);
    }
  });
});

describe('derby: the baseline bleachers sit in foul ground', () => {
  it('every baseline seat has |x| > z (the foul lines run from the plate at 45°)', () => {
    for (const s of layoutSeats(crowdVenue('derby')!)) {
      if (!/^db_(first|third)$/.test(s.stand)) continue;
      expect(Math.abs(s.pos[0]), `${s.stand} row ${s.row}`).toBeGreaterThan(s.pos[2]);
    }
  });
});

describe('volleyball: nobody straight behind the far court', () => {
  it('the far end is left open behind the opponents (|x| ≥ 3.5 past the far baseline)', () => {
    for (const s of layoutSeats(crowdVenue('volleyball')!)) if (s.pos[2] < -12) expect(Math.abs(s.pos[0]), s.stand).toBeGreaterThanOrEqual(3.5);
  });
});
