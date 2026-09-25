// A MEASUREMENT BECOMES AN AXIS, AND THE INVERSION IS NOT BACKWARDS (2026-09-13).
//
// Two failures here are silent and expensive:
//   · a LOWER-IS-BETTER measurement mapped the wrong way, so the fastest sprinter scores worst — and nothing
//     crashes, the numbers just quietly mean the opposite of what everyone assumes
//   · an out-of-range value extrapolating instead of clamping, so a mistyped vertical unlocks the depth drop
//
// Both are tested directly. The rest is about what happens when there is no data, because the whole gating
// layer downstream depends on "no snapshot" being different from "average snapshot".

import { describe, it, expect } from 'vitest';
import {
  MEASUREMENTS, measurementFor, axisValue, snapshotFrom, missingAxes, suggestNextMeasurements,
  DEFAULT_MAX_SCAN_AGE_DAYS,
} from './scanToSnapshot';
import { prqScore, PRQ_ATTRS, PRQ_CAMERA_SOURCE, isPrqEstimate } from '../prq';
import { emptyProfile, prqTrend, roundTrip, type ScanRecord } from './sharedProfile';
import { snapshotSeries } from './profileServer';
import { projectCard, isVerified } from '../creator/cardProgression';
import { boundFormSummary, heightCmForFlight, planFormWrite } from '../move/formSummary';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const scan = (attribute: string, value: number, days = 1): ScanRecord =>
  ({ attribute, value, unit: measurementFor(attribute)?.unit ?? '', source: 'device', measuredAt: ago(days) });

describe('LOWER-IS-BETTER IS NOT BACKWARDS', () => {
  it('a faster sprint scores HIGHER', () => {
    const m = measurementFor('sprint10m')!;
    expect(m.lowerIsBetter).toBe(true);
    const fast = axisValue(m, 1.6)!;
    const slow = axisValue(m, 2.5)!;
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBeGreaterThan(85);
    expect(slow).toBeLessThan(20);
  });

  it('and so does a quicker reaction and a lower resting heart rate', () => {
    for (const key of ['reactionTime', 'laneAgility', 'restingHeartRate']) {
      const m = measurementFor(key)!;
      expect(m.lowerIsBetter, key).toBe(true);
      expect(axisValue(m, m.ceiling)!, key).toBe(100);
      expect(axisValue(m, m.floor)!, key).toBe(0);
    }
  });

  it('a higher-is-better measurement still runs the right way round', () => {
    const m = measurementFor('verticalJump')!;
    expect(axisValue(m, 40)).toBe(100);
    expect(axisValue(m, 12)).toBe(0);
    expect(axisValue(m, 26)).toBe(50);
  });

  it('EVERY inverted measurement declares it — nothing is inferred from the unit', () => {
    for (const m of MEASUREMENTS) {
      const inverted = m.ceiling < m.floor;
      expect(Boolean(m.lowerIsBetter), `${m.key} declares its direction`).toBe(inverted);
    }
  });
});

describe('OUT OF RANGE CLAMPS, IT DOES NOT EXTRAPOLATE', () => {
  it('a mistyped vertical does not produce a superhuman axis', () => {
    const m = measurementFor('verticalJump')!;
    expect(axisValue(m, 3100)).toBe(100);
    expect(axisValue(m, -50)).toBe(0);
  });

  it('nor does an impossible sprint time', () => {
    const m = measurementFor('sprint10m')!;
    expect(axisValue(m, 0.1)).toBe(100);
    expect(axisValue(m, 99)).toBe(0);
  });

  it('every axis value is an integer inside 0..100, for every measurement', () => {
    for (const m of MEASUREMENTS) {
      for (const v of [-1e9, m.floor, (m.floor + m.ceiling) / 2, m.ceiling, 1e9]) {
        const a = axisValue(m, v)!;
        expect(Number.isInteger(a), `${m.key} @ ${v}`).toBe(true);
        expect(a, `${m.key} @ ${v}`).toBeGreaterThanOrEqual(0);
        expect(a, `${m.key} @ ${v}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('nonsense returns null rather than NaN', () => {
    const m = measurementFor('verticalJump')!;
    expect(axisValue(m, Number.NaN)).toBeNull();
    expect(axisValue(m, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('NO DATA IS NOT AVERAGE DATA', () => {
  it('no scans produces NO snapshot', () => {
    expect(snapshotFrom([], { now: NOW })).toBeNull();
  });

  it('only stale scans produces no snapshot', () => {
    expect(snapshotFrom([scan('verticalJump', 30, DEFAULT_MAX_SCAN_AGE_DAYS + 1)], { now: NOW })).toBeNull();
  });

  it('only unrecognised measurements produces no snapshot', () => {
    const junk: ScanRecord = { attribute: 'shoeSize', value: 11, unit: 'us', source: 'manual', measuredAt: ago(1) };
    expect(snapshotFrom([junk], { now: NOW })).toBeNull();
  });

  it('AN UNMEASURED AXIS IS ABSENT, not filled with a baseline', () => {
    // the gate treats a missing axis as "cannot tell" and locks. Filling it with 50 would silently turn
    // "we never measured your ankles" into "your ankles are average", which unlocks a depth drop.
    const s = snapshotFrom([scan('verticalJump', 30)], { now: NOW })!;
    expect(Object.keys(s.axes)).toEqual(['power']);
    expect(s.axes.flexibility).toBeUndefined();
    expect(missingAxes(s)).toContain('flexibility');
  });

  it('missingAxes on a null snapshot is every axis', () => {
    expect(missingAxes(null)).toEqual([...PRQ_ATTRS]);
  });
});

describe('building a snapshot', () => {
  it('several measurements on one axis average', () => {
    const s = snapshotFrom([scan('verticalJump', 40), scan('broadJump', 50)], { now: NOW })!;
    expect(s.axes.power).toBe(50);          // 100 and 0
  });

  it('THE FRESHEST READING OF A MEASUREMENT WINS', () => {
    const s = snapshotFrom([
      scan('verticalJump', 12, 20),         // old and bad
      scan('verticalJump', 40, 1),          // recent and good
    ], { now: NOW })!;
    expect(s.axes.power).toBe(100);
  });

  it('the composite comes from the canonical scorer, not a second average', () => {
    const s = snapshotFrom([scan('verticalJump', 40), scan('ankleDorsiflexion', 14)], { now: NOW })!;
    expect(s.composite).toBe(prqScore(s.axes));
  });

  it('the snapshot is dated by its newest contributing scan', () => {
    const s = snapshotFrom([scan('verticalJump', 30, 9), scan('plankHold', 120, 3)], { now: NOW })!;
    expect(s.at).toBe(ago(3));
    expect(s.sourceScanAt).toBe(ago(3));
  });

  it('an unreadable date is dropped rather than dating the snapshot', () => {
    const broken: ScanRecord = { attribute: 'verticalJump', value: 30, unit: 'in', source: 'manual', measuredAt: 'nope' };
    expect(snapshotFrom([broken], { now: NOW })).toBeNull();
  });

  it('respects a caller-supplied age window', () => {
    const s = snapshotFrom([scan('verticalJump', 30, 10)], { now: NOW, maxAgeDays: 7 });
    expect(s).toBeNull();
    expect(snapshotFrom([scan('verticalJump', 30, 10)], { now: NOW, maxAgeDays: 20 })).not.toBeNull();
  });
});

describe('telling an athlete what to measure next', () => {
  it('suggests one measurement per missing axis', () => {
    const s = snapshotFrom([scan('verticalJump', 30)], { now: NOW });
    const next = suggestNextMeasurements(s, 3);
    expect(next).toHaveLength(3);
    expect(new Set(next.map((m) => m.axis)).size).toBe(3);
    expect(next.map((m) => m.axis)).not.toContain('power');   // already covered
  });

  it('a fully covered athlete is asked for nothing', () => {
    const full = PRQ_ATTRS.map((axis) => MEASUREMENTS.find((m) => m.axis === axis)!)
      .map((m) => scan(m.key, (m.floor + m.ceiling) / 2));
    const s = snapshotFrom(full, { now: NOW })!;
    expect(missingAxes(s)).toEqual([]);
    expect(suggestNextMeasurements(s)).toEqual([]);
  });

  it('and every PRQ axis is reachable by at least one measurement', () => {
    // otherwise an athlete could never fill their card, and a gate on that axis would be permanently locked
    const covered = new Set(MEASUREMENTS.map((m) => m.axis));
    for (const a of PRQ_ATTRS) expect(covered.has(a), a).toBe(true);
  });
});

describe('the table is auditable', () => {
  it('every measurement declares a unit, a real range and why', () => {
    for (const m of MEASUREMENTS) {
      expect(m.unit.length, m.key).toBeGreaterThan(0);
      expect(m.floor, m.key).not.toBe(m.ceiling);
      expect(m.note.length, m.key).toBeGreaterThan(25);
    }
  });

  it('keys are unique', () => {
    expect(new Set(MEASUREMENTS.map((m) => m.key)).size).toBe(MEASUREMENTS.length);
  });

  it('no clinical framing on a measurement note', () => {
    for (const m of MEASUREMENTS) {
      for (const bad of ['diagnos', 'patholog', 'symptom', 'disease', 'treat']) {
        expect(m.note.toLowerCase(), `${m.key}/${bad}`).not.toContain(bad);
      }
    }
  });
});

// A CAMERA ESTIMATE IS NOT A SCAN (movement play, 2026-09-24).
//
// The body camera's measured jump is written as PRQ power with source 'camera' (lib/prq.ts PRQ_CAMERA_SOURCE), and
// the owner ruled it "feeds PRQ power as a camera estimate, never the verified shield". A snapshot carries
// `sourceScanAt`, and that is what the card's shield stands on (cardProgression.measuredSnapshot), so a camera row
// must never make, raise, lower, re-date or rescue one — while every verified source still does.
describe('A CAMERA ESTIMATE IS NOT A SCAN', () => {
  const cam = (attribute: string, value: number, days = 0): ScanRecord =>
    ({ ...scan(attribute, value, days), source: PRQ_CAMERA_SOURCE });
  const as = (source: string, attribute: string, value: number, days = 1): ScanRecord => ({ ...scan(attribute, value, days), source });

  it('the exclusion is the estimate only: manual, device and drillResult readings all still make a snapshot', () => {
    for (const source of ['manual', 'device', 'drillResult']) {
      expect(isPrqEstimate(source), source).toBe(false);
      const s = snapshotFrom([as(source, 'verticalJump', 26, 2)], { now: NOW });
      expect(s, source).not.toBeNull();
      expect(s!.axes.power, source).toBe(50);
      expect(s!.sourceScanAt, source).toBe(ago(2));
    }
  });

  it('a camera reading NEWER than the verified one neither raises nor lowers the axis, nor re-dates the snapshot', () => {
    const verified = [scan('verticalJump', 30, 5)];
    const alone = snapshotFrom(verified, { now: NOW })!;
    const higher = snapshotFrom([...verified, cam('verticalJump', 40, 0)], { now: NOW })!;
    const lower = snapshotFrom([...verified, cam('verticalJump', 12, 1)], { now: NOW })!;
    expect(higher).toEqual(alone);
    expect(lower).toEqual(alone);
    expect(higher.sourceScanAt).toBe(ago(5));
    expect(higher.at).toBe(ago(5));
  });

  it('a camera reading on an axis nothing verified covers leaves that axis ABSENT: not 0, and not the estimate', () => {
    const s = snapshotFrom([scan('plankHold', 120, 2), cam('verticalJump', 36, 0), cam('broadJump', 110, 0)], { now: NOW })!;
    expect(Object.keys(s.axes)).toEqual(['endurance']);
    expect(s.axes.power).toBeUndefined();
    expect(missingAxes(s)).toContain('power');
    // the athlete is still asked to MEASURE power: an estimate does not fill the gap
    expect(suggestNextMeasurements(s, 8).map((m) => m.axis)).toContain('power');
    expect(s.sourceScanAt).toBe(ago(2));
  });

  it('camera readings alone make NO snapshot, whatever they measure', () => {
    const all = MEASUREMENTS.map((m) => cam(m.key, m.ceiling, 0));
    expect(snapshotFrom(all, { now: NOW })).toBeNull();
  });

  it('a fresh camera reading does not rescue a scan window that has run out', () => {
    const stale = scan('verticalJump', 30, DEFAULT_MAX_SCAN_AGE_DAYS + 1);
    expect(snapshotFrom([stale, cam('verticalJump', 30, 0)], { now: NOW })).toBeNull();
  });

  it('the PRQ row a dunk session writes (power, unit score, source camera) never makes a snapshot, alone or beside scans', () => {
    const { form } = boundFormSummary({ attempts: [
      { kind: 'jump', label: 'WINDMILL', reads: { heightCm: heightCmForFlight(720), flightMs: 720 } },
    ] }, { mode: 'dunkContest' });
    const plan = planFormWrite(form!, { userId: 'u', sessionId: 's', measuredAt: new Date(NOW) });
    const p = plan.power!;
    expect(p.source).toBe(PRQ_CAMERA_SOURCE);
    // mapped the way lib/profile/profileServer.ts loadSharedProfile maps a PrqEntry row onto a ScanRecord
    const row: ScanRecord = { attribute: p.attribute, value: p.value, unit: p.unit, source: p.source, measuredAt: p.measuredAt.toISOString(), sessionId: 's' };
    expect(snapshotFrom([row], { now: NOW })).toBeNull();
    const verified = [scan('verticalJump', 22, 4), scan('sprint10m', 2.0, 3)];
    expect(snapshotFrom([...verified, row], { now: NOW })).toEqual(snapshotFrom(verified, { now: NOW }));
  });

  it('a camera scan keeps its source through a profile export, so it is still left out after the round trip', () => {
    const p = emptyProfile('cl_cam', 'Ama');
    p.scans = [cam('verticalJump', 40, 0), scan('verticalJump', 20, 3)];
    const back = roundTrip(p)!;
    expect(back.scans.map((s) => s.source)).toEqual([PRQ_CAMERA_SOURCE, 'device']);
    expect(snapshotFrom(back.scans, { now: NOW })).toEqual(snapshotFrom([scan('verticalJump', 20, 3)], { now: NOW }));
  });

  describe('the card shield, end to end (snapshotSeries → projectCard)', () => {
    const profileOf = (scans: ScanRecord[]) => {
      const p = emptyProfile('cl_cam', 'Ama');
      p.scans = scans.slice().reverse();
      p.prq = snapshotSeries(scans);
      return p;
    };

    it('camera readings only: no standing, no shield', () => {
      const card = projectCard(profileOf([cam('verticalJump', 40, 1), cam('verticalJump', 38, 0)]), { now: NOW })!;
      expect(card.standing).toBeNull();
      expect(isVerified(card)).toBe(false);
    });

    it('an old verified scan stays stale beside a fresh camera jump: the estimate never re-dates the shield', () => {
      const card = projectCard(profileOf([scan('verticalJump', 26, 45), cam('verticalJump', 40, 0)]), { now: NOW })!;
      expect(card.standing).not.toBeNull();
      expect(card.standing!.measuredAt).toBe(ago(45));
      expect(card.standing!.freshness).toBe('stale');
      expect(isVerified(card)).toBe(false);
    });

    it('a fresh verified scan wears the shield on its OWN number, not the camera\'s', () => {
      const verifiedOnly = projectCard(profileOf([scan('verticalJump', 26, 2)]), { now: NOW })!;
      const card = projectCard(profileOf([scan('verticalJump', 26, 2), cam('verticalJump', 40, 0)]), { now: NOW })!;
      expect(isVerified(card)).toBe(true);
      expect(card.standing!.composite).toBe(verifiedOnly.standing!.composite);
      expect(card.standing!.measuredAt).toBe(ago(2));
    });

    it('a camera-only day adds no point to the trajectory, so one verified scan is still "cannot tell" (null), not "no change" (0)', () => {
      // snapshotSeries: "One snapshot per day that had a measurement"; prqTrend: "null rather than zero, because 'no
      // change' and 'we cannot tell' are different answers". A camera day is not a day something was measured.
      const p = profileOf([scan('verticalJump', 26, 3), cam('verticalJump', 40, 0)]);
      expect(p.prq).toHaveLength(1);
      expect(prqTrend(p, ago(14))).toBeNull();
    });
  });
});
