// poseGuard — the dunk film reads the pose model the rest of the app already serves.
//
// lib/pose/assets.ts is the only place a model URL is built. This checks the answer still starts at /pose,
// so a later edit cannot point the camera analysis at another origin without a test going red.

import { LOCAL_WASM_BASE, localModelUrl, type PoseModel } from '@/lib/pose/assets';

/** The wasm folder and both models. Every one is a same-origin /pose path. */
export function dunkPoseAssetUrls(): readonly string[] {
  const models: PoseModel[] = ['lite', 'full'];
  return [LOCAL_WASM_BASE, ...models.map((m) => localModelUrl(m))];
}

/** True when every URL is our own /pose path and not an absolute http(s) address. */
export function poseAssetsStayLocal(urls: readonly string[]): boolean {
  return urls.length > 0 && urls.every((u) => u.startsWith('/pose/') && !u.includes('://'));
}
