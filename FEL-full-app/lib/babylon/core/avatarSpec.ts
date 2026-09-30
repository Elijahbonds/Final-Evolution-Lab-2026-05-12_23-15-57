// AvatarSpec — the shape a body's proportions and colours travel in: the creator frame, the dev body matrix, the previews, and
// the rows /api/v1/workout/scan stored. It lived in lib/workout/avatar-builder.ts, which REACH-FREEZE (2026-09-29, spec
// Decision 4) retired: a jump never sets a height and a cadence never sets a reach any more. Scales come from the creator only,
// and they are cosmetic — playFrame.playScales decides what a body actually spawns with.

export interface AvatarSpec {
  /** Cosmetic, a multiplier of the standard frame. Clamped to COSMETIC_CLAMP.height where it is applied. */
  heightScale: number;
  /** Cosmetic girth (torso and limb thickness). Clamped to COSMETIC_CLAMP.build where it is applied. */
  buildScale: number;
  /** FROZEN at 1: arm length is never a variable (spec Decision 1). Kept because stored JSON still carries it; read by nothing. */
  reachScale: number;
  palette: { skin: string; primary: string; accent: string };
  stance: 'athletic' | 'tall' | 'compact';
}

/** The standard frame with a palette (the old builder's defaults, overridable). What a scan's spec is now, whatever it measured. */
export function standardAvatarSpec(palette?: { skin?: string; primary?: string; accent?: string }): AvatarSpec {
  return {
    heightScale: 1, buildScale: 1, reachScale: 1,
    palette: { skin: palette?.skin ?? '#C68642', primary: palette?.primary ?? '#00E5FF', accent: palette?.accent ?? '#A855F7' },
    stance: 'athletic',
  };
}
