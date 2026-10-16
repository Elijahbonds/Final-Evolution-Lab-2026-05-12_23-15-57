// Track 3 (studio-4b): project characters seated AMONG THE FANS, visual only. The seats are the crowd's own empty ones — measured
// against the crowd the mode really mounts — never in front of the play camera, spread out, none on a phone; the bodies are
// opponent-role spawns on the kit URL (never the scene's player); the cast list is data with an exact undo.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../babylon/scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));

import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { CAST_SPACING_M, CROWD_CAST_MAX, CROWD_SEED, crowdCastSeats, crowdVenueOf, resolveCast, sanitizeCast, type CastMember } from './cast';
import { mountCrowdCastLayer } from './castLayer';
import { mountCrowdLayer } from './runtime';
import { exportVenue, parseVenueExport, type ExportCrowd } from './exportVenue';
import { addCharacter, removeCharacter, toggleCrowdCast } from './edits';
import { createStack, execute, undo } from './commands';
import { sanitizeProject, serializeProject, LIMITS } from './doc';
import { CharacterLibrary } from '../babylon/core/CharacterLibrary';
import { isPlayerBodyUrl, urlForHeroBody } from '../babylon/core/heroBody';
import { DEFAULT_HERO_URL, FORGE_HERO_URL } from '../babylon/core/athleteRoster';
const HERO_URL_NAMES: string[] = [DEFAULT_HERO_URL, FORGE_HERO_URL];
import { CARD_BEYOND_M, layoutSeats, pastLine } from '../babylon/visual/crowd/crowdLayout';
import { everyKindProject, placed } from '@/tests/helpers/nexusStudio';
import { castCode } from '@/tests/helpers/studioCast';

afterEach(() => vi.restoreAllMocks());

const crowdOf = (project = everyKindProject()): ExportCrowd => exportVenue(project.venues[0]).crowd!;
const dist3 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('the seats: the crowd\'s own empty ones', () => {
  it('the venue laid here is the one the mode mounts: the same seat count as the mounted crowd', () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    new FreeCamera('c', new Vector3(0, 4, 15), scene);
    scene.metadata = { felTier: 'desktop' };
    const crowd = crowdOf();
    const mounted = mountCrowdLayer({ scene }, crowd);
    expect(mounted.seats).toBeGreaterThan(0);
    expect(layoutSeats(crowdVenueOf(crowd), CROWD_SEED)).toHaveLength(mounted.seats);
    mounted.dispose(); scene.dispose(); engine.dispose();
  });
  it('a cast seat is never a seat a fan sits in, never in front of the camera line, never past the card distance; spread out', () => {
    const crowd = crowdOf();
    const v = crowdVenueOf(crowd);
    const fans = layoutSeats(v, CROWD_SEED);
    const seats = crowdCastSeats(crowd, CROWD_CAST_MAX);
    expect(seats).toHaveLength(CROWD_CAST_MAX);
    for (const s of seats) {
      expect(s.kind).toBe('gap');
      expect(Math.min(...fans.map((f) => dist3(f.pos, s.pos)))).toBeGreaterThan(0.2);   // its own seat, not on a fan's lap
      expect(pastLine(s.pos, v.camera)).toBeGreaterThanOrEqual(v.camera.margin);
      expect(dist3(s.pos, v.eye)).toBeLessThanOrEqual(CARD_BEYOND_M);
    }
    for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) expect(dist3(seats[i].pos, seats[j].pos)).toBeGreaterThanOrEqual(CAST_SPACING_M);
    // deterministic, and facing the play like the fans around it (within the fans' own spread)
    expect(crowdCastSeats(crowd, CROWD_CAST_MAX)).toEqual(seats);
    const near = (s: (typeof seats)[number]) => fans.reduce((a, b) => (dist3(a.pos, s.pos) < dist3(b.pos, s.pos) ? a : b));
    for (const s of seats) expect(Math.abs(Math.atan2(Math.sin(s.yaw - near(s).yaw), Math.cos(s.yaw - near(s).yaw)))).toBeLessThan(0.35);
  });
  it('a packed stand has no gap: the cast takes the aisle (a row\'s end), still past the camera line', () => {
    const crowd = crowdOf();
    const packed: ExportCrowd = { ...crowd, stands: crowd.stands.map((s) => ({ ...s, gaps: 0 })) };
    const seats = crowdCastSeats(packed, 2);
    expect(seats).toHaveLength(2);
    for (const s of seats) {
      expect(s.kind).toBe('aisle');
      expect(pastLine(s.pos, crowdVenueOf(packed).camera)).toBeGreaterThanOrEqual(packed.camera.margin);
    }
  });
  it('an aisle in front of the camera line is never offered, even when it is the nearest', () => {
    const crowd = crowdOf();
    // one packed stand along the west side, long enough that its near end runs past the play camera (z = 15.8)
    const long: ExportCrowd = { ...crowd, stands: [{ ...crowd.stands[0], front: [-11.5, 0, 5], width: 40, gaps: 0 }] };
    const v = crowdVenueOf(long);
    const seats = crowdCastSeats(long, 4);
    expect(seats.length).toBeGreaterThan(0);
    for (const s of seats) expect(pastLine(s.pos, v.camera)).toBeGreaterThanOrEqual(v.camera.margin);
  });
  it('no stand, or nobody cast: no seat', () => {
    expect(crowdCastSeats(null, 3)).toEqual([]);
    expect(crowdCastSeats(crowdOf(), 0)).toEqual([]);
  });
});

describe('the bodies: opponent-role spawns on the kit URL, none on a phone', () => {
  const member = async (): Promise<CastMember> => { const p = everyKindProject(); const code = await castCode(); const r = await resolveCast({ characters: [{ id: 'c1', name: 'Nova', lookCode: code }] }, { cast: { crowd: ['c1'] } }); void p; return r!.crowd![0]; };
  it('desktop: one spawn per seat, role opponent (never the scene\'s player), the kit body, the seat\'s spot; dispose cancels', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const spawn = vi.spyOn(CharacterLibrary, 'spawn').mockImplementation(async () => { throw new Error('no GLB in node'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = await member();
    const layer = mountCrowdCastLayer(scene, [m, { ...m, name: 'Two' }], crowdOf(), { tier: 'desktop' });
    expect(layer.seats).toHaveLength(2);
    expect(spawn).toHaveBeenCalledTimes(2);
    const [, url, opts] = spawn.mock.calls[0] as unknown as [Scene, string, { role: string; identity: boolean; position: Vector3 }];
    expect(url).toBe(urlForHeroBody('kit-female'));
    expect(isPlayerBodyUrl(url) && !HERO_URL_NAMES.includes(url)).toBe(true);   // the kit file itself: no hero URL, so no roster swap
    expect(opts.role).toBe('opponent');
    expect(opts.identity).toBe(false);
    expect(opts.position.asArray()).toEqual(layer.seats[0].pos);
    expect(await layer.ready).toEqual([]);   // the stand-in spawn failed: logged, nothing half-made
    expect(warn).toHaveBeenCalled();
    layer.dispose(); scene.dispose(); engine.dispose();
  });
  it('the mobile tier keeps its card crowd: no spawn', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const spawn = vi.spyOn(CharacterLibrary, 'spawn');
    const layer = mountCrowdCastLayer(scene, [await member()], crowdOf(), { tier: 'mobile' });
    expect(layer.seats).toEqual([]);
    expect(spawn).not.toHaveBeenCalled();
    scene.dispose(); engine.dispose();
  });
});

describe('the crowd cast is data', () => {
  it('seat, unseat, the cap, delete the character: one undo step each, exact undo', async () => {
    const p = everyKindProject();
    const code = await castCode();
    let s = createStack(p);
    const ids: string[] = [];
    for (let i = 0; i < CROWD_CAST_MAX + 1; i++) { const r = addCharacter(s.doc, { name: `Fan ${i}`, lookCode: code }); s = execute(s, r.cmd); ids.push(r.id); }
    const v = () => s.doc.venues[0];
    for (const id of ids.slice(0, CROWD_CAST_MAX)) s = execute(s, toggleCrowdCast(v(), id)!);
    expect(v().cast?.crowd).toEqual(ids.slice(0, CROWD_CAST_MAX));
    expect(toggleCrowdCast(v(), ids[CROWD_CAST_MAX])).toBeNull();   // full
    s = execute(s, toggleCrowdCast(v(), ids[1])!);
    expect(v().cast?.crowd).toEqual([ids[0], ids[2], ids[3]]);
    s = undo(s);
    expect(v().cast?.crowd).toEqual(ids.slice(0, CROWD_CAST_MAX));
    s = execute(s, removeCharacter(s.doc, ids[0])!);
    expect(v().cast?.crowd).toEqual(ids.slice(1, CROWD_CAST_MAX));
    s = undo(s);
    expect(v().cast?.crowd).toEqual(ids.slice(0, CROWD_CAST_MAX));
    expect(s.doc.characters.some((c) => c.id === ids[0])).toBe(true);
  });
  it('the export carries the decoded crowd; the mode re-sanitises it and caps it', async () => {
    const code = await castCode();
    const p = everyKindProject();
    p.characters = [{ id: 'c1', name: 'Nova', lookCode: code }, { id: 'c2', name: 'Bad', lookCode: 'FEL2.broken.0000000' }];
    const v = { ...p.venues[0], cast: { crowd: ['c1', 'c2', 'ghost'] } };
    const cast = await resolveCast(p, v);
    expect(cast?.crowd?.map((m) => m.name)).toEqual(['Nova']);   // a code that will not decode is left out, never half-applied
    const back = parseVenueExport(JSON.stringify(exportVenue(v, cast)));
    expect(back?.cast?.crowd?.[0].body).toBe('female');
    const flood = sanitizeCast({ crowd: Array.from({ length: 10 }, () => cast!.crowd![0]) });
    expect(flood?.crowd).toHaveLength(CROWD_CAST_MAX);
    expect(sanitizeCast({ crowd: ['x', 3, null] })).toBeNull();
  });
  it('a saved project keeps the crowd; an import drops ids it does not have and caps the list', () => {
    const p = everyKindProject();
    p.characters = [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }];
    const raw = JSON.parse(serializeProject({ ...p, venues: [{ ...p.venues[0], cast: { player: 'c2', crowd: ['c1', 'ghost', 'c1', 'c2'] } }] }));
    const r = sanitizeProject(raw);
    expect(r.ok && r.project.venues[0].cast).toEqual({ player: 'c2', crowd: ['c1', 'c2'] });
    raw.venues[0].cast = { crowd: Array.from({ length: 9 }, (_, i) => `c${i}`) };
    raw.characters = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `C${i}` }));
    const capped = sanitizeProject(raw);
    expect(capped.ok && capped.project.venues[0].cast?.crowd).toHaveLength(LIMITS.crowdCast);
    raw.venues[0].cast = { crowd: ['ghost'] };
    const gone = sanitizeProject(raw);
    expect(gone.ok && 'cast' in gone.project.venues[0]).toBe(false);
  });
});

void placed;
