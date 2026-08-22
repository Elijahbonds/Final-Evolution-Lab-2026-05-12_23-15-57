// gameFeel — the "juice" toolkit that makes modes feel premium. These are the
// standard techniques every best-selling action game uses; modes get them
// through this ONE module so the feel is consistent everywhere:
//   · InputBuffer: a press within 140ms of becoming valid still counts —
//     button presses never feel "eaten"
//   · coyote time: an action stays legal 110ms after leaving the ground —
//     jumps/tricks never feel unfairly missed
//   · hit-stop: 40–80ms freeze on impact — hits feel heavy
//   · screen shake: small, short, decaying — never nauseating
//   · haptics: one call, silently no-ops where unsupported

import type { Scene, TargetCamera } from '@babylonjs/core';
import { Vector3 } from '@babylonjs/core';
import { SoundKit } from '../audio/SoundKit';   // M43: impact() now plays a synthesized hit

// ── Input buffer ───────────────────────────────────────────────────────────
export class InputBuffer {
  private stamps = new Map<string, number>();
  constructor(private windowMs = 140) {}
  press(key: string): void { this.stamps.set(key, performance.now()); }
  /** true once if `key` was pressed within the window; consumes the press */
  consume(key: string): boolean {
    const t = this.stamps.get(key);
    if (t !== undefined && performance.now() - t <= this.windowMs) {
      this.stamps.delete(key);
      return true;
    }
    return false;
  }
  clear(): void { this.stamps.clear(); }
}

// ── Coyote time ────────────────────────────────────────────────────────────
export class Coyote {
  private lastTrue = -Infinity;
  constructor(private graceMs = 110) {}
  update(condition: boolean): void { if (condition) this.lastTrue = performance.now(); }
  get ok(): boolean { return performance.now() - this.lastTrue <= this.graceMs; }
}

// ── Hit-stop ───────────────────────────────────────────────────────────────
let stopUntil = 0;
/** Freeze gameplay time for `ms` (impact weight). Modes multiply dt by
 *  `timeScale()` — during hit-stop it returns 0, then eases back to 1. */
export function hitStop(ms: number): void {
  stopUntil = Math.max(stopUntil, performance.now() + Math.min(ms, 120));
}
export function timeScale(): number {
  const now = performance.now();
  if (now >= stopUntil) return 1;
  const remain = stopUntil - now;
  return remain > 30 ? 0 : 1 - remain / 30;              // 30ms ease-out
}

// ── Screen shake ───────────────────────────────────────────────────────────
export class Shaker {
  private amp = 0;
  private obs: ReturnType<Scene['onBeforeRenderObservable']['add']> | null = null;
  constructor(private scene: Scene, private camera: TargetCamera) {
    this.obs = scene.onBeforeRenderObservable.add(() => {
      if (this.amp < 0.001) return;
      this.camera.position.addInPlace(new Vector3(
        (Math.random() - 0.5) * this.amp,
        (Math.random() - 0.5) * this.amp * 0.6,
        (Math.random() - 0.5) * this.amp,
      ));
      this.amp *= 0.86;                                  // fast decay — no nausea
    });
  }
  /** strength 0..1 → small worldspace amplitude (capped) */
  kick(strength: number): void { this.amp = Math.min(0.22, Math.max(this.amp, strength * 0.22)); }
  dispose(): void { if (this.obs) this.scene.onBeforeRenderObservable.remove(this.obs); }
}

// ── Haptics ────────────────────────────────────────────────────────────────
export function haptic(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported — fine */ }
}

// ── Impact bundle (the common case: hit lands) ─────────────────────────────
export function impact(shaker: Shaker | null, strength: number): void {
  hitStop(30 + strength * 50);
  shaker?.kick(strength);
  haptic(Math.round(8 + strength * 22));
  // M43: every hit-stop+shake moment now gets audio for free — no per-mode wiring.
  SoundKit.play('impact', { volume: 0.5 + strength * 0.6, pitch: 0.9 + strength * 0.3 });
}

// WIRING (ModeHarness): create ONE Shaker per scene, expose on ctx
// (`ctx.feel = { shaker, buffer: new InputBuffer(), impact }`), and multiply
// the dt passed to mode.update() by timeScale() — hit-stop then works in
// every mode with zero per-mode code. Buffered presses: harness calls
// buffer.press(btn) for every button-down alongside mode.onInput.
