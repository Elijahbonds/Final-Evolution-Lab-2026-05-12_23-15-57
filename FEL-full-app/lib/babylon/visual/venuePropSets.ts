// venuePropSets — where each CC0 prop stands, per venue (ship pass 4, phase 2).
// Positions are metres in the venue's frame; every prop sits OUTSIDE the play
// area the mode defines (court 16×28 centred; dojo mat 14×14; pitch 50×70 with the
// goal line at z 10.4; gridiron x ±20 over z 0..40; links green 60×90, holes at
// z 26–39; skatepark ±33; piste half-width 17; surf half-width 45).
export interface PropPlacement { kit: string; model: string; at: [number, number, number]; yaw?: number; scale?: number; /** multiply the kit palette (e.g. a green over the nature kit's teal canopy) */ tint?: string }
const ring = (kit: string, model: string, r: number, n: number, y = 0, scale = 1, phase = 0): PropPlacement[] =>
  Array.from({ length: n }, (_, i) => { const a = phase + (i / n) * Math.PI * 2; return { kit, model, at: [Math.sin(a) * r, y, Math.cos(a) * r], yaw: -a, scale }; });
const line = (kit: string, model: string, from: [number, number], to: [number, number], n: number, yaw = 0, scale = 1, tint?: string): PropPlacement[] =>
  Array.from({ length: n }, (_, i) => { const t = n === 1 ? 0 : i / (n - 1); return { kit, model, at: [from[0] + (to[0] - from[0]) * t, 0, from[1] + (to[1] - from[1]) * t], yaw, scale, ...(tint ? { tint } : {}) }; });

/** owner call 2026-09-05: the nature kit's canopy is teal by palette; the slope's trees take a green multiply. */
const GREEN = '#63D452';

export const VENUE_PROP_SETS: Record<string, PropPlacement[]> = {
  // Court locations (docs/SPEC-COURT-LOCATIONS.md) — placed for the dunk camera: sides at x ±11–13, a back row behind the
  // crowd tier at z −20…−26; nothing inside the court (x ±8, z ±14) or the player's clamp (x ±6).
  'canopy-court': [   // trees are procedural (courtLocations.plantTrees); the kit supplies undergrowth
    ...line('nature', 'plant_bushLarge', [-10.5, -14], [-10.5, 8], 6, 0, 3.0), ...line('nature', 'plant_bush', [10.5, -14], [10.5, 8], 6, 0, 3.0),
    ...line('nature', 'grass_large', [-9.5, -13], [-9.5, 7], 5, 0, 2.6), ...line('nature', 'grass_large', [9.5, -13], [9.5, 7], 5, 0, 2.6),
    ...line('nature', 'plant_bushLarge', [-14, -19], [14, -19], 7, 0, 3.2),
  ],
  'night-rooftop': [
    ...line('city-suburban', 'fence-low', [-11, -17], [11, -17], 7, 0, 2.2), ...line('city-suburban', 'fence-low', [-11, 17], [11, 17], 7, Math.PI, 2.2),
    ...line('city-suburban', 'fence-low', [-11, -15], [-11, 15], 9, Math.PI / 2, 2.2), ...line('city-suburban', 'fence-low', [11, -15], [11, 15], 9, -Math.PI / 2, 2.2),
    { kit: 'city-suburban', model: 'planter', at: [-10, 0, -16], scale: 2.4 }, { kit: 'city-suburban', model: 'planter', at: [10, 0, -16], scale: 2.4 },
    { kit: 'city-suburban', model: 'planter', at: [-10, 0, 16], scale: 2.4 }, { kit: 'city-suburban', model: 'planter', at: [10, 0, 16], scale: 2.4 },
  ],
  'venice-court': [   // the scanned court has its own fence and crowd; palms and lamps stand outside it
    { kit: 'nature', model: 'tree_palmDetailedTall', at: [-16, 0, 12], scale: 4.4 }, { kit: 'nature', model: 'tree_palm', at: [16, 0, 13], scale: 4.4 },
    { kit: 'nature', model: 'tree_palmBend', at: [-17, 0, -10], scale: 4.4 }, { kit: 'nature', model: 'tree_palmShort', at: [17, 0, -12], scale: 4.4 },
    { kit: 'racing', model: 'lightPostModern', at: [-15, 0, 0], scale: 2.4 }, { kit: 'racing', model: 'lightPostModern', at: [15, 0, 0], yaw: Math.PI, scale: 2.4 },
    // props+depth pass 2026-09-05 (tennis keeps the plain court) — NEAR planters · FAR palm line
    ...line('city-suburban', 'planter', [19, -12], [19, 12], 4, 0, 2.2), ...line('nature', 'tree_palmTall', [-28, -40], [-28, 40], 5, 0.3, 5.0),
  ],
  // Owner 2026-09-05 ("use my other Meshy assets too"): the basketball courts add the owner's Meshy hoopbus and sedan
  // parked on the boardwalk side behind the hoop (real-metre bakes under /models/meshy, aliased as kit 'meshy').
  'venice-court-meshy': [
    // west (ocean side): a palm row on the grass edge; east: the boardwalk — shop fronts, market tents, lamp posts, planters;
    // north (behind the hoop): a second shop line and palms closing the view; the bus and the sedan park at the boardwalk ends
    ...line('nature', 'tree_palmDetailedTall', [-17, -40], [-17, 40], 6, 0, 4.4), ...line('nature', 'tree_palm', [-19, -36], [-19, 36], 5, 0.4, 4.0),
    ...line('nature', 'tree_palmTall', [24, -44], [24, 44], 7, 0, 4.4), ...line('nature', 'tree_palmBend', [15, -30], [15, 30], 3, 0.8, 3.8),
    ...line('nature', 'tree_palmShort', [-12, -42], [12, -42], 4, 0, 3.6),
    ...line('racing', 'lightPostModern', [19, -36], [19, 36], 7, Math.PI, 2.4), ...line('racing', 'lightPostModern', [-15, -30], [-15, 30], 4, 0, 2.4),
    ...line('city-suburban', 'planter', [21, -33], [21, 33], 6, 0, 2.2),
    { kit: 'meshy', model: 'store', at: [36, 0, -30], yaw: -Math.PI / 2 }, { kit: 'meshy', model: 'store', at: [36, 0, -12], yaw: -Math.PI / 2, scale: 0.92 },
    { kit: 'meshy', model: 'store', at: [36, 0, 8], yaw: -Math.PI / 2 }, { kit: 'meshy', model: 'store', at: [36, 0, 28], yaw: -Math.PI / 2, scale: 0.95 },
    { kit: 'racing', model: 'tent', at: [33, 0, -21], yaw: -Math.PI / 2, scale: 2.6 }, { kit: 'racing', model: 'tent', at: [33, 0, 18], yaw: -Math.PI / 2, scale: 2.6 },
    { kit: 'meshy', model: 'store', at: [-6, 0, -50], yaw: 0 }, { kit: 'meshy', model: 'store', at: [10, 0, -50], yaw: 0, scale: 0.9 },
    { kit: 'racing', model: 'tent', at: [22, 0, -48], yaw: 0, scale: 2.6 },
    { kit: 'meshy', model: 'hoopbus', at: [30, 0, -46], yaw: Math.PI / 2 }, { kit: 'meshy', model: 'sedan', at: [29, 0, 44], yaw: Math.PI / 2 },
    ...line('nature', 'plant_bushLarge', [-13, -18], [-13, 18], 5, 0, 3.0), ...line('nature', 'plant_bush', [13, -20], [13, 20], 6, 0, 2.6),
    // props+depth pass 2026-09-05 — NEAR: apron detail nobody trips on
    ...line('city-suburban', 'fence-low', [-12.5, -12], [-12.5, 12], 7, Math.PI / 2, 2.0), ...line('nature', 'grass_large', [-11, -15.5], [11, -15.5], 6, 0, 2.4),
    ...line('nature', 'grass_large', [-11, 15.5], [11, 15.5], 6, 0, 2.4), { kit: 'nature', model: 'rock_smallFlatA', at: [-14, 0, 16], scale: 2.2 }, { kit: 'nature', model: 'rock_smallG', at: [14, 0, -16.5], scale: 2.0 },
    // MID: the boardwalk gains life — a third tent, two more shop fronts on the far line, lamps down the west grass
    { kit: 'racing', model: 'tent', at: [33, 0, 40], yaw: -Math.PI / 2, scale: 2.6 }, { kit: 'meshy', model: 'store', at: [26, 0, -50], yaw: 0, scale: 0.9 }, { kit: 'racing', model: 'tent', at: [-22, 0, -48], yaw: 0, scale: 2.6 },
    ...line('racing', 'lightPostModern', [-15, -36], [-15, 36], 4, 0, 2.4), { kit: 'racing', model: 'flagRed', at: [21, 0, -40], scale: 2.4 }, { kit: 'racing', model: 'flagGreen', at: [21, 0, 40], scale: 2.4 },
    // FAR: silhouettes for depth — a palm line down the sand and across the north shore, rocks at the water's edge
    ...line('nature', 'tree_palmTall', [-30, -60], [-30, 60], 7, 0.3, 5.2), ...line('nature', 'tree_palmDetailedTall', [-40, -62], [40, -62], 6, 0, 5.0),
    ...line('nature', 'rock_largeB', [-34, -30], [-34, 30], 4, 0, 3.0), { kit: 'nature', model: 'rock_largeD', at: [-36, 0, -50], scale: 3.4 },
  ],
  'dojo': [
    ...ring('mini-arena', 'column', 9.5, 8, 0, 2.6, Math.PI / 8),
    { kit: 'mini-arena', model: 'statue', at: [0, 0, 11], yaw: Math.PI, scale: 2.4 }, { kit: 'mini-arena', model: 'banner', at: [-4, 0, 11], scale: 2.4 }, { kit: 'mini-arena', model: 'banner', at: [4, 0, 11], scale: 2.4 },
    { kit: 'mini-arena', model: 'tree', at: [-11, 0, -8], scale: 2.6 }, { kit: 'nature', model: 'tree_pineRoundA', at: [11, 0, -9], scale: 4.8 },
    // props+depth pass 2026-09-05 — NEAR: stones and a block at each corner of the mat's apron
    { kit: 'nature', model: 'rock_smallFlatA', at: [-8.5, 0, 8.5], scale: 2.0 }, { kit: 'nature', model: 'rock_smallG', at: [8.5, 0, -8.5], scale: 1.8 }, { kit: 'mini-arena', model: 'block', at: [-8.5, 0, -8.5], scale: 2.2 }, { kit: 'mini-arena', model: 'block', at: [8.5, 0, 8.5], scale: 2.2 },
    // MID: a second ring of pines outside the columns, banners between them
    ...ring('nature', 'tree_pineRoundB', 16, 6, Math.PI / 6, 4.4, 0), { kit: 'mini-arena', model: 'banner', at: [-13, 0, 0], yaw: Math.PI / 2, scale: 2.4 }, { kit: 'mini-arena', model: 'banner', at: [13, 0, 0], yaw: -Math.PI / 2, scale: 2.4 },
    // FAR: the owner's Meshy dojo stands off the side where the fighting camera can see it; a wall line closes the back
    { kit: 'meshy', model: 'dojo', at: [26, 0, -26], yaw: -Math.PI / 4 }, ...line('mini-arena', 'wall', [-24, -30], [24, -30], 7, 0, 2.6),
  ],
  'links': [
    { kit: 'nature', model: 'tree_oak', at: [-24, 0, 12], scale: 4.8 }, { kit: 'nature', model: 'tree_default', at: [26, 0, 30], scale: 4.8 }, { kit: 'nature', model: 'tree_detailed', at: [-22, 0, 40], scale: 4.8 }, { kit: 'nature', model: 'tree_oak', at: [24, 0, -20], scale: 4.8 }, { kit: 'nature', model: 'tree_default', at: [-26, 0, -30], scale: 4.8 },
    ...line('nature', 'plant_bushLarge', [-27, -40], [-27, 40], 9, 0, 3.4), ...line('nature', 'plant_bush', [27, -40], [27, 40], 9, 0, 3.4),
    { kit: 'nature', model: 'rock_largeA', at: [-20, 0, -12], scale: 2.8 }, { kit: 'nature', model: 'rock_largeB', at: [22, 0, 8], scale: 2.8 },
    ...line('nature', 'fence_simple', [-14, -44], [14, -44], 8, 0, 2.2),
    { kit: 'racing', model: 'tent', at: [-18, 0, -40], scale: 2.2 }, { kit: 'racing', model: 'flagRed', at: [-14, 0, -40], scale: 2.2 },
    // props+depth pass 2026-09-05 — FAR: a tree wall past the fence, rocks along the far rough
    ...line('nature', 'tree_tall', [-40, -80], [40, -80], 8, 0, 6.5), ...line('nature', 'rock_largeC', [-30, -60], [30, -60], 4, 0, 3.2),
  ],
  'ballpark': [
    { kit: 'racing', model: 'grandStandCovered', at: [0, 0, 46], yaw: Math.PI, scale: 3 }, { kit: 'racing', model: 'grandStand', at: [-32, 0, 34], yaw: Math.PI * 0.75, scale: 3 }, { kit: 'racing', model: 'grandStand', at: [32, 0, 34], yaw: -Math.PI * 0.75, scale: 3 },
    { kit: 'racing', model: 'lightPostLarge', at: [-30, 0, -22], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [30, 0, -22], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [-34, 0, 10], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [34, 0, 10], scale: 3 },
    ...line('racing', 'barrierWall', [-30, -42], [30, -42], 10, 0, 2), { kit: 'racing', model: 'flagRed', at: [0, 0, 47], scale: 2.5 }, { kit: 'racing', model: 'bannerTowerRed', at: [-8, 0, 47], scale: 2.5 },
    { kit: 'nature', model: 'tree_tall', at: [-38, 0, -34], scale: 4.8 }, { kit: 'nature', model: 'tree_default', at: [38, 0, -34], scale: 4.8 },
    // props+depth pass 2026-09-05 — NEAR: bushes along the foul lines · MID: another mast · FAR: a tree line beyond the outfield wall
    ...line('nature', 'plant_bush', [-30, -10], [-38, 20], 5, 0, 2.6), ...line('nature', 'plant_bush', [30, -10], [38, 20], 5, 0, 2.6),
    { kit: 'racing', model: 'lightPostLarge', at: [0, 0, -46], scale: 3 },
    ...line('nature', 'tree_tall', [-44, -54], [44, -54], 9, 0, 6.2), ...line('nature', 'tree_detailed', [-46, -20], [-46, 40], 5, 0, 5.0),
  ],
  'stadium': [
    { kit: 'racing', model: 'grandStandCoveredRound', at: [0, 0, 26], scale: 3 }, { kit: 'racing', model: 'grandStandRound', at: [-28, 0, 6], yaw: Math.PI / 2, scale: 3 }, { kit: 'racing', model: 'grandStandRound', at: [28, 0, 6], yaw: -Math.PI / 2, scale: 3 },
    ...line('racing', 'barrierWhite', [-24, 14], [24, 14], 12, 0, 2), { kit: 'racing', model: 'lightPostLarge', at: [-24, 0, 18], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [24, 0, 18], scale: 3 },
    { kit: 'racing', model: 'bannerTowerGreen', at: [-20, 0, 24], scale: 2.5 }, { kit: 'racing', model: 'flagGreen', at: [20, 0, 24], scale: 2.5 },
    // props+depth pass 2026-09-05 — NEAR: team benches under tents · MID: side stands · FAR: trees behind the round stand
    { kit: 'racing', model: 'tent', at: [-14, 0, 19], scale: 2.2 }, { kit: 'racing', model: 'tent', at: [14, 0, 19], scale: 2.2 },
    { kit: 'racing', model: 'grandStand', at: [-30, 0, -8], yaw: Math.PI / 2, scale: 3 }, { kit: 'racing', model: 'grandStand', at: [30, 0, -8], yaw: -Math.PI / 2, scale: 3 },
    ...line('nature', 'tree_tall', [-36, 40], [36, 40], 8, 0, 6.0), ...line('nature', 'tree_default', [-40, -30], [40, -30], 6, 0, 5.4),
  ],
  'gridiron': [
    { kit: 'racing', model: 'grandStandCovered', at: [-31, 0, 20], yaw: Math.PI / 2, scale: 3 }, { kit: 'racing', model: 'grandStandCovered', at: [31, 0, 20], yaw: -Math.PI / 2, scale: 3 },
    { kit: 'racing', model: 'overheadLights', at: [0, 0, -6], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [-27, 0, 0], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [27, 0, 0], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [-27, 0, 40], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [27, 0, 40], scale: 3 },
    ...line('racing', 'barrierWall', [-24, -4], [24, -4], 9, 0, 2), { kit: 'racing', model: 'flagCheckers', at: [-25, 0, 44], scale: 2.5 }, { kit: 'racing', model: 'bannerTowerRed', at: [25, 0, 44], scale: 2.5 },
    // props+depth pass 2026-09-05 — NEAR: team tents and sideline flags · MID: more masts · FAR: a tree line past the end zone
    { kit: 'racing', model: 'tent', at: [-28, 0, 10], yaw: Math.PI / 2, scale: 2.4 }, { kit: 'racing', model: 'tent', at: [28, 0, 10], yaw: -Math.PI / 2, scale: 2.4 }, ...line('racing', 'flagRed', [-29, -2], [-29, 30], 4, 0, 2.2),
    { kit: 'racing', model: 'lightPostLarge', at: [-27, 0, 36], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [27, 0, 36], scale: 3 },
    ...line('nature', 'tree_tall', [-34, 54], [34, 54], 7, 0, 6.0), ...line('nature', 'tree_default', [-40, -12], [-40, 44], 5, 0, 5.2),
  ],
  'skatepark': [
    ...line('city-suburban', 'fence-1x4', [-36, -36], [36, -36], 9, 0, 2), ...line('city-suburban', 'fence-1x4', [-36, 36], [36, 36], 9, 0, 2),
    { kit: 'nature', model: 'tree_palm', at: [-38, 0, 20], scale: 4.4 }, { kit: 'nature', model: 'tree_palmTall', at: [38, 0, -18], scale: 4.4 }, { kit: 'nature', model: 'tree_palm', at: [38, 0, 24], scale: 4.4 },
    { kit: 'racing', model: 'lightPostModern', at: [-37, 0, -30], scale: 2.6 }, { kit: 'racing', model: 'lightPostModern', at: [37, 0, 30], scale: 2.6 },
    // props+depth pass 2026-09-05 — NEAR: a barrier run and grass inside the fence · MID: tents, lamps, the Venice bus and a shop · FAR: a palm line
    ...line('racing', 'barrierWhite', [-30, -35.5], [30, -35.5], 8, 0, 2.0), ...line('nature', 'grass_large', [-34, -28], [-34, 28], 6, 0, 2.4),
    { kit: 'racing', model: 'tent', at: [-38, 0, 4], yaw: Math.PI / 2, scale: 2.4 }, { kit: 'racing', model: 'tent', at: [38, 0, -4], yaw: -Math.PI / 2, scale: 2.4 }, { kit: 'racing', model: 'lightPostModern', at: [-37, 0, 30], scale: 2.6 }, { kit: 'racing', model: 'lightPostModern', at: [37, 0, -30], scale: 2.6 },
    { kit: 'meshy', model: 'hoopbus', at: [-46, 0, -10], yaw: Math.PI / 2 }, { kit: 'meshy', model: 'store', at: [44, 0, 12], yaw: -Math.PI / 2, scale: 0.9 }, { kit: 'meshy', model: 'sedan', at: [-44, 0, 22], yaw: Math.PI / 2 },
    ...line('nature', 'tree_palmTall', [-52, -60], [52, -60], 8, 0, 5.2), ...line('nature', 'tree_palm', [-56, -40], [-56, 40], 5, 0.4, 4.8),
  ],
  'slope': [   // owner call 2026-09-05: green trees (the kit's pines are teal by palette)
    ...line('nature', 'tree_tall', [-22, -20], [-24, 240], 12, 0, 5.2, GREEN), ...line('nature', 'tree_default', [22, 0], [24, 250], 12, 0, 5.2, GREEN),
    ...line('nature', 'tree_default', [-19, 30], [-20, 230], 8, 0, 3.6, GREEN), ...line('nature', 'tree_oak', [19, 40], [20, 240], 8, 0, 3.6, GREEN),
    { kit: 'nature', model: 'rock_tallA', at: [-21, 0, 120], scale: 2.8 }, { kit: 'nature', model: 'rock_largeD', at: [21, 0, 180], scale: 2.8 },
    { kit: 'racing', model: 'tent', at: [-20, 0, 8], scale: 2.4 }, { kit: 'racing', model: 'flagRed', at: [20, 0, 8], scale: 2.4 },
    // props+depth pass 2026-09-05 — NEAR: a fence at the start gate · MID: a lodge tent and flags down the run · FAR: a silhouette tree wall
    ...line('nature', 'fence_simple', [-14, -32], [14, -32], 7, 0, 2.2), { kit: 'racing', model: 'tentRoof', at: [20, 0, 40], scale: 2.6 }, ...line('racing', 'flagRed', [-18, 60], [-18, 200], 4, 0, 2.2),
    ...line('nature', 'tree_tall', [-60, 300], [60, 300], 9, 0, 8.5, GREEN), ...line('nature', 'tree_tall', [-40, 30], [-44, 260], 6, 0, 7.0, GREEN),
  ],
  'surf-break': [
    { kit: 'nature', model: 'tree_palmBend', at: [-50, 0, -30], scale: 4.4 }, { kit: 'nature', model: 'tree_palmDetailedShort', at: [-48, 0, -22], scale: 4.4 }, { kit: 'nature', model: 'tree_palmBend', at: [50, 0, -28], yaw: Math.PI, scale: 4.4 },
    { kit: 'nature', model: 'rock_largeC', at: [-52, 0, -36], scale: 2.8 }, { kit: 'nature', model: 'rock_smallG', at: [52, 0, -38], scale: 2.8 },
    { kit: 'racing', model: 'tent', at: [-46, 0, -40], scale: 2.4 }, { kit: 'racing', model: 'tentRoof', at: [46, 0, -40], scale: 2.4 }, { kit: 'racing', model: 'flagGreen', at: [0, 0, -44], scale: 2.4 },
    // props+depth pass 2026-09-05 — MID: a lifeguard tent and a shop up the beach · FAR: the shore's palm line and the bus at the lot
    { kit: 'racing', model: 'tent', at: [0, 0, -50], scale: 2.6 }, { kit: 'meshy', model: 'store', at: [-28, 0, -54], yaw: 0, scale: 0.9 }, { kit: 'meshy', model: 'hoopbus', at: [30, 0, -58], yaw: Math.PI / 2 },
    ...line('nature', 'tree_palmTall', [-80, -70], [80, -70], 9, 0, 5.5), ...line('nature', 'rock_largeA', [-70, -46], [70, -46], 5, 0, 3.0),
  ],
  'gym': [
    { kit: 'racing', model: 'grandStand', at: [0, 0, 16], yaw: Math.PI, scale: 2.4 }, { kit: 'racing', model: 'overheadLights', at: [0, 0, -14], scale: 2.4 },
    { kit: 'mini-arena', model: 'banner', at: [-12, 0, 14], scale: 2.4 }, { kit: 'mini-arena', model: 'banner', at: [12, 0, 14], scale: 2.4 },
    // props+depth pass 2026-09-05 — NEAR: blocks at the apron corners · FAR: a back wall so the hall has an end
    { kit: 'mini-arena', model: 'block', at: [-11, 0, -12], scale: 2.2 }, { kit: 'mini-arena', model: 'block', at: [11, 0, -12], scale: 2.2 },
    ...line('mini-arena', 'wall', [-16, -22], [16, -22], 5, 0, 2.6),
  ],
};
