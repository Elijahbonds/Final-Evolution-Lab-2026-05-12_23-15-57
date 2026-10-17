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
// THE CROWD (studio-4b, §12): project characters seated AMONG THE FANS — visual only. A venue may name up to LIMITS.crowdCast
// characters; each takes an EMPTY seat of the venue's own stands (a gap the crowd's layout left, so no fan is moved or hidden and
// the crowd system is not touched), nearest the play camera's eye first, never past the card distance and never in front of the
// camera line. A packed stand has no gap: the cast stands at a row's end instead (the aisle). Nothing a fan does reaches play.
//
// THE RIVAL is not a slot here, by decision (§12): the rival is a roster body the MODE spawns (a tinted spawn → the roster's pick
// and rotation, its own name and look); casting it needs the mode and the roster to hand that choice over — a code change in the
// mode, not data. That is the owner's call, recorded, not built.
//
// Pure (no Babylon): tested in node.

import { decodeSlotCode, MAX_SHARE_CODE_CHARS, type DecodeError } from '@/lib/creator/look/shareCode';
import { sanitizeCreatorDoc, sanitizeLookBase, sanitizeSlotFrame, type LookBase } from '@/lib/creator/look/sanitize';
import { effectivePalette } from '@/lib/creator/look/palette';
import type { CreatorDoc, SlotFrame } from '@/lib/creator/look/doc';
import { defaultFace, sanitizeFaceSliders, type FaceConfig } from '@/lib/closet/wearable-catalog';
import type { PlayerIdentity } from '@/lib/babylon/core/playerIdentity';
import { LIMITS, type StudioCharacter, type StudioProject, type StudioVenue, type V3 } from './doc';
import { CARD_BEYOND_M, layoutSeats, lerpAngle, pastLine, standPoint, type CrowdVenue, type StandSpec } from '../babylon/visual/crowd/crowdLayout';
import type { ExportCrowd } from './exportVenue';

/** A cast slot a venue fills with ONE character: the player. The crowd is a short list (`crowd`, below); the rival is not a slot. */
export const CAST_SLOTS = ['player'] as const;
export type CastSlot = (typeof CAST_SLOTS)[number];
/** How many characters a venue may seat among its fans (each is a real skinned body). */
export const CROWD_CAST_MAX = LIMITS.crowdCast;

export interface CastMember {
  name: string; body: 'male' | 'female'; doc: CreatorDoc; base: LookBase; sliders?: Record<string, number>;
  /** The character's own height and build (multipliers, inside COSMETIC_CLAMP). Absent: the standard frame. */
  frame?: SlotFrame;
}
/** Which frame a cast wears where it plays: its own (visual only, where the fairness review allows it) or the standard one. */
export type CastFrame = 'own' | 'standard';
export type ExportCast = Partial<Record<CastSlot, CastMember>> & { /** studio-4b: seated among the fans, visual only */ crowd?: CastMember[] };

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
  const crowd: CastMember[] = [];
  for (const id of (v.cast?.crowd ?? []).slice(0, CROWD_CAST_MAX)) {
    const c = p.characters.find((x) => x.id === id);
    if (!c) continue;
    const r = await decodeCharacter(c);
    if (r.ok) crowd.push(r.member);
  }
  if (crowd.length) out.crowd = crowd;
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
  const rawCrowd = (raw as Record<string, unknown>).crowd;
  const crowd: CastMember[] = [];
  for (const x of Array.isArray(rawCrowd) ? rawCrowd : []) { if (crowd.length >= CROWD_CAST_MAX) break; const m = sanitizeCastMember(x); if (m) crowd.push(m); }
  if (crowd.length) out.crowd = crowd;
  return Object.keys(out).length ? out : null;
}

// ── the crowd's seats (studio-4b) ───────────────────────────────────────────────────────────────────────────────────

/** The crowd the mode mounts from an export's stands — the same mapping as runtime.ts mountCrowdLayer (castSeats.test holds the
 *  seat count to the mounted crowd's), so the seats laid here are the seats the crowd lays. */
export function crowdVenueOf(crowd: ExportCrowd): CrowdVenue {
  return {
    stands: crowd.stands.map((s): StandSpec => ({ id: `studio_${s.id}`, front: [...s.front] as V3, yaw: s.yaw, width: s.width, rows: s.rows, step: [...s.step] as [number, number], posture: s.posture, benches: s.benches, gaps: s.gaps })),
    focus: [...crowd.focus] as V3, eye: [...crowd.eye] as V3,
    camera: { at: [...crowd.camera.at] as V3, into: [...crowd.camera.into] as [number, number], margin: crowd.camera.margin },
  };
}

export interface CastSeat {
  pos: V3; yaw: number; posture: StandSpec['posture']; stand: string; /** 'gap': an empty seat; 'aisle': a row's end */ kind: 'gap' | 'aisle';
  /** studio-5: where along its row, 0..1 — the crowd's reaction ripple (crowdReact.delayFor) reaches it there */
  along?: number;
}

/** The crowd layout's seed (crowdStands.mountCrowd's default): the gaps are the ones the mounted crowd leaves. */
export const CROWD_SEED = 11;
/** Two cast fans sit at least this far apart (m): spread through the stand, not a clump. */
export const CAST_SPACING_M = 1.5;
/** A seat the play camera sees: within this half-angle (radians) of the camera line's direction into the play. The nearest seats
 *  to the eye are the stands' near ends, which a camera looking down the court never frames (seen in the Tiebreak play-test). */
export const CAST_VIEW_HALF_ANGLE = (35 * Math.PI) / 180;

/** Pure: is a point inside the play camera's view cone (horizontal), from the venue's camera line? */
export function inPlayView(p: readonly number[], camera: { at: readonly number[]; into: readonly [number, number] }, half = CAST_VIEW_HALF_ANGLE): boolean {
  const dx = p[0] - camera.at[0], dz = p[2] - camera.at[2];
  const l = Math.hypot(dx, dz), li = Math.hypot(camera.into[0], camera.into[1]) || 1;
  if (!l) return false;
  return (dx * camera.into[0] + dz * camera.into[1]) / (l * li) >= Math.cos(half);
}

/**
 * Where `n` cast characters sit among the fans. Pure and deterministic. The empty seats are the crowd's OWN gaps: the same layout
 * with no gaps, less the seats the crowd fills (same seed, same seat order). Seats the play camera frames first (inPlayView), then
 * the rest; nearest the eye first within each; inside the card distance, at least CAST_SPACING_M apart; a packed stand offers its
 * rows' ends (the aisle) instead, past the camera line like every seat.
 */
export function crowdCastSeats(crowd: ExportCrowd | null | undefined, n: number, seed = CROWD_SEED): CastSeat[] {
  if (!crowd?.stands.length || n <= 0) return [];
  const venue = crowdVenueOf(crowd);
  const key = (s: { stand: string; row: number; along: number }) => `${s.stand}|${s.row}|${s.along.toFixed(5)}`;
  const filled = new Set(layoutSeats(venue, seed).map(key));
  const all = layoutSeats({ ...venue, stands: venue.stands.map((s) => ({ ...s, gaps: 0 })) }, seed);
  const face = (st: StandSpec, pos: V3) => lerpAngle(st.yaw, Math.atan2(venue.focus[0] - pos[0], venue.focus[2] - pos[2]), 0.7);
  const byId = new Map(venue.stands.map((st) => [st.id, st]));
  const gaps: CastSeat[] = all.filter((s) => !filled.has(key(s)) && s.dist <= CARD_BEYOND_M)
    .map((s) => ({ pos: s.pos, yaw: face(byId.get(s.stand)!, s.pos), posture: s.posture, stand: s.stand, kind: 'gap' as const, along: s.along, dist: s.dist }));
  const aisles: Array<CastSeat & { dist: number }> = [];
  for (const st of venue.stands) {
    for (let r = st.firstRow ?? 0; r < st.rows; r++) {
      for (const side of [-1, 1]) {
        const pos = standPoint(st, side * (st.width / 2 + 0.45), r);
        if (pastLine(pos, venue.camera) < venue.camera.margin) continue;
        const dist = Math.hypot(pos[0] - venue.eye[0], pos[1] - venue.eye[1], pos[2] - venue.eye[2]);
        if (dist <= CARD_BEYOND_M) aisles.push({ pos, yaw: face(st, pos), posture: st.posture, stand: st.id, kind: 'aisle', along: side < 0 ? 0 : 1, dist });
      }
    }
  }
  const out: CastSeat[] = [];
  const far = (p: V3) => out.every((o) => Math.hypot(o.pos[0] - p[0], o.pos[1] - p[1], o.pos[2] - p[2]) >= CAST_SPACING_M);
  const seen = (s: { pos: V3 }) => inPlayView(s.pos, venue.camera);
  const sorted = aisles.sort((a, b) => a.dist - b.dist);
  for (const pool of [gaps.filter(seen), gaps.filter((s) => !seen(s)), sorted.filter(seen), sorted.filter((s) => !seen(s))]) {
    for (const s of pool) {
      if (out.length >= n) break;
      if (!far(s.pos)) continue;
      out.push({ pos: s.pos, yaw: s.yaw, posture: s.posture, stand: s.stand, kind: s.kind, ...(s.along !== undefined ? { along: s.along } : {}) });
    }
  }
  return out;
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
