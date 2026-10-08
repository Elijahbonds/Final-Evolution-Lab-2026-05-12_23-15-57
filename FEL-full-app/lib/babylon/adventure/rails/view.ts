/**
 * The rail view binders (lane A1; Babylon): the rails themselves, and the sparks under a grinding body.
 *
 * RAILS. One tube per segment along its baked path (railMath: a smooth rail draws as its spline), all MERGED into one
 * mesh with one frozen material: a whole network is one draw call, whatever its rail count (the phone budget is 450
 * draws for everything). Built once when A4 builds a world; nothing per frame.
 *
 * SPARKS. racing/speedFx.SparkEmitter (one pooled system, its rate set by tier; the kart's mini-turbo emitter) on a
 * node at the body's feet. The tier comes from movement/look.sparkTierFor: hotter with speed and when leaning against
 * the curve. Rate 0 off the rail, so it costs nothing there.
 */

import { Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { SparkEmitter } from '@/lib/babylon/racing/speedFx';
import type { AdventureActor, RailNetwork } from '../contracts';
import type { MovementTelemetry } from '../movement/index';
import { sparkTierFor } from '../movement/look';
import { buildRailPath } from './railMath';

export interface RailMeshOpts { diameter?: number; color?: string; tessellation?: number }

/** The rails as one merged, frozen mesh (null for an empty network). Dispose it with the world. */
export function buildRailMeshes(scene: Scene, net: RailNetwork, o: RailMeshOpts = {}): Mesh | null {
  const radius = (o.diameter ?? 0.09) / 2;
  const tubes: Mesh[] = [];
  for (const seg of net.segments) {
    if (seg.points.length < 2) continue;
    const p = buildRailPath(seg);
    const path: Vector3[] = [];
    for (let i = 0; i < p.xs.length; i++) path.push(new Vector3(p.xs[i], p.ys[i], p.zs[i]));
    tubes.push(MeshBuilder.CreateTube(`rail_${seg.id}`, { path, radius, tessellation: o.tessellation ?? 8, cap: Mesh.CAP_ALL }, scene));
  }
  if (tubes.length === 0) return null;
  const merged = tubes.length === 1 ? tubes[0] : Mesh.MergeMeshes(tubes, true, true);
  if (!merged) return null;
  merged.name = `rails_${net.id}`;
  const mat = new StandardMaterial(`railMat_${net.id}`, scene);
  mat.diffuseColor = Color3.FromHexString(o.color ?? '#d8dce2');
  mat.specularColor = new Color3(0.6, 0.6, 0.65);
  merged.material = mat;
  merged.isPickable = false;
  merged.freezeWorldMatrix();
  mat.freeze();
  return merged;
}

/** Spark colours per tier (index 1..3): warm to white-hot. [TUNE] */
export const SPARK_COLORS: readonly string[] = ['#ffffff', '#ffb347', '#ffd75e', '#fff3c4'];

export class GrindSparksView {
  private emitter: SparkEmitter | null = null;
  private anchor: TransformNode | null = null;

  /** `feet` is a node at the body's feet (A4's body root). */
  constructor(scene: Scene, feet: TransformNode, name: string) {
    try {
      // SparkEmitter seats its node 0.8 m behind its parent (a kart's rear axle): an anchor 0.8 m forward puts it at the feet.
      this.anchor = new TransformNode(`grindSparkAnchor_${name}`, scene);
      this.anchor.parent = feet;
      this.anchor.position.set(0, 0, 0.8);
      this.emitter = new SparkEmitter(scene, this.anchor, `grind_${name}`, SPARK_COLORS);
    } catch { this.emitter = null; }
  }

  sync(actor: Pick<AdventureActor, 'state'> | null | undefined, t: Readonly<MovementTelemetry> | null | undefined): void {
    if (!this.emitter) return;
    this.emitter.update(actor && t ? sparkTierFor(actor.state, t as MovementTelemetry) : 0);
  }

  dispose(): void { this.emitter?.dispose(); this.emitter = null; this.anchor?.dispose(); this.anchor = null; }
}
