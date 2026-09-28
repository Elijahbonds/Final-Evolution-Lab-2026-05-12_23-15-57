// The coach's panel says "clear" only for a graded screen that found nothing (MIRROR-COACH P1, 2026-09-25).
//
// It used to say "Their last screen came back clear." for every reason except 'no_screen' — including the route's
// 'unreadable_screen', which is what every stored screen was (none had been graded). These hold the copy per reason,
// and the join with the stored rows the route actually reads.
import { describe, expect, it } from 'vitest';
import { emptyDraftLine } from './screen-prescriptions';
import { isUngradedStoredScreen, readStoredScreen, storedScreen } from '@/lib/mirror/screenStore';
import { scoreScreen, type CheckResult } from '@/lib/mirror/screen';

describe('what the panel says when there is nothing to draft', () => {
  // MIRROR-COACH P1 review (2026-09-25): "clear" came from NO reason, and a screen with one stable check out of eight
  // reached the panel with no reason. It now needs the route to say 'clear_screen' (a COMPLETE screen, nothing flagged).
  it('"clear" only when the route says the screen was complete and clear', () => {
    expect(emptyDraftLine('clear_screen')).toMatch(/came back clear/i);
    expect(emptyDraftLine(undefined)).not.toMatch(/clear/i);
    expect(emptyDraftLine('')).not.toMatch(/clear/i);
  });

  it('a partly graded screen says so — never "came back clear"', () => {
    const line = emptyDraftLine('partial_screen');
    expect(line).toMatch(/only partly graded/i);
    expect(line).not.toMatch(/came back clear/i);
  });

  it('a newer run that was not graded is said, not hidden behind the older screen', () => {
    expect(emptyDraftLine('clear_screen', { newerRunUngraded: true })).toMatch(/A newer run was not graded\.$/);
    expect(emptyDraftLine('clear_screen')).not.toMatch(/newer/);
  });

  it('an ungraded screen says it was not graded — never clear', () => {
    const line = emptyDraftLine('ungraded_screen');
    expect(line).toMatch(/not graded/i);
    expect(line).not.toMatch(/clear/i);
  });

  it('an unreadable screen says so — never clear', () => {
    const line = emptyDraftLine('unreadable_screen');
    expect(line).toMatch(/could not be read/i);
    expect(line).not.toMatch(/clear/i);
  });

  it('no screen still says so — and no longer promises the correctives "draft themselves" (no grader exists yet)', () => {
    const line = emptyDraftLine('no_screen');
    expect(line).toMatch(/no movement screen on file/i);
    expect(line).not.toMatch(/draft themselves/i);
    expect(line).toMatch(/can't grade from the camera yet/i);
  });

  it('a reason it does not know is not good news', () => {
    expect(emptyDraftLine('something_new')).not.toMatch(/clear/i);
  });
});

describe('the rows behind those reasons', () => {
  it('a screen stored with nothing graded is ungraded, not a result', () => {
    const row = JSON.parse(JSON.stringify(storedScreen('s1', 'modified', [], scoreScreen('modified', []))));
    expect(row.graded).toBe(false);
    expect(readStoredScreen(row)).toBeNull();
    expect(isUngradedStoredScreen(row)).toBe(true);
  });

  it('a row stored BEFORE 2026-09-25 with empty results (every one so far) reads as ungraded too', () => {
    const legacy = { screenId: 'old', screen: 'modified', results: [], summary: { screen: 'modified', redFlags: 0, score: 100, meaning: [], suggestions: [] } };
    expect(isUngradedStoredScreen(legacy)).toBe(true);
  });

  it('a half-written row is unreadable, not ungraded', () => {
    expect(isUngradedStoredScreen({ screenId: 's', results: [] })).toBe(false);
    expect(isUngradedStoredScreen(null)).toBe(false);
  });

  it('a graded screen with one stable check out of eight reads as a result — a PARTIAL one, not clear', () => {
    const results: CheckResult[] = [{ checkId: 'hipLevel', grade: 'stable', source: 'camera' }];
    const back = readStoredScreen(storedScreen('s2', 'modified', results, scoreScreen('modified', results)));
    expect(back?.graded).toBe(true);
    expect(back?.summary.ranAll).toBe(false);
    expect(back?.summary.triage).toBe('partial');
    expect(isUngradedStoredScreen(storedScreen('s2', 'modified', results, scoreScreen('modified', results)))).toBe(false);
  });

  it('a pre-P1 row that stored score 100 over one result is RE-SCORED on read, not trusted', () => {
    const results: CheckResult[] = [{ checkId: 'heelLine', grade: 'stable', source: 'camera' }];
    const legacy = { screenId: 'old', screen: 'full', results, summary: { screen: 'full', redFlags: 0, score: 100, triage: 'proceed', headline: 'Nothing flagged. That is a platform you can load.', meaning: [], suggestions: [], programming: ['Train normally.'] } };
    const back = readStoredScreen(JSON.parse(JSON.stringify(legacy)))!;
    expect(back.screen).toBe('modified');                  // a legacy 'full' label ran the modified stations
    expect(back.summary.score).toBeNull();
    expect(back.summary.triage).toBe('partial');
    expect(back.summary.headline).not.toMatch(/nothing flagged/i);
  });
});
