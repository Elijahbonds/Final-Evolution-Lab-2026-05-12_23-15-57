/** Velocity Kart reports medal completion outcomes, not the generic lowercase win used by some modes. */
export function isVelocityKartWin(outcome: string | undefined): boolean {
  return typeof outcome === 'string' && outcome.startsWith('COMPLETE_');
}
