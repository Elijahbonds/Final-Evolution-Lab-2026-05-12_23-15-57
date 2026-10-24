import { describe, it, expect } from 'vitest';
import { recordCheckValues } from '@/lib/mirror/baselines';
import { assembleProfile, jumpCmOf, rivalOf, vsLine, type ProfileRows } from './assemble';

const now = new Date('2026-10-24T12:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
const LIVE = { scope: 'jump_numbers', granted: true, revokedAt: null };

function rows(over: Partial<ProfileRows> = {}): ProfileRows {
  return {
    user: { name: 'Jordan', dobYear: 1990, createdAt: day(200) },
    profile: { xp: 0, streakDays: 0, avatarKey: null, cosmeticAssetId: null },
    optIn: null, prqEntries: [], mastery: [], jumpScans: [], mirrorSessions: [], bests: [], recentScores: [], playedAt: [],
    matches: [], links: { count: 0, opened: 0, attempted: 0, beaten: 0 }, card: null, coaches: [], credentials: [], triumphs: [],
    ...over,
  };
}
const tile = (d: ReturnType<typeof assembleProfile>, k: string) => d.tiles.find((t) => t.key === k)!;

describe('a brand-new account: no fake numbers anywhere', () => {
  const d = assembleProfile('u1', rows(), now);
  it('PRQ is "—", not the seeded profile number', () => {
    expect(d.prq.score).toBeNull();
    expect(d.prq.label).toBe('PRQ —');
  });
  it('every tile is empty and says how to get its number', () => {
    for (const t of d.tiles) {
      expect(t.value).toBeNull();
      expect(t.empty?.text).toBeTruthy();
    }
    expect(tile(d, 'jump').empty?.href).toBe('/account');          // an adult who has not opted in
    expect(tile(d, 'reaction').empty?.text).toMatch(/Not tracked yet/);
    expect(tile(d, 'streak').empty?.cta).toBe('Play now');
  });
  it('no charts, no bests, no opponents', () => {
    expect(d.stats.jumpWeeks).toBeNull();
    expect(d.stats.formWeeks).toBeNull();
    expect(d.stats.modes).toEqual([]);
    expect(d.squad.rival).toBeNull();
  });
});

describe('an opted-in adult with a measured fortnight', () => {
  const d = assembleProfile('u1', rows({
    optIn: LIVE,
    profile: { xp: 5000, streakDays: 4, avatarKey: 'male-athletic', cosmeticAssetId: null },
    jumpScans: [
      { kind: 'dunk', metrics: { verticalCm: 66.04 }, createdAt: day(1) },          // 26.0 in
      { kind: 'rescreen', metrics: { jumpBestIn: 24.5 }, createdAt: day(9) },
      { kind: 'jump', metrics: { reads: { heightCm: 999 } }, createdAt: day(2) },   // a misread: ignored
    ],
    mirrorSessions: [
      { patternId: 'squat', reps: 8, faultCounts: recordCheckValues({}, { cleanShare: 0.875 }), createdAt: day(2) },
      { patternId: 'squat', reps: 8, faultCounts: recordCheckValues({}, { cleanShare: 0.5 }), createdAt: day(10) },
    ],
    bests: [{ mode: 'dunkContest', best: 9100, runs: 12 }],
    recentScores: [{ mode: 'dunkContest', score: 9100, createdAt: day(1) }],
    playedAt: [day(1), day(2), day(9)],
    prqEntries: [{ id: 'e', attribute: 'power', value: 62, unit: 'score', source: 'camera', measuredAt: day(1) }],
  }), now);
  it('jump: this week vs last, in inches, with an up arrow', () => {
    expect(tile(d, 'jump')).toMatchObject({ value: '26.0', source: 'account', vsLine: '+1.5 in vs last week' });
    expect(tile(d, 'jump').compare?.trend).toBe('better');
  });
  it('form: clean-rep %, up 38 points', () => {
    expect(tile(d, 'form')).toMatchObject({ value: '88', source: 'account', vsLine: '+38 pts vs last week' });
  });
  it('streak: the profile number, with days played this week vs last', () => {
    expect(tile(d, 'streak')).toMatchObject({ value: '4', vsLine: '2 days played this week · up on last week' });
  });
  it('PRQ is the measured one', () => expect(d.prq.label).toBe('PRQ 62'));
  it('bests come from the account, with an 8-week line', () => {
    expect(d.stats.bestsScope).toBe('account');
    expect(d.stats.modes[0]).toMatchObject({ mode: 'dunkContest', name: 'Flight Night', best: 9100, runs: 12 });
    expect(d.stats.modes[0].weeks).toHaveLength(8);
    expect(d.stats.jumpBestIn).toBe(26);
  });
});

describe('a teen: teen-safe whatever rows arrive', () => {
  const d = assembleProfile('u1', rows({
    user: { name: 'Sam', dobYear: 2011, createdAt: day(30) }, optIn: LIVE,
    // rows the query gate would never return; if they ever did, the JS gate still drops them
    jumpScans: [{ kind: 'dunk', metrics: { verticalCm: 50 }, createdAt: day(1) }],
    mirrorSessions: [{ patternId: 'squat', reps: 8, faultCounts: recordCheckValues({}, { cleanShare: 1 }), createdAt: day(1) }],
    bests: [{ mode: 'dunkContest', best: 5, runs: 1 }],
    recentScores: [{ mode: 'dunkContest', score: 5, createdAt: day(1) }],
    card: { slug: 'sam', published: true, displayName: 'Sam', highlights: [] },
  }), now);
  it('no saved jump or form on the account; form reads from the phone', () => {
    expect(tile(d, 'jump').value).toBeNull();
    expect(tile(d, 'jump').empty?.text).toMatch(/adults who opt in/);
    expect(tile(d, 'form').source).toBe('device');
    expect(d.stats.jumpWeeks).toBeNull();
  });
  it('bests stay on the device', () => {
    expect(d.stats.bestsScope).toBe('device');
    expect(d.stats.modes).toEqual([]);
  });
  it('never public, even with a published card flag', () => {
    expect(d.privacy).toMatchObject({ minorOrUnknown: true, visibility: 'friends' });
  });
});

describe('pieces', () => {
  it('jumpCmOf reads each kind and refuses a misread', () => {
    expect(jumpCmOf('prove_it', { verticalCm: 70 })).toBe(70);
    expect(jumpCmOf('rescreen', { jumpBestIn: 10 })).toBeCloseTo(25.4);
    expect(jumpCmOf('jump', { reads: { heightCm: 40 } })).toBe(40);
    expect(jumpCmOf('jump', { reads: { heightCm: null } })).toBeNull();
    expect(jumpCmOf('dunk', { verticalCm: 0 })).toBeNull();
    expect(jumpCmOf('screen', { verticalCm: 50 })).toBeNull();
  });
  it('vsLine says when there is nothing to compare', () => {
    expect(vsLine({ thisWeek: 5, lastWeek: null, delta: null, trend: null, direction: null }, String, 'in')).toBe('Nothing last week to compare');
    expect(vsLine({ thisWeek: null, lastWeek: 4, delta: null, trend: null, direction: null }, String, 'in')).toBeNull();
  });
  it('head-to-head: settled online matches only, the rival is the most played', () => {
    const m = (guestId: string, guestName: string, winnerId: string | null, d: number, extra = {}) => ({ kind: 'online', status: 'settled', hostId: 'u1', hostName: 'Me', guestId, guestName, winnerId, mode: 'threePoint', updatedAt: day(d), ...extra });
    const d = assembleProfile('u1', rows({ matches: [
      m('a', 'Ana', 'u1', 1), m('a', 'Ana', 'a', 2), m('a', 'Ana', null, 3), m('b', 'Ben', 'u1', 4),
      m('b', 'Ben', 'u1', 5, { status: 'open' }), m('u1', 'Me', 'u1', 6, { kind: 'local' }),
    ] }), now);
    expect(d.squad.opponents).toEqual([
      { name: 'Ana', wins: 1, losses: 1, draws: 1, lastAt: day(1).toISOString(), mode: 'Downtown' },
      { name: 'Ben', wins: 1, losses: 0, draws: 0, lastAt: day(4).toISOString(), mode: 'Downtown' },
    ]);
    expect(d.squad.rival?.name).toBe('Ana');
    expect(d.squad.matchesPlayed).toBe(4);
    expect(rivalOf([])).toBeNull();
  });
});
