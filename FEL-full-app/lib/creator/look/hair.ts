// CODE-BUILT HAIR — the pure half (2026-10-07; owner: the hair expansion, four packs, every style its own silhouette).
// No Babylon: the Hair tab, the randomiser and the renderer (lib/babylon/creator/hair) all read it, so the editor can never
// offer a style or an accessory the renderer would then drop.
//
// THE STYLE is FaceConfig.hairStyle (lib/closet/wearable-catalog HAIR_STYLES — the allow-list, append only), grouped here
// into the owner's four packs. THE EXTRAS (a second colour, accessories, a beard) are the CreatorDoc's `hair` block
// (doc.ts CreatorHair). `resolveHair` folds both, and what the doc hides, into the one record the renderer builds from.
//
// INCLUSIVE BY DESIGN. The textured and protective styles are the first pack, each built as what it is (a loc is a rope, a
// cornrow a braid lying on the scalp in a row with the parting showing, a bantu knot a coil), never a cap with a new name.
// A covering (hijab, durag, headwrap) is cloth: the hair colour picks its colour, the second colour its trim.

import { HAIR_STYLES } from '../../closet/wearable-catalog';
import {
  BEARD_STYLES, HAIR_ACCS, HAIR_DEFAULTS, HAIR_TONES, MAX_HAIR_ACCS,
  type BeardStyle, type CreatorDoc, type CreatorHair, type HairAcc, type HairTone,
} from './doc';
import { sanitizeHairExtras } from './sanitize';
import { hoodUp } from './clothes';

export const HAIR_PACKS = [
  { id: 'textured', label: 'Textured & protective', styles: ['Afro', 'Box Braids', 'Locs', 'Cornrows', 'Twists', 'Bantu Knots', 'Afro Puffs', 'Durag', 'Headwrap', 'Hijab'] },
  { id: 'cuts', label: 'Fades & cuts', styles: ['Fade', 'Buzz', 'Cropped', 'Waves', 'High-Top Fade', 'Taper', 'Drop Fade', 'Mohawk', 'Frohawk', 'Bald'] },
  { id: 'long', label: 'Long & tied', styles: ['Curly', 'Straight', 'Wavy', 'Long Layered', 'Bob', 'Bun', 'Ponytail', 'Top Knot', 'Space Buns', 'Pigtails', 'Braided Ponytail'] },
  { id: 'flair', label: 'Game flair', styles: ['Spiky', 'Swept', 'Mullet', 'Streaks'] },
] as const;
export type HairPackId = typeof HAIR_PACKS[number]['id'];

/** The pack a style is in (null for a name the catalog does not know). */
export function packOf(style: string): HairPackId | null {
  return HAIR_PACKS.find((p) => (p.styles as readonly string[]).includes(style))?.id ?? null;
}

/** One line a player reads under a style (the picker's label is the style's own name). */
export const HAIR_STYLE_BLURB: Record<string, string> = {
  'Afro': 'Full, round, natural volume',
  'Box Braids': 'Long braids from square parts',
  'Locs': 'Rope locs to the shoulders',
  'Cornrows': 'Braided rows flat to the scalp',
  'Twists': 'Two-strand twists',
  'Bantu Knots': 'Coiled knots in sections',
  'Afro Puffs': 'Two puffs, tied high',
  'Durag': 'Tied silk durag with a tail',
  'Headwrap': 'Tall wrapped fabric',
  'Hijab': 'Covers hair and neck, open face',
  'Fade': 'Short top, faded sides',
  'Buzz': 'Even clipper cut',
  'Cropped': 'Short textured crop',
  'Waves': '360 waves, brushed flat',
  'High-Top Fade': 'Tall flat top, faded sides',
  'Taper': 'Short top, tapered nape',
  'Drop Fade': 'Fade dropping behind the ear, part line',
  'Mohawk': 'Shaved sides, a crest on top',
  'Frohawk': 'Textured crest, tapered sides',
  'Bald': 'No hair',
  'Curly': 'Shoulder-length curls',
  'Straight': 'Long and straight',
  'Wavy': 'Long soft waves',
  'Long Layered': 'Long with layers framing the face',
  'Bob': 'Chin length, rounded',
  'Bun': 'Low wrapped bun',
  'Ponytail': 'High ponytail',
  'Top Knot': 'A knot on the crown',
  'Space Buns': 'Two buns up top',
  'Pigtails': 'Two low tails',
  'Braided Ponytail': 'One long braid down the back',
  'Spiky': 'Gelled spikes',
  'Swept': 'Long fringe swept to the side',
  'Mullet': 'Short on top, long at the back',
  'Streaks': 'Jaw-length layers, dyed streaks',
};

/** Coverings: cloth, not hair. The hair colour is the fabric's colour; the second colour is its trim. */
export const COVERING_STYLES: ReadonlySet<string> = new Set(['Hijab', 'Durag', 'Headwrap']);
export const isCovering = (style: string): boolean => COVERING_STYLES.has(style);

/** Where each accessory fits. A style not listed for an accessory never draws it (the editor greys it out, the renderer
 *  skips it), so a saved accessory survives a style change and comes back on a style it fits. */
export const HAIR_ACC_FIT: Record<HairAcc, readonly string[]> = {
  beads: ['Box Braids', 'Locs', 'Twists', 'Cornrows', 'Braided Ponytail'],
  cuffs: ['Box Braids', 'Locs', 'Twists', 'Braided Ponytail'],
  clips: ['Straight', 'Wavy', 'Curly', 'Bob', 'Long Layered', 'Swept', 'Streaks', 'Mullet', 'Pigtails', 'Ponytail', 'Bun'],
  headband: HAIR_STYLES.filter((s) => !COVERING_STYLES.has(s)),
  ties: ['Ponytail', 'Braided Ponytail', 'Pigtails', 'Afro Puffs', 'Bun', 'Top Knot', 'Space Buns'],
};
export const accFits = (acc: HairAcc, style: string): boolean => HAIR_ACC_FIT[acc].includes(style);

/** How freely each style's hanging hair sways (0 = rigid; renderHair hands it to the swing spring, parts/swing.ts).
 *  TUNED (2026-10-07, first guesses — the owner's eye is the judge): long tails and ropes the most, a bob a little, puffs
 *  only a bounce. A style not listed does not sway. */
export const HAIR_SWAY: Record<string, number> = {
  'Locs': 0.55, 'Box Braids': 0.55, 'Twists': 0.5, 'Cornrows': 0.35, 'Ponytail': 0.7, 'Braided Ponytail': 0.6, 'Pigtails': 0.65,
  'Afro Puffs': 0.2, 'Straight': 0.35, 'Wavy': 0.35, 'Curly': 0.3, 'Long Layered': 0.35, 'Mullet': 0.4, 'Bob': 0.15,
  'Durag': 0.6, 'Streaks': 0.3,
};

export const HAIR_TONE_LABELS: Record<HairTone, string> = { tips: 'Tips', streaks: 'Streaks', top: 'Dyed top', under: 'Under-layer' };
export const HAIR_ACC_LABELS: Record<HairAcc, string> = { beads: 'Beads', cuffs: 'Cuffs', clips: 'Clips', headband: 'Headband', ties: 'Hair ties' };
export const BEARD_LABELS: Record<BeardStyle, string> = {
  stubble: 'Stubble', short: 'Short boxed', full: 'Full', long: 'Long', goatee: 'Goatee', chinstrap: 'Chin strap', mustache: 'Mustache',
};

/** A name the renderer knows, else the catalog's fallback (an older client's unknown name renders like today's cap). */
export const FALLBACK_HAIR_STYLE = 'Straight';
export function knownStyle(style: string | null | undefined): string {
  return typeof style === 'string' && (HAIR_STYLES as readonly string[]).includes(style) ? style : FALLBACK_HAIR_STYLE;
}

// ── what the renderer builds from ────────────────────────────────────────────────────────────────────────────────────

export interface ResolvedHair {
  /** a HAIR_STYLES name ('Bald' when the doc hides the hair) */
  style: string;
  colour: string;
  colour2: string | null;
  tone: HairTone;
  /** only the accessories that fit this style */
  acc: HairAcc[];
  accColour: string;
  beard: BeardStyle | null;
  beardColour: string;
  /** the skin, for a fade's shaved sides and a part line */
  skin: string;
}

const HEX = /^#[0-9A-F]{6}$/i;
const hexOr = (v: unknown, fb: string) => (typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : fb);

/** The face's hair and the doc's extras as one record. `hideHair` (doc flags.hide hair / head) takes the hair off but keeps
 *  the beard unless the whole head is hidden. */
export function resolveHair(
  face: { hairStyle?: string | null; hairColor?: string | null; skinTone?: string | null },
  doc: Pick<CreatorDoc, 'hair'> | null | undefined,
  hide: { hair?: boolean; head?: boolean } = {},
): ResolvedHair {
  const extras = sanitizeHairExtras(doc?.hair) ?? {};
  const style = hide.hair || hide.head ? 'Bald' : knownStyle(face.hairStyle);
  const colour = hexOr(face.hairColor, '#2B1B0E');
  return {
    style, colour,
    colour2: extras.colour2 ?? null,
    tone: extras.tone ?? HAIR_DEFAULTS.tone,
    acc: (extras.acc ?? []).filter((a) => accFits(a, style)),
    accColour: extras.accColour ?? HAIR_DEFAULTS.accColour,
    beard: hide.head ? null : extras.beard ?? null,
    beardColour: extras.beardColour ?? colour,
    skin: hexOr(face.skinTone, '#C68642'),
  };
}

/** The doc's hair block with a change merged and re-sanitised (an emptied block is removed, so an untouched look carries
 *  nothing). Pure: returns a new doc. */
export function withHairExtras<D extends Pick<CreatorDoc, 'hair'>>(doc: D, patch: Partial<Record<keyof CreatorHair, unknown>>): D {
  const merged: Record<string, unknown> = { ...(doc.hair ?? {}) };
  for (const [k, v] of Object.entries(patch)) { if (v === undefined || v === null) delete merged[k]; else merged[k] = v; }
  const hair = sanitizeHairExtras(merged);
  const out = { ...doc };
  if (hair) out.hair = hair; else delete out.hair;
  return out;
}

/** Toggle one accessory (at most MAX_HAIR_ACCS; adding past it drops the oldest in list order). */
export function toggleAcc(list: readonly HairAcc[] | undefined, acc: HairAcc): HairAcc[] {
  const cur = new Set(list ?? []);
  if (cur.has(acc)) cur.delete(acc);
  else {
    cur.add(acc);
    while (cur.size > MAX_HAIR_ACCS) cur.delete([...cur].find((a) => a !== acc)!);
  }
  return HAIR_ACCS.filter((a) => cur.has(a));
}

// ── what covers the hair ─────────────────────────────────────────────────────────────────────────────────────────────

/** Creator part shapes that cover the head when placed on it. */
const COVER_SHAPES = new Set(['helmet', 'hood', 'maskShell']);
/**
 * What the worn things do to the hair: 'hide' under a raised hood or a helmet / hood / mask part on the head (the beard
 * stays), 'compress' under store headwear that sits on it — the Flow Headband (accessory 'headband') or a worn part such
 * as the Nexus Visor — so a tall style is pressed down, never through the band; else 'none'. Pure; the renderer reads it.
 */
export function hairCover(
  doc: Pick<CreatorDoc, 'clothes' | 'parts'> | null | undefined,
  worn: { accessories?: readonly string[] | null; wornParts?: readonly { bone: string }[] | null } = {},
): 'none' | 'compress' | 'hide' {
  // a part big enough to be a covering (parts/shapes.ts builds these head-sized, 10 cm round, at scale 1; a small helmet
  // charm on the head does not count)
  const covered = (doc?.parts ?? []).some((p) => p.bone === 'Head' && COVER_SHAPES.has(p.shape) && Math.min(p.scale[0], p.scale[2]) >= 0.85);
  if (hoodUp(doc?.clothes) || covered) return 'hide';
  const band = (worn.accessories ?? []).includes('headband') || (worn.wornParts ?? []).some((p) => p.bone === 'Head');
  return band ? 'compress' : 'none';
}

// ── randomise (the face tab's hair section) ──────────────────────────────────────────────────────────────────────────

/** Never handed out by a dice: a religious covering is a choice a player makes (randomise.ts' rule, extended to the
 *  headwrap — assumption: some wear it as a religious covering too). */
export const NOT_ROLLED_HAIR: ReadonlySet<string> = new Set(['Hijab', 'Headwrap']);
const pickFrom = <T>(list: readonly T[], rnd: () => number): T => list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];

/** The extras a roll gives a style: a beard sometimes, a second colour now and then, an accessory that fits. Pure.
 *  TUNED (2026-10-07): beard 35 %, a second colour 20 %, an accessory 25 % (where one fits). */
export function randomHairExtras(style: string, colour: string, rnd: () => number): CreatorHair | undefined {
  const raw: Record<string, unknown> = {};
  if (rnd() < 0.35) raw.beard = pickFrom(BEARD_STYLES, rnd);
  if (rnd() < 0.2) { raw.colour2 = pickFrom(['#E4C590', '#B0B0B0', '#C68642', '#00E5FF', '#A855F7', '#FF3366', '#F2EEE6'], rnd); raw.tone = pickFrom(HAIR_TONES, rnd); }
  const fits = HAIR_ACCS.filter((a) => accFits(a, style) && a !== 'headband');
  if (fits.length && rnd() < 0.25) raw.acc = [pickFrom(fits, rnd)];
  if (raw.colour2 === colour) delete raw.colour2;
  return sanitizeHairExtras(raw);
}
