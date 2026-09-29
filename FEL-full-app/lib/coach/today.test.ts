// Today's read model (MIRROR-COACH P2, 2026-09-25): a prescribed exercise plus its catalogue row becomes the card's
// coaching in words, read defensively; the session lays out by section with supersets grouped.
import { describe, expect, it } from 'vitest';
import { screenText } from '@/lib/share/screen';
import { treeExercise, type TreeExercise } from './loop';
import {
  CATALOGUE_COACHING_SELECT, KEY_SET_LINE, NOTE_PROMPT, demoMedia, easierLine, faultsFrom, repsPlaceholder, simpleLogging, supersetHint, todayExercise, todayLayout, variationIds,
} from './today';
import { SESSION_SECTIONS } from './taxonomy';

const tree = (over: Record<string, unknown> = {}): TreeExercise => treeExercise({
  id: 'se1', order: 1, exerciseId: 'pe-goblet', sets: 3, reps: '8-10', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90, coachNote: null,
  exercise: { name: 'Goblet Squat' }, ...over,
});
const FULL = {
  name: 'Goblet Squat', category: 'lower-body', primaryCues: ['Elbows inside the knees', 'Spread the floor', 'Chest proud', 'a fourth cue an old row kept'],
  commonFaults: [{ fault: 'Knees drift in', correctionCue: 'Push the knees out over the toes' }, { fault: 'Heels lift' }],
  demoVideoUrl: 'https://youtu.be/q1HLjLbhS2s', equipment: ['kettlebell'], pattern: 'squat', braceMode: 'set', skillLayer: 'strength',
  regressionOfId: 'pe-box', progressionOfId: 'pe-front',
};

describe('the catalogue columns the tree now selects', () => {
  it('are the coaching columns, not just name and category (the P1 baseline measured name + category only)', () => {
    expect(Object.keys(CATALOGUE_COACHING_SELECT).sort()).toEqual(['braceMode', 'category', 'commonFaults', 'demoVideoUrl', 'equipment', 'name', 'pattern', 'primaryCues', 'progressionOfId', 'regressionOfId', 'skillLayer']);
  });
});

describe('one exercise, with its coaching', () => {
  it('a fully written catalogue row reaches the card: cues, faults as fault → fix, the demo, the easier version by name, the tags', () => {
    const names = new Map([['pe-box', 'Box Squat'], ['pe-front', 'Front Squat']]);
    const e = todayExercise(tree({ section: 'key', isKeySet: true, effortBand: 'drive', setupCues: ['tripod-down', 'nonsense-id'], workSeconds: null }), FULL, names);
    expect(e.coaching.cues).toEqual(['Elbows inside the knees', 'Spread the floor', 'Chest proud']);   // three, the catalogue's limit
    expect(e.coaching.faults).toEqual([{ fault: 'Knees drift in', fix: 'Push the knees out over the toes' }, { fault: 'Heels lift', fix: null }]);
    expect(e.coaching.demo).toEqual({ kind: 'youtube', src: 'https://www.youtube-nocookie.com/embed/q1HLjLbhS2s?rel=0', href: 'https://youtu.be/q1HLjLbhS2s' });
    expect(e.coaching.easier).toEqual({ id: 'pe-box', name: 'Box Squat' });
    expect(e.coaching.harder).toEqual({ id: 'pe-front', name: 'Front Squat' });
    expect(e.coaching.pattern).toEqual({ id: 'squat', label: 'Squat' });
    expect(e.coaching.brace).toMatchObject({ id: 'set', label: 'Set brace' });
    expect(e.coaching.equipment).toEqual(['kettlebell']);
    // the coach's set-up picks as words; an id the list does not know is dropped, not shown raw
    expect(e.coaching.setup).toEqual([{ id: 'tripod-down', text: 'Heel, big toe, little toe: press all three into the floor.' }]);
    expect(e.coaching.band).toMatchObject({ id: 'drive', label: 'Drive', rir: '3–4 left' });
    expect(e.dose).toBe('3 × 8-10 @ RPE7 · Drive');
    expect(e.timers).toEqual([{ kind: 'rest', seconds: 90, label: 'Rest 1:30' }]);
    // the prescription fields every older reader uses are all still there (the /training step-through reads them)
    expect(e).toMatchObject({ id: 'se1', name: 'Goblet Squat', sets: 3, reps: '8-10', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90, isKeySet: true, section: 'key' });
  });

  it('a variation link resolves only through the names it is given (the program coach\'s own rows) — never a raw id', () => {
    const e = todayExercise(tree(), { ...FULL, regressionOfId: 'pe-theirs' }, new Map([['pe-front', 'Front Squat']]));
    expect(e.coaching.easier).toBeNull();
    expect(JSON.stringify(e)).not.toContain('pe-theirs');
  });

  it('an empty or missing catalogue row, or junk in its columns, reads as no coaching — never a crash', () => {
    const bare = todayExercise(tree(), null, new Map());
    expect(bare.coaching).toEqual({ cues: [], faults: [], demo: null, easier: null, harder: null, pattern: null, brace: null, equipment: [], setup: [], band: null });
    const junk = todayExercise(tree(), { primaryCues: 'one long string', commonFaults: { fault: 'not an array' }, demoVideoUrl: 42, pattern: 'twist', braceMode: 'hard', equipment: [3, null, 'band'], regressionOfId: 7 }, new Map());
    expect(junk.coaching).toMatchObject({ cues: [], faults: [], demo: null, pattern: null, brace: null, equipment: ['band'], easier: null });
  });

  it('a timed item carries its work and hold timers, work first', () => {
    const e = todayExercise(tree({ workSeconds: 30, holdSeconds: 5, restSeconds: 60 }), FULL, new Map());
    expect(e.timers.map((t) => `${t.kind}:${t.seconds}`)).toEqual(['work:30', 'hold:5', 'rest:60']);
    expect(e.dose).toBe('3 × 30 s @ RPE7 · hold 5 s');
  });

  it('variationIds lists each linked id once', () => {
    expect(variationIds([FULL, { regressionOfId: 'pe-box' }, null, { progressionOfId: '' }]).sort()).toEqual(['pe-box', 'pe-front']);
  });
});

describe('the logging form\'s cues from the prescription', () => {
  it('the reps placeholder is the prescription when it fits a small box, else its leading number or range', () => {
    expect(repsPlaceholder('8-10')).toBe('8-10');
    expect(repsPlaceholder(' 5 ')).toBe('5');
    expect(repsPlaceholder('6 each side')).toBe('6');
    expect(repsPlaceholder('10 - 12 each')).toBe('10-12');
    expect(repsPlaceholder('max clean reps')).toBe('');
  });

  it('breath and mobility items log reps or seconds only; everything else (and an untagged row) gets the full set row', () => {
    const withPattern = (pattern: string | null) => todayExercise(tree(), { pattern }, new Map());
    expect(simpleLogging(withPattern('breath'))).toBe(true);
    expect(simpleLogging(withPattern('mobility'))).toBe(true);
    for (const p of ['squat', 'carry', 'locomotion', null]) expect(simpleLogging(withPattern(p))).toBe(false);
  });
});

describe('faults and demos, read defensively', () => {
  it('faultsFrom keeps { fault } rows, trims them, and caps at six', () => {
    expect(faultsFrom(null)).toEqual([]);
    expect(faultsFrom('Knees drift in')).toEqual([]);
    expect(faultsFrom([{ fault: '  Knees   in ', correctionCue: '  ' }, { correctionCue: 'orphan fix' }, 'x', null, { fault: 3 }])).toEqual([{ fault: 'Knees in', fix: null }]);
    expect(faultsFrom(Array.from({ length: 9 }, (_, i) => ({ fault: `f${i}` })))).toHaveLength(6);
  });

  it('demoMedia: YouTube plays in an embed, a video file in <video>, other http(s) is a link, anything else is nothing', () => {
    expect(demoMedia('https://www.youtube.com/watch?v=q1HLjLbhS2s&t=3')).toMatchObject({ kind: 'youtube', src: 'https://www.youtube-nocookie.com/embed/q1HLjLbhS2s?rel=0' });
    expect(demoMedia('https://m.youtube.com/shorts/q1HLjLbhS2s')).toMatchObject({ kind: 'youtube' });
    expect(demoMedia('https://youtube.com/embed/q1HLjLbhS2s')).toMatchObject({ kind: 'youtube' });
    expect(demoMedia('https://fel.local/v/split-squat.mp4')).toEqual({ kind: 'file', src: 'https://fel.local/v/split-squat.mp4', href: 'https://fel.local/v/split-squat.mp4' });
    expect(demoMedia('https://vimeo.com/12345')).toEqual({ kind: 'link', href: 'https://vimeo.com/12345' });
    expect(demoMedia('https://www.youtube.com/watch')).toEqual({ kind: 'link', href: 'https://www.youtube.com/watch' });
    for (const bad of ['javascript:alert(1)', 'ftp://x/y.mp4', 'youtu.be/abc', '', null, 42]) expect(demoMedia(bad)).toBeNull();
  });
});

describe('the layout: sections in running order, supersets together', () => {
  const item = (id: string, order: number, section: string, supersetGroup: string | null = null) => ({ id, order, section, supersetGroup, isKeySet: false });

  it('sections run Prep → Cool-down whatever order they were added, empty ones left out, each with its meaning', () => {
    const l = todayLayout([item('c', 1, 'cooldown'), item('k', 1, 'key'), item('p', 1, 'prep')]);
    expect(l.map((s) => s.section)).toEqual(['prep', 'key', 'cooldown']);
    expect(l[0].meaning).toBe(SESSION_SECTIONS[0].meaning);
    expect(l.map((s) => s.label)).toEqual(['Prep', 'Key', 'Cool-down']);
  });

  it('adjacent superset members are one block labelled A1/A2; a lone letter is a plain exercise', () => {
    const l = todayLayout([item('a1', 1, 'assist', 'A'), item('a2', 2, 'assist', 'A'), item('solo', 3, 'assist'), item('b1', 4, 'assist', 'B')]);
    const blocks = l[0].blocks;
    expect(blocks[0]).toMatchObject({ kind: 'superset', group: 'A' });
    expect(blocks[0].kind === 'superset' && blocks[0].items.map((x) => `${x.label}:${x.item.id}`)).toEqual(['A1:a1', 'A2:a2']);
    expect(blocks[1]).toMatchObject({ kind: 'single', label: null });
    expect(blocks[2]).toMatchObject({ kind: 'single', label: null });   // B has one member: no "B1" on its own
  });

  it('a superset split by another exercise shows each member on its own, still labelled so the client can pair them', () => {
    const l = todayLayout([item('a1', 1, 'assist', 'A'), item('x', 2, 'assist'), item('a2', 3, 'assist', 'A')]);
    expect(l[0].blocks.map((b) => (b.kind === 'single' ? `${b.label}:${b.item.id}` : 'superset'))).toEqual(['A1:a1', 'null:x', 'A2:a2']);
  });

  it('the old flat session (every row the schema default) is one Key section in stored order', () => {
    const l = todayLayout([item('two', 2, 'key'), item('one', 1, 'key')]);
    expect(l).toHaveLength(1);
    expect(l[0].blocks.map((b) => (b.kind === 'single' ? b.item.id : ''))).toEqual(['one', 'two']);
  });
});

describe('FEL\'s copy rules hold for what Today says', () => {
  it('no claims, no injury or risk language; the note stays a plain prompt to the coach', () => {
    const copy = [easierLine('Box Squat'), NOTE_PROMPT, KEY_SET_LINE, supersetHint(['A1', 'A2']), ...SESSION_SECTIONS.map((s) => s.meaning)];
    expect(copy.map((t) => ({ t, flags: screenText(t) })).filter((x) => x.flags.length)).toEqual([]);
    for (const t of copy) expect(t).not.toMatch(/injur|prevent|reduc\w* risk|safe|diagnos|heal|cure|treat|rehab/i);
    expect(supersetHint(['A1', 'A2'])).toBe('Alternate A1 and A2, set for set. Rest after each round.');
  });
});

// MIRROR-COACH P2 review (2026-09-26), owner decisions #6 and #20: a client under youth rules (under 18, or no birth
// year) reads no adults-only band and no max-effort cue on Today, even from a row saved before the builder's gate.
describe('youth rules on the client\'s card', () => {
  it('Full throttle is dropped (and its dose words with it); an all-out catalogue cue is left off; youth-allowed bands stay', async () => {
    const { todayExercise } = await import('./today');
    const { youthRules, bandAllowed, MAX_EFFORT_CUE, EFFORT_BANDS } = await import('./taxonomy');
    const { effortOptions } = await import('./setLog');
    const base = { id: 'se', order: 1, exerciseId: 'pe-iso', name: 'Wall press', sets: 3, reps: '1', load: '', tempo: '0-0-0-0', restSeconds: 60, coachNote: null,
      section: 'key' as const, isKeySet: false, supersetGroup: null, workSeconds: 5, holdSeconds: null, setupCues: [], effortBand: 'full' };
    const row = { primaryCues: ['Push all-out against something that will not move, for 5 seconds', 'Brace, and keep breathing behind the brace', 'Go straight in from the bounce work, no rest'] };
    const kid = todayExercise(base, row, new Map(), { youth: true });
    expect([kid.effortBand, kid.coaching.band, kid.dose, kid.youthRules]).toEqual([null, null, '3 × 5 s', true]);
    expect(kid.coaching.cues).toEqual(['Brace, and keep breathing behind the brace', 'Go straight in from the bounce work, no rest']);
    const adult = todayExercise(base, row, new Map());
    expect([adult.effortBand, adult.coaching.band?.label, adult.coaching.cues.length, adult.youthRules]).toEqual(['full', 'Full throttle', 3, undefined]);
    expect(todayExercise({ ...base, effortBand: 'surge' }, row, new Map(), { youth: true }).coaching.band?.label).toBe('Surge');
    // the rule: no birth year or under 18 (a year 18 back may still be 17); the youth-allowed bands say nothing maximal
    const now = new Date('2026-09-26T12:00:00Z');
    expect([null, undefined, 2011, 2008, 2007, 1990].map((y) => youthRules(y as number | null, now))).toEqual([true, true, true, true, false, false]);
    expect([bandAllowed('full', true), bandAllowed('full', false), bandAllowed('surge', true), bandAllowed(null, true)]).toEqual([false, true, true, true]);
    for (const b of EFFORT_BANDS.filter((x) => x.youthAllowed)) expect(`${b.meaning}`, b.id).not.toMatch(/full brace|max(imal|imum)?\b|all[- ]out|everything you have/i);
    expect(MAX_EFFORT_CUE.test('Straight into a 5-second all-out push, no rest')).toBe(true);
    // the set logger: a youth client reports a 10 as a number, with no adults-only band named
    expect(effortOptions(true)[9].label).toBe('10');
    expect(effortOptions(false)[9].label).toBe('10 · Full throttle');
    expect(effortOptions(true)[7].label).toBe('8 · Surge');
  });

  it('youthRules agrees with the /workout plan revision\'s planAudience (one rule, two places)', async () => {
    const { youthRules } = await import('./taxonomy');
    const { planAudience } = await import('../workout/plan-revision');
    const now = new Date('2026-09-26T12:00:00Z');
    for (const y of [null, 1899, 1950, 2000, 2007, 2008, 2009, 2020]) expect(youthRules(y, now), String(y)).toBe(planAudience(y, now) === 'youth');
  });
});
