/**
 * The combat VIEW binder (plan A2: "hit flashes and hit-stop through the harness's juice, pooled spell VFX within the
 * particle budget, the lock reticle, camera hints lock and boss"). The only file in combat/ that touches Babylon; A4
 * mounts it once and calls `sync()` once per rendered frame. It reads the sim, it never writes it.
 *
 *   LOCK RETICLE   one thin ring on the local player's hard lock (a weak point gets the warm colour).
 *   TELLS          a ground ring under each monster winding up, filling as the wind-up runs: the read, drawn. A pool
 *                  of TELL_POOL rings (the story's body budget is ten enemies plus a boss).
 *   PROJECTILES    a pool of small spheres mirroring the combat system's projectile pool, one draw call each at most.
 *   HITS           a pooled spark burst at the struck body (EffectsKit's pool, tinted by element), the harness's
 *                  hit-stop on the local player's heavy connects and on a parry, a shake when the local player is hit.
 *
 * Budget: EffectsKit keeps at most 4 pooled systems per burst kind (sparks ≤ 40, dust ≤ 52 particles each), so hits
 * add at most ~370 particles on top of the spell view's; the plan's phone ceiling is 900. Camera hints come from the
 * sim (combat/index.ts), not from here.
 */

import { Color3, MeshBuilder, StandardMaterial, Vector3, type AbstractMesh, type Mesh, type Scene } from '@babylonjs/core';
import { EffectsKit, type BurstKind } from '@/lib/babylon/visual/EffectsKit';
import type { ActorId, AdventureActor, AdventureBus, Element } from '../contracts';
import type { CombatSystem } from './index';
import { lockPoint } from './lock';

/** The harness's juice, as much of it as the view uses (JuiceKit satisfies it). */
export interface CombatJuice {
  hitStop(ms?: number): void;
  shake(amp?: number, ms?: number): void;
}

export interface CombatViewOptions {
  scene: Scene;
  bus: AdventureBus;
  combat: CombatSystem;
  actors: ReadonlyMap<ActorId, AdventureActor>;
  localPlayerId: ActorId;
  juice?: CombatJuice | null;
  /** The burst effect (default EffectsKit.burst, pooled). Injectable for a headless test. */
  burst?: (scene: Scene, at: Vector3, kind: BurstKind, scale: number, tint?: string) => void;
}

export interface CombatView { sync(): void; dispose(): void }

/** Generic element tints (no franchise palette). */
export const ELEMENT_TINT: Readonly<Record<Element, string>> = {
  fire: '#ff7a3d', water: '#3da5ff', earth: '#b98a4e', wind: '#9ef0c8', lightning: '#ffe45e', ice: '#bdf3ff',
  light: '#fff6d6', shadow: '#8b5cf6',
};

export const TELL_POOL = 12;
export const SHOT_POOL = 48;

export function bindCombatView(o: CombatViewOptions): CombatView {
  const { scene, combat, actors } = o;
  const burst = o.burst ?? ((s, at, kind, scale, tint) => EffectsKit.burst(s, at, kind, scale, tint));
  const owned: { dispose(): void }[] = [];
  const mat = (name: string, hex: string, alpha = 1): StandardMaterial => {
    const m = new StandardMaterial(name, scene);
    m.emissiveColor = Color3.FromHexString(hex);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
    m.alpha = alpha;
    owned.push(m);
    return m;
  };

  // ── the reticle ──
  const reticle = MeshBuilder.CreateTorus('adv_lock_reticle', { diameter: 0.9, thickness: 0.05, tessellation: 24 }, scene);
  reticle.isPickable = false;
  reticle.billboardMode = 7;   // Mesh.BILLBOARDMODE_ALL
  reticle.rotation.x = Math.PI / 2;
  const reticleBody = mat('adv_lock_body', '#e6fbff');
  const reticlePart = mat('adv_lock_part', '#ffb347');
  reticle.material = reticleBody;
  reticle.setEnabled(false);
  owned.push(reticle);

  // ── tells ──
  const tellMat = mat('adv_tell', '#ff3b3b', 0.45);
  const tells: Mesh[] = [];
  for (let k = 0; k < TELL_POOL; k++) {
    const d = MeshBuilder.CreateDisc(`adv_tell_${k}`, { radius: 1, tessellation: 32 }, scene);
    d.rotation.x = Math.PI / 2;
    d.isPickable = false;
    d.material = tellMat;
    d.setEnabled(false);
    tells.push(d);
    owned.push(d);
  }

  // ── projectiles ──
  const shotMat = mat('adv_shot', '#ffe45e');
  const shots: AbstractMesh[] = [];
  const proto = MeshBuilder.CreateSphere('adv_shot_proto', { diameter: 0.4, segments: 6 }, scene);
  proto.material = shotMat;
  proto.isPickable = false;
  proto.setEnabled(false);
  owned.push(proto);
  for (let k = 0; k < Math.min(SHOT_POOL, combat.projectiles.shots.length); k++) {
    const s = proto.createInstance(`adv_shot_${k}`);
    s.isPickable = false;
    s.setEnabled(false);
    shots.push(s);
    owned.push(s);
  }

  // ── hits ──
  const at = new Vector3();
  const offs: (() => void)[] = [];
  offs.push(o.bus.on('damage', (e) => {
    const t = actors.get(e.targetId);
    if (!t) return;
    at.set(t.pos.x, t.pos.y + t.height * 0.6, t.pos.z);
    const mine = e.sourceId === o.localPlayerId, onMe = e.targetId === o.localPlayerId;
    switch (e.outcome) {
      case 'hit':
        burst(scene, at, 'sparks', e.finisher ? 1.6 : 1, e.element ? ELEMENT_TINT[e.element] : undefined);
        if (mine && (e.finisher || e.launch || e.amount >= 20)) o.juice?.hitStop(e.finisher ? 90 : 60);
        if (onMe) o.juice?.shake(e.amount >= 20 ? 0.14 : 0.08, 140);
        break;
      case 'parried':
        burst(scene, at, 'sparks', 1.8, '#ffffff');
        if (mine || onMe) o.juice?.hitStop(110);
        break;
      case 'guardBreak':
        burst(scene, at, 'dust', 1.4);
        if (onMe) o.juice?.shake(0.16, 180);
        break;
      case 'blocked':
        burst(scene, at, 'sparks', 0.6, '#cbd5e1');
        break;
      default:
        break;   // dodged / iframe: the whiff is the feedback
    }
  }));
  offs.push(o.bus.on('ko', (e) => {
    const t = actors.get(e.actorId);
    if (!t) return;
    at.set(t.pos.x, t.pos.y + 0.2, t.pos.z);
    burst(scene, at, 'dust', 1.5);
  }));

  const lp = { x: 0, y: 0, z: 0 };
  const worldLike = { actors } as Parameters<typeof lockPoint>[1];

  return {
    sync() {
      // Reticle on the local hard lock.
      const me = actors.get(o.localPlayerId);
      const lock = me?.lock && me.lock.hard ? me.lock : null;
      const p = lock ? lockPoint(lock, worldLike, combat.partsOf, lp) : null;
      reticle.setEnabled(!!p);
      if (p) {
        reticle.position.set(p.x, p.y, p.z);
        reticle.material = lock!.part ? reticlePart : reticleBody;
      }
      // Tells under monsters winding up.
      let k = 0;
      for (const a of actors.values()) {
        if (k >= tells.length) break;
        if (a.kind !== 'monster' && a.kind !== 'boss') continue;
        const t = combat.telegraphOf(a.id);
        if (!t || t.phase !== 'windup') continue;
        const d = tells[k++];
        const r = Math.max(0.4, t.kind === 'nova' ? t.range : Math.min(t.range, 4)) * (0.35 + 0.65 * t.t01);
        d.position.set(a.pos.x + (t.kind === 'nova' ? 0 : t.lineX * r * 0.5), a.pos.y + 0.03, a.pos.z + (t.kind === 'nova' ? 0 : t.lineZ * r * 0.5));
        d.scaling.set(r, r, 1);
        d.setEnabled(true);
      }
      for (; k < tells.length; k++) tells[k].setEnabled(false);
      // Projectiles.
      const pool = combat.projectiles.shots;
      for (let j = 0; j < shots.length; j++) {
        const s = pool[j];
        const m = shots[j];
        m.setEnabled(s.active);
        if (s.active) m.position.set(s.x, s.y, s.z);
      }
    },
    dispose() {
      for (const off of offs) off();
      for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose();
    },
  };
}
