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
// Input & Presence Phase A: the pad is read through a PROFILE now. Everything below keeps its FelInput
// contract exactly — no mode file and no existing test changes — but the indices it reads are the profile's
// rather than a hardcoded Standard Gamepad table, and the stick deadzone is radial instead of per-axis.
import { profileFor, readPad, type ControllerProfile } from '@/lib/input/profiles';
import { applyRemap, readRemap } from '@/lib/input/remap';

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
    this.adoptPad();     // a pad plugged in BEFORE this page loaded never fires gamepadconnected — take it now
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

  // ── Gamepad adoption (DUNK-LIVE-INPUT-FAIL, 2026-09-07) ──
  // ROOT CAUSE of the live /try FAIL (L stick dead, R look dead, arms frozen, hero back-facing): `padIndex` was set
  // ONLY by `gamepadconnected`, and a DualShock that was already plugged in when the page loaded never fires it —
  // the browser only raises the event for a pad that connects (or first reports a button press) AFTER the listener
  // is registered. So on a real /try load with the pad already in, `pollPads` read nothing for the whole contest.
  // The fake-Gamepad probe dispatched its own connect event after start() and so never saw it. Now: start() scans
  // `navigator.getGamepads()` and adopts the first live slot; while no pad is held, pollPads re-scans EVERY frame
  // (Chrome fills the slot only on the first button press — the scan catches it the frame it appears, and catches a
  // re-plug after a disconnect); a slot that goes null / `connected === false` without an event is dropped the same
  // way. `getGamepads()` is guarded — it throws in a document whose permissions policy denies the Gamepad API.
  private onPad = (ev: GamepadEvent): void => { this.adopt(ev.gamepad); };
  private onPadOff = (ev: GamepadEvent): void => {
    if (this.padIndex !== null && ev.gamepad?.index !== undefined && ev.gamepad.index !== this.padIndex) return;   // another pad left
    this.dropPad();
    this.adoptPad();    // a second pad that is still in takes over at once
  };
  /** The profile for the pad currently held. Re-resolved on every adopt, because it is a different pad. */
  private profile: ControllerProfile | null = null;
  private adopt(pad: Gamepad): void {
    if (this.padIndex === pad.index) return;
    this.padIndex = pad.index; this.gamepadActive = true;
    this.lastL = null; this.lastR = null;
    this.profile = profileFor(pad);
    console.info(`[PAD] adopted slot ${pad.index}: ${pad.id || 'gamepad'} → profile "${this.profile.id}" (mapping ${pad.mapping || 'none'})`);
  }
  private dropPad(): void {
    if (this.padIndex === null) return;
    const idx = this.padIndex;
    this.padIndex = null; this.gamepadActive = false; this.profile = null;
    // a pad yanked mid-push must not leave its last stick / trigger / button latched in every mode
    if (this.lastL && (this.lastL.x !== 0 || this.lastL.y !== 0)) this.emit({ t: 'stick', side: 'L', x: 0, y: 0 });
    if (this.lastR && (this.lastR.x !== 0 || this.lastR.y !== 0)) this.emit({ t: 'stick', side: 'R', x: 0, y: 0 });
    this.lastL = null; this.lastR = null;
    for (const k of [...this.held]) {
      if (!k.startsWith('pad_')) continue;
      this.held.delete(k);
      if (k.startsWith('pad_dpad_')) this.emit({ t: 'dpad', dir: k.slice(9) as 'up' | 'down' | 'left' | 'right', pressed: false });
      else this.emit({ t: 'button', btn: k.slice(4) as 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1' | 'SELECT' | 'START', pressed: false });
    }
    console.info(`[PAD] dropped slot ${idx}`);
  }
  private readPads(): ReadonlyArray<Gamepad | null> {
    try { return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []; }
    catch { return []; }
  }
  /** Adopt the first live pad slot when none is held. Returns true when a pad is held afterwards. */
  private adoptPad(): boolean {
    if (this.padIndex !== null) return true;
    for (const p of this.readPads()) {
      if (p && p.connected !== false) { this.adopt(p); return true; }
    }
    return false;
  }
  // The pad's sticks are emitted ON CHANGE, like the keyboard's — a centred pad that emitted (0, 0) every frame
  // overwrote a held W / ArrowUp on every mode that keeps the last stick (all of them), so with a pad plugged in the
  // keyboard could never move the hero. Last writer wins between the two, exactly as before for two keyboards.
  private lastL: { x: number; y: number } | null = null;
  private lastR: { x: number; y: number } | null = null;
  private emitStick(side: 'L' | 'R', x: number, y: number): void {
    const last = side === 'L' ? this.lastL : this.lastR;
    if (last && last.x === x && last.y === y) return;
    if (side === 'L') this.lastL = { x, y }; else this.lastR = { x, y };
    this.emit({ t: 'stick', side, x, y });
  }

  private pollPads = (): void => {
    if (this.padIndex === null) this.adoptPad();
    if (this.padIndex !== null) {
      const pad = this.readPads()[this.padIndex];
      if (!pad || pad.connected === false) {
        this.dropPad();                              // the slot emptied without a disconnect event
      } else {
        // ONE read, through the profile: the indices, the axis order and the deadzone are all the pad's own.
        // A Switch Pro's bottom face button arrives here as A, the same as an Xbox pad's — before this it
        // arrived as B, on every Switch controller, with nothing in the tree able to notice.
        const profile = this.profile ?? profileFor(pad);
        const canon = applyRemap(readPad(pad, profile), readRemap(profile.id));
        this.emitStick('L', canon.lx, canon.ly);
        this.emitStick('R', canon.rx, canon.ry);
        this.emit({ t: 'trigger', side: 'L', value: canon.triggers.L });
        this.emit({ t: 'trigger', side: 'R', value: canon.triggers.R });
        // the keyboard arrows and the touch overlay's d-pad already emit these same events, so a real
        // controller's physical d-pad feeds the identical path
        for (const dir of ['up', 'down', 'left', 'right'] as const) {
          const pressed = canon.dpad[dir];
          const key = `pad_dpad_${dir}`;
          if (pressed && !this.held.has(key)) { this.held.add(key); this.emit({ t: 'dpad', dir, pressed: true }); }
          if (!pressed && this.held.has(key)) { this.held.delete(key); this.emit({ t: 'dpad', dir, pressed: false }); }
        }
        for (const btn of ['A', 'B', 'X', 'Y', 'L1', 'R1', 'SELECT', 'START'] as const) {
          const pressed = canon.buttons[btn];
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
