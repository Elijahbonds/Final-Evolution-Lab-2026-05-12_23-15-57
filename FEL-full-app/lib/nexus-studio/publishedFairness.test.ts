// A PUBLISHED VENUE NEVER CHANGES GAMEPLAY (NEX-02; the round-8 brief: "bit-identical scripted matches, with and without it").
// The castFairness method (docs/NEXUS-STUDIO.md §10.5): the real Tiebreak mode on a NullEngine, a fixed seed, a scripted player that
// reads only what a person sees, one whole match. Played three times in a PRODUCTION build — the shipped place (Restore), the
// owner's published venue at full depth (floods and lamps, a crowd stand, a placed mark, rain, a walk-in intro, replay angles and a
// "point won → cheer + banner + confetti" script), and the same venue in an arena run (the look only) — every score, judgement,
// HUD line, clip, sound, ball position, ring state, camera position and target, and the end are identical. The only HUD
// difference allowed is the script's own `studio*` banner keys (scriptHost.ts STUDIO_HUD_KEYS), and the test shows they fired.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ clips: [] as string[], sounds: [] as string[] }));
const fx = vi.hoisted(() => ({ files: [] as unknown[] }));
vi.mock('./published/index', () => ({ get PUBLISHED_VENUE_FILES() { return fx.files; } }));
vi.mock('../babylon/core/CharacterLibrary', async () => (await import('@/tests/helpers/tiebreakRally')).standInLibrary());
vi.mock('../babylon/core/NexusVenue', () => ({ mountVenue: () => null }));
vi.mock('../babylon/anim/importSanitizer', async (orig) => ({ ...(await orig<typeof import('../babylon/anim/importSanitizer')>()), neverBindPose: () => undefined }));
vi.mock('../babylon/anim/clipRegistry', async (orig) => ({ ...(await orig<typeof import('../babylon/anim/clipRegistry')>()), installSafePlay: () => undefined }));
vi.mock('../babylon/anim/beatOwner', () => ({
  BeatOwner: class {
    constructor(private a: { who: string }) {}
    loop(clip: string): void { log.clips.push(`${this.a.who}:loop:${clip}`); }
    beat(clip: string): void { log.clips.push(`${this.a.who}:${clip}`); }
  },
}));
vi.mock('../babylon/audio/SoundKit', () => ({ SoundKit: { play: (k: string) => { log.sounds.push(k); }, unlock: () => undefined, startAmbient: () => undefined, stopAmbient: () => undefined } }));
vi.mock('../babylon/premium/Haptics', () => ({ HAPTIC: { tap: () => undefined }, padRumble: () => undefined }));
vi.mock('../babylon/visual/EffectsKit', () => ({ EffectsKit: { ballTrail: () => ({ dispose: () => undefined }), burst: () => undefined }, applyTrail: () => undefined }));
vi.mock('../babylon/visual/meshyProps', () => ({ dressBall: async () => false, spawnMeshyProp: async () => null }));
vi.mock('../babylon/scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));
vi.mock('@/lib/a11y/reducedMotion', async (orig) => ({
  ...(await orig<typeof import('@/lib/a11y/reducedMotion')>()),
  motionPolicy: () => ({ reduced: false, flash: true, travel: true, shake: true, hitStop: true }),
}));

import { TiebreakMode } from '../babylon/modes/TiebreakMode';
import { invalidateIdentity } from '../babylon/core/playerIdentity';
import { exportVenue } from './exportVenue';
import { packPublished, resetPublishedMemo, type PublishedVenue } from './published';
import { pointWonGraph } from './scripts';
import { resetStudioVenueCache, studioPickFor } from './runtime';
import { everyKindVenue, placed } from '@/tests/helpers/nexusStudio';
import { installOffscreenShim } from '@/tests/helpers/canvasShim';
import { playRally, type RallyTrace } from '@/tests/helpers/tiebreakRally';

let pub: PublishedVenue;

function onPage(search: string): void {
  vi.stubGlobal('window', { location: { search }, addEventListener: () => undefined, removeEventListener: () => undefined, localStorage: { getItem: () => null, setItem: () => undefined } });
  resetStudioVenueCache();
  invalidateIdentity();
}

async function match(search: string): Promise<RallyTrace & { studioHud: string[] }> {
  onPage(search);
  log.clips.length = 0; log.sounds.length = 0;
  const t = await playRally({ mode: TiebreakMode, clipLog: log.clips });
  // the script host's own banner keys are presentation; everything the MODE posted must match exactly
  const studioHud: string[] = [];
  const hud: string[] = [];
  for (const line of t.hud) {
    const o = JSON.parse(line) as Record<string, unknown>;
    const mine = Object.keys(o).filter((k) => k.startsWith('studio'));
    if (mine.length) studioHud.push(JSON.stringify(Object.fromEntries(mine.map((k) => [k, o[k]]))));
    for (const k of mine) delete o[k];
    if (Object.keys(o).length) hud.push(JSON.stringify(o));
  }
  return { ...t, hud: [...hud, `sounds:${log.sounds.join(',')}`], clips: [...log.clips], studioHud };
}

function sameGame(a: RallyTrace, b: RallyTrace): void {
  expect(b.end).toEqual(a.end);
  expect(b.inputs).toEqual(a.inputs);
  expect(b.hud).toEqual(a.hud);
  expect(b.clips).toEqual(a.clips);
  expect(b.frames.length).toBe(a.frames.length);
  for (let f = 0; f < a.frames.length; f++) {
    for (let k = 0; k < a.frames[f].length; k++) if (!Object.is(a.frames[f][k], b.frames[f][k])) expect.fail(`frame ${f} value ${k}: ${a.frames[f][k]} vs ${b.frames[f][k]}`);
  }
}

beforeEach(() => {
  installOffscreenShim();
  const v = everyKindVenue();
  v.objects = v.objects.filter((o) => o.type !== 'decal');
  v.objects.push(placed('decal:scuff', [-12, 0, 12]), placed('fixture:flood', [11, 0, -17], -0.6), placed('fixture:lamp', [-9.6, 0, 6]));
  v.intro = 'walkIn';
  pub = packPublished(exportVenue(v, null, [{ id: 'sc1', name: 'Point cheer', ...pointWonGraph() }]), 'tiebreak', { drawCalls: 65, activeMeshes: 58, textureMb: 53, skinnedBodies: 4 });
  fx.files = [pub];
  resetPublishedMemo();
  vi.stubEnv('NODE_ENV', 'production');
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 25, 12));   // the mode seeds its RNG from Date.now
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 })));
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); resetStudioVenueCache(); resetPublishedMemo(); invalidateIdentity(); fx.files = []; });

describe('a published venue is the look of the game, never the game', () => {
  it('Tiebreak: the shipped place, the published venue (full depth) and the published venue in an arena run play one bit-identical match', async () => {
    const place = `studio:${pub.venue.venueId}`;
    // the controls: what each run really loaded
    onPage('?place=home');
    expect(studioPickFor('tiebreak')).toBeNull();
    onPage(`?place=${place}`);
    expect(studioPickFor('tiebreak')).toMatchObject({ source: 'published', competitive: false });
    onPage(`?place=${place}&arena=m1`);
    expect(studioPickFor('tiebreak')).toMatchObject({ source: 'published', competitive: true });

    const shipped = await match('?place=home');
    const published = await match(`?place=${place}`);
    const arena = await match(`?place=${place}&arena=m1`);

    // the script played a real match: it ended, both sides scored, every kind of judgement was made
    expect(shipped.end).not.toBeNull();
    const [, , stats] = shipped.end as [string, number, { myPts: number; aiPts: number; bestRally: number }];
    expect(stats.myPts).toBeGreaterThan(0);
    expect(stats.aiPts).toBeGreaterThan(0);
    for (const said of ['RETURNED', 'TOO EARLY', 'WRONG SIDE', 'ACE PAST YOU']) expect(shipped.hud.join('\n')).toContain(said);

    sameGame(shipped, published);
    sameGame(shipped, arena);

    // and the venue was really there: its script fired its banner on the points the player won (full depth), never in the arena
    expect(shipped.studioHud).toEqual([]);
    expect(published.studioHud.some((l) => l.includes('POINT!'))).toBe(true);
    expect(arena.studioHud).toEqual([]);
  }, 240_000);
});
