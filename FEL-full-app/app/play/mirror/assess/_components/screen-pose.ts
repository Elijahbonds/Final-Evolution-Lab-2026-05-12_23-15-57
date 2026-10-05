'use client';

// The Quick Screen's camera: the app's own PoseService, with its one memory held in this page only (SCREEN-FIX-2,
// Cyber F5, 2026-09-29).
//
// PoseService remembers "full was too slow on this desktop, start on lite" under fel.pose.model (lib/pose/modelChoice.ts
// MODEL_MEMORY_KEY), through its injected `storage`, which the app's singleton points at localStorage. The screen
// promises "we save nothing", so its PoseService gets the SAME browser deps as the singleton (the camera, the <video>,
// the landmarker, the frame loop: one code path) with only `storage` swapped for a map that dies with the page. The
// model choice still works for the page's life; nothing is kept after it.
//
// The deps are read off the singleton because lib/pose/PoseService.ts keeps browserDeps() private, and lib/pose is
// movement-play's (this lane may not edit it). If that field ever moves, screenPose() throws at the first camera start
// rather than quietly falling back to localStorage; lib/screen/screen-pose.test.ts pins it. The smallest lib/pose
// change that would retire the cast is routed in ~/Claude/outbox/screen-fix-2-routed.md.
//
// The QA feed (window.__FEL_POSE_FEED__) is bound to the singleton when PoseService loads; the screen rebinds it to its
// own service while it is mounted (assess-app.tsx), under the same gate (lib/pose/feed.ts feedHookAllowed).
import { PoseService, poseService, type PoseDeps } from '@/lib/pose/PoseService';

/** A storage that lives in this page's memory only: a reload forgets it. */
export function pageMemoryStorage(): PoseDeps['storage'] {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v); } };
}

let instance: PoseService | null = null;

/** The screen's one PoseService: the app's browser deps, with a page-memory storage. */
export function screenPose(): PoseService {
  if (instance) return instance;
  const base = (poseService() as unknown as { deps?: PoseDeps }).deps;
  if (!base || typeof base.getUserMedia !== 'function' || typeof base.loadDetector !== 'function') {
    throw new Error('[screen] PoseService no longer exposes its browser deps: the screen will not open the camera with localStorage memory');
  }
  instance = new PoseService({ ...base, storage: pageMemoryStorage() });
  return instance;
}
