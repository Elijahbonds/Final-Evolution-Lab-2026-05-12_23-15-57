// THE LOOK THAT IS NOT ALLOWED TO LEAVE THE DEVICE (2026-10-01).
//
// Under 18, and an adult who has not opted in to saving numbers, the editor still has to show what they
// built. That copy lives in localStorage under one key. The server copy is whatever lookPrivacy allowed
// through. On load, the local copy wins for the fields the server was not allowed to keep.
//
// The storage helpers no-op when there is no window, so a test can run the merge without a browser.

import type { FaceConfig } from '../closet/wearable-catalog';
import { APPEARANCE } from './schema/appearance';

export const LOCAL_LOOK_KEY = 'fel.myplayer.look.v1';
export const LOCAL_CONSENT_KEY = 'fel.myplayer.consent.v1';

export interface StoredLook {
  face?: FaceConfig;
  heightScale?: number;
  buildScale?: number;
}

export interface StoredConsent {
  saveLookNumbers: boolean;
  modelTraining: boolean;
}

export const CONSENT_OFF: StoredConsent = { saveLookNumbers: false, modelTraining: false };

/** Appearance rows from a face, so a device-only look can refill the editor. Percents, matching the rows. */
export function appearanceFromFace(face: FaceConfig): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const src = face as unknown as Record<string, unknown>;
  for (const row of APPEARANCE.rows) {
    if (row.kind === 'rated') {
      const w = face.sliders?.[row.id];
      if (typeof w === 'number' && Number.isFinite(w)) out[row.id] = Math.round(w * 100);
      continue;
    }
    const v = src[row.id];
    if (typeof v === 'string') out[row.id] = v;
  }
  return out;
}

/** Local face and frame win wherever the server was not allowed to keep them. */
export function mergeLocalLook(
  serverFace: FaceConfig,
  serverFrame: { heightScale?: number; buildScale?: number },
  local: StoredLook | null,
  hold: { uploadFace: boolean; uploadNumbers: boolean },
): { face: FaceConfig; heightScale?: number; buildScale?: number } {
  const face: FaceConfig = { ...serverFace };
  let heightScale = serverFrame.heightScale;
  let buildScale = serverFrame.buildScale;
  if (!local) return { face, heightScale, buildScale };
  if (!hold.uploadFace && local.face) {
    return {
      face: { ...local.face },
      heightScale: local.heightScale ?? heightScale,
      buildScale: local.buildScale ?? buildScale,
    };
  }
  if (!hold.uploadNumbers) {
    if (local.face?.sliders) face.sliders = { ...local.face.sliders };
    if (typeof local.heightScale === 'number') heightScale = local.heightScale;
    if (typeof local.buildScale === 'number') buildScale = local.buildScale;
  }
  return { face, heightScale, buildScale };
}

export function readLocalLook(): StoredLook | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_LOOK_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredLook;
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

export function writeLocalLook(look: StoredLook): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LOCAL_LOOK_KEY, JSON.stringify(look)); } catch { /* private mode */ }
}

export function readConsent(): StoredConsent {
  if (typeof window === 'undefined') return { ...CONSENT_OFF };
  try {
    const raw = window.localStorage.getItem(LOCAL_CONSENT_KEY);
    if (!raw) return { ...CONSENT_OFF };
    const v = JSON.parse(raw) as Partial<StoredConsent>;
    const saveLookNumbers = v?.saveLookNumbers === true;
    return { saveLookNumbers, modelTraining: saveLookNumbers && v?.modelTraining === true };
  } catch { return { ...CONSENT_OFF }; }
}

export function writeConsent(c: StoredConsent): void {
  if (typeof window === 'undefined') return;
  const saveLookNumbers = c.saveLookNumbers === true;
  const next = { saveLookNumbers, modelTraining: saveLookNumbers && c.modelTraining === true };
  try { window.localStorage.setItem(LOCAL_CONSENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
}
