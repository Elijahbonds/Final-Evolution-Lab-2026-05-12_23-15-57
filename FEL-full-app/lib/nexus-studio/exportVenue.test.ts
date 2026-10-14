// THE EXPORT → MODE-LOAD CONTRACT (docs/NEXUS-STUDIO.md §2, §5). What the editor writes is what the mode reads: every
// placed kind lands in its layer, hidden things stay out, the mode re-validates what it is handed, and the PlaceLook it
// lays over the spec carries the venue's sky, ground and dressing.
import { describe, expect, it } from 'vitest';
import { EXPORT_KIND, exportVenue, parseVenueExport, sanitizeVenueExport } from './exportVenue';
import { studioLook, studioPropSetKey, studioVenueFor, resetStudioVenueCache, studioMood, studioIntro } from './runtime';
import { encodeInline, writePlaytest } from './storage';
import { VENUE_PROP_SETS } from '../babylon/visual/venuePropSets';
import { propSetFor } from '../babylon/visual/VenueProps';
import { applyLook } from '../babylon/core/NexusVenue';
import { specFor } from '../babylon/nexus/venueSpecs';
import { everyKindVenue, memoryKV } from '@/tests/helpers/nexusStudio';

describe('exportVenue', () => {
  const v = everyKindVenue();
  const exp = exportVenue(v);

  it('every visible kind lands in its own layer, the hidden palm in none', () => {
    expect(exp.kind).toBe(EXPORT_KIND);
    expect(exp.look.props.map((p) => p.kind)).toEqual(['banner']);
    expect(exp.kit).toHaveLength(1);
    expect(exp.kit[0]).toMatchObject({ kit: 'nature', model: 'tree_palmDetailedTall', at: [-14, 0, -24], yaw: 0.5, scale: 1.6 });
    expect(exp.meshy.map((m) => m.key)).toEqual(['hoopbus']);
    expect(exp.fixtures.map((f) => f.role)).toEqual(['flood', 'lamp']);
    expect(exp.crowd?.stands).toHaveLength(1);
    expect(exp.decals.map((d) => d.kind)).toEqual(['scuff']);
    expect(exp.subject).toEqual([0, 0, 10]);
    expect(JSON.stringify(exp)).not.toContain('tree_palmTall');   // the hidden one
  });

  it('carries the venue settings a mode needs: mood, intro, angles, weather, sky, ground', () => {
    expect(exp).toMatchObject({ spec: 'tennis', target: 'tiebreak', mood: 'nightGame', intro: 'walkIn', replayAngles: ['low', 'side'], weather: 'rain' });
    expect(exp.look.sky?.top).toBe('#0b0f1e');
    expect(exp.look.ground).toEqual({ color: '#1d3b6e', line: '#bfe9ff' });
  });

  it('a crowd stand faces its yaw from its front edge, with the target mode\'s camera line', () => {
    const s = exp.crowd!.stands[0];
    expect(s.front).toEqual([-11.5, 0, -3]);
    expect(s.yaw).toBeCloseTo(Math.PI / 2, 3);
    expect(exp.crowd!.camera.at).toEqual([0, 4.4, 15.8]);   // Tiebreak's (tennis') play camera
  });

  it('survives JSON both ways unchanged (what the mode reads is what was written)', () => {
    expect(parseVenueExport(JSON.stringify(exp))).toEqual(exp);
  });
});

describe('the mode re-validates what it is handed', () => {
  const base = JSON.parse(JSON.stringify(exportVenue(everyKindVenue())));

  it('refuses another kind, another version and a malformed venue id', () => {
    expect(sanitizeVenueExport({ ...base, kind: 'x' })).toBeNull();
    expect(sanitizeVenueExport({ ...base, version: 2 })).toBeNull();
    expect(sanitizeVenueExport({ ...base, venueId: '../../x' })).toBeNull();
    expect(sanitizeVenueExport(null)).toBeNull();
  });

  it('clamps a placement into the world, drops unknown kinds and kit paths that climb, caps the stand size', () => {
    const t = JSON.parse(JSON.stringify(base));
    t.kit.push({ kit: '..', model: 'x', at: [0, 0, 0], yaw: 0, scale: 1 });
    t.meshy[0].at = [1e9, 1e9, -1e9];
    t.fixtures.push({ role: 'laser', at: [0, 0, 0] });
    t.crowd.stands[0].rows = 1000;
    const s = sanitizeVenueExport(t)!;
    expect(s.kit).toHaveLength(1);
    expect(s.meshy[0].at).toEqual([400, 120, -400]);
    expect(s.fixtures).toHaveLength(2);
    expect(s.crowd!.stands[0].rows).toBe(12);
  });
});

describe('the PlaceLook the mode mounts', () => {
  it('keeps the spec\'s gameplay props and adds the Studio\'s dressing (NexusVenue.applyLook)', () => {
    const exp = exportVenue(everyKindVenue());
    const look = studioLook(exp);
    const spec = specFor('tennis')!;
    const laid = applyLook(spec, look);
    expect(laid.props.filter((p) => p.kind === 'net')).toHaveLength(1);        // the game's net is the spec's
    expect(laid.props.some((p) => p.kind === 'banner')).toBe(true);             // the Studio's banner joins it
    expect(laid.environment.skyTop).toBe('#0b0f1e');
    expect(laid.ground.color).toBe('#1d3b6e');
    expect(laid.ground.size).toEqual(spec.ground.size);                         // the court is the game: same size
  });

  it('registers one dressing set: the court\'s own set plus the Studio\'s kit props', () => {
    const exp = exportVenue(everyKindVenue());
    const key = studioPropSetKey(exp)!;
    const base = VENUE_PROP_SETS[propSetFor('tennis')!];
    expect(VENUE_PROP_SETS[key]).toHaveLength(base.length + 1);
    expect(VENUE_PROP_SETS[key].at(-1)).toMatchObject({ kit: 'nature', model: 'tree_palmDetailedTall' });
  });

  it('a bare venue drops the court\'s set; a venue that keeps it and adds nothing leaves the spec\'s choice alone', () => {
    const v = everyKindVenue();
    v.objects = v.objects.filter((o) => o.type !== 'kitProp');
    expect(studioPropSetKey(exportVenue({ ...v, baseDressing: 'none' }))).toBeNull();
    expect(studioPropSetKey(exportVenue({ ...v, baseDressing: 'keep' }))).toBeUndefined();
    expect('propSet' in studioLook(exportVenue({ ...v, baseDressing: 'keep' }))).toBe(false);
  });
});

describe('studioVenueFor: the dev-only ?venue= load path', () => {
  const exp = exportVenue(everyKindVenue());
  const kv = memoryKV();
  writePlaytest(kv, exp);

  it('finds the export by id or inline, for its own mode only', () => {
    resetStudioVenueCache();
    expect(studioVenueFor('tiebreak', `?venue=${exp.venueId}`, kv, 'development')).toEqual(exp);
    expect(studioVenueFor('tiebreak', `?venue=${encodeInline(exp)}`, kv, 'development')).toEqual(exp);
    expect(studioVenueFor('volleyball', `?venue=${exp.venueId}`, kv, 'development')).toBeNull();
  });

  it('is null in a production build, without the parameter, and for an unknown id', () => {
    expect(studioVenueFor('tiebreak', `?venue=${exp.venueId}`, kv, 'production')).toBeNull();
    expect(studioVenueFor('tiebreak', '', kv, 'development')).toBeNull();
    expect(studioVenueFor('tiebreak', '?venue=nothing_here', kv, 'development')).toBeNull();
  });

  it('with no Studio venue the mode keeps exactly its own mood and no intro', () => {
    resetStudioVenueCache();
    // node has no window: the page has no ?venue=
    expect(studioMood('tiebreak', 'goldenHour')).toBe('goldenHour');
    expect(studioIntro('tiebreak')).toBeUndefined();
  });
});
