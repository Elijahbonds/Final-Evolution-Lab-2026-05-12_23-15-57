// SCREEN-FIXES-2 (owner, 2026-11-10: "Fix the screens, address what you found above"): the start card's picked chip at AA.
//
// A picked chip on the shared start card (boot-splash.tsx: LOCATION, BALL, VENUE, PLACE, DECK, MAP, ...) is filled with
// the pick's own colour and used to be lettered in black whatever that colour was. On the dark ones black is not readable:
// the every-screen crawl measured the PLACE chip at 3.51:1 on sprint (#a8432f), 3.87 on tennis (#2B6CB0), 4.14 on soccer
// (#2E7D46) and 4.15 on Brain Brawl (#5E5CE6), at 12 px / 900, where AA is 4.5. The fix keeps every colour exactly as it
// is (the fill and the border) and changes only the letters: black where black clears AA, white where it does not. The
// better of the two always clears it (the two ratios cross at 4.58:1), so no colour needs changing.
import { contrastRatio, parseColor } from '@/lib/a11y/wcag';

/** WCAG AA for the chips' 12 px text (under 18.66 px bold, so not "large"). The scorer reads computed colours. */
export const CHIP_AA = 4.5;
export const CHIP_INK_DARK = '#000000';
export const CHIP_INK_LIGHT = '#ffffff';
const DARK = { r: 0, g: 0, b: 0, a: 1 };
const LIGHT = { r: 255, g: 255, b: 255, a: 1 };

/** The letters on a chip filled with `tint`: black as before wherever black clears AA, else white. */
export function chipInk(tint: string): string {
  const bg = parseColor(tint);
  if (!bg) return CHIP_INK_DARK;
  const onDark = contrastRatio(DARK, bg);
  if (onDark >= CHIP_AA) return CHIP_INK_DARK;
  return contrastRatio(LIGHT, bg) > onDark ? CHIP_INK_LIGHT : CHIP_INK_DARK;
}

/** The picked chip's style: the pick's colour as the fill and the border (unchanged), and readable letters on it. */
export function pickedChip(tint: string): { background: string; borderColor: string; color: string } {
  return { background: tint, borderColor: tint, color: chipInk(tint) };
}
