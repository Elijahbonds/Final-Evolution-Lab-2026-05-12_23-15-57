// ECONOMY-SESSIONS-HARDEN (2026-09-28): the structural half of the tip, held where it lives.
//
//   FIX 4        /api/sessions/result was the harness's old default sink. At 46a8dc6a there is no such route and nothing
//                calls it (MOVEMENT PLAY P3 removed the default, 2026-09-24); this keeps it that way, and keeps
//                /api/sessions/* to exactly the two routes the run needs — no catch-all under it.
//   FIX 2 step 7 the run rate limits are STAGED, not wired: no route imports them until the FE PM's GO.
//   ADDENDUM     the end card shows only what the server's answer granted, and no daily line.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';
import { RUN_RATE_LIMITS, sessionRunGate } from './runRateLimit';
import { unpaidLine, unpaidReason, unpaidTitle } from './unpaidCopy';

const ROOT = process.cwd();
function files(dir: string, ext = /\.(ts|tsx|js|mjs)$/): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules' || name.startsWith('.next')) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (ext.test(name)) out.push(p);
    }
  };
  walk(join(ROOT, dir));
  return out;
}
const rel = (p: string) => relative(ROOT, p);

describe('FIX 4: no dead or catch-all sink under /api/sessions', () => {
  it('exactly two routes: the finish (route.ts) and the start (start/route.ts)', () => {
    expect(files('app/api/sessions').map(rel).sort()).toEqual(['app/api/sessions/route.ts', 'app/api/sessions/start/route.ts']);
    expect(files('app/api/sessions').some((p) => /\[/.test(rel(p)))).toBe(false);
  });

  it('nothing in the app calls /api/sessions/result (comments recording its removal aside)', () => {
    const callers = [...files('app'), ...files('components'), ...files('lib'), ...files('hooks')]
      .filter((p) => !p.endsWith('.test.ts'))
      .filter((p) => stripComments(readFileSync(p, 'utf8')).includes('/api/sessions/result'));
    expect(callers.map(rel)).toEqual([]);
  });

  it('the finish route exports POST only (no GET or catch-all verb that could answer or pay)', () => {
    const route = readFileSync(join(ROOT, 'app/api/sessions/route.ts'), 'utf8');
    expect([...route.matchAll(/export async function (\w+)/g)].map((m) => m[1])).toEqual(['POST']);
    const start = readFileSync(join(ROOT, 'app/api/sessions/start/route.ts'), 'utf8');
    expect([...start.matchAll(/export async function (\w+)/g)].map((m) => m[1])).toEqual(['POST']);
  });
});

describe('FIX 2 step 7: the run rate limits are STAGED, not wired', () => {
  it('no route or page imports them', () => {
    // an import of the module or a call of the gate (comments naming the staged file, as the start route's does, are fine)
    const wired = [...files('app'), ...files('components')]
      .filter((p) => /from\s+['"][^'"]*runRateLimit['"]|sessionRunGate\s*\(/.test(stripComments(readFileSync(p, 'utf8'))));
    expect(wired.map(rel)).toEqual([]);
  });

  it('the policy: the user bucket first, then the IP; a refused user never spends the IP\'s allowance', () => {
    const counts = new Map<string, number>();
    const fake = (key: string, limit: number) => {
      const n = (counts.get(key) ?? 0) + 1; counts.set(key, n);
      return { ok: n <= limit, remaining: Math.max(0, limit - n), retryAfterSec: 60 };
    };
    for (let i = 0; i < RUN_RATE_LIMITS.finish.perUser; i++) expect(sessionRunGate('finish', 'u1', '1.2.3.4', fake).ok).toBe(true);
    expect(sessionRunGate('finish', 'u1', '1.2.3.4', fake).ok).toBe(false);
    expect(counts.get('sessions:finish:ip:1.2.3.4')).toBe(RUN_RATE_LIMITS.finish.perUser);
    // another player on the same address still has the IP's headroom
    expect(sessionRunGate('finish', 'u2', '1.2.3.4', fake).ok).toBe(true);
    expect(RUN_RATE_LIMITS.start.perUser).toBeGreaterThan(RUN_RATE_LIMITS.finish.perUser);
  });
});

describe('ADDENDUM: the end card shows only what the server granted, and no daily line', () => {
  const shell = stripComments(readFileSync(join(ROOT, 'components/games/game-shell.tsx'), 'utf8'));
  it('there is no daily line on the card, and no earn the card could add one from', () => {
    expect(shell).not.toMatch(/daily|DAILY_FIRST_SESSION|first.session/i);
    expect(shell).not.toMatch(/reportEarn/);
  });

  it('the coins tile is the session answer\'s own figure, only for a paid run', () => {
    expect(shell).toMatch(/if \(mine\(\) && j\?\.paid === true\) \{\s*const coins = Number\.isFinite\(j\?\.coins\) \? Number\(j\.coins\) : 0;/);
    expect((shell.match(/setRecapCoins\(\{/g) ?? []).length).toBe(1);
  });

  it('every reason the route can give has its own title and line', () => {
    for (const r of ['AGENT', 'PLAYTEST', 'TEST_ACCOUNT', 'SCORE_INVALID', 'NO_RULES', 'RUN_MISSING', 'RUN_UNKNOWN', 'RUN_MODE_MISMATCH', 'RUN_EXPIRED', 'RUN_CLOSED', 'RUN_IN_FLIGHT']) {
      expect(unpaidTitle(r), r).not.toBe('NOT PAID');
      expect(unpaidLine(r), r).not.toBe('Nothing was paid for this run.');
    }
    expect(unpaidReason('SCORE_INVALID', 'no_rules')).toBe('NO_RULES');
    expect(unpaidReason('SCORE_INVALID', 'above_max_score')).toBe('SCORE_INVALID');
    expect(unpaidReason(undefined)).toBe('UNPAID');
  });
});
