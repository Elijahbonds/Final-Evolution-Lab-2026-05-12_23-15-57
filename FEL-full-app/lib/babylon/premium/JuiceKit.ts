// JuiceKit — the premium-feel layer (M16 A2, built once, wired everywhere).
// Hit-stop, camera shake, world-space score pops, screen flash, slow-mo beats.
// Babylon for camera/time effects + a DOM overlay for pops/flash (cheap, crisp).

import { Matrix, Vector3 } from '@babylonjs/core';
import type { Scene, TargetCamera } from '@babylonjs/core';
import { vibrate } from './Haptics';
import { captions } from '../core/captions';
import { motionPolicy, type JuicePolicy } from '../../a11y/reducedMotion';

/** How long the same callout stays "already said" for the caption bus. On screen it may repeat as often as it likes. */
const CALLOUT_REPEAT_MS = 4000;

/** Alpha at the frame's edge, where light spills in. */
export const FLASH_EDGE = 0.46;
/** Alpha through the middle of the frame, where the thing being celebrated is. */
export const FLASH_CORE = 0.09;
/** The clear middle runs out to this fraction of the radius before the edge ramp starts. */
export const FLASH_CORE_STOP = 0.3;

/** The scene's animation clock while a hit-stop holds: the bodies stand still. */
export const FREEZE_SCALE = 0.001;

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
  /**
   * THE ANIMATION CLOCK — hit-stops and slow-mos are COUNTED, not captured (HOTFIX 2026-09-24).
   *
   * Each effect used to read `scene.animationTimeScale` when it started and write that value back when it ended, so two
   * that overlapped handed each other's values back. A hit-stop that began inside another one captured the FROZEN 0.001;
   * if it ended last it put 0.001 back and every body stood like a statue until the next slowMo, which many modes never
   * call. Reduced motion made that the rule rather than the exception: it caps every hit-stop at 30 ms, so a pair started
   * in the same frame (the Hundred's wall kick and a connect) always ends in call order. A slow-mo called inside a freeze
   * (`impact(…, { slow: true })`) was cut off when the freeze ended, and a slow-mo inside a slow-mo was cut off when the
   * first one ended.
   *
   * Now the effects in force decide: any freeze → frozen; else the NEWEST slow-mo still running → its scale; none → the
   * ORIGINAL scale, the one in force before the first of them started (1, or a mode's own — the Hundred's Matrix latch).
   * If somebody else writes the clock while ours are in force (that latch starting or ending), their value becomes the
   * original, so a stale value of ours never overwrites it.
   */
  private freezes = 0;
  private slows: { scale: number }[] = [];
  private original = 1;
  /** What we last wrote to the clock; null = none of ours is in force and the clock is somebody else's. */
  private wrote: number | null = null;
  private disposed = false;

  /**
   * HOTFIX (2026-09-24): every effect below asks `motion()` at the moment it fires — none of them read
   * prefers-reduced-motion before. Reduced (the OS setting, or the app's override): no flash, no shake, pops fade in
   * place, hit-stop and slow-mo cut to a minimal cue. Presentation only: these move the scene's ANIMATION clock and
   * the camera, never the dt a mode is timed on. The default reads the live setting; a test can hand in its own.
   */
  constructor(private scene: Scene, private camera: TargetCamera, mount: HTMLElement,
    private motion: () => JuicePolicy = motionPolicy) {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText =
      'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:30;';
    mount.appendChild(this.overlay);
    scene.onBeforeRenderObservable.add(() => this.tick());
  }

  /** Point the scene's animation clock at whatever the effects in force say (see the fields above). */
  private applyClock(): void {
    if (this.disposed) return;   // a timer that outlived the kit never touches the clock again
    const now = this.scene.animationTimeScale ?? 1;
    if (this.wrote === null || now !== this.wrote) this.original = now;   // first effect, or somebody else wrote it since
    if (this.freezes === 0 && this.slows.length === 0) {
      if (this.wrote !== null) { this.scene.animationTimeScale = this.original; this.wrote = null; }
      return;
    }
    const v = this.freezes > 0 ? FREEZE_SCALE : this.slows[this.slows.length - 1].scale;
    this.scene.animationTimeScale = v;
    this.wrote = v;
  }

  /**
   * 40–90ms freeze on significant contact. Never on ordinary movement. Reduced motion: a ~2-frame beat (30 ms) — unless
   * `gameplay` says it is paired with an equal freeze of the mode's own clock (the dunk's contact punch), which keeps its
   * length so the bodies and the root unfreeze together. Overlapping freezes JOIN: the clock comes back when the last
   * one ends, to whatever is in force then.
   */
  hitStop(ms = 70, opts?: { gameplay?: boolean }): void {
    const hold = this.motion().hitStopMs(ms, opts?.gameplay === true);
    this.freezes++;
    this.applyClock();
    vibrate([12, 20, 12]);
    setTimeout(() => { this.freezes = Math.max(0, this.freezes - 1); this.applyClock(); }, hold);
  }

  /** Directional, dampened shake. amp in world units (0.05–0.2). Reduced motion: none — the camera holds still. */
  shake(amp = 0.12, ms = 130): void {
    if (!this.motion().shake) return;
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

  /**
   * 0.3–0.5× for 300–500ms — SIGNATURE moments only.
   *
   * Reduced motion cuts it to a dip (≤ 120 ms) — unless `gameplay` says the mode's own clock rides this slow-mo (the
   * dunk's hang: the slam window is counted in the scene's animation time; skate's spectacle beat: the mode slows its
   * own dt for the same span). Those keep their full length under every setting, so the window the player aims at never
   * moves; the screen around them is still spared the flash and the shake.
   *
   * A freeze in force wins over it (impact's hit-stop, then its slow-mo); two slow-mos: the newer one sets the speed and
   * the older one resumes if it is still running when the newer ends.
   */
  slowMo(scale = 0.4, ms = 400, opts?: { gameplay?: boolean }): void {
    const hold = this.motion().slowMoMs(ms, opts?.gameplay === true);
    const mine = { scale };   // a fresh object per call, so the timer removes THIS one and no other
    this.slows.push(mine);
    this.applyClock();
    setTimeout(() => {
      const i = this.slows.indexOf(mine);
      if (i >= 0) this.slows.splice(i, 1);
      this.applyClock();
    }, hold);
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
    if (!this.motion().flash) return;   // HOTFIX (2026-09-24): reduced motion — no screen flash at all, not a dimmer one
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
    const travel = this.motion().travel;   // reduced motion: the number fades where it landed instead of flying up
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText =
      `position:absolute;left:${px}px;top:${py}px;transform:translate(-50%,-50%);` +
      `font:900 clamp(22px,4vw,34px) var(--fel-font-display,ui-monospace);color:${accent};` +
      `text-shadow:0 2px 12px rgba(0,0,0,.65),0 0 22px ${accent}55;` +
      `transition:transform .8s cubic-bezier(.16,.8,.3,1),opacity .8s ease-out;will-change:transform;`;
    this.overlay.appendChild(el);
    requestAnimationFrame(() => {
      if (travel) el.style.transform = 'translate(-50%,-150%) scale(1.25)';
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
    const travel = this.motion().travel;   // reduced motion: the banner fades in at size, no pop-and-overshoot
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText =
      `position:absolute;left:50%;top:32%;transform:translate(-50%,-50%) scale(${travel ? '.7' : '1'});` +
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
  private lastCalloutText = '';
  private lastCalloutAt = -1e9;
  callout(text: string, color = '#cbd5e1', ms = 700): void {
    // A callout is the answer to a press that could not act ("NO BALL", "WAIT FOR THE QUESTION"). A player who
    // cannot see it has to guess why nothing happened, so it is announced like the banner is.
    //
    // ONCE, THOUGH. Heard in production while driving off a kart course: "BACK TO THE TRACK. BACK TO THE TRACK.
    // BACK TO THE TRACK." A callout that repeats on a cooldown is fine on screen — it is one element that
    // replaces itself — and unbearable in a screen reader, which reads the whole region again each time. The
    // same rule as a race bump: the first one is the event, the repeats are a buzz.
    const now = performance.now();
    if (this.lastCalloutText !== text || now - this.lastCalloutAt > CALLOUT_REPEAT_MS) {
      captions.cue(text, 'feedback');
      this.lastCalloutText = text; this.lastCalloutAt = now;
    }
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

  /** HOTFIX (2026-09-24): a kit torn down mid-freeze hands the clock back NOW, and its pending timers stay silent. */
  dispose(): void {
    this.freezes = 0; this.slows.length = 0;
    this.applyClock();
    this.disposed = true;
    this.overlay.remove();
  }
}

// WIRING (one line per moment):
//   DunkMode make:      juice.impact(rimPos, `+${pts}`, { slow: true });
//   Karate KO:          juice.impact(enemyPos, 'KO!', { color: '#ff4d4d' });
//   Football evade:     juice.scorePop(runnerPos, 'EVADED!'); juice.shake(0.06, 90);
//   Football TD:        juice.impact(runnerPos, 'TOUCHDOWN!', { slow: true });
//   Board lift grind:   juice.banner('LIFT CABLE GRIND! +500', '#7ce4ff');
//   Coin pickup:        juice.scorePop(coinPos, '+1◆', '#f5b91a');   // no hitStop
