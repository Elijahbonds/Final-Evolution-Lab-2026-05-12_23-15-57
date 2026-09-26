// MOVEMENT PLAY P3 (2026-09-24): the session store — the running game's card, body line and pause reason, and the
// run's play evidence ("input the game received", owner call 4). Pinned: what one input is (EvidenceCounter: a press,
// a crossing — never a steady hold or a jittering thumb twice), whose it is (the `src: 'body'` tag), that a run's record
// is numbered and outlives the harness until the next run, that the view only changes identity when it changes
// (useSyncExternalStore re-renders on identity), and (the step-2 review) that the writers belong to one mount: a harness
// torn down after the next one mounted blanks nothing.
import { describe, it, expect, afterEach } from 'vitest';
import { sessionStore, EvidenceCounter, EVIDENCE_TRIGGER_MS, type SessionWriter } from './sessionStore';
import type { FelInput } from './InputBus';

let w: SessionWriter | null = null;
afterEach(() => { w?.unmount(); w = null; });

const stick = (x: number, y: number, body = false): FelInput => (body ? { t: 'stick', side: 'L', x, y, src: 'body' } : { t: 'stick', side: 'L', x, y });
const trig = (value: number, body = false): FelInput => (body ? { t: 'trigger', side: 'R', value, src: 'body' } : { t: 'trigger', side: 'R', value });
const card = (modeId: string, key = modeId) => ({ modeId, key, lines: [], drives: true, later: 'P8' as const });

describe('EvidenceCounter — one input is one press or one crossing', () => {
  it('a button or d-pad press counts, its release does not; the tag says whose', () => {
    const c = new EvidenceCounter();
    expect(c.count({ t: 'button', btn: 'A', pressed: true }, 0)).toBe('external');
    expect(c.count({ t: 'button', btn: 'A', pressed: false }, 10)).toBeNull();
    expect(c.count({ t: 'button', btn: 'A', pressed: true, src: 'key' }, 20)).toBe('external');
    expect(c.count({ t: 'button', btn: 'A', pressed: true, src: 'body' }, 30)).toBe('body');
    expect(c.count({ t: 'dpad', dir: 'left', pressed: true, src: 'body' }, 40)).toBe('body');
    expect(c.count({ t: 'dpad', dir: 'left', pressed: false, src: 'body' }, 50)).toBeNull();
  });
  it('a stick counts once per push past 0.5, re-armed only under 0.3 (a thumb wobbling at the line is one push)', () => {
    const c = new EvidenceCounter();
    const seq = [0.2, 0.49, 0.5, 0.7, 0.45, 0.55, 0.31, 0.6, 0.29, 0.51].map((x, i) => c.count(stick(x, 0), i * 16));
    expect(seq).toEqual([null, null, 'external', null, null, null, null, null, null, 'external']);
    // the vector's length, not an axis: (0.4, 0.4) is 0.57
    const d = new EvidenceCounter();
    expect(d.count(stick(0.4, 0.4, true), 0)).toBe('body');
    // each side on its own
    expect(d.count({ t: 'stick', side: 'R', x: 0, y: -0.9 }, 10)).toBe('external');
  });
  it('a trigger counts crossing 0.5 upward, no sooner than 120 ms after the last (the qaTrig rule); a steady hold is one', () => {
    const c = new EvidenceCounter();
    expect(c.count(trig(0.3), 0)).toBeNull();
    expect(c.count(trig(0.6), 16)).toBe('external');
    for (let t = 32; t < 500; t += 16) expect(c.count(trig(0.6), t)).toBeNull();   // held
    expect(c.count(trig(0.4), 500)).toBeNull();
    expect(c.count(trig(0.9, true), 516)).toBe('body');
    expect(c.count(trig(0.2), 530)).toBeNull();
    expect(c.count(trig(0.7), 516 + EVIDENCE_TRIGGER_MS)).toBeNull();               // a flicker inside 120 ms
    expect(c.count(trig(0.1), 700)).toBeNull();
    expect(c.count(trig(0.8), 710)).toBe('external');
  });
  it('reset forgets the arms and the last pull', () => {
    const c = new EvidenceCounter();
    c.count(stick(0.9, 0), 0); c.count(trig(0.9), 0);
    c.reset();
    expect(c.count(stick(0.9, 0), 10)).toBe('external');
    expect(c.count(trig(0.9), 10)).toBe('external');
  });
});

describe('the run record', () => {
  it('beginRun numbers a new run (runId only grows) and count() adds to it, by source', () => {
    const before = sessionStore.record()?.runId ?? 0;
    w = sessionStore.mount(card('skateboard'));
    w.beginRun('skateboard');
    const r1 = sessionStore.record()!;
    expect(r1).toEqual({ runId: before + 1, modeId: 'skateboard', inputs: 0, bodyInputs: 0 });
    w.count('external'); w.count('body'); w.count('body');
    expect(sessionStore.record()).toEqual({ runId: before + 1, modeId: 'skateboard', inputs: 1, bodyInputs: 2 });
    expect(sessionStore.record()).not.toBe(r1);          // a new snapshot, not a mutation
    w.beginRun('sprint');
    expect(sessionStore.record()).toEqual({ runId: before + 2, modeId: 'sprint', inputs: 0, bodyInputs: 0 });
  });
  it('survives the harness going (unmount): the shell asks at handleEnd, after teardown', () => {
    w = sessionStore.mount({ modeId: 'karate-vs', key: 'karate_vs', lines: [], drives: true, later: 'P7' });
    w.beginRun('karate-vs');
    w.count('body');
    const rec = sessionStore.record();
    w.unmount();
    expect(sessionStore.record()).toBe(rec);
    expect(sessionStore.record()!.bodyInputs).toBe(1);
    w.count('body');                                       // a harness gone counts nothing more
    expect(sessionStore.record()).toBe(rec);
  });
});

describe('the view', () => {
  it('mount writes the card and clears the body line and the pause; unmount empties it', () => {
    const a = sessionStore.mount({ modeId: 'skateboard', key: 'skateboard', lines: [{ move: 'Jump', verb: 'POP' }], drives: true, later: 'P8' });
    a.setBody('present', 0.5); a.setPause('body-lost');
    w = sessionStore.mount({ modeId: 'dunk', key: 'dunk', lines: [], drives: false, later: 'P5' });
    expect(sessionStore.view()).toEqual({ modeId: 'dunk', key: 'dunk', lines: [], drives: false, later: 'P5', body: 'off', handsUp01: 0, pause: null, phase: null });
    w.unmount();
    expect(sessionStore.view()).toEqual({ modeId: null, key: null, lines: [], drives: false, later: null, body: 'off', handsUp01: 0, pause: null, phase: null });
  });
  it('a writer that changes nothing keeps the snapshot and tells nobody; one that does, replaces it and tells every subscriber', () => {
    let n = 0;
    const un = sessionStore.subscribe(() => { n++; });
    w = sessionStore.mount(card('sprint'));
    const v0 = sessionStore.view();
    expect(n).toBe(1);
    w.setBody('present', 0);
    const v1 = sessionStore.view();
    expect(v1).not.toBe(v0);
    expect(v1.body).toBe('present');
    for (let i = 0; i < 30; i++) w.setBody('present', 0);   // a steady 30 Hz of the same
    w.setPause(null);
    expect(sessionStore.view()).toBe(v1);
    expect(n).toBe(2);
    w.setBody('present', 0.25); w.setPause('stall');
    expect(sessionStore.view()).toMatchObject({ handsUp01: 0.25, pause: 'stall' });
    expect(n).toBe(4);
    un();
    w.setPause(null);
    expect(n).toBe(4);
  });
});

describe('the phase (movement play P4)', () => {
  it('the harness writes it: only a change is a new snapshot, and a mount starts it clear', () => {
    let n = 0;
    const un = sessionStore.subscribe(() => { n++; });
    w = sessionStore.mount(card('skateboard'));
    expect(sessionStore.view().phase).toBeNull();
    w.setPhase('loading');
    const v = sessionStore.view();
    w.setPhase('loading');
    expect(sessionStore.view()).toBe(v);
    w.setPhase('ready');
    w.setPhase('playing');
    expect(sessionStore.view().phase).toBe('playing');
    expect(n).toBe(4);
    un();
  });
  it('a stale writer (a harness torn down after the next mounted) moves nobody\'s phase', () => {
    const first = sessionStore.mount(card('skateboard'));
    w = sessionStore.mount(card('sprint'));
    w.setPhase('ready');
    const v = sessionStore.view();
    first.setPhase('playing');
    expect(sessionStore.view()).toBe(v);
    expect(sessionStore.view().phase).toBe('ready');
  });
});

describe('the writers belong to one mount (the step-2 review)', () => {
  it('a harness torn down AFTER the next one mounted (StrictMode, a quick remount) blanks nothing and writes nothing', () => {
    const first = sessionStore.mount(card('skateboard'));        // mounted, still loading
    w = sessionStore.mount(card('skateboard'));                   // the next harness mounts
    w.setBody('present', 0.5); w.setPause('input');
    w.beginRun('skateboard');
    const view = sessionStore.view(), rec = sessionStore.record();
    let n = 0;
    const un = sessionStore.subscribe(() => { n++; });
    expect(first.live()).toBe(false);
    expect(w.live()).toBe(true);
    // the first one's load finishes and its disposer runs now: every write is stale
    first.setBody('absent', 0); first.setPause('body-lost'); first.beginRun('skateboard'); first.count('body'); first.unmount();
    expect(sessionStore.view()).toBe(view);
    expect(sessionStore.record()).toBe(rec);
    expect(n).toBe(0);
    // the live one still writes, and its own unmount clears the card
    w.count('external');
    expect(sessionStore.record()!.inputs).toBe(1);
    w.unmount();
    expect(w.live()).toBe(false);
    expect(sessionStore.view().modeId).toBeNull();
    un();
  });
});
