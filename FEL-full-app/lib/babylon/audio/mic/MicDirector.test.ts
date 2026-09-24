// THE MIC (2026-09-24): the director — who says what, and when (the pure half; VoiceKit plays it).
import { describe, it, expect } from 'vitest';
import { MicDirector, momentChain, priorityOf, type CastScript, type MicLine } from './MicDirector';

const L = (id: string, moment: string, text: string, extra: Partial<MicLine> = {}): MicLine => ({ id, moment, text, sec: 1, ...extra });
const mc: CastScript = {
  cast: 'boardwalk', role: 'mc', name: 'BOARDWALK', lines: [
    L('m0', 'dunk.make', 'He gets it down.', { tier: 0 }),
    L('m1', 'dunk.make', 'Oh, come on!', { tier: 2 }),
    L('m2', 'dunk.make', 'Are you serious?', { tier: 2 }),
    L('m3', 'dunk.make', 'Look at that!', { tier: 2 }),
    L('r1', 'dunk.rival.make', 'Cass does it again.', { tags: ['rival:cass'] }),
    L('r2', 'dunk.rival.make', 'The rival answers.'),
    L('g1', 'game', 'Bucket.'),
    L('f1', 'filler.banter', 'Taco stand is open, people.', { sec: 2 }),
    L('n1', 'name', 'The windmill!', { tags: ['name:dunk:windmill'], sec: 0.8 }),
    L('j1', 'dunk.judges', 'Judges?', { sec: 0.5 }),
  ],
};
const side: CastScript = { cast: 'scoop', role: 'side', name: 'SCOOP', lines: [L('s1', 'dunk.make', 'Put that on a shirt!', { tier: 2 }), L('s2', 'filler.banter', 'I got a stat for you.')] };
const crowd = (id: string): CastScript => ({ cast: id, role: 'crowd', name: 'THE CROWD', lines: [L(`${id}-1`, 'crowd.erupt', 'No way!', { sec: 0.6 }), L(`${id}-2`, 'crowd.erupt', 'Sheesh!', { sec: 0.6 })] });
const cass: CastScript = { cast: 'cass', role: 'player', name: 'CASS', lines: [L('c1', 'player.dunk.brag', 'Told you. Every time.')] };

const make = (seed = 7) => new MicDirector({
  scripts: [mc, side, crowd('crowd_a'), crowd('crowd_b'), crowd('crowd_c'), crowd('crowd_d'), cass],
  booth: { mc: 'boardwalk', side: 'scoop' }, crowd: ['crowd_a', 'crowd_b', 'crowd_c', 'crowd_d'], players: { cass: 'cass' }, seed,
});

describe('picking a line', () => {
  it('a specific moment falls back to its family ("game.three" → "game")', () => {
    expect(momentChain('game.three.corner')).toEqual(['game.three.corner', 'game.three', 'game']);
    expect(make().pick('boardwalk', { moment: 'game.three' })?.id).toBe('g1');
  });
  it('the size picks the tier; a size with no lines falls back to the nearest smaller one', () => {
    const d = make();
    expect(['m1', 'm2', 'm3']).toContain(d.pick('boardwalk', { moment: 'dunk.make', tier: 2 })?.id);
    expect(d.pick('boardwalk', { moment: 'dunk.make', tier: 1 })?.id).toBe('m0');
  });
  it('a line about Cass only plays when the moment is about Cass, and is preferred then', () => {
    const d = make();
    for (let i = 0; i < 6; i++) expect(d.pick('boardwalk', { moment: 'dunk.rival.make', tags: ['rival:ty'] })?.id).toBe('r2');
    const withCass = Array.from({ length: 12 }, () => d.pick('boardwalk', { moment: 'dunk.rival.make', tags: ['rival:cass'] })?.id);
    expect(withCass).toContain('r1');
  });
  it('no line repeats until the pool has gone round', () => {
    const d = make();
    const ids = Array.from({ length: 3 }, () => d.pick('boardwalk', { moment: 'dunk.make', tier: 2 })!.id);
    expect(new Set(ids).size).toBe(3);
  });
  it('a prefetched line is the line that is then said (its clip was decoded for it)', () => {
    const d = make();
    const ids = d.prefetch({ moment: 'dunk.make', tier: 2, stinger: ['dunk:windmill'] });
    const [cue] = d.hear({ moment: 'dunk.make', tier: 2, stinger: ['dunk:windmill'] }, 0);
    expect(cue.clips).toEqual(ids);
  });
  it('priority: filler < an ordinary call < a good one < a huge one', () => {
    expect(priorityOf({ moment: 'filler.banter' })).toBe(0);
    expect(priorityOf({ moment: 'game.make' })).toBe(1);
    expect(priorityOf({ moment: 'dunk.make', tier: 2 })).toBe(3);
  });
});

describe('the booth: one mic', () => {
  it('the dunk\'s name follows the call, in the same cue, by the same voice', () => {
    const [cue] = make().hear({ moment: 'dunk.make', tier: 2, stinger: ['dunk:windmill'] }, 0);
    expect(cue.cast).toBe('boardwalk'); expect(cue.clips).toHaveLength(2);
    expect(cue.clips[1]).toBe('boardwalk/n1'); expect(cue.caption).toMatch(/The windmill!$/);
    expect(cue.sec).toBeGreaterThan(1.7);
  });
  it('a smaller call while the MC talks is let go; a bigger one cuts in', () => {
    const d = make();
    expect(d.hear({ moment: 'dunk.make', tier: 0 }, 0)).toHaveLength(1);
    expect(d.hear({ moment: 'filler.banter' }, 0.2)).toHaveLength(0);
    const [big] = d.hear({ moment: 'dunk.make', tier: 2 }, 0.3);
    expect(big.interrupt).toBe(true);
  });
  it('an equal call waits for the mic (briefly), then goes', () => {
    const d = make();
    d.hear({ moment: 'dunk.make', tier: 2 }, 0);
    expect(d.hear({ moment: 'dunk.make', tier: 2 }, 0.5)).toHaveLength(0);
    expect(d.tick(0.6)).toHaveLength(0);
    const later = d.tick(1.3);
    expect(later).toHaveLength(1); expect(later[0].interrupt).toBe(false);
  });
  it('the sidekick answers after the MC, never over him', () => {
    const d = make();
    const [call] = d.hear({ moment: 'dunk.make', tier: 2, side: 1 }, 0);
    expect(call.cast).toBe('boardwalk');
    expect(d.tick(call.sec - 0.1)).toHaveLength(0);
    const [answer] = d.tick(call.sec + 0.25);
    expect(answer.cast).toBe('scoop'); expect(answer.channel).toBe('booth');
  });
  it('quiet air gets filled; live play (filler off) does not', () => {
    const d = make();
    d.setFiller('filler.banter', 0, [2, 2]);
    expect(d.tick(1)).toHaveLength(0);
    const f = d.tick(2.1);
    expect(f).toHaveLength(1); expect(['boardwalk', 'scoop']).toContain(f[0].cast);
    d.setFiller(null, 3);
    expect(d.tick(30)).toHaveLength(0);
  });
  it('hush frees the mic at once', () => {
    const d = make();
    d.hear({ moment: 'dunk.make', tier: 2 }, 0);
    d.hush(0.1);
    expect(d.hear({ moment: 'dunk.make', tier: 0 }, 0.2)).toHaveLength(1);
  });
});

describe('the crowd and the players', () => {
  it('the stands react under the call: several voices at once, spread left to right, never more than three', () => {
    const d = make();
    const cues = d.hear({ moment: 'dunk.make', tier: 2, crowd: { moment: 'crowd.erupt', n: 5 } }, 0);
    const shouts = cues.filter((c) => c.channel === 'crowd');
    expect(shouts.length).toBe(3);
    expect(new Set(shouts.map((c) => c.cast)).size).toBe(3);
    for (const s of shouts) { expect(Math.abs(s.pan)).toBeLessThanOrEqual(0.8); expect(s.gain).toBeLessThan(1); }
  });
  it('a player speaks in his own voice, one line at a time', () => {
    const d = make();
    const [c] = d.hear({ moment: 'player.dunk.brag', who: 'cass' }, 0);
    expect(c.cast).toBe('cass'); expect(c.channel).toBe('player'); expect(c.speaker).toBe('CASS');
    expect(d.hear({ moment: 'player.dunk.brag', who: 'cass' }, 0.5)).toHaveLength(0);
    expect(d.hear({ moment: 'player.dunk.brag', who: 'nobody' }, 5)).toHaveLength(0);
  });
  it('the coach reads a jump in its own voice: the line, then its own number and unit ("You got up… twenty-four. Inches.")', () => {
    const coach: CastScript = { cast: 'coach', role: 'coach', name: 'COACH', lines: [
      L('j1', 'coach.jump.height', 'You got up…', { sec: 0.8 }),
      L('n24', 'name', 'Twenty-four', { tags: ['name:num:24'], sec: 0.6 }), L('in', 'name', 'Inches.', { tags: ['name:unit:in'], sec: 0.5 }),
    ] };
    const d = new MicDirector({ scripts: [mc, coach], booth: { mc: 'boardwalk' }, players: { coach: 'coach' } });
    const [c] = d.hear({ moment: 'coach.jump.height', who: 'coach', stinger: ['num:24', 'unit:in'] }, 0);
    expect(c.role).toBe('coach'); expect(c.speaker).toBe('COACH');
    expect(c.clips).toEqual(['coach/j1', 'coach/n24', 'coach/in']);
    expect(c.caption).toBe('You got up… Twenty-four Inches.');
  });
  it('while the booth holds (a dunk in the air) the crowd still reacts on its own', () => {
    expect(make().crowd('crowd.erupt', 2, 0).length).toBe(2);
  });
});
