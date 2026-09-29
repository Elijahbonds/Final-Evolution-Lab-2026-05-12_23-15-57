// The per-station result card's words (MIRROR-COACH P3, 2026-09-26): value + unit + pass / flagged for a closer look /
// not read, one FIX line under a flag and only there, and the one retest said honestly.
import { describe, expect, it } from 'vitest';
import { screenText } from '@/lib/share/screen';
import { NOT_READ_AFTER_RETEST, NOT_READ_SKIPPED, RETEST_OFFER, STATUS_LABEL, stationCard, stationCards } from './stationCard';
import type { StationRecord } from './screenRunner';
import { fixLine } from './screen';
import { formatGradeValue, type StationGrade } from './stationGraders';

const g = (over: Partial<StationGrade> & Pick<StationGrade, 'checkId' | 'status'>): StationGrade => ({
  value: over.status === 'unreadable' ? null : 0.02, unit: over.checkId === 'heelLine' ? 'deg' : over.checkId === 'singleLeg' ? 'px-norm' : 'ratio',
  frames: 400, readableFrames: over.status === 'unreadable' ? 4 : 400,
  note: over.status === 'unreadable' ? 'Not read: part of you was outside the shot.' : 'Shoulders read level (…).', ...over,
});
const rec = (stationIndex: number, grades: StationGrade[], o: Partial<StationRecord> = {}): StationRecord =>
  ({ stationId: 'x', stationIndex, attempts: 1, retesting: false, held: true, grades, ...o });

describe('the per-station card', () => {
  it('a pass shows its value with the unit, labelled estimated, and no fix line', () => {
    const pass = g({ checkId: 'shoulderLevel', status: 'pass', value: 0.03 });
    const card = stationCard('modified', rec(1, [pass]))!;
    expect(card.title).toBe('Station 2 of 6 · Knee window, Hip level, Shoulder height');
    expect(card.rows[0]).toMatchObject({ label: 'Shoulder height', statusLabel: 'Pass', fix: null, retest: null });
    expect(card.rows[0].value).toBe(formatGradeValue(pass));
    expect(card.rows[0].value).toMatch(/0\.03 of a shoulder width.*estimated/);
  });

  it('a flag is "flagged for a closer look" with exactly one FIX line', () => {
    const flag = g({ checkId: 'kneeWindow', status: 'flag', value: 0.66, bySide: { left: 0.66, right: 0.01 }, side: 'left' });
    const row = stationCard('modified', rec(1, [flag]))!.rows[0];
    expect(row.statusLabel).toBe('Flagged for a closer look');
    expect(row.fix).toBe(fixLine('kneeWindow'));
    expect(row.fix).toBeTruthy();
    expect(row.value).toMatch(/hip half-widths: L 0\.66 in · R 0\.01 in · estimated/);
  });

  // MIRROR-COACH P3 review (2026-09-26): the card's hip FIX said "on the low side" beside a grade whose side is the HIGHER hip
  it('a hip-level flag\'s FIX line says which side is the low one (the flag names the higher hip)', () => {
    const flag = g({ checkId: 'hipLevel', status: 'flag', value: 0.12, side: 'left' });
    const row = stationCard('modified', rec(1, [flag]))!.rows[0];
    expect(row.fix).toBe(`${fixLine('hipLevel')} Here the low side is the right.`);
  });

  it('a check not read says why, offers the one retest while it is pending, and after it says it was kept as not read', () => {
    const un = g({ checkId: 'heelLine', status: 'unreadable', reason: 'outOfFrame' });
    const pending = stationCard('modified', rec(0, [un], { retesting: true }))!.rows[0];
    expect(pending).toMatchObject({ statusLabel: 'Not read', retest: RETEST_OFFER, fix: null });
    expect(pending.value).toMatch(/^Not read:/);
    expect(pending.retest).toMatch(/retest this station/i);
    expect(stationCard('modified', rec(0, [un], { attempts: 2 }))!.rows[0].retest).toBe(NOT_READ_AFTER_RETEST);
    expect(stationCard('modified', rec(0, [un], { attempts: 1 }))!.rows[0].retest).toBe(NOT_READ_SKIPPED);
    for (const l of [NOT_READ_AFTER_RETEST, NOT_READ_SKIPPED]) expect(l).toMatch(/never as a pass/);
  });

  it('a one-leg station names its leg; a station the camera does not grade has no card', () => {
    const leg = g({ checkId: 'singleLeg', status: 'pass', side: 'right', touchDowns: 0, stanceSec: 29 });
    expect(stationCard('modified', rec(5, [leg]))!.title).toMatch(/Single-leg stance.*· right leg$/);
    expect(stationCard('modified', rec(2, []))).toBeNull();          // the breath station: answered, never graded
    expect(stationCards('full', [rec(4, []), rec(5, []), rec(0, [g({ checkId: 'heelLine', status: 'pass' })])])).toHaveLength(1);
  });

  it('the status words are the contract\'s three, and no card line breaks the copy rules', () => {
    expect(Object.values(STATUS_LABEL)).toEqual(['Pass', 'Flagged for a closer look', 'Not read']);
    const lines = [RETEST_OFFER, NOT_READ_AFTER_RETEST, NOT_READ_SKIPPED, ...Object.values(STATUS_LABEL)];
    for (const id of ['heelLine', 'kneeWindow', 'hipLevel', 'shoulderLevel', 'headFloat', 'singleLeg']) lines.push(fixLine(id)!);
    for (const l of lines) {
      expect(screenText(l), l).toEqual([]);
      expect(l, l).not.toMatch(/dysfunction|injur|risk|prevent|diagnos/i);
    }
  });
});
