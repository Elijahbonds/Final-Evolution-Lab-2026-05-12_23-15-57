// S1 HITCH-KILLER (ALL-MODES-TO-75 §2 Court Carnival, CC75-2, 2026-10-22): no event is BUILT after the GAME NIGHT board. Every event
// of the night is built behind the board (in load), pre-compiled, parked off screen, and swapped in by enabling it — not by a
// build() and a dispose in the middle of the night (CourtCarnivalMode's old `await S.current.build(ctx)` between cards).
//
// The real mode on a NullEngine with a real camera and a render every frame; the hub, the bodies, the mic and the sounds are the
// flow test's stubs. The events are fakes whose build lays a real stage (a mesh in its own material kind), so the stage's
// visibility and the shader compiles are measured, not assumed. The 2026-10-22 baseline (before the fix) is in the lane report.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Color3, FreeCamera, MeshBuilder, NullEngine, PBRMaterial, Scene, StandardMaterial, Vector3, type Mesh } from '@babylonjs/core';
import type { ModeContext } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import type { CarnivalEvent } from './carnivalEvents';

vi.mock('../core/CharacterLibrary', () => ({
  CharacterLibrary: {
    spawn: async (_s: unknown, _u: string, o: { position?: Vector3 } = {}) => ({
      root: { position: (o.position ?? new Vector3()).clone(), setEnabled: () => undefined },
      animator: { park: () => undefined }, skeleton: {}, dispose: () => undefined,
    }),
  },
}));
vi.mock('../anim/clipRegistry', () => ({ installSafePlay: () => undefined, SPORT_CLIP: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock('../anim/beatOwner', () => ({ BeatOwner: class { loop(): void {} beat(): void {} reset(): void {} } }));
vi.mock('../anim/PostureLayer', () => ({ mountPostureLayer: () => ({ layer: { get: () => null }, dispose: () => undefined }) }));
vi.mock('../core/Refusal', () => ({ refuse: () => true }));
vi.mock('../audio/SoundKit', () => ({ SoundKit: { play: () => undefined, unlock: () => undefined, startAmbient: () => undefined, stopAmbient: () => undefined } }));
vi.mock('../visual/EffectsKit', () => ({ EffectsKit: { burst: () => undefined } }));
vi.mock('../core/NexusVenue', () => ({ mountVenue: () => ({ built: { root: { setEnabled: () => undefined } }, hidePlaceholders: () => undefined }) }));
vi.mock('../nexus/placeLooks', () => ({ readPlaceLook: () => null }));
const fxCalls: string[] = [];
vi.mock('../court/mount/carnivalFx', () => ({
  mountCarnivalFx: () => ({
    night: false,
    showSet: (on: boolean) => { fxCalls.push(`set:${on}`); },
    board: (s: { title: string }) => { fxCalls.push(`board:${s.title}`); },
    endIntro: () => undefined, stepIntro: () => false, reveal: () => undefined, eventResult: () => undefined, finale: () => undefined,
    update: () => undefined, dispose: () => undefined,
  }),
}));
vi.mock('../audio/mic/ModeMic', () => ({
  ModeMic: class {
    ready = false;
    say(): void {} then(): void {} hush(): void {} hold(): void {} release(): void {} update(): void {}
    setFiller(): void {} setCrowdIdle(): void {} dispose(): void {}
  },
}));

/** A fake event that lays a stage: one box in a material of its own kind (four kinds, four shader programs). */
interface Stage extends CarnivalEvent { builds: number; resets: number; wakes: number; teardowns: number; ticks: number; score: number; mesh: Mesh | null; log: string[] }
let uid = 0;
const KINDS = ['standard', 'pbr', 'standard-alpha', 'pbr-unlit'] as const;
function stage(kind: typeof KINDS[number], o: { swaps?: boolean } = {}): Stage {
  const id = `st${++uid}`;
  const ev: Stage = {
    id, title: id.toUpperCase(), durationSec: 2, pointsPerUnit: 10, rivalRange: [1, 1],
    builds: 0, resets: 0, wakes: 0, teardowns: 0, ticks: 0, score: 0, mesh: null, log: [],
    async build(ctx) {
      ev.builds++; ev.log.push('build');
      const m = MeshBuilder.CreateBox(`${id}_floor`, { size: 2 }, ctx.scene);
      if (kind === 'standard' || kind === 'standard-alpha') {
        const s = new StandardMaterial(`${id}_m`, ctx.scene); s.diffuseColor = Color3.Red();
        if (kind === 'standard-alpha') { s.alpha = 0.5; s.emissiveColor = Color3.White(); s.disableLighting = true; }
        m.material = s;
      } else {
        const p = new PBRMaterial(`${id}_m`, ctx.scene); p.albedoColor = Color3.Green(); p.unlit = kind === 'pbr-unlit';
        m.material = p;
      }
      ev.mesh = m;
      ctx.heroRef.current = null;   // an event's whistle points the camera at its own player
    },
    onInput() {},
    tick(_c, dt) { if (dt > 0) ev.ticks++; return ev.score; },
    teardown() { ev.teardowns++; ev.log.push('teardown'); ev.mesh?.dispose(false, true); ev.mesh = null; },
  };
  ev.reset = () => { ev.resets++; ev.log.push('reset'); ev.score = 0; };
  if (o.swaps !== false) ev.wake = () => { ev.wakes++; ev.log.push('wake'); };   // the opt-in: it can be put on from a parked build
  return ev;
}
let pool: Stage[] = [];
vi.mock('./carnivalEvents', () => ({ allCarnivalEvents: () => pool }));

import { CourtCarnivalMode } from './CourtCarnivalMode';
import { hitchCounts, markIntroDone, watchCompiles } from '../core/hitchProbe';

let engine: NullEngine;
async function night(events: Stage[], players = 1) {
  pool = events;
  engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera('play_cam', new Vector3(0, 3, -8), scene);
  camera.setTarget(Vector3.Zero());
  watchCompiles(scene);
  const end = vi.fn();
  const ctx = {
    scene, setHud: () => undefined, end, phase: () => 'playing',
    juice: { flash: () => undefined, callout: () => undefined, hitStop: () => undefined, shake: () => undefined },
    heroRef: { current: null }, objectiveRef: { current: null },
    camDirector: { setPreset: () => undefined, snapTo: () => undefined },
    camera,
  } as unknown as ModeContext;
  await CourtCarnivalMode.load(ctx);
  const boardBuilds = events.reduce((s, e) => s + e.builds, 0);   // the GAME NIGHT board is up: load has returned
  for (let i = 0; i < 6; i++) scene.render();                     // the intro over the board (the crane): compiled behind it
  markIntroDone(scene);
  const M = CourtCarnivalMode as unknown as { onInput(c: ModeContext, e: FelInput): void; update(c: ModeContext, dt: number): void };
  /** what was on screen while each event played: its own stage, and nobody else's */
  const shown: string[] = [];
  const run = async (sec: number): Promise<void> => {
    for (let i = 0; i < Math.round(sec * 60); i++) {
      M.update(ctx, 1 / 60); await Promise.resolve();
      scene.render();
      const live = events.filter((e) => e.mesh && !e.mesh.isDisposed() && e.mesh.isEnabled()).map((e) => e.id).join(',');
      if (shown.at(-1) !== live) shown.push(live);
    }
  };
  const press = async (btn: string) => { M.onInput(ctx, { t: 'button', btn, pressed: true } as unknown as FelInput); await Promise.resolve(); await Promise.resolve(); };
  const dpad = async (dir: string) => { M.onInput(ctx, { t: 'dpad', dir, pressed: true } as unknown as FelInput); await Promise.resolve(); };
  if (players > 1) await dpad('right');
  return { scene, end, run, press, shown, boardBuilds, counts: () => hitchCounts(scene) };
}

beforeEach(() => { fxCalls.length = 0; vi.spyOn(console, 'info').mockImplementation(() => undefined); vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { CourtCarnivalMode.dispose?.(); engine.dispose(); vi.restoreAllMocks(); });

const builds = (evs: Stage[]) => evs.reduce((s, e) => s + e.builds, 0);

describe('S1 HITCH / CC75-2: no build() after the GAME NIGHT board', () => {
  it('a solo night: every event is built behind the board, 0 builds and 0 first-use compiles after it, each stage shown only for its own event', async () => {
    const evs = KINDS.map((k) => stage(k));
    const n = await night(evs);
    const atBoard = n.boardBuilds;
    await n.press('A');
    for (let i = 0; i < 4; i++) { await n.run(0.7); await n.press('A'); await n.run(2.1); await n.run(0.7); await n.press('A'); }
    const after = builds(evs) - atBoard;
    console.log(`[S1-HITCH] carnival solo: builds behind the board ${atBoard}, after it ${after} · counted builds after the intro ${n.counts().afterIntro.builds} · compiles before play ${n.counts().compiles - n.counts().afterIntro.compiles}, after the intro ${n.counts().afterIntro.compiles} · on screen ${n.shown.join(' | ')}`);
    expect(n.end).toHaveBeenCalledTimes(1);
    expect(atBoard).toBe(4);                                         // the night's four, before the board went up
    expect(after).toBe(0);                                           // CC75-2
    expect(n.counts().afterIntro.builds).toBe(0);
    expect(n.counts().afterIntro.compiles).toBe(0);                 // the stages were compiled behind the intro
    expect(evs.every((e) => e.builds === 1 && e.wakes === 1 && e.resets === 0)).toBe(true);   // swapped in by enabling + its wake
    expect(evs.every((e) => e.log.join() === 'build,wake,teardown')).toBe(true);
    // each event's stage was the only one live while it played; between events, and before the first, none is
    const live = n.shown.filter((s) => s);
    expect(live.length).toBe(4);
    expect(new Set(live).size).toBe(4);
    expect(live.every((s) => !s.includes(','))).toBe(true);
    expect(n.shown[0]).toBe('');
  });

  it('a two-player night: 0 builds after the board — P1 and P2 play the stage built behind it', async () => {
    const evs = KINDS.map((k) => stage(k));
    const n = await night(evs, 2);
    const atBoard = n.boardBuilds;
    await n.press('A');
    for (let i = 0; i < 4; i++) { await n.run(0.7); await n.press('A'); await n.run(2.1); await n.run(2.3); await n.run(2.1); await n.run(0.7); await n.press('A'); }
    console.log(`[S1-HITCH] carnival duo: builds behind the board ${atBoard}, after it ${builds(evs) - atBoard} · wakes ${evs.map((e) => e.wakes)} · resets ${evs.map((e) => e.resets)}`);
    expect(n.end).toHaveBeenCalledTimes(1);
    expect(builds(evs) - atBoard).toBe(0);
    expect(evs.every((e) => e.wakes === 1 && e.resets === 1)).toBe(true);   // P1's wake, P2's reset on the same stage
    expect(n.counts().afterIntro.compiles).toBe(0);
  });

  it('an event that cannot be swapped in (no wake) keeps the old path: built at its card, as before', async () => {
    const evs = KINDS.map((k) => stage(k, { swaps: false }));
    const n = await night(evs);
    expect(n.boardBuilds).toBe(0);
    await n.press('A'); await n.run(0.7); await n.press('A');
    expect(builds(evs)).toBe(1);
    expect(n.counts().afterIntro.builds).toBe(1);                   // the probe counts it: a build at a card is a mid-night hitch
  });
});
