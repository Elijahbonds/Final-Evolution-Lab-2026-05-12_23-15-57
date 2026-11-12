// NEX-02: published venues are committed, reviewed JSON, still untrusted at load. With NOTHING published (today) every mode is
// byte-identical: its place list is the shipped array itself, its pick is the shipped one, and no target loads a Studio venue.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../babylon/scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));

import { PLACE_LOOKS, looksFor, readPlaceLook } from '../babylon/nexus/placeLooks';
import { propSetFor } from '../babylon/visual/VenueProps';
import {
  LOOK_ONLY_MODES, PUBLISHED_KIND, STUDIO_BASE_SETS, allPublished, packPublished, publishDepth, publishModesFor, publishedPath,
  publishedPlaceLooks, readPublished, resetPublishedMemo,
} from './published';
import { PUBLISHED_VENUE_FILES } from './published/index';
import { PLAYTEST_TARGETS } from './targets';
import { exportVenue } from './exportVenue';
import { newVenue } from './doc';
import { resetStudioVenueCache, studioIntroOr, studioLookFor, studioMood, studioPickFor, studioReplayAngles, studioVenueFor } from './runtime';
import { everyKindVenue, placed } from '@/tests/helpers/nexusStudio';
import { emptyCreatorDoc } from '@/lib/creator/look/doc';

const ROOT = join(__dirname, '..', '..');
const DIR = join(__dirname, 'published');
const PHONE = { drawCalls: 65, activeMeshes: 58, textureMb: 53, skinnedBodies: 4 };

function walk(d: string): string[] {
  return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
}
/** A venue that passes the gate: everything off the court and the lens. */
function cleanVenue() {
  const v = everyKindVenue();
  v.objects = v.objects.filter((o) => o.type !== 'decal');
  v.objects.push(placed('decal:scuff', [-12, 0, 12]));
  return v;
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetStudioVenueCache(); resetPublishedMemo(); });

describe('the committed files (CI refuses a bad publication before it ships)', () => {
  const files = walk(DIR).filter((f) => f.endsWith('.json'));
  const index = readFileSync(join(DIR, 'index.ts'), 'utf8');
  it('every file in published/ is a .venue.json under its mode, listed in the index, and passes the sanitiser and the gate', () => {
    const ids = new Set<string>();
    for (const f of files) {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      expect(rel, rel).toMatch(/^lib\/nexus-studio\/published\/[a-z0-9_]+\/[A-Za-z0-9_:-]+\.venue\.json$/);
      expect(index, `${rel} is not imported in published/index.ts`).toContain(`./${relative(DIR, f).replace(/\\/g, '/')}`);
      const r = readPublished(JSON.parse(readFileSync(f, 'utf8')));
      if (!r.ok) expect.fail(`${rel}: ${r.problems.join('; ')}`);
      expect(publishedPath(r.pub), 'the folder is the mode, the name the venue id').toBe(rel);
      const key = `${r.pub.mode}|${r.pub.venue.venueId}`;
      expect(ids.has(key), `${key} twice`).toBe(false);
      ids.add(key);
    }
    expect(PUBLISHED_VENUE_FILES.length).toBe(files.length);
    expect(allPublished().length).toBe(files.length);
  });
});

describe('nothing published: every mode is exactly as it shipped', () => {
  it('today nothing is published', () => {
    expect(PUBLISHED_VENUE_FILES).toEqual([]);
  });
  it('looksFor returns the shipped list itself, for every mode', () => {
    for (const k of Object.keys(PLACE_LOOKS)) {
      expect(looksFor(k), k).toBe(PLACE_LOOKS[k]);
      expect(publishedPlaceLooks(k)).toEqual([]);
    }
    expect(looksFor('nope')).toEqual([]);
  });
  it('readPlaceLook with no pick is the shipped home; no target loads a Studio venue in production, competitive or not', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const search of ['', '?arena=m1', '?place=studio:x', '?venue=b64:xx']) {
      vi.stubGlobal('window', { location: { search }, localStorage: { getItem: () => null, setItem: () => undefined } });
      resetStudioVenueCache();
      for (const k of Object.keys(PLAYTEST_TARGETS)) {
        expect(studioVenueFor(k), `${k} ${search}`).toBeNull();
        expect(studioLookFor(k)).toBeUndefined();
        expect(studioMood(k, 'goldenHour')).toBe('goldenHour');
        expect(studioIntroOr(k, 'walkIn')).toBe('walkIn');
        expect(studioReplayAngles(k)).toBeUndefined();
      }
      for (const k of Object.keys(PLACE_LOOKS)) if (!search.includes('place=')) expect(readPlaceLook(k)?.id ?? 'home').toBe(PLACE_LOOKS[k][0].id);
    }
  });
});

describe('what may be published where', () => {
  it('depths: the 4 targets full, Tennis and Baseball look-only, everything else none', () => {
    for (const k of Object.keys(PLAYTEST_TARGETS)) expect(publishDepth(k)).toBe('full');
    expect(publishDepth('tennis')).toBe('look');
    expect(publishDepth('baseball')).toBe('look');
    for (const k of ['golf', 'dunk', 'onevone', '__proto__', 'constructor', '']) expect(publishDepth(k), k).toBeNull();
    expect(publishModesFor('tiebreak').map((m) => `${m.mode}:${m.depth}`)).toEqual(['tiebreak:full', 'tennis:look']);
    expect(publishModesFor('derby').map((m) => `${m.mode}:${m.depth}`)).toEqual(['derby:full', 'baseball:look']);
    expect(publishModesFor('football').map((m) => m.mode)).toEqual(['football']);
    expect(publishModesFor('volleyball').map((m) => m.mode)).toEqual(['volleyball']);
    expect(publishModesFor('nope')).toEqual([]);
  });
  it('a look-only mode really mounts its target\'s spec and picks its place under its own key (the mode files)', () => {
    const tennis = readFileSync(join(ROOT, 'lib/babylon/modes/TennisMode.ts'), 'utf8');
    const net = readFileSync(join(ROOT, 'lib/babylon/modes/NetSportMode.ts'), 'utf8');
    expect(tennis).toMatch(/modeId: 'tennis',\n\s+venueId: 'tennis',/);
    expect(net).toContain('readPlaceLook(o.venueId)');
    expect(net).toContain('mountVenue(ctx, o.venueId,');
    expect(readFileSync(join(ROOT, 'lib/babylon/modes/BaseballInningsMode.ts'), 'utf8')).toContain("mountVenue(ctx, 'derby', { keepGameplayCamera: true, look: readPlaceLook('baseball') })");
    for (const [mode, m] of Object.entries(LOOK_ONLY_MODES)) {
      expect(PLAYTEST_TARGETS[m.target].spec, mode).toBe(m.spec);
      expect(PLACE_LOOKS[mode], mode).toBeTruthy();
    }
  });
  it('the base dressing table is VenueProps.propSetFor for every spec a venue is made on', () => {
    for (const t of Object.values(PLAYTEST_TARGETS)) expect(STUDIO_BASE_SETS[t.spec], t.spec).toBe(propSetFor(t.spec));
  });
});

describe('a publication is read as untrusted', () => {
  const good = () => packPublished(exportVenue(cleanVenue()), 'tiebreak', PHONE, new Date('2026-10-25T12:00:00Z'));
  it('Publish packs the export without its cast, the phone column rounded', () => {
    const cast = { player: { name: 'Nova', body: 'female' as const, doc: { ...emptyCreatorDoc(), colours: { jersey: '#FF3366' } }, base: { skinTone: '#8D5524' } } };
    const pub = packPublished(exportVenue(cleanVenue(), cast as never), 'tiebreak', { ...PHONE, textureMb: 53.4 });
    expect(pub.kind).toBe(PUBLISHED_KIND);
    expect(pub.venue).not.toHaveProperty('cast');
    expect(pub.phone.textureMb).toBe(53);
  });
  it('a good file reads back as itself', () => {
    const pub = good();
    const r = readPublished(JSON.parse(JSON.stringify(pub)));
    expect(r).toEqual({ ok: true, pub });
  });
  it('refused, with reasons: a cast, the wrong mode, the wrong spec for a look mode, no phone column, the gate, junk', () => {
    const pub = good();
    const bad = (over: Record<string, unknown>) => readPublished({ ...JSON.parse(JSON.stringify(pub)), ...over });
    const why = (r: ReturnType<typeof readPublished>) => (r.ok ? [] : r.problems).join(' | ');
    const member = { name: 'Nova', body: 'female', doc: { ...emptyCreatorDoc(), colours: { jersey: '#FF3366' } }, base: { skinTone: '#8D5524' } };
    expect(why(bad({ venue: { ...pub.venue, cast: { player: member } } }))).toMatch(/may not carry a cast/);
    expect(why(bad({ mode: 'football' }))).toMatch(/made for "tiebreak", not "football"/);
    expect(why(bad({ mode: 'baseball' }))).toMatch(/Baseball takes a derby venue/);
    expect(why(bad({ mode: 'golf' }))).toMatch(/"golf" takes no published venue/);
    expect(why(bad({ phone: undefined }))).toMatch(/Measure the venue on Phone first/);
    expect(why(bad({ phone: { ...PHONE, drawCalls: 9000 } }))).toMatch(/9000 draw calls; the ceiling is 600/);
    const onCourt = packPublished(exportVenue(everyKindVenue()), 'tiebreak', PHONE);
    expect(why(readPublished(onCourt))).toMatch(/scuff mark at \(0\.6, 11\.4\) is on Tiebreak’s playing area/);
    expect(why(bad({ kind: 'x' }))).toMatch(/not a published/);
    expect(why(bad({ venue: { nope: 1 } }))).toMatch(/not a valid export/);
    expect(readPublished(null).ok).toBe(false);
  });
  it('a refused file is skipped at load with a warning, and a venue listed twice loads once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pub = good();
    const files = [pub, { ...pub, mode: 'golf' }, pub];
    expect(allPublished(files).length).toBe(1);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
  it('the look a published venue lays: its sky, floor, props and dressing, under a studio: id that is never home', () => {
    const pub = good();
    const look = publishedPlaceLooks('tiebreak', [pub])[0];
    expect(look.id).toBe(`studio:${pub.venue.venueId}`);
    expect(look.sky).toEqual(pub.venue.look.sky);
    expect(look.ground).toEqual(pub.venue.look.ground);
    expect(look.propSet).toBe(`studio_pub_${pub.venue.venueId}`);
    expect(publishedPlaceLooks('volleyball', [pub])).toEqual([]);
  });
  it('a venue made with no kit and the spec\'s dressing kept leaves the dressing alone', () => {
    const v = newVenue('Bare', { spec: 'tennis', target: 'tiebreak' });
    const look = publishedPlaceLooks('tiebreak', [packPublished(exportVenue(v), 'tiebreak', PHONE)])[0];
    expect(look).not.toHaveProperty('propSet');
  });
});

describe('the runtime source: published picks, dev hand-offs, competitive runs', () => {
  it('studioPickFor reads published only through the files it is given (no file, no pick)', () => {
    vi.stubGlobal('window', { location: { search: '' }, localStorage: { getItem: () => null, setItem: () => undefined } });
    expect(studioPickFor('tiebreak', { env: 'production', files: [] })).toBeNull();
  });
});
