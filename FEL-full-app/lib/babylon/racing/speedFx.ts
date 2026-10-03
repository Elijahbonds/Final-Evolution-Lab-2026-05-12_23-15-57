// SPEED FX — 10-phase pass, phase 8 (2026-10-03): speed you can see — streaks, dust, wingtip trails —
// at a phone's budget.
//
// What was measured quiet: at full chat the kart and the plane showed speed only in the fov curve and the
// boost trail (BoostFx burns only while the tank does). Top speed WITHOUT boost had no look at all; a
// drift's dust was a 25%-a-frame dice roll of one-shot bursts (a whole ParticleSystem allocated per puff);
// and the aero hard turn left no mark in the air.
//
// One module, both modes — the two vehicles share a look, argued in one table:
//   SpeedLines    — streaks past ~80% of top speed. The BoostFx stretched-billboard pattern (one system
//                   riding the camera, spawning ahead of the lens), driven by SPEED FRACTION instead of
//                   boost k, so a fast clean run reads even with the tank empty.
//   DustEmitter   — the kart's rear-wheel dust as ONE continuous emitter whose rate follows the drive
//                   state, replacing the random one-shot bursts.
//   WingtipTrails — two TrailMesh ribbons off the plane's wingtips (the BoostFx trail pattern), awake in a
//                   hard bank or near top speed.

import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, PBRMaterial, TrailMesh, Vector3 } from '@babylonjs/core';
import type { Camera, Scene, TransformNode } from '@babylonjs/core';

// ── the look table ──────────────────────────────────────────────────────────────────────────────────────

/** The fraction of top speed where the streaks start to fade in. */
export const SPEED_LINE_ON = 0.8;
/** Streaks a second at full chat. BoostFx runs 420 on a burn; this is the quieter always-on read. */
export const SPEED_LINE_RATE = 240;

/** How far into the top fifth of the speed range the streaks are, 0..1. */
export function speedLineK(speedFrac: number): number {
  if (speedFrac < SPEED_LINE_ON) return 0;
  return Math.min(1, (speedFrac - SPEED_LINE_ON) / (1 - SPEED_LINE_ON));
}

/** What throws dust, and how hard — one continuous emitter changes rate instead of dice-rolling bursts. */
export type DustState = 'off' | 'drift' | 'offRoad';
export const DUST_RATE: Record<DustState, number> = {
  off: 0,
  drift: 26,      // a slide scrubs the rears: a steady stream, not a cloud
  offRoad: 38,    // grass and dirt kick up harder than a slide on tarmac
};
export function dustRateFor(state: DustState): number { return DUST_RATE[state]; }

/** The wingtip gates: normal bank tops out at maxBank 0.85 (ArcadeFlight), so a HARD turn is past ~65% of it. */
export const WINGTIP = { rollOn: 0.55, speedOn: 0.85, width: 0.12, length: 22, alpha: 0.45 } as const;

/** How awake the wingtip ribbons are, 0..1 — the harder of the bank and the speed. */
export function wingtipK(roll: number, speedFrac: number): number {
  const rk = Math.max(0, (Math.abs(roll) - WINGTIP.rollOn) / (1.2 - WINGTIP.rollOn));
  const sk = Math.max(0, (speedFrac - WINGTIP.speedOn) / (1 - WINGTIP.speedOn));
  return Math.min(1, Math.max(rk, sk));
}

/** The streak texture: a vertical fade, 8×64, generated once per scene (same paint-once rule as EffectsKit). */
function streakTexture(scene: Scene) {
  const existing = scene.getTextureByName('fx_streak');
  if (existing) return existing;
  const tex = new DynamicTexture('fx_streak', { width: 8, height: 64 }, scene, false);
  const g = tex.getContext();
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 8, 64); tex.update(); tex.hasAlpha = true;
  return tex;
}

/** A soft 16×16 dot, once per scene (EffectsKit's dot is private to it; same recipe). Exported for the
 *  phase-9 exhaust puffs, which share the sprite. */
export function moteTexture(scene: Scene) {
  const existing = scene.getTextureByName('fx_mote');
  if (existing) return existing;
  const tex = new DynamicTexture('fx_mote', { width: 16, height: 16 }, scene, false);
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(8, 8, 1, 8, 8, 8);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 16); tex.update(); tex.hasAlpha = true;
  return tex;
}

// ── the three effects ───────────────────────────────────────────────────────────────────────────────────

/**
 * Speed streaks: one stretched-billboard system parented to the camera, spawning ahead of the lens and
 * flying past it (the BoostFx 'lines' pattern), driven by the speed fraction. Capacity 300 at ≤240/s and a
 * ≤0.3 s life — ~70 live particles at most, one draw call.
 */
export class SpeedLines {
  private ps: ParticleSystem | null = null;
  private emitter: Mesh | null = null;

  constructor(scene: Scene, camera: Camera, tint = '#ffffff') {
    try {
      this.emitter = MeshBuilder.CreateBox('speedLinesEmitter', { size: 0.01 }, scene);
      this.emitter.isVisible = false; this.emitter.isPickable = false;
      this.emitter.parent = camera;
      this.emitter.position.set(0, 0, 9);
      const ps = new ParticleSystem('speedLines', 300, scene);
      ps.particleTexture = streakTexture(scene);
      ps.emitter = this.emitter;
      ps.isLocal = true;
      ps.minEmitBox = new Vector3(-7, -4, 0); ps.maxEmitBox = new Vector3(7, 4, 6);
      ps.direction1 = new Vector3(0, 0, -1); ps.direction2 = new Vector3(0, 0, -1);
      ps.minEmitPower = 26; ps.maxEmitPower = 40;
      ps.minLifeTime = 0.18; ps.maxLifeTime = 0.3;
      ps.minSize = 0.04; ps.maxSize = 0.08;
      ps.minScaleY = 12; ps.maxScaleY = 22;
      ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
      const c = Color3.FromHexString(tint);
      ps.color1 = new Color4(1, 1, 1, 0.4); ps.color2 = new Color4(c.r, c.g, c.b, 0.3); ps.colorDead = new Color4(1, 1, 1, 0);
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.emitRate = 0;
      ps.start();
      this.ps = ps;
    } catch { this.ps = null; }
  }

  /** Call every frame with speed / top speed (past 1 is fine — a boost over top still reads full). */
  update(speedFrac: number): void {
    if (!this.ps) return;
    const k = speedLineK(speedFrac);
    this.ps.emitRate = Math.round(SPEED_LINE_RATE * k * k);
  }

  dispose(): void { this.ps?.dispose(); this.ps = null; this.emitter?.dispose(); this.emitter = null; }
}

/**
 * The kart's rear-wheel dust: ONE system on a node parented to the kart at the rear axle, its rate set by
 * the drive state each frame ('off' | 'drift' | 'offRoad'). Replaces the per-frame dice roll that allocated
 * a fresh ParticleSystem per puff.
 */
export class DustEmitter {
  private ps: ParticleSystem | null = null;
  private node: Mesh | null = null;

  constructor(scene: Scene, parent: TransformNode, name: string) {
    try {
      // an invisible seed mesh, not a bare TransformNode: a ParticleSystem emitter must be a mesh or a point
      this.node = MeshBuilder.CreateBox(`dustNode_${name}`, { size: 0.01 }, scene);
      this.node.isVisible = false; this.node.isPickable = false;
      this.node.parent = parent;
      this.node.position.set(0, 0.12, -0.8);   // the rear axle line (the kart's rears sit at z -0.74)
      const ps = new ParticleSystem(`dust_${name}`, 120, scene);
      ps.particleTexture = moteTexture(scene);
      ps.emitter = this.node;
      ps.minEmitBox = new Vector3(-0.55, 0, -0.1); ps.maxEmitBox = new Vector3(0.55, 0.1, 0.1);   // across both rear wheels
      ps.direction1 = new Vector3(-0.5, 0.7, -1); ps.direction2 = new Vector3(0.5, 1.2, -1.6);     // up and back off the wheels
      ps.minEmitPower = 0.6; ps.maxEmitPower = 1.4;
      ps.minLifeTime = 0.35; ps.maxLifeTime = 0.7;
      ps.minSize = 0.1; ps.maxSize = 0.24;
      const c1 = Color3.FromHexString('#c9c2b6'), c2 = Color3.FromHexString('#a89f90');   // the EffectsKit dust pair
      ps.color1 = new Color4(c1.r, c1.g, c1.b, 0.55); ps.color2 = new Color4(c2.r, c2.g, c2.b, 0.4); ps.colorDead = new Color4(c2.r, c2.g, c2.b, 0);
      ps.gravity = new Vector3(0, -1.5, 0);
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.emitRate = 0;
      ps.start();
      this.ps = ps;
    } catch { this.ps = null; }
  }

  /** Call every frame with the drive state; rate changes are free (no realloc). */
  update(state: DustState): void {
    if (this.ps) this.ps.emitRate = dustRateFor(state);
  }

  dispose(): void { this.ps?.dispose(); this.ps = null; this.node?.dispose(); this.node = null; }
}

/**
 * The plane's wingtip ribbons: one TrailMesh per wingtip anchor (the BoostFx trail pattern — unlit PBR,
 * alpha follows the gate), awake in a hard bank or near top speed. A trail that is always on reads as a
 * banner; gated, it reads as the air coming off the wing when the plane is working.
 */
export class WingtipTrails {
  private trails: TrailMesh[] = [];
  private mats: PBRMaterial[] = [];

  constructor(scene: Scene, anchors: readonly TransformNode[], tint = '#ffffff') {
    const c = Color3.FromHexString(tint);
    anchors.forEach((a, i) => {
      try {
        const t = new TrailMesh(`wingtip_${i}`, a, scene, { diameter: WINGTIP.width, length: WINGTIP.length, autoStart: true });
        const m = new PBRMaterial(`wingtipMat_${i}`, scene);
        m.unlit = true; m.albedoColor = c; m.emissiveColor = c; m.alpha = 0; m.backFaceCulling = false;
        m.disableDepthWrite = true;
        t.material = m; t.isPickable = false; t.isVisible = false;
        this.trails.push(t); this.mats.push(m);
      } catch { /* a failed trail is no trail, never a crash */ }
    });
  }

  /** Call every frame with the bank (rad, stunts run to ±2π — still fine) and speed / top speed. */
  update(roll: number, speedFrac: number): void {
    const k = wingtipK(roll, speedFrac);
    for (let i = 0; i < this.trails.length; i++) {
      this.trails[i].isVisible = k > 0.02;
      this.mats[i].alpha = WINGTIP.alpha * k;
    }
  }

  dispose(): void {
    for (const t of this.trails) t.dispose();
    for (const m of this.mats) m.dispose();
    this.trails = []; this.mats = [];
  }
}
