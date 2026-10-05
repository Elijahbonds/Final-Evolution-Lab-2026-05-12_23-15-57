// MIRROR-COACH P7 (2026-09-29): THE DIAL-UP BREATH IS NEVER SCORED, PAID OR STREAKED (phase rule (e)).
//
// Its log (schema.prisma BreathLog) exists for one reason: counting uses against FEL's weekly limit. The easy future bug
// is one import — a streak that counts breath days, a payout that rewards them. So, the P6 readiness pattern
// (lib/health/readiness-never-scored.test.ts): every file under app/, lib/ and components/ that names the table or
// imports the gate is walked, and none of them may live where something scores, pays, ranks, keeps a streak, builds a
// share or fires analytics. A positive control first proves the walk sees the readers that DO exist.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Code only — a comment that mentions the log reads nothing. */
const codeOf = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');

/** A file that names the log's table or model, or imports the gate or its server half. */
const NAMES_BREATH_LOG = /\bbreathLogs?\b|\bBreathLog\b|['"](?:@\/lib|\.\.?(?:\/\.\.)*)\/breath\/ramp(?:Gate|Server)['"]|['"]\.\/ramp(?:Gate|Server)['"]/;

const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /^lib\/prq(?!-data-rights\.ts$)/, why: 'PRQ (lib/prq-data-rights.ts only exports and erases it)' },
  { re: /^app\/api\/prq\/(?!export\/|delete\/)/, why: 'PRQ routes' },
  { re: /session-payout|^lib\/sessions\/|^app\/api\/sessions\//, why: 'session pay' },
  { re: /(^|\/)wallet(\/|[-.])|^app\/api\/v1\/wallet\//, why: 'the wallet' },
  { re: /(^|\/)arena[^/]*(\/|\.tsx?$)/, why: 'the Arena' },
  { re: /season[-_]?pass/i, why: 'the season pass' },
  { re: /streak/i, why: 'streaks' },
  { re: /leaderboard|(^|\/)score[^/]*\.tsx?$|scoreScale/i, why: 'scores and ranks' },
  { re: /^lib\/share\/|^app\/api\/share\/|^components\/share\//, why: 'share links' },
  { re: /^lib\/analytics\.ts$/, why: 'analytics events' },
  { re: /^lib\/coach\/(triage|compliance|attention)\.ts$/, why: 'the coach board’s judgement' },
  { re: /^lib\/cards\//, why: 'card boosts' },
];

describe('nothing that scores, pays or counts reads the breath log', () => {
  const files = ['app', 'lib', 'components'].flatMap((d) => walk(join(ROOT, d)));
  const readers = files
    .filter((f) => NAMES_BREATH_LOG.test(codeOf(readFileSync(f, 'utf8'))))
    .map((f) => relative(ROOT, f).split('\\').join('/'))
    .sort();

  it('control: the walk finds the readers that exist (so an empty violation list means none, not blindness)', () => {
    for (const known of ['lib/breath/rampServer.ts', 'lib/prq-data-rights.ts', 'app/api/breath/ramp/route.ts', 'components/coach/ramp-breath.tsx']) {
      expect(readers, known).toContain(known);
    }
  });

  it('no reader lives in a scoring, paying, ranking, streak, share or analytics path', () => {
    const violations = readers.flatMap((f) => FORBIDDEN.filter((x) => x.re.test(f)).map((x) => `${f} (${x.why})`));
    expect(violations).toEqual([]);
  });

  it('the controls: the forbidden patterns do match the paths they are for', () => {
    for (const p of ['lib/prq.ts', 'lib/session-payout.ts', 'lib/wallet/wallet-service.ts', 'lib/streaks.ts', 'lib/share/shareable.ts', 'lib/analytics.ts']) {
      expect(FORBIDDEN.some((x) => x.re.test(p)), p).toBe(true);
    }
    expect(FORBIDDEN.some((x) => x.re.test('lib/prq-data-rights.ts'))).toBe(false);
  });
});
