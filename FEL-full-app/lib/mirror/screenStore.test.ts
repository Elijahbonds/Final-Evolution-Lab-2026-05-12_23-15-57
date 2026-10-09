import { describe, expect, it } from 'vitest';
import {
  LEGACY_SCREEN_NOTE, RESCORED_SCREEN_NOTE, isLegacyStoredScreen, isServerGradedScreen, isUngradedStoredScreen, readStoredScreen,
  screenRowForExport, storedScreen, storedScreenId, storedSelfReport, withSelfReport,
} from './screenStore';
import { MIRROR_SCREEN_KIND, NOT_GRADED_LINE, scoreScreen, type CheckResult } from './screen';
import { prescribeFromScreen } from '../coach/mirrorToProgram';
import type { RegradedCheck } from './screenClaims';

const results: CheckResult[] = [
  { checkId: 'kneeWindow', grade: 'fail', side: 'left', source: 'camera' },
  { checkId: 'heelLine', grade: 'borderline', source: 'camera' },
  { checkId: 'hipLevel', grade: 'stable', source: 'camera' },
];
const summary = scoreScreen('modified', results);

describe('a stored screen survives the round trip', () => {
  it('writes what the reader can read', () => {
    const back = readStoredScreen(storedScreen('s1', 'modified', results, summary));
    expect(back).not.toBeNull();
    expect(back!.results).toHaveLength(results.length);
    expect(back!.summary.redFlags).toBe(summary.redFlags);
  });

  it('survives the JSON column it actually lives in', () => {
    // Prisma stores this as Json; anything that does not survive stringify/parse is not really stored.
    const back = readStoredScreen(JSON.parse(JSON.stringify(storedScreen('s1', 'full', results, summary))));
    expect(back?.screen).toBe('full');
    expect(back?.summary.triage).toBe(summary.triage);
  });

  it('feeds the prescriber that is the point of keeping it', () => {
    const back = readStoredScreen(storedScreen('s1', 'modified', results, summary))!;
    const drafted = prescribeFromScreen(
      { meaning: back.summary.meaning, suggestions: back.summary.suggestions, findings: back.results },
      [{ id: 'e1', name: 'Knee tracking wall drill' }],
    );
    expect(drafted.length).toBeGreaterThan(0);
    expect(drafted[0].findingId).toBe('kneeWindow');   // the fail, and the one-sided one, comes first
    expect(drafted[0].because).toContain('left');
  });
});

describe('readStoredScreen refuses what it cannot use', () => {
  it('treats a half-written row as NO screen, not as an empty one', () => {
    // "no findings" and "cannot be read" must not look the same to a coach.
    expect(readStoredScreen({ screenId: 's', results: [] })).toBeNull();
    expect(readStoredScreen({ screenId: 's', results, summary: { meaning: [] } })).toBeNull();
    expect(readStoredScreen({ screenId: 's', summary })).toBeNull();
  });

  it('refuses junk rather than throwing on it', () => {
    for (const junk of [null, undefined, 0, '', 'screen', [], {}]) {
      expect(readStoredScreen(junk)).toBeNull();
    }
  });

  it('refuses results that are not results', () => {
    expect(readStoredScreen({ results: [{ nope: true }], summary })).toBeNull();
  });
});

describe('storedScreenId', () => {
  it('reads the id back so a retried post is one screen, not two', () => {
    expect(storedScreenId(storedScreen('abc', 'modified', results, summary))).toBe('abc');
  });
  it('is null when there is nothing to dedupe on', () => {
    expect(storedScreenId(null)).toBeNull();
    expect(storedScreenId({ screenId: '' })).toBeNull();
    expect(storedScreenId({ screenId: 7 })).toBeNull();
  });
});

// MIRROR-COACH P1 (2026-09-25): stored rows now carry `graded` and `movementFlags`; rows written before today carry
// neither, and must still read.
describe('rows from before the movement-flags rename', () => {
  it('a graded old row (redFlags only) reads, with movementFlags filled from redFlags', () => {
    const { movementFlags: _m, graded: _g, ...oldSummary } = summary;
    void _m; void _g;
    const old = { screenId: 'old', screen: 'modified', results, summary: { ...oldSummary, redFlags: 1 } };
    const back = readStoredScreen(JSON.parse(JSON.stringify(old)));
    expect(back?.graded).toBe(true);
    expect(back?.summary.movementFlags).toBe(1);
  });

  it('a new row stores graded: true beside its results', () => {
    expect(storedScreen('s1', 'modified', results, summary).graded).toBe(true);
    expect(storedScreen('s0', 'modified', [], scoreScreen('modified', [])).graded).toBe(false);
  });
});

// MIRROR-COACH P1 review (2026-09-25): rows written before today. Every one ran the MODIFIED stations (the harness built
// every runner 'modified' and posted the picker's value), and every empty one was stored as score 100, "Nothing
// flagged", "Train normally". The coach's route re-reads them; the athlete's data export returned them verbatim.
describe('rows stored before 2026-09-25', () => {
  const legacyEmpty = {
    screenId: 'old-1', screen: 'full', results: [],
    summary: { screen: 'full', redFlags: 0, asymmetries: 0, score: 100, triage: 'proceed', headline: 'Nothing flagged. That is a platform you can load.', meaning: [], suggestions: [], programming: ['Train normally.', 'Re-run this screen monthly.'], notMeasured: ['Pelvic tilt'], ranAll: false },
  };

  it('are recognised by the missing `graded` key, and a legacy "full" label reads as the modified screen it ran', () => {
    expect(isLegacyStoredScreen(legacyEmpty)).toBe(true);
    expect(isLegacyStoredScreen(storedScreen('new', 'full', [], scoreScreen('full', [])))).toBe(false);
    const graded = { ...legacyEmpty, results };
    expect(readStoredScreen(JSON.parse(JSON.stringify(graded)))?.screen).toBe('modified');
    // a new row keeps the variant it was stored as
    expect(readStoredScreen(JSON.parse(JSON.stringify(storedScreen('s1', 'full', results, summary))))?.screen).toBe('full');
  });

  it('the export shows an empty legacy row as NOT GRADED — no score 100, no "Nothing flagged", no "Train normally" — with a note', () => {
    const row = { id: 'w1', kind: MIRROR_SCREEN_KIND, metrics: JSON.parse(JSON.stringify(legacyEmpty)), avatarSpec: null, createdAt: new Date('2026-09-22') };
    const out = screenRowForExport(row);
    const m = out.metrics as Record<string, any>;
    expect(m.graded).toBe(false);
    expect(m.screen).toBe('modified');
    expect(m.summary.score).toBeNull();
    expect(m.summary.triage).toBe('notGraded');
    expect(m.summary.headline).toBe(NOT_GRADED_LINE);
    expect(m.summary.programming).toEqual([]);
    expect(m.note).toBe(LEGACY_SCREEN_NOTE);
    expect(JSON.stringify(out)).not.toMatch(/Nothing flagged|Train normally|"score":100/);
    // the row's own fields ride through, and the stored object is not changed
    expect({ id: out.id, kind: out.kind, createdAt: out.createdAt }).toEqual({ id: 'w1', kind: MIRROR_SCREEN_KIND, createdAt: row.createdAt });
    expect(row.metrics.summary.score).toBe(100);
  });

  it('the export re-scores a legacy row that has results, and leaves today\'s rows and other kinds alone', () => {
    const legacyGraded = { kind: MIRROR_SCREEN_KIND, metrics: { screenId: 'old-2', screen: 'modified', results: [{ checkId: 'heelLine', grade: 'stable', source: 'camera' }], summary: { ...legacyEmpty.summary, screen: 'modified' } } };
    const m = screenRowForExport(legacyGraded).metrics as Record<string, any>;
    // CHANGED ON PURPOSE in the MIRROR-COACH P3 follow-up (2026-09-28), owner decision #31: `score` was pinned null. The
    // re-scored row is scored over its one check read and carries the count (1 of 6), so the export says what it is over
    expect(m.summary).toMatchObject({ score: 100, readCount: 1, totalCount: 6 });
    expect(m.summary.triage).toBe('partial');
    expect(m.note).toBe(RESCORED_SCREEN_NOTE);
    const fresh = { kind: MIRROR_SCREEN_KIND, metrics: storedScreen('s1', 'modified', [], scoreScreen('modified', [])) };
    expect(screenRowForExport(fresh)).toBe(fresh);
    const dunk = { kind: 'mirror_dunk', metrics: { verticalCm: 60 } };
    expect(screenRowForExport(dunk)).toBe(dunk);
    const broken = { kind: MIRROR_SCREEN_KIND, metrics: { screenId: 's' } };
    expect(screenRowForExport(broken)).toBe(broken);
  });
});

// MIRROR-COACH P3 (2026-09-25): rows carry the server's evidence and the athlete's answers; an answer is kept, never scored.
describe('the P3 row: camera evidence, answers, and who graded it', () => {
  const camera: RegradedCheck[] = [
    { checkId: 'hipLevel', view: 'front', value: 0.01, unit: 'ratio', frames: 300, readableFrames: 300, note: 'Hips read level.', claimed: 'pass', status: 'pass' },
    { checkId: 'heelLine', view: 'back', value: null, unit: 'deg', frames: 360, readableFrames: 2, note: 'Not read.', claimed: 'unreadable', status: 'unreadable', reason: 'tooFewFrames' },
  ];
  const cam: CheckResult[] = [{ checkId: 'hipLevel', grade: 'stable', source: 'camera' }];
  const row = storedScreen('p3', 'full', cam, scoreScreen('full', cam), {
    camera, provisional: true, selfReport: [{ questionId: 'lowerRibsWiden', checkId: 'ribAngle', answer: 'notSure' }],
  });

  it('the route\'s row says the server graded it, keeps every regraded claim (unreadable too) and the answers', () => {
    expect(row).toMatchObject({ gradedBy: 'server', provisional: true, graded: true, screen: 'full' });
    expect(row.camera).toEqual(camera);
    expect(row.selfReport).toEqual([{ questionId: 'lowerRibsWiden', checkId: 'ribAngle', answer: 'notSure' }]);
    expect(isServerGradedScreen(row)).toBe(true);
    // a row written without extras (every row before today) is not server graded
    expect(isServerGradedScreen(storedScreen('old', 'modified', cam, scoreScreen('modified', cam)))).toBe(false);
    expect(storedScreen('old', 'modified', cam, scoreScreen('modified', cam))).not.toHaveProperty('gradedBy');
  });

  it('reads back through the JSON column with the answers, the evidence and gradedBy', () => {
    const back = readStoredScreen(JSON.parse(JSON.stringify(row)))!;
    expect(back.gradedBy).toBe('server');
    expect(back.camera).toEqual(camera);
    expect(back.provisional).toBe(true);
    expect(storedSelfReport(back)).toEqual(row.selfReport);
  });

  it('withSelfReport: a new answer replaces the same question\'s, others stay, and NOTHING scored changes', () => {
    const json = JSON.parse(JSON.stringify(row));
    const next = withSelfReport(json, [
      { questionId: 'lowerRibsWiden', checkId: 'ribAngle', answer: 'yes' },
      { questionId: 'neckShouldersLift', checkId: 'ribAngle', answer: 'no' },
    ])!;
    expect(next.selfReport).toEqual([
      { questionId: 'lowerRibsWiden', checkId: 'ribAngle', answer: 'yes' },
      { questionId: 'neckShouldersLift', checkId: 'ribAngle', answer: 'no' },
    ]);
    const { selfReport: _a, ...restNext } = next; const { selfReport: _b, ...restBefore } = json;
    void _a; void _b;
    expect(restNext).toEqual(restBefore);                   // results, summary, graded, provisional, camera: untouched
    expect(json.selfReport).toEqual(row.selfReport);         // and the stored object itself was not changed
  });

  it('withSelfReport refuses a row that is not a screen, and answers the row\'s screen never asked', () => {
    for (const junk of [null, undefined, 'x', [], {}, { screenId: 's' }, { screenId: 's', summary: {} }]) {
      expect(withSelfReport(junk, [{ questionId: 'lowerRibsWiden', checkId: 'ribAngle', answer: 'yes' }])).toBeNull();
    }
    const next = withSelfReport(JSON.parse(JSON.stringify(row)), [{ questionId: 'pelvicTilt', checkId: 'pelvicTilt', answer: 'yes' } as never])!;
    expect(next.selfReport).toEqual(row.selfReport);
  });

  it('an older row whose only "result" was the breath station reads as NOT graded now (answers are never results)', () => {
    const breathOnly = [{ checkId: 'ribAngle', grade: 'fail', source: 'camera' }] as CheckResult[];
    const old = JSON.parse(JSON.stringify(storedScreen('b1', 'modified', breathOnly, scoreScreen('modified', breathOnly))));
    expect(readStoredScreen(old)).toBeNull();
  });

  it('a past row stored with EMPTY results stays readable as "not graded" — P1\'s copy, no score', () => {
    const empty = JSON.parse(JSON.stringify(storedScreen('e1', 'modified', [], scoreScreen('modified', []))));
    expect(isUngradedStoredScreen(empty)).toBe(true);
    expect(readStoredScreen(empty)).toBeNull();
    expect(empty.summary).toMatchObject({ graded: false, score: null, triage: 'notGraded', headline: NOT_GRADED_LINE });
    expect(storedSelfReport(empty)).toEqual([]);
  });
});
