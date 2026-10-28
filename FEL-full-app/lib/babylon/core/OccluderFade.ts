// OccluderFade — nothing stands between the camera and the hero (lane/gameplay-clean, 2026-10-28).
//
// Owner: "Gameplay needs to be really clean." The gameplay-clean audit (docs/GAMEPLAY-CLEAN-AUDIT.md) cast three rays from
// the camera to the hero — head, chest, hips — on every 4th frame of every mode, and found modes where a prop, a tree, a
// pole or a storefront sat on that line for a large share of play. Every chase camera has this problem, and the answer
// every console game gives is the same one: whatever blocks the view of the player goes see-through while it blocks it.
//
// HOW: while the mode is PLAYING, every OCCLUDER_CHECK_FRAMES frames, the same three rays (scene.multiPickWithRay) collect
// the meshes on the line of sight. Each one fades to OCCLUDER_FADE_ALPHA over OCCLUDER_FADE_SEC, and fades back once it
// has been off the line for OCCLUDER_HOLD_SEC (so a pole the camera sweeps past does not flicker). What is never faded:
//   - the hero's own meshes (and anything parented to it: the ball in hand, a board, a kart);
//   - any skinned mesh — a rival, a horde fighter, a teammate, their kit: a body in front of the hero is the game, not
//     scenery (the karate audit's rays met enemy bodies and their jerseys as well as the arena wall);
//   - anything smaller than OCCLUDER_MIN_RADIUS_M (a ball, a cone, a bottle: it cannot hide a body) or larger than
//     OCCLUDER_MAX_RADIUS_M (the ground, the sky, an arena shell: fading those would fade the world);
//   - the ground, floor, court, water, terrain and sky by name, a mesh that opts out (`metadata.felNoFade`), a mesh already
//     see-through, and a thin-instanced mesh (one fade would fade every copy). An instanced copy (a row of trees) is
//     hidden on its own instead, because an instance cannot have its own alpha.
// Off the playing phase (a replay, a pause, the end card) everything it touched is put back exactly as it was.
//
// Presentation only: nothing it does reaches a mode's rules, its physics or its clock. The numbers are feel knobs
// (lib/feel-panel/knobs.ts, group "Camera · occluders"); the owner tunes them on a playtest run.
//
// THE HOOPS MODES ARE NOT ON IT (OCCLUDER_FADE_OFF): dunk, 1v1 and 3v3 have their own 10-phase lanes; the finding is routed
// to them rather than changed under them.
import { Ray, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene, TransformNode } from '@babylonjs/core';
import { feel } from '../../feel-panel/feel';

/** TUNED (new, gameplay-clean): the faded occluder's alpha (mesh.visibility). Low enough to read the hero through. */
export const OCCLUDER_FADE_ALPHA = 0.25;
/** TUNED (new): seconds to fade out and back in. */
export const OCCLUDER_FADE_SEC = 0.18;
/** TUNED (new): seconds an occluder stays faded after it last blocked the view (no flicker as the camera sweeps). */
export const OCCLUDER_HOLD_SEC = 0.4;
/** Frames between line-of-sight checks (3 rays each). */
export const OCCLUDER_CHECK_FRAMES = 3;
/** A mesh whose bounding sphere is smaller than this cannot hide a body (m). */
export const OCCLUDER_MIN_RADIUS_M = 0.3;
/** A mesh whose bounding sphere is larger than this is the world, not a prop (m). */
export const OCCLUDER_MAX_RADIUS_M = 30;
/** Modes held by their own lanes: the finding is routed, not applied (docs/GAMEPLAY-CLEAN-AUDIT.md). */
export const OCCLUDER_FADE_OFF: ReadonlySet<string> = new Set(['dunk', 'onevone', 'threevthree']);
/** Never faded, by name: the floor the hero stands on and the sky behind it. */
const WORLD_NAME = /ground|floor|terrain|court(?!side)|water|ocean|sea\b|sky|backdrop|dome|horizon/i;

interface Faded { mesh: AbstractMesh; orig: number; origVisible: boolean; instance: boolean; lastSeen: number; level: number }

/** Pure: may this mesh be faded, given what we know of it. Exported for the test. */
export function fadeCandidate(m: {
  name: string; radius: number; visibility: number; enabled: boolean; visible: boolean; hero: boolean; optOut: boolean;
  thinInstances: number; materialAlpha: number; skinned?: boolean;
}): boolean {
  if (!m.enabled || !m.visible || m.hero || m.optOut || m.skinned) return false;
  if (m.thinInstances > 1) return false;
  if (m.radius < OCCLUDER_MIN_RADIUS_M || m.radius > OCCLUDER_MAX_RADIUS_M) return false;
  if (m.visibility < 0.5 || m.materialAlpha < 0.5) return false;   // already see-through: leave it to its owner
  return !WORLD_NAME.test(m.name);
}

/** Pure: the next fade level (1 = solid, 0 = fully faded) moving toward `want` at 1/fadeSec per second. */
export function stepLevel(level: number, want: 0 | 1, dt: number, fadeSec: number): number {
  const rate = fadeSec > 0 ? dt / fadeSec : 1;
  return want === 0 ? Math.max(0, level - rate) : Math.min(1, level + rate);
}

export class OccluderFade {
  private faded = new Map<number, Faded>();
  private obs: Observer<Scene> | null = null;
  private frame = 0;
  private t = 0;
  private heroNode: TransformNode | null = null;
  private heroMeshes = new Set<AbstractMesh>();
  private aims: (TransformNode | null)[] = [];
  private readonly ray = new Ray(Vector3.Zero(), Vector3.Forward(), 1);

  constructor(private scene: Scene, private hero: () => TransformNode | null, private modeId: string) {}

  get active(): boolean { return this.obs !== null; }
  /** How many meshes it is fading (or hiding) right now: the probes read it. */
  get count(): number { return this.faded.size; }

  start(): void {
    if (this.obs || OCCLUDER_FADE_OFF.has(this.modeId)) return;
    this.obs = this.scene.onBeforeRenderObservable.add(() => this.tick());
  }

  /** Stop and put back everything it touched, exactly as it was. */
  stop(): void {
    if (this.obs) { this.scene.onBeforeRenderObservable.remove(this.obs); this.obs = null; }
    for (const f of this.faded.values()) this.restore(f);
    this.faded.clear();
  }

  dispose(): void { this.stop(); this.heroNode = null; this.heroMeshes.clear(); this.aims = []; }

  private restore(f: Faded): void {
    if (f.mesh.isDisposed()) return;
    if (f.instance) f.mesh.isVisible = f.origVisible;
    else f.mesh.visibility = f.orig;
  }

  private bindHero(h: TransformNode | null): void {
    this.heroNode = h; this.heroMeshes.clear(); this.aims = [];
    if (!h) return;
    for (const m of h.getChildMeshes(false)) this.heroMeshes.add(m);
    if ((h as AbstractMesh).getTotalVertices) this.heroMeshes.add(h as AbstractMesh);
    const nodes = h.getChildTransformNodes(false);
    const find = (re: RegExp) => nodes.find((n) => re.test(n.name)) ?? null;
    this.aims = [find(/(^|[:_])Head$/), find(/(^|[:_])Spine2$/), find(/(^|[:_])Hips$/)];
  }

  private tick(): void {
    const dt = Math.min(0.1, this.scene.getEngine().getDeltaTime() / 1000);
    this.t += dt;
    const fadeSec = feel('camera.occluderFadeSec', OCCLUDER_FADE_SEC);
    const alpha = feel('camera.occluderFadeAlpha', OCCLUDER_FADE_ALPHA);
    const holdSec = feel('camera.occluderHoldSec', OCCLUDER_HOLD_SEC);
    if (this.frame++ % OCCLUDER_CHECK_FRAMES === 0) this.check();
    for (const [id, f] of this.faded) {
      if (f.mesh.isDisposed()) { this.faded.delete(id); continue; }
      const want: 0 | 1 = this.t - f.lastSeen < holdSec ? 0 : 1;
      f.level = stepLevel(f.level, want, dt, fadeSec);
      if (f.instance) f.mesh.isVisible = f.level >= 0.5 ? f.origVisible : false;
      else f.mesh.visibility = f.orig * (alpha + (1 - alpha) * f.level);
      if (want === 1 && f.level >= 1) { this.restore(f); this.faded.delete(id); }
    }
  }

  private check(): void {
    const cam = this.scene.activeCamera;
    const h = this.hero();
    if (h !== this.heroNode) this.bindHero(h);
    if (!cam || !h) return;
    const eye = cam.globalPosition;
    const root = h.getAbsolutePosition();
    const pts = this.aims.some(Boolean)
      ? this.aims.map((n) => (n ? n.getAbsolutePosition() : null))
      : [root.add(new Vector3(0, 1.6, 0)), root.add(new Vector3(0, 1.1, 0)), root.add(new Vector3(0, 0.9, 0))];
    for (const p of pts) {
      if (!p) continue;
      const d = p.subtract(eye); const len = d.length(); if (len < 0.5) continue;
      this.ray.origin.copyFrom(eye); this.ray.direction.copyFrom(d.scaleInPlace(1 / len)); this.ray.length = len - 0.3;
      const hits = this.scene.multiPickWithRay(this.ray, (m) => this.pickable(m)) ?? [];
      for (const hit of hits) {
        const m = hit.pickedMesh; if (!m) continue;
        const f = this.faded.get(m.uniqueId);
        if (f) { f.lastSeen = this.t; continue; }
        const instance = m.getClassName() === 'InstancedMesh';
        this.faded.set(m.uniqueId, { mesh: m, orig: m.visibility, origVisible: m.isVisible, instance, lastSeen: this.t, level: 1 });
      }
    }
  }

  private pickable(m: AbstractMesh): boolean {
    if (this.faded.has(m.uniqueId)) return true;   // still on the line: keep it faded
    const mat = m.material as { alpha?: number } | null;
    return fadeCandidate({
      name: m.name, radius: m.getBoundingInfo().boundingSphere.radiusWorld, visibility: m.visibility,
      enabled: m.isEnabled(), visible: m.isVisible, hero: this.heroMeshes.has(m) || (this.heroNode ? m.isDescendantOf(this.heroNode) : false),
      optOut: Boolean((m.metadata as { felNoFade?: boolean } | null)?.felNoFade),
      thinInstances: (m as { thinInstanceCount?: number }).thinInstanceCount ?? 0,
      materialAlpha: mat?.alpha ?? 1,
      skinned: Boolean(m.skeleton),
    }) && m.getTotalVertices() > 0;
  }
}
