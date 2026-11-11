// studio-22 (2026-11-11; owner: "Fix the last 4 first"). On a phone the Inspect sheet is the strip left under the 3D view: 108 px at
// 390 × 844. With a light selected, its colour sat 192 px below the screen inside that strip, under the Name / Position / Turn /
// Scale rows every object shares, so a person who opened Inspect to change the light saw none of the light's own fields. Opening
// Inspect on a phone (or picking another object while it is open) now scrolls the sheet to the object's OWN fields: a light's role,
// colour and height; a prop's colour; a stand's size. The shared rows stay one scroll up. The desktop column is unchanged.
//
// DOM-free on purpose (the test runner has no DOM): the element shape is the few members this reads.

/** The attribute on the inspector's divider above an object's own fields (components/nexus-studio/inspector.tsx). */
export const OWN_FIELDS_ATTR = 'data-own-fields';
/** The phone layout: below Tailwind's `md` (768 px), where the editor's panels are sheets under the viewport. */
export const PHONE_QUERY = '(max-width: 767.98px)';

export interface ScrollEl {
  getBoundingClientRect(): { top: number };
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly parentElement: ScrollEl | null;
  querySelector(selector: string): ScrollEl | null;
}

/** The nearest ancestor of `el`, up to and including `root`, whose content is taller than its box (the one that scrolls). */
export function scrollerOf(el: ScrollEl, root: ScrollEl): ScrollEl | null {
  for (let c = el.parentElement; c; c = c.parentElement) {
    if (c.scrollHeight > c.clientHeight + 1) return c;
    if (c === root) break;
  }
  return null;
}

/**
 * Scroll the sheet `root` so the selected object's own fields start at its top. Returns the scroll position set, or null when there
 * is nothing to reveal (nothing selected, a group, the venue's own fields) or nothing scrolls (it already fits).
 */
export function revealOwnFields(root: ScrollEl | null | undefined): number | null {
  const target = root?.querySelector(`[${OWN_FIELDS_ATTR}]`);
  if (!root || !target) return null;
  const sc = scrollerOf(target, root);
  if (!sc) return null;
  const want = sc.scrollTop + target.getBoundingClientRect().top - sc.getBoundingClientRect().top;
  const top = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, Math.round(want)));
  sc.scrollTop = top;
  return top;
}

/** Is this a phone-width window? False where media queries cannot be asked (then the sheet is left as it is). */
export function isPhoneWidth(w: { matchMedia?(q: string): { matches: boolean } } | undefined): boolean {
  try { return !!w?.matchMedia?.(PHONE_QUERY).matches; } catch { return false; }
}
