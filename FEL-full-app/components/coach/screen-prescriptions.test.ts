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

  // FLIPPED IN MIRROR-COACH P3 (2026-09-26): P1 took the promise out because no grader existed ("can't grade from the
  // camera yet"); the graders exist now, so the line asks for a screen and says the correctives draft from its flags.
  it('no screen still says so — and, with the graders in, says the correctives draft from what the camera flags', () => {
    const line = emptyDraftLine('no_screen');
    expect(line).toMatch(/no movement screen on file/i);
    expect(line).not.toMatch(/can't grade from the camera yet/i);
    expect(line).toMatch(/the camera grades six checks, and the correctives draft here from what it flags/);
  });

  // P3 review (2026-09-26): split — 'unread_screen' is the run the camera tried and read nothing of (a re-run, with its
  // reason); 'ungraded_screen' is a run with no grades at all (every row before 2026-09-26), which the camera never read
  it('an unread run is one the camera could not read — a re-run, not a wait for a grader; an ungraded one says only what is true', () => {
    const line = emptyDraftLine('unread_screen');
    expect(line).toMatch(/could not read any of its checks/);
    expect(line).toMatch(/run it again/i);
    expect(line).not.toMatch(/yet/);
    const legacy = emptyDraftLine('ungraded_screen');
    expect(legacy).toMatch(/not graded/);
    expect(legacy).toMatch(/run the movement screen again/i);
    expect(legacy).not.toMatch(/yet|could not read/);
  });

  it('a partial screen names its retests', () => {
    expect(emptyDraftLine('partial_screen', { retests: 2 })).toMatch(/2 checks the camera could not read need a retest\./);
    expect(emptyDraftLine('partial_screen', { retests: 1 })).toMatch(/1 check the camera could not read needs? a retest\./);
    expect(emptyDraftLine('partial_screen')).not.toMatch(/retest/);
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

// ── the panel itself (MIRROR-COACH P3, 2026-09-26): three labelled groups, the draft, one tap ────────────────────────
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { DraftView, type Draft, type DraftViewProps } from './screen-prescriptions';
import { ANSWERS_WITHHELD, REVIEW_GROUPS, coachDraft, type CatalogueExercise } from '@/lib/coach/mirrorToProgram';
import { decideScreenPost } from '@/lib/mirror/screenClaims';
import { regradeFromSummary } from '@/lib/mirror/stationGraders';
import { CAMERA_NOT_DIAGNOSIS } from '@/lib/mirror/screenCorrectives';
import { screenText } from '@/lib/share/screen';

const SUMMARIES = [
  { checkId: 'heelLine', value: 2, bySide: { left: 2, right: 1 }, unit: 'deg', frames: 360, readableFrames: 360, uncertainty: 0.5, spread: 4, stationId: 'heels' },
  { checkId: 'kneeWindow', value: 0.05, bySide: { left: 0.05, right: 0.02 }, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.01, spread: 0.1, stationId: 'frontStack' },
  // flagged: the right hip higher
  { checkId: 'hipLevel', value: -0.12, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack' },
  { checkId: 'shoulderLevel', value: -0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack' },
  // not read
  { checkId: 'headFloat', value: null, unit: 'ratio', frames: 300, readableFrames: 4, uncertainty: null, spread: null, stationId: 'profile' },
  { checkId: 'singleLeg', value: 0.03, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'left', stationId: 'wobbleL' },
  { checkId: 'singleLeg', value: 0.04, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'right', stationId: 'wobbleR' },
];
const CAT: CatalogueExercise[] = [{ id: 'split', name: 'Split squat', pattern: 'lunge', skillLayer: 'strength' }];
function fixtureDraft(screen: 'modified' | 'full' = 'full', opts: Parameters<typeof coachDraft>[2] = { answersShared: true }): Draft {
  const checks = SUMMARIES.map((s) => ({ ...s, status: regradeFromSummary(s)!.status }));
  const d = decideScreenPost({ screenId: 'panel-1', screen, checks, answers: [{ questionId: 'lowerRibsWiden', answer: 'notSure' }] }, 'athlete-1');
  if (!d.ok) throw new Error('refused');
  const metrics = JSON.parse(JSON.stringify(storedScreen(d.screenId, d.screen, d.outcome.results, d.summary, { camera: d.outcome.camera, provisional: d.outcome.provisional, selfReport: d.answers })));
  return JSON.parse(JSON.stringify(coachDraft([{ metrics, createdAt: '2026-09-26T10:00:00Z' }], CAT, opts)));
}
const view = (over: Partial<DraftViewProps> = {}) => renderToStaticMarkup(createElement(DraftView, {
  clientId: 'c1', draft: fixtureDraft(), sessions: [{ id: 's1', label: 'Week 1 · Day 1' }], into: 's1', onInto: () => {},
  added: {}, onAddOne: () => {}, onAddBlock: () => {}, ...over,
}));
const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('the panel: camera / their answers / your checks, in that order, never mixed', () => {
  it('three labelled groups, in order', () => {
    const t = plain(view());
    const at = [REVIEW_GROUPS.camera, REVIEW_GROUPS.answers, REVIEW_GROUPS.coach].map((g) => t.indexOf(g));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('a flag shows the value the camera read, the FIX line and the corrective block', () => {
    const html = view();
    const hip = html.slice(html.indexOf('data-check="hipLevel"'), html.indexOf('data-check="shoulderLevel"'));
    expect(hip).toContain('data-status="flag"');
    expect(plain(hip)).toContain('Hip level, right hip higher');
    expect(plain(hip)).toContain('Flagged for a closer look');
    expect(plain(hip)).toContain('0.12 of a shoulder width, right higher · estimated');
    expect(plain(hip)).toContain('Fix: Single-leg hip work on the low side');
    expect(plain(hip)).toContain('Corrective block (activate): Trunk and hip hold');
  });

  it('an unreadable check reads RETEST with why — and the panel never says clear', () => {
    const html = view();
    const head = html.slice(html.indexOf('data-check="headFloat"'));
    expect(head).toContain('data-status="retest"');
    expect(plain(head.slice(0, 1200))).toMatch(/Retest .*Not read: too few clear frames/);
    // ("clear frames" is the grader's own reason — a frame, not the screen)
    expect(plain(html)).not.toMatch(/came back clear|\bis clear\b|clear screen/i);
  });

  it('a flagged screen with a check not read says the retest too, so it is not read as whole', () => {
    expect(plain(view())).toContain('1 check the camera could not read needs a retest.');
  });

  it('a pass shows its value and prescribes nothing', () => {
    const html = view();
    const heel = html.slice(html.indexOf('data-check="heelLine"'), html.indexOf('data-check="kneeWindow"'));
    expect(heel).toContain('data-status="pass"');
    expect(plain(heel)).not.toMatch(/Fix:|Corrective block/);
    expect(html).not.toContain('data-prescription="heelLine"');
  });

  it('their answers are their own words, quoted; the unanswered one says so', () => {
    const t = plain(view());
    expect(t).toContain('They said: "Not sure".');
    expect(t).toContain('Not answered.');
  });

  // MIRROR-COACH P3 review (2026-09-26): owner decision #4 — withheld until the client consents (what the route sends)
  it('withheld answers: one line saying they stay with the client, no answer and no "They said"', () => {
    const t = plain(view({ draft: fixtureDraft('full', { answersShared: false }) }));
    expect(t).toContain(ANSWERS_WITHHELD);
    expect(t).not.toContain('They said');
    expect(t).not.toContain('Not answered.');
  });

  it('a youth client: the panel says the blocks are off and pin rows are not offered, and shows no block', () => {
    const html = view({ draft: fixtureDraft('full', { youth: 'minor' }) });
    expect(plain(html)).toContain('Under 18: the written corrective blocks are off');
    expect(html).toContain('data-youth="minor"');
    expect(plain(html)).not.toContain('Corrective block (');
  });

  it('the not-read and not-graded lines are different lines (P3 review)', () => {
    expect(emptyDraftLine('unread_screen', { unread: { why: 'the points it reads were not clear enough (light, or something in front of you)', hint: 'More light if you can, and nothing in front of your legs.' } }))
      .toBe('Their last screen ran, but the camera could not read any of its checks — most of them: the points it reads were not clear enough (light, or something in front of you). Ask them to run it again: More light if you can, and nothing in front of your legs.');
    expect(emptyDraftLine('ungraded_screen')).not.toMatch(/could not read|whole body/);
  });

  it('the full screen names both hands-on checks as the coach\'s; the modified one says it has none', () => {
    expect(view()).toContain('data-coach-check="pelvicTilt"');
    expect(view()).toContain('data-coach-check="thoracicRotation"');
    expect(plain(view({ draft: fixtureDraft('modified') }))).toContain('The modified screen has no hands-on checks.');
  });

  it('the draft: the matched exercise into Prep, with one tap for the whole block', () => {
    const html = view();
    expect(plain(html)).toContain('Split squat — 3×8 each side · Prep');
    expect(html).toContain('aria-label="Add Split squat to Prep"');
    expect(plain(html)).toContain('Add the corrective block to Prep (1 exercise)');
    // added: no second add for it, and the block button goes (nothing left to add)
    const done = view({ added: { 'hipLevel|right': 'added' } });
    expect(plain(done)).toContain('In Prep');
    expect(done).not.toContain('data-add-block');
    // no session to add into: no add buttons at all
    const none = view({ sessions: [], into: '' });
    expect(none).not.toContain('aria-label="Add Split squat to Prep"');
    expect(none).not.toContain('data-add-block');
  });

  it('closes on "what the camera saw, not a diagnosis"; nothing else names a condition or a treatment', () => {
    const t = plain(view());
    expect(t).toContain(CAMERA_NOT_DIAGNOSIS);
    expect(screenText(t.replace(CAMERA_NOT_DIAGNOSIS, ''))).toEqual([]);
  });

  it('no screen: one line, no groups', () => {
    const html = view({ draft: { screenAt: null, prescriptions: [], reason: 'no_screen' } });
    expect(html).not.toContain('data-group');
    expect(plain(html)).toMatch(/No movement screen on file/);
  });

  it('every add target is at least 44 px', () => {
    const src = readFileSync(new URL('./screen-prescriptions.tsx', import.meta.url), 'utf8');
    expect(src).toContain('min-h-[44px] min-w-[44px]');
    expect(src).toContain('min-h-[44px] w-full');
  });
});
