/**
 * rivalWear — what each forge rival wears (style pass, owner 2026-10-16: "There needs to be a clothing/ style pass. More casual,
 * like the meshy models"; decisions S1-S4, ~/Claude/outbox/hoops-gameplay/style-pass/DECISIONS-STYLE-2026-10-16.md).
 *
 * The first forge build dressed all 24 in the kit's court uniform: one keyhole tank, the short jean short, a tee nobody saw.
 * The Meshy rivals they replaced looked like people who came to play — printed tees and jerseys, long baggy shorts, cargos,
 * a sleeve, a headband, a chain. So each rival now carries ONE outfit (a single garment per kit slot: applyKit shows the slot's
 * only garment whatever the sport's default names, S1), and that outfit is theirs:
 *   tops     a printed tee (13), a numbered sleeveless jersey (9, the tee cut at the shoulder in Blender), a polo (2) — prints are
 *            our own words and shapes (rivalPrints.mts)
 *   bottoms  the baggy knee-length short (17, made in Blender from the fitted cargo pant: style.py), the cargo pant (5), the
 *            jean short (2)
 *   shoes    sneakers with crew socks only (MakeHuman shoes02 / 05 / 06; the brown leather shoes01 is gone)
 *   look     an accessory signature (headband, wristbands, a sleeve, a chain) baked into the body, so a rival wears the same
 *            things every night (the runtime deal gave them a seeded set off whatever name the spawn passed)
 * The colours are the colourway the build bakes (`jersey`, `shorts`); a dealt fit or the 3v3 team colour on the top tints the
 * same cloth at runtime, and the tonal prints read through any of them (style.py). Pure data: no I/O here.
 */
import type { FrontPrint, BackPrint } from './rivalPrints.mts';

export type TopKind = 'tee' | 'tank' | 'polo';
export type BottomKind = 'baggy' | 'cargo' | 'jeanShort';
/** A print band (style.py's layers): `hem`, `sleeve`, `yoke` on a top; `stripe` (round the leg's bone axis) and `hem` on a bottom. */
export type Band =
  | { kind: 'hem'; width: number; ink: number; from?: number }
  | { kind: 'sleeve'; width: number; ink: number; from?: number }
  | { kind: 'yoke'; above?: number; ink: number }
  | { kind: 'stripe'; half: number; gap?: number; ink: number };

export interface RivalLook { items: readonly string[]; accent: string; side: 'Left' | 'Right' }
export interface RivalWear {
  top: TopKind; front: FrontPrint; back: BackPrint; topBands?: readonly Band[];
  bottom: BottomKind; bottomBands?: readonly Band[];
  /** [shoes_evo (the court's), shoes_flight (the field's)] */
  shoes: readonly [string, string];
  /** the colourway: the top's cloth and the bottom's */
  jersey: string; shorts: string;
  look: RivalLook;
}

/** The MakeHuman garment a kind is cut from, by the body's sex. */
export function garmentFor(kind: TopKind | BottomKind, sex: 'male' | 'female', key: string): string {
  switch (kind) {
    case 'tee': return sex === 'male' ? 'elvs_crude_t-shirt_male' : (key.charCodeAt(0) % 2 ? 'toigo_basic_tucked_t-shirt' : 'joepal_crude_t-shirt_female');
    case 'tank': return garmentFor('tee', sex, key);   // the tee, its sleeves cut at the shoulder (style.py cut_sleeves): the library's only tank is the keyhole tank, a tiled leopard map
    case 'polo': return 'namuhekam_male_polo_shirt';
    case 'baggy': case 'cargo': return 'cortu_cargo_pants';
    case 'jeanShort': return 'cortu_jeans_shorts';
  }
}
/** The kit item ids the garments are named by (`Kit_<slot>_<itemId>`). */
export const TOP_ID: Record<TopKind, string> = { tee: 'top_tee', tank: 'top_jersey', polo: 'top_polo' };
export const BOTTOM_ID: Record<BottomKind, string> = { baggy: 'shorts_baggy', cargo: 'pants_cargo', jeanShort: 'shorts_jean' };
/** How much of a garment's own map survives under the print (style.py tonal_from's floor): the tops keep only a trace (MakeHuman's
 *  tees and polo are knitted, and at 0.62 the knit read as noise), the cargo its seams and pockets, the denim its weave. */
export const TONAL_LO: Record<TopKind | BottomKind, number> = { tee: 0.9, tank: 0.9, polo: 0.9, baggy: 0.74, cargo: 0.7, jeanShort: 0.62 };
/** The baggy short: cut this far under the knee, flared this far at the hem (metres). */
export const BAGGY = { below: 0.04, loosen: 0.045 } as const;
/** Sneakers only — MakeHuman shoes02 (trail), 05 (white), 06 (blue), each with a crew sock. */
export const SNEAKERS = ['shoes02', 'shoes05', 'shoes06'] as const;

const SLEEVE: Band = { kind: 'sleeve', width: 0.03, ink: 0.4 };
const HEM: Band = { kind: 'hem', width: 0.035, ink: 0.45 };
const YOKE: Band = { kind: 'yoke', above: 0.15, ink: 0.72 };
const STRIPE1: Band = { kind: 'stripe', half: 0.22, ink: 0.3 };
const STRIPE2: Band = { kind: 'stripe', half: 0.36, gap: 0.16, ink: 0.3 };
const LEG_HEM: Band = { kind: 'hem', width: 0.03, ink: 0.45 };

export const RIVAL_WEAR: Readonly<Record<string, RivalWear>> = {
  ace:   { top: 'tee',  front: { kind: 'emblem', shape: 'star', word: 'BLACKTOP' }, back: { n: 23, name: 'ACE' }, topBands: [SLEEVE], bottom: 'baggy', bottomBands: [STRIPE2, LEG_HEM], shoes: ['shoes06', 'shoes05'], jersey: '#f2f2ee', shorts: '#1d2a6b', look: { items: ['headband', 'wristbands'], accent: '#e63946', side: 'Right' } },
  blaze: { top: 'tank', front: { kind: 'number', n: 7, word: 'PICKUP' }, back: { n: 7, name: 'BLAZE' }, topBands: [HEM], bottom: 'baggy', bottomBands: [STRIPE1], shoes: ['shoes05', 'shoes02'], jersey: '#d63a3a', shorts: '#3a3d4a', look: { items: ['armsleeve'], accent: '#111418', side: 'Right' } },
  colt:  { top: 'tee',  front: { kind: 'word', text: 'NEXT UP' }, back: {}, topBands: [], bottom: 'cargo', shoes: ['shoes02', 'shoes06'], jersey: '#3f9a68', shorts: '#6b705c', look: { items: ['chain'], accent: '#f1a208', side: 'Left' } },
  dash:  { top: 'tee',  front: { kind: 'emblem', shape: 'bolt', word: 'FAST BREAK' }, back: { n: 4 }, topBands: [SLEEVE], bottom: 'baggy', bottomBands: [STRIPE2, LEG_HEM], shoes: ['shoes06', 'shoes02'], jersey: '#ffc23d', shorts: '#5b3b93', look: { items: ['headband', 'armsleeve'], accent: '#8d5bd6', side: 'Right' } },
  echo:  { top: 'tank', front: { kind: 'number', n: 11, word: 'SUNSET' }, back: { n: 11, name: 'ECHO' }, topBands: [HEM], bottom: 'baggy', bottomBands: [STRIPE1, LEG_HEM], shoes: ['shoes02', 'shoes06'], jersey: '#9566cc', shorts: '#e9e3d6', look: { items: ['wristbands'], accent: '#f1a208', side: 'Right' } },
  fable: { top: 'polo', front: { kind: 'none' }, back: {}, topBands: [YOKE], bottom: 'cargo', shoes: ['shoes05', 'shoes02'], jersey: '#6d7885', shorts: '#a68a64', look: { items: [], accent: '#1d3557', side: 'Right' } },
  grit:  { top: 'tank', front: { kind: 'number', n: 34, word: 'GRIND' }, back: { n: 34, name: 'GRIT' }, topBands: [HEM], bottom: 'baggy', bottomBands: [STRIPE2], shoes: ['shoes02', 'shoes05'], jersey: '#b04656', shorts: '#e8c547', look: { items: ['armsleeve', 'legsleeve'], accent: '#111418', side: 'Right' } },
  halo:  { top: 'tee',  front: { kind: 'word', text: 'OPEN RUN' }, back: {}, topBands: [SLEEVE], bottom: 'baggy', bottomBands: [STRIPE1, LEG_HEM], shoes: ['shoes06', 'shoes05'], jersey: '#1db3bd', shorts: '#14213d', look: { items: ['headband'], accent: '#f1a208', side: 'Right' } },
  jinx:  { top: 'tee',  front: { kind: 'stripes', count: 3 }, back: { n: 30 }, topBands: [], bottom: 'baggy', bottomBands: [STRIPE1], shoes: ['shoes02', 'shoes05'], jersey: '#ff7f50', shorts: '#2e2e33', look: { items: ['armsleeve'], accent: '#111418', side: 'Right' } },
  kite:  { top: 'tank', front: { kind: 'number', n: 3, word: 'SKYLINE' }, back: { n: 3, name: 'KITE' }, topBands: [HEM], bottom: 'baggy', bottomBands: [STRIPE2, LEG_HEM], shoes: ['shoes05', 'shoes06'], jersey: '#ec3d93', shorts: '#26262b', look: { items: ['headband', 'wristbands'], accent: '#111418', side: 'Left' } },
  lux:   { top: 'tee',  front: { kind: 'emblem', shape: 'crown', word: 'SHOWTIME' }, back: { n: 0, name: 'LUX' }, topBands: [SLEEVE], bottom: 'baggy', bottomBands: [STRIPE2, LEG_HEM], shoes: ['shoes06', 'shoes02'], jersey: '#ffd84f', shorts: '#1f4fa3', look: { items: ['headband', 'chain'], accent: '#e63946', side: 'Right' } },
  mako:  { top: 'tank', front: { kind: 'number', n: 50, word: 'FULL COURT' }, back: { n: 50, name: 'MAKO' }, topBands: [HEM], bottom: 'baggy', bottomBands: [STRIPE1], shoes: ['shoes05', 'shoes06'], jersey: '#36ab9c', shorts: '#d9d9d6', look: { items: ['legsleeve'], accent: '#1d3557', side: 'Right' } },
  nyx:   { top: 'tee',  front: { kind: 'word', text: 'LOCKDOWN' }, back: {}, topBands: [SLEEVE], bottom: 'cargo', shoes: ['shoes02', 'shoes06'], jersey: '#cf3a40', shorts: '#4a4a48', look: { items: ['armsleeve'], accent: '#111418', side: 'Left' } },
  orbit: { top: 'tee',  front: { kind: 'emblem', shape: 'sun', word: 'BOARDWALK' }, back: {}, topBands: [], bottom: 'cargo', shoes: ['shoes05', 'shoes02'], jersey: '#5f9497', shorts: '#7f6a4f', look: { items: [], accent: '#e76f51', side: 'Right' } },
  quill: { top: 'tee',  front: { kind: 'word', text: 'SPLASH' }, back: {}, topBands: [SLEEVE], bottom: 'jeanShort', shoes: ['shoes06', 'shoes05'], jersey: '#8fc4ca', shorts: '#4a6fa5', look: { items: ['wristbands'], accent: '#e76f51', side: 'Right' } },
  rook:  { top: 'polo', front: { kind: 'none' }, back: {}, topBands: [YOKE], bottom: 'baggy', bottomBands: [LEG_HEM], shoes: ['shoes05', 'shoes02'], jersey: '#9a93ad', shorts: '#e0914f', look: { items: ['headband'], accent: '#457b9d', side: 'Right' } },
  sol:   { top: 'tank', front: { kind: 'number', n: 9, word: 'NIGHT RUN' }, back: { n: 9, name: 'SOL' }, topBands: [HEM], bottom: 'baggy', bottomBands: [STRIPE2], shoes: ['shoes02', 'shoes06'], jersey: '#f46b63', shorts: '#34343a', look: { items: ['wristbands', 'armsleeve'], accent: '#111418', side: 'Right' } },
  tusk:  { top: 'tee',  front: { kind: 'emblem', shape: 'palm', word: 'WESTSIDE' }, back: {}, topBands: [], bottom: 'baggy', bottomBands: [STRIPE1, LEG_HEM], shoes: ['shoes06', 'shoes05'], jersey: '#e9ecef', shorts: '#7a1420', look: { items: ['chain'], accent: '#f1a208', side: 'Right' } },
  umber: { top: 'tank', front: { kind: 'number', n: 21, word: 'HOOPERS' }, back: { n: 21, name: 'UMBER' }, topBands: [HEM], bottom: 'baggy', bottomBands: [STRIPE2, LEG_HEM], shoes: ['shoes05', 'shoes02'], jersey: '#5f9a63', shorts: '#f2e8cf', look: { items: ['headband'], accent: '#e63946', side: 'Right' } },
  volt:  { top: 'tee',  front: { kind: 'emblem', shape: 'bolt', word: 'SKY HIGH' }, back: { n: 1 }, topBands: [SLEEVE], bottom: 'baggy', bottomBands: [STRIPE2, LEG_HEM], shoes: ['shoes06', 'shoes02'], jersey: '#5fd0f2', shorts: '#23233a', look: { items: ['armsleeve', 'legsleeve'], accent: '#2a9d8f', side: 'Right' } },
  wisp:  { top: 'tee',  front: { kind: 'emblem', shape: 'wave', word: 'SALT AIR' }, back: {}, topBands: [], bottom: 'jeanShort', shoes: ['shoes05', 'shoes06'], jersey: '#c4389f', shorts: '#4f74a8', look: { items: [], accent: '#2a9d8f', side: 'Left' } },
  yara:  { top: 'tank', front: { kind: 'number', n: 12, word: 'DAWN' }, back: { n: 12, name: 'YARA' }, topBands: [HEM], bottom: 'baggy', bottomBands: [STRIPE1, LEG_HEM], shoes: ['shoes02', 'shoes06'], jersey: '#ffa93a', shorts: '#2ec4b6', look: { items: ['wristbands'], accent: '#457b9d', side: 'Right' } },
  zeal:  { top: 'tee',  front: { kind: 'emblem', shape: 'flame', word: 'HEAT CHECK' }, back: {}, topBands: [SLEEVE], bottom: 'cargo', shoes: ['shoes02', 'shoes05'], jersey: '#c9c9c9', shorts: '#34363d', look: { items: ['chain', 'wristbands'], accent: '#e63946', side: 'Right' } },
  bolt:  { top: 'tank', front: { kind: 'number', n: 1, word: 'RUN IT' }, back: { n: 1, name: 'BOLT' }, topBands: [HEM], bottom: 'baggy', bottomBands: [STRIPE2], shoes: ['shoes06', 'shoes05'], jersey: '#e03333', shorts: '#ffba08', look: { items: ['headband'], accent: '#111418', side: 'Right' } },
};
