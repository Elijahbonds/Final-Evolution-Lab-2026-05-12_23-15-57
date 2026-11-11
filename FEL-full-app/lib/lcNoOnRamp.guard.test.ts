// ARENA-AGE-1 — Cyber F1 fix 4 + addendum T7 (+ EOU-66): Lab Credits stay a closed, earned-only currency.
//   - no module that talks to Stripe (or sells coins/shards) moves Lab Credits;
//   - no API route is named or acts as a gift / transfer / trade for Lab Credits;
//   - LC is credited only through the known earn/refund modules (a new LC source must be added here on purpose).
// Static scan of non-test source; fails on any new on-ramp or transfer path.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
function walk(dir: string): string[] {
  let out: string[] = [];
  for (const n of readdirSync(join(ROOT, dir))) {
    if (n === 'node_modules' || n === 'generated' || n.startsWith('.')) continue;
    const rel = `${dir}/${n}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out = out.concat(walk(rel));
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.|\.suite\./.test(n)) out.push(rel);
  }
  return out;
}
const FILES = [...walk('app'), ...walk('lib')];
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const MOVES_LC = /\bapplyLc\s*\(|\barenaPayWinner\s*\(|\bawardTeenPrize\s*\(/;
const TALKS_STRIPE = /from ['"]stripe['"]|checkout\.sessions\.create|paymentIntents\.create|subscriptions\.create/;

// Every module that may call applyLc at 25a594da plus ARENA-AGE-1's prize. Adding one is a reviewed decision.
const LC_MOVERS = new Set([
  'app/api/education/complete/route.ts', 'app/api/ladder/results/route.ts', 'app/api/sessions/route.ts',
  'app/api/shop/purchase/route.ts', 'app/api/signup/route.ts', 'lib/arena-rivals.ts', 'lib/arena.ts',
  'lib/daily-drill/claim.ts', 'lib/profile-service.ts', 'lib/social/challenge-referral.ts', 'lib/wallet/wallet-service.ts',
  'lib/arena-teen.ts',
]);

describe('no LC on-ramp, no LC transfer', () => {
  it('found the source tree', () => { expect(FILES.length).toBeGreaterThan(100); });

  it('no Stripe-talking module moves Lab Credits', () => {
    const bad = FILES.filter((f) => { const s = read(f); return TALKS_STRIPE.test(s) && /\bapplyLc\s*\(/.test(s); });
    expect(bad).toEqual([]);
  });

  it('only the known modules call applyLc (a new LC source is a reviewed change)', () => {
    const callers = FILES.filter((f) => /\bapplyLc\s*\(/.test(read(f)));
    expect(callers.filter((f) => !LC_MOVERS.has(f))).toEqual([]);
  });

  it('no coin or shard purchase path credits LC', () => {
    const bad = FILES.filter((f) => /(coin|shard)/i.test(f) && /checkout|purchase|webhook/i.test(f) && /\bapplyLc\s*\(/.test(read(f)));
    expect(bad).toEqual([]);
  });

  it('no API route is a gift / transfer / trade for Lab Credits', () => {
    const routes = FILES.filter((f) => f.startsWith('app/api/') && /\/route\.ts$/.test(f));
    const named = routes.filter((f) => /(gift|transfer|trade|send-?lc|p2p)/i.test(f) && MOVES_LC.test(read(f)));
    expect(named).toEqual([]);
  });

  it('the teen prize is game-funded and paid only to the session player', () => {
    const teen = read('lib/arena-teen.ts');
    expect(teen).toContain("source: 'gameplay'");
    expect(teen).toContain('playerId: a.userId');
    const submit = read('app/api/arena/submit-score/route.ts');
    expect(submit).toMatch(/awardTeenPrize\(tx, \{ userId, matchId \}\)/);
  });
});
