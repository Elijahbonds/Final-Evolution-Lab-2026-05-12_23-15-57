import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DOORS } from './doors';
import { TABS } from '../../components/shell/tab-bar';
import { FAMILIES, OFF_SHELF } from './families';

/**
 * The orphan test.
 *
 * Deleting the old five-tab bar took the only link to nine working routes with it — /camp, /education, /live,
 * /workout, /cards, /market and friends. Nobody noticed, because an orphaned page does not break; it just goes
 * quiet, and a feature nobody can click is a feature nobody has. That happened once and the fix was a list; this
 * is what stops it happening a second time.
 *
 * It walks the real app directory, collects every top-level route with a page, and fails if nothing anywhere in
 * app/, components/ or lib/ points at it.
 */

const ROOT = join(__dirname, '..', '..');

/** Routes that are reached by something other than a link, and why. */
const NOT_NAVIGABLE: Record<string, string> = {
  '/login': 'where an unauthenticated request is redirected',
  '/signup': 'reached from /login and from a scanned card',
  '/dev': 'developer views, deliberately unlisted',
  '/c': 'a scanned creator card, entered by its code',
  '/card': "somebody else's creator card, opened from a shared link or a QR code",
  '/p': 'a public profile, entered by its handle',
  '/controller': 'joined by code from a phone, never by a link on the phone',
  '/admin': 'shown in the rail to an admin only',
  '/game-surface.css': 'not a route',
  '/play': 'a tab',
  '/train': 'a tab',
  '/profile': 'a tab',
  '/studio': 'HOLD — not shipped, deliberately unlinked',
};

function topLevelRoutes(): string[] {
  const out = new Set<string>();
  for (const e of readdirSync(join(ROOT, 'app'))) {
    if (e.startsWith('_') || e.startsWith('(') || e === 'api') continue;
    const p = join(ROOT, 'app', e);
    if (!statSync(p).isDirectory()) continue;
    const hasPage = (dir: string): boolean => {
      for (const f of readdirSync(dir)) {
        if (f.startsWith('page.')) return true;
        const fp = join(dir, f);
        if (statSync(fp).isDirectory() && hasPage(fp)) return true;
      }
      return false;
    };
    if (hasPage(p)) out.add('/' + e);
  }
  return [...out].sort();
}

function everyLinkTarget(): Set<string> {
  const hrefs = new Set<string>();
  const scan = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e.startsWith('.')) continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { scan(p); continue; }
      if (!/\.(tsx|ts)$/.test(p) || p.endsWith('.test.ts') || p.endsWith('.test.tsx')) continue;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/href=["'`](\/[A-Za-z0-9/[\]._-]*)/g)) hrefs.add(m[1]);
      // A card grid holds its links in data — `href: '/closet'` — not in JSX, and those count just as much.
      for (const m of src.matchAll(/href:\s*["'`](\/[A-Za-z0-9/[\]._-]*)/g)) hrefs.add(m[1]);
      for (const m of src.matchAll(/(?:push|replace|redirect)\(\s*["'`](\/[A-Za-z0-9/[\]._-]*)/g)) hrefs.add(m[1]);
    }
  };
  scan(join(ROOT, 'app'));
  scan(join(ROOT, 'components'));
  scan(join(ROOT, 'lib'));
  // Links the shell builds from data rather than writing literally.
  for (const t of TABS) hrefs.add(t.href);
  for (const d of DOORS) hrefs.add(d.href);
  for (const f of FAMILIES) for (const m of f.modes) hrefs.add('/play/' + m);
  for (const k of Object.keys(OFF_SHELF)) hrefs.add('/play/' + k);
  return hrefs;
}

describe('nothing in the app is orphaned', () => {
  const routes = topLevelRoutes();
  const hrefs = everyLinkTarget();
  const reached = (r: string) => [...hrefs].some((h) => h === r || h.startsWith(r + '/') || h.startsWith(r + '?'));

  it('found a real app directory to walk', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it('every top-level route is either linked or listed as not navigable, with a reason', () => {
    const orphans = routes.filter((r) => !reached(r) && !(r in NOT_NAVIGABLE));
    expect(orphans, `nothing links to these — give each a home in lib/nav/doors.ts or a reason in NOT_NAVIGABLE`)
      .toEqual([]);
  });

  it('the athlete creator is linked, not only the /creator hub above it', () => {
    // HOTFIX (2026-09-24): the walk above sees top-level routes only, and /creator is linked -- so /creator/athlete
    // shipped with nothing pointing at it while this file stayed green. Its door is on Profile.
    expect(hrefs.has('/creator/athlete')).toBe(true);
  });

  it('the not-navigable list has not gone stale', () => {
    // A route that was excused and then deleted leaves a lie behind in the list.
    const gone = Object.keys(NOT_NAVIGABLE).filter((r) => r.startsWith('/') && !r.includes('.') && !routes.includes(r));
    expect(gone, 'these are excused but no longer exist').toEqual([]);
  });
});

describe('the doors', () => {
  it('sends every door to a route that exists', () => {
    const routes = topLevelRoutes();
    for (const d of DOORS) expect(routes, d.href).toContain('/' + d.href.split('/')[1]);
  });

  it('lists no door twice', () => {
    expect(new Set(DOORS.map((d) => d.href)).size).toBe(DOORS.length);
  });

  it('gives every tab some depth', () => {
    for (const t of TABS) expect(DOORS.filter((d) => d.tab === t.id).length, t.id).toBeGreaterThan(2);
  });
});
