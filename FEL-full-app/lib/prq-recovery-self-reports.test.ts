// MIRROR-COACH P9 (2026-09-30): NO SELF-REPORT REACHES PRQ, PAY, A SCORE OR A STREAK (owner decision #12, phase rule (a)).
//
// P9 gave PRQ recovery real sources (lib/prq-recovery.ts, lib/coach/recoverySources.ts) and put a settle inside
// lib/profile-service.ts getOrCreateProfile, which POST /api/sessions runs before it pays. That makes the PRQ path the
// easiest place for a self-report to leak into a number: "recovery" is exactly what a readiness check-in, a pain check-in
// or a breath log sounds like it should feed. The owner's rule is that none of them ever does. P6 and P7 hold this for
// readiness (lib/health/readiness-never-scored.test.ts) and the ramp breath log (lib/breath/ramp-never-scored.test.ts);
// this holds all four self-reports — readiness, pain, the health intake, the breath log — against the PRQ/pay/score/streak
// code, three ways:
//   1. THE SOURCE TREE. No file where PRQ is computed or settled, a session is paid, a score is ranked or a streak is
//      kept names a self-report table or imports a self-report module (its own imports, resolved to files).
//   2. THE IMPORT GRAPH. The whole transitive import graph of the PRQ roots, the payout and the sessions route contains no
//      lib/health/** module and no breath-log module. A positive control first: lib/coach/offDay.ts's graph DOES reach
//      lib/health/painRule.ts (through cooldown → warmup) — which is why P9 moved the recovery filters out of it into a
//      leaf (lib/coach/recoverySources.ts) instead of importing them from there.
//   3. THE RUNNING CODE. The recovery settle reads only PlayerProfile, ClientSession and SetLog (a database that throws on
//      any other table), and the pay/PRQ/streak functions give identical answers with every self-report stuffed in.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { isEndlessSession, roomStats, sessionAccuracy, sessionPayout, sessionWon, streakStep } from './session-payout';
import { computePrqDelta } from './prq';
import { settleRecoveryFor, type RecoveryDb } from './prq-recovery';

const ROOT = join(__dirname, '..');
const rel = (f: string) => relative(ROOT, f).split('\\').join('/');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Code only: comments go (a comment that mentions a check-in reads nothing); a `//` inside a string stays. */
const codeOf = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');

/** The self-reports' tables and Prisma models. */
const NAMES_SELF_REPORT_TABLE = /\b(?:readinessCheckIns?|ReadinessCheckIn|painCheckIns?|PainCheckIn|healthIntakes?|HealthIntake|breathLogs?|BreathLog)\b/;
/** The self-reports' modules, as repo paths. */
const SELF_REPORT_MODULE = /^lib\/health\/|^lib\/breath\/ramp(?:Gate|Server)\.ts$/;

const specifiers = (code: string) => [...code.matchAll(/(?:from\s+|import\s*\(\s*|import\s+|require\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
/** An import specifier as a repo file, or null (a package, the generated Prisma client, an asset). */
function resolveImport(fromFile: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(ROOT, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(fromFile), spec) : null;
  if (!base || rel(base).startsWith('public/_prisma')) return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx'), base]) {
    if (existsSync(c) && statSync(c).isFile() && /\.(ts|tsx)$/.test(c)) return c;
  }
  return null;
}
function importGraph(root: string): string[] {
  const seen = new Set<string>();
  const stack = [join(ROOT, root)];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const s of specifiers(codeOf(readFileSync(f, 'utf8')))) {
      const r = resolveImport(f, s);
      if (r) stack.push(r);
    }
  }
  return [...seen].map(rel).sort();
}

/** Where a self-report must never be read: PRQ (computed or settled), session pay, the wallet, the Arena, season XP, streaks, scores and ranks, card boosts. */
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /^lib\/prq(?!-data-rights\.ts$)/, why: 'PRQ (lib/prq-data-rights.ts only exports and erases the self-reports)' },
  { re: /^app\/api\/prq\/(?!export\/|delete\/)/, why: 'PRQ routes' },
  { re: /^lib\/profile-service\.ts$/, why: 'the PRQ decay and the recovery settle' },
  { re: /^lib\/coach\/recoverySources\.ts$/, why: 'what PRQ recovery counts' },
  { re: /session-payout|^lib\/sessions\/|^app\/api\/sessions\//, why: 'session pay' },
  { re: /(^|\/)wallet(\/|[-.])|^app\/api\/v1\/wallet\//, why: 'the wallet' },
  { re: /(^|\/)arena[^/]*(\/|\.tsx?$)/, why: 'the Arena' },
  { re: /season[-_]?pass|^lib\/season\//, why: 'the season pass and season XP' },
  { re: /streak/i, why: 'streaks' },
  { re: /leaderboard|(^|\/)score[^/]*\.tsx?$|scoreScale/i, why: 'scores and ranks' },
  { re: /^lib\/cards\//, why: 'card boosts' },
];

describe('1. the source tree: nothing that computes PRQ, pays, scores or keeps a streak reads a self-report', () => {
  const files = ['app', 'lib', 'components'].flatMap((d) => walk(join(ROOT, d)));
  const readers = files.filter((f) => {
    const code = codeOf(readFileSync(f, 'utf8'));
    return NAMES_SELF_REPORT_TABLE.test(code) || specifiers(code).some((s) => { const r = resolveImport(f, s); return !!r && SELF_REPORT_MODULE.test(rel(r)); });
  }).map(rel).sort();

  it('control: the walk finds the readers that exist (an empty violation list means none, not blindness)', () => {
    for (const known of [
      'lib/prq-data-rights.ts', 'app/api/health/readiness/route.ts', 'app/api/health/pain/route.ts', 'app/api/health/intake/route.ts',
      'lib/breath/rampServer.ts', 'lib/coach/todayServer.ts', 'lib/coach/cooldownServer.ts',
    ]) expect(readers, known).toContain(known);
  });
  it('control: the forbidden patterns catch the files they are meant to, and not the export/erase module', () => {
    const paths = files.map(rel);
    for (const must of ['lib/prq.ts', 'lib/prq-engine.ts', 'lib/prq-recovery.ts', 'lib/profile-service.ts', 'lib/coach/recoverySources.ts', 'lib/session-payout.ts', 'app/api/sessions/route.ts']) {
      expect(paths, must).toContain(must);
      expect(FORBIDDEN.some((f) => f.re.test(must)), must).toBe(true);
    }
    expect(FORBIDDEN.some((f) => f.re.test('lib/prq-data-rights.ts'))).toBe(false);
  });
  it('control: a synthetic PRQ file that read a check-in WOULD be named', () => {
    expect(NAMES_SELF_REPORT_TABLE.test(codeOf('const n = await prisma.painCheckIn.count();'))).toBe(true);
    expect(NAMES_SELF_REPORT_TABLE.test(codeOf('// a BreathLog in a comment\n/* prisma.readinessCheckIn */'))).toBe(false);
    expect(SELF_REPORT_MODULE.test('lib/health/intake.ts')).toBe(true);
    expect(SELF_REPORT_MODULE.test('lib/breath/rampGate.ts')).toBe(true);
    expect(SELF_REPORT_MODULE.test('lib/breath/pacer.ts')).toBe(false);
  });
  it('no reader of readiness, pain, intake or the breath log lives where PRQ, pay, scores or streaks are made', () => {
    const violations = readers.flatMap((r) => FORBIDDEN.filter((f) => f.re.test(r)).map((f) => `${r} (${f.why})`));
    expect(violations).toEqual([]);
  });
});

describe('2. the import graph: no self-report module is anywhere under PRQ, the payout or the sessions route', () => {
  it('control: the walker follows imports transitively — lib/coach/offDay.ts reaches lib/health/painRule.ts', () => {
    const g = importGraph('lib/coach/offDay.ts');
    expect(g).toContain('lib/coach/warmup.ts');
    expect(g).toContain('lib/health/painRule.ts');
  });
  for (const root of [
    'lib/prq.ts', 'lib/prq-engine.ts', 'lib/prq-recovery.ts', 'lib/coach/recoverySources.ts', 'lib/profile-service.ts',
    'lib/session-payout.ts', 'app/api/sessions/route.ts',
  ]) {
    it(`${root}: its whole graph holds no lib/health/** and no breath-log module`, () => {
      const g = importGraph(root);
      expect(g.length).toBeGreaterThan(0);
      expect(g.filter((f) => SELF_REPORT_MODULE.test(f))).toEqual([]);
    });
  }
  it('the recovery path is small and exactly what it says (the engine, the filters and the set-log helpers)', () => {
    // AGE-HELPERS-CONSOLIDATE (2026-10-04, option (a)) added lib/age/ageRules.ts: a new, pure, import-free leaf
    // (no lib/health/**, no breath-log module, no self-report import of any kind) that lib/coach/taxonomy.ts's
    // youthRules now delegates its `> 18` threshold line to. Flagged here as required by this repo's test-change
    // rule: this widens the allow-list, not a self-report leak — the module has zero imports of its own.
    expect(importGraph('lib/prq-recovery.ts')).toEqual([
      'lib/age/ageRules.ts', 'lib/coach/recoverySources.ts', 'lib/coach/setLog.ts', 'lib/coach/structure.ts', 'lib/coach/taxonomy.ts', 'lib/prq-engine.ts', 'lib/prq-recovery.ts',
    ]);
  });
});

describe('3. the running code', () => {
  it('the recovery settle reads PlayerProfile, ClientSession and SetLog — and would throw on any self-report table', async () => {
    const touched = new Set<string>();
    const T = Date.UTC(2026, 9, 5);
    const allowed: Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>> = {
      playerProfile: {
        findUnique: async () => ({ recovery: 70, updatedAt: new Date(T) }),
        updateMany: async () => ({ count: 1 }),
      },
      clientSession: {
        findFirst: async () => ({ id: 'cs1' }),
        findMany: async (a) => ((a as { select: { cooldownDoneAt?: true } }).select.cooldownDoneAt
          ? [{ id: 'cs1', completedAt: new Date(T + 3_600_000), cooldownDoneAt: new Date(T + 3_700_000) }]
          : []),
      },
      setLog: { findMany: async () => [] },
    };
    const db = new Proxy({}, {
      get: (_t, k) => {
        touched.add(String(k));
        if (!(String(k) in allowed)) throw new Error(`the recovery settle touched ${String(k)}`);
        return allowed[String(k)];
      },
    }) as unknown as RecoveryDb;
    const r = await settleRecoveryFor(db, 'u1', new Date(T + 2 * 86_400_000));
    expect(r).toMatchObject({ ok: true, written: true });
    expect([...touched].sort()).toEqual(['clientSession', 'playerProfile', 'setLog']);
    for (const t of ['readinessCheckIn', 'painCheckIn', 'healthIntake', 'breathLog', 'healthConsent']) expect(touched.has(t)).toBe(false);
  });

  describe('pay, PRQ and streak give the same answer with each self-report stuffed into the session, its stats and the profile', () => {
    const SELF_REPORTS: Record<string, Record<string, unknown>> = {
      readiness: { readiness: { level: 'low', extraWarmupMinutes: 4 }, readinessCheckIn: { sleep: 1, soreness: 5, energy: 1, mood: 1 }, sleep: 1, soreness: 5, energy: 1, mood: 1 },
      pain: { pain: { rating: 8, decision: 'stop' }, painCheckIn: { rating: 8, area: 'knee' }, painRating: 8 },
      intake: { intake: { answers: { chest_pain: true }, birth_year: 2011 }, healthIntake: { hardStopped: true }, redFlags: ['chest_pain'] },
      breath: { breath: { kind: 'ramp', rounds: 6 }, breathLog: { kind: 'ramp', seconds: null }, breathRounds: 6 },
    };
    const SESSIONS = [
      { mode: 'training', score: 300, won: true, duration: 90, stats: null },
      { mode: 'brainBrawl', score: 240, won: true, duration: 120, stats: null },
      { mode: 'dance', score: 800, won: false, duration: 120, stats: { perfect: 20, great: 10, good: 5, miss: 3 } },
    ];
    const PROFILE = { streakDays: 3, lastStreakAt: '2026-10-04T09:00:00Z', lastActiveAt: '2026-10-04T09:00:00Z', recovery: 71.2 };
    const answers = (body: Record<string, unknown>, profile: Record<string, unknown>) => {
      const mode = body.mode as string, score = body.score as number, won = body.won as boolean, duration = body.duration as number;
      const stats = roomStats(body);
      const endless = isEndlessSession(mode, stats, duration);
      const paidWon = sessionWon(mode, won, stats, duration, { score });
      return {
        payout: sessionPayout({ score, won: paidWon, endless, durationSec: duration }),
        prq: computePrqDelta({ mode, score, won: paidWon, duration, accuracy: sessionAccuracy(mode, stats, duration) }),
        streak: streakStep(profile, Date.parse('2026-10-05T12:00:00Z')),
      };
    };
    it('control: the harness is live (a different score changes the pay)', () => {
      expect(answers({ ...SESSIONS[0], score: 9000 }, PROFILE).payout).not.toEqual(answers(SESSIONS[0], PROFILE).payout);
    });
    for (const [kind, stuff] of Object.entries(SELF_REPORTS)) {
      for (const s of SESSIONS) {
        it(`${kind} × ${s.mode}`, () => {
          const clean = answers(s, PROFILE);
          const stuffed = answers({ ...s, ...stuff, stats: s.stats ? { ...s.stats, ...stuff } : { ...stuff }, metadata: { ...stuff } }, { ...PROFILE, ...stuff });
          expect(stuffed).toEqual(clean);
        });
      }
    }
  });
});
