// venuePropSets — where each CC0 prop stands, per venue (ship pass 4, phase 2).
// Positions are metres in the venue's frame; every prop sits OUTSIDE the play
// area the mode defines (court 16×28 centred; dojo mat 14×14; pitch 50×70 with the
// goal line at z 10.4; gridiron x ±20 over z 0..40; links green 60×90, holes at
// z 26–39; skatepark ±33; piste half-width 17; surf half-width 45).
export interface PropPlacement { kit: string; model: string; at: [number, number, number]; yaw?: number; scale?: number }
const ring = (kit: string, model: string, r: number, n: number, y = 0, scale = 1, phase = 0): PropPlacement[] =>
  Array.from({ length: n }, (_, i) => { const a = phase + (i / n) * Math.PI * 2; return { kit, model, at: [Math.sin(a) * r, y, Math.cos(a) * r], yaw: -a, scale }; });
const line = (kit: string, model: string, from: [number, number], to: [number, number], n: number, yaw = 0, scale = 1): PropPlacement[] =>
  Array.from({ length: n }, (_, i) => { const t = n === 1 ? 0 : i / (n - 1); return { kit, model, at: [from[0] + (to[0] - from[0]) * t, 0, from[1] + (to[1] - from[1]) * t], yaw, scale }; });

export const VENUE_PROP_SETS: Record<string, PropPlacement[]> = {
  'venice-court': [   // the scanned court has its own fence and crowd; palms and lamps stand outside it
    { kit: 'nature', model: 'tree_palmDetailedTall', at: [-16, 0, 12], scale: 4.4 }, { kit: 'nature', model: 'tree_palm', at: [16, 0, 13], scale: 4.4 },
    { kit: 'nature', model: 'tree_palmBend', at: [-17, 0, -10], scale: 4.4 }, { kit: 'nature', model: 'tree_palmShort', at: [17, 0, -12], scale: 4.4 },
    { kit: 'racing', model: 'lightPostModern', at: [-15, 0, 0], scale: 2.4 }, { kit: 'racing', model: 'lightPostModern', at: [15, 0, 0], yaw: Math.PI, scale: 2.4 },
  ],
  'dojo': [
    ...ring('mini-arena', 'column', 9.5, 8, 0, 2.6, Math.PI / 8),
    { kit: 'mini-arena', model: 'statue', at: [0, 0, 11], yaw: Math.PI, scale: 2.4 }, { kit: 'mini-arena', model: 'banner', at: [-4, 0, 11], scale: 2.4 }, { kit: 'mini-arena', model: 'banner', at: [4, 0, 11], scale: 2.4 },
    { kit: 'mini-arena', model: 'tree', at: [-11, 0, -8], scale: 2.6 }, { kit: 'nature', model: 'tree_pineRoundA', at: [11, 0, -9], scale: 4.8 },
  ],
  'links': [
    { kit: 'nature', model: 'tree_oak', at: [-24, 0, 12], scale: 4.8 }, { kit: 'nature', model: 'tree_default', at: [26, 0, 30], scale: 4.8 }, { kit: 'nature', model: 'tree_detailed', at: [-22, 0, 40], scale: 4.8 }, { kit: 'nature', model: 'tree_oak', at: [24, 0, -20], scale: 4.8 }, { kit: 'nature', model: 'tree_default', at: [-26, 0, -30], scale: 4.8 },
    ...line('nature', 'plant_bushLarge', [-27, -40], [-27, 40], 9, 0, 3.4), ...line('nature', 'plant_bush', [27, -40], [27, 40], 9, 0, 3.4),
    { kit: 'nature', model: 'rock_largeA', at: [-20, 0, -12], scale: 2.8 }, { kit: 'nature', model: 'rock_largeB', at: [22, 0, 8], scale: 2.8 },
    ...line('nature', 'fence_simple', [-14, -44], [14, -44], 8, 0, 2.2),
    { kit: 'racing', model: 'tent', at: [-18, 0, -40], scale: 2.2 }, { kit: 'racing', model: 'flagRed', at: [-14, 0, -40], scale: 2.2 },
  ],
  'ballpark': [
    { kit: 'racing', model: 'grandStandCovered', at: [0, 0, 46], yaw: Math.PI, scale: 3 }, { kit: 'racing', model: 'grandStand', at: [-32, 0, 34], yaw: Math.PI * 0.75, scale: 3 }, { kit: 'racing', model: 'grandStand', at: [32, 0, 34], yaw: -Math.PI * 0.75, scale: 3 },
    { kit: 'racing', model: 'lightPostLarge', at: [-30, 0, -22], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [30, 0, -22], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [-34, 0, 10], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [34, 0, 10], scale: 3 },
    ...line('racing', 'barrierWall', [-30, -42], [30, -42], 10, 0, 2), { kit: 'racing', model: 'flagRed', at: [0, 0, 47], scale: 2.5 }, { kit: 'racing', model: 'bannerTowerRed', at: [-8, 0, 47], scale: 2.5 },
    { kit: 'nature', model: 'tree_tall', at: [-38, 0, -34], scale: 4.8 }, { kit: 'nature', model: 'tree_default', at: [38, 0, -34], scale: 4.8 },
  ],
  'stadium': [
    { kit: 'racing', model: 'grandStandCoveredRound', at: [0, 0, 26], scale: 3 }, { kit: 'racing', model: 'grandStandRound', at: [-28, 0, 6], yaw: Math.PI / 2, scale: 3 }, { kit: 'racing', model: 'grandStandRound', at: [28, 0, 6], yaw: -Math.PI / 2, scale: 3 },
    ...line('racing', 'barrierWhite', [-24, 14], [24, 14], 12, 0, 2), { kit: 'racing', model: 'lightPostLarge', at: [-24, 0, 18], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [24, 0, 18], scale: 3 },
    { kit: 'racing', model: 'bannerTowerGreen', at: [-20, 0, 24], scale: 2.5 }, { kit: 'racing', model: 'flagGreen', at: [20, 0, 24], scale: 2.5 },
  ],
  'gridiron': [
    { kit: 'racing', model: 'grandStandCovered', at: [-31, 0, 20], yaw: Math.PI / 2, scale: 3 }, { kit: 'racing', model: 'grandStandCovered', at: [31, 0, 20], yaw: -Math.PI / 2, scale: 3 },
    { kit: 'racing', model: 'overheadLights', at: [0, 0, -6], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [-27, 0, 0], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [27, 0, 0], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [-27, 0, 40], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [27, 0, 40], scale: 3 },
    ...line('racing', 'barrierWall', [-24, -4], [24, -4], 9, 0, 2), { kit: 'racing', model: 'flagCheckers', at: [-25, 0, 44], scale: 2.5 }, { kit: 'racing', model: 'bannerTowerRed', at: [25, 0, 44], scale: 2.5 },
  ],
  'skatepark': [
    ...line('city-suburban', 'fence-1x4', [-36, -36], [36, -36], 9, 0, 2), ...line('city-suburban', 'fence-1x4', [-36, 36], [36, 36], 9, 0, 2),
    { kit: 'nature', model: 'tree_palm', at: [-38, 0, 20], scale: 4.4 }, { kit: 'nature', model: 'tree_palmTall', at: [38, 0, -18], scale: 4.4 }, { kit: 'nature', model: 'tree_palm', at: [38, 0, 24], scale: 4.4 },
    { kit: 'racing', model: 'lightPostModern', at: [-37, 0, -30], scale: 2.6 }, { kit: 'racing', model: 'lightPostModern', at: [37, 0, 30], scale: 2.6 },
  ],
  'slope': [
    ...line('nature', 'tree_pineTallA', [-22, -20], [-24, 240], 12, 0, 5.2), ...line('nature', 'tree_pineTallB', [22, 0], [24, 250], 12, 0, 5.2),
    ...line('nature', 'tree_pineSmallA', [-19, 30], [-20, 230], 8, 0, 3.6), ...line('nature', 'tree_pineSmallB', [19, 40], [20, 240], 8, 0, 3.6),
    { kit: 'nature', model: 'rock_tallA', at: [-21, 0, 120], scale: 2.8 }, { kit: 'nature', model: 'rock_largeD', at: [21, 0, 180], scale: 2.8 },
    { kit: 'racing', model: 'tent', at: [-20, 0, 8], scale: 2.4 }, { kit: 'racing', model: 'flagRed', at: [20, 0, 8], scale: 2.4 },
  ],
  'surf-break': [
    { kit: 'nature', model: 'tree_palmBend', at: [-50, 0, -30], scale: 4.4 }, { kit: 'nature', model: 'tree_palmDetailedShort', at: [-48, 0, -22], scale: 4.4 }, { kit: 'nature', model: 'tree_palmBend', at: [50, 0, -28], yaw: Math.PI, scale: 4.4 },
    { kit: 'nature', model: 'rock_largeC', at: [-52, 0, -36], scale: 2.8 }, { kit: 'nature', model: 'rock_smallG', at: [52, 0, -38], scale: 2.8 },
    { kit: 'racing', model: 'tent', at: [-46, 0, -40], scale: 2.4 }, { kit: 'racing', model: 'tentRoof', at: [46, 0, -40], scale: 2.4 }, { kit: 'racing', model: 'flagGreen', at: [0, 0, -44], scale: 2.4 },
  ],
  'gym': [
    { kit: 'racing', model: 'grandStand', at: [0, 0, 16], yaw: Math.PI, scale: 2.4 }, { kit: 'racing', model: 'overheadLights', at: [0, 0, -14], scale: 2.4 },
    { kit: 'mini-arena', model: 'banner', at: [-12, 0, 14], scale: 2.4 }, { kit: 'mini-arena', model: 'banner', at: [12, 0, 14], scale: 2.4 },
  ],
};
