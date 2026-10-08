// lib/soundtrack/privateUploads.ts — PIPELINES (owner, 2026-10-06): "teen private uploads YES (owner-only private area,
// never public; acting/voice stays adults-only)". Pure.
//
// Before: the upload route answered every creator who is not a verified 18+ with 403 device_only, so a teen could make a
// song or a cover but never keep it anywhere but this device. Now such a creator may upload MUSIC and IMAGE media into an
// owner-only folder (private/<userId>/ in the private bucket, lib/soundtrack/storage.ts). The rules that keep it there:
//
//   1. WHAT: audio only for a music card; images for music covers, art, cooking, writing and fashion. NEVER acting (a
//      minor's voice; owner: "acting/voice stays adults-only"), and nothing for dance, scene or sport (they carry no media).
//   2. NEVER PUBLIC, BY ANY PATH: a card that carries a private/ URL is created private and stays private whoever owns it
//      later and whatever it asks (createCard); approval cannot make it public (reviewCard), the review route refuses to
//      approve it, the rotation route refuses it, the catalogue never plays it, and promoteCardMedia never copies it
//      (pendingObjectOf accepts pending/ only). The private bucket is not readable without a signed link, and only the
//      owner is given one ([id] ?media=1).
//   3. NEVER IN FRONT OF OTHERS: such a card skips the review queue entirely (it is the owner's own; there is nothing for
//      an approver to pass), and the queue's lists leave it out, so not even review staff browse a minor's private work.
//
// The URL test is bucket-agnostic on purpose: it holds even when the bucket env is unset or renamed, and it errs towards
// "private" (any storage.googleapis.com URL whose first path segment after the bucket is private/).

import type { Discipline } from '@/lib/creator/creative-card-types';

export type MediaKind = 'audio' | 'image';

/** Which media a creator who is not a verified 18+ may upload, per discipline. Absent = nothing. */
export const TEEN_PRIVATE_UPLOADS: Readonly<Partial<Record<Discipline, readonly MediaKind[]>>> = {
  music: ['audio', 'image'],
  art: ['image'],
  cooking: ['image'],
  writing: ['image'],
  fashion: ['image'],
};

export const TEEN_ACTING_LINE = 'Voice lines are for creators 18 and over. Nothing you record leaves this device.';
export const TEEN_PRIVATE_LINE = 'Saved to your private area: only you can hear or see it. Nothing in it is ever public.';

export type TeenUploadGate = { ok: true } | { ok: false; error: 'device_only'; message: string };

/** May a creator who is not a verified 18+ upload this kind of file for this discipline? */
export function teenUploadGate(input: { discipline: unknown; kind: MediaKind }): TeenUploadGate {
  const d = typeof input.discipline === 'string' ? input.discipline : '';
  if (d === 'acting') return { ok: false, error: 'device_only', message: TEEN_ACTING_LINE };
  const allowed = (TEEN_PRIVATE_UPLOADS as Record<string, readonly MediaKind[] | undefined>)[d];
  if (!allowed || !allowed.includes(input.kind)) {
    return {
      ok: false, error: 'device_only',
      message: input.kind === 'audio'
        ? 'Under 18, songs upload to your private area from a music card only. Nothing else leaves this device.'
        : 'Uploads are for creators 18 and over. Your work stays on this device.',
    };
  }
  return { ok: true };
}

const PRIVATE_URL = /^https:\/\/storage\.googleapis\.com\/[^/?#]+\/private\//i;

/** Is this URL an owner-only private upload? (Also catches an encoded slash, so a disguised name still counts.) */
export function isPrivateMediaUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  let u = url.trim();
  try { u = decodeURIComponent(u); } catch { /* keep the raw string: a malformed escape is still tested as written */ }
  return PRIVATE_URL.test(u) || PRIVATE_URL.test(url.trim());
}

/**
 * Does this card payload carry any owner-only private upload, in ANY field (not only the known media fields, so a URL
 * tucked into a new or unexpected field still counts)? Such a card is private for good. No storage import: this file
 * stays safe for client bundles.
 */
export function cardHasPrivateMedia(art: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): boolean => {
    if (typeof v === 'string') return isPrivateMediaUrl(v);
    if (!v || typeof v !== 'object' || depth > 6 || seen.has(v)) return false;
    seen.add(v);
    return Object.values(v as Record<string, unknown>).some((x) => walk(x, depth + 1));
  };
  return walk(art, 0);
}

/** The private object name inside one of this owner's private URLs, or null (another owner's, or not private). */
export function privateObjectOfOwner(url: string, ownerSeg: string): string | null {
  const m = /^https:\/\/storage\.googleapis\.com\/[^/?#]+\/(private\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-]{1,80}\.[a-z0-9]{2,5})$/.exec(url);
  if (!m) return null;
  return m[1].startsWith(`private/${ownerSeg}/`) ? m[1] : null;
}

/** The id segment the upload route writes into an object name for this user. */
export const ownerSegment = (userId: string): string => userId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
