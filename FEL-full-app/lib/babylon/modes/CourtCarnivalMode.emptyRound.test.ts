// CC75-3 (ALL-MODES-TO-75-2026-10-22 §2): a Court Carnival round with nothing in it saves nothing. Same stubbed harness as
// CourtCarnivalMode.flow.test.ts (venue, bodies, mic and sounds stubbed; the night's rules and the mode are real).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import type { ModeContext } from '../core/ModeHarness';
import type { FelInput } from '../core/InputBus';
import type { CarnivalEvent } from './carnivalEvents';

/** what the hub bodies were asked to do */
const anim = { parks: 0, loops: 0, resets: 0 };
/** posture layers currently mounted on the hub pair */
const posture = { live: 0 };
const refusals: string[] = [];

vi.mock('../core/CharacterLibrary', () => ({
  CharacterLibrary: {
    spawn: async (_s: unknown, _u: string, o: { position?: Vector3 } = {}) => ({
      root: { position: (o.position ?? new Vector3()).clone(), setEnabled: () => undefined },
      animator: { park: () => { anim.parks++; } }, skeleton: {}, dispose: () => undefined,
    }),
  },
}));
vi.mock('../anim/clipRegistry', () => ({ installSafePlay: () => undefined, SPORT_CLIP: new Proxy({}, { get: (_t, k) => String(k) }) }));
vi.mock('../anim/beatOwner', () => ({
  BeatOwner: class {
    loop(): void { anim.loops++; }
    beat(): void {}
    reset(): void { anim.resets++; }
  },
}));
vi.mock('../anim/PostureLayer', () => ({
  mountPostureLayer: () => { posture.live++; let on = true; return { layer: { get: () => null }, dispose: () => { if (on) { on = false; posture.live--; } } }; },
}));
vi.mock('../core/Refusal', () => ({ refuse: (_c: unknown, t: string) => { refusals.push(t); return true; } }));
vi.mock('../audio/SoundKit', () => ({ SoundKit: { play: () => undefined, unlock: () => undefined, startAmbient: () => undefined, stopAmbient: () => undefined } }));
vi.mock('../visual/EffectsKit', () => ({ EffectsKit: { burst: () => undefined } }));
vi.mock('../core/NexusVenue', () => ({ mountVenue: () => ({ built: { root: { setEnabled: () => undefined } }, hidePlaceholders: () => undefined }) }));
vi.mock('../nexus/placeLooks', () => ({ readPlaceLook: () => null }));
/** vis-hoops-court: the fair, its marquee and the celebrations need a real scene, lights and camera director (the venue, the bodies and the mic are
 *  stubbed here for the same reason): they are stubbed too, and what the mode TOLD them is recorded. */
const fxCalls: string[] = [];
let fxStepIntro: (hubPhase: boolean) => void = () => undefined;
vi.mock('../court/mount/carnivalFx', () => ({
  mountCarnivalFx: () => ({
    night: false,
    showSet: (on: boolean) => { fxCalls.push(`set:${on}`); },
    board: (s: { title: string; footer?: string }) => { fxCalls.push(`board:${s.title}|${s.footer ?? ''}`); },
    endIntro: () => { fxCalls.push('endIntro'); },
    stepIntro: (_s: unknown, _o: unknown, hub: boolean) => { fxStepIntro(hub); return false; },
    reveal: () => { fxCalls.push('reveal'); },
    eventResult: (w: number) => { fxCalls.push(`result:${w}`); },
    finale: (won: boolean) => { fxCalls.push(`finale:${won}`); },
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

/** A fake event: a build that lands when the test says (or at once), a score the test sets, and call counts. */
interface Fake extends CarnivalEvent { builds: number; resets: number; teardowns: number; ticks: number; score: number; land: () => void }
let uid = 0;
function fake(o: { resettable?: boolean; hang?: boolean; durationSec?: number } = {}): Fake {
  const id = `ev${++uid}`;   // fresh ids per test: the first-card hold remembers ids for the session
  let release: () => void = () => undefined;
  const ev: Fake = {
    id, title: id.toUpperCase(), durationSec: o.durationSec ?? 2, pointsPerUnit: 10, rivalRange: [1, 1],
    builds: 0, resets: 0, teardowns: 0, ticks: 0, score: 0,
    land: () => release(),
    async build() { ev.builds++; if (o.hang) await new Promise<void>((r) => { release = r; }); },
    onInput() {},
    tick(_c, dt) { if (dt > 0) ev.ticks++; return ev.score; },
    teardown() { ev.teardowns++; },
  };
  if (o.resettable) ev.reset = () => { ev.resets++; ev.score = 0; };
  return ev;
}
let pool: Fake[] = [];
vi.mock('./carnivalEvents', () => ({ allCarnivalEvents: () => pool }));

import { CourtCarnivalMode } from './CourtCarnivalMode';

type Hud = Record<string, unknown>;
let engine: NullEngine;
async function night(events: Fake[]) {
  pool = events;
  engine = new NullEngine();
  const scene = new Scene(engine);
  const hud: Hud[] = [];
  const end = vi.fn();
  const ctx = {
    scene, setHud: (h: Hud) => { hud.push(h); }, end, phase: () => 'playing',
    juice: { flash: () => undefined, callout: () => undefined, hitStop: () => undefined, shake: () => undefined },
    heroRef: { current: null }, objectiveRef: { current: null },
    camDirector: { setPreset: () => undefined, snapTo: () => undefined },
    camera: { position: new Vector3() },
  } as unknown as ModeContext;
  await CourtCarnivalMode.load(ctx);
  const M = CourtCarnivalMode as unknown as { onInput(c: ModeContext, e: FelInput): void; update(c: ModeContext, dt: number): void };
  const run = async (sec: number): Promise<void> => {
    for (let i = 0; i < Math.round(sec * 60); i++) { M.update(ctx, 1 / 60); await Promise.resolve(); }
  };
  const input = async (e: FelInput): Promise<void> => { M.onInput(ctx, e); await Promise.resolve(); await Promise.resolve(); };
  const press = (btn: string) => input({ t: 'button', btn, pressed: true } as unknown as FelInput);
  const dpad = (dir: string) => input({ t: 'dpad', dir, pressed: true } as unknown as FelInput);
  const banners = (): unknown[] => hud.filter((h) => 'banner' in h).map((h) => h.banner);
  return { ctx, hud, end, run, press, dpad, banners };
}

beforeEach(() => { anim.parks = anim.loops = anim.resets = 0; posture.live = 0; refusals.length = 0; fxCalls.length = 0; fxStepIntro = () => undefined; vi.spyOn(console, 'info').mockImplementation(() => undefined); vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { CourtCarnivalMode.dispose?.(); engine?.dispose(); vi.restoreAllMocks(); });

import { isPlayInput, roundIsEmpty, PLAY_STICK_MIN, NO_PLAY_OUTCOME } from './carnivalEmptyRound';


const stick = (x: number, y: number) => ({ t: 'stick', side: 'L', x, y } as unknown as FelInput);
/** one event: GO on its card, an optional press in it, the clock out, GO past the board */
async function round(n: Awaited<ReturnType<typeof night>>, play: boolean) {
  await n.run(0.7); await n.press('A'); await n.run(0.1);
  if (play) await n.press('B');
  await n.run(2.1); await n.run(0.7); await n.press('A');
}

describe('CC75-3: a round with nothing in it saves nothing', () => {
  it('CC75-3a: what counts as an input — presses and a pushed stick; releases and stick drift do not', () => {
    expect(isPlayInput({ t: 'button', btn: 'A', pressed: true } as unknown as FelInput)).toBe(true);
    expect(isPlayInput({ t: 'dpad', dir: 'up', pressed: true } as unknown as FelInput)).toBe(true);
    expect(isPlayInput({ t: 'button', btn: 'A', pressed: false } as unknown as FelInput)).toBe(false);
    expect(isPlayInput(stick(0.9, 0))).toBe(true);
    expect(isPlayInput(stick(PLAY_STICK_MIN * 0.5, 0))).toBe(false);
    expect(roundIsEmpty(1, [0, 0])).toBe(true);
    expect(roundIsEmpty(1, [1, 0])).toBe(false);
    expect(roundIsEmpty(2, [0, 3])).toBe(false);
    expect(roundIsEmpty(2, [0, 0])).toBe(true);
  });

  it('CC75-3b: a round with no input skips bankEvent — no event result, no points to either side', async () => {
    const evs = [fake(), fake(), fake(), fake()]; evs.forEach((e) => { e.score = 5; });
    const n = await night(evs);
    await n.press('A');
    await round(n, false);                                           // event 1: untouched
    expect(fxCalls.filter((c) => c.startsWith('result:'))).toEqual([]);
    expect(fxCalls).toContain('board:STANDINGS|NO PLAY');
    await round(n, true);                                            // event 2: played — banked as before
    expect(fxCalls.filter((c) => c.startsWith('result:'))).toEqual(['result:0']);
  });

  it('CC75-3c: a whole night with no input ends NO_PLAY at score 0 (never CHAMPION / RUNNER_UP)', async () => {
    const evs = [fake(), fake(), fake(), fake()]; evs.forEach((e) => { e.score = 5; });
    const n = await night(evs);
    await n.press('A');                                              // the pick-screen press is not play in an event
    for (let i = 0; i < 4; i++) await round(n, false);
    expect(n.end).toHaveBeenCalledTimes(1);
    expect(n.end.mock.calls[0][0]).toBe(NO_PLAY_OUTCOME);
    expect(n.end.mock.calls[0][1]).toBe(0);
    expect(n.end.mock.calls[0][2]).toMatchObject({ rivalPoints: 0, eventsWon: 0, rivalEventsWon: 0, noPlay: 1 });
    expect(fxCalls.some((c) => c.startsWith('finale:'))).toBe(false);
  });

  it('CC75-3d: one played round is enough — the night ends on its real result, and only played rounds are banked', async () => {
    const evs = [fake(), fake(), fake(), fake()]; evs.forEach((e) => { e.score = 5; });   // 50 against the rival's 10
    const n = await night(evs);
    await n.press('A');
    await round(n, true); for (let i = 0; i < 3; i++) await round(n, false);
    expect(n.end).toHaveBeenCalledTimes(1);
    expect(n.end.mock.calls[0][0]).toBe('CHAMPION');
    expect(n.end.mock.calls[0][1]).toBe(50);
    expect(n.end.mock.calls[0][2]).toMatchObject({ rivalPoints: 10, eventsWon: 1, rivalEventsWon: 0 });   // the rival is banked only on the played round;
  });
});
