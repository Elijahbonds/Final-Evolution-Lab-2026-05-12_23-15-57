// CAST FAIRNESS (owner 2026-10-14, "Own height and build"; docs/NEXUS-STUDIO.md §10.5): a cast now wears its own height and build,
// and that is VISUAL ONLY. The proof is a scripted Tiebreak match played twice through the real Studio load path — once by a
// tall/heavy cast, once by a short/light one — with the same seed and the same script: every score, every judgement line, every
// clip, the ball's every position, the camera and the end are bit-identical, while the body drawn is not. RIG-ADJACENT.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ clips: [] as string[], sounds: [] as string[] }));
vi.mock('../babylon/core/CharacterLibrary', async () => (await import('@/tests/helpers/tiebreakRally')).standInLibrary());
vi.mock('../babylon/core/NexusVenue', () => ({ mountVenue: () => null }));
vi.mock('../babylon/nexus/placeLooks', () => ({ readPlaceLook: () => null }));
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
import { COSMETIC_CLAMP } from '../babylon/core/playFrame';
import { castIdentity, type CastMember } from './cast';
import { exportVenue } from './exportVenue';
import { newVenue } from './doc';
import { encodeInline } from './storage';
import { resetStudioVenueCache } from './runtime';
import { castFrameFor, PLAYTEST_TARGETS } from './targets';
import { emptyCreatorDoc } from '@/lib/creator/look/doc';
import { playRally, type RallyTrace } from '@/tests/helpers/tiebreakRally';

const TALL_HEAVY = { heightScale: COSMETIC_CLAMP.height[1], buildScale: COSMETIC_CLAMP.build[1] };   // 1.04 / 1.08
const SHORT_LIGHT = { heightScale: COSMETIC_CLAMP.height[0], buildScale: COSMETIC_CLAMP.build[0] };  // 0.96 / 0.94

function member(name: string, frame?: { heightScale: number; buildScale: number }): CastMember {
  return { name, body: 'female', doc: { ...emptyCreatorDoc(), colours: { jersey: '#FF3366' } }, base: { skinTone: '#8D5524' }, ...(frame ? { frame } : {}) };
}

/** Put a Studio venue casting `m` on the page (`?venue=b64:…`), the way the play-test button opens Tiebreak. */
function seat(m: CastMember | null): void {
  const v = newVenue('Fairness court', { spec: 'tennis', target: 'tiebreak' });
  v.weather = 'natural'; v.intro = 'none';
  const inline = encodeInline(exportVenue(v, m ? { player: m } : undefined));
  if (!inline) throw new Error('the venue did not fit inline');
  vi.stubGlobal('window', { location: { search: `?venue=${inline}` }, addEventListener: () => undefined, removeEventListener: () => undefined });
  resetStudioVenueCache();
  invalidateIdentity();
}

async function rally(m: CastMember | null): Promise<RallyTrace> {
  seat(m);
  log.clips.length = 0; log.sounds.length = 0;
  const t = await playRally({ mode: TiebreakMode, clipLog: log.clips });
  return { ...t, clips: [...log.clips], hud: [...t.hud, `sounds:${log.sounds.join(',')}`] };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 14, 12));   // the mode seeds its RNG from Date.now
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 })));   // a guest: no closet, no hero body
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); resetStudioVenueCache(); invalidateIdentity(); });

describe('Tiebreak: a cast\'s height and build are drawn, never scored', () => {
  it('a tall/heavy cast and a short/light cast play a bit-identical scripted match; only the body drawn differs', async () => {
    const tall = await rally(member('Tall', TALL_HEAVY));
    const short = await rally(member('Short', SHORT_LIGHT));

    // the script played a real match: it ended, both sides scored, rallies were returned, misses of each kind were judged
    expect(tall.end).not.toBeNull();
    const [, posted, stats] = tall.end as [string, number, { myPts: number; aiPts: number; bestRally: number }];
    expect(stats.myPts).toBeGreaterThan(0);
    expect(stats.aiPts).toBeGreaterThan(0);
    expect(stats.bestRally).toBeGreaterThan(1);
    expect(posted).toBeGreaterThan(0);
    const lines = tall.hud.join('\n');
    for (const said of ['RETURNED', 'TOO EARLY', 'WRONG SIDE', 'ACE PAST YOU', 'WARM-UP']) expect(lines).toContain(said);
    expect(tall.inputs.length).toBeGreaterThan(10);

    // the game: identical, number for number
    expect(short.end).toEqual(tall.end);
    expect(short.inputs).toEqual(tall.inputs);
    expect(short.hud).toEqual(tall.hud);
    expect(short.clips).toEqual(tall.clips);
    expect(short.frames.length).toBe(tall.frames.length);
    for (let f = 0; f < tall.frames.length; f++) {
      const a = tall.frames[f], b = short.frames[f];
      for (let k = 0; k < a.length; k++) if (!Object.is(a[k], b[k])) expect.fail(`frame ${f} value ${k}: ${a[k]} vs ${b[k]}`);
    }

    // the body: drawn at each character's own height and build (root scale = height × build on the girth, height upright)
    expect(tall.body.playScale).toEqual(TALL_HEAVY);
    expect(short.body.playScale).toEqual(SHORT_LIGHT);
    expect(tall.body.scaling[1]).toBeCloseTo(1.04, 6);
    expect(short.body.scaling[1]).toBeCloseTo(0.96, 6);
    expect(tall.body.scaling[0]).toBeCloseTo(1.04 * 1.08, 6);
    expect(short.body.scaling[0]).toBeCloseTo(0.96 * 0.94, 6);
    expect(tall.body.headY - short.body.headY).toBeGreaterThan(0.1);   // 1.65 m bind head: ~0.13 m apart
  }, 120_000);

  it('the same match with no cast (the player\'s own standard body) scores the same too', async () => {
    const plain = await rally(null);
    const tall = await rally(member('Tall', TALL_HEAVY));
    expect(plain.body.playScale).toBeNull();
    expect(plain.body.scaling).toEqual([1, 1, 1]);
    expect(tall.end).toEqual(plain.end);
    expect(tall.hud).toEqual(plain.hud);
    expect(tall.frames).toEqual(plain.frames);
  }, 120_000);
});

describe('where a cast may wear its frame', () => {
  it('Tiebreak: own (its review is on record); any other mode: the standard frame', () => {
    expect(castFrameFor('tiebreak')).toBe('own');
    expect(PLAYTEST_TARGETS.tiebreak.castFrame).toEqual({ frame: 'own', review: 'docs/NEXUS-STUDIO.md §10.5' });
    for (const k of ['dunk', 'onevone', 'threepoint', 'kart', 'unknown', '__proto__', 'constructor']) expect(castFrameFor(k), k).toBe('standard');
  });
  it('castIdentity: the frame only when asked for it, clamped, reach 1; the standard frame by default', () => {
    const m = member('X', { heightScale: 1.5, buildScale: 0.2 });
    expect(castIdentity(m).proportions).toBeNull();
    expect(castIdentity(m, { frame: 'standard' }).proportions).toBeNull();
    expect(castIdentity(m, { frame: 'own' }).proportions).toMatchObject({ heightScale: 1.04, buildScale: 0.94, reachScale: 1, stance: 'athletic' });
    expect(castIdentity(member('Y'), { frame: 'own' }).proportions).toBeNull();
  });
});
