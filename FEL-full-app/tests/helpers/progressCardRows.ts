// PROGRESS CARD test fixtures: ProfileRows shaped exactly as lib/profile-v2/load.ts readProfileRows returns them, for
// realistic accounts. Every number here is a stored row's own value (a WorkoutScan's verticalCm, a MirrorSession's
// clean-rep share in faultCounts, a GameSession's score and createdAt), so a card built from them shows only what a
// real account with these rows would.
import type { ProfileRows } from '@/lib/profile-v2/assemble';
import { recordCheckValues } from '@/lib/mirror/baselines';

export const NOW = new Date('2026-10-24T18:00:00Z');
export const day = (n: number, now: Date = NOW) => new Date(now.getTime() - n * 86_400_000);

const set = (cleanShare: number, d: number, patternId = 'squat') =>
  ({ patternId, reps: 8, faultCounts: recordCheckValues({}, { cleanShare }), createdAt: day(d) });
const dunk = (verticalCm: number, d: number) => ({ kind: 'dunk', metrics: { verticalCm }, createdAt: day(d) });
const score = (mode: string, s: number, d: number) => ({ mode, score: s, createdAt: day(d) });

const blank: Omit<ProfileRows, 'user'> = {
  profile: { xp: 0, streakDays: 0, avatarKey: 'male-athletic', cosmeticAssetId: null },
  optIn: null, prqEntries: [], mastery: [], jumpScans: [], mirrorSessions: [], bests: [], recentScores: [], playedAt: [],
  matches: [], links: { count: 0, opened: 0, attempted: 0, beaten: 0 }, card: null, coaches: [], credentials: [], triumphs: [],
};

/** An opted-in adult with two weeks of everything: jumps up, form down, Flight Night up, Downtown level. */
export function adultTwoWeeks(): ProfileRows {
  return {
    ...blank,
    user: { name: 'Jordan Rig', dobYear: 1994, createdAt: day(160) },
    profile: { xp: 4300, streakDays: 4, avatarKey: 'male-athletic', cosmeticAssetId: null },
    optIn: { scope: 'jump_numbers', granted: true, revokedAt: null },
    // this week's best 66 cm = 26.0 in; last week's best 62 cm = 24.4 in → +1.6 in
    jumpScans: [dunk(64, 1), dunk(66, 3), dunk(65, 6), dunk(62, 8), dunk(60, 11), dunk(58, 22)],
    // this week mean (0.6 + 0.7) / 2 = 0.65; last week mean (0.85 + 0.9) / 2 = 0.875 → −22.5 pts (outside the 10-pt band)
    mirrorSessions: [set(0.6, 2), set(0.7, 5, 'lunge'), set(0.85, 9), set(0.9, 12)],
    recentScores: [
      score('dunkContest', 8200, 1), score('dunkContest', 9100, 2), score('dunkContest', 8800, 4),
      score('dunkContest', 8000, 8), score('dunkContest', 8400, 10),
      score('threePoint', 21, 3), score('threePoint', 19, 5),
      score('threePoint', 21, 9),
      score('sprint', 1400, 12),
    ],
    playedAt: [day(1), day(2), day(3), day(4), day(5), day(8), day(9), day(10), day(12)],
    card: { slug: 'jordan-rig', published: false, displayName: 'Jordan Rig', highlights: [] },
  };
}

/** A brand-new adult: the account exists, nothing is measured or played. */
export function newUser(): ProfileRows {
  return { ...blank, user: { name: 'New Player', dobYear: 1999, createdAt: day(0) } };
}

/** An opted-in adult in their first week: rows this week only. */
export function adultFirstWeek(): ProfileRows {
  return {
    ...blank,
    user: { name: 'Riley First', dobYear: 1990, createdAt: day(5) },
    profile: { xp: 300, streakDays: 2, avatarKey: 'male-athletic', cosmeticAssetId: null },
    optIn: { scope: 'jump_numbers', granted: true, revokedAt: null },
    jumpScans: [dunk(55, 1)],
    mirrorSessions: [set(0.75, 2)],
    recentScores: [score('dunkContest', 7000, 1), score('dunkContest', 7400, 2)],
    playedAt: [day(1), day(2)],
  };
}

/** An opted-in adult who trained last week and not this week. */
export function adultQuietWeek(): ProfileRows {
  return {
    ...blank,
    user: { name: 'Casey Quiet', dobYear: 1988, createdAt: day(60) },
    profile: { xp: 1200, streakDays: 0, avatarKey: 'male-athletic', cosmeticAssetId: null },
    optIn: { scope: 'jump_numbers', granted: true, revokedAt: null },
    jumpScans: [dunk(61, 9)],
    mirrorSessions: [set(0.8, 10)],
    recentScores: [score('threePoint', 18, 9)],
    playedAt: [day(9), day(10)],
  };
}

/**
 * A 15-year-old who plays a lot. The load's query gates would return no jump, Mirror or score row for this account; the
 * fixture carries them anyway, to prove the card's own JS gate drops them (belt and braces, as assemble.ts does).
 */
export function teenActive(now: Date = NOW): ProfileRows {
  const a = adultTwoWeeks();
  return {
    ...a,
    user: { name: 'Sam Teen', dobYear: now.getFullYear() - 15, createdAt: day(40) },
    card: { slug: 'sam', published: true, displayName: 'Sam T', highlights: [] },
  };
}

/** An adult who has NOT opted in to saving numbers: games and streak, no jump or form on the server. */
export function adultNotOptedIn(): ProfileRows {
  const a = adultTwoWeeks();
  return { ...a, user: { name: 'Pat Private', dobYear: 1992, createdAt: day(90) }, optIn: null, card: null };
}
