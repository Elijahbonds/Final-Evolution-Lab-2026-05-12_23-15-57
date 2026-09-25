// SHARED-START-UNSTICK (2026-09-14): the READY gate wakes on any deliberate input and the waking press never leaks
// into play. Plus source scans on the two places a regression would come back: the harness's gate, and the 2-D cards.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isWakeInput, WakeLatch, WAKE_ECHO_MS, KEY_SPACE_DOWN, SPACE_TAP_MS } from './StartWake';

const root = path.resolve(__dirname, '../../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('isWakeInput', () => {
  it('wakes on any button, d-pad press, stick push or trigger pull', () => {
    expect(isWakeInput({ t: 'button', btn: 'A', pressed: true })).toBe(true);
    expect(isWakeInput({ t: 'button', btn: 'START', pressed: true })).toBe(true);
    expect(isWakeInput({ t: 'dpad', dir: 'right', pressed: true })).toBe(true);
    expect(isWakeInput({ t: 'stick', side: 'L', x: 0, y: -1 })).toBe(true);
    expect(isWakeInput({ t: 'stick', side: 'R', x: 0.4, y: 0.4 })).toBe(true);
    expect(isWakeInput({ t: 'trigger', side: 'R', value: 0.9 })).toBe(true);
  });
  it('does not wake on releases, a resting stick or trigger noise', () => {
    expect(isWakeInput({ t: 'button', btn: 'A', pressed: false })).toBe(false);
    expect(isWakeInput({ t: 'dpad', dir: 'up', pressed: false })).toBe(false);
    expect(isWakeInput({ t: 'stick', side: 'L', x: 0.1, y: -0.2 })).toBe(false);
    expect(isWakeInput({ t: 'stick', side: 'L', x: 0, y: 0 })).toBe(false);
    expect(isWakeInput({ t: 'trigger', side: 'L', value: 0.05 })).toBe(false);
  });
});

// MOVEMENT PLAY P3 (2026-09-24): the body starts a game through its own START (both hands held up) and nothing else —
// a lean, a crouch or a jump the floor turned into a FelInput is a person getting ready, not a press (P3 Z4).
describe('isWakeInput — the body never wakes a game through a FelInput', () => {
  it('a body button or d-pad press never wakes', () => {
    expect(isWakeInput({ t: 'button', btn: 'A', pressed: true, src: 'body' })).toBe(false);
    expect(isWakeInput({ t: 'button', btn: 'B', pressed: true, src: 'body' })).toBe(false);
    expect(isWakeInput({ t: 'dpad', dir: 'right', pressed: true, src: 'body' })).toBe(false);
    expect(isWakeInput({ t: 'button', btn: 'A', pressed: true, src: 'key' })).toBe(true);   // the keyboard's tag still wakes
  });
  it('a body stick push never wakes, however far', () => {
    expect(isWakeInput({ t: 'stick', side: 'L', x: 1, y: 0, src: 'body' })).toBe(false);
    expect(isWakeInput({ t: 'stick', side: 'L', x: 0, y: -1, src: 'body' })).toBe(false);
  });
  it('a body trigger pull never wakes, not even at the Space-down marker', () => {
    expect(isWakeInput({ t: 'trigger', side: 'R', value: 1, src: 'body' })).toBe(false);
    expect(isWakeInput({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN, src: 'body' })).toBe(false);
  });
});

describe('WakeLatch', () => {
  it('drops the waking button release so a hold-to-shoot does not fire on the first frame', () => {
    const l = new WakeLatch();
    expect(l.wake({ t: 'button', btn: 'A', pressed: true }, 1000)).toBe(false);
    expect(l.pass({ t: 'button', btn: 'A', pressed: false }, 1400)).toBe(false);
    // the next deliberate press + release are the mode's
    expect(l.pass({ t: 'button', btn: 'A', pressed: true }, 2000)).toBe(true);
    expect(l.pass({ t: 'button', btn: 'A', pressed: false }, 2300)).toBe(true);
  });
  it('forwards a waking stick push — the player is moving on the first playing frame', () => {
    const l = new WakeLatch();
    expect(l.wake({ t: 'stick', side: 'L', x: 0, y: -1 }, 0)).toBe(true);
    expect(l.pass({ t: 'stick', side: 'L', x: 0, y: -1 }, 16)).toBe(true);
  });
  it('swallows the same-instant twin of an arrow key (stick woke it, the d-pad echo follows)', () => {
    const l = new WakeLatch();
    l.wake({ t: 'stick', side: 'L', x: 1, y: 0 }, 500);
    expect(l.pass({ t: 'dpad', dir: 'right', pressed: true, src: 'key' }, 501)).toBe(false);
    expect(l.pass({ t: 'dpad', dir: 'right', pressed: false, src: 'key' }, 640)).toBe(false);
    expect(l.pass({ t: 'dpad', dir: 'right', pressed: true, src: 'key' }, 500 + WAKE_ECHO_MS + 200)).toBe(true);
  });
  it('a held SPACE wakes on key-down (not 550 ms into its charge), and a quick tap does not fire a shot on keyup', () => {
    expect(isWakeInput({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN })).toBe(true);
    expect(isWakeInput({ t: 'trigger', side: 'R', value: 0.03 })).toBe(false);   // pad trigger noise
    const tap = new WakeLatch();
    expect(tap.wake({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN }, 0)).toBe(true);
    expect(tap.pass({ t: 'trigger', side: 'R', value: 0 }, 110)).toBe(true);
    expect(tap.pass({ t: 'button', btn: 'A', pressed: true }, 110)).toBe(false);   // the tap's keyup A = the wake
    expect(tap.pass({ t: 'button', btn: 'A', pressed: true }, 900)).toBe(true);    // the next space is a shot
    const hold = new WakeLatch();
    hold.wake({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN }, 0);
    expect(hold.pass({ t: 'trigger', side: 'R', value: 0.6 }, 700)).toBe(true);
    expect(hold.pass({ t: 'button', btn: 'A', pressed: true }, SPACE_TAP_MS + 450)).toBe(true);   // a charge's release
  });
  it('InputBus emits the space-down marker by name, so the two cannot drift apart', () => {
    expect(src('lib/babylon/core/InputBus.ts')).toMatch(/value: KEY_SPACE_DOWN \}/);
  });
  it('does not eat an unrelated release', () => {
    const l = new WakeLatch();
    l.wake({ t: 'button', btn: 'START', pressed: true }, 0);
    expect(l.pass({ t: 'button', btn: 'B', pressed: false }, 300)).toBe(true);
  });
});

describe('the gates stay wide open (source scans)', () => {
  it('ModeHarness wakes through isWakeInput and never runs the 800 ms 3-2-1 again', () => {
    const h = src('lib/babylon/core/ModeHarness.ts');
    expect(h).toMatch(/phase === 'ready' && isWakeInput\(e\)/);
    expect(h).not.toMatch(/setInterval\([\s\S]{0,400}?\}, 800\)/);
  });
  it('BootSplash starts on a press anywhere on the READY card, not only on its button', () => {
    expect(src('components/games/boot-splash.tsx')).toMatch(/onPointerDown=\{props\.phase === 'ready'/);
  });
  it('tiebreak and training start through the shared useStartWake hook', () => {
    for (const f of ['components/games/tiebreak-game.tsx', 'components/games/training-game.tsx']) {
      expect(src(f)).toMatch(/useStartWake\(!started/);
    }
  });
});
