// TRACK 3, CHARACTERS (docs/NEXUS-STUDIO.md §3): a project character IS a Closet share code (lib/creator/look/shareCode),
// the same text the Closet's "Share" makes and its "Paste" reads. A venue CASTS one as its player; the mode wears it through
// playerIdentity — the one pipe every spawn already dresses through (CharacterLibrary.spawn resolves the identity, picks the
// body file for it and applies it) — so a Studio character is not a second character system.
//
// The code is decoded in the Studio (decodeSlotCode is async: a FEL2 code is deflated) and the venue export carries the
// DECODED look (the Creator doc, the face presets, the body), so the mode's side is synchronous and re-sanitises it with the
// Closet's own sanitisers (sanitizeCreatorDoc / sanitizeLookBase / sanitizeFaceSliders).
//
// HEIGHT AND BUILD (owner 2026-10-14, "Own height and build"; was `proportions: null` everywhere). A share code carries the
// character's frame (heightScale / buildScale, clamped to playFrame.COSMETIC_CLAMP by the Closet's sanitiser), and a cast now
// wears it — VISUAL ONLY. The scoring-fairness review (docs/NEXUS-STUDIO.md §10.5) measured every place a body's scale could reach
// gameplay in the modes a cast can play; the frame is worn only where that review found the mode's outcomes read none of it
// (targets.ts `castFrame`), and even there playFrame.playScales still spawns every body at exactly 1.0 in a ranked session or a
// STANDARD_FRAME_MODES mode. Anywhere else the cast keeps the standard frame (`proportions: null`), with the reason in targets.ts.
// Never the Closet's Studio/photo `presentation` size (that is the Closet's stage only) and never reach (frozen at 1).
// The rest is presentation as before — the face, the skin, the hair, the Creator's parts, paint and clothes, the kit colours.
//
// Pure (no Babylon): tested in node.

import { decodeSlotCode, MAX_SHARE_CODE_CHARS, type DecodeError } from '@/lib/creator/look/shareCode';
import { sanitizeCreatorDoc, sanitizeLookBase, sanitizeSlotFrame, type LookBase } from '@/lib/creator/look/sanitize';
import { effectivePalette } from '@/lib/creator/look/palette';
import type { CreatorDoc, SlotFrame } from '@/lib/creator/look/doc';
import { defaultFace, sanitizeFaceSliders, type FaceConfig } from '@/lib/closet/wearable-catalog';
import type { PlayerIdentity } from '@/lib/babylon/core/playerIdentity';
import type { StudioCharacter, StudioProject, StudioVenue } from './doc';

/** A cast slot a venue can fill. One today (the player); a rival / crowd casting is the next step. */
export const CAST_SLOTS = ['player'] as const;
export type CastSlot = (typeof CAST_SLOTS)[number];

export interface CastMember {
  name: string; body: 'male' | 'female'; doc: CreatorDoc; base: LookBase; sliders?: Record<string, number>;
  /** The character's own height and build (multipliers, inside COSMETIC_CLAMP). Absent: the standard frame. */
  frame?: SlotFrame;
}
/** Which frame a cast wears where it plays: its own (visual only, where the fairness review allows it) or the standard one. */
export type CastFrame = 'own' | 'standard';
export type ExportCast = Partial<Record<CastSlot, CastMember>>;

/** The share-code shape (the full decode is decodeSlotCode's): FEL<version>.<base64url>.<checksum>. */
export const SHARE_CODE_RE = /^FEL\d{1,3}\.[A-Za-z0-9_-]+\.[0-9a-z]{7}$/;
export const looksLikeCode = (s: unknown): s is string => typeof s === 'string' && s.length <= MAX_SHARE_CODE_CHARS && SHARE_CODE_RE.test(s.replace(/\s+/g, ''));

export const CODE_ERRORS: Record<DecodeError, string> = {
  empty: 'Paste a share code from the Closet.',
  too_long: 'That code is too long to be a Closet look.',
  not_a_code: 'That is not a Closet share code.',
  unsupported_version: 'That code was made by a newer FEL — this browser cannot read it.',
  corrupt: 'That code is damaged (a letter is missing or changed).',
  invalid: 'That code does not hold a look this Studio can read.',
};

/** A character's code → the look a venue export carries, or why not. */
export async function decodeCharacter(c: Pick<StudioCharacter, 'name' | 'lookCode'>): Promise<{ ok: true; member: CastMember } | { ok: false; error: string }> {
  if (!c.lookCode) return { ok: false, error: CODE_ERRORS.empty };
  const r = await decodeSlotCode(c.lookCode);
  if (!r.ok) return { ok: false, error: CODE_ERRORS[r.error] };
  const sliders = r.slot?.sliders ? sanitizeFaceSliders(r.slot.sliders) : undefined;
  const frame = sanitizeSlotFrame(r.slot?.frame);
  return { ok: true, member: { name: c.name, body: r.slot?.body === 'female' ? 'female' : 'male', doc: r.doc, base: r.base, ...(sliders && Object.keys(sliders).length ? { sliders: sliders as Record<string, number> } : {}), ...(frame ? { frame } : {}) } };
}

/** The decoded cast for a venue (characters that will not decode are left out, never half-applied). */
export async function resolveCast(p: Pick<StudioProject, 'characters'>, v: Pick<StudioVenue, 'cast'>): Promise<ExportCast | null> {
  const out: ExportCast = {};
  for (const slot of CAST_SLOTS) {
    const id = v.cast?.[slot];
    const c = id ? p.characters.find((x) => x.id === id) : null;
    if (!c) continue;
    const r = await decodeCharacter(c);
    if (r.ok) out[slot] = r.member;
  }
  return Object.keys(out).length ? out : null;
}

/** The mode's side: untrusted JSON → a cast member, through the Closet's own sanitisers. */
export function sanitizeCastMember(raw: unknown): CastMember | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const x = raw as Record<string, unknown>;
  const doc = sanitizeCreatorDoc(x.doc);
  if (!doc) return null;
  const name = typeof x.name === 'string' ? x.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) || 'Character' : 'Character';
  const sliders = x.sliders ? sanitizeFaceSliders(x.sliders) : undefined;
  const frame = sanitizeSlotFrame(x.frame);   // clamped to COSMETIC_CLAMP: an export cannot carry a giant
  return { name, body: x.body === 'female' ? 'female' : 'male', doc, base: sanitizeLookBase(x.base), ...(sliders && Object.keys(sliders).length ? { sliders: sliders as Record<string, number> } : {}), ...(frame ? { frame } : {}) };
}

export function sanitizeCast(raw: unknown): ExportCast | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const out: ExportCast = {};
  for (const slot of CAST_SLOTS) { const m = sanitizeCastMember((raw as Record<string, unknown>)[slot]); if (m) out[slot] = m; }
  return Object.keys(out).length ? out : null;
}

/** The kit colours a body wears before any Creator colour (playerIdentity's FALLBACK_PALETTE). */
export const CAST_BASE_PALETTE = { jersey: '#00E5FF', shorts: '#0b1220', shoes: '#A855F7', accent: '#FFD700' } as const;

/**
 * A cast member as the PlayerIdentity every spawn dresses through. `custom: true` (it is a chosen look); no worn catalog items
 * (a code never carries ownership). `frame: 'own'` wears the character's height and build as `proportions` (reach 1, the
 * athletic stance) — applyIdentity then clamps them again and playScales zeroes them in a ranked or standard-frame mode;
 * `'standard'` (the default, for any caller that does not know where the body plays) is `proportions: null` (see the header).
 */
export function castIdentity(m: CastMember, o: { frame?: CastFrame } = {}): PlayerIdentity {
  const face: FaceConfig = { ...defaultFace(), ...m.base, ...(m.sliders ? { sliders: { ...m.sliders } } : {}) };
  const palette = effectivePalette({ ...CAST_BASE_PALETTE }, m.doc.colours);
  const frame = o.frame === 'own' ? sanitizeSlotFrame(m.frame) : undefined;
  return {
    proportions: frame
      ? { heightScale: frame.heightScale, buildScale: frame.buildScale, reachScale: 1, palette: { skin: face.skinTone, primary: palette.jersey, accent: palette.accent }, stance: 'athletic' }
      : null,
    face,
    palette,
    jersey: null,
    wardrobe: { tops: null, shorts: null, shoes: null },
    custom: true,
    body: m.body === 'female' ? 'kit-female' : 'kit-male',
    card: null,
    creator: m.doc,
    accessories: [],
    wornParts: [],
  };
}
