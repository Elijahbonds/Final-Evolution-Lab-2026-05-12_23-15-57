import { describe, expect, it } from 'vitest';
import type { JumpRecord } from '@/lib/jump/seam';
import { EMPTY_ACTIVITY, type Activity } from './activity';
import { buildFeed, isReactionKey, reactionDedupe } from './feed';
import { REACTIONS, type GroupAct, type MemberFacts } from './types';

const NOW = Date.parse('2026-10-28T19:00:00Z');
const WEEK = '2026-10-26';
const at = (day: string) => Date.parse(`${day}T19:00:00Z`);
const member = (userId: string, o: Partial<MemberFacts> = {}): MemberFacts => ({
  groupId: 'g1', userId, role: 'member', shareMeasured: false, joinedAt: 0, name: userId[0].toUpperCase() + userId.slice(1), band: 'adult', canSaveScan: false, onRoster: true, ...o,
});
const act = (o: Partial<GroupAct>): GroupAct => ({ id: 'x', kind: 'reaction', dedupeKey: 'k', fromUserId: null, toUserId: null, ref: null, preset: null, points: null, createdAt: NOW, ...o });
const jr = (heightCm: number, verified: boolean): JumpRecord => ({ type: 'cmj', heightCm, plusMinusCm: 1, verified, blocks: verified ? [] : ['frameRate'], source: 'live', fps: 60, trust: null, rsi: null });

const ms = [member('ada', { canSaveScan: true, shareMeasured: true }), member('tess', { band: 'teen', canSaveScan: true, shareMeasured: true }), member('uno', { band: 'unknown' })];
const raw: Activity = {
  ...EMPTY_ACTIVITY,
  drillDays: { ada: ['2026-10-28'], tess: ['2026-10-27'], uno: ['2026-10-10'] },
  prs: [
    { userId: 'ada', mode: 'threepoint', modeName: '3-Point', score: 31, previous: 28, at: at('2026-10-27') },
    { userId: 'tess', mode: 'threepoint', modeName: '3-Point', score: 999, previous: 1, at: at('2026-10-27') },
    { userId: 'uno', mode: 'threepoint', modeName: '3-Point', score: 777, previous: 1, at: at('2026-10-27') },
  ],
  reps: [{ userId: 'ada', id: 'r1', patternId: 'squat', reps: 12, at: at('2026-10-27') }, { userId: 'tess', id: 'r2', patternId: 'squat', reps: 66, at: at('2026-10-27') }],
  jumps: [
    { userId: 'ada', id: 'j1', record: jr(50, true), at: at('2026-10-27') },
    { userId: 'ada', id: 'j2', record: jr(80, false), at: at('2026-10-27') },
    { userId: 'tess', id: 'j3', record: jr(55, true), at: at('2026-10-27') },
  ],
  challenges: [{ code: 'C1', ownerUserId: 'ada', modeName: '3-Point', score: 31, at: at('2026-10-27') }, { code: 'C2', ownerUserId: 'tess', modeName: 'Dunk', score: 4444, at: at('2026-10-27') }],
};
const acts: GroupAct[] = [
  act({ kind: 'challenge', fromUserId: 'ada', ref: 'C1', createdAt: at('2026-10-27') }),
  act({ kind: 'challenge', fromUserId: 'tess', ref: 'C2', createdAt: at('2026-10-27') }),
  act({ kind: 'trophy', preset: 'league_winner', toUserId: 'tess', ref: '2026-10-19', points: 40, createdAt: at('2026-10-26') }),
  act({ kind: 'reaction', fromUserId: 'tess', ref: 'drill:ada:2026-10-28', preset: 'fire' }),
  act({ kind: 'reaction', fromUserId: 'ada', ref: 'drill:ada:2026-10-28', preset: 'fire' }),
  act({ kind: 'reaction', fromUserId: 'stranger', ref: 'drill:ada:2026-10-28', preset: 'clap' }),
  act({ kind: 'reaction', fromUserId: 'tess', ref: 'drill:ada:2026-10-28', preset: 'heart-eyes' }),
];
const feed = buildFeed(ms, raw, acts, 'ada', WEEK);
const lines = feed.map((f) => f.line);

describe('the teen-safe feed', () => {
  it('shows drills, an adult\'s PR, shared reps, VERIFIED jumps, challenges and the trophy — newest first, this week and last', () => {
    expect(lines).toEqual([
      'Ada did the daily drill',
      'Tess did the daily drill', // a drill is dated midday PT (20:00Z), the rest of Oct 27 at 19:00Z, ties by key
      'Ada posted a challenge in 3-Point: beat 31',
      'Tess posted a challenge in Dunk',
      'Ada verified a 19.7 in jump',
      'Ada set a new best in 3-Point: 31',
      'Ada logged 12 squat reps',
      'Tess won the week (40 pts)',
    ]);
  });

  it('minors are never exposed: no teen or unknown-age score, rep count, jump or challenge score, whatever the rows say', () => {
    const all = JSON.stringify(feed);
    for (const n of ['999', '777', '66 ', '55', '4444', '21.7']) expect(all).not.toContain(n);
    expect(lines.filter((l) => l.startsWith('Tess') || l.startsWith('Uno'))).toEqual(['Tess did the daily drill', 'Tess posted a challenge in Dunk', 'Tess won the week (40 pts)']);
  });

  it('an unverified jump never appears, even the higher one', () => {
    expect(lines.join('\n')).not.toContain('31.5 in');
  });

  it('reactions only: preset keys counted per item, a member\'s own marked; strangers and unknown keys ignored', () => {
    const item = feed.find((f) => f.key === 'drill:ada:2026-10-28')!;
    expect(item.reactions.map((r) => [r.key, r.count, r.mine])).toEqual([['fire', 2, true], ['clap', 0, false], ['strong', 0, false], ['hundred', 0, false], ['goat', 0, false]]);
    expect(Object.keys(REACTIONS)).toEqual(['fire', 'clap', 'strong', 'hundred', 'goat']);
    expect(isReactionKey('fire')).toBe(true);
    expect(isReactionKey('nice job!')).toBe(false);
    expect(reactionDedupe('drill:ada:2026-10-28', 'tess', 'fire')).toBe('reaction:drill:ada:2026-10-28:tess:fire');
  });

  it('no item carries anything a member typed: every line is a template over a first name, a mode name and a number', () => {
    for (const f of feed) expect(f.line).toMatch(/^(Ada|Tess|Uno) (did|set|logged|verified|posted|won)\b/);
    expect(feed.every((f) => f.href === null || f.href.startsWith('/c/'))).toBe(true);
  });
});
