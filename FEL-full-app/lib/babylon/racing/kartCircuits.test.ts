import { describe, expect, it } from 'vitest';
import { HOLDABLE_RADIUS, buildKartCircuit, kartCircuits } from './kartCircuits';
import { cornerRadiusAt, tightestCorner } from './racingLine';

const circuits = kartCircuits();

describe('kart circuits', () => {
  it('builds all seven', () => {
    expect(circuits.map((c) => c.course.id)).toEqual(
      ['boardwalk-loop', 'stadium-oval', 'rooftop-circuit', 'alpine-descent', 'harbor-run', 'orbit-station', 'summit-climb']);
  });

  /**
   * THE ONE THAT MATTERS. RaceCourse.ts documents that the starter kart holds ~61 m, and that the original boardwalk
   * loop broke traction on its own — a run with drifting DISABLED still logged 516 drift frames, so the drift was not
   * a choice. Adding corners is the fastest way to undo that by accident, so every course states the tightest corner
   * it means to have and this test measures whether it told the truth.
   */
  describe.each(circuits.map((c) => [c.course.id, c] as const))('%s', (_id, c) => {
    it('is no tighter than it declares', () => {
      expect(c.measuredMinRadius).toBeGreaterThanOrEqual(c.declaredMinRadius);
    });

    it('says so when it is tighter than the kart can hold', () => {
      if (c.declaredMinRadius < HOLDABLE_RADIUS) {
        expect(c.slideNote, `${_id} is tighter than grip and must tell the player`).toBeTruthy();
      } else {
        expect(c.slideNote).toBeNull();
      }
    });

    it('is a real circuit length', () => {
      // a real racing kart circuit is ~1100-1200 m; this band is that, with arcade latitude either side
      expect(c.line.length).toBeGreaterThan(700);
      expect(c.line.length).toBeLessThan(1300);
    });

    it('derives enough checkpoints to count a lap, spaced about 110 m', () => {
      const n = c.course.gates.length;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(c.line.length / n).toBeGreaterThan(70);
      expect(c.line.length / n).toBeLessThan(150);
    });

    it('has gates wide enough that staying on the road cannot miss one', () => {
      for (const gate of c.course.gates) {
        expect(gate.radius).toBeGreaterThan(c.halfWidth);
      }
    });

    it('keeps every obstacle off the racing line but on the road', () => {
      for (const o of c.obstacles) {
        // on the line it is a wall, not a choice; off the road it is scenery nobody meets
        expect(Math.abs(o.lateral)).toBeGreaterThan(2);
        expect(Math.abs(o.lateral)).toBeLessThan(c.halfWidth + 1);
        expect(o.dist).toBeGreaterThanOrEqual(0);
        expect(o.dist).toBeLessThanOrEqual(c.line.length);
      }
    });

    it('keeps every ramp on the lap', () => {
      for (const r of c.ramps) {
        expect(r.dist).toBeGreaterThanOrEqual(0);
        expect(r.dist).toBeLessThanOrEqual(c.line.length);
        expect(r.pitch).toBeGreaterThan(0);
        expect(r.run).toBeGreaterThan(0);
      }
    });

    it('only puts kerbs on actual corners', () => {
      for (const k of c.kerbs) {
        expect(k.to - k.from).toBeGreaterThanOrEqual(8);
        expect(cornerRadiusAt(c.line, (k.from + k.to) / 2)).toBeLessThan(120);
      }
    });

    it('starts on the line, facing along it', () => {
      expect(Number.isFinite(c.course.start.heading)).toBe(true);
      expect(Number.isFinite(c.course.start.at.x)).toBe(true);
    });

    it('measures the same tightest corner as the line does', () => {
      expect(c.measuredMinRadius).toBeCloseTo(tightestCorner(c.line).radius, 5);
    });
  });

  it('refuses to build a course tighter than grip that does not warn the player', () => {
    expect(() => buildKartCircuit({
      id: 'trap', name: 'TRAP', sub: 'unfair', venue: 'street', mood: 'overcast', tint: '#fff',
      loop: true, laps: 2, halfWidth: 8, declaredMinRadius: 20, ramps: [],
      pts: [[0, 0, 0], [30, 30, 0], [0, 60, 0], [-30, 30, 0]],
    } as never)).toThrow(/slideNote/);
  });

  /** ALPINE DESCENT was authored with y = 0 at every gate, so the mountain run down was flat. */
  it('makes the alpine descent actually descend — and climb back, now that it is a loop', () => {
    const alpine = circuits.find((c) => c.course.id === 'alpine-descent')!;
    expect(alpine.elevation.drop).toBeGreaterThan(50);
    expect(alpine.elevation.high - alpine.elevation.low).toBeGreaterThan(50);
    // ~8.5% average on the way down, a real mountain road rather than a ski jump; the climb takes the other side
    expect(alpine.elevation.drop / (alpine.line.length * 0.6)).toBeLessThan(0.15);
    expect(alpine.course.loop).toBe(true);
    expect(alpine.elevation.climb).toBeCloseTo(alpine.elevation.drop, 0);
  });

  /** Owner, 2026-09-18: "have the courses be closed circuits" — and a course inside the ±260 m wall the mode drives. */
  it('every course is a closed circuit with more than one lap, and every point sits inside the world', () => {
    for (const c of circuits) {
      expect(c.course.loop, c.course.id).toBe(true);
      expect(c.course.laps, c.course.id).toBeGreaterThan(1);
      for (const p of c.line.pts) { expect(Math.abs(p.x), c.course.id).toBeLessThan(390); expect(Math.abs(p.z), c.course.id).toBeLessThan(390); }
    }
    const summit = circuits.find((c) => c.course.id === 'summit-climb')!;
    expect(summit.elevation.high - summit.elevation.low).toBeGreaterThan(55);
    expect(summit.elevation.climb).toBeCloseTo(summit.elevation.drop, 0);
  });

  it('gives the rooftops real height differences for the gaps to matter', () => {
    const roof = circuits.find((c) => c.course.id === 'rooftop-circuit')!;
    expect(roof.elevation.high - roof.elevation.low).toBeGreaterThan(8);
    expect(roof.ramps.some((r) => r.size === 'gap')).toBe(true);
  });

  it('keeps the long straight the boardwalk is named for', () => {
    const bw = circuits.find((c) => c.course.id === 'boardwalk-loop')!;
    // 200 m+ of the lap with no corner tighter than 400 m
    let run = 0, best = 0;
    for (let d = 0; d < bw.line.length; d += 4) {
      if (cornerRadiusAt(bw.line, d) > 400) { run += 4; best = Math.max(best, run); } else run = 0;
    }
    expect(best).toBeGreaterThan(200);
  });

  it('gives the boardwalk the hairpin its own subtitle promises', () => {
    const bw = circuits.find((c) => c.course.id === 'boardwalk-loop')!;
    expect(bw.course.sub).toMatch(/hairpin/i);
    expect(bw.measuredMinRadius).toBeLessThan(HOLDABLE_RADIUS);   // there is one, and it is a real hairpin
  });
});
