// AvatarBuilder — the core avatar object: one skeleton, a body archetype
// mesh, swappable slot meshes, zone tinting, height scaling, decals, and
// serialization.
//
// KEY ARCHITECTURAL RULES (each one is load-bearing):
//   ONE SKELETON. Every slot mesh binds to the body's skeleton instance, so
//     a single animation drives the whole avatar. Slots that arrive with
//     their own skeleton are re-bound; a slot whose bones don't match the
//     FEL spec is rejected rather than silently mis-deforming.
//   NO MergeMeshes. Merging destroys slot swapping and is fragile with
//     shared skeletons. At 5-7 slots the draw-call count is a non-issue.
//   NO morph targets. Body variety is 3 separate archetype meshes plus a
//     root-bone height scale (see types/avatar.ts for why).
//   SERVER OWNS OWNERSHIP. equip() refuses unowned items. The client's copy
//     of the owned list is display state, never authority.
//
// Loading goes through AssetRegistry — nothing here calls SceneLoader.

import { Quaternion, Vector3, TransformNode } from '@babylonjs/core';
import type { AbstractMesh, Scene, Skeleton, Texture } from '@babylonjs/core';
import { MeshBuilder } from '@babylonjs/core';
import {
  DEFAULT_AVATAR, HEIGHT_RANGE, MAX_DECALS,
  type AvatarConfig, type AvatarManifest, type AvatarSlot, type BodyArchetype,
  type DecalConfig, type SlotItem, type TintSet,
} from '../types/avatar';
import { registerZoneTint, applyTint } from './TintMaterialPlugin';
import { auditRig } from './RigValidator';
import type { AssetRegistry } from './AssetRegistry';

interface EquippedSlot {
  itemId: string;
  meshes: AbstractMesh[];
  mask: Texture | null;
  dispose(): void;
}

export class AvatarBuilder {
  readonly root: TransformNode;
  private skeleton: Skeleton | null = null;
  private bodyMeshes: AbstractMesh[] = [];
  private bodyMask: Texture | null = null;
  private disposeBody: (() => void) | null = null;
  private slots = new Map<AvatarSlot, EquippedSlot>();
  private decals: { cfg: DecalConfig; mesh: AbstractMesh }[] = [];
  private config: AvatarConfig = { ...DEFAULT_AVATAR, slots: {}, decals: [] };
  private ownedIds = new Set<string>();

  constructor(
    private scene: Scene,
    private registry: AssetRegistry,
    private manifest: AvatarManifest,
  ) {
    registerZoneTint();
    this.root = new TransformNode('avatar_root', scene);
  }

  /** Server-authoritative ownership list. Call before building the UI. */
  setOwnership(ownedItemIds: string[]): void {
    this.ownedIds = new Set(ownedItemIds);
  }
  isOwned(itemId: string): boolean {
    const item = this.manifest.items.find((i) => i.id === itemId);
    return !item?.premium || this.ownedIds.has(itemId);
  }

  get currentConfig(): AvatarConfig {
    return JSON.parse(JSON.stringify(this.config)) as AvatarConfig;
  }
  get rigSkeleton(): Skeleton | null { return this.skeleton; }

  // ── body ────────────────────────────────────────────────────────────────
  async setArchetype(archetype: BodyArchetype): Promise<void> {
    const body = this.manifest.bodies.find((b) => b.archetype === archetype);
    if (!body) { console.warn(`[FEL-AVATAR] no body for archetype "${archetype}"`); return; }

    const previous = this.config.slots;
    this.disposeBody?.();
    this.slots.forEach((s) => s.dispose());
    this.slots.clear();

    const inst = await this.registry.instantiate(body.glbUrl, this.scene);
    this.bodyMeshes = inst.meshes;
    this.skeleton = inst.skeleton;
    this.disposeBody = inst.dispose;
    for (const m of this.bodyMeshes) m.parent = this.root;

    if (this.skeleton) {
      const report = auditRig(this.skeleton, this.bodyMeshes);
      if (!report.conforms) {
        console.error('[FEL-AVATAR] body rig does NOT conform to the FEL skeleton spec — '
          + 'animations will not play correctly. See AvatarSkeletonSpec.md.', report);
      }
    }

    this.bodyMask = body.maskUrl ? await this.registry.texture(body.maskUrl, this.scene) : null;
    this.config.archetype = archetype;
    this.applySkinTone(this.config.skinTone);
    this.applyHeight(this.config.height);

    // re-equip what was on before the swap
    for (const [slot, itemId] of Object.entries(previous) as [AvatarSlot, string][]) {
      await this.equip(slot, itemId);
    }
  }

  // ── slots ───────────────────────────────────────────────────────────────
  async equip(slot: AvatarSlot, itemId: string | null): Promise<boolean> {
    this.slots.get(slot)?.dispose();
    this.slots.delete(slot);
    if (!itemId) { delete this.config.slots[slot]; return true; }

    const item = this.manifest.items.find((i) => i.id === itemId && i.slot === slot);
    if (!item) { console.warn(`[FEL-AVATAR] unknown item "${itemId}" for slot "${slot}"`); return false; }
    if (!this.isOwned(itemId)) {
      console.warn(`[FEL-AVATAR] item "${itemId}" not owned — refusing to equip`);
      return false;
    }
    if (!item.archetypes.includes(this.config.archetype)) {
      console.warn(`[FEL-AVATAR] item "${itemId}" is not authored for archetype "${this.config.archetype}"`);
      return false;
    }

    const inst = await this.registry.instantiate(item.glbUrl, this.scene);
    // bind every slot mesh to the BODY's skeleton — one skeleton per avatar
    for (const m of inst.meshes) {
      m.parent = this.root;
      if (this.skeleton && m.skeleton && m.skeleton !== this.skeleton) m.skeleton = this.skeleton;
    }
    const mask = item.maskUrl ? await this.registry.texture(item.maskUrl, this.scene) : null;
    this.slots.set(slot, { itemId, meshes: inst.meshes, mask, dispose: inst.dispose });
    this.config.slots[slot] = itemId;
    applyTint(inst.meshes, mask, this.config.colors);
    return true;
  }

  // ── appearance ──────────────────────────────────────────────────────────
  setColors(colors: Partial<TintSet>): void {
    this.config.colors = { ...this.config.colors, ...colors };
    for (const s of this.slots.values()) applyTint(s.meshes, s.mask, this.config.colors);
  }

  setSkinTone(hex: string): void {
    this.config.skinTone = hex;
    this.applySkinTone(hex);
  }
  private applySkinTone(hex: string): void {
    // the body uses the same zone system; skin rides the PRIMARY channel
    applyTint(this.bodyMeshes, this.bodyMask, {
      primary: hex, secondary: hex, accent: this.config.colors.accent,
    });
  }

  /** Height via uniform scale on the root bone — no morph targets. */
  setHeight(value: number): void {
    const h = Math.max(HEIGHT_RANGE[0], Math.min(HEIGHT_RANGE[1], value));
    this.config.height = h;
    this.applyHeight(h);
  }
  private applyHeight(h: number): void {
    const hips = this.skeleton?.bones.find((b) => b.name === 'Hips')?.getTransformNode();
    if (hips) hips.scaling.setAll(h);
    else this.root.scaling.setAll(h);      // fallback: scale the whole avatar
  }

  // ── decals ──────────────────────────────────────────────────────────────
  /**
   * Stamp a logo. CRITICAL: the decal is projected while the avatar is at
   * BIND POSE and then parented to a bone — project it mid-animation and it
   * swims across the skin. Callers should stop animation first (see
   * AvatarBuilderScene's addDecal flow).
   */
  async addDecal(cfg: DecalConfig): Promise<boolean> {
    if (this.decals.length >= MAX_DECALS) {
      console.warn(`[FEL-AVATAR] decal limit (${MAX_DECALS}) reached`);
      return false;
    }
    const targetMeshes = [...this.bodyMeshes, ...[...this.slots.values()].flatMap((s) => s.meshes)];
    const target = targetMeshes.find((m) => m.getTotalVertices() > 0);
    if (!target) return false;

    const decal = MeshBuilder.CreateDecal('avatar_decal', target, {
      position: new Vector3(...cfg.position),
      normal: Vector3.Forward(),
      size: new Vector3(...cfg.size),
      angle: cfg.rotation[2],
    });
    const bone = this.skeleton?.bones.find((b) => b.name === cfg.boneTarget)?.getTransformNode();
    decal.parent = bone ?? this.root;
    if (!bone) {
      console.warn(`[FEL-AVATAR] decal boneTarget "${cfg.boneTarget}" not on the rig — parented to root; it will not follow the skin.`);
    }
    const tex = await this.registry.texture(cfg.textureUrl, this.scene);
    const mat = decal.material as unknown as { albedoTexture?: Texture; diffuseTexture?: Texture; zOffset?: number } | null;
    if (mat) {
      if ('albedoTexture' in mat) mat.albedoTexture = tex;
      else mat.diffuseTexture = tex;
      mat.zOffset = -2;
    }
    this.decals.push({ cfg, mesh: decal });
    this.config.decals.push(cfg);
    return true;
  }

  clearDecals(): void {
    for (const d of this.decals) d.mesh.dispose();
    this.decals = [];
    this.config.decals = [];
  }

  // ── persistence ─────────────────────────────────────────────────────────
  serialize(): AvatarConfig { return this.currentConfig; }

  async deserialize(cfg: AvatarConfig): Promise<void> {
    await this.setArchetype(cfg.archetype);
    this.setColors(cfg.colors);
    this.setSkinTone(cfg.skinTone);
    this.setHeight(cfg.height);
    for (const [slot, itemId] of Object.entries(cfg.slots) as [AvatarSlot, string][]) {
      await this.equip(slot, itemId);
    }
    this.clearDecals();
    for (const d of cfg.decals) await this.addDecal(d);
  }

  /** Reset the pose to bind — required before decal projection. */
  toBindPose(): void {
    if (!this.skeleton) return;
    for (const bone of this.skeleton.bones) {
      const n = bone.getTransformNode();
      if (n) n.rotationQuaternion = n.rotationQuaternion ?? Quaternion.Identity();
    }
    this.skeleton.returnToRest();
  }

  dispose(): void {
    this.clearDecals();
    this.slots.forEach((s) => s.dispose());
    this.slots.clear();
    this.disposeBody?.();
    this.root.dispose();
  }
}
