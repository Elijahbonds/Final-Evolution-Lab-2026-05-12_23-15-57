// GRAPHICS SETTING — the player's say in how much rendering their device gets (visual-foundation, 2026-10-06).
//
// Owner, after playing on a TV: "all modes are going to need dense visual passes". Until now the only way to change the
// quality tier was a BUILD-time env (NEXT_PUBLIC_QUALITY_TIER), so a big screen the detector misread had no way out. Three
// choices, the shape every console and PC game uses:
//
//   auto         the detector decides (QualityTier.autoTier) — the default
//   performance  the mobile tier: fewest full-screen passes, for a weak GPU or a hot laptop
//   quality      the high tier: MSAA, glow, the venue reflection probe — for a TV or a desktop GPU
//
// Read at MOUNT only. A post pass toggled mid-game compiles a shader on the frame it changes (ImpactFrame.ts), so the
// choice applies to the next mount, never the running one. `?tier=` (mobile | desktop | high, or the three names
// above) beats the stored choice for a single load — the probes and the owner's A/B use it.
//
// `?look=legacy` is the before/after switch for the visual-foundation pass itself: it puts the shared look back the way
// it shipped before this lane (tier demotion on the pixel budget, FXAA only, the venue's grade, declared moods, no
// kicker, full ink everywhere, no glow) so a screenshot pair can be taken on one build. URL-only; never stored.

export type GraphicsChoice = 'auto' | 'performance' | 'quality';

export const GRAPHICS_CHOICES: readonly GraphicsChoice[] = ['auto', 'performance', 'quality'];
export const GRAPHICS_KEY = 'fel-graphics';

export function parseGraphicsChoice(v: unknown): GraphicsChoice | null {
  return typeof v === 'string' && (GRAPHICS_CHOICES as readonly string[]).includes(v) ? (v as GraphicsChoice) : null;
}

/** The stored choice; 'auto' when there is none, the value is junk, or storage is blocked (private mode). */
export function readGraphicsChoice(): GraphicsChoice {
  try {
    if (typeof window === 'undefined') return 'auto';
    return parseGraphicsChoice(window.localStorage.getItem(GRAPHICS_KEY)) ?? 'auto';
  } catch { return 'auto'; }
}

export function writeGraphicsChoice(c: GraphicsChoice): void {
  try { window.localStorage.setItem(GRAPHICS_KEY, c); } catch { /* a convenience: the default still plays */ }
}

function query(name: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get(name);
  } catch { return null; }
}

/** `?tier=` for this load, or null. Parsed by QualityTier.tierFromName. */
export function readTierParam(): string | null { return query('tier'); }

/** `?shadowcache=0|1` for one load: the A/B switch for the cached static shadows (ShadowCache.ts). */
export function readShadowCacheParam(): string | null { return query('shadowcache'); }

/** `?mobilepost=0` for one load: the phones' post chain as it was before phase 2 (QualityTier.legacyMobilePost). */
export function readMobilePostParam(): string | null { return query('mobilepost'); }

/** `?look=legacy`: the shared look as it shipped before the visual-foundation pass (screenshots, the owner's A/B). */
export function isLegacyLook(): boolean { return query('look') === 'legacy'; }

/** The last tier decision this page made (QualityTier.detectRenderTier) — the Graphics menu shows it. Kept here, not in
 *  QualityTier, so the menu's bundle never pulls Babylon in. */
export interface RecordedTier { tier: string; source: string; why: string }
let lastDecision: RecordedTier | null = null;
export function recordTierDecision(d: RecordedTier): void { lastDecision = d; }
export function lastTierDecision(): RecordedTier | null { return lastDecision; }
