// THE LOOK THAT IS NOT ALLOWED TO LEAVE THE DEVICE (2026-10-01).
//
// Under 18, and an adult who has not opted in to saving numbers, the editor still has to show what they
// built. That copy lives in localStorage under one key. The server copy is whatever lookPrivacy allowed
// through. On load, the local copy wins for the fields the server was not allowed to keep.
//
// The storage helpers no-op when there is no window, so a test can run the merge without a browser.

import { sanitizeJersey, type FaceConfig, type JerseyConfig } from '../closet/wearable-catalog';
import { APPEARANCE } from './schema/appearance';
import type { RowValue } from './editor/rowState';

export const LOCAL_LOOK_KEY = 'fel.myplayer.look.v1';
export const LOCAL_CONSENT_KEY = 'fel.myplayer.consent.v1';

export interface StoredLook {
  face?: FaceConfig;
  heightScale?: number;
  buildScale?: number;
  /** Closet item ids. Purchase inventory is not stored here. */
  equipped?: Record<string, string | null>;
  jersey?: JerseyConfig;
  animations?: Record<string, string | null>;
  /** Creator display values for the worn slots, so the editor can refill without reversing ids. */
  gear?: Record<string, RowValue>;
  accessories?: Record<string, RowValue>;
  appearance?: Record<string, string | number>;
  plate?: string;
}

const WORN_GEAR = ['headwear', 'tops', 'shorts', 'shoes'] as const;

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

/** What the creator writes beside the server save, including the parts a minor is not allowed to upload. */
export function creatorDeviceLook(
  values: Record<string, Record<string, RowValue> | undefined>,
  plate: string,
  prev: StoredLook | null,
  face?: FaceConfig,
): StoredLook {
  const gear: Record<string, RowValue> = {};
  for (const id of WORN_GEAR) {
    const v = values.gear?.[id];
    if (v !== undefined) gear[id] = v;
  }
  const animations: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(values.animations ?? {})) {
    animations[k] = v === null || typeof v === 'string' ? v : null;
  }
  const height = values.vitals?.heightScale;
  const build = values.vitals?.buildScale;
  const number = values.vitals?.jerseyNumber;
  return {
    ...(prev ?? {}),
    ...(face ? { face } : {}),
    appearance: values.appearance
      ? Object.fromEntries(Object.entries(values.appearance).filter(([, v]) => typeof v === 'string' || typeof v === 'number')) as Record<string, string | number>
      : prev?.appearance,
    heightScale: typeof height === 'number' ? height : prev?.heightScale,
    buildScale: typeof build === 'number' ? build : prev?.buildScale,
    gear: { ...(prev?.gear ?? {}), ...gear },
    accessories: { ...(prev?.accessories ?? {}), ...(values.accessories ?? {}) },
    animations: { ...(prev?.animations ?? {}), ...animations },
    jersey: sanitizeJersey({ number: typeof number === 'number' ? number : prev?.jersey?.number ?? 0, name: plate || prev?.jersey?.name || '' }),
    plate,
  };
}

type Values = Record<string, Record<string, RowValue> | undefined>;

/**
 * Refill the editor from the device for everything the server was not allowed to keep.
 * A minor's face, worn items, plate, animations, and height/build all come from here.
 */
export function overlayDeviceLook(
  values: Values,
  plate: string,
  local: StoredLook | null,
  hold: { uploadLook: boolean; uploadFace: boolean; uploadNumbers: boolean },
): { values: Values; plate: string } {
  if (!local) return { values, plate };
  const next: Values = { ...values };
  if (!hold.uploadLook) {
    if (local.appearance) next.appearance = { ...local.appearance };
    else if (local.face) next.appearance = appearanceFromFace(local.face);
    if (local.animations) next.animations = { ...(next.animations ?? {}), ...local.animations };
    if (local.gear) next.gear = { ...(next.gear ?? {}), ...local.gear };
    if (local.accessories) next.accessories = { ...(next.accessories ?? {}), ...local.accessories };
    next.vitals = { ...(next.vitals ?? {}) };
    if (typeof local.heightScale === 'number') next.vitals.heightScale = local.heightScale;
    if (typeof local.buildScale === 'number') next.vitals.buildScale = local.buildScale;
    if (local.jersey) next.vitals.jerseyNumber = local.jersey.number;
    return { values: next, plate: local.plate ?? local.jersey?.name ?? plate };
  }
  if (!hold.uploadFace && local.face) next.appearance = appearanceFromFace(local.face);
  if (!hold.uploadNumbers) {
    if (local.face?.sliders) {
      const base = next.appearance ?? {};
      next.appearance = { ...base, ...appearanceFromFace({ ...(local.face), sliders: local.face.sliders }) };
    }
    next.vitals = { ...(next.vitals ?? {}) };
    if (typeof local.heightScale === 'number') next.vitals.heightScale = local.heightScale;
    if (typeof local.buildScale === 'number') next.vitals.buildScale = local.buildScale;
  }
  return { values: next, plate };
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
