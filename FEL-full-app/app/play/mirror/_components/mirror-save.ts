// app/play/mirror/_components/mirror-save.ts — R-HEALTH-CLIENT (2026-09-30; FE PM 19:38 and 19:46 PT): the Mirror sends a
// save request ONLY when the server said this user can save.
//
// canSaveScan comes from app/play/mirror/page.tsx's server render (lib/privacy/scanSaveGate.ts canSaveScanNumbers: the
// database's dobYear verified 18+ AND opted in), learned once per page load. For everyone else — unknown age, under 18,
// 17 with a parent's yes, an adult who hasn't opted in — the harness sends nothing to /api/mirror/*: no save POST, no
// answers PATCH (the self-report card gets 'unsaved'), no history read. The session lives in React state and is gone on
// reload; nothing goes to localStorage, sessionStorage, IndexedDB or a cookie instead — with ONE exception since
// MIRROR-PROGRESS (2026-10-07; owner decision 1, "under-18s keep their progress on the device only"): the review's
// "vs your last 3" keeps each finished set's one headline number (and when) on this phone, never sent, wipeable
// (lib/mirror/deviceProgress.ts). For an adult who opted in, that comparison rides on the sessions POST below instead.
//
// Pure: no React, no storage. The can-save rule itself is lib/privacy/scanSaveGate.ts's; this only obeys its answer.

/** Every /api/mirror/* URL the harness calls (the jump's POST and its history read share /api/mirror/dunks). */
export const MIRROR_SAVE_URLS = ['/api/mirror/sessions', '/api/mirror/dunks', '/api/mirror/screen'] as const;

/** The screen panel's line when a finished screen was not sent because this account isn't saved for.
 *  assumption: (FE PM can reverse) that wording. */
export const NOT_SAVED_ON_DEVICE = 'Saved on this device only: we save Mirror results just for verified adults who opt in.';

/**
 * `fetchImpl(url, init)`, unchanged, when `canSave` is exactly true; otherwise null WITHOUT calling it. A caller that gets
 * null has sent nothing and shows its on-device result instead. A missing or non-boolean answer never sends.
 */
export function mirrorSave(canSave: boolean, fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<Response> | null {
  if (canSave !== true) return null;
  return fetchImpl(url, init);
}
