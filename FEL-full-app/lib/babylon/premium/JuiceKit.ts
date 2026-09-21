// JuiceKit — the premium-feel layer (M16 A2, built once, wired everywhere).
// Hit-stop, camera shake, world-space score pops, screen flash, slow-mo beats.
// Babylon for camera/time effects + a DOM overlay for pops/flash (cheap, crisp).

import { Matrix, Vector3 } from '@babylonjs/core';
import type { Scene, TargetCamera } from '@babylonjs/core';
import { vibrate } from './Haptics';
import { captions } from '../core/captions';

/** Alpha at the frame's edge, where light spills in. */
export const FLASH_EDGE = 0.46;
/** Alpha through the middle of the frame, where the thing being celebrated is. */
export const FLASH_CORE = 0.09;
/** The clear middle runs out to this fraction of the radius before the edge ramp starts. */
export const FLASH_CORE_STOP = 0.3;

/** '#rrggbb' (or '#rgb') → 'rgba(r,g,b,a)'. Anything else is passed through with the alpha dropped. */
export function rgba(hex: string, alpha: number): string {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return hex;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(alpha * 1000) / 1000})`;
}

/**
 * The flash as a vignette: clear through the middle, bright at the edge.
 *
 * `strength` scales both stops and is clamped — a caller passing 0 would allocate an invisible overlay and one passing
 * 10 would put the whiteout back.
 */
export function flashBackground(color: string, strength = 1): string {
  const k = Math.max(0.2, Math.min(2, strength));
  const core = Math.min(0.35, FLASH_CORE * k);
  const edge = Math.min(0.8, FLASH_EDGE * k);
  return `radial-gradient(ellipse at center, ${rgba(color, core)} 0%, ${rgba(color, core)} ${FLASH_CORE_STOP * 100}%, ${rgba(color, edge)} 100%)`;
}

export class JuiceKit {
  private overlay: HTMLDivElement;
  private shakeT = 0; private shakeAmp = 0; private shakeDir = 1;
  private baseTimeScale = 1;

  constructor(private scene: Scene, private camera: TargetCamera, mount: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText =
      'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:30;';
    mount.appendChild(this.overlay);
    scene.onBeforeRenderObservable.add(() => this.tick());
  }

  /** 40–90ms freeze on significant contact. Never on ordinary movement. */
  hitStop(ms = 70): void {
    const anim = this.scene.animationTimeScale ?? 1;
    this.scene.animationTimeScale = 0.001;
    vibrate([12, 20, 12]);
    setTimeout(() => { this.scene.animationTimeScale = anim; }, Math.min(ms, 90));
  }

  /** Directional, dampened shake. amp in world units (0.05–0.2). */
  shake(amp = 0.12, ms = 130): void {
    this.shakeAmp = amp;
    this.shakeT = ms / 1000;
  }

  private tintEl: HTMLDivElement | null = null;
  /** MATRIX FOCUS (2026-09-18): a held colour cast at the edges of the frame while bullet time is on — the green of the
   *  code, a vignette not a wash (the flash lesson: light spills from the edges). Pass null to lift it. */
  tint(color: string | null, edge = 0.7): void {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (!color) {
      if (this.tintEl) { const el = this.tintEl; this.tintEl = null; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }
      if (canvas) canvas.style.filter = '';
      return;
    }
    if (this.tintEl) return;
    const f = document.createElement('div');
    f.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity 220ms ease-out;` +
      `background:radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, ${color} 100%);`;
    this.overlay.appendChild(f); this.tintEl = f;
    // the code's green: the frame drains a little colour and gains contrast under the vignette (the canvas takes a filter — no shader pass)
    if (canvas) canvas.style.filter = 'saturate(0.62) contrast(1.08) sepia(0.12) hue-rotate(50deg)';
    requestAnimationFrame(() => { f.style.opacity = String(edge); });
  }

  /** 0.3–0.5× for 300–500ms — SIGNATURE moments only. */
  slowMo(scale = 0.4, ms = 400): void {
    this.scene.animationTimeScale = scale;
    setTimeout(() => { this.scene.animationTimeScale = this.baseTimeScale; }, Math.min(ms, 500));
  }

  /**
   * Full-screen flash tinted to the moment (make = white-gold, KO = crimson).
   *
   * THE FLASH USED TO HIDE THE THING IT CELEBRATED (dunk visuals pass, 2026-09-16). It painted the whole frame at
   * **opacity 0.85** and eased out over 120–260 ms, which means the first two or three frames after every make, every
   * KO and every checkpoint in this game were a near-solid sheet of cream. Caught on the dunk's flush frame: the ball
   * on the ring, the hand on the ball, the net — all of it behind a veil. Twenty-odd callers across ten modes had it.
   *
   * A flash is supposed to read as light spilling into the frame, and light spills from the EDGES. So it is a vignette
   * now: `FLASH_EDGE` at the border, `FLASH_CORE` through the middle where the action is, which keeps the punch and
   * lets you see what you just did. `strength` (default 1) is for the rare moment that really is bigger than a make.
   */
  flash(color = '#fff6dd', ms = 140, strength = 1): void {
    const f = document.createElement('div');
    f.style.cssText =
      `position:absolute;inset:0;background:${flashBackground(color, strength)};opacity:1;` +
      `transition:opacity ${ms}ms ease-out;`;
    this.overlay.appendChild(f);
    requestAnimationFrame(() => { f.style.opacity = '0'; });
    setTimeout(() => f.remove(), ms + 60);
  }

  /** Score/PRQ pop AT the action point in world space ("+3", "+12 PRQ"). */
  scorePop(worldPos: Vector3, text: string, accent = '#ffd75e'): void {
    const engine = this.scene.getEngine();
    const bufferW = engine.getRenderWidth(), bufferH = engine.getRenderHeight();
    // worldPos is already in world space, so `world` must be Identity here —
    // scene.getTransformMatrix() already IS view*projection. Passing the view
    // matrix again as `world` (as this did) double-applies it, since Project
    // multiplies world*transform internally: the pop landed at the wrong
    // screen position for every camera angle except dead-on down +Z.
    const p = Vector3.Project(
      worldPos, Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(bufferW, bufferH),
    );
    // Project() works in the WebGL drawing-buffer's pixel space (the "pixel
    // budget" downscale can make that far smaller than the canvas's CSS box —
    // e.g. 1834px buffer on an 800px-wide display). This overlay is a plain
    // DOM div sized to the CSS box, so p.x/p.y need rescaling into CSS
    // pixels or the pop lands off in a corner instead of at the action.
    const canvas = engine.getRenderingCanvas();
    const scaleX = canvas && bufferW ? canvas.clientWidth / bufferW : 1;
    const scaleY = canvas && bufferH ? canvas.clientHeight / bufferH : 1;
    const px = p.x * scaleX, py = p.y * scaleY;
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText =
      `position:absolute;left:${px}px;top:${py}px;transform:translate(-50%,-50%);` +
      `font:900 clamp(22px,4vw,34px) var(--fel-font-display,ui-monospace);color:${accent};` +
      `text-shadow:0 2px 12px rgba(0,0,0,.65),0 0 22px ${accent}55;` +
      `transition:transform .8s cubic-bezier(.16,.8,.3,1),opacity .8s ease-out;will-change:transform;`;
    this.overlay.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = 'translate(-50%,-150%) scale(1.25)';
      el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), 850);
  }

  /** Center banner for beats (FIRST DOWN!, WAVE CLEAR, LIFT CABLE GRIND!). */
  banner(text: string, accent = '#22d3ee', ms = 1100): void {
    // THE CAPTION BUS IS FED HERE, once, for every mode (2026-09-21). captions.cue() had ZERO call sites in this
    // tree and CaptionRegion rendered for nobody: the accessibility work was not missing, it was unplugged at
    // both ends. Cueing from the shared juice channel rather than from N modes means a mode cannot forget — the
    // same reason the QA trace wraps these methods instead of asking each mode to report itself.
    captions.cue(text, 'feedback');
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText =
      'position:absolute;left:50%;top:32%;transform:translate(-50%,-50%) scale(.7);' +
      `font:900 clamp(28px,6vw,52px) var(--fel-font-display,ui-monospace);color:${accent};` +
      `letter-spacing:.06em;text-shadow:0 4px 24px rgba(0,0,0,.7),0 0 34px ${accent}66;` +
      'transition:transform .18s cubic-bezier(.2,1.4,.4,1),opacity .25s ease-out;opacity:0;';
    this.overlay.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translate(-50%,-50%) scale(1)'; });
    setTimeout(() => { el.style.opacity = '0'; }, ms);
    setTimeout(() => el.remove(), ms + 300);
  }

  /** A small, quick line under the action — the answer to a press that cannot act ("WAIT FOR THE QUESTION", "NO BALL").
   *  Deliberately quieter than banner(): a refusal informs, it does not celebrate. One at a time. */
  private calloutEl: HTMLDivElement | null = null;
  callout(text: string, color = '#cbd5e1', ms = 700): void {
    // A callout is the answer to a press that could not act ("NO BALL", "WAIT FOR THE QUESTION"). A player who
    // cannot see it has to guess why nothing happened, so it is announced like the banner is.
    captions.cue(text, 'feedback');
    this.calloutEl?.remove();
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText =
      'position:absolute;left:50%;top:68%;transform:translate(-50%,-50%);padding:4px 12px;border-radius:999px;' +
      `background:rgba(5,6,10,.62);font:800 clamp(12px,1.8vw,16px) var(--fel-font-display,ui-monospace);color:${color};` +
      'letter-spacing:.12em;opacity:0;transition:opacity .12s ease-out;pointer-events:none;';
    this.overlay.appendChild(el);
    this.calloutEl = el;
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; }, ms);
    setTimeout(() => { el.remove(); if (this.calloutEl === el) this.calloutEl = null; }, ms + 200);
  }

  /** Composite signature moment: slam/KO/hole-in-one. One call in mode code. */
  impact(worldPos: Vector3, points: string, opts?: { color?: string; slow?: boolean }): void {
    this.hitStop(80);
    this.shake(0.14, 150);
    this.flash(opts?.color ?? '#fff6dd');
    this.scorePop(worldPos, points, opts?.color ?? '#ffd75e');
    if (opts?.slow) this.slowMo(0.4, 400);
    vibrate([10, 30, 10]);
  }

  private tick(): void {
    if (this.shakeT <= 0) return;
    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    this.shakeT -= dt;
    const falloff = Math.max(0, this.shakeT * 8);
    this.shakeDir *= -1;
    this.camera.position.addInPlace(new Vector3(
      this.shakeDir * this.shakeAmp * falloff * 0.5,
      this.shakeAmp * falloff * 0.3 * (Math.random() - 0.5),
      0,
    ));
  }

  dispose(): void { this.overlay.remove(); }
}

// WIRING (one line per moment):
//   DunkMode make:      juice.impact(rimPos, `+${pts}`, { slow: true });
//   Karate KO:          juice.impact(enemyPos, 'KO!', { color: '#ff4d4d' });
//   Football evade:     juice.scorePop(runnerPos, 'EVADED!'); juice.shake(0.06, 90);
//   Football TD:        juice.impact(runnerPos, 'TOUCHDOWN!', { slow: true });
//   Board lift grind:   juice.banner('LIFT CABLE GRIND! +500', '#7ce4ff');
//   Coin pickup:        juice.scorePop(coinPos, '+1◆', '#f5b91a');   // no hitStop
