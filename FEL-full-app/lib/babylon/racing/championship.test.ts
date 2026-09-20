import { describe, expect, it } from 'vitest';
import {
  AERO_CUPS, ALL_CUPS, KART_CUPS, POINTS, cupById, cupProgress, pointsFor, standingsFor, type RaceResult,
} from './championship';
import { KART_COURSES } from '../core/RaceCourse';

const r = (courseId: string, racerId: string, place: number, finished = true, timeMs = 60_000): RaceResult =>
  ({ courseId, racerId, place, finished, timeMs });

describe('the cup', () => {
  it('pays points down the field, and finishing last still scores', () => {
    expect(pointsFor(1, true)).toBe(POINTS[0]);
    expect(pointsFor(7, true)).toBe(POINTS[6]);
    expect(pointsFor(9, true)).toBe(1);        // off the table, but finishing counts
    expect(pointsFor(1, false)).toBe(0);       // a DNF scores nothing
  });

  it('a bad race does not end the cup — it is points, not elimination', () => {
    const cup = KART_CUPS[0];
    const results = [r(cup.courses[0].id, 'me', 8), r(cup.courses[0].id, 'rival', 1)];
    const p = cupProgress(cup, results, 'me');
    expect(p.complete).toBe(false);
    expect(p.next?.id).toBe(cup.courses[1].id);
    expect(p.headline).toMatch(/points off the lead/i);
    expect(p.headline).toMatch(/to go/i);
  });

  it('breaks a points tie on wins, then on seconds — the way a series does', () => {
    // both on 16 points: a win and an eighth (15 + 1) against a second and a sixth (12 + 4)
    const table = standingsFor([
      r('a', 'winner', 1), r('a', 'steady', 2),
      r('b', 'winner', 8), r('b', 'steady', 6),
    ]);
    expect(table[0].points).toBe(table[1].points);
    expect(table[0].racerId).toBe('winner');
  });

  it('always says how far off the lead you are — the reason to start round three', () => {
    const table = standingsFor([r('a', 'lead', 1), r('a', 'me', 4)]);
    expect(table.find((s) => s.racerId === 'lead')!.behind).toBe(0);
    expect(table.find((s) => s.racerId === 'me')!.behind).toBe(POINTS[0] - POINTS[3]);
  });

  it('crowns a champion only when every round is done', () => {
    const cup = AERO_CUPS[1];
    const partial = cup.courses.slice(0, 1).map((c) => r(c.id, 'me', 1));
    expect(cupProgress(cup, partial, 'me').champion).toBeNull();
    const all = cup.courses.map((c) => r(c.id, 'me', 1));
    const done = cupProgress(cup, all, 'me');
    expect(done.complete).toBe(true);
    expect(done.champion).toBe('me');
    expect(done.headline).toMatch(/champion/i);
  });

  it('counts rounds against the cup, not against every race ever run', () => {
    const cup = KART_CUPS[0];
    const noise = [r('some-other-course', 'me', 1), ...cup.courses.slice(0, 2).map((c) => r(c.id, 'me', 2))];
    const p = cupProgress(cup, noise, 'me');
    expect(p.rounds).toBe(cup.courses.length);
    expect(p.done).toHaveLength(2);
  });

  it('EVERY cup course is a course that actually exists', () => {
    const ids = new Set(KART_COURSES.map((c: { id: string }) => c.id));
    for (const cup of KART_CUPS) {
      for (const c of cup.courses) expect(ids.has(c.id), `${cup.id} → ${c.id}`).toBe(true);
    }
  });

  it('the cups between them use every kart course — no track is orphaned from the season', () => {
    const used = new Set(KART_CUPS.flatMap((c) => c.courses.map((x) => x.id)));
    for (const c of KART_COURSES as { id: string }[]) expect(used.has(c.id), c.id).toBe(true);
  });

  it('cups are findable by id', () => {
    expect(cupById('summit-cup')?.discipline).toBe('kart');
    expect(cupById('canyon-cup')?.discipline).toBe('aero');
    expect(cupById('nope')).toBeNull();
    expect(ALL_CUPS.length).toBe(KART_CUPS.length + AERO_CUPS.length);
  });
});
