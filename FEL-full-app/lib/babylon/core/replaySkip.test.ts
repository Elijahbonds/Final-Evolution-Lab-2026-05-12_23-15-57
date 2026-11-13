// hoops-flow (owner 2026-11-12): "any press skips a replay". The gate (core/replaySkip) on its own, the harness and the modes that use it
// (source: the harness's input handler is a closure inside runMode), and a real ReplayDirector ending the frame the press lands.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { ReplaySkipGate, REPLAY_SKIP_ON, replaySkipOn, STICK_PUSH, STICK_REST, TRIGGER_PULL } from './replaySkip';
import type { FelInput } from './InputBus';
import { FEEL_KNOB_BY_ID } from '../../feel-panel/knobs';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { feelSessionBlock } from '../../feel-panel/sessionGate';
import { ReplayDirector } from '../scene/ReplayDirector';

const R = (x: number, y = 0): FelInput => ({ t: 'stick', side: 'R', x, y });
const L = (x: number, y = 0): FelInput => ({ t: 'stick', side: 'L', x, y });
const RT = (value: number): FelInput => ({ t: 'trigger', side: 'R', value });
const read = (f: string) => readFileSync(path.resolve(__dirname, f), 'utf8');

describe('the gate: what skips a replay, and what the mode then sees', () => {
  it('a right-stick flick from rest skips it, and the stick is the replay\'s until it is back at rest (not a dribble move after)', () => {
    const g = new ReplaySkipGate('L');
    expect(g.see(R(0.2), true)).toBe('pass');          // a twitch under the push is no press
    expect(g.see(R(0.9), true)).toBe('skip');
    expect(g.see(R(1), false)).toBe('drop');           // the replay is over; the flick is still held
    expect(g.see(R(0.4), false)).toBe('drop');         // hysteresis: under the push, still out of rest
    expect(g.see(R(0.1), false)).toBe('drop');         // back at rest: dropped too (the mode last saw it at rest)
    expect(g.see(R(0.9), false)).toBe('pass');         // the next flick is the game's
    expect(g.skips).toBe(1);
  });
  it('the walking stick skips it and is passed on (a held stick moves the body when the ball comes back)', () => {
    const g = new ReplaySkipGate('L');
    expect(g.see(L(0, -1), true)).toBe('skipPass');
    expect(g.see(L(0.1, -1), true)).toBe('pass');      // the same push, still out: one skip
    expect(g.see(L(0, 0), false)).toBe('pass');
  });
  it('a stick or trigger already held when the replay starts never skips it on its own (a seated pad re-sends every frame)', () => {
    const g = new ReplaySkipGate('L');
    expect(g.see(R(1), false)).toBe('pass');
    expect(g.see(RT(1), false)).toBe('pass');
    for (let i = 0; i < 30; i++) { expect(g.see(R(1), true)).toBe('pass'); expect(g.see(RT(1), true)).toBe('pass'); }
    expect(g.see(R(0), true)).toBe('pass'); expect(g.see(R(1), true)).toBe('skip');   // let go and pushed again: a press
  });
  it('a trigger pulled skips it; its hold and its release are the replay\'s (a release is never a launch)', () => {
    const g = new ReplaySkipGate('L');
    expect(g.see(RT(0.3), true)).toBe('pass');
    expect(g.see(RT(0.8), true)).toBe('skip');
    expect(g.see(RT(1), false)).toBe('drop');
    expect(g.see(RT(0), false)).toBe('drop');
    expect(g.see(RT(0.8), false)).toBe('pass');
  });
  it('a button or d-pad press during a replay skips it; a release, or a press outside a replay, is the game\'s', () => {
    const g = new ReplaySkipGate(null);
    expect(g.see({ t: 'button', btn: 'X', pressed: true }, true)).toBe('skip');
    expect(g.see({ t: 'dpad', dir: 'up', pressed: true }, true)).toBe('skip');
    expect(g.see({ t: 'button', btn: 'X', pressed: false }, true)).toBe('pass');
    expect(g.see({ t: 'button', btn: 'X', pressed: true }, false)).toBe('pass');
  });
  it('with no walking stick (the dunk cuts) both sticks are held back after a skip; a body event never skips', () => {
    const g = new ReplaySkipGate(null);
    expect(g.see(L(1), true)).toBe('skip');
    expect(g.see(L(1), false)).toBe('drop');
    expect(g.see({ t: 'stick', side: 'R', x: 1, y: 0, src: 'body' }, true)).toBe('pass');
    expect(g.see({ t: 'trigger', side: 'R', value: 1, src: 'body' }, true)).toBe('pass');
  });
  it('the thresholds', () => {
    expect([STICK_PUSH, STICK_REST, TRIGGER_PULL]).toEqual([0.5, 0.3, 0.5]);
    const g = new ReplaySkipGate('L'); g.see(R(1), true); g.reset();
    expect(g.see(R(0), false)).toBe('pass'); expect(g.skips).toBe(0);
  });
});

describe('the knob', () => {
  const gl = globalThis as { window?: unknown };
  afterEach(() => { resetFeelForTests(); delete gl.window; });
  it('ships on (1) and the panel\'s knob says so; 0 on a playtest run puts the old button-only skip back', () => {
    expect(REPLAY_SKIP_ON).toBe(1);
    expect(FEEL_KNOB_BY_ID.get('hoops.replaySkipOn')?.def).toBe(REPLAY_SKIP_ON);
    expect(replaySkipOn()).toBe(true);
    resetFeelForTests();
    const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify({ 'hoops.replaySkipOn': 0 })]]);
    gl.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } };
    setFeelUser(true); setFeelSession(feelSessionBlock('/play/onevone', '?playtest=1'));
    expect(replaySkipOn()).toBe(false);
  });
});

describe('the harness and the modes use it', () => {
  const harness = read('ModeHarness.ts');
  it('the harness: the any-press skip is only for a mode that asks, during a replay, and a skipping stick or trigger never reaches the mode', () => {
    expect(harness).toMatch(/const anySkip = \(\): boolean => phase === 'playing' && replayHold && !!def\.replaySkipAny\?\.\(\);/);
    expect(harness).toMatch(/if \(phase === 'playing' && def\.replaySkipAny && \(e\.t === 'stick' \|\| e\.t === 'trigger'\)\) \{\n\s*const v = replaySkip\.see\(e, anySkip\(\)\);\n\s*if \(v === 'skip' \|\| v === 'skipPass'\) replay\?\.skip\(\);\n\s*if \(v === 'skip' \|\| v === 'drop'\) return;/);
    // the gate runs BEFORE the mode's onInput (and after the button / d-pad skip line, which keeps its latch)
    const btn = harness.indexOf("if (phase === 'playing' && replayHold && (e.t === 'button' || e.t === 'dpad') && e.pressed)");
    const gate = harness.indexOf('const v = replaySkip.see(e, anySkip());');
    const mode = harness.indexOf('def.onInput(ctx, e);', gate);
    expect(btn).toBeGreaterThan(0); expect(gate).toBeGreaterThan(btn); expect(mode).toBeGreaterThan(gate);
    expect(harness).toMatch(/const onStageTap = \(\): void => \{ if \(anySkip\(\)\) \{ replaySkip\.skips\+\+; replay\?\.skip\(\); \} \};/);
    expect(harness).toMatch(/opts\.canvas\.removeEventListener\?\.\('pointerdown', onStageTap\);/);
  });
  it('1v1, 3v3 and the 3-point contest ask for it through the knob', () => {
    for (const f of ['../modes/OneVOneMode.ts', '../modes/ThreeVThreeMode.ts', '../modes/ThreePointMode.ts']) expect(read(f), f).toMatch(/\n\s*replaySkipAny: replaySkipOn,/);
  });
  it('the dunk contest and the duel end their cut on any press (a trigger by its crossing), behind the same knob', () => {
    const dunk = read('../modes/DunkMode.ts'), duel = read('../modes/DunkDuelMode.ts');
    expect(dunk).toMatch(/const v = cutSkip\.see\(e, cutting && replaySkipOn\(\)\);\n\s*if \(v === 'skip'\) \{ replay\.stop\(\); if \(e\.t === 'button' && e\.btn === 'A'\) revealHold = true;[^\n]*if \(e\.t !== 'dpad'\) return; \}/);
    expect(duel).toMatch(/const v = cutSkip\.see\(e, cutting && replaySkipOn\(\)\);\n\s*if \(v === 'skip'\) \{ replay\?\.stop\(\);[^\n]*return; \}/);
  });
});

describe('a real replay ends on the frame the press lands, and a late second skip changes nothing', () => {
  afterEach(() => vi.restoreAllMocks());
  it('skip → not playing at once; the live moment is back; the bodies the mode then moves stay where it put them', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const engine = new NullEngine();
    (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
    const scene = new Scene(engine);
    const cam = new FreeCamera('cam', new Vector3(0, 3, -8), scene);
    const body = new TransformNode('hero', scene);
    const rd = new ReplayDirector(scene, cam, [body]);
    const frame = () => { now += 1000 / 60; scene.render(); };
    for (let i = 0; i < 180; i++) { body.position.z = i * 0.05; frame(); }
    const live = body.position.clone();
    let resolved = false;
    const done = rd.play({ lastSeconds: 2 }).then(() => { resolved = true; });
    for (let i = 0; i < 10; i++) frame();
    expect(rd.playing).toBe(true);
    expect(body.position.equalsWithEpsilon(live, 1e-9)).toBe(false);   // it is showing the past
    rd.skip();                                                         // the press
    expect(rd.playing).toBe(false);                                    // 0 frames: ended in the press's own task
    expect(body.position.equalsWithEpsilon(live, 1e-9)).toBe(true);
    await done; expect(resolved).toBe(true);
    body.position.set(0, 0, 3);                                        // the mode's reset: the next possession's spot
    rd.skip();                                                         // a second input in the same task (a tap and its button)
    expect(body.position.z).toBe(3);                                   // not put back to the replay's live moment again
    frame();
    expect(body.position.z).toBe(3);
  });
});
