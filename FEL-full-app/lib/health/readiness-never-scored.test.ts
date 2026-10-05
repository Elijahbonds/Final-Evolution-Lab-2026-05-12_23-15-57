// MIRROR-COACH P6 (2026-09-29): THE READINESS CHECK-IN IS NEVER SCORED (owner decision #12).
//
// "It never touches PRQ, pay, a score or a streak" is a promise about code that does not exist yet as much as code that
// does — the easy future bug is one import. So this holds it from both sides:
//   1. THE SOURCE TREE. Every file under app/, lib/ and components/ that names the check-in's table or module
//      (ReadinessCheckIn / readinessCheckIn / lib/health/readiness) is walked, and none of them may live in a place
//      that scores, pays, ranks, keeps a streak, builds a share or fires analytics. A positive control first proves the
//      walk sees the consumers that DO exist, so an empty result means "none", not "the walker saw nothing".
//   2. THE PAY/PRQ/STREAK FUNCTIONS THEMSELVES. lib/session-payout.ts and lib/prq.ts are what POST /api/sessions runs
//      (app/api/sessions/route.ts, held by another lane — read, never edited). They are called twice with the same
//      session, once with a whole check-in and its read stuffed into the body, the stats, the metadata and the streak
//      profile; every answer must be identical. A client that sends its readiness along with a game gets nothing for it.
//   3. THE SHARE GUARD. A check-in row, its answers and its read all fail lib/share/shareable.ts assertNoAthleteData.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  isCreationSession, isEndlessSession, roomStats, sessionAccuracy, sessionPayout, sessionScoreCap, sessionWon, setGrade, streakStep,
} from '../session-payout';
import { computePrqDelta } from '../prq';
import { assertNoAthleteData, ShareLeak } from '../share/shareable';
import { readReadiness } from './readiness';

const ROOT = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Code only: a comment that MENTIONS the check-in (lib/share/shareable.ts explains its denylist entry, say) reads nothing.
 *  Block comments and whole-line or trailing `//` comments go; a `//` inside a string (a URL) is left alone. */
const codeOf = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');

/** A file that names the check-in's table, its Prisma model, or imports its module. */
const NAMES_READINESS = /\breadinessCheckIns?\b|\bReadinessCheckIn\b|['"](?:@\/lib|\.\.?(?:\/\.\.)*)\/health\/readiness['"]|['"]\.\/readiness['"]/;

/**
 * Where the check-in must never be read: anything that scores, pays, ranks, keeps a streak, builds a share or fires
 * analytics. lib/prq-data-rights.ts is the one PRQ-named file allowed — it EXPORTS and ERASES the check-in (Privacy §5's
 * promise), it computes nothing from it.
 */
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /^lib\/prq(?!-data-rights\.ts$)/, why: 'PRQ' },
  { re: /^app\/api\/prq\/(?!export\/|delete\/)/, why: 'PRQ routes (export/delete only go through lib/prq-data-rights.ts)' },
  { re: /session-payout|^lib\/sessions\/|^app\/api\/sessions\//, why: 'session pay' },
  { re: /(^|\/)wallet(\/|[-.])|^app\/api\/v1\/wallet\//, why: 'the wallet' },
  { re: /(^|\/)arena[^/]*(\/|\.tsx?$)/, why: 'the Arena' },
  { re: /season[-_]?pass/i, why: 'the season pass' },
  { re: /streak/i, why: 'streaks' },
  { re: /leaderboard|(^|\/)score[^/]*\.tsx?$|scoreScale/i, why: 'scores and ranks' },
  { re: /^lib\/share\/|^app\/api\/share\/|^components\/share\//, why: 'share links' },
  { re: /^lib\/analytics\.ts$/, why: 'analytics events' },
  { re: /^lib\/coach\/(triage|compliance|attention)\.ts$/, why: 'the coach board’s triage/compliance judgement' },
  { re: /^lib\/coach-service\.ts$/, why: 'the AI coach’s computed readiness score' },
  { re: /^lib\/cards\//, why: 'card boosts' },
];

describe('1. the source tree: nothing that scores, pays or counts reads the check-in', () => {
  const files = ['app', 'lib', 'components'].flatMap((d) => walk(join(ROOT, d)));
  const readers = files
    .filter((f) => NAMES_READINESS.test(codeOf(readFileSync(f, 'utf8'))))
    .map((f) => relative(ROOT, f).split('\\').join('/'))
    .sort();

  it('control: the walk finds the consumers that exist (so an empty violation list means none, not blindness)', () => {
    for (const known of [
      'app/api/health/readiness/route.ts', 'lib/prq-data-rights.ts', 'app/api/coach/attention/route.ts',
      'components/coach/readiness-checkin.tsx', 'app/api/health/consent/route.ts',
    ]) expect(readers, known).toContain(known);
  });

  it('the forbidden patterns do catch the files they are meant to (a pattern that matches nothing guards nothing)', () => {
    const paths = files.map((f) => relative(ROOT, f).split('\\').join('/'));
    for (const must of ['lib/session-payout.ts', 'lib/prq.ts', 'lib/share/shareable.ts', 'lib/analytics.ts', 'lib/coach/triage.ts', 'lib/coach-service.ts']) {
      expect(paths, must).toContain(must);
      expect(FORBIDDEN.some((f) => f.re.test(must)), must).toBe(true);
    }
    expect(FORBIDDEN.some((f) => f.re.test('lib/prq-data-rights.ts'))).toBe(false);
  });

  it('control: a synthetic payout file that imported the module WOULD be named', () => {
    const fake = codeOf("// ReadinessCheckIn in a comment is fine\nimport { readReadiness } from '@/lib/health/readiness';\n");
    expect(NAMES_READINESS.test(fake)).toBe(true);
    expect(NAMES_READINESS.test(codeOf('// only a ReadinessCheckIn comment\n/* and prisma.readinessCheckIn here */\n'))).toBe(false);
    expect(NAMES_READINESS.test('const n = await prisma.readinessCheckIn.count()')).toBe(true);
    expect(FORBIDDEN.filter((f) => f.re.test('lib/wallet/wallet-service.ts')).map((f) => f.why)).toEqual(['the wallet']);
    expect(FORBIDDEN.some((f) => f.re.test('app/api/sessions/route.ts'))).toBe(true);
  });

  it('no reader of the check-in lives where things are scored, paid, ranked, streaked, shared or tracked', () => {
    const violations = readers.flatMap((r) => FORBIDDEN.filter((f) => f.re.test(r)).map((f) => `${r} (${f.why})`));
    expect(violations).toEqual([]);
  });

  it('and the check-in’s own files import nothing that scores or pays', () => {
    for (const own of ['lib/health/readiness.ts', 'app/api/health/readiness/route.ts', 'components/coach/readiness-checkin.tsx']) {
      const imports = [...readFileSync(join(ROOT, own), 'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const i of imports) {
        expect(FORBIDDEN.some((f) => f.re.test(i.replace(/^@\//, '').replace(/^\.\.\//, 'lib/'))), `${own} imports ${i}`).toBe(false);
      }
    }
  });
});

describe('2. the pay, PRQ and streak functions give the same answer with a check-in stuffed in', () => {
  const ROW = { id: 'rc1', userId: 'u1', date: '2026-09-29', sleep: 1, soreness: 5, energy: 1, mood: 1, createdAt: new Date('2026-09-29T07:00:00Z'), updatedAt: new Date('2026-09-29T07:00:00Z') };
  const READ = readReadiness(ROW);
  const stuff = (o: Record<string, unknown>) => ({ ...o, readiness: READ, readinessCheckIn: ROW, sleep: 1, soreness: 5, energy: 1, mood: 1, level: READ.level, extraWarmupMinutes: READ.extraWarmupMinutes });

  const musicStats = (() => {
    const bars = 16, notes = 256, perfects = 200, goods = 40, accuracy = (perfects + 0.5 * goods) / notes;
    return { bars, notes, hits: perfects + goods, perfects, goods, misses: notes - perfects - goods, accuracy, grade: setGrade(accuracy), maxCombo: 120, arena: false };
  })();
  const SESSIONS = [
    { mode: 'dunkContest', score: 420, won: true, duration: 95, stats: { tallies: 3 } },
    { mode: 'music', score: 50_000, won: true, duration: 60, stats: musicStats },
    { mode: 'dance', score: 800, won: false, duration: 120, stats: { perfect: 20, great: 10, good: 5, miss: 3 } },
    { mode: 'notACatalogueMode', score: 10, won: true, duration: 30, stats: null },
  ];

  const answers = (body: Record<string, unknown>, profile: Record<string, unknown>) => {
    const mode = body.mode as string, score = body.score as number, won = body.won as boolean, duration = body.duration as number;
    const stats = roomStats(body);
    const endless = isEndlessSession(mode, stats, duration);
    const paidWon = sessionWon(mode, won, stats, duration, { score });
    return {
      endless, paidWon,
      cap: sessionScoreCap(mode, stats, duration, { killSwitch: false }),
      accuracy: sessionAccuracy(mode, stats, duration),
      creation: isCreationSession(mode, score, body),
      payout: sessionPayout({ score, won: paidWon, endless, durationSec: duration }),
      prq: computePrqDelta({ mode, score, won: paidWon, duration, accuracy: sessionAccuracy(mode, stats, duration) }),
      streak: streakStep(profile, Date.parse('2026-09-29T12:00:00Z')),
    };
  };

  it('control: the harness is live — a different SCORE does change what is paid', () => {
    const profile = { streakDays: 3, lastStreakAt: '2026-09-28T09:00:00Z', lastActiveAt: '2026-09-28T09:00:00Z' };
    const a = answers(SESSIONS[0], profile), b = answers({ ...SESSIONS[0], score: 9000 }, profile);
    expect(b.payout).not.toEqual(a.payout);
  });

  for (const s of SESSIONS) {
    it(`${s.mode}: identical payout, win, cap, accuracy, PRQ and streak with a low check-in in the body, stats, metadata and profile`, () => {
      const profile = { streakDays: 3, lastStreakAt: '2026-09-28T09:00:00Z', lastActiveAt: '2026-09-28T09:00:00Z' };
      const clean = answers(s, profile);
      const stuffed = answers(
        stuff({ ...s, stats: s.stats ? stuff(s.stats) : { ...READ }, metadata: stuff({}) }),
        stuff(profile),
      );
      expect(stuffed).toEqual(clean);
    });
  }
});

describe('3. a share link never carries it', () => {
  it('the row, the answers and the read each fail the share guard', () => {
    const row = { id: 'rc1', userId: 'u1', date: '2026-09-29', sleep: 2, soreness: 4, energy: 2, mood: 3 };
    expect(() => assertNoAthleteData({ drill: { title: 'Wake-Up' }, checkIn: row })).toThrow(ShareLeak);
    expect(() => assertNoAthleteData({ energy: 2 })).toThrow(ShareLeak);
    expect(() => assertNoAthleteData({ readiness: readReadiness(row) })).toThrow(ShareLeak);
  });
});
