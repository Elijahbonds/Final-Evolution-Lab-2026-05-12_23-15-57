// The Studio document (docs/NEXUS-STUDIO.md §2): what survives a round trip, what an untrusted file cannot smuggle in,
// how versions are read, and that the doc's vocabularies are the engine's own lists.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACKDROPS, DECAL_KINDS as DOC_DECALS, FIXTURE_ROLES, GROUND_KINDS, LIMITS, MOODS, OBJECT_TYPES, REPLAY_ANGLES as DOC_ANGLES,
  STUDIO_DOC_VERSION, WEATHER_PICKS, duplicateObject, newProject, newVenue, parseProject, sanitizeProject, serializeProject,
  venueSettings, wrapAngle, activeVenue,
} from './doc';
import { MOODS as ENGINE_MOODS } from '../babylon/scene/moods';
import { DECAL_KINDS as ENGINE_DECALS } from '../babylon/visual/GroundDecals';
import { REPLAY_ANGLES as ENGINE_ANGLES } from '../babylon/scene/broadcastShots';
import { TIMES_OF_DAY, WEATHER_ALLOWED } from '../babylon/core/WeatherKit';
import { everyKindProject, everyKindVenue } from '@/tests/helpers/nexusStudio';

const ROOT = join(__dirname, '..', '..');

describe('round trip', () => {
  it('a project serialises and parses back to the same document, every kind of object included', () => {
    const p = everyKindProject();
    const r = parseProject(serializeProject(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project).toEqual(p);
    expect(r.dropped).toBe(0);
    expect(new Set(r.project.venues[0].objects.map((o) => o.type))).toEqual(new Set(OBJECT_TYPES));
  });

  it('sanitising a clean document changes nothing (idempotent)', () => {
    const p = everyKindProject();
    const once = sanitizeProject(JSON.parse(JSON.stringify(p)));
    const twice = once.ok ? sanitizeProject(JSON.parse(JSON.stringify(once.project))) : once;
    expect(once.ok && twice.ok && JSON.stringify(twice.project) === JSON.stringify(once.project)).toBe(true);
  });
});

describe('an untrusted file', () => {
  it('cannot place outside the world, scale to nothing, or carry a NaN', () => {
    const p = everyKindProject();
    const raw = JSON.parse(JSON.stringify(p));
    raw.venues[0].objects[0].t = { p: [1e9, -1e9, 'x'], ry: Number.NaN, s: 0 };
    const r = sanitizeProject(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = r.project.venues[0].objects[0].t;
    expect(t.p).toEqual([LIMITS.reach, LIMITS.heightMin, 0]);
    expect(t.ry).toBe(0);
    expect(t.s).toBe(LIMITS.scaleMin);
  });

  it('drops an object of an unknown kind, a gameplay prop and a kit path that climbs out of the folder — and counts them', () => {
    const raw = JSON.parse(JSON.stringify(everyKindProject()));
    const n = raw.venues[0].objects.length;
    raw.venues[0].objects.push(
      { id: 'a', type: 'nuke', name: 'x', t: {} },
      { id: 'b', type: 'specProp', kind: 'hoop', name: 'a second rim', t: {} },
      { id: 'c', type: 'kitProp', kit: '../../etc', model: 'passwd', name: 'x', t: {} },
    );
    const r = sanitizeProject(raw);
    expect(r.ok && r.project.venues[0].objects.length).toBe(n);
    expect(r.ok && r.dropped).toBe(3);
  });

  it('strips control characters and caps a name; a bad colour falls back', () => {
    const raw = JSON.parse(JSON.stringify(everyKindProject()));
    raw.name = 'evil\u0000name' + 'x'.repeat(500);
    const fix = raw.venues[0].objects.find((o: { type: string }) => o.type === 'fixture');
    fix.color = 'red; background:url(x)';
    const r = sanitizeProject(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.project.name).not.toContain('\u0000');
    expect(r.project.name.length).toBe(LIMITS.name);
    expect(r.project.venues[0].objects.find((o) => o.type === 'fixture')).toMatchObject({ color: '#fff1d6' });
  });

  it('re-mints colliding ids instead of letting two objects share one', () => {
    const raw = JSON.parse(JSON.stringify(everyKindProject()));
    const objs = raw.venues[0].objects;
    objs[1].id = objs[0].id;
    const r = sanitizeProject(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = r.project.venues[0].objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('imports script graphs as data only: an unknown node (a `run`, code) is dropped; a known node keeps only its spec\'s params', () => {
    const raw = JSON.parse(JSON.stringify(everyKindProject()));
    raw.scripts = [{ id: 's1', name: 'x', nodes: [{ run: 'alert(1)' }, { id: 'n1', kind: 'banner', x: 1, y: 2, params: { text: 'GO', onclick: 'alert(1)' } }], edges: [1] }];
    const r = sanitizeProject(raw);
    // test changed (phase 4): scripts now carry nodes, so the expectation names the one valid node instead of an empty graph;
    // the hostile node and edge are still dropped, and the banner's foreign `onclick` param is not kept
    expect(r.ok && r.project.scripts).toEqual([{ id: 's1', name: 'x', enabled: true, nodes: [{ id: 'n1', kind: 'banner', x: 1, y: 2, params: { text: 'GO', tone: 'score', seconds: 1.8 } }], edges: [] }]);
  });

  it('caps the object count', () => {
    const raw = JSON.parse(JSON.stringify(everyKindProject()));
    const one = raw.venues[0].objects[0];
    raw.venues[0].objects = Array.from({ length: LIMITS.objects + 50 }, (_, i) => ({ ...one, id: `o${i}` }));
    const r = sanitizeProject(raw);
    expect(r.ok && r.project.venues[0].objects.length).toBe(LIMITS.objects);
  });
});

describe('versions', () => {
  it('refuses a newer version with a reason, and anything that is not a project', () => {
    const raw = JSON.parse(JSON.stringify(everyKindProject()));
    raw.version = STUDIO_DOC_VERSION + 1;
    const r = sanitizeProject(raw);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/newer Studio/);
    expect(parseProject('{"kind":"something-else"}').ok).toBe(false);
    expect(parseProject('not json').ok).toBe(false);
  });

  it('a project with no openable venue is refused, not opened empty', () => {
    const raw = JSON.parse(JSON.stringify(everyKindProject()));
    raw.venues = [{ name: 'no base' }];
    expect(sanitizeProject(raw).ok).toBe(false);
  });

  it('an active venue id that does not exist falls back to the first venue', () => {
    const raw = JSON.parse(JSON.stringify(everyKindProject()));
    raw.activeVenueId = 'gone';
    const r = sanitizeProject(raw);
    expect(r.ok && r.project.activeVenueId).toBe(raw.venues[0].id);
  });
});

describe('constructors', () => {
  it('a duplicate has a new id, is nudged off the original and is never locked', () => {
    const v = everyKindVenue();
    const o = { ...v.objects[0], locked: true };
    const d = duplicateObject(o);
    expect(d.id).not.toBe(o.id);
    expect(d.t.p[0]).toBe(o.t.p[0] + 1);
    expect(d.locked).toBeUndefined();
  });

  it('venueSettings is the venue without its id and objects', () => {
    const s = venueSettings(everyKindVenue()) as unknown as Record<string, unknown>;
    expect('objects' in s || 'id' in s).toBe(false);
    expect(s.mood).toBe('nightGame');
  });

  it('activeVenue finds the active one', () => {
    const v = newVenue('a', { spec: 'tennis', target: 'tiebreak' });
    const w = newVenue('b', { spec: 'tennis', target: 'tiebreak' });
    const p = { ...newProject('p', v), venues: [v, w], activeVenueId: w.id };
    expect(activeVenue(p)?.name).toBe('b');
  });

  it('wrapAngle lands every angle in (−π, π]', () => {
    for (const a of [0, Math.PI, -Math.PI, 3 * Math.PI, -7.5, 100]) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThan(-Math.PI - 1e-9); expect(w).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 9);
    }
  });
});

describe('the vocabularies are the engine\'s own', () => {
  it('moods, decal kinds and replay angles match their sources', () => {
    expect([...MOODS].sort()).toEqual(Object.keys(ENGINE_MOODS).sort());
    expect([...DOC_DECALS]).toEqual([...ENGINE_DECALS]);
    expect(new Set(DOC_ANGLES)).toEqual(new Set([...ENGINE_ANGLES, 'filmer']));
  });
  it('the weather picks are natural, random, every condition and every time of day', () => {
    const conditions = new Set(Object.values(WEATHER_ALLOWED).flat());
    expect(new Set(WEATHER_PICKS)).toEqual(new Set(['natural', 'random', ...conditions, ...TIMES_OF_DAY]));
  });
  it('ground kinds, backdrops and fixture roles match the source type unions', () => {
    const scene = readFileSync(join(ROOT, 'lib/babylon/nexus/NexusWebScene.ts'), 'utf8');
    const union = (name: string) => [...(scene.match(new RegExp(`export type ${name} =([^;]+);`))?.[1].matchAll(/'([a-zA-Z]+)'/g) ?? [])].map((m) => m[1]);
    expect(new Set(GROUND_KINDS)).toEqual(new Set(union('GroundKind')));
    expect(new Set(BACKDROPS)).toEqual(new Set(union('BackdropKind')));
    const fixtures = readFileSync(join(ROOT, 'lib/babylon/scene/FixtureLights.ts'), 'utf8');
    expect(fixtures).toContain(`export type FixtureRole = ${FIXTURE_ROLES.map((r) => `'${r}'`).join(' | ')};`);
  });
});
