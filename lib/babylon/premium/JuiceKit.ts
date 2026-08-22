// JuiceKit — the premium-feel layer (M16 A2, built once, wired everywhere).
// Hit-stop, camera shake, world-space score pops, screen flash, slow-mo beats.
// Babylon for camera/time effects + a DOM overlay for pops/flash (cheap, crisp).

import { Vector3 } from '@babylonjs/core';
import type { Scene, TargetCamera } from '@babylonjs/core';
import { vibrate } from './Haptics';

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

  /** 0.3–0.5× for 300–500ms — SIGNATURE moments only. */
  slowMo(scale = 0.4, ms = 400): void {
    this.scene.animationTimeScale = scale;
    setTimeout(() => { this.scene.animationTimeScale = this.baseTimeScale; }, Math.min(ms, 500));
  }

  /** Full-screen flash tinted to the moment (make = white-gold, KO = crimson). */
  flash(color = '#fff6dd', ms = 140): void {
    const f = document.createElement('div');
    f.style.cssText =
      `position:absolute;inset:0;background:${color};opacity:0.85;` +
      `transition:opacity ${ms}ms ease-out;`;
    this.overlay.appendChild(f);
    requestAnimationFrame(() => { f.style.opacity = '0'; });
    setTimeout(() => f.remove(), ms + 60);
  }

  /** Score/PRQ pop AT the action point in world space ("+3", "+12 PRQ"). */
  scorePop(worldPos: Vector3, text: string, accent = '#ffd75e'): void {
    const engine = this.scene.getEngine();
    const p = Vector3.Project(
      worldPos, this.camera.getViewMatrix(),
      this.scene.getTransformMatrix() as never,
      this.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()) as never,
    );
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText =
      `position:absolute;left:${p.x}px;top:${p.y}px;transform:translate(-50%,-50%);` +
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
