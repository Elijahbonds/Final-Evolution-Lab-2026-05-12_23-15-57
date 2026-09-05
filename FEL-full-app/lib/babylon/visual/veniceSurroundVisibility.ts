/**
 * Venice LOOK — surround KEEP/HIDE + palm tip scale + golden-haze clearColor.
 * Never edit GLB bytes. Scene-only enable/scale after mount.
 * Spec: SPEC-VENICE-LOOK.md + palm LOOK 3b (tips 8–12 m, prefer ~10 m).
 */
import {
  AbstractMesh,
  Color4,
  Scene,
  SceneLoader,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

/** Golden-hour haze — not void #0b0e16. */
export const VENICE_GOLDEN_HAZE = Color4.FromHexString('#d4a06aff');

const SURROUND_URL = '/models/maps/venice-court-surround.glb';
const SURROUND_ROOT = 'meshy_venice_surround';

/** KEEP enabled (prefix / exact). */
const KEEP_PREFIXES = ['Ocean', 'trunk', 'frond'] as const;
/** HIDE via setEnabled(false) — do not delete from GLB. */
const HIDE_PREFIXES = ['Bleach', 'body', 'head', 'kiosk', 'kroof'] as const;
const HIDE_EXACT = new Set(['GroundApron', 'SandRing', 'BoardwalkBand']);

const ATHLETE_M = 1.85;
const PALM_TIP_TARGET_M = 10; // prefer mid of 8–12 m band
const PALM_TIP_MIN_M = 8;
const PALM_TIP_MAX_M = 12;

function nameOf(n: { name?: string } | null | undefined): string {
  return n?.name ?? '';
}

function matchesPrefix(name: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => name === p || name.startsWith(p));
}

function isKeep(name: string): boolean {
  return matchesPrefix(name, KEEP_PREFIXES);
}

function isHide(name: string): boolean {
  if (HIDE_EXACT.has(name)) return true;
  return matchesPrefix(name, HIDE_PREFIXES);
}

function walkNodes(scene: Scene): Array<AbstractMesh | TransformNode> {
  const out: Array<AbstractMesh | TransformNode> = [];
  for (const m of scene.meshes) out.push(m);
  for (const t of scene.transformNodes) out.push(t);
  return out;
}

/**
 * KEEP Ocean*/trunk*/frond*; HIDE Bleach*/body*/head*/kiosk*/kroof*/GroundApron/SandRing/BoardwalkBand.
 * Court: Mesh_0 only as painted playable court (sibling court paint meshes under Meshy court stay off).
 */
export function applyVeniceSurroundVisibility(scene: Scene): void {
  for (const node of walkNodes(scene)) {
    const n = nameOf(node);
    if (!n) continue;

    if (isKeep(n)) {
      node.setEnabled(true);
      if ('isVisible' in node) (node as AbstractMesh).isVisible = true;
      if ('visibility' in node) (node as AbstractMesh).visibility = 1;
      continue;
    }

    if (isHide(n)) {
      node.setEnabled(false);
      if ('isVisible' in node) (node as AbstractMesh).isVisible = false;
      continue;
    }

    // Court: Mesh_0 only — hide other Mesh_* paint siblings under meshy court roots.
    if (/^Mesh_\d+$/.test(n) && n !== 'Mesh_0') {
      let p: { name: string; parent: unknown } | null = node as unknown as { name: string; parent: unknown };
      let underCourt = false;
      while (p) {
        if (p.name.includes('venice') && p.name.includes('court')) { underCourt = true; break; }
        if (p.name === 'meshy_venice_court' || p.name.startsWith('nexus_venue_map_venice')) { underCourt = true; break; }
        p = (p.parent as { name: string; parent: unknown } | null) ?? null;
      }
      if (underCourt) {
        node.setEnabled(false);
        if ('isVisible' in node) (node as AbstractMesh).isVisible = false;
      }
    }
  }
  console.info('[FEL-VENICE-LOOK] applyVeniceSurroundVisibility KEEP Ocean/trunk/frond · HIDE clutter · Mesh_0 court');
}

/**
 * Uniform-scale trunk* + frond* about their base so tips land ~10 m (8–12 band).
 * NEVER apply this scale to Ocean* (no vertical wall).
 */
export function scaleVenicePalms(scene: Scene, tipTargetM = PALM_TIP_TARGET_M): number {
  const target = Math.max(PALM_TIP_MIN_M, Math.min(PALM_TIP_MAX_M, tipTargetM));
  // Group fronds with nearest trunk when possible; otherwise scale each trunk/frond root.
  const trunks: TransformNode[] = [];
  const fronds: AbstractMesh[] = [];

  for (const node of walkNodes(scene)) {
    const n = nameOf(node);
    if (matchesPrefix(n, ['Ocean'])) continue; // LOCK: never palm-scale Ocean
    if (matchesPrefix(n, ['trunk'])) trunks.push(node as TransformNode);
    else if (matchesPrefix(n, ['frond']) && 'getBoundingInfo' in node) fronds.push(node as AbstractMesh);
  }

  let scaled = 0;
  const scaledIds = new Set<number>();

  const scaleAboutBase = (node: TransformNode | AbstractMesh, factor: number) => {
    if (!(factor > 1.01) || !(factor < 40)) return;
    // Prefer parent transform if shared; else scale node local about base (Y=0 local).
    const before = node.getHierarchyBoundingVectors?.(true)
      ?? { min: node.getAbsolutePosition?.() ?? Vector3.Zero(), max: node.getAbsolutePosition?.() ?? Vector3.Zero() };
    const baseY = before.min.y;
    const world = node.getAbsolutePosition();
    node.scaling.x *= factor;
    node.scaling.y *= factor;
    node.scaling.z *= factor;
    node.computeWorldMatrix(true);
    const after = node.getHierarchyBoundingVectors?.(true)
      ?? { min: node.getAbsolutePosition?.() ?? Vector3.Zero(), max: node.getAbsolutePosition?.() ?? Vector3.Zero() };
    // Keep base planted: compensate world Y drift from scale-about-pivot.
    const dy = baseY - after.min.y;
    if (Math.abs(dy) > 1e-4) {
      node.position.y += dy;
      node.computeWorldMatrix(true);
    }
    // Keep XZ footprint center if scale pivoted oddly
    void world;
    scaled += 1;
  };

  for (const trunk of trunks) {
    const id = (trunk as unknown as { uniqueId?: number }).uniqueId ?? scaled;
    if (scaledIds.has(id)) continue;
    trunk.computeWorldMatrix(true);
    const b = trunk.getHierarchyBoundingVectors(true);
    const tipY = b.max.y;
    const baseY = b.min.y;
    const height = Math.max(0.05, tipY - baseY);
    // Native tips measured ~0.67–0.89 m as shrubs; grow to target tip height.
    const factor = target / Math.max(height, 0.2);
    if (factor < 1.05 && tipY >= PALM_TIP_MIN_M) continue;
    scaleAboutBase(trunk, factor);
    scaledIds.add(id);

    // Fronds that sit near this trunk: match the same factor if still short.
    for (const frond of fronds) {
      const fid = (frond as unknown as { uniqueId?: number }).uniqueId ?? -1;
      if (scaledIds.has(fid)) continue;
      frond.computeWorldMatrix(true);
      const fb = frond.getBoundingInfo().boundingBox;
      const fCenter = fb.centerWorld;
      const tCenter = b.min.add(b.max).scale(0.5);
      const xz = Math.hypot(fCenter.x - tCenter.x, fCenter.z - tCenter.z);
      if (xz > 3.5) continue;
      scaleAboutBase(frond, factor);
      scaledIds.add(fid);
    }
  }

  // Orphan fronds (no trunk match): scale so their tip hits band.
  for (const frond of fronds) {
    const fid = (frond as unknown as { uniqueId?: number }).uniqueId ?? -1;
    if (scaledIds.has(fid)) continue;
    frond.computeWorldMatrix(true);
    const fb = frond.getHierarchyBoundingVectors?.(true) ?? {
      min: frond.getBoundingInfo().boundingBox.minimumWorld,
      max: frond.getBoundingInfo().boundingBox.maximumWorld,
    };
    const height = Math.max(0.05, fb.max.y - fb.min.y);
    const tipY = fb.max.y;
    if (tipY >= PALM_TIP_MIN_M && tipY <= PALM_TIP_MAX_M) continue;
    const factor = target / Math.max(height, 0.2);
    scaleAboutBase(frond, factor);
    scaledIds.add(fid);
  }

  console.info(`[FEL-VENICE-LOOK] scaleVenicePalms tipTarget=${target}m athlete=${ATHLETE_M}m nodes=${scaled}`);
  return scaled;
}

/** Venice dunk clearColor = golden-hour haze (not #0b0e16). */
export function applyVeniceGoldenHaze(scene: Scene): void {
  scene.clearColor = VENICE_GOLDEN_HAZE.clone();
  console.info('[FEL-VENICE-LOOK] clearColor golden-haze #d4a06a');
}

/** Load surround GLB once if no Ocean/trunk nodes exist yet. Never edits bytes. */
export async function ensureVeniceSurroundMounted(scene: Scene): Promise<boolean> {
  const has = walkNodes(scene).some((n) => {
    const name = nameOf(n);
    return matchesPrefix(name, KEEP_PREFIXES);
  });
  if (has) return true;
  if (scene.getTransformNodeByName(SURROUND_ROOT)) return true;

  try {
    const head = await fetch(SURROUND_URL, { method: 'HEAD' });
    if (!head.ok) {
      // Fall back to ImportMesh without HEAD (file:// / offline).
      console.warn('[FEL-VENICE-LOOK] surround HEAD failed; trying import anyway');
    }
    const root = new TransformNode(SURROUND_ROOT, scene);
    const res = await SceneLoader.ImportMeshAsync('', '/models/maps/', 'venice-court-surround.glb', scene);
    for (const m of res.meshes) {
      if (!m.parent) m.parent = root;
      m.isPickable = false;
    }
    for (const t of res.transformNodes ?? []) {
      if (!t.parent) t.parent = root;
    }
    console.info('[FEL-VENICE-LOOK] mounted venice-court-surround.glb');
    return true;
  } catch (e) {
    console.warn('[FEL-VENICE-LOOK] surround mount failed', e);
    return false;
  }
}

/** Full LOOK pass for Venice dunk mount. */
export async function applyVeniceDunkLookPass(scene: Scene): Promise<void> {
  await ensureVeniceSurroundMounted(scene);
  applyVeniceSurroundVisibility(scene);
  scaleVenicePalms(scene, PALM_TIP_TARGET_M);
  applyVeniceGoldenHaze(scene);
}
