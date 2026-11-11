// SCREEN-FIXES (2026-11-10): /play/party's small coloured text, at AA. readable-2 measured the four empty seats' "P 1"–"P 4"
// at 1.7–2.8:1 (the seat colour at 40 % alpha) and two "1–2 PLAYERS" badges at 3.67 and 4.42:1 (Brain Brawl's violet and
// Who Scene It's rose, each on its own tint). The fix keeps each colour's hue and lifts it toward white only as far as
// 4.5:1 needs, against the darkest and the lightest background the text sits on; a colour that already clears it is
// returned as it is.
import * as wcagNs from '@/lib/a11y/wcag';

const { composite, contrastRatio, parseColor } = ((wcagNs as { default?: unknown }).default ?? wcagNs) as typeof wcagNs;

/** The party room's page colour (party-room.tsx `bg-[#05070c]`). */
export const PARTY_INK_BG = '#05070c';
/** WCAG AA for text under 18.66 px bold (every piece of text this is used for is 12–16 px) is 4.5; the aim carries a
 *  little room, because the readable audit reads a glyph's colour from its anti-aliased pixels. */
export const AA = 4.5;
const AIM = 4.7;

/** Two colours mixed in sRGB, `t` of the way from `a` to `b`, as #rrggbb. */
function mix(a: string, b: string, t: number): string {
  const A = parseColor(a)!, B = parseColor(b)!;
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${ch(A.r, B.r)}${ch(A.g, B.g)}${ch(A.b, B.b)}`;
}

/** A background made of layers painted bottom-up (each '#rrggbb' or '#rrggbbaa' / rgba()). */
export function layered(...layers: string[]) {
  return layers.slice(1).reduce((under, c) => composite(parseColor(c)!, under), parseColor(layers[0])!);
}

/** The lowest contrast of `color` over any of `backgrounds` (each a list of layers, bottom first). */
export function worstContrast(color: string, backgrounds: string[][]): number {
  const fg = parseColor(color)!;   // a translucent colour is drawn over the background it sits on
  return Math.min(...backgrounds.map((bg) => { const under = layered(...bg); return contrastRatio(composite(fg, under), under); }));
}

/** `color` as it is if it clears AA on every background, else lifted toward white (in 2 % steps) until it does. */
export function readableInk(color: string, backgrounds: string[][]): string {
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const c = t === 0 ? color : mix(color, '#ffffff', t);
    if (worstContrast(c, backgrounds) >= AIM) return c;
  }
  return '#ffffff';
}

/** The backgrounds a game card's badge sits on: its own tint, over the card picked (the colour's tint) or not. */
export function badgeBackgrounds(color: string): string[][] {
  return [
    [PARTY_INK_BG, `${color}1f`, `${color}33`],                 // the picked card
    [PARTY_INK_BG, 'rgba(255,255,255,0.02)', `${color}33`],     // a card not picked
  ];
}

/** For text that should read as quiet (an EMPTY seat's "P 1"): `color` dimmed toward the page as far as AA allows, so it
 *  still reads as empty beside a taken seat. A colour that does not clear AA even at full strength is lifted instead. */
export function quietInk(color: string, backgrounds: string[][] = [[PARTY_INK_BG]]): string {
  if (worstContrast(color, backgrounds) < AIM) return readableInk(color, backgrounds);
  let best = color;
  for (let t = 0.02; t <= 1; t += 0.02) {
    const c = mix(color, PARTY_INK_BG, t);
    if (worstContrast(c, backgrounds) < AIM) break;
    best = c;
  }
  return best;
}
