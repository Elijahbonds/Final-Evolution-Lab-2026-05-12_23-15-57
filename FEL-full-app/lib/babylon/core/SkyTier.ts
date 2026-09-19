// THE SKY TIER — the dunk arena's upper tier, per setting (owner, 2026-09-18: "add that but make it level specific, like a
// blimp, or a rocket, according to the setting"; the pillars brief's catwalk tier).
//
// Something hangs over the lane in the courts that have a setting for it: Orbit's alien saucer, Blossom's balloon and Canopy's
// treehouse. Venice and the Rooftop hang NOTHING (owner, 2026-09-18: "take the blimp out", then "take out the water tower" — each sat on top of the
// hoop from the runway, an eyesore over the beach); a court with no tier has no R1 tap. Its underside is a surface: a dunker who gets up there — a full run, a corner rebound, a
// backboard kick — taps off it (R1) for a second lift and the drop into the slam. Pure: what hangs where, and when a
// tap is honest.

export type SkyKind = 'saucer' | 'balloon' | 'treehouse';
export interface SkyTier { kind: SkyKind; tag: string; call: string; color: string; accent: string }
export const SKY_TIERS: Record<string, SkyTier> = {
  orbit: { kind: 'saucer', tag: 'SAUCER', call: 'OFF THE SAUCER!', color: '#b9c6cf', accent: '#7cf7a0' },   // owner, 2026-09-18: "replace the rocket above with an alien space shuttle"
  blossom: { kind: 'balloon', tag: 'BALLOON', call: 'OFF THE BALLOON!', color: '#fbcfe8', accent: '#9d174d' },
  canopy: { kind: 'treehouse', tag: 'TREEHOUSE', call: 'OFF THE TREEHOUSE!', color: '#a16207', accent: '#86efac' },
};
/** What hangs over this court's lane — null for a court that hangs nothing (Venice, an unknown court). */
export function skyTierFor(location: string | undefined): SkyTier | null { return SKY_TIERS[location ?? ''] ?? null; }

export const SKY = {
  /** The underside's height over the lane, and where it hangs (behind the takeoff line, toward the rim). */
  underY: 4.3, zAhead: 1.5,   // 4.9 was 0.5 m over a rebound + backboard-kick flight and 0.8 m over a plain run (measured): the parkour approach reaches 4.3, the plain run does not
  /** The dunker's reach above the root, the slack under the surface, the flight window (clip time) a tap is honest in. */
  reachM: 2.3, slackM: 0.25, fromT: 0.2, toT: 0.85,
  /** What the tap buys: a second lift, a point and a half of difficulty. */
  apexAdd: 0.4, difficulty: 1.4, hype: 10,
} as const;
/** Is R1 a sky tap now? Once a flight, inside the window, with the hand up to the surface. */
export function skyTapAllowed(clipTime: number, tapped: boolean, rootY: number, underY = SKY.underY): boolean {
  if (tapped) return false;
  if (clipTime < SKY.fromT || clipTime > SKY.toT) return false;
  return rootY + SKY.reachM >= underY - SKY.slackM;
}
/** Why a tap was refused, for the banner. */
export function skyTapRefusal(clipTime: number, tapped: boolean, rootY: number, tag: string, underY = SKY.underY): string {
  if (tapped) return `THE ${tag} IS SPENT`;
  if (clipTime < SKY.fromT) return `${tag} TAP IN THE RISE`;
  if (clipTime > SKY.toT) return `TOO LATE FOR THE ${tag}`;
  return `${(underY - SKY.slackM - rootY - SKY.reachM).toFixed(1)} M SHORT OF THE ${tag} — get higher (a rebound, a backboard kick)`;
}
