// NEX-02 + NEX-03 with a venue PUBLISHED (the index stood in by a fixture): it is the mode's default place, Restore gives the
// shipped place back in one tap, it reaches production with its full depth in normal play — and in every competitive context
// (arena, challenge link, async challenge, ladder, live play, ranked) it is the look only: no scripts, no camera actions, no cast,
// and never a dev `?venue=`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fx = vi.hoisted(() => ({ files: [] as unknown[] }));
vi.mock('./published/index', () => ({ get PUBLISHED_VENUE_FILES() { return fx.files; } }));
vi.mock('../babylon/scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));

import { NullEngine, Scene } from '@babylonjs/core';
import { PLACE_LOOKS, looksFor, readPlaceLook } from '../babylon/nexus/placeLooks';
import { COMPETITIVE_PARAMS, RANKED_PARAMS, isCompetitive, playStampFor } from '../babylon/core/playFrame';
import { packPublished, resetPublishedMemo, restorePlace, type PublishedVenue } from './published';
import { exportVenue } from './exportVenue';
import { pointWonGraph } from './scripts';
import { encodeInline } from './storage';
import { mountStudioFor, resetStudioVenueCache, studioIntro, studioIntroOr, studioLookFor, studioMood, studioPickFor, studioReplayAngles, studioVenueFor } from './runtime';
import { everyKindVenue, placed } from '@/tests/helpers/nexusStudio';
import { installOffscreenShim } from '@/tests/helpers/canvasShim';

const PHONE = { drawCalls: 65, activeMeshes: 58, textureMb: 53, skinnedBodies: 4 };
let tiebreak: PublishedVenue;
let tennisLook: PublishedVenue;
const store = new Map<string, string>();

function page(search: string): void {
  vi.stubGlobal('window', {
    location: { search }, addEventListener: () => undefined, removeEventListener: () => undefined,
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } },
  });
  resetStudioVenueCache();
}

beforeEach(() => {
  const v = everyKindVenue();
  v.objects = v.objects.filter((o) => o.type !== 'decal');
  v.objects.push(placed('decal:scuff', [-12, 0, 12]));
  tiebreak = packPublished(exportVenue(v, null, [{ id: 'sc1', name: 'Point cheer', ...pointWonGraph() }]), 'tiebreak', PHONE);
  tennisLook = packPublished(exportVenue({ ...v, id: 'tennis_look', name: 'Owner Tennis' }), 'tennis', PHONE);
  fx.files = [tiebreak, tennisLook];
  resetPublishedMemo();
  store.clear();
  vi.stubEnv('NODE_ENV', 'production');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetStudioVenueCache(); resetPublishedMemo(); fx.files = []; });

describe('the published venue is the default place, with Restore', () => {
  it('first in the splash list, the shipped places after it, home first among them', () => {
    const list = looksFor('tiebreak');
    expect(list[0].id).toBe(`studio:${tiebreak.venue.venueId}`);
    expect(list[0].name).toBe(tiebreak.venue.name);
    expect(list.slice(1)).toEqual(PLACE_LOOKS.tiebreak);
    expect(looksFor('volleyball')).toBe(PLACE_LOOKS.volleyball);   // nothing published there: untouched
  });
  it('no pick: the published venue plays; Restore (home, picked or remembered) gives the shipped place back', () => {
    page('');
    expect(readPlaceLook('tiebreak')?.id).toBe(`studio:${tiebreak.venue.venueId}`);
    expect(studioVenueFor('tiebreak')?.venueId).toBe(tiebreak.venue.venueId);
    page('?place=home');
    expect(readPlaceLook('tiebreak')?.id).toBe('home');
    expect(studioVenueFor('tiebreak')).toBeNull();
    page('');
    store.set('fel-place-tiebreak', 'home');
    expect(studioVenueFor('tiebreak')).toBeNull();
    expect(studioMood('tiebreak', 'goldenHour')).toBe('goldenHour');
    page('?place=clay');
    expect(studioVenueFor('tiebreak')).toBeNull();
  });
  it('in production, normal play gets the full depth: the mood, the intro, the replay angles, the scripts, the look; never a cast', () => {
    page('');
    const pick = studioPickFor('tiebreak')!;
    expect(pick).toMatchObject({ source: 'published', competitive: false });
    expect(pick.exp.scripts?.length).toBe(1);
    expect(pick.exp).not.toHaveProperty('cast');
    expect(studioMood('tiebreak', 'goldenHour')).toBe('nightGame');
    expect(studioIntro('tiebreak')).toBe('walkIn');
    expect(studioIntroOr('tiebreak', 'establish')).toBe('walkIn');
    expect(studioReplayAngles('tiebreak')).toEqual(['low', 'side']);
    expect(studioLookFor('tiebreak')?.id).toBe(`studio:${tiebreak.venue.venueId}`);
  });
  it('the splash offers Restore exactly while a published venue is the pick, and it restores the shipped home place', async () => {
    const list = looksFor('tiebreak');
    expect(restorePlace(list, list[0].id)).toBe(PLACE_LOOKS.tiebreak[0]);
    expect(restorePlace(list, 'home')).toBeNull();
    expect(restorePlace(list, 'clay')).toBeNull();
    expect(restorePlace(PLACE_LOOKS.tiebreak, 'studio:x')).toBe(PLACE_LOOKS.tiebreak[0]);
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const splash = readFileSync(join(__dirname, '..', '..', 'components', 'games', 'boot-splash.tsx'), 'utf8');
    expect(splash).toContain('const restore = restorePlace(placeList, placeId);');
    expect(splash).toContain('onClick={() => pickPlace(restore.id)}');
  });
  it('a look-only mode lists its published look first; it is a place, not a Studio load', () => {
    page('');
    expect(looksFor('tennis')[0].id).toBe('studio:tennis_look');
    expect(readPlaceLook('tennis')?.sky).toEqual(tennisLook.venue.look.sky);
    expect(studioVenueFor('tennis')).toBeNull();   // Tennis has no target row: the look only, through its place pick
  });
});

describe('NEX-03: the competitive stamp', () => {
  it('playStampFor: each competitive key, present even empty, stamps competitive; arena, signature and ranked stamp ranked too', () => {
    expect(COMPETITIVE_PARAMS).toEqual(['arena', 'c', 'mp', 'signature', 'net', 'party', 'ranked']);
    expect(RANKED_PARAMS).toEqual(['arena', 'signature', 'ranked']);
    expect(playStampFor('')).toEqual({ felCompetitive: false, felRanked: false });
    expect(playStampFor('?place=clay&venue=x&playtest=1&story=n1&carnival=1')).toEqual({ felCompetitive: false, felRanked: false });
    for (const k of COMPETITIVE_PARAMS) {
      for (const q of [`?${k}=abc`, `?${k}=`, `place=home&${k}=1`]) {
        expect(playStampFor(q), q).toEqual({ felCompetitive: true, felRanked: RANKED_PARAMS.includes(k) });
      }
    }
    expect(playStampFor(new URLSearchParams('arena=m1'))).toEqual({ felCompetitive: true, felRanked: true });
    expect(isCompetitive({ felCompetitive: true })).toBe(true);
    expect(isCompetitive({ felRanked: true })).toBe(true);
    expect(isCompetitive({ felCompetitive: 'yes' })).toBe(false);
    expect(isCompetitive(undefined)).toBe(false);
  });
  for (const k of COMPETITIVE_PARAMS) {
    it(`?${k}=: the published venue is the look only — no scripts, no intro, no replay angles, no cast`, () => {
      page(`?${k}=x1`);
      const pick = studioPickFor('tiebreak')!;
      expect(pick).toMatchObject({ source: 'published', competitive: true });
      expect(pick.exp.scripts).toBeUndefined();
      expect(pick.exp.cast).toBeUndefined();
      expect(pick.exp.intro).toBe('none');
      expect(pick.exp.replayAngles).toEqual([]);
      expect(studioIntro('tiebreak')).toBeUndefined();
      expect(studioIntroOr('tiebreak', 'establish')).toBe('establish');   // the mode's own intro, not the venue's
      expect(studioReplayAngles('tiebreak')).toBeUndefined();
      // the look holds: the mood, the sky, the floor, the dressing
      expect(studioMood('tiebreak', 'goldenHour')).toBe('nightGame');
      expect(studioLookFor('tiebreak')?.sky).toEqual(tiebreak.venue.look.sky);
      expect(pick.exp.fixtures).toEqual(tiebreak.venue.fixtures);
    });
    it(`?${k}=: a dev ?venue= hand-off is never loaded, even in a development build`, () => {
      vi.stubEnv('NODE_ENV', 'development');
      const dev = exportVenue({ ...everyKindVenue(), id: 'dev_one' });
      page(`?venue=${encodeInline(dev)}&${k}=x1&place=home`);
      expect(studioVenueFor('tiebreak')).toBeNull();
      page(`?venue=${encodeInline(dev)}&place=home`);
      expect(studioVenueFor('tiebreak')?.venueId).toBe('dev_one');   // the control: without the key it loads
    });
  }
  it('ModeHarness stamps the page\'s answer on the scene in onScene, before the mode loads (one line, the only writer)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'babylon', 'core', 'ModeHarness.ts'), 'utf8');
    const at = src.indexOf('Object.assign(scene.metadata, pagePlayStamp());');
    expect(at).toBeGreaterThan(src.indexOf('onScene: (scene,'));
    expect(at).toBeLessThan(src.indexOf('mood: () => {'));
    expect(at).toBeLessThan(src.indexOf('await def.load(ctx);'));
    expect(src.match(/\.(felCompetitive|felRanked)\s*=/g) ?? []).toEqual([]);   // nothing else in the harness writes the stamp by hand
  });
  it('mountStudioFor reads the SCENE\'s stamp: a stamped scene gets the look only even when the page carries no key', () => {
    installOffscreenShim();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    page('');
    const engine = new NullEngine();
    for (const stamped of [false, true]) {
      const scene = new Scene(engine);
      scene.metadata = { felModeId: 'tiebreak', felTier: 'low', felCompetitive: stamped };
      const ex = mountStudioFor('tiebreak', { scene, setHud: () => undefined })!;
      expect(ex).not.toBeNull();
      const said = info.mock.calls.map((c) => String(c[0])).filter((s) => s.includes('[NEXUS-STUDIO] tiebreak')).pop()!;
      expect(said).toContain(stamped ? '(published, competitive: the look only)' : '(published)');
      expect(ex.layers.fixtures).toBeTruthy();
      ex.dispose();
      scene.dispose();
    }
    engine.dispose();
    info.mockRestore();
  });
});
