// /dev/adventure is a HIDDEN LINK on the live site (owner decision, 2026-10-06): served in production by its URL, never
// indexed, and linked from no menu, nav, picker or sitemap. Both halves are held here, so the page cannot quietly go
// back to a production 404, and nothing can quietly start linking to it.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments, sourceFiles } from '@/lib/testing/sourceScan';
import { ENABLED_BABYLON_MODES, MODES } from '@/lib/babylon/modes/registry';
import { AGENT_MODES } from '@/lib/babylon/core/agentModes';
import { PARTY_MODES } from '@/lib/party/catalog';

const ROOT = path.resolve(__dirname, '../../../..');
const PAGE = path.join(ROOT, 'app/dev/adventure/page.tsx');
const read = (f: string) => fs.readFileSync(f, 'utf8');

describe('/dev/adventure: a hidden link on the live site', () => {
  it('is served in production (no NODE_ENV gate, no notFound) and asks never to be indexed', () => {
    const src = stripComments(read(PAGE));
    expect(src).not.toMatch(/NODE_ENV/);
    expect(src).not.toMatch(/notFound/);
    expect(src).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
  });

  it('nothing links to it: no source outside its own folder names the route (comments aside)', () => {
    const files = sourceFiles(ROOT, ['app', 'components', 'lib'], fs, path)   // root-relative paths
      .filter((f) => !f.split(path.sep).join('/').startsWith('app/dev/adventure/'));
    expect(files.length).toBeGreaterThan(500);
    const linkers = files.filter((f) => /\/dev\/adventure\b/.test(stripComments(read(path.join(ROOT, f)))));
    expect(linkers).toEqual([]);
  });

  it('no menu, nav, picker, sitemap or robots list carries the Adventure', () => {
    for (const rel of ['lib/nav/families.ts', 'components/shell/tab-bar.tsx', 'lib/game-data.ts', 'lib/party/catalog.ts', 'app/sitemap.ts', 'app/robots.ts']) {
      expect(stripComments(read(path.join(ROOT, rel))), rel).not.toMatch(/adventure/i);
    }
    // lane/story (2026-11-21): the Play tab's Story door opens the Adventure's STORY (/play/adventure) — never the yard or the BR
    const doors = stripComments(read(path.join(ROOT, 'lib/nav/doors.ts')));
    expect(doors).not.toMatch(/\/dev\/adventure|adventure-br|adventure_br/i);
    expect(doors.match(/\/[\w/-]*adventure[\w-]*/gi) ?? []).toEqual(['/play/adventure']);
    expect(MODES.adventure).toBeTruthy();                          // registered: the page mounts it by key
    expect(ENABLED_BABYLON_MODES.has('adventure')).toBe(false);    // not enabled: no player route or picker serves it
    expect(AGENT_MODES.some((m) => m.id === 'adventure')).toBe(false);
    expect(PARTY_MODES.some((m) => m.id === 'adventure')).toBe(false);
  });
});

// ADVENTURE C (2026-10-07): /play/adventure-br is UNLISTED the same way (owner rule for new routes): served by its URL,
// noindex, linked from nothing, and its mode registered but not enabled.
describe('/play/adventure-br: unlisted', () => {
  const BR_PAGE = path.join(ROOT, 'app/play/adventure-br/page.tsx');

  it('is served (no NODE_ENV gate, no notFound, no sign-in wall) and asks never to be indexed', () => {
    const src = stripComments(read(BR_PAGE));
    expect(src).not.toMatch(/NODE_ENV/);
    expect(src).not.toMatch(/notFound/);
    expect(src).not.toMatch(/redirect\(/);
    expect(src).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
  });

  it('nothing links to it: no source outside its own folder names the route (comments aside)', () => {
    const files = sourceFiles(ROOT, ['app', 'components', 'lib'], fs, path)
      .filter((f) => !f.split(path.sep).join('/').startsWith('app/play/adventure-br/'));
    expect(files.length).toBeGreaterThan(500);
    const linkers = files.filter((f) => /\/play\/adventure-br\b/.test(stripComments(read(path.join(ROOT, f)))));
    expect(linkers).toEqual([]);
  });

  it('its mode is registered for the page and the probe, and enabled nowhere', () => {
    expect(MODES.adventure_br).toBeTruthy();
    expect(ENABLED_BABYLON_MODES.has('adventure_br')).toBe(false);
    expect(AGENT_MODES.some((m) => m.id === 'adventure_br')).toBe(false);
    expect(PARTY_MODES.some((m) => m.id === 'adventure_br')).toBe(false);
  });
});

// PHASE B (2026-10-07): /play/adventure, the story, was UNLISTED the same way (owner decision 2026-10-06: new routes are
// reachable by URL, noindex, linked from no menu, picker or sitemap until the owner says). Its own case, beside the
// yard's: served (no notFound, no environment gate), noindex. The route pattern stops at `adventure` so the BR's own route
// (Phase C's `/play/adventure-br`) is not this one.
// lane/story (2026-11-21, flagged): the owner said "Adventure REPLACES Story" (2026-10-20) and "Make sure the story ... is
// finished" (2026-11-21), so the story is LISTED now — by exactly two doors, the Play tab's Story door and Venice's story gate —
// and still noindex. The old assertion ("nothing links to it") became "only these two doors link to it".
describe('/play/adventure: the story, linked from its two doors only', () => {
  const STORY_PAGE = path.join(ROOT, 'app/play/adventure/page.tsx');
  const STORY_ROUTE = /\/play\/adventure(?![-\w])/;

  it('is served (no NODE_ENV gate, no notFound, no sign-in redirect) and asks never to be indexed', () => {
    const src = stripComments(read(STORY_PAGE));
    expect(src).not.toMatch(/NODE_ENV/);
    expect(src).not.toMatch(/notFound/);
    expect(src).not.toMatch(/redirect\(/);
    expect(src).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
  });

  it('only its doors link to it: the Play tab\'s Story door and Venice\'s story gate (comments aside)', () => {
    const files = sourceFiles(ROOT, ['app', 'components', 'lib'], fs, path)
      .filter((f) => !f.split(path.sep).join('/').startsWith('app/play/adventure/'));
    expect(files.length).toBeGreaterThan(500);
    const linkers = files.filter((f) => STORY_ROUTE.test(stripComments(read(path.join(ROOT, f))))).map((f) => f.split(path.sep).join('/')).sort();
    expect(linkers).toEqual(['lib/adventure/venice/storyDoor.ts', 'lib/nav/doors.ts']);
  });

  it('the mode stays out of every enabled list (the story mounts MODES.adventure by key, by its own route)', () => {
    expect(ENABLED_BABYLON_MODES.has('adventure')).toBe(false);
    expect(AGENT_MODES.some((m) => m.id === 'adventure')).toBe(false);
    expect(PARTY_MODES.some((m) => m.id === 'adventure')).toBe(false);
    expect(stripComments(read(path.join(ROOT, 'app/sitemap.ts')))).not.toMatch(/adventure/i);
  });
});

