// ITEM ROWS OFF THE GRID (asset-polish, 2026-10-05). A circuit's item rows sit part-way along each leg, and the last legs end
// at the start line, so their rows fell on the starting grid: on Velocity Kart's default circuit one row sat 5–6 m behind the
// player's kart, 2 m in front of the chase camera (a white blob over the start of every race), and one 7–8 m ahead of it,
// taken by the whole field at the gun.

/** Where an item row may not sit: from this far behind the start line (the field's grid, the chase camera) to this far past it. */
export const ITEM_GRID_CLEAR = { behindM: 30, aheadM: 15 } as const;

/** Is a point `dist` metres along a lap of length `L` on the grid around the start line at `startDist` (wrapping past it)? */
export function onGrid(dist: number, startDist: number, L: number): boolean {
  if (!(L > 0)) return false;
  const off = ((((dist - startDist) % L) + L * 1.5) % L) - L / 2;   // signed, −L/2..L/2: negative is behind the start
  return off > -ITEM_GRID_CLEAR.behindM && off < ITEM_GRID_CLEAR.aheadM;
}
