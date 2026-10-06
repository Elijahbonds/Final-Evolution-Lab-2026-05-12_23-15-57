// RACE LOOK (owner requirement on PR #138, 2026-10-03): the race puts the player's OWN model in, and for an
// under-18 or unknown-age player that model's look comes ONLY from what is saved on the phone.
//
// Two rules, both pinned by raceLook.test.ts:
//
//  1. NOTHING of the look leaves the device. The identity path is read-only: resolveIdentity GETs the
//     closet and the hero body and that is all the race ever asks for. This module adds no writes.
//  2. A minor's look is local. The server row for an under-18 holds only the catalog defaults (LOOK
//     PRIVACY, PR #98 — the save routes write the hold, not the look), so the face the race dresses the
//     hero in must come from the device copy (creator/localLook). The closet's GET says `lookLocal` —
//     true for a minor and for anyone whose age is not a verified 18+ — and when it does, this overlay
//     wins: face, frame numbers, worn items, jersey plate. An adult's identity is untouched.
//
// `resolveRaceIdentity` runs before the mode's CharacterLibrary.spawn and seats the merged identity via
// primeIdentity, so the spawn's own resolveIdentity returns it. Pure merge in raceIdentityFromLocal.

import { primeIdentity, resolveIdentity, type PlayerIdentity } from '../core/playerIdentity';
import { clampCosmetic } from '../core/playFrame';
import { mergeLocalLook, readLocalLook, type StoredLook } from '../../creator/localLook';
import { getWearable, sanitizeJersey } from '../../closet/wearable-catalog';
import { faceOnly, readCreatorDoc } from '../../creator/look/storage';
import { effectivePalette } from '../../creator/look/palette';
import { accessoriesForEquipped } from '../../closet/wearableAccessories';

/**
 * The identity the race dresses the hero in when the look is device-only. `base` is the resolved identity
 * (its face/equipped are the catalog defaults for a minor); everything the hold kept off the server is
 * overlaid from the device copy. The body kind and the card accent are the server's non-look answers and
 * stay as they came.
 */
export function raceIdentityFromLocal(base: PlayerIdentity, local: StoredLook): PlayerIdentity {
  // The hold a minor is under: nothing of the face or the frame numbers was uploaded.
  const merged = mergeLocalLook(base.face, {}, local, { uploadFace: false, uploadNumbers: false });
  // IMPROVE (2026-10-06): the device face may carry the Creator doc (the Closet keeps it in `face`); it rides on its own
  // field, like resolveIdentity's, and its colours and the device's equipped accessories dress the race body too.
  const creator = readCreatorDoc(merged.face) ?? base.creator ?? null;
  const face = faceOnly(merged.face) as typeof merged.face;
  const pct = (v: number | undefined): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v / 100 : null;
  const height = pct(merged.heightScale), build = pct(merged.buildScale);
  const proportions = base.proportions
    ? {
        ...base.proportions,
        heightScale: height === null ? base.proportions.heightScale : clampCosmetic(height, 'height'),
        buildScale: build === null ? base.proportions.buildScale : clampCosmetic(build, 'build'),
        palette: { ...base.proportions.palette, skin: face.skinTone },
      }
    : base.proportions;
  const eq = local.equipped ?? {};
  const accentOf = (id: string | null | undefined, fallback: string): string =>
    (id && getWearable(id)?.accent) || fallback;
  return {
    ...base,
    face,
    proportions,
    palette: effectivePalette({
      jersey: accentOf(eq.tops, base.palette.jersey),
      shorts: accentOf(eq.shorts, base.palette.shorts),
      shoes: accentOf(eq.shoes, base.palette.shoes),
      accent: base.palette.accent,   // the card accent is the server's non-look answer — it stays
    }, creator?.colours),
    creator,
    accessories: local.equipped ? accessoriesForEquipped(local.equipped) : base.accessories,
    wardrobe: {
      tops: eq.tops ?? base.wardrobe.tops,
      shorts: eq.shorts ?? base.wardrobe.shorts,
      shoes: eq.shoes ?? base.wardrobe.shoes,
    },
    jersey: local.jersey ? sanitizeJersey(local.jersey) : base.jersey,
  };
}

/**
 * The race's identity. Adults (and guests, and any failure to ask) get exactly what resolveIdentity always
 * returned. A lookLocal player with a device copy gets the local overlay seated as the session identity, so
 * the hero spawn that follows wears what the phone holds — and no look data crosses the wire either way:
 * the only fetches in this path are resolveIdentity's two GETs.
 */
export async function resolveRaceIdentity(): Promise<PlayerIdentity> {
  const base = await resolveIdentity();
  if (base.lookLocal !== true) return base;
  const local = readLocalLook();
  if (!local) return base;   // nothing on the device: the catalog defaults the server holds stand
  const merged = raceIdentityFromLocal(base, local);
  primeIdentity(merged);
  return merged;
}
