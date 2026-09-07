// InputBus — every input source (keyboard, touch overlay, Gamepad API) emits the
// same normalized FelInput events. Game logic ONLY subscribes here.

export type FelInput =
  | { t: 'stick'; side: 'L' | 'R'; x: number; y: number }
  /** `src: 'key'` marks a keyboard ARROW: the arrows also drive the L stick (see onKey), so a mode whose d-pad
   *  means something else on the runway (the dunk's PROP) must skip keyboard d-pad presses — pad buttons 12–15,
   *  the touch d-pad and Controller Link carry no src and stay the real d-pad. */
  | { t: 'dpad'; dir: 'up' | 'down' | 'left' | 'right'; pressed: boolean; src?: 'key' }
  | { t: 'button'; btn: 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1' | 'SELECT' | 'START'; pressed: boolean }
  | { t: 'trigger'; side: 'L' | 'R'; value: number };

import { HAPTIC } from '../premium/Haptics';

type Listener = (e: FelInput) => void;

const KEYMAP: Record<string, FelInput> = {
  j: { t: 'button', btn: 'A', pressed: true },
  k: { t: 'button', btn: 'B', pressed: true },
  l: { t: 'button', btn: 'X', pressed: true },
  i: { t: 'button', btn: 'Y', pressed: true },
  q: { t: 'button', btn: 'L1', pressed: true },
  e: { t: 'button', btn: 'R1', pressed: true },
  c: { t: 'button', btn: 'SELECT', pressed: true },
  escape: { t: 'button', btn: 'START', pressed: true },
};
// Dunk keyboard hotfix (2026-09-07): the ARROWS are the L stick too. They were d-pad only, so on a mode whose d-pad
// is a picker (the dunk's PROP) ArrowUp cycled the prop instead of running at the rim while W ran — players use the
// arrows exactly like WASD. Held arrows and WASD sum into ONE L-stick vector (up = −y on every source); the arrows
// ALSO keep emitting their d-pad press/release tagged `src: 'key'`, because eleven keyboard surfaces read the arrow
// d-pad (the sprint masher, the quiz answers, the penalty dive, the pre-run pickers, the dunk's mid-air trick
// direction) and none of them may lose it. A mode that has both a stick and a d-pad picker skips `src === 'key'`.
const WASD = new Set(['w', 'a', 's', 'd']);
const ARROWS: Record<string, 'up' | 'down' | 'left' | 'right'> = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' };

export class InputBus {
  private listeners = new Set<Listener>();
  private held = new Set<string>();
  private padIndex: number | null = null;
  private raf = 0;
  /** Space doubles as R-trigger analog (hold-depth) for charge mechanics. */
  private spaceDownAt = 0;
  public gamepadActive = false;

  start(): void {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('gamepadconnected', this.onPad);
    window.addEventListener('gamepaddisconnected', this.onPadOff);
    this.pollPads();
  }
  stop(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('gamepadconnected', this.onPad);
    window.removeEventListener('gamepaddisconnected', this.onPadOff);
    cancelAnimationFrame(this.raf);
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: FelInput): void {                        // touch overlay calls this directly
    if (e.t === 'button' && e.pressed) HAPTIC.tap();  // 10ms button-down buzz (throttled in Haptics) //TUNE(elijah)
    this.listeners.forEach((fn) => fn(e));
  }

  private onKey = (ev: KeyboardEvent): void => {
    const key = ev.key.toLowerCase();
    const down = ev.type === 'keydown';
    if (down && this.held.has(key)) return;        // no key-repeat spam
    down ? this.held.add(key) : this.held.delete(key);

    const arrow = ARROWS[key];
    if (WASD.has(key) || arrow) {
      if (arrow) ev.preventDefault();   // a held arrow must not scroll the /try page under the canvas
      const h = (k: string) => (this.held.has(k) ? 1 : 0);
      const x = Math.max(-1, Math.min(1, h('d') + h('arrowright') - h('a') - h('arrowleft')));
      const y = Math.max(-1, Math.min(1, h('s') + h('arrowdown') - h('w') - h('arrowup')));
      this.emit({ t: 'stick', side: 'L', x, y });
      if (arrow) this.emit({ t: 'dpad', dir: arrow, pressed: down, src: 'key' });
      return;
    }
    if (key === ' ') {
      if (down) { this.spaceDownAt = performance.now(); this.emit({ t: 'trigger', side: 'R', value: 0.01 }); }
      else { this.emit({ t: 'trigger', side: 'R', value: 0 }); this.emit({ t: 'button', btn: 'A', pressed: true }); }
      return;
    }
    const mapped = KEYMAP[key];
    if (mapped) this.emit({ ...mapped, pressed: down } as FelInput);
  };

  private onPad = (ev: GamepadEvent): void => { this.padIndex = ev.gamepad.index; this.gamepadActive = true; };
  private onPadOff = (): void => { this.padIndex = null; this.gamepadActive = false; };

  private pollPads = (): void => {
    if (this.padIndex !== null) {
      const pad = navigator.getGamepads()[this.padIndex];
      if (pad) {
        const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
        this.emit({ t: 'stick', side: 'L', x: dz(pad.axes[0]), y: dz(pad.axes[1]) });
        this.emit({ t: 'stick', side: 'R', x: dz(pad.axes[2]), y: dz(pad.axes[3]) });
        this.emit({ t: 'trigger', side: 'L', value: pad.buttons[6]?.value ?? 0 });
        this.emit({ t: 'trigger', side: 'R', value: pad.buttons[7]?.value ?? 0 });
        const btns: Array<['A'|'B'|'X'|'Y'|'L1'|'R1'|'SELECT'|'START', number]> =
          [['A', 0], ['B', 1], ['X', 2], ['Y', 3], ['L1', 4], ['R1', 5], ['SELECT', 8], ['START', 9]];
        // Standard Gamepad API d-pad mapping (buttons 12-15) — keyboard arrows
        // and the touch overlay's d-pad already emit these same events, so a
        // real controller's physical d-pad needs to feed the identical path.
        const dpad: Array<['up'|'down'|'left'|'right', number]> =
          [['up', 12], ['down', 13], ['left', 14], ['right', 15]];
        for (const [dir, i] of dpad) {
          const pressed = !!pad.buttons[i]?.pressed;
          const key = `pad_dpad_${dir}`;
          if (pressed && !this.held.has(key)) { this.held.add(key); this.emit({ t: 'dpad', dir, pressed: true }); }
          if (!pressed && this.held.has(key)) { this.held.delete(key); this.emit({ t: 'dpad', dir, pressed: false }); }
        }
        for (const [btn, i] of btns) {
          const pressed = !!pad.buttons[i]?.pressed;
          const key = `pad_${btn}`;
          if (pressed && !this.held.has(key)) { this.held.add(key); this.emit({ t: 'button', btn, pressed: true }); }
          if (!pressed && this.held.has(key)) { this.held.delete(key); this.emit({ t: 'button', btn, pressed: false }); }
        }
      }
    }
    // Space analog charge depth while held (0→1 over 1.1s)
    if (this.held.has(' ')) {
      const depth = Math.min(1, (performance.now() - this.spaceDownAt) / 1100);
      this.emit({ t: 'trigger', side: 'R', value: depth });
    }
    this.raf = requestAnimationFrame(this.pollPads);
  };
}
