/**
 * The magic VIEW binder: the bolts in flight, a burst on every cast in the spell's element, a ring on a body held by
 * telekinesis, and the slow-time tint (the harness's juice). Babylon only here; A4 mounts it and calls `sync()` once
 * per rendered frame. It reads the sim, it never writes it.
 *
 * Budget: bolts are instances of one sphere (one draw call per element material, 9 at most); cast bursts use
 * EffectsKit's pool ('sparks' and 'glitch', ≤ 4 systems each), so spells add at most ~430 particles; the combat view
 * adds ~370: both under the plan's 900 on a phone.
 */

import { Color3, MeshBuilder, StandardMaterial, Vector3, type InstancedMesh, type Mesh, type Scene } from '@babylonjs/core';
import { EffectsKit, type BurstKind } from '@/lib/babylon/visual/EffectsKit';
import { ELEMENTS, type ActorId, type AdventureActor, type AdventureBus, type Element } from '../contracts';
import { ELEMENT_TINT } from '../combat/view';
import type { MagicSystem } from './index';

export interface MagicJuice { tint(color: string | null, edge?: number): void }

export interface MagicViewOptions {
  scene: Scene;
  bus: AdventureBus;
  magic: MagicSystem;
  actors: ReadonlyMap<ActorId, AdventureActor>;
  localPlayerId: ActorId;
  juice?: MagicJuice | null;
  burst?: (scene: Scene, at: Vector3, kind: BurstKind, scale: number, tint?: string) => void;
}

export interface MagicView { sync(): void; dispose(): void }

/** The slow-time tint: a cool edge, generic (no code-rain look). */
export const SLOW_TIME_TINT = '#7dd3fc';

export function bindMagicView(o: MagicViewOptions): MagicView {
  const { scene, magic, actors } = o;
  const burst = o.burst ?? ((s, at, kind, scale, tint) => EffectsKit.burst(s, at, kind, scale, tint));
  const owned: { dispose(): void }[] = [];

  // One prototype sphere per element (plus a neutral one); bolts are instances of their element's.
  const protos = new Map<Element | 'none', Mesh>();
  for (const e of [...ELEMENTS, 'none'] as const) {
    const m = new StandardMaterial(`adv_bolt_mat_${e}`, scene);
    m.emissiveColor = Color3.FromHexString(e === 'none' ? '#e6fbff' : ELEMENT_TINT[e]);
    m.diffuseColor = Color3.Black();
    m.disableLighting = true;
    const p = MeshBuilder.CreateSphere(`adv_bolt_${e}`, { diameter: 0.5, segments: 6 }, scene);
    p.material = m;
    p.isPickable = false;
    p.setEnabled(false);
    protos.set(e, p);
    owned.push(m, p);
  }
  const shots = magic.bolts.shots;
  const live: (InstancedMesh | null)[] = shots.map(() => null);
  const liveEl: (Element | 'none' | null)[] = shots.map(() => null);

  const ring = MeshBuilder.CreateTorus('adv_tk_ring', { diameter: 1.4, thickness: 0.06, tessellation: 24 }, scene);
  const ringMat = new StandardMaterial('adv_tk_ring_mat', scene);
  ringMat.emissiveColor = Color3.FromHexString('#c4b5fd');
  ringMat.disableLighting = true;
  ring.material = ringMat;
  ring.isPickable = false;
  ring.setEnabled(false);
  owned.push(ringMat, ring);

  const at = new Vector3();
  const offs: (() => void)[] = [];
  offs.push(o.bus.on('spell:cast', (e) => {
    const a = actors.get(e.actorId);
    if (!a) return;
    at.set(a.pos.x, a.pos.y + a.height * 0.6, a.pos.z);
    const spell = magic.spells.get(e.spellId);
    const big = spell?.shape === 'nova' || spell?.shape === 'cone';
    burst(scene, at, big ? 'glitch' : 'sparks', big ? 1.6 : 0.8, e.element ? ELEMENT_TINT[e.element] : '#c4b5fd');
  }));

  let tinted = false;

  return {
    sync() {
      for (let k = 0; k < shots.length; k++) {
        const s = shots[k];
        const el: Element | 'none' = s.active ? s.spec.element ?? 'none' : 'none';
        if (!s.active) { live[k]?.setEnabled(false); continue; }
        if (!live[k] || liveEl[k] !== el) {
          live[k]?.dispose();
          live[k] = protos.get(el)!.createInstance(`adv_bolt_i${k}`);
          live[k]!.isPickable = false;
          liveEl[k] = el;
        }
        live[k]!.setEnabled(true);
        live[k]!.position.set(s.x, s.y, s.z);
      }
      const held = magic.holdingOf(o.localPlayerId);
      const h = held ? actors.get(held) : undefined;
      ring.setEnabled(!!h);
      if (h) ring.position.set(h.pos.x, h.pos.y + h.height * 0.5, h.pos.z);
      const slow = magic.slowTimeActive(o.localPlayerId);
      if (slow !== tinted) { o.juice?.tint(slow ? SLOW_TIME_TINT : null); tinted = slow; }
    },
    dispose() {
      for (const off of offs) off();
      for (const m of live) m?.dispose();
      if (tinted) o.juice?.tint(null);
      for (let i = owned.length - 1; i >= 0; i--) owned[i].dispose();
    },
  };
}
