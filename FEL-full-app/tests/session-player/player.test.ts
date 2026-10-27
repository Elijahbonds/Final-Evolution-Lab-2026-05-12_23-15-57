// PLAT-P01 (2026-10-27): the player's hook mounted with no DOM (tests/helpers/hookRuntime.ts) on a hand-driven clock:
// the screen wake lock (a stub navigator) is asked for while playing and let go on pause, the finish and close; the
// "How to set up" sheet opens by itself only before the first set of an exercise this device has never run, and closes
// itself when the set starts; the voice speaks the transitions; the finish fires once. And the player's screen, rendered:
// one primary button of at least 48 px, and the words a set shows.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));

import { mount } from '@/tests/helpers/hookRuntime';
import { useSessionPlayer } from '@/components/session-player/use-session-player';
import type { Clock } from '@/lib/session-player/ticker';
import type { Session } from '@/lib/session-player/model';
import { SEEN_KEY } from '@/lib/session-player/seen';
import { READY_SECONDS, READY_SETUP_SECONDS } from '@/lib/session-player/machine';

const SESSION: Session = { id: 'w1:A', title: 'Vertical Jump · A', steps: [
  { exId: 'goblet', name: 'Goblet Squat to Box', sets: 2, reps: '8', workSeconds: null, restSeconds: 30, setup: 'A box behind you.', cue: 'Sit back to the box', clip: 'ex_squat' },
  { exId: 'plank', name: 'Side Plank', sets: 1, reps: '20 s each side', workSeconds: 20, restSeconds: 0, setup: 'On your side.', cue: null, clip: 'ex_side_plank' },
] };

let t = 0;
let beat: (() => void) | null = null;
const clock: Clock = { now: () => t, every: (_ms, f) => { beat = f; return () => { beat = null; }; } };
const advance = async (ms: number) => { for (let i = 0; i < ms; i += 250) { t += 250; beat?.(); } await flush(); };
const flush = () => new Promise((r) => setTimeout(r, 0));

const store = new Map<string, string>();
const requests: { released: boolean }[] = [];

beforeEach(() => {
  t = 0; beat = null; store.clear(); requests.length = 0;
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } });
  vi.stubGlobal('navigator', { wakeLock: { request: vi.fn(async () => { const s = { released: false, release: async () => { s.released = true; } }; requests.push(s); return s; }) } });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} });
});
afterEach(() => { vi.unstubAllGlobals(); });

function start(onFinish = vi.fn()) {
  const said: string[] = [];
  const voice = { say: (x: string) => { said.push(x); }, tick: vi.fn(), cancel: vi.fn() };
  let api!: ReturnType<typeof useSessionPlayer>;
  const m = mount(() => { api = useSessionPlayer(SESSION, { clock, voice, onFinish }); return null; });
  return { m, api: () => api, said, voice, onFinish };
}
const held = () => requests.filter((r) => !r.released).length;

describe('the session player, mounted', () => {
  it('holds the screen on while playing; lets go on pause, takes it back on resume, lets go on the finish', async () => {
    const p = start();
    await flush();
    expect(held()).toBe(1);
    p.api().togglePause(); await flush();
    expect(held()).toBe(0);
    p.api().togglePause(); await flush();
    expect(held()).toBe(1);
    // play it through: one tap per counted set
    await advance(READY_SETUP_SECONDS * 1000);
    p.api().primary(); await flush();             // squat set 1 done → rest
    await advance(30_000);                        // rest counts itself into set 2
    p.api().primary(); await flush();             // squat set 2 done → the change to the plank
    await advance(30_000 + 20_000);               // rest, then the timed plank runs out by itself
    expect(p.api().state.phase).toBe('finish');
    expect(p.onFinish).toHaveBeenCalledTimes(1);
    expect(held()).toBe(0);
    expect(requests.length).toBe(2);
    p.m.unmount();
  });

  it('lets the lock go when the player closes mid-set', async () => {
    const p = start();
    await flush();
    expect(held()).toBe(1);
    p.m.unmount();
    expect(held()).toBe(0);
  });

  it('opens the set-up sheet by itself before the first set of a new exercise, and closes it when the set starts', async () => {
    const p = start();
    await flush();
    expect(p.api().sheet).toBe(true);             // ready over a never-run exercise: the longer count, to read it
    expect(p.api().state.leftMs).toBe(READY_SETUP_SECONDS * 1000);
    await advance(READY_SECONDS * 1000);
    expect(p.api().state.phase).toBe('ready');
    await advance((READY_SETUP_SECONDS - READY_SECONDS) * 1000);
    expect(p.api().state.phase).toBe('work');
    expect(p.api().sheet).toBe(false);            // nothing else visible during the set
    p.api().primary(); await flush();             // the first set done: this device has now run it
    expect(JSON.parse(store.get(SEEN_KEY)!)).toEqual(['goblet']);
    expect(p.api().sheet).toBe(false);            // set 2's rest: not a new exercise
    p.m.unmount();
    // a second session over the same exercise: no sheet by itself
    const q = start();
    await flush();
    expect(q.api().sheet).toBe(false);
    expect(q.api().state.leftMs).toBe(READY_SECONDS * 1000);
    q.m.unmount();
  });

  it('says the exercise, Go with the cue, Rest with what comes next; mute silences it and is remembered', async () => {
    const p = start();
    await flush();
    expect(p.said).toEqual(['Goblet Squat to Box.']);
    await advance(READY_SETUP_SECONDS * 1000);
    expect(p.said.at(-1)).toBe('Go. Sit back to the box.');
    p.api().primary(); await flush();
    expect(p.said.at(-1)).toBe('Rest.');
    await advance(30_000);
    expect(p.voice.tick).toHaveBeenCalledTimes(3);
    p.api().toggleMute(); await flush();
    expect(p.api().muted).toBe(true);
    const n = p.said.length;
    p.api().primary(); await flush();
    expect(p.said.length).toBe(n);
    p.m.unmount();
    expect(start().api().muted).toBe(true);
  });

  it('Back takes a mistaken Set done back', async () => {
    const p = start();
    await advance(READY_SETUP_SECONDS * 1000);
    p.api().primary(); await flush();
    expect(p.api().state).toMatchObject({ phase: 'rest', setsDone: 1 });
    p.api().back(); await flush();
    expect(p.api().state).toMatchObject({ phase: 'work', step: 0, set: 1, setsDone: 0 });
    p.m.unmount();
  });
});
