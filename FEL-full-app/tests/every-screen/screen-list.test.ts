// EVERY-SCREEN phase 1: the list of screens the scorecard is built on (scripts/every-screen/routes.mts).
// A page added to app/ is on the scorecard the day it lands; a dynamic route must come with an address the rig can open
// (or a written reason it cannot), so no screen is ever quietly skipped (docs/PLAN-EVERY-SCREEN-10PHASE.md).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { discover, ownerOf, ROOT } from '../../scripts/every-screen/routes.mts';

const pagesUnder = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? pagesUnder(p) : n === 'page.tsx' ? [p] : [];
});

describe('the every-screen list', () => {
  const screens = discover();

  it('is every page in app/ except the developer pages and the API', () => {
    const all = pagesUnder(join(ROOT, 'app'));
    const dev = all.filter((p) => p.startsWith(join(ROOT, 'app/dev') + '/'));
    expect(screens.length).toBe(all.length - dev.length);
    expect(screens.some((s) => s.route.startsWith('/dev'))).toBe(false);
    expect(screens.some((s) => s.route.startsWith('/api'))).toBe(false);
    expect(new Set(screens.map((s) => s.route)).size).toBe(screens.length);
  });

  it('gives every screen one owner phase, 2 to 9, and training and coaching is phases 2 to 5', () => {
    for (const s of screens) {
      expect([2, 3, 4, 5, 6, 7, 8, 9]).toContain(s.phase);
      expect(s.tc).toBe(s.phase <= 5);
      expect(existsSync(join(ROOT, s.file))).toBe(true);
    }
  });

  it('sorts the plan\'s own examples into the phase the plan names', () => {
    expect(ownerOf('/train').phase).toBe(2);
    expect(ownerOf('/train/programs/[id]').phase).toBe(2);
    expect(ownerOf('/train/build').phase).toBe(3);
    expect(ownerOf('/train/jumps').phase).toBe(4);
    expect(ownerOf('/play/mirror/assess').phase).toBe(4);
    expect(ownerOf('/train/progress').phase).toBe(4);
    expect(ownerOf('/groups/one-on-one').phase).toBe(5);
    expect(ownerOf('/coach/form-review').phase).toBe(5);
    expect(ownerOf('/account/bookings').phase).toBe(5);
    expect(ownerOf('/').phase).toBe(6);
    expect(ownerOf('/signup').phase).toBe(6);
    expect(ownerOf('/play/dunk').phase).toBe(7);
    expect(ownerOf('/wallet').phase).toBe(8);
    expect(ownerOf('/account').phase).toBe(8);
    expect(ownerOf('/education/playbook').phase).toBe(9);
    expect(ownerOf('/terms').phase).toBe(9);
  });

  it('has an address, or a written reason, for every dynamic route', () => {
    const src = readFileSync(join(ROOT, 'scripts/every-screen/fixtures.mts'), 'utf8');
    const missing = screens.filter((s) => s.dynamic && !src.includes(`'${s.route}':`)).map((s) => s.route);
    expect(missing).toEqual([]);
  });
});
