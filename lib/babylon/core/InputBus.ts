// InputBus — every input source (keyboard, touch overlay, Gamepad API) emits the
// same normalized FelInput events. Game logic ONLY subscribes here.

export type FelInput =
  | { t: 'stick'; side: 'L' | 'R'; x: number; y: number }
  | { t: 'dpad'; dir: 'up' | 'down' | 'left' | 'right'; pressed: boolean }
  | { t: 'button'; btn: 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1' | 'SELECT' | 'START'; pressed: boolean }
  | { t: 'trigger'; side: 'L' | 'R'; value: number };

import { HAPTIC } from '../premium/Haptics';

type Listener = (e: FelInput) => void;

const KEYMAP: Record<string, FelInput> = {
  arrowup: { t: 'dpad', dir: 'up', pressed: true },
  arrowdown: { t: 'dpad', dir: 'down', pressed: true },
  arrowleft: { t: 'dpad', dir: 'left', pressed: true },
  arrowright: { t: 'dpad', dir: 'right', pressed: true },
  j: { t: 'button', btn: 'A', pressed: true },
  k: { t: 'button', btn: 'B', pressed: true },
  l: { t: 'button', btn: 'X', pressed: true },
  i: { t: 'button', btn: 'Y', pressed: true },
  q: { t: 'button', btn: 'L1', pressed: true },
  e: { t: 'button', btn: 'R1', pressed: true },
  c: { t: 'button', btn: 'SELECT', pressed: true },
  escape: { t: 'button', btn: 'START', pressed: true },
};
const WASD = new Set(['w', 'a', 's', 'd']);

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

    if (WASD.has(key)) {
      const x = (this.held.has('d') ? 1 : 0) - (this.held.has('a') ? 1 : 0);
      const y = (this.held.has('s') ? 1 : 0) - (this.held.has('w') ? 1 : 0);
      this.emit({ t: 'stick', side: 'L', x, y });
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
