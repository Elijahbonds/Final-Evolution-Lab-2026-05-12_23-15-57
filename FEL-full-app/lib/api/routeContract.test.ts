import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE SMOKE LAYER THE API NEVER HAD.
 *
 * 152 route files, zero tests. The coach invite shipped, passed every local check, and 500'd in production for a
 * week; a contract test over the route files would not have caught that particular bug, but the reason it went
 * unnoticed is the same reason this file exists — nothing in the suite ever looked at a route at all.
 *
 * It is deliberately STATIC. Booting 152 handlers needs a database, a session and a request per route, which is a
 * fixture project of its own; reading what each route declares costs nothing and catches the class of mistake that
 * actually happens: a new endpoint that forgets its auth guard, exports no verb, or reads a session without
 * force-dynamic and gets quietly cached.
 */
const API_ROOT = 'app/api';

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (name === 'route.ts' || name === 'route.tsx') out.push(p);
  }
  return out;
}

const FILES = routeFiles(API_ROOT);
const rel = (f: string) => f.slice(API_ROOT.length + 1);

/** Anything that establishes who is calling, including the helpers that wrap it. */
const GUARD = /getServerSession|currentUserId|require[A-Z]\w*\(|assert[A-Z]\w*\(|verify[A-Z]\w*\(/;

/**
 * Routes that answer without knowing who you are, each for a stated reason. A new route may only join this list
 * with one — that is the point of the list, and the reason it is not a glob.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  'auth/[...nextauth]/route.ts': 'NextAuth itself — the thing that establishes a session cannot require one',
  'signup/route.ts': 'creating the account that will have the session',
  'guest/route.ts': 'issues the guest identity; there is nobody to authenticate yet',
  'health/route.ts': 'liveness probe, no data',
  'health/db/route.ts': 'database liveness probe, no rows returned',
  'stripe/webhook/route.ts': 'Stripe calls it; authenticated by signature, not session',
  'v1/wallet/stripe-webhook/route.ts': 'the wallet\'s own Stripe endpoint; authenticated by signature, not session',
  'marketing/subscribe/route.ts': 'public mailing-list intake; there is no account yet to authenticate',
  'telemetry/crash/route.ts': 'crash reports arrive from clients that may be broken or signed out',
  'competition/config/route.ts': 'public configuration, no player data',
  'v1/wallet/config/route.ts': 'public price/catalogue configuration',
  'v1/scene-packs/route.ts': 'public asset catalogue',
  'partner/v1/catalog/route.ts': 'partner API, authenticated by API key rather than session',
  'controller-link/rooms/route.ts': 'phone pairing, authenticated by the room code + rate limit',
  'controller-link/signal/route.ts': 'pairing signal relay, rate limited',
  'v1/card/[slug]/route.ts': 'a published creator card is public by design (the card page is too)',
  'v1/creative-card/[id]/route.ts': 'a published creative card is public in the same way a creator card is',
  'onboarding/host/route.ts': 'a visitor who scanned a card has no session yet; returns only a published card\'s display name, signature mode and accent',
};

// Two shapes count: a declared handler, and a re-export — NextAuth ships `export { handler as GET, handler as POST }`,
// which handles both verbs without ever writing `export function GET`.
const VERB = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|\bas\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/;

describe('every API route', () => {
  it('there are routes to check, and the walker found them', () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('exports at least one HTTP verb — a route file that handles nothing is dead weight on the bundle', () => {
    const silent = FILES.filter((f) => !VERB.test(readFileSync(f, 'utf8'))).map(rel);
    expect(silent).toEqual([]);
  });

  it('either guards its caller or is PUBLIC BY DESIGN with a reason', () => {
    const unguarded = FILES
      .filter((f) => !GUARD.test(readFileSync(f, 'utf8')))
      .map(rel)
      .filter((r) => !(r in PUBLIC_BY_DESIGN));
    // A new endpoint that forgets its guard lands here, named, before it reaches a deploy.
    expect(unguarded).toEqual([]);
  });

  it('every PUBLIC BY DESIGN entry still exists — the list cannot rot into a blanket exemption', () => {
    const present = new Set(FILES.map(rel));
    expect(Object.keys(PUBLIC_BY_DESIGN).filter((r) => !present.has(r))).toEqual([]);
  });

  it('every reason is a real sentence, not a shrug', () => {
    for (const [route, why] of Object.entries(PUBLIC_BY_DESIGN)) {
      expect(why.length, route).toBeGreaterThan(20);
    }
  });

  it('a route that reads a session declares force-dynamic, or Next may cache somebody else\'s answer', () => {
    const cached = FILES.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /getServerSession|currentUserId/.test(src) && !/force-dynamic|revalidate\s*=\s*0/.test(src);
    }).map(rel);
    expect(cached).toEqual([]);
  });
});
