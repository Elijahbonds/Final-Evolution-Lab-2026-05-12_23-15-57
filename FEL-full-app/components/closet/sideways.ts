// Look pass C3 (lane/look-world, 2026-11-24; docs/LOOK-PASS-AUDIT.md finding 13): the Closet held sideways on a phone showed
// almost no athlete — the walkthrough card (Place a part / Next) sat over the stage's middle, where the 3D preview stands
// (look-audit shots/b1-landscape-closet.jpg). With ui.closetSideways on, a short sideways screen (landscape, at most 520 px tall:
// a phone, never a tablet or a desktop) moves that card to the top of the editor beside the stage, as an upright phone already has
// it. Same card, same words, same steps. 0 = as before.

export { CLOSET_SIDEWAYS } from '@/lib/ui/closetSideways';

// The short-sideways screen is the repo's phone-landscape query (tv-hud/banner.tsx, the 3-Point HUD). The classes are written out
// whole: Tailwind only emits a class it finds spelled in the source.

/** The classes for the walkthrough's two places: `stage` (over the 3D preview, md and up) and `editor` (the editor's top, below md). */
export function walkthroughPlaces(on: boolean): { stage: string; editor: string } {
  return on
    ? { stage: '[@media(orientation:landscape)_and_(max-height:520px)]:hidden', editor: '[@media(orientation:landscape)_and_(max-height:520px)]:block' }
    : { stage: '', editor: '' };
}
