// The six-pattern strip and the pull-over-push check (MIRROR-COACH P2, compliance-and-roster lane, 2026-09-25).
//
// The rule these tests hold the code to is the absence-vs-zero rule: an untagged exercise is "don't know which", never
// "none". So a strip over an untagged program reads `untagged`, never a row of misses, and the pull-over-push check
// never warns from untagged sets and says when they could change the answer.
import { describe, expect, it } from 'vitest';
import { screenText } from '@/lib/share/screen';
import {
  COVERAGE_PATTERNS, COVERAGE_WINDOW_DAYS, PULL_PER_PUSH, PULL_PER_PUSH_SHOULDER, WORKING_SECTIONS,
  clientCoverage, coverageLine, mentionsShoulder, patternCoverage, pullPushCheck,
  type CoverageProgramRow, type CoverageState, type PatternedItem,
} from './coverage';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 25, 12);
const ago = (d: number) => new Date(NOW - d * DAY);
const ex = (pattern: string | null, section: string | null = 'key', sets = 3): PatternedItem => ({ pattern, section, sets });
const states = (s: { cells: { pattern: string; state: CoverageState }[] }) => Object.fromEntries(s.cells.map((c) => [c.pattern, c.state]));

describe('the six patterns', () => {
  it('are squat, hinge, lunge, push, pull, carry, in that order; the working sections are key, assist and finish', () => {
    expect(COVERAGE_PATTERNS).toEqual(['squat', 'hinge', 'lunge', 'push', 'pull', 'carry']);
    expect(WORKING_SECTIONS).toEqual(['key', 'assist', 'finish']);
    expect(COVERAGE_WINDOW_DAYS).toBe(7);
  });
});

describe('patternCoverage: tagged, untagged, missing', () => {
  const tagged = [ex('squat'), ex('hinge'), ex('push'), ex('pull'), ex('carry', 'finish')];   // no lunge programmed

  it('a fully tagged program: done, open (in the program, not done) and not in the program', () => {
    const s = patternCoverage(tagged, [[ex('squat'), ex('push')], [ex('hinge')]]);
    expect(states(s)).toEqual({ squat: 'done', hinge: 'done', lunge: 'notProgrammed', push: 'done', pull: 'open', carry: 'open' });
    expect(s.sessionsDone).toBe(2);
    expect(s.untaggedDone).toBe(0);
    expect(coverageLine(s)).toBe('Last 7 days · 2 coached sessions.');
  });

  it('nothing done this week in a tagged program: every programmed pattern is open, never "missed"', () => {
    const s = patternCoverage(tagged, []);
    expect(states(s)).toEqual({ squat: 'open', hinge: 'open', lunge: 'notProgrammed', push: 'open', pull: 'open', carry: 'open' });
    expect(JSON.stringify(s)).not.toMatch(/miss/i);
  });

  it('AN UNTAGGED PROGRAM READS "untagged", NOT SIX MISSES — even with nothing done this week', () => {
    const s = patternCoverage([ex(null), ex(null), ex(null)], []);
    expect(new Set(s.cells.map((c) => c.state))).toEqual(new Set(['untagged']));
    expect(s.untaggedProgrammed).toBe(3);
    expect(s.cells[0].note).toBe("Squat: can't tell. 3 exercises in the program have no pattern tag.");
    expect(coverageLine(s)).toBe('Last 7 days · 0 coached sessions · 3 exercises in the program have no pattern tag: tag them in My catalogue to fill the strip.');
  });

  it('an untagged exercise DONE this week turns every not-done cell to untagged: it could have been any of them', () => {
    const s = patternCoverage(tagged, [[ex('squat'), ex(null)]]);
    expect(states(s)).toEqual({ squat: 'done', hinge: 'untagged', lunge: 'untagged', push: 'untagged', pull: 'untagged', carry: 'untagged' });
    expect(s.untaggedDone).toBe(1);
    expect(coverageLine(s)).toMatch(/1 exercise done this week has no pattern tag: tag it in My catalogue/);
  });

  it('a partly tagged program: a pattern it has tagged but did not do is open; the rest are untagged, not "not in program"', () => {
    const s = patternCoverage([ex('squat'), ex('pull'), ex(null)], [[ex('squat')]]);
    expect(states(s)).toEqual({ squat: 'done', hinge: 'untagged', lunge: 'untagged', push: 'untagged', pull: 'open', carry: 'untagged' });
  });

  it('only working sets count: a Prep pull-apart or a Prime squat does not tick the pattern', () => {
    const s = patternCoverage([ex('squat'), ex('pull', 'prep')], [[ex('pull', 'prep'), ex('squat', 'prime'), ex('hinge', 'cooldown')]]);
    expect(states(s)).toMatchObject({ squat: 'open', pull: 'notProgrammed', hinge: 'notProgrammed' });
  });

  it('a row stored before the P2 push has no section and reads as key, the schema default', () => {
    const s = patternCoverage([ex('lunge', null)], [[ex('lunge', null)]]);
    expect(states(s).lunge).toBe('done');
  });
});

describe('clientCoverage: from the roster route\'s rows', () => {
  const session = (id: string, patterns: (string | null)[]) => ({
    id, exercises: patterns.map((p, i) => ({ exerciseId: p ? `pe-${p}` : `pe-untagged-${i}`, sets: 3, section: 'key', exercise: { pattern: p } })),
  });
  const program = (over: Partial<CoverageProgramRow> = {}): CoverageProgramRow => ({
    id: 'p1', clientId: 'c1', isActive: true,
    blocks: [{ sessions: [session('s1', ['squat', 'push']), session('s2', ['hinge', 'pull']), session('s3', ['lunge', 'carry'])] }],
    ...over,
  });

  it('counts sessions completed in the last 7 days only, for this client only', () => {
    const s = clientCoverage([program()], [
      { clientId: 'c1', sessionId: 's1', completedAt: ago(2) },
      { clientId: 'c1', sessionId: 's2', completedAt: ago(9) },          // outside the window
      { clientId: 'c2', sessionId: 's3', completedAt: ago(1) },          // someone else
      { clientId: 'c1', sessionId: 's3', completedAt: null },            // started, not completed
    ], 'c1', NOW)!;
    expect(states(s)).toEqual({ squat: 'done', hinge: 'open', lunge: 'open', push: 'done', pull: 'open', carry: 'open' });
    expect(s.sessionsDone).toBe(1);
  });

  it('is null when this coach has no ACTIVE program for the client (their backlog, not six empty cells)', () => {
    expect(clientCoverage([program({ isActive: false })], [], 'c1', NOW)).toBeNull();
    expect(clientCoverage([program()], [], 'nobody', NOW)).toBeNull();
  });

  // MIRROR-COACH P2 review (2026-09-26): "done" is what was LOGGED, when the caller read the logs — not every exercise in
  // a session somebody tapped Done on.
  it('a completed session with only the squat logged marks Squat done and leaves Push open', () => {
    const withIds = program({ blocks: [{ sessions: [{ id: 's1', exercises: [
      { id: 'se-sq', exerciseId: 'pe-squat', sets: 3, section: 'key', exercise: { pattern: 'squat' } },
      { id: 'se-pu', exerciseId: 'pe-push', sets: 3, section: 'key', exercise: { pattern: 'push' } },
    ] }] }] });
    const logged = clientCoverage([withIds], [{ clientId: 'c1', sessionId: 's1', completedAt: ago(1), loggedExerciseIds: ['se-sq'] }], 'c1', NOW)!;
    expect(states(logged)).toMatchObject({ squat: 'done', push: 'open' });
    expect(logged.sessionsDone).toBe(1);
    // nothing logged at all: a session marked done, and no pattern claimed
    const none = clientCoverage([withIds], [{ clientId: 'c1', sessionId: 's1', completedAt: ago(1), loggedExerciseIds: [] }], 'c1', NOW)!;
    expect(states(none)).toMatchObject({ squat: 'open', push: 'open' });
    // a caller that did not read the logs (undefined) keeps the whole session, as before
    const unread = clientCoverage([withIds], [{ clientId: 'c1', sessionId: 's1', completedAt: ago(1) }], 'c1', NOW)!;
    expect(states(unread)).toMatchObject({ squat: 'done', push: 'done' });
  });

  it('a session completed in an archived program still counts as done', () => {
    const old = program({ id: 'p0', isActive: false, blocks: [{ sessions: [session('s0', ['carry'])] }] });
    const s = clientCoverage([program(), old], [{ clientId: 'c1', sessionId: 's0', completedAt: ago(1) }], 'c1', NOW)!;
    expect(states(s).carry).toBe('done');
  });

  it('counts an untagged catalogue row once, however many sessions prescribe it', () => {
    const untaggedEverywhere = program({ blocks: [{ sessions: [0, 1, 2, 3].map((i) => ({ id: `s${i}`, exercises: [{ exerciseId: 'pe-mystery', sets: 3, section: 'key', exercise: { pattern: null } }] })) }] });
    const s = clientCoverage([untaggedEverywhere], [], 'c1', NOW)!;
    expect(s.untaggedProgrammed).toBe(1);
    expect(coverageLine(s)).toMatch(/1 exercise in the program has no pattern tag/);
  });

  it('a catalogue row read before the P2 push (no pattern key at all) is untagged, not a zero', () => {
    const legacy = program({ blocks: [{ sessions: [{ id: 's1', exercises: [{ exerciseId: 'pe-goblet', sets: 3, exercise: {} }] }] }] });
    const s = clientCoverage([legacy], [{ clientId: 'c1', sessionId: 's1', completedAt: ago(1) }], 'c1', NOW)!;
    expect(new Set(s.cells.map((c) => c.state))).toEqual(new Set(['untagged']));
  });
});

describe('pullPushCheck: FEL\'s weekly pull-over-push suggestion', () => {
  it('FEL\'s defaults: at least as much pulling as pressing; 3 for every 2 with a shoulder note', () => {
    expect(PULL_PER_PUSH).toBe(1);
    expect(PULL_PER_PUSH_SHOULDER).toBe(1.5);
  });

  it('warns when pressing sets outnumber pulling sets, with the counts and what would balance them', () => {
    const c = pullPushCheck([ex('push', 'key', 4), ex('push', 'assist', 3), ex('pull', 'assist', 3), ex('squat', 'key', 5)], { label: 'Week 1' })!;
    expect(c).toMatchObject({ push: 7, pull: 3, need: 7, short: 4, untaggedSets: 0, shoulderNote: false, sure: true });
    expect(c.text).toBe("Suggestion for Week 1: 7 pressing sets and 3 pulling sets. FEL's default is at least as much pulling as pressing. Add 4 pulling sets, or trade a pressing set for a row.");
  });

  it('says nothing when pulling matches or beats pressing, or when there is no pressing', () => {
    expect(pullPushCheck([ex('push', 'key', 3), ex('pull', 'key', 3)])).toBeNull();
    expect(pullPushCheck([ex('push', 'key', 3), ex('pull', 'key', 5)])).toBeNull();
    expect(pullPushCheck([ex('pull', 'key', 3), ex('hinge', 'key', 3)])).toBeNull();
    expect(pullPushCheck([])).toBeNull();
  });

  it('is stricter with a shoulder note: 6 pressing sets want 9 pulling, so 6 pulling is now short', () => {
    const items = [ex('push', 'key', 6), ex('pull', 'key', 6)];
    expect(pullPushCheck(items)).toBeNull();
    const c = pullPushCheck(items, { shoulderNote: true, label: 'Week 2' })!;
    expect(c).toMatchObject({ push: 6, pull: 6, need: 9, short: 3, shoulderNote: true });
    expect(c.text).toMatch(/A note on this program mentions the shoulder, so FEL leans further toward pulling here: 3 pulling sets for every 2 pressing, 9 in all\. Add 3 pulling sets/);
    // rounds UP: 5 pressing × 1.5 = 7.5 → 8
    expect(pullPushCheck([ex('push', 'key', 5), ex('pull', 'key', 7)], { shoulderNote: true })!.need).toBe(8);
  });

  it('counts working sets only: a band pull-apart in Prep does not balance a heavy press, a Prime push-up is not pressing volume', () => {
    expect(pullPushCheck([ex('push', 'key', 4), ex('pull', 'prep', 6)])).toMatchObject({ push: 4, pull: 0 });
    expect(pullPushCheck([ex('push', 'prime', 4), ex('pull', 'key', 1)])).toBeNull();
    expect(pullPushCheck([ex('push', 'finish', 3), ex('pull', 'cooldown', 3)])).toMatchObject({ push: 3, pull: 0 });
  });

  it('ABSENCE IS NOT ZERO: untagged sets never raise the warning, and when they could close the gap it says so', () => {
    // all pressing untagged: nothing to say
    expect(pullPushCheck([ex(null, 'key', 9), ex('pull', 'key', 1)])).toBeNull();
    // 6 push vs 2 pull, 5 untagged sets: if 4 of them were pulls it would balance — not sure
    const unsure = pullPushCheck([ex('push', 'key', 6), ex('pull', 'key', 2), ex(null, 'assist', 5)])!;
    expect(unsure).toMatchObject({ short: 4, untaggedSets: 5, sure: false });
    expect(unsure.text).toMatch(/Counted from tagged exercises only: 5 sets here have no pattern tag\.$/);
    // 6 push vs 0 pull, 2 untagged sets: short either way — sure, and still says the count leaves them out
    const sure = pullPushCheck([ex('push', 'key', 6), ex(null, 'key', 2)])!;
    expect(sure).toMatchObject({ short: 6, untaggedSets: 2, sure: true });
    expect(sure.text).toMatch(/2 sets here have no pattern tag/);
  });

  it('reads the shoulder from a note, by the whole word', () => {
    expect(mentionsShoulder(['Felt it in my left shoulder on the last set'])).toBe(true);
    expect(mentionsShoulder([null, undefined, 'Shoulders stayed down, nice'])).toBe(true);
    // FLIPPED IN THE P2 REVIEW (2026-09-26): a stance width and the Mirror's own screen note are not a shoulder note
    expect(mentionsShoulder(['shoulder-width stance'])).toBe(false);
    expect(mentionsShoulder(['Feet shoulder width apart', 'hands shoulder-wide'])).toBe(false);
    expect(mentionsShoulder(['From the screen: shoulder level failed on the left side.'])).toBe(false);
    expect(mentionsShoulder(['shoulder-width stance; the right shoulder clicks'])).toBe(true);
    expect(mentionsShoulder(['Shoulder blades tucked on the way down'])).toBe(true);
    expect(mentionsShoulder(['Own the bottom.', null, 'Stay tall'])).toBe(false);
    expect(mentionsShoulder(['cold-shouldered'])).toBe(false);
    expect(mentionsShoulder([])).toBe(false);
  });
});

describe('every line of copy is a suggestion about sets, never a claim about a body', () => {
  it('passes the share-card claims screen, and never says "risk", "prevent", "injury" or "missed"', () => {
    const lines = [
      ...patternCoverage([ex('squat'), ex(null)], [[ex('squat'), ex(null)]]).cells.map((c) => c.note),
      ...patternCoverage([ex('squat'), ex('pull')], []).cells.map((c) => c.note),
      ...patternCoverage([ex('squat')], []).cells.map((c) => c.note),
      coverageLine(patternCoverage([ex(null)], [])),
      pullPushCheck([ex('push', 'key', 6), ex(null, 'key', 9)], { label: 'Week 1' })!.text,
      pullPushCheck([ex('push', 'key', 6), ex('pull', 'key', 6)], { shoulderNote: true, label: 'Week 1' })!.text,
    ];
    for (const l of lines) {
      expect(screenText(l), l).toEqual([]);
      expect(l, l).not.toMatch(/risk|prevent|injur|missed|health|pain|diagnos/i);
    }
  });
});
