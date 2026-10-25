// PERF-LOAD PRF-04: streaming changes WHEN the extras arrive, never the game. The proof is the scripted Tiebreak match
// (tests/helpers/tiebreakRally.ts — the real TiebreakMode on a NullEngine, a script that plays the way a person does) played
// twice with the same seed and script: once loaded as before, once through a load plan that holds the venue's CC0 prop set
// until after READY (VenueProps.mountVenueProps → streamWhileLoading). Every score, HUD line, clip, ball position, camera
// position and the end are bit-identical; the plan did hold the prop set.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ clips: [] as string[] }));
vi.mock('../core/CharacterLibrary', async () => (await import('@/tests/helpers/tiebreakRally')).standInLibrary());
vi.mock('../anim/importSanitizer', async (orig) => ({ ...(await orig<typeof import('../anim/importSanitizer')>()), neverBindPose: () => undefined }));
vi.mock('../anim/clipRegistry', async (orig) => ({ ...(await orig<typeof import('../anim/clipRegistry')>()), installSafePlay: () => undefined }));
vi.mock('../anim/beatOwner', () => ({
  BeatOwner: class {
    constructor(private a: { who: string }) {}
    loop(clip: string): void { log.clips.push(`${this.a.who}:loop:${clip}`); }
    beat(clip: string): void { log.clips.push(`${this.a.who}:${clip}`); }
  },
}));
vi.mock('../audio/SoundKit', () => ({ SoundKit: { play: () => undefined, unlock: () => undefined, startAmbient: () => undefined, stopAmbient: () => undefined } }));
vi.mock('../premium/Haptics', () => ({ HAPTIC: { tap: () => undefined }, padRumble: () => undefined }));
vi.mock('../visual/EffectsKit', () => ({ EffectsKit: { ballTrail: () => ({ dispose: () => undefined }), burst: () => undefined }, applyTrail: () => undefined }));
vi.mock('../visual/meshyProps', async (orig) => ({ ...(await orig<typeof import('../visual/meshyProps')>()), dressBall: async () => false, spawnMeshyProp: async () => null }));
vi.mock('../scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));
// the prop set's own mount is recorded, not drawn (a GLB cannot load here): what matters is WHEN it is asked for
const props = vi.hoisted(() => ({ calls: [] as Array<{ key: string; frame: number }>, frame: { n: -1 } }));
vi.mock('../visual/VenueProps', async (orig) => {
  const real = await orig<typeof import('../visual/VenueProps')>();
  const { streamWhileLoading } = await import('./loadPlan');
  return {
    ...real,
    mountVenueProps: (_scene: unknown, key: string) => streamWhileLoading(`props ${key}`, () => { props.calls.push({ key, frame: props.frame.n }); return null; }, null),
  };
});

import type { ModeContext, ModeDefinition } from './ModeHarness';
import { LoadPlan } from './loadPlan';
import { invalidateIdentity } from './playerIdentity';
import { playRally, type RallyTrace } from '@/tests/helpers/tiebreakRally';
import { installOffscreenShim } from '@/tests/helpers/canvasShim';

installOffscreenShim();   // the venue paints its sky on a DynamicTexture (NullEngine has no canvas)

/** The mode, loaded through a plan the way ModeHarness loads a planned mode: held during load(), opened after the first frame. */
function planned(mode: ModeDefinition, plan: LoadPlan): ModeDefinition {
  return {
    ...mode,
    async load(ctx: ModeContext) {
      plan.enterLoad();
      try { await mode.load(ctx); } finally { plan.exitLoad(); }
      ctx.scene.onAfterRenderObservable.add(() => { props.frame.n++; });   // the frame count first: frame 0 is drawn when the plan opens
      ctx.scene.onAfterRenderObservable.addOnce(() => plan.start());
    },
    update: mode.update.bind(mode), onInput: mode.onInput.bind(mode), dispose: mode.dispose?.bind(mode),
  };
}
function plain(mode: ModeDefinition): ModeDefinition {
  return {
    ...mode,
    async load(ctx: ModeContext) { await mode.load(ctx); ctx.scene.onAfterRenderObservable.add(() => { props.frame.n++; }); },
    update: mode.update.bind(mode), onInput: mode.onInput.bind(mode), dispose: mode.dispose?.bind(mode),
  };
}

async function rally(def: ModeDefinition): Promise<RallyTrace> {
  invalidateIdentity();
  log.clips.length = 0; props.calls.length = 0; props.frame.n = -1;
  const t = await playRally({ mode: def, clipLog: log.clips });
  return { ...t, clips: [...log.clips] };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 25, 12));   // the mode seeds its RNG from Date.now
  vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 404 })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); invalidateIdentity(); });

describe('a planned load streams the prop set after READY and plays the same match', () => {
  it('Tiebreak: bit-identical scripted match with the prop set held vs mounted at load', async () => {
    const { TiebreakMode } = await import('../modes/TiebreakMode');

    const before = await rally(plain(TiebreakMode));
    const atLoad = props.calls.map((c) => c.frame);

    const plan = new LoadPlan({ now: () => 0, nextFrame: () => Promise.resolve() });
    const after = await rally(planned(TiebreakMode, plan));
    const held = plan.state();

    // the prop set: asked for during the load before (frame -1: nothing drawn yet); held, and asked for after the first frame now
    expect(atLoad.length).toBeGreaterThan(0);
    expect(atLoad.every((f) => f === -1)).toBe(true);
    expect(held.held).toBe(atLoad.length);
    expect(held.labels.every((l) => l.startsWith('props '))).toBe(true);
    expect(held.done).toBe(held.held);
    expect(props.calls.length).toBe(atLoad.length);
    expect(props.calls.every((c) => c.frame >= 0)).toBe(true);

    // the game: a real match, and identical number for number
    expect(before.end).not.toBeNull();
    expect(before.inputs.length).toBeGreaterThan(10);
    expect(after.end).toEqual(before.end);
    expect(after.inputs).toEqual(before.inputs);
    expect(after.hud).toEqual(before.hud);
    expect(after.clips).toEqual(before.clips);
    expect(after.frames.length).toBe(before.frames.length);
    for (let f = 0; f < before.frames.length; f++) {
      const a = before.frames[f], b = after.frames[f];
      for (let k = 0; k < a.length; k++) if (!Object.is(a[k], b[k])) expect.fail(`frame ${f} value ${k}: ${a[k]} vs ${b[k]}`);
    }
  }, 180_000);
});
