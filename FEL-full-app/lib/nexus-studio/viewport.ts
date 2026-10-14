// THE EDITOR VIEWPORT (docs/NEXUS-STUDIO.md §4.2): the stage (stage.ts: the mode's own look stack and venue path) plus
// what only an editor has — cameras to fly round it, a pick proxy per object, Babylon's GizmoManager (in @babylonjs/core,
// no new dependency), a grid, snapping, the intro and replay previews, and the budget sample.
//
// THE EDIT LOOP. A drag moves the object's proxy (the gizmo's handle) and ONE command is committed on release; the venue
// then re-realises through the runtime path, so the frame after the release is the frame the mode will draw. Every mesh
// the editor makes is `__studio_*`: LightRig never makes a `__` mesh a shadow caster, the glow and the mirror skip it, and
// the export never sees it.

import {
  Color3, GizmoManager, LinesMesh, Mesh, MeshBuilder, PointerEventTypes, StandardMaterial, TransformNode, Vector3,
  type AbstractEngine, type AbstractMesh, type Observer, type PointerInfo, type Scene,
} from '@babylonjs/core';
import { exportVenue, type StudioVenueExport } from './exportVenue';
import { mountStage, type Stage, type StageLayer } from './stage';
import { proxyBox } from './catalog';
import { snapTransform, yawOfQuaternion, DEFAULT_SNAP, type SnapSettings } from './snap';
import { textureMb, type BudgetSample } from './budget';
import { replayShot } from '../babylon/scene/broadcastShots';
import type { StudioObject, StudioTransform, StudioVenue, V3 } from './doc';
import type { QualityTier } from '../babylon/scene/QualityTier';

export type Tool = 'select' | 'move' | 'rotate' | 'scale';
export type CameraMode = 'orbit' | 'pan' | 'fly';

export interface ViewportCallbacks {
  onSelect(id: string | null): void;
  /** A gizmo drag ended: the object's new transform (snapped). */
  onTransform(id: string, t: StudioTransform): void;
  onStats?(s: BudgetSample): void;
  onPreviewEnd?(): void;
  onError?(message: string): void;
}

/** Which stage layers an export change touches (pure; viewport.diff.test.ts). Null = the whole stage (mood, spec, target). */
export function changedLayers(prev: StudioVenueExport | null, next: StudioVenueExport): Set<StageLayer> | null {
  if (!prev || prev.mood !== next.mood || prev.spec !== next.spec || prev.target !== next.target) return null;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const out = new Set<StageLayer>();
  if (!same([prev.look, prev.baseDressing, prev.kit], [next.look, next.baseDressing, next.kit])) out.add('venue');
  if (!same(prev.meshy, next.meshy)) out.add('meshy');
  if (!same(prev.fixtures, next.fixtures)) out.add('fixtures');
  if (!same(prev.decals, next.decals)) out.add('decals');
  if (!same(prev.crowd, next.crowd)) out.add('crowd');
  if (!same([prev.weather, !!prev.look.sky], [next.weather, !!next.look.sky])) out.add('weather');
  // the subject mark moves the previews' frame and the capture's centre: a cheap venue-free re-run of captureVenue
  if (!same(prev.subject, next.subject) || prev.glossyFloor !== next.glossyFloor) out.add('fixtures');
  return out;
}

const PICK = '__studio_pick_';
const GHOST: Color3 = Color3.FromHexString('#00e5ff');

interface Proxy { holder: TransformNode; box: Mesh; obj: StudioObject }

export class StudioViewport {
  private stage: Stage | null = null;
  private exp: StudioVenueExport | null = null;
  private venue: StudioVenue | null = null;
  private proxies = new Map<string, Proxy>();
  private selected: string | null = null;
  private gizmos: GizmoManager | null = null;
  private tool: Tool = 'move';
  private camMode: CameraMode = 'orbit';
  private snap: SnapSettings = DEFAULT_SNAP;
  private grid: LinesMesh | null = null;
  private gridOn = true;
  private proxyMat: StandardMaterial | null = null;
  private markMat: StandardMaterial | null = null;
  private observers: Array<{ remove(): void }> = [];
  private preview: Observer<Scene> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private tier: QualityTier | undefined;
  private building: Promise<void> | null = null;
  private disposed = false;
  private dragging = false;
  private lastDraws = 0;

  private venueTimer: ReturnType<typeof setTimeout> | null = null;
  private venueDebounceMs: number;

  constructor(private canvas: HTMLCanvasElement | null, private cb: ViewportCallbacks, private engineOverride?: AbstractEngine, opts: { venueDebounceMs?: number } = {}) {
    this.venueDebounceMs = opts.venueDebounceMs ?? (engineOverride ? 0 : 90);
  }

  get scene(): Scene | null { return this.stage?.scene ?? null; }
  get currentStage(): Stage | null { return this.stage; }
  get selection(): string | null { return this.selected; }

  /** Mount (or re-mount) the stage for a venue. `tier` forces the meter's Phone/Desktop switch. */
  async load(venue: StudioVenue, tier?: QualityTier): Promise<void> {
    this.tier = tier;
    const run = async () => {
      const exp = exportVenue(venue);
      const engine = this.stage?.engine ?? this.engineOverride;
      this.teardownScene();
      const stage = await mountStage({ canvas: this.canvas, engine, exp, tier });
      if (this.disposed) { stage.dispose(); return; }
      this.stage = stage; this.exp = exp; this.venue = venue;
      this.setupEditor(stage);
      this.syncProxies(venue);
      if (this.selected && !this.proxies.has(this.selected)) this.select(null);
      else this.select(this.selected);
      if (!this.engineOverride) {
        stage.engine.stopRenderLoop();
        stage.engine.runRenderLoop(() => { if (this.stage?.scene.activeCamera) this.stage.scene.render(); });
      }
    };
    this.building = (this.building ?? Promise.resolve()).then(run, run).catch((e) => { this.cb.onError?.(e instanceof Error ? e.message : String(e)); });
    return this.building;
  }

  /** A new document state: re-realise what changed (the whole stage for a mood, spec or target change). */
  async update(venue: StudioVenue): Promise<void> {
    if (!this.stage) return this.load(venue, this.tier);
    const exp = exportVenue(venue);
    const layers = changedLayers(this.exp, exp);
    if (layers === null) return this.load(venue, this.tier);
    this.venue = venue;
    if (layers.size) {
      // the venue layer is a whole mountVenue (sky, ground, surround, the dressing set): typing a number re-mounts it once
      // the typing pauses, not on every key; the other layers are cheap and follow at once
      const now = new Set(layers);
      if (now.has('venue') && this.venueDebounceMs > 0) {
        now.delete('venue');
        if (this.venueTimer) clearTimeout(this.venueTimer);
        this.venueTimer = setTimeout(() => { this.venueTimer = null; if (this.stage && this.exp) this.stage.realise(this.exp, ['venue']); }, this.venueDebounceMs);
      }
      if (now.size) this.stage.realise(exp, now);
    }
    this.exp = exp;
    this.syncProxies(venue);
    if (this.selected && !this.proxies.has(this.selected)) this.select(null);
    else if (this.selected) this.attachGizmo();
  }

  // ── editor furniture ──────────────────────────────────────────────────────────────────────────────────────────────

  private setupEditor(stage: Stage): void {
    const { scene } = stage;
    this.proxyMat = new StandardMaterial('__studio_proxy_m', scene);
    this.proxyMat.emissiveColor = GHOST; this.proxyMat.diffuseColor = Color3.Black(); this.proxyMat.disableLighting = true;
    this.proxyMat.alpha = 0.16; this.proxyMat.wireframe = false; this.proxyMat.backFaceCulling = false;
    this.markMat = new StandardMaterial('__studio_mark_m', scene);
    this.markMat.emissiveColor = Color3.FromHexString('#ffd700'); this.markMat.diffuseColor = Color3.Black(); this.markMat.disableLighting = true; this.markMat.alpha = 0.7;
    this.grid = buildGrid(scene); this.grid.setEnabled(this.gridOn);
    const gm = new GizmoManager(scene, 2);
    gm.usePointerToAttachGizmos = false;
    gm.clearGizmoOnEmptyPointerEvent = false;
    this.gizmos = gm;
    this.applyTool();
    this.applyCamera();
    const pointer = scene.onPointerObservable.add((pi) => this.onPointer(pi));
    this.observers.push({ remove: () => scene.onPointerObservable.remove(pointer) });
    // The engine's draw counter is per frame only when something starts each frame on it (SceneInstrumentation does, at
    // onBeforeAnimations; a mode's dev PerfMonitor reads it the same way). Without this it counts forever.
    const counter = (stage.engine as unknown as { _drawCalls?: { fetchNewFrame(): void; current: number } })._drawCalls;
    const startFrame = scene.onBeforeAnimationsObservable.add(() => counter?.fetchNewFrame());
    const endFrame = scene.onAfterRenderObservable.add(() => { this.lastDraws = counter?.current ?? 0; });
    this.observers.push({ remove: () => { scene.onBeforeAnimationsObservable.remove(startFrame); scene.onAfterRenderObservable.remove(endFrame); } });
    if (this.statsTimer) clearInterval(this.statsTimer);
    if (this.cb.onStats && typeof setInterval === 'function') this.statsTimer = setInterval(() => { const s = this.sample(); if (s) this.cb.onStats?.(s); }, 500);
  }

  private downAt: { x: number; y: number } | null = null;
  private onPointer(pi: PointerInfo): void {
    const scene = this.stage?.scene; if (!scene) return;
    if (pi.type === PointerEventTypes.POINTERDOWN) { this.downAt = { x: scene.pointerX, y: scene.pointerY }; return; }
    if (pi.type !== PointerEventTypes.POINTERUP || !this.downAt || this.dragging) return;
    const moved = Math.hypot(scene.pointerX - this.downAt.x, scene.pointerY - this.downAt.y);
    this.downAt = null;
    if (moved > 5 || (pi.event as PointerEvent).button !== 0) return;
    if (this.gizmos?.isHovered) return;
    const id = this.pickAt(scene.pointerX, scene.pointerY);
    this.select(id);
    this.cb.onSelect(id);
  }

  /** The object under a canvas point (its pick proxy), or null. */
  pickAt(x: number, y: number): string | null {
    const scene = this.stage?.scene; if (!scene) return null;
    const hit = scene.pick(x, y, (m) => m.name.startsWith(PICK) && m.isEnabled());
    const id = hit?.hit ? (hit.pickedMesh?.metadata as { studioId?: string } | null)?.studioId ?? null : null;
    return id;
  }

  /** Where a canvas point meets the ground (the venue's pickable surfaces, else the y = 0 plane): a drop target. */
  groundAt(x: number, y: number): V3 | null {
    const scene = this.stage?.scene; if (!scene || !scene.activeCamera) return null;
    const hit = scene.pick(x, y, (m) => m.isPickable && m.isEnabled() && !m.name.startsWith('__'));
    if (hit?.hit && hit.pickedPoint) return [hit.pickedPoint.x, Math.max(0, hit.pickedPoint.y), hit.pickedPoint.z];
    const ray = scene.createPickingRay(x, y, null, scene.activeCamera);
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const t = -ray.origin.y / ray.direction.y;
    if (t <= 0) return null;
    const p = ray.origin.add(ray.direction.scale(t));
    return [p.x, 0, p.z];
  }

  /** The point the orbit camera looks at, on the ground: where a click-to-add places a thing. */
  focusPoint(): V3 {
    const t = this.stage?.orbit.target ?? Vector3.Zero();
    return [t.x, 0, t.z];
  }

  // ── proxies ───────────────────────────────────────────────────────────────────────────────────────────────────────

  private syncProxies(venue: StudioVenue): void {
    const scene = this.stage?.scene; if (!scene) return;
    const live = new Set<string>();
    for (const o of venue.objects) {
      if (o.hidden) continue;
      live.add(o.id);
      let px = this.proxies.get(o.id);
      const box = proxyBox(o);
      const sizeKey = box.size.join(',');
      if (px && (px.box.metadata as { sizeKey?: string }).sizeKey !== sizeKey) { px.holder.dispose(); this.proxies.delete(o.id); px = undefined; }
      if (!px) {
        const holder = new TransformNode(`__studio_obj_${o.id}`, scene);
        const mesh = MeshBuilder.CreateBox(`${PICK}${o.id}`, { width: box.size[0], height: box.size[1], depth: box.size[2] }, scene);
        mesh.parent = holder; mesh.position.set(box.centre[0], box.centre[1], box.centre[2]);
        mesh.metadata = { studioId: o.id, sizeKey };
        mesh.isPickable = true; mesh.receiveShadows = false; mesh.material = o.type === 'cameraMark' ? this.markMat : this.proxyMat;
        mesh.renderingGroupId = 1;
        px = { holder, box: mesh, obj: o };
        this.proxies.set(o.id, px);
      }
      px.obj = o;
      if (!this.dragging || this.selected !== o.id) {
        px.holder.position.set(o.t.p[0], o.t.p[1], o.t.p[2]);
        px.holder.rotationQuaternion = null; px.holder.rotation.set(0, o.t.ry, 0);
        px.holder.scaling.setAll(o.type === 'crowdStand' ? 1 : o.t.s);
      }
      this.styleProxy(px);
    }
    for (const [id, px] of this.proxies) if (!live.has(id)) { px.holder.dispose(); this.proxies.delete(id); }
  }

  private styleProxy(px: Proxy): void {
    const sel = px.obj.id === this.selected;
    // the camera mark has no drawn body of its own: it always shows; everything else shows its box when selected
    px.box.isVisible = sel || px.obj.type === 'cameraMark';
    px.box.showBoundingBox = sel;
  }

  // ── selection and gizmos ──────────────────────────────────────────────────────────────────────────────────────────

  select(id: string | null): void {
    this.selected = id && this.proxies.has(id) ? id : null;
    for (const px of this.proxies.values()) this.styleProxy(px);
    this.attachGizmo();
  }

  private attachGizmo(): void {
    const gm = this.gizmos; if (!gm) return;
    const px = this.selected ? this.proxies.get(this.selected) : null;
    gm.attachToNode(px && !px.obj.locked && this.tool !== 'select' ? px.holder : null);
  }

  setTool(tool: Tool): void { this.tool = tool; this.applyTool(); this.attachGizmo(); }

  private applyTool(): void {
    const gm = this.gizmos; if (!gm) return;
    gm.positionGizmoEnabled = this.tool === 'move';
    gm.rotationGizmoEnabled = this.tool === 'rotate';
    gm.scaleGizmoEnabled = this.tool === 'scale';
    const g = gm.gizmos;
    if (g.rotationGizmo) { g.rotationGizmo.xGizmo.isEnabled = false; g.rotationGizmo.zGizmo.isEnabled = false; g.rotationGizmo.updateGizmoRotationToMatchAttachedMesh = false; }
    if (g.scaleGizmo) { g.scaleGizmo.xGizmo.isEnabled = false; g.scaleGizmo.yGizmo.isEnabled = false; g.scaleGizmo.zGizmo.isEnabled = false; g.scaleGizmo.incrementalSnap = true; }
    if (g.positionGizmo) g.positionGizmo.updateGizmoRotationToMatchAttachedMesh = false;
    this.applySnap();
    for (const giz of [g.positionGizmo, g.rotationGizmo, g.scaleGizmo]) {
      if (!giz || (giz as unknown as { __studioWired?: boolean }).__studioWired) continue;
      (giz as unknown as { __studioWired?: boolean }).__studioWired = true;
      giz.onDragStartObservable.add(() => { this.dragging = true; this.detachCameraInput(); });
      giz.onDragEndObservable.add(() => { this.dragging = false; this.attachCameraInput(); this.commitDrag(); });
    }
  }

  setSnap(s: SnapSettings): void { this.snap = s; this.applySnap(); }
  private applySnap(): void {
    const g = this.gizmos?.gizmos; if (!g) return;
    if (g.positionGizmo) g.positionGizmo.snapDistance = this.snap.on ? this.snap.move : 0;
    if (g.rotationGizmo) g.rotationGizmo.snapDistance = this.snap.on ? (this.snap.turn * Math.PI) / 180 : 0;
    if (g.scaleGizmo) g.scaleGizmo.snapDistance = this.snap.on ? this.snap.scale : 0;
  }

  /** The proxy's transform after a drag, snapped and clamped, as the document's transform. */
  private commitDrag(): void {
    const px = this.selected ? this.proxies.get(this.selected) : null; if (!px) return;
    const h = px.holder;
    const q = h.rotationQuaternion;
    const ry = q ? yawOfQuaternion(q.x, q.y, q.z, q.w) : h.rotation.y;
    const raw: StudioTransform = { p: [h.position.x, h.position.y, h.position.z], ry, s: px.obj.type === 'crowdStand' ? px.obj.t.s : h.scaling.x };
    const t = snapTransform(raw, this.snap);
    h.rotationQuaternion = null; h.rotation.set(0, t.ry, 0); h.position.set(t.p[0], t.p[1], t.p[2]);
    this.cb.onTransform(px.obj.id, t);
  }

  // ── cameras ───────────────────────────────────────────────────────────────────────────────────────────────────────

  setCamera(mode: CameraMode): void { this.stopPreview(); this.camMode = mode; this.applyCamera(); }

  private applyCamera(): void {
    const s = this.stage; if (!s) return;
    s.orbit.detachControl(); s.fly.detachControl();
    if (this.camMode === 'fly') {
      if (s.scene.activeCamera === s.orbit) { s.fly.position.copyFrom(s.orbit.position); s.fly.setTarget(s.orbit.target.clone()); }
      s.scene.activeCamera = s.fly;
    } else {
      if (s.scene.activeCamera === s.fly) { s.orbit.setTarget(s.fly.getTarget().clone()); s.orbit.setPosition(s.fly.position.clone()); }
      s.scene.activeCamera = s.orbit;
    }
    this.attachCameraInput();
  }

  private detachCameraInput(): void { const s = this.stage; if (!s) return; s.orbit.detachControl(); s.fly.detachControl(); }
  private attachCameraInput(): void {
    const s = this.stage; if (!s || !this.canvas) return;
    if (this.camMode === 'fly') s.fly.attachControl(true);
    // orbit: left orbits, right (or ctrl+left) pans; pan: left pans
    else (s.orbit.attachControl as (a: boolean, b: boolean, c: number) => void)(true, this.camMode === 'orbit', this.camMode === 'pan' ? 0 : 2);
  }

  /** Frame the selection (or the play area). */
  frame(): void {
    const s = this.stage; if (!s) return;
    this.setCamera(this.camMode === 'fly' ? 'orbit' : this.camMode);
    const px = this.selected ? this.proxies.get(this.selected) : null;
    if (px) {
      const b = proxyBox(px.obj), k = px.obj.type === 'crowdStand' ? 1 : px.obj.t.s;
      const c = px.box.getAbsolutePosition();
      s.orbit.setTarget(c.clone());
      s.orbit.radius = Math.max(4, Math.max(...b.size) * k * 2.2);
    } else {
      s.orbit.setTarget(s.subject().add(new Vector3(0, 1, -12)));
      s.orbit.alpha = Math.PI / 2; s.orbit.beta = 1.0; s.orbit.radius = 38;
    }
  }

  setGrid(on: boolean): void { this.gridOn = on; this.grid?.setEnabled(on); }

  // ── previews: the real intro director and the real replay angles ──────────────────────────────────────────────────

  /** Run the mode's broadcast intro (CameraDirector.establish) from the subject mark. False under reduced motion. */
  previewIntro(kind: 'establish' | 'walkIn'): boolean {
    const s = this.stage; if (!s) return false;
    this.stopPreview(false);
    this.detachCameraInput();
    const subject = s.subject(), objective = s.objective();
    s.camDirector.endIntro();
    s.camDirector.snapTo(subject, objective);
    if (!s.camDirector.establish(kind)) { this.attachCameraInput(); return false; }
    s.scene.activeCamera = s.shot;
    this.overlays(false);
    const zero = Vector3.Zero();
    this.preview = s.scene.onBeforeRenderObservable.add(() => {
      if (!s.camDirector.inIntro) { this.stopPreview(); return; }
      s.camDirector.update(subject, zero, objective);
    });
    return true;
  }

  /** Hold one replay angle (broadcastShots.replayShot) on the subject, facing the objective. */
  previewReplay(angle: Parameters<typeof replayShot>[0]): void {
    const s = this.stage; if (!s) return;
    this.stopPreview(false);
    this.detachCameraInput();
    const f = s.subject(), o = s.objective();
    const heading = { x: o.x - f.x, y: 0, z: o.z - f.z };
    const pose = replayShot(angle, { x: f.x, y: f.y, z: f.z }, heading, { x: o.x, y: o.y + 1, z: o.z });
    s.shot.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
    s.shot.setTarget(new Vector3(pose.target.x, pose.target.y, pose.target.z));
    if (pose.fov) s.shot.fov = pose.fov;
    s.shot.minZ = pose.minZ ?? 0.1;
    s.scene.activeCamera = s.shot;
    this.overlays(false);
    // held until the next camera choice; a frame observer would only redraw the same pose
    this.preview = s.scene.onBeforeRenderObservable.add(() => undefined);
  }

  /** The editor's own furniture (proxies, the grid, the gizmo) is not in a broadcast shot. */
  private overlays(on: boolean): void {
    this.grid?.setEnabled(on && this.gridOn);
    for (const px of this.proxies.values()) px.holder.setEnabled(on);
    if (!on) this.gizmos?.attachToNode(null); else this.attachGizmo();
  }

  stopPreview(notify = true): void {
    const s = this.stage;
    this.overlays(true);
    if (this.preview && s) { s.scene.onBeforeRenderObservable.remove(this.preview); s.camDirector.endIntro(); }
    const was = !!this.preview;
    this.preview = null;
    if (s && s.scene.activeCamera === s.shot) { s.scene.activeCamera = this.camMode === 'fly' ? s.fly : s.orbit; this.attachCameraInput(); }
    if (was && notify) this.cb.onPreviewEnd?.();
  }

  get previewing(): boolean { return !!this.preview; }

  // ── the budget sample ─────────────────────────────────────────────────────────────────────────────────────────────

  /** The last frame's cost, read off the engine (the capture rigs' measure), less the editor's own overlays. */
  sample(): BudgetSample | null {
    const s = this.stage; if (!s) return null;
    const e = s.engine as AbstractEngine & { getLoadedTexturesCache?: () => unknown[] };
    const active = s.scene.getActiveMeshes();
    let mine = 0;
    for (let i = 0; i < active.length; i++) if ((active.data[i] as AbstractMesh).name.startsWith('__studio_')) mine++;
    const bodies = s.scene.skeletons.filter((sk) => s.scene.meshes.some((m) => m.skeleton === sk && m.isEnabled() && m.isVisible)).length;
    const cache = (e.getLoadedTexturesCache?.() ?? []) as Parameters<typeof textureMb>[0];
    return {
      drawCalls: Math.max(0, this.lastDraws - mine),
      activeMeshes: Math.max(0, active.length - mine),
      textureMb: textureMb(cache),
      skinnedBodies: bodies,
      tier: s.tier,
    };
  }

  // ── teardown ──────────────────────────────────────────────────────────────────────────────────────────────────────

  private teardownScene(): void {
    if (this.venueTimer) { clearTimeout(this.venueTimer); this.venueTimer = null; }
    this.stopPreview(false);
    for (const o of this.observers.splice(0)) o.remove();
    if (this.statsTimer) { clearInterval(this.statsTimer); this.statsTimer = null; }
    this.gizmos?.dispose(); this.gizmos = null;
    for (const px of this.proxies.values()) px.holder.dispose();
    this.proxies.clear();
    this.grid = null;
    this.stage?.dispose({ keepEngine: true });
    this.stage = null;
  }

  dispose(): void {
    this.disposed = true;
    const engine = this.stage?.engine;
    this.teardownScene();
    if (engine && !this.engineOverride) { engine.stopRenderLoop(); engine.dispose(); }
  }

  /** For the shell's keyboard: nudge the selection by a grid step (arrow keys). */
  nudge(id: string, dx: number, dz: number): StudioTransform | null {
    const px = this.proxies.get(id); if (!px || px.obj.locked) return null;
    const step = this.snap.on ? this.snap.move : 0.1;
    return snapTransform({ ...px.obj.t, p: [px.obj.t.p[0] + dx * step, px.obj.t.p[1], px.obj.t.p[2] + dz * step] }, this.snap);
  }
}

/** A 1 m grid with 10 m majors, 120 m across, a hair over the ground. */
export function buildGrid(scene: Scene, half = 60): LinesMesh {
  const lines: Vector3[][] = [], colors: Array<Array<import('@babylonjs/core').Color4>> = [];
  const minor = new Color3(0.55, 0.62, 0.72).toColor4(0.18), major = GHOST.toColor4(0.42);
  for (let i = -half; i <= half; i++) {
    const c = i % 10 === 0 ? major : minor;
    lines.push([new Vector3(i, 0.02, -half), new Vector3(i, 0.02, half)]); colors.push([c, c]);
    lines.push([new Vector3(-half, 0.02, i), new Vector3(half, 0.02, i)]); colors.push([c, c]);
  }
  const grid = MeshBuilder.CreateLineSystem('__studio_grid', { lines, colors, useVertexAlpha: true }, scene);
  grid.isPickable = false;
  grid.alwaysSelectAsActiveMesh = false;
  return grid;
}

