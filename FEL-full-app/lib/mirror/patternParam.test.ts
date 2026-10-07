// MIRROR-MOVES P2 (2026-10-07; plan Phase 2 / item #19): `/play/mirror?pattern=<id>` opens that tab. Every link another lane
// builds into the Mirror — the coach's Form Check (liveMovements.ts) and the Playbook's "Check it on camera"
// (lib/education/lessonMovement.ts) — must land on its own tab; anything else lands on the default tab.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_MIRROR_TAB, MIRROR_TABS, isMirrorTab, tabFromParam } from './patternParam';
import { MIRROR_LIVE_MOVEMENTS, mirrorMovementHref } from './liveMovements';
import { LESSON_MOVEMENTS, MOVEMENT_LABEL, cameraHref } from '@/lib/education/lessonMovement';

const harness = readFileSync(new URL('../../app/play/mirror/_components/mirror-harness.tsx', import.meta.url), 'utf8');
/** The harness's tab keys, read from its PATTERN_SHORT map (what the picker draws). */
const harnessTabs = (() => {
  const block = harness.slice(harness.indexOf('const PATTERN_SHORT'), harness.indexOf('};', harness.indexOf('const PATTERN_SHORT')));
  return [...block.matchAll(/(\w+): '([^']+)'/g)].map((m) => m[1]);
})();
/** What the Mirror page does with a link: the browser's own URL parser, then the page's read. */
const landsOn = (href: string) => tabFromParam(new URL(href, 'https://fel.example').searchParams.get('pattern'));

describe('?pattern= → the tab', () => {
  it('the tab list is the harness\'s picker, in its order, and includes the hinge and the push-up', () => {
    expect([...MIRROR_TABS]).toEqual(harnessTabs);
    expect(MIRROR_TABS).toEqual(expect.arrayContaining(['squat', 'lunge', 'pressRow', 'jump', 'screen', 'hinge', 'pushup']));
    expect(harness).toMatch(/useState<Pattern>\(initialPattern\)/);
    expect(harness).toMatch(/useRef<Pattern>\(initialPattern\)/);
  });

  it.each(MIRROR_TABS.map((t) => [t]))('%s selects its own tab (and ignores case and spaces)', (tab) => {
    expect(tabFromParam(tab)).toBe(tab);
    expect(tabFromParam(tab.toUpperCase())).toBe(tab);
    expect(tabFromParam(`  ${tab.toLowerCase()} `)).toBe(tab);
    expect(landsOn(`/play/mirror?pattern=${tab}`)).toBe(tab);
    expect(isMirrorTab(tab)).toBe(true);
  });

  it.each([
    ['absent', undefined], ['null', null], ['empty', ''], ['unknown', 'deadlift'], ['an overhead registry id (not a tab)', 'overhead'],
    ['a carry (not a tab)', 'carry'], ['script-ish', '<script>'], ['a near miss', 'push-up'], ['an array of unknowns', ['nope', 'squat']],
  ] as const)('%s → the default tab (%j)', (_name, raw) => {
    expect(tabFromParam(raw as string | readonly string[] | null | undefined)).toBe(DEFAULT_MIRROR_TAB);
  });

  it('the default is the tab the Mirror has always opened on (press/row), and a repeated param reads its first value', () => {
    expect(DEFAULT_MIRROR_TAB).toBe('pressRow');
    expect(tabFromParam(['hinge', 'squat'])).toBe('hinge');
    expect(isMirrorTab('PUSHUP')).toBe(false);                     // the login carry takes only an exact key
  });
});

describe('every link into the Mirror lands on the right tab', () => {
  it('the coach\'s Form Check: one link per live movement, each to its own tab — the hinge and the push-up included', () => {
    expect(MIRROR_LIVE_MOVEMENTS.map((m) => m.id)).toEqual(expect.arrayContaining(['hinge', 'pushup']));
    for (const m of MIRROR_LIVE_MOVEMENTS) expect(landsOn(mirrorMovementHref(m.id)), m.id).toBe(m.id);
  });

  it('the Playbook\'s "Check it on camera": every lesson\'s movement lands on that movement\'s tab, never the default by accident', () => {
    expect(LESSON_MOVEMENTS.length).toBeGreaterThan(0);
    for (const l of LESSON_MOVEMENTS) {
      expect(isMirrorTab(l.movement), `${l.chapter}:${l.lesson} → ${l.movement}`).toBe(true);
      expect(landsOn(cameraHref(l.movement)), `${l.chapter}:${l.lesson}`).toBe(l.movement);
    }
    for (const id of Object.keys(MOVEMENT_LABEL)) expect(landsOn(cameraHref(id as keyof typeof MOVEMENT_LABEL)), id).toBe(id);
  });
});
