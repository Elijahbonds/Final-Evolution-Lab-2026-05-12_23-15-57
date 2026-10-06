// Court Carnival's night flow, IMPROVE (2026-10-06) — the owner-picked list, driven through the real mode with fake events.
//
//   #5  the stall watchdog forced 'playing' on an event whose build had not landed (its tick then threw every frame)
//   #8  the pick screen started a solo night by itself 6 s after it opened
//   #9  the rules card was 2 s, never held, and the board could not be skipped
//   #13 PRACTICE (one event) on the pick screen
//   #15 the hidden hub party-goers kept animating and posturing through every event
//   #16 2P rebuilt the whole event between turns (and the hand-off started a fresh build every frame one was in flight)
//   #17 the HUD was handed a fresh object every frame of play
//
// The venue, the bodies, the mic and the sounds are stubbed; the night's rules (CarnivalNight) and the mode are real.
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

beforeEach(() => { anim.parks = anim.loops = anim.resets = 0; posture.live = 0; refusals.length = 0; vi.spyOn(console, 'info').mockImplementation(() => undefined); vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { CourtCarnivalMode.dispose?.(); engine.dispose(); vi.restoreAllMocks(); });

describe('the pick screen (#8, #13)', () => {
  it('untouched, it waits for a face button — it never starts a night by itself', async () => {
    const evs = [fake(), fake(), fake(), fake()];
    const n = await night(evs);
    await n.run(15);
    expect(evs.every((e) => e.builds === 0)).toBe(true);
    expect(n.banners().at(-1)).toBe('PLAYERS   ◀  1  ▶');
    await n.press('A');
    expect(n.banners().at(-1)).toMatch(/^NEXT UP: EV/);
  });

  it('after a choice, the auto-start counts 6 s from the LAST choice, and starts what was chosen', async () => {
    const evs = [fake(), fake(), fake(), fake()];
    const n = await night(evs);
    await n.dpad('right');                                          // 2 players
    await n.run(4);
    await n.dpad('left'); await n.dpad('right');                    // still deciding: the clock restarts
    await n.run(5.5);
    expect(n.banners().at(-1)).toBe('PLAYERS   ◀  2  ▶');
    await n.run(0.6);
    expect(n.banners().at(-1)).toMatch(/^NEXT UP: EV/);
    expect(n.hud.at(-1)).toMatchObject({ p1name: 'P1', p2name: 'P2' });
  });

  it('PRACTICE: ▶ ▶ then ▲ ▼ picks one event; the night is that event alone, and the result says so', async () => {
    const evs = [fake(), fake(), fake(), fake()];
    const n = await night(evs);
    await n.dpad('right'); await n.dpad('right');
    expect(n.banners().at(-1)).toBe(`PRACTICE   ▲  ${evs[0].title}  ▼`);
    await n.dpad('down'); await n.dpad('down'); await n.dpad('up');
    expect(n.banners().at(-1)).toBe(`PRACTICE   ▲  ${evs[1].title}  ▼`);
    await n.press('B');
    expect(n.banners().at(-1)).toBe(`PRACTICE: ${evs[1].title}`);
    await n.run(0.7); await n.press('A');                           // the first card holds: GO starts it
    expect(evs.map((e) => e.builds)).toEqual([0, 1, 0, 0]);
    evs[1].score = 9;                                               // 90 points against a rival who can only make 10
    await n.run(2.1);                                               // the clock runs out
    await n.run(0.7); await n.press('A');                           // skip the board
    expect(n.end).toHaveBeenCalledTimes(1);
    expect(n.end.mock.calls[0][0]).toBe('CHAMPION');
    expect(n.end.mock.calls[0][2]).toMatchObject({ events: 1, practice: 1, players: 1 });
    expect(n.banners().at(-1)).toBe('PRACTICE: YOU TOOK IT');
  });
});

describe('the cards (#9)', () => {
  it('an event\'s first card holds for GO (a press in its first 0.6 s does not count); the board skips on GO', async () => {
    const evs = [fake(), fake(), fake(), fake()];
    const n = await night(evs);
    await n.press('A');                                             // start the night
    const first = n.banners().at(-1);
    await n.press('A');                                             // carried over from the pick press: not a skip
    await n.run(5);
    expect(evs.reduce((s, e) => s + e.builds, 0)).toBe(0);           // the 2 s card used to be gone by now
    await n.press('A');
    expect(evs.reduce((s, e) => s + e.builds, 0)).toBe(1);
    await n.run(2.1);                                               // the event's clock
    const board = n.banners().at(-1);
    expect(board).toMatch(/: YOU \d+ · RIVAL \d+$/);
    await n.run(0.7); await n.press('A');                           // GO skips the 3.2 s board
    expect(n.banners().at(-1)).toMatch(/^NEXT UP: EV/);
    expect(n.banners().at(-1)).not.toBe(first);
  });

  it('the card gives up holding after 12 s, and an event seen before gets the 2 s card', async () => {
    const evs = [fake()];                                           // a one-event pool: both nights open on the same event
    const n = await night(evs);
    await n.press('A');
    await n.run(11.5);
    expect(evs.reduce((s, e) => s + e.builds, 0)).toBe(0);
    await n.run(0.6);
    expect(evs.reduce((s, e) => s + e.builds, 0)).toBe(1);
    // the same pool again, in a second night: every card is the 2 s one
    CourtCarnivalMode.dispose?.(); engine.dispose();
    const again = await night(evs);
    await again.press('A');
    await again.run(2.1);
    expect(evs.reduce((s, e) => s + e.builds, 0)).toBe(2);
  });
});

describe('the stall watchdog (#5)', () => {
  it('a build that never lands is waited for, then the event is skipped — its tick is never run on a half-built event', async () => {
    const hung = fake({ hang: true });
    const evs = [hung, fake(), fake(), fake()];
    const n = await night(evs);
    // the draw is seeded by the clock: start the night, and GO through cards until the hung event is the one building
    await n.press('A');
    for (let i = 0; i < 4 && hung.builds === 0; i++) { await n.run(0.7); await n.press('A'); if (hung.builds) break; await n.run(2.1); await n.run(0.7); await n.press('A'); }
    expect(hung.builds).toBe(1);
    await n.run(8);                                                 // the old watchdog forced 'playing' here
    expect(hung.ticks).toBe(0);
    expect(refusals).not.toContain('EVENT SKIPPED');
    await n.run(13);                                                // past the 20 s budget
    expect(refusals).toContain('EVENT SKIPPED');
    expect(hung.ticks).toBe(0);
    const torn = hung.teardowns;
    hung.land();                                                    // the build finally lands: it tears itself down
    await n.run(0.1);
    expect(hung.teardowns).toBe(torn + 1);
    expect(hung.ticks).toBe(0);
  });
});

describe('two on one screen (#16)', () => {
  it('an event that can reset is built once for both turns and reset for P2', async () => {
    const evs = [fake({ resettable: true }), fake({ resettable: true }), fake({ resettable: true }), fake({ resettable: true })];
    const n = await night(evs);
    await n.dpad('right'); await n.press('A');
    await n.run(0.7); await n.press('A');                           // P1's attempt
    const ev = evs.find((e) => e.builds)!;
    await n.run(2.1);                                               // P1's clock
    expect(ev.teardowns).toBe(0);                                   // kept for P2
    await n.run(2.3);                                               // the hand-off card
    expect([ev.builds, ev.resets, ev.teardowns]).toEqual([1, 1, 0]);
    await n.run(2.1);                                               // P2's clock: now it goes
    expect([ev.builds, ev.resets, ev.teardowns]).toEqual([1, 1, 1]);
  });

  it('an event without reset is built again for P2 — once, though its build takes several frames', async () => {
    const slow = [fake({ hang: true }), fake({ hang: true }), fake({ hang: true }), fake({ hang: true })];
    const n = await night(slow);
    await n.dpad('right'); await n.press('A');
    await n.run(0.7); await n.press('A');
    const ev = slow.find((e) => e.builds)!;
    ev.land(); await n.run(0.1);
    await n.run(2.1);                                               // P1's clock
    expect(ev.teardowns).toBe(1);
    await n.run(2.3 + 1);                                           // the hand-off, then a build in flight for a second
    expect(ev.builds).toBe(2);                                      // it used to start one every frame
    ev.land(); await n.run(0.1);
    await n.run(2.1);
    expect(ev.builds).toBe(2);
  });
});

describe('the hub sleeps through an event (#15), and the HUD hears play once a value changes (#17)', () => {
  it('parked and unpostured while an event runs, awake again for the result', async () => {
    const evs = [fake(), fake(), fake(), fake()];
    const n = await night(evs);
    expect(posture.live).toBe(2);
    await n.press('A'); await n.run(0.7); await n.press('A');
    expect(anim.parks).toBe(2);
    expect(posture.live).toBe(0);
    const loops = anim.loops;
    await n.run(2.1);                                               // the result card: the hub is back
    expect(posture.live).toBe(2);
    expect(anim.loops).toBe(loops + 2);
  });

  it('a second of play pushes the clock and the rival ticker only when they change', async () => {
    const evs = [fake({ durationSec: 10 }), fake({ durationSec: 10 }), fake({ durationSec: 10 }), fake({ durationSec: 10 })];
    const n = await night(evs);
    await n.press('A'); await n.run(0.7); await n.press('A');
    const before = n.hud.length;
    await n.run(1);                                                 // 60 frames
    const pushes = n.hud.slice(before).filter((h) => 'time' in h);
    expect(pushes.length).toBeGreaterThan(0);
    expect(pushes.length).toBeLessThanOrEqual(3);                   // a clock tick and the rival's 0 → 1 (the band is [1, 1] × 10)
    const shown = pushes.map((h) => `${h.time}|${h.rivalLive}`);
    expect(new Set(shown).size).toBe(shown.length);                 // never the same values twice
  });
});
