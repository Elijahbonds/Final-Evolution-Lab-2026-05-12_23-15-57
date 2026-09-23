// MiniTurbo — the drift pays on RELEASE, in tiers you can see (racing pass, phase 8, 2026-09-23).
//
// THE GAP: Velocity Kart's drift filled the shared BOOST meter, a number in a corner of the HUD. Mario Kart's drift
// grammar is the tiered MINI-TURBO: hold a clean slide and the sparks at the rear wheels go blue, then orange, then
// purple; let go and the kart fires a burst sized by the colour you reached. The sparks are the whole read — you know
// what the release will pay before you let go, which is what makes "one more beat in the slide" a decision.
//
// Pure: a slide's clock in, the tier and the release out. The mode draws the sparks and grants the zip.
//   · the clock runs only while the slide is CLEAN (quality ≥ 0.3); a scruffy slide holds its tier but does not climb
//   · tiers at 0.6 s / 1.3 s / 2.2 s of clean slide: MINI (blue) · SUPER (orange) · ULTRA (purple)
//   · the slide ending releases the tier reached — a zip of 0.5 / 0.9 / 1.4 s — and the clock resets
//   · a slide that ends before the first tier pays nothing (a flick is not a drift)

export const MINI_TIERS = [0.6, 1.3, 2.2] as const;
export const MINI_ZIP_SEC = [0, 0.5, 0.9, 1.4] as const;
export const MINI_LABEL = ['', 'MINI-TURBO', 'SUPER MINI-TURBO', 'ULTRA MINI-TURBO'] as const;
export const MINI_COLOR = ['', '#38bdf8', '#fb923c', '#c084fc'] as const;
export const MINI_CLEAN = 0.3;

export type MiniTier = 0 | 1 | 2 | 3;
export interface MiniState { held: number; tier: MiniTier; sliding: boolean }
export const noMini = (): MiniState => ({ held: 0, tier: 0, sliding: false });

export interface MiniStep { state: MiniState; tierUp: MiniTier | null; released: MiniTier | null }

export function tierFor(held: number): MiniTier {
  return held >= MINI_TIERS[2] ? 3 : held >= MINI_TIERS[1] ? 2 : held >= MINI_TIERS[0] ? 1 : 0;
}

export function stepMini(s: MiniState, drifting: boolean, quality: number, dt: number): MiniStep {
  if (!drifting) {
    const released = s.sliding && s.tier > 0 ? s.tier : null;
    return { state: noMini(), tierUp: null, released };
  }
  const held = s.held + (quality >= MINI_CLEAN ? Math.max(0, dt) : 0);
  const tier = tierFor(held);
  return { state: { held, tier, sliding: true }, tierUp: tier > s.tier ? tier : null, released: null };
}
