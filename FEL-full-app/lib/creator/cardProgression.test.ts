// A CARD IS READ BY SOMEBODY WHO CANNOT CHECK IT (2026-09-13).
//
// The dashboard's tests hold it honest with the athlete, who already knows what they did. These hold the
// card honest with a stranger, who does not — and who is deciding whether to pay. Three things are tested
// harder here than anywhere else in the coaching layer:
//
//   · a BASELINE never wears the same clothes as a MEASUREMENT
//   · a measurement AGES: shield, then age, then the number is gone
//   · a minor has no projection at all, not a projection some component is trusted to hide

import { describe, it, expect } from 'vitest';
import {
  projectCard, isVerified, emptyStateFor, freshnessOf, ageLabel,
  FRESH_DAYS, EXPIRES_DAYS, TRAJECTORY_WINDOW_DAYS, MIN_SIGNATURE_SESSIONS,
} from './cardProgression';
import { PLATFORM_PROTOCOLS } from '../profile/protocol';
import { emptyProfile, type SharedProfile } from '../profile/sharedProfile';
import { CURRICULUM_VERSION } from '../curriculum/blueprint';
import { PROGRAM_DISCLAIMER } from '../mirror/program';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const FULL = { strength: 80, speed: 80, endurance: 80, agility: 80, power: 80, flexibility: 80, recovery: 80, mental: 80 };

/** A profile whose snapshots are SCAN-BACKED — the only kind a card may stand behind. */
function measured(snaps: { composite: number; axes?: Record<string, number>; daysAgo: number }[]): SharedProfile {
  const p = emptyProfile('cl_1', 'Ama');
  p.prq = snaps.map((s) => ({
    composite: s.composite, axes: s.axes ?? FULL, at: ago(s.daysAgo), sourceScanAt: ago(s.daysAgo),
  }));
  return p;
}

describe('A BASELINE IS NOT A MEASUREMENT', () => {
  it('a snapshot with no scan behind it produces no standing at all', () => {
    const p = emptyProfile('cl_1', 'Ama');
    p.prq = [{ composite: 88, axes: FULL, at: ago(1) }];      // no sourceScanAt: a baseline
    const card = projectCard(p, { now: NOW })!;
    expect(card.standing).toBeNull();
    expect(isVerified(card)).toBe(false);
    expect(JSON.stringify(card)).not.toContain('88');
  });

  it('and the same number WITH a scan behind it stands', () => {
    const card = projectCard(measured([{ composite: 88, daysAgo: 1 }]), { now: NOW })!;
    expect(card.standing!.composite).toBe(88);
    expect(card.standing!.basis).toBe('measured');
    expect(isVerified(card)).toBe(true);
  });

  it('never scanned reads as not measured, and says so in one line', () => {
    const card = projectCard(emptyProfile('cl_1', 'Ama'), { now: NOW })!;
    expect(card.standing).toBeNull();
    expect(card.bases).not.toContain('measured');
    expect(emptyStateFor(card)).toMatch(/no system scan/i);
  });
});

describe('A CLAIM AGES', () => {
  it('fresh keeps the shield', () => {
    const card = projectCard(measured([{ composite: 82, daysAgo: FRESH_DAYS - 1 }]), { now: NOW })!;
    expect(card.standing!.freshness).toBe('fresh');
    expect(card.standing!.verified).toBe(true);
    expect(card.standing!.composite).toBe(82);
  });

  it('stale keeps the number but LOSES the shield, and prints its age', () => {
    const card = projectCard(measured([{ composite: 82, daysAgo: 90 }]), { now: NOW })!;
    expect(card.standing!.freshness).toBe('stale');
    expect(card.standing!.verified).toBe(false);
    expect(card.standing!.composite).toBe(82);
    expect(card.standing!.note).toMatch(/3 months ago/);
    expect(card.standing!.note).toMatch(/not a current reading/i);
    expect(isVerified(card)).toBe(false);
  });

  it('EXPIRED WITHHOLDS THE NUMBER — a component cannot render what is not in the projection', () => {
    const card = projectCard(measured([{ composite: 99, daysAgo: EXPIRES_DAYS + 30 }]), { now: NOW })!;
    expect(card.standing!.freshness).toBe('expired');
    expect(card.standing!.composite).toBeNull();
    expect(JSON.stringify(card)).not.toContain('99');
    expect(card.standing!.note).toMatch(/last measured/i);
    expect(emptyStateFor(card)).toBe(card.standing!.note);
  });

  it('the boundaries are where they say they are', () => {
    expect(freshnessOf(FRESH_DAYS - 1)).toBe('fresh');
    expect(freshnessOf(FRESH_DAYS)).toBe('stale');
    expect(freshnessOf(EXPIRES_DAYS - 1)).toBe('stale');
    expect(freshnessOf(EXPIRES_DAYS)).toBe('expired');
  });

  it('ages read like a person wrote them', () => {
    expect(ageLabel(0)).toBe('today');
    expect(ageLabel(1)).toBe('yesterday');
    expect(ageLabel(12)).toBe('12 days ago');
    expect(ageLabel(31)).toBe('1 month ago');
    expect(ageLabel(240)).toBe('8 months ago');
    expect(ageLabel(400)).toBe('1 year ago');
  });
});

describe('A TRAJECTORY NEEDS TWO POINTS, ON A CARD MOST OF ALL', () => {
  it('one measurement is a first measurement, not a change of zero', () => {
    const card = projectCard(measured([{ composite: 70, daysAgo: 2 }]), { now: NOW })!;
    expect(card.trajectory!.delta).toBeNull();
    expect(card.trajectory!.label).toBe('First measurement');
    expect(card.trajectory!.label).not.toContain('0');
  });

  it('two give a real delta', () => {
    const card = projectCard(measured([
      { composite: 61, daysAgo: TRAJECTORY_WINDOW_DAYS + 3 },
      { composite: 74, daysAgo: 2 },
    ]), { now: NOW })!;
    expect(card.trajectory!.delta).toBe(13);
    expect(card.trajectory!.label).toMatch(/^\+13 in/);
  });

  it('a genuine hold says Level, which is a different claim from "we cannot tell"', () => {
    const card = projectCard(measured([
      { composite: 70, daysAgo: TRAJECTORY_WINDOW_DAYS + 3 },
      { composite: 70, daysAgo: 2 },
    ]), { now: NOW })!;
    expect(card.trajectory!.delta).toBe(0);
    expect(card.trajectory!.label).toBe('Level');
  });

  it('a drop is published like a rise', () => {
    const card = projectCard(measured([
      { composite: 80, daysAgo: TRAJECTORY_WINDOW_DAYS + 3 },
      { composite: 66, daysAgo: 2 },
    ]), { now: NOW })!;
    expect(card.trajectory!.delta).toBe(-14);
  });

  it('an expired reading is not a base to trend from', () => {
    const card = projectCard(measured([
      { composite: 60, daysAgo: EXPIRES_DAYS + 90 },
      { composite: 90, daysAgo: EXPIRES_DAYS + 30 },
    ]), { now: NOW })!;
    expect(card.trajectory).toBeNull();
  });

  it('a BASELINE cannot serve as the past point either', () => {
    const p = measured([{ composite: 80, daysAgo: 2 }]);
    p.prq.unshift({ composite: 20, axes: FULL, at: ago(TRAJECTORY_WINDOW_DAYS + 3) });   // no sourceScanAt
    const card = projectCard(p, { now: NOW })!;
    expect(card.trajectory!.delta).toBeNull();      // a +60 leap off a baseline is exactly the inflation
  });
});

describe('ATTEMPTED IS NOT EARNED, AND EARNED HAS A VINTAGE', () => {
  it('only passed modules become credentials', () => {
    const p = measured([{ composite: 70, daysAgo: 2 }]);
    p.academy = [
      { trackKey: 'blueprint', moduleKey: 'm1', completedAt: ago(20), passed: true, score: 90, curriculumVersion: CURRICULUM_VERSION },
      { trackKey: 'blueprint', moduleKey: 'm2', completedAt: ago(19), passed: false, score: 40 },
      { trackKey: 'blueprint', moduleKey: 'm3', completedAt: ago(18) },
    ];
    const card = projectCard(p, { now: NOW, curriculumVersion: CURRICULUM_VERSION })!;
    expect(card.credentials.map((c) => c.moduleKey)).toEqual(['m1']);
    expect(card.credentials[0].basis).toBe('earned');
    expect(card.credentials[0].superseded).toBe(false);
  });

  it('a credential earned against an older curriculum SAYS SO rather than being dropped or laundered', () => {
    const p = measured([{ composite: 70, daysAgo: 2 }]);
    p.academy = [{ trackKey: 'blueprint', moduleKey: 'm1', completedAt: ago(400), passed: true, curriculumVersion: '2025.01' }];
    const card = projectCard(p, { now: NOW, curriculumVersion: CURRICULUM_VERSION })!;
    expect(card.credentials).toHaveLength(1);
    expect(card.credentials[0].superseded).toBe(true);
  });

  it('an unrecorded curriculum version is not assumed to be the current one', () => {
    const p = measured([{ composite: 70, daysAgo: 2 }]);
    p.academy = [{ trackKey: 'blueprint', moduleKey: 'm1', completedAt: ago(10), passed: true }];
    const card = projectCard(p, { now: NOW, curriculumVersion: CURRICULUM_VERSION })!;
    expect(card.credentials[0].curriculumVersion).toBeNull();
    expect(card.credentials[0].superseded).toBe(true);
  });

  it('credentials do not buy the shield — passing an exam is not being measured', () => {
    const p = emptyProfile('cl_1', 'Ama');
    p.academy = Array.from({ length: 12 }, (_, i) => ({
      trackKey: 'blueprint', moduleKey: `m${i}`, completedAt: ago(5), passed: true, curriculumVersion: CURRICULUM_VERSION,
    }));
    const card = projectCard(p, { now: NOW, curriculumVersion: CURRICULUM_VERSION })!;
    expect(card.credentials).toHaveLength(12);
    expect(isVerified(card)).toBe(false);
    expect(card.bases).toEqual(['earned']);
  });
});

describe('UNLOCKS ARE FACTS ABOUT GATES', () => {
  it('a strong current reading publishes the gates it cleared', () => {
    const card = projectCard(measured([{ composite: 95, axes: { ...FULL, flexibility: 95, recovery: 95, power: 95, agility: 95 }, daysAgo: 2 }]),
      { now: NOW, catalogue: PLATFORM_PROTOCOLS })!;
    expect(card.unlocks.map((u) => u.key)).toContain('depth_drop');
  });

  it('an UNGATED protocol is not an achievement', () => {
    const card = projectCard(measured([{ composite: 95, axes: { ...FULL, flexibility: 95, recovery: 95, power: 95, agility: 95 }, daysAgo: 2 }]),
      { now: NOW, catalogue: PLATFORM_PROTOCOLS })!;
    expect(card.unlocks.map((u) => u.key)).not.toContain('breath_reset');
  });

  it('a beginner publishes no unlocks, and no list of refusals either', () => {
    const card = projectCard(measured([{ composite: 25, axes: { power: 25 }, daysAgo: 2 }]),
      { now: NOW, catalogue: PLATFORM_PROTOCOLS })!;
    expect(card.unlocks).toEqual([]);
    expect(JSON.stringify(card).toLowerCase()).not.toContain('locked');
  });

  it('an expired reading publishes no unlocks — a gate cleared then is not cleared now', () => {
    const card = projectCard(measured([{ composite: 95, axes: { ...FULL, flexibility: 95, recovery: 95 }, daysAgo: EXPIRES_DAYS + 5 }]),
      { now: NOW, catalogue: PLATFORM_PROTOCOLS })!;
    expect(card.unlocks).toEqual([]);
  });
});

describe('THE SIGNATURE IS ESTIMATED ENGAGEMENT AND CARRIES ITS LABEL', () => {
  it('below the session floor there is no signature at all', () => {
    const p = measured([{ composite: 70, daysAgo: 2 }]);
    p.signature = { zones: { hipHinge: 0.8 }, sessions: MIN_SIGNATURE_SESSIONS - 1 };
    expect(projectCard(p, { now: NOW })!.signature).toBeNull();
  });

  it('above it, the disclaimer is part of the DATA so no component can drop it', () => {
    const p = measured([{ composite: 70, daysAgo: 2 }]);
    p.signature = { zones: { hipHinge: 0.8 }, sessions: MIN_SIGNATURE_SESSIONS };
    const sig = projectCard(p, { now: NOW })!.signature!;
    expect(sig.basis).toBe('estimated');
    expect(sig.disclaimer).toBe(PROGRAM_DISCLAIMER);
  });
});

describe('A MINOR HAS NO PUBLIC PRESENCE — DECIDED HERE, NOT IN A COMPONENT', () => {
  it('there is no projection to render', () => {
    const p = measured([{ composite: 95, daysAgo: 1 }]);
    p.academy = [{ trackKey: 'blueprint', moduleKey: 'm1', completedAt: ago(5), passed: true }];
    expect(projectCard(p, { now: NOW, minor: true })).toBeNull();
  });

  it('and the helpers refuse a null card rather than inventing an empty one', () => {
    expect(isVerified(null)).toBe(false);
    expect(emptyStateFor(null)).toBeNull();
  });
});

describe('THE CARD COMPARES AN ATHLETE TO NOBODY', () => {
  const rich = () => {
    const p = measured([
      { composite: 58, daysAgo: TRAJECTORY_WINDOW_DAYS + 4 },
      { composite: 84, axes: { ...FULL, flexibility: 90, recovery: 90 }, daysAgo: 2 },
    ]);
    p.academy = [{ trackKey: 'blueprint', moduleKey: 'm1', completedAt: ago(9), passed: true, curriculumVersion: CURRICULUM_VERSION }];
    p.signature = { zones: { hipHinge: 0.7, ankle: 0.4 }, sessions: 9 };
    p.history = [{ modeId: 'dunk', score: 120, at: ago(3) }];
    return p;
  };

  it('no population language anywhere in a fully populated card', () => {
    const blob = JSON.stringify(projectCard(rich(), { now: NOW, catalogue: PLATFORM_PROTOCOLS, curriculumVersion: CURRICULUM_VERSION })).toLowerCase();
    for (const bad of ['percentile', 'rank', 'top 10', 'compared to', 'better than', 'average user', 'leaderboard']) {
      expect(blob, bad).not.toContain(bad);
    }
  });

  it('and no clinical language either', () => {
    const card = projectCard(rich(), { now: NOW, catalogue: PLATFORM_PROTOCOLS, curriculumVersion: CURRICULUM_VERSION })!;
    // the disclaimer is excluded because it is the one string that must NAME those words in order to deny
    // them — a sweep that flags it is measuring the guard rather than the thing guarded (this caught the
    // same false positive as the Mirror's sweep, which is why it is written down twice)
    const blob = JSON.stringify({ ...card, signature: { ...card.signature!, disclaimer: '' } }).toLowerCase();
    for (const bad of ['diagnos', 'symptom', 'patholog', 'injur', 'deficien', 'dysfunction', 'weakness']) {
      expect(blob, bad).not.toContain(bad);
    }
    expect(card.signature!.disclaimer).toBe(PROGRAM_DISCLAIMER);
  });

  it('every basis in the card is one of the four, and there is no fifth for self-reported', () => {
    const card = projectCard(rich(), { now: NOW, catalogue: PLATFORM_PROTOCOLS, curriculumVersion: CURRICULUM_VERSION })!;
    expect(card.bases.sort()).toEqual(['earned', 'estimated', 'measured', 'played']);
    const blob = JSON.stringify(card).toLowerCase();
    expect(blob).not.toContain('self-reported');
    expect(blob).not.toContain('"basis":"profile"');
  });

  it('THE CARD NEVER READS RAW SCANS — the brief’s rule, held structurally', () => {
    const p = rich();
    p.scans = [{ attribute: 'verticalJump', value: 41, unit: 'in', source: 'manual', measuredAt: ago(1) }];
    const card = projectCard(p, { now: NOW, catalogue: PLATFORM_PROTOCOLS });
    const blob = JSON.stringify(card);
    expect(blob).not.toContain('verticalJump');
    expect(blob).not.toContain('41');
  });
});
