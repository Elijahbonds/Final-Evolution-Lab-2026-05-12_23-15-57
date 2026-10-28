// PLAT-P01 (2026-10-27): the session player's small pieces — the dose as one big number, the voice and its mute, the
// wake lock (with a stub navigator), the device's memory of exercises run, the ticker, the loop map.
import { describe, expect, it, vi } from 'vitest';
import { clock, doseLine, doseParts, duration } from '@/lib/session-player/dose';
import { DONE_LINE, GO_WORD, MUTE_KEY, REST_WORD, SessionVoice, lineFor, readMuted } from '@/lib/session-player/voice';
import { screenLock, type SentinelLike } from '@/lib/session-player/wakeLock';
import { SEEN_KEY, SEEN_MAX, markSeen, readSeen } from '@/lib/session-player/seen';
import { startTicker, type Clock } from '@/lib/session-player/ticker';
import { clipsFor } from '@/lib/session-player/clips';
import type { Session } from '@/lib/session-player/model';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m }; };

describe('the dose', () => {
  it('is one big number, and the source\'s own words after it', () => {
    expect(doseParts({ sets: 3, reps: '8', workSeconds: null })).toEqual({ big: '3 × 8', small: null });
    expect(doseParts({ sets: 2, reps: '8 each side', workSeconds: null })).toEqual({ big: '2 × 8', small: 'each side' });
    expect(doseParts({ sets: 3, reps: '20 m each hand', workSeconds: null })).toEqual({ big: '3 × 20 m', small: 'each hand' });
    expect(doseParts({ sets: 3, reps: '3, fast', workSeconds: null })).toEqual({ big: '3 × 3', small: 'fast' });
    expect(doseParts({ sets: 2, reps: '6 x 5 s', workSeconds: null })).toEqual({ big: '2 × 6 × 5 s', small: null });
    expect(doseParts({ sets: 2, reps: '10 contacts', workSeconds: null })).toEqual({ big: '2 × 10', small: 'contacts' });
    expect(doseParts({ sets: 1, reps: '120 s', workSeconds: 120 })).toEqual({ big: '120 s', small: null });
    expect(doseParts({ sets: 2, reps: '20 s each side', workSeconds: 20 })).toEqual({ big: '2 × 20 s', small: 'each side' });
    expect(doseParts({ sets: 1, reps: null, workSeconds: null })).toEqual({ big: '1', small: null });
    expect(doseLine({ sets: 2, reps: '8 each side', workSeconds: null })).toBe('2 × 8 each side');
  });

  it('counts down in seconds, minutes from a minute up; the finish time reads m:ss', () => {
    expect(clock(45_000)).toBe('45');
    expect(clock(44_100)).toBe('45');
    expect(clock(120_000)).toBe('2:00');
    expect(clock(-5)).toBe('0');
    expect(duration(725_000)).toBe('12:05');
    expect(duration(3_725_000)).toBe('1:02:05');
  });
});

const SESSION: Session = { id: 'w1:A', title: 't', steps: [
  { exId: 'a', name: 'Goblet Squat', sets: 2, reps: '8', workSeconds: null, restSeconds: 30, setup: 'x', cue: 'Sit between your heels', clip: 'ex_squat' },
  { exId: 'b', name: 'Side Plank', sets: 1, reps: '20 s', workSeconds: 20, restSeconds: 0, setup: '', cue: null, clip: null },
] };

describe('the voice', () => {
  it('says the name, Go (with the cue on an exercise\'s first set), Rest (with what comes next) and the finish', () => {
    expect(lineFor({ kind: 'enter', phase: 'ready', step: 0, set: 1, fresh: true }, SESSION)).toBe('Goblet Squat.');
    expect(lineFor({ kind: 'enter', phase: 'work', step: 0, set: 1, fresh: false }, SESSION)).toBe(`${GO_WORD} Sit between your heels.`);
    expect(lineFor({ kind: 'enter', phase: 'work', step: 0, set: 2, fresh: false }, SESSION)).toBe(GO_WORD);
    expect(lineFor({ kind: 'enter', phase: 'rest', step: 0, set: 2, fresh: false }, SESSION)).toBe(REST_WORD);
    expect(lineFor({ kind: 'enter', phase: 'rest', step: 1, set: 1, fresh: true }, SESSION)).toBe(`${REST_WORD} Next: Side Plank.`);
    expect(lineFor({ kind: 'enter', phase: 'work', step: 1, set: 1, fresh: false }, SESSION)).toBe(GO_WORD);   // no cue: just go
    expect(lineFor({ kind: 'enter', phase: 'finish', step: 1, set: 1, fresh: false }, SESSION)).toBe(DONE_LINE);
    expect(lineFor({ kind: 'tick', left: 2 }, SESSION)).toBeNull();
  });

  it("uses the Coach's own drill takes for go and rest where the bank has them", () => {
    const take = (m: string) => (m === 'coach.drill.go' ? { text: 'And go!' } : m === 'coach.drill.rest' ? { text: 'Take a breather.' } : null);
    expect(lineFor({ kind: 'enter', phase: 'work', step: 0, set: 2, fresh: false }, SESSION, take)).toBe('And go!');
    expect(lineFor({ kind: 'enter', phase: 'rest', step: 1, set: 1, fresh: true }, SESSION, take)).toBe('Take a breather. Next: Side Plank.');
  });

  it('mute silences words and ticks, and the device remembers it', () => {
    const s = mem();
    const out = { say: vi.fn(), tick: vi.fn(), cancel: vi.fn() };
    const v = new SessionVoice(out, s);
    v.play([{ kind: 'enter', phase: 'ready', step: 0, set: 1, fresh: true }, { kind: 'tick', left: 3 }], SESSION);
    expect(out.say).toHaveBeenCalledWith('Goblet Squat.');
    expect(out.tick).toHaveBeenCalledWith(3);
    v.setMuted(true);
    expect(out.cancel).toHaveBeenCalled();
    expect(s.getItem(MUTE_KEY)).toBe('1');
    out.say.mockClear(); out.tick.mockClear();
    v.play([{ kind: 'enter', phase: 'work', step: 0, set: 1, fresh: false }, { kind: 'tick', left: 1 }], SESSION);
    expect(out.say).not.toHaveBeenCalled();
    expect(out.tick).not.toHaveBeenCalled();
    expect(new SessionVoice(out, s).isMuted).toBe(true);   // remembered
    expect(readMuted({ getItem: () => { throw new Error('blocked'); }, setItem: () => {} })).toBe(false);
  });
});

function stubNav() {
  const sentinels: (SentinelLike & { released: boolean })[] = [];
  const nav = { wakeLock: { request: vi.fn(async () => { const s = { released: false, release: vi.fn(async () => { s.released = true; }) }; sentinels.push(s); return s; }) } };
  return { nav, sentinels };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the wake lock', () => {
  it('is asked for on play, let go on pause and finish, asked for again on resume, and let go on close', async () => {
    const { nav, sentinels } = stubNav();
    const doc = { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const lock = screenLock(nav, doc);
    lock.hold(); await flush();
    expect(nav.wakeLock.request).toHaveBeenCalledWith('screen');
    expect(lock.held).toBe(true);
    lock.hold(); await flush();
    expect(nav.wakeLock.request).toHaveBeenCalledTimes(1);   // one lock, not one per beat
    lock.release();
    expect(sentinels[0].released).toBe(true);
    expect(lock.held).toBe(false);
    lock.hold(); await flush();
    expect(nav.wakeLock.request).toHaveBeenCalledTimes(2);
    lock.dispose();
    expect(sentinels[1].released).toBe(true);
    expect(doc.removeEventListener).toHaveBeenCalled();
  });

  it('is asked for again when the page comes back (the browser drops it on hide)', async () => {
    const { nav } = stubNav();
    let onVis: () => void = () => {};
    const doc = { visibilityState: 'hidden', addEventListener: (_: string, f: () => void) => { onVis = f; }, removeEventListener: vi.fn() };
    const lock = screenLock(nav, doc);
    lock.hold(); await flush();
    expect(nav.wakeLock.request).not.toHaveBeenCalled();     // hidden: not now
    doc.visibilityState = 'visible'; onVis(); await flush();
    expect(nav.wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it('a lock that arrives after the player let go is released at once; no API or a refusal plays on', async () => {
    let resolve: (s: SentinelLike) => void = () => {};
    const s = { release: vi.fn(async () => {}) };
    const nav = { wakeLock: { request: vi.fn(() => new Promise<SentinelLike>((r) => { resolve = r; })) } };
    const lock = screenLock(nav, null);
    lock.hold(); lock.release(); resolve(s); await flush();
    expect(s.release).toHaveBeenCalled();
    expect(() => { const l = screenLock({}, null); l.hold(); l.release(); l.dispose(); }).not.toThrow();
    const refused = screenLock({ wakeLock: { request: () => Promise.reject(new Error('NotAllowed')) } }, null);
    refused.hold(); await flush();
    expect(refused.held).toBe(false);
  });
});

describe('the exercises this device has run', () => {
  it('are kept as ids only, capped, and a broken value reads as none', () => {
    const s = mem();
    expect(readSeen(s).size).toBe(0);
    markSeen(s, 'a'); markSeen(s, 'a'); markSeen(s, 'b');
    expect([...readSeen(s)]).toEqual(['a', 'b']);
    for (let i = 0; i < SEEN_MAX + 5; i++) markSeen(s, `x${i}`);
    expect(readSeen(s).size).toBe(SEEN_MAX);
    s.setItem(SEEN_KEY, '{nope');
    expect(readSeen(s).size).toBe(0);
    expect(readSeen(null).size).toBe(0);
  });
});

describe('the ticker', () => {
  it('hands the machine the time that really passed between beats', () => {
    let t = 0; let beat: () => void = () => {};
    const stop = vi.fn();
    const clk: Clock = { now: () => t, every: (_ms, f) => { beat = f; return stop; } };
    const dts: number[] = [];
    const off = startTicker((dt) => dts.push(dt), clk);
    t = 250; beat(); t = 1250; beat(); beat();
    expect(dts).toEqual([250, 1000]);   // a beat with no time passed hands nothing
    off();
    expect(stop).toHaveBeenCalled();
  });
});

describe('the loop map', () => {
  it('maps each library id once; an unknown id or one with no faithful loop is null (the still, "Demo coming")', () => {
    const entry = (id: string) => (id === 'sq' ? { family: 'squat', variation: 'goblet', equipment: ['dumbbell'] } : id === 'odd' ? { family: 'no-such-family', variation: 'x', equipment: [] } : null);
    const m = clipsFor(['sq', 'odd', 'gone', 'sq'], entry);
    expect(Object.keys(m)).toEqual(['sq', 'odd', 'gone']);
    expect(m.odd).toBeNull();
    expect(m.gone).toBeNull();
  });
});
