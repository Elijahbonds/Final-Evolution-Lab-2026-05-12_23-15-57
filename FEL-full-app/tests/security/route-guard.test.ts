// The security review's standing guard (QG-06): every route file is in docs/SECURITY-REVIEW.md, and a route that WRITES
// with no check at all has been read by a person and listed in REVIEWED_PUBLIC_WRITES with what stands in for one.
//
// Fails on: a new route that is not in the review's inventory (run `npx tsx tests/security/inventory.ts --write`, then
// read the new row); a new POST/PUT/PATCH/DELETE with no session, admin, secret, signature or dev-only gate in its file;
// a reviewed-public entry for a route that no longer exists; a secret compared with === instead of a timing-safe check.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROOT, DOC, INVENTORY_END, INVENTORY_START, REVIEWED_PUBLIC_WRITES, routePath, scanAll, scanSource } from './routeScan';

const rows = scanAll();
const doc = readFileSync(join(APP_ROOT, DOC), 'utf8');

describe('route guard (security review QG-06)', () => {
  it('finds the routes (a scanner that sees nothing passes everything)', () => {
    expect(rows.length).toBeGreaterThan(250);
    expect(rows.filter((r) => r.writes).length).toBeGreaterThan(150);
  });

  it('every route file is in the review inventory', () => {
    const missing = rows.filter((r) => !doc.includes(`| \`${r.path}\` |`)).map((r) => r.path);
    expect(missing, `not in ${DOC} — run: npx tsx tests/security/inventory.ts --write, and read the new rows`).toEqual([]);
  });

  it('the inventory names no route that is gone', () => {
    const table = doc.slice(doc.indexOf(INVENTORY_START), doc.indexOf(INVENTORY_END));
    const listed = [...table.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
    const known = new Set(rows.map((r) => r.path));
    expect(listed.filter((p) => !known.has(p))).toEqual([]);
  });

  it('every write route checks something, or was reviewed as public', () => {
    const open = rows.filter((r) => r.writes && r.auth.includes('none') && !REVIEWED_PUBLIC_WRITES[r.path]).map((r) => `${r.path} (${r.methods.join(' ')})`);
    expect(open, 'a write route with no session / admin / secret / signature / dev-only check: add the check, or review it into REVIEWED_PUBLIC_WRITES with the reason').toEqual([]);
  });

  it('every reviewed-public entry still exists and still checks nothing (otherwise drop it)', () => {
    for (const p of Object.keys(REVIEWED_PUBLIC_WRITES)) {
      const r = rows.find((x) => x.path === p);
      expect(r, `${p} is reviewed-public but no longer exists`).toBeDefined();
      expect(r!.auth, `${p} now has a check; remove it from REVIEWED_PUBLIC_WRITES`).toContain('none');
    }
  });

  it('no route compares a secret with === (timing-safe or a verify*Secret helper only)', () => {
    expect(rows.filter((r) => r.secretCompare === 'plain').map((r) => r.path)).toEqual([]);
  });

  it('the scanner sees what it claims to (fixtures)', () => {
    const f = (src: string) => scanSource('app/api/x/route.ts', src);
    expect(f(`export async function POST() { await db.thing.create({}) }`).auth).toEqual(['none']);
    expect(f(`export async function POST() { const s = await getServerSession(authOptions); }`).auth).toContain('session');
    expect(f(`export async function GET() { if (!(await requireAdmin())) return no(); }`).auth).toContain('admin');
    expect(f(`export async function POST(req) { stripe.webhooks.constructEvent(raw, sig, s) }`).auth).toContain('signature');
    expect(f(`export async function POST(req) { if (req.headers.get('x') === process.env.CRON_SECRET) {} }`).secretCompare).toBe('plain');
    expect(f(`export async function POST(req) { verifyRetentionSecret(h, process.env.RETENTION_CRON_SECRET) }`).secretCompare).toBe('timing-safe');
    expect(f(`export { handler as GET, handler as POST }`).methods).toEqual(['GET', 'POST']);
    expect(routePath('app/api/a/[id]/route.ts')).toBe('/api/a/[id]');
  });
});
