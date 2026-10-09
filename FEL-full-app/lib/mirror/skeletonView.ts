// skeletonView — the Mirror's skeleton-only view: the preference, where it is kept, and what the stage paints in it
// (MIRROR-COACH P9, 2026-09-30).
//
// WHAT WAS MISSING. The Mirror always painted the live camera picture behind its overlay. Training in front of your own
// reflection is not neutral: in the dance-class study the crossref cites (Radell 2004), the classes taught with a mirror
// lost body satisfaction and reported comparing themselves to their reflection; the classes without one did not
// (crossref, "Mirror feedback design": "offer a no-reflection or skeleton-only mode"). There was no way to turn the
// picture off and keep the coaching.
//
// WHAT THIS IS. One switch. With it on, the stage paints NO camera image: the tracked skeleton, the overlay, the rep
// count, the checks and the coach's cue all read exactly as before, over the dark stage.
//
// WHY THE <video> STAYS MOUNTED, HIDDEN. The pose model reads its frames from that element (render/overlay-compositor.ts:
// adapter.detect(opts.video, …)); unmounting it would end the session. Hidden with opacity 0 — not display:none — because
// a display:none video is not decoded on some mobile browsers (iOS Safari is the known one; assumption: from field
// reports, not measured here), and a video that stops decoding would stop the pose read. The picture is simply never
// painted. p9/feedback-cues/probe proves a hidden video still delivers frames in headless Chromium.
//
// WHERE IT IS KEPT. This browser's localStorage, one key — a UI preference, never a server write, never health data.
// assumption: "remembered per player" = per browser profile. The harness is not handed the signed-in user's id
// (app/play/mirror/page.tsx passes only the youth gate, and this phase leaves page.tsx to open PR #51), so two players
// sharing one browser share the switch. Every storage access is guarded: a browser that refuses storage (a private
// window, site data blocked) reads the default and the switch still works for the visit.

/** The one localStorage key (versioned, so a later shape can move off it cleanly). */
export const SKELETON_ONLY_KEY = 'fel.mirror.skeletonOnly.v1';

/** What a store needs to be for this preference (localStorage, or a test's map). */
export interface PrefStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** This browser's localStorage, or null where there is none or the accessor itself throws. */
export function browserPrefStore(): PrefStore | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The saved preference. Anything but a stored '1' — nothing stored, no store, a throwing store — is off. */
export function readSkeletonOnly(store: PrefStore | null = browserPrefStore()): boolean {
  if (!store) return false;
  try {
    return store.getItem(SKELETON_ONLY_KEY) === '1';
  } catch {
    return false;
  }
}

/** Save the preference. Returns whether it was kept (false: no store, or the store refused — the switch still works). */
export function writeSkeletonOnly(on: boolean, store: PrefStore | null = browserPrefStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(SKELETON_ONLY_KEY, on ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}

/** What the stage paints. Only the camera image depends on the switch; everything that reads a number stays. */
export interface StageLayers {
  cameraImage: boolean;
  overlay: boolean;
  skeleton: boolean;
  numbers: boolean;
}

export function stageLayers(skeletonOnly: boolean): StageLayers {
  return { cameraImage: !skeletonOnly, overlay: true, skeleton: true, numbers: true };
}

/** The switch's words: what pressing it does, for the button's accessible name and its tooltip. */
export function skeletonToggleLabel(skeletonOnly: boolean): string {
  return skeletonOnly ? 'Show the camera picture' : 'Skeleton only: hide the camera picture';
}
