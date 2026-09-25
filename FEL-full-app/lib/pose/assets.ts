// assets — where the MediaPipe wasm and the pose models load from (movement play, phase 2, 2026-09-24).
//
// Owner decision: serve them ourselves, no third-party requests. public/pose/ holds a copy of the tasks-vision wasm
// (from node_modules, the same version the JS bundle is built from) and the two pose models; public/pose/README.md has
// their source, version, sizes and license. The CDN stays only as the fallback for a deploy where our copy is missing
// (a 404 or 410, nothing else), so a stale deploy falls back to today's behaviour instead of breaking the camera.
//
// Pure apart from headProbe (a fetch). The pose adapter and face scan both resolve through here.

/**
 * The installed @mediapipe/tasks-vision. The wasm we serve must be the exact build the JS bundle (compiled by Next from
 * node_modules) expects, so assets.test.ts checks this against package.json and the files against node_modules.
 */
export const VISION_VERSION = '0.10.35';

export const LOCAL_WASM_BASE = '/pose/wasm';
export const CDN_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;

/**
 * FilesetResolver loads `vision_wasm_internal.{js,wasm}`, or the `_nosimd_` pair on a browser without wasm SIMD. Both
 * pairs are copied. The `_module_` pair is not: it is only loaded by forVisionTasks(path, true), which nothing calls.
 */
export const LOCAL_WASM_FILES = [
  'vision_wasm_internal.js', 'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm',
] as const;

/** The two pose landmarker models. Same detector; full has the bigger landmark network (steadier, slower). */
export type PoseModel = 'lite' | 'full';

/** Bytes of each float16 model as Google serves it (md5 checked on download, 2026-09-24). A short file is a bad copy. */
export const POSE_MODEL_BYTES: Record<PoseModel, number> = { lite: 5_777_746, full: 9_398_198 };

export const localModelUrl = (m: PoseModel) => `/pose/models/pose_landmarker_${m}.task`;
export const cdnModelUrl = (m: PoseModel) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${m}/float16/1/pose_landmarker_${m}.task`;
/** What recordings and stats call the model, since lite and full landmarks differ. */
export const poseModelName = (m: PoseModel) => `pose_landmarker_${m}/float16/1`;

/** Whether a URL on our own origin is there: false ONLY when the server says it is not (see MISSING_STATUS). */
export type AssetProbe = (url: string) => Promise<boolean>;

/**
 * The answers that mean "this deploy has no copy": Not Found and Gone. Nothing else sends a player to the CDN. A
 * dropped connection, a 5xx, a host that refuses HEAD (405) or a 200 page from a proxy say nothing about the files, and
 * falling back on them would hand the viewer's IP to jsDelivr and Google for the rest of the page's life (the answer is
 * kept per page) on a deploy that has the files. Those keep our URL, and a real failure surfaces as a model that did
 * not load, which the player can retry.
 */
export const MISSING_STATUS: readonly number[] = [404, 410];

/** HEAD our own URL. */
export const headProbe: AssetProbe = async (url) => {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return !MISSING_STATUS.includes(r.status);
  } catch {
    return true;   // offline or a blocked request: not evidence the file is missing
  }
};

/** Our copy unless the server says it is missing, then the CDN. Each URL is probed once per page. */
export class AssetResolver {
  private readonly seen = new Map<string, Promise<boolean>>();
  constructor(private readonly probe: AssetProbe = headProbe) {}

  private has(url: string): Promise<boolean> {
    let p = this.seen.get(url);
    // A probe that throws has not shown the file missing either: keep our copy.
    if (!p) { p = this.probe(url).catch(() => true); this.seen.set(url, p); }
    return p;
  }

  /** The folder FilesetResolver.forVisionTasks() takes. Probed on the SIMD loader, the file every current browser asks for. */
  async wasmBase(): Promise<string> {
    return (await this.has(`${LOCAL_WASM_BASE}/${LOCAL_WASM_FILES[0]}`)) ? LOCAL_WASM_BASE : CDN_WASM_BASE;
  }

  async poseModel(m: PoseModel): Promise<string> {
    const local = localModelUrl(m);
    return (await this.has(local)) ? local : cdnModelUrl(m);
  }
}

/** The page's resolver: the pose adapter and face scan share it, so the wasm folder is probed once. */
export const visionAssets = new AssetResolver();
