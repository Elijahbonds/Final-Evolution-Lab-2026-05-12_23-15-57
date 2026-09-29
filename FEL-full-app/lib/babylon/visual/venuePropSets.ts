// venuePropSets — where each CC0 prop stands, per venue (ship pass 4, phase 2).
// Positions are metres in the venue's frame; every prop sits OUTSIDE the play
// area the mode defines (court 16×28 centred; dojo mat 14×14; pitch 50×70 with the
// goal line at z 10.4; gridiron x ±20 over z 0..40; links green 60×90, holes at
// z 26–39; skatepark ±33; piste half-width 17; surf half-width 45).
export interface PropPlacement {
  kit: string; model: string; at: [number, number, number]; yaw?: number; scale?: number;
  /** replace the kit palette colour (e.g. a green over the nature kit's teal canopy): one hex for every part, or a hex per
   *  material name (`{ woodBark: '#…', leafsGreen: '#…' }`) so a trunk and its crown take different colours */
  tint?: string | Readonly<Record<string, string>>;
  /** per-axis multiply on top of `scale` — re-proportions a kit model (a Kenney palm drawn as a tall Venice palm) */
  stretch?: readonly [number, number, number];
}
const ring = (kit: string, model: string, r: number, n: number, y = 0, scale = 1, phase = 0): PropPlacement[] =>
  Array.from({ length: n }, (_, i) => { const a = phase + (i / n) * Math.PI * 2; return { kit, model, at: [Math.sin(a) * r, y, Math.cos(a) * r], yaw: -a, scale }; });
const line = (kit: string, model: string, from: [number, number], to: [number, number], n: number, yaw = 0, scale = 1, tint?: string): PropPlacement[] =>
  Array.from({ length: n }, (_, i) => { const t = n === 1 ? 0 : i / (n - 1); return { kit, model, at: [from[0] + (to[0] - from[0]) * t, 0, from[1] + (to[1] - from[1]) * t], yaw, scale, ...(tint ? { tint } : {}) }; });

/** `n` copies around an arc centred on [cx, cz], each turned to face the centre — backstops, terraces, anything that
 *  curves. Angles in radians, 0 = +z, sweeping toward +x. */
const arc = (kit: string, model: string, centre: [number, number], radius: number, from: number, to: number, n: number, scale = 1, faceOut = false): PropPlacement[] =>
  Array.from({ length: n }, (_, i) => {
    const a = from + (to - from) * (n === 1 ? 0.5 : i / (n - 1));
    return { kit, model, at: [centre[0] + Math.sin(a) * radius, 0, centre[1] + Math.cos(a) * radius] as [number, number, number],
             yaw: a + (faceOut ? 0 : Math.PI), scale };
  });

/** owner call 2026-09-05: the nature kit's canopy is teal by palette; the slope's trees take a green multiply. */
const GREEN = '#63D452';
/** GATE-CRASHER-MAJOR: the slope's pines take a deep needle green, not the lime the broadleaf kit wore on the snow. */
const CONIFER = '#5E9468';

// ── DUNK-VENICE-ENV-2 (2026-09-28): THE VENICE DUNK'S BAKED DRESSING ──────────────────────────────────────────────────
// Five GLBs made for this scene (asset drop ~/Claude/outbox/assets/venice-env-2, copied byte for byte): a hero palm in three
// LODs, a boardwalk row (four storefronts, three vendor stalls, one shared atlas) and a strip of backlit crowd cards. Units
// metres, Y up, fronts face +Z, origins at the base centre. Mounted by veniceBoardwalk.mountVeniceDunkDressing (dunk + duel).

/** Where the files live. */
export const VENICE_ENV2_DIR = '/models/props/venice/env2/';
/** The hero palm's LODs share one origin and scale: LOD0 to 25 m, LOD1 to 60 m, LOD2 beyond (the asset README's bands). */
export const VENICE_PALM_LODS = { files: ['palm_hero_lod0.glb', 'palm_hero_lod1.glb', 'palm_hero_lod2.glb'], switchM: [25, 60] } as const;
export interface HeroPalm {
  at: [number, number, number];
  /** The trunk leans ~0.6 m toward the file's +X, which the glTF loader's handedness flip turns into Babylon's −X; a turn of
   *  `yaw` about Y points that lean at `heroPalmLean(yaw)`. */
  yaw: number;
  /** Metres to the top of the crown (the file's palm is HERO_PALM_M); unset = as baked. */
  h?: number;
  /** Its shadow: `whole` — trunk and alpha-tested crown (the hero palms); `trunk` — the trunk only (the near rows: their
   *  shadows reach the court, and the kit rows these replace cast their trunks and never their leaves — LightRig's foliage
   *  rule); unset — none (the far rows). */
  casts?: 'whole' | 'trunk';
}
/** The baked palm's height, metres (bounding box 9.99 m). */
export const HERO_PALM_M = 10;
/** The scale that stands a palm `h` metres tall: the trunk grows (capped at 1.45×, where the crown's droop would stretch out
 *  of shape), the crown and trunk widen half as much — a taller palm, not a bigger one. */
export function heroPalmScale(h?: number): [number, number, number] {
  if (!h) return [1, 1, 1];
  const sy = Math.min(1.45, h / HERO_PALM_M), sxz = 1 + (sy - 1) * 0.5;
  return [sxz, sy, sxz];
}
/** The lean's horizontal direction in the world for a palm turned `yaw` (x, z). */
export const heroPalmLean = (yaw: number): [number, number] => [-Math.cos(yaw), Math.sin(yaw)];
/** The backboard's face (the scanned hoop, measured at 3a0f4edf: glass z −10.67 … −10.73, stanchion foot −11.6). */
export const DUNK_BACKBOARD_Z = -10.7;
/**
 * THE HERO PALM stands 2.7 m behind the backboard and 2.6 m off the rim's line (README: 2–4 m behind, 1.5–3 m to the side, so
 * the trunk is not dead centre behind the rim). West of the hoop, where the rim cut (DunkMode: rim + (2.9, …, 1.9)) and the
 * FROM THE STANDS replay look past the glass, leaning west and a touch north — away from the court. A second closes the
 * boardwalk row's west end at mid range (LOD1 from the run-up camera); the east end has the planting strip's palms already,
 * and past it is the bike path.
 */
export const VENICE_HERO_PALMS: HeroPalm[] = [
  { at: [-2.6, 0, -13.4], yaw: -0.5, casts: 'whole' },
  { at: [-17.2, 0, -23.2], yaw: -0.35, casts: 'whole' },
];
/**
 * THE ROWS, as the same baked palm (instances of the hero's meshes, so LODs and all: up to six draws for every palm on the
 * beach). These stood the nature kit's detailed palm, stretched to 12–16 m and tinted — flat-coloured low-poly crowns, the
 * faceted fronds the eye kept finding in the slam cam and FROM THE STANDS once the backboard palm was fixed (and not the
 * baked, textured models the owner's art bar asks for); the README offers LOD1/LOD2 for background palms. Same places, same
 * heights, same turns as the rows they replace: the bike path's planting strip (x 12.3; its z −28 palm now at −32, behind the
 * boardwalk row it would stand inside), the promenade's far side (x 30.2), the beach path (x −13.8), the north shore (clear of
 * x ±20), a sparse far-beach line and a plaza row (x 46). The planting strip and the beach path cast their trunks (their shadows
 * reach the court); the far rows do not cast.
 */
const rowPalm = (x: number, z: number, h: number, yaw: number, near: boolean): HeroPalm => ({ at: [x, 0, z], yaw, h, ...(near ? { casts: 'trunk' as const } : {}) });
export const VENICE_ROW_PALMS: HeroPalm[] = [
  ...[-40, -32, -16, -4, 8, 20, 32, 44].map((z, i) => rowPalm(12.3, z, 14 + (i % 3) * 1.2, i * 0.9, true)),
  ...[-38, -26, -12, 2, 14, 28, 52].map((z, i) => rowPalm(30.2, z, 13 + ((i + 1) % 3) * 1.3, i * 1.3, false)),
  ...[-30, -16, -2, 12, 26].map((z, i) => rowPalm(-13.8, z, 13.5 + (i % 2) * 1.6, i * 0.7, true)),
  ...[-40, -24, 24, 42].map((x, i) => rowPalm(x, -50, 12 + (i % 2) * 2, i * 1.1, false)),
  ...[-56, -24, 8, 40].map((z, i) => rowPalm(-34, z, 11 + (i % 2) * 1.5, i * 0.5, false)),
  ...[-44, -14, 16, 46].map((z, i) => rowPalm(46, z, 15 + (i % 2) * 1.5, i * 0.8, false)),
];
/**
 * THE BOARDWALK ROW (eye VE-6: the run-up camera looked over an empty sand field behind the hoop). The kit file lays its
 * nodes out as a row already — facades edge to edge along x (±14.1 m), stalls 4 m in front — so the row is mounted whole
 * at `at`, UNTURNED: its fronts face +Z, which is the court. The facades are single-sided; they are never turned 180°.
 * (The glTF loader's handedness flip mirrors the layout in x — SURF & SKATE, the file's x −10.5, stands at +10.5, left of the
 * hoop from the run-up camera — and every sign still reads the right way round.)
 * The crowd strip (12 cards, ±1.2 m depth jitter, 4 m in front of its file origin) stands at `crowdAt`, between the stalls
 * and the court. `runupCamZ` is the run-up camera at the start line (measured: (0, 2.89, 8.01), fov 0.8, looking −z).
 */
export const VENICE_BOARDWALK_ROW = {
  at: [0, 0, -26.8] as [number, number, number],
  crowdAt: [0, 0, -24.3] as [number, number, number],
  /** the wall block runs 0.75 m behind the origin and the awnings 2.1 m in front (kit bounds, z −0.75 … 2.1) */
  depth: [-0.75, 2.1] as [number, number],
  halfWidth: 14.1,
  runupCamZ: 8.01,
} as const;

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
    ...line('nature', 'plant_bushLarge', [19, -12], [19, 12], 4, 0, 2.6),   // was an empty planter row — see venice-court-meshy
    ...line('nature', 'tree_palmTall', [-28, -40], [-28, 40], 5, 0.3, 5.0),
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
    // DUNK-VISUAL-POLISH: this was six EMPTY terracotta troughs evenly spaced down the boardwalk — once the court stopped
    // being a black slick they were the clearest 'placeholder' read left in frame (shot 2026-09-09: a dotted orange line
    // along the grass, nothing in any of them). A planted hedge does the same midground job and reads as a place.
    ...line('nature', 'plant_bushLarge', [21, -33], [21, 33], 6, 0, 2.6),
    { kit: 'racing', model: 'tent', at: [33, 0, -21], yaw: -Math.PI / 2, scale: 2.6 }, { kit: 'racing', model: 'tent', at: [33, 0, 18], yaw: -Math.PI / 2, scale: 2.6 },
    { kit: 'racing', model: 'tent', at: [22, 0, -48], yaw: 0, scale: 2.6 },
    { kit: 'meshy', model: 'hoopbus', at: [30, 0, -46], yaw: Math.PI / 2 }, { kit: 'meshy', model: 'sedan', at: [29, 0, 44], yaw: Math.PI / 2 },
    ...line('nature', 'plant_bushLarge', [-13, -18], [-13, 18], 5, 0, 3.0), ...line('nature', 'plant_bush', [13, -20], [13, 20], 6, 0, 2.6),
    // props+depth pass 2026-09-05 — NEAR: apron detail nobody trips on
    ...line('city-suburban', 'fence-low', [-12.5, -12], [-12.5, 12], 7, Math.PI / 2, 2.0), ...line('nature', 'grass_large', [-11, -15.5], [11, -15.5], 6, 0, 2.4),
    ...line('nature', 'grass_large', [-11, 15.5], [11, 15.5], 6, 0, 2.4),
    // MID: the boardwalk gains life — a third tent, two more shop fronts on the far line, lamps down the west grass
    { kit: 'racing', model: 'tent', at: [33, 0, 40], yaw: -Math.PI / 2, scale: 2.6 }, { kit: 'racing', model: 'tent', at: [-22, 0, -48], yaw: 0, scale: 2.6 },
    ...line('racing', 'lightPostModern', [-15, -36], [-15, 36], 4, 0, 2.4), { kit: 'racing', model: 'flagRed', at: [21, 0, -40], scale: 2.4 }, { kit: 'racing', model: 'flagGreen', at: [21, 0, 40], scale: 2.4 },
    // FAR: silhouettes for depth — a palm line down the sand and across the north shore (owner 2026-09-17: the rocks at the water's edge read as brown blobs floating on the horizon — gone, no eye sores)
    ...line('nature', 'tree_palmTall', [-30, -60], [-30, 60], 7, 0.3, 5.2), ...line('nature', 'tree_palmDetailedTall', [-40, -62], [40, -62], 6, 0, 5.0),
    
    // PM brief 2026-09-05 (VENICE-BASKET): the Meshy stores leave the court set; the second writer's venice kit stands in —
    // the far pier on the northern water and three sail billboards along the boardwalk, all MID/FAR (≥ 15 m from the court)
    { kit: 'venice', model: 'pier_far', at: [-30, 0, -110], yaw: 0.2 },
    { kit: 'venice', model: 'sail_billboard_0', at: [34, 0, -22], yaw: -Math.PI / 2 }, { kit: 'venice', model: 'sail_billboard_1', at: [34, 0, 6], yaw: -Math.PI / 2 }, { kit: 'venice', model: 'sail_billboard_2', at: [34, 0, 32], yaw: -Math.PI / 2 },
  ],
  // DUNK-VENICE-ENV-RENDER (2026-09-28): the Venice dunk's own dressing (dunk + dunk duel; the other hoops courts keep
  // 'venice-court-meshy'). The chunky low-poly palms (tree_palm / Tall / Short / Bend at 3.6–5.2×: 5–7 m green lollipops),
  // the hedge and grass-tuft lines are gone. The palms are Venice's: tall, slender and in rows down the bike path, the far
  // side of the promenade and the beach — the kit's DETAILED palm (separate trunk and two frond layers) drawn 12–16 m tall
  // on a ~0.6 m trunk (`stretch`), bark and fronds each in their own colour. There is no palm GLB in props/venice; this is
  // the best palm the shipped kits hold. The boats (sail_billboard_*) go on the water, where boats are — they stood on the
  // grass past the boardwalk. The low fence line on the beach side read as an orange dotted line on the sand (the planter
  // troughs' old complaint) and is gone too. Placed for the dunk camera (it looks −z from behind the player): the rows recede down both
  // frame edges, two palms frame the backboard, and x −20…20 on the north shore stays open so the sea shows behind the hoop.
  // DUNK-VENICE-ENV-2 (2026-09-28): the palms are the baked palm GLB now (VENICE_HERO_PALMS, VENICE_ROW_PALMS — same rows),
  // and the boardwalk row fills the sand behind the hoop (eye VE-6); the sea shows past its ends.
  'venice-dunk': [
    // (the palms are the baked palm now — VENICE_HERO_PALMS + VENICE_ROW_PALMS, mounted by veniceBoardwalk.mountVeniceDunkDressing)
    ...line('racing', 'lightPostModern', [19, -36], [19, 36], 7, Math.PI, 2.4),   // the promenade's lamps (the boardwalk's FEL flags hang on them)
    ...line('racing', 'lightPostModern', [-15, -36], [-15, 36], 6, 0, 2.4),       // the beach path's
    { kit: 'racing', model: 'tent', at: [33, 0, -21], yaw: -Math.PI / 2, scale: 2.6 }, { kit: 'racing', model: 'tent', at: [33, 0, 18], yaw: -Math.PI / 2, scale: 2.6 },
    { kit: 'racing', model: 'tent', at: [33, 0, 40], yaw: -Math.PI / 2, scale: 2.6 }, { kit: 'racing', model: 'tent', at: [22, 0, -48], yaw: 0, scale: 2.6 },
    { kit: 'racing', model: 'tent', at: [-22, 0, -48], yaw: 0, scale: 2.6 },
    // the vendors' second line across the plaza, staggered against the first — the concept's stalls and awnings
    ...[-52, -34, -4, 8, 30, 56].map((z): PropPlacement => ({ kit: 'racing', model: 'tent', at: [38, 0, z], yaw: -Math.PI / 2, scale: 2.4 })),
    { kit: 'racing', model: 'flagRed', at: [21, 0, -40], scale: 2.4 }, { kit: 'racing', model: 'flagGreen', at: [21, 0, 40], scale: 2.4 },
    { kit: 'meshy', model: 'hoopbus', at: [30, 0, -46], yaw: Math.PI / 2 }, { kit: 'meshy', model: 'sedan', at: [29, 0, 44], yaw: Math.PI / 2 },
    { kit: 'venice', model: 'pier_far', at: [-30, 0, -110], yaw: 0.2 },
    { kit: 'venice', model: 'sail_billboard_0', at: [-78, 0, -96], yaw: 0.6, scale: 2.5 },
    { kit: 'venice', model: 'sail_billboard_1', at: [-118, 0, -42], yaw: -0.4, scale: 2.8 },
    // DUNK-VENICE-ENV-2 (eye VE-8): sail_billboard_2 is gone — it was the "light-blue rectangle on a hairline pole" right of
    // the hoop. A box hull under a flat rectangular sail, 80–150 m out: from the court the hull is a pixel or two and the sail
    // and mast read as a sign on a pole, and moored in 15 m off the shore it still did (measured from the duel's run-up
    // camera). The kit's own record calls these "sail billboards"; the two left stand wide of the hoop.
  ],
  'dojo': [
    ...ring('mini-arena', 'column', 9.5, 8, 0, 1.5, Math.PI / 8),   // Pass 7: lantern-post height — at 2.6 they read as Greek temple pillars in a shrine courtyard
    { kit: 'mini-arena', model: 'statue', at: [0, 0, 11], yaw: Math.PI, scale: 2.4 }, { kit: 'mini-arena', model: 'banner', at: [-4, 0, 11], scale: 2.4 }, { kit: 'mini-arena', model: 'banner', at: [4, 0, 11], scale: 2.4 },
    { kit: 'mini-arena', model: 'tree', at: [-11, 0, -8], scale: 2.6 }, { kit: 'nature', model: 'tree_pineRoundA', at: [11, 0, -9], scale: 4.8 },
    // props+depth pass 2026-09-05 — NEAR: stones at the mat's apron corners (the Kenney blocks read as black cubes under the dusk — gone, Pass 7)
    { kit: 'nature', model: 'rock_smallFlatA', at: [-8.5, 0, 8.5], scale: 2.0 }, { kit: 'nature', model: 'rock_smallG', at: [8.5, 0, -8.5], scale: 1.8 },
    // MID: a second ring of pines outside the columns, banners between them
    ...ring('nature', 'tree_pineRoundB', 16, 6, Math.PI / 6, 4.4, 0), { kit: 'mini-arena', model: 'banner', at: [-13, 0, 0], yaw: Math.PI / 2, scale: 2.4 }, { kit: 'mini-arena', model: 'banner', at: [13, 0, 0], yaw: -Math.PI / 2, scale: 2.4 },
    // FAR: the owner's Meshy dojo stands off the side where the fighting camera can see it; a wall line closes the back
    { kit: 'meshy', model: 'dojo', at: [0, 0, -18], yaw: 0, scale: 0.9 },   // just behind the courtyard wall the camera faces, roof showing over it   // owner's Luma reference 2026-09-06 (Shimogamo Jinja): the pavilion centred behind the mat
    ...line('mini-arena', 'wall', [-30, -34], [30, -34], 9, 0, 2.6), ...line('nature', 'tree_default', [-26, -30], [26, -30], 6, 0, 5.2),
  ],
  'links': [
    { kit: 'nature', model: 'tree_oak', at: [-24, 0, 12], scale: 4.8 }, { kit: 'nature', model: 'tree_default', at: [26, 0, 30], scale: 4.8 }, { kit: 'nature', model: 'tree_detailed', at: [-22, 0, 40], scale: 4.8 }, { kit: 'nature', model: 'tree_oak', at: [24, 0, -20], scale: 4.8 }, { kit: 'nature', model: 'tree_default', at: [-26, 0, -30], scale: 4.8 },
    ...line('nature', 'plant_bushLarge', [-27, -40], [-27, 40], 9, 0, 3.4), ...line('nature', 'plant_bush', [27, -40], [27, 40], 9, 0, 3.4),
    { kit: 'nature', model: 'rock_largeA', at: [-20, 0, -12], scale: 2.8 }, { kit: 'nature', model: 'rock_largeB', at: [22, 0, 8], scale: 2.8 },
    ...line('nature', 'fence_simple', [-14, -44], [14, -44], 8, 0, 2.2),
    { kit: 'racing', model: 'tent', at: [-18, 0, -40], scale: 2.2 }, { kit: 'racing', model: 'flagRed', at: [-14, 0, -40], scale: 2.2 },
    // props+depth pass 2026-09-05 — FAR: a tree wall past the fence, rocks along the far rough
    ...line('nature', 'tree_tall', [-40, -80], [40, -80], 8, 0, 6.5), ...line('nature', 'rock_largeC', [-30, -60], [30, -60], 4, 0, 3.2),
    // ARENA-10PHASE P4 (2026-09-07): the kit box walls are gone (VenueKit.buildField 'golf') — the links closes with a tree
    // ring on the rough instead: the far shore line past the last green, and the two sides down the length of the course
    ...line('nature', 'tree_tall', [-70, 96], [70, 96], 9, 0, 7.0), ...line('nature', 'tree_detailed', [-58, 82], [58, 82], 6, 0.4, 5.6),
    ...line('nature', 'tree_oak', [-64, -50], [-66, 90], 7, 0, 6.0), ...line('nature', 'tree_tall', [64, -50], [66, 90], 7, 0, 6.0),
    ...line('nature', 'plant_bushLarge', [-50, 70], [50, 70], 7, 0, 3.6), ...line('nature', 'rock_largeB', [-48, -20], [-52, 60], 4, 0, 3.0),
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
    // Pass 7 phase 3 (dressing density): bats and a glove by the dugout — Meshy props from the baseball pack, real size
    { kit: 'meshy', model: 'bat', at: [-29.5, 0.05, 26], yaw: 0.3 }, { kit: 'meshy', model: 'bat', at: [-29.2, 0.05, 26.6], yaw: 0.8 }, { kit: 'meshy', model: 'glove', at: [-30.4, 0, 27.4], yaw: 1.4 }, { kit: 'meshy', model: 'glove', at: [29.6, 0, 26.2], yaw: -1.1 },
    // MORE BALLPARK (owner, 2026-09-19: "add more detail to the baseball field in the derby mode"). Kit geometry only,
    // all of it behind the plate or outside the foul lines, so nothing stands in a batted ball's way.
    // the BACKSTOP: a fence arc behind the plate, the thing every ballpark has and this one did not
    ...arc('racing', 'fenceStraight', [0, 0], 13, Math.PI - 0.95, Math.PI + 0.95, 11, 2.4),
    ...arc('racing', 'fenceStraight', [0, 0], 16.4, Math.PI - 0.8, Math.PI + 0.8, 9, 2.4),
    // the DUGOUTS: a low awning down each foul line, with a bench row behind
    ...line('racing', 'tentRoof', [-19, -4], [-25, 10], 3, Math.PI * 0.75, 2.2),
    ...line('racing', 'tentRoof', [19, -4], [25, 10], 3, -Math.PI * 0.75, 2.2),
    // the BLEACHERS out past third and first, turned in toward the plate
    ...arc('racing', 'grandStand', [0, 6], 40, Math.PI * 0.62, Math.PI * 0.86, 3, 2.8),
    ...arc('racing', 'grandStand', [0, 6], 40, -Math.PI * 0.86, -Math.PI * 0.62, 3, 2.8),
    // FOUL POLES at the ends of both lines — the tallest thing on the field, as they should be
    { kit: 'racing', model: 'bannerTowerRed', at: [-34.5, 0, 34.5], yaw: Math.PI * 0.25, scale: 3.4 },
    { kit: 'racing', model: 'bannerTowerGreen', at: [34.5, 0, 34.5], yaw: -Math.PI * 0.25, scale: 3.4 },
    // a light mast behind each bleacher block, and bushes filling the gap out to the tree line
    { kit: 'racing', model: 'lightPostLarge', at: [-42, 0, 18], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [42, 0, 18], scale: 3 },
    ...line('nature', 'plant_bushLarge', [-40, -30], [-40, -6], 5, 0, 2.8), ...line('nature', 'plant_bushLarge', [40, -30], [40, -6], 5, 0, 2.8),
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
  // SHARED-PLACE-FLOOR: the start gantry (z −6) and a barrier run (z −4) stood between the runner camera (z −7.5) and
  // the runner — the white slab and grey box across the bottom of every football frame. The gantry is over the end
  // zone now and the barriers line the sidelines, inside the stand, where the camera sees them.
  'gridiron': [
    { kit: 'racing', model: 'grandStandCovered', at: [-31, 0, 20], yaw: Math.PI / 2, scale: 3 }, { kit: 'racing', model: 'grandStandCovered', at: [31, 0, 20], yaw: -Math.PI / 2, scale: 3 },
    { kit: 'racing', model: 'overheadLights', at: [0, 0, 46], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [-27, 0, 0], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [27, 0, 0], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [-27, 0, 40], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [27, 0, 40], scale: 3 },
    ...line('racing', 'barrierWall', [-23, 0], [-23, 42], 8, Math.PI / 2, 2), ...line('racing', 'barrierWall', [23, 0], [23, 42], 8, -Math.PI / 2, 2), { kit: 'racing', model: 'flagCheckers', at: [-25, 0, 44], scale: 2.5 }, { kit: 'racing', model: 'bannerTowerRed', at: [25, 0, 44], scale: 2.5 },
    // props+depth pass 2026-09-05 — NEAR: team tents and sideline flags · MID: more masts · FAR: a tree line past the end zone
    { kit: 'racing', model: 'tent', at: [-28, 0, 10], yaw: Math.PI / 2, scale: 2.4 }, { kit: 'racing', model: 'tent', at: [28, 0, 10], yaw: -Math.PI / 2, scale: 2.4 }, ...line('racing', 'flagRed', [-29, -2], [-29, 30], 4, 0, 2.2),
    { kit: 'racing', model: 'lightPostLarge', at: [-27, 0, 36], scale: 3 }, { kit: 'racing', model: 'lightPostLarge', at: [27, 0, 36], scale: 3 },
    ...line('nature', 'tree_tall', [-34, 54], [34, 54], 7, 0, 6.0), ...line('nature', 'tree_default', [-40, -12], [-40, 44], 5, 0, 5.2),
    // Pass 7 phase 3 (dressing density): the team's gear at the bench — Meshy helmets from the football pack, real size
    { kit: 'meshy', model: 'helmet', at: [-27.2, 0, 7.6], yaw: 0.6 }, { kit: 'meshy', model: 'helmet2', at: [-26.6, 0, 8.4], yaw: -0.4 }, { kit: 'meshy', model: 'helmet', at: [27.3, 0, 12.2], yaw: 2.2 },
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
  // GATE-CRASHER-MAJOR (2026-09-28): PINES, THE WHOLE WAY DOWN. The set was the kit's round broadleaf blobs (tree_default /
  // tree_oak / tree_tall) under a lime multiply — the eye's "large light-green greybox shrub" — over the first 250 m of what is
  // now a 678 m run (world z to ~600), and its silhouette wall was a row of nine trees authored ACROSS the run at z 300,
  // back when the run ended before it: one of them stood on the racing line mid-run, with no collision. Conifers now
  // (the kit's pines, a deep needle green), both banks to the bottom, and the wall stands behind the finish.
  'slope': [
    ...line('nature', 'tree_pineTallA', [-19.5, -10], [-20.5, 640], 34, 0, 4.6, CONIFER), ...line('nature', 'tree_pineTallB', [19.5, 0], [20.5, 650], 34, 0, 4.6, CONIFER),
    ...line('nature', 'tree_pineSmallA', [-23, 10], [-24, 630], 24, 0.6, 4.0, CONIFER), ...line('nature', 'tree_pineSmallB', [23, 18], [24, 640], 24, 1.1, 4.0, CONIFER),
    { kit: 'nature', model: 'rock_tallA', at: [-21, 0, 120], scale: 2.8 }, { kit: 'nature', model: 'rock_largeD', at: [21, 0, 180], scale: 2.8 },
    { kit: 'nature', model: 'rock_tallA', at: [-21.5, 0, 350], scale: 3.0 }, { kit: 'nature', model: 'rock_largeD', at: [21.5, 0, 470], scale: 3.0 },
    { kit: 'racing', model: 'tent', at: [-20, 0, 8], scale: 2.4 }, { kit: 'racing', model: 'flagRed', at: [20, 0, 8], scale: 2.4 },
    // props+depth pass 2026-09-05 — NEAR: a fence at the start gate · MID: a lodge tent and flags down the run · FAR: a silhouette tree wall
    // the start gate, at z −12: the snow begins at z −19.5 (buildSlopeRun centres the piste on the run) and this
    // fence was authored at z −32, which is 12 m off the back of it — the one thing the ground audit found
    // standing over nothing on this run.
    ...line('nature', 'fence_simple', [-14, -12], [14, -12], 7, 0, 2.2), { kit: 'racing', model: 'tentRoof', at: [20, 0, 40], scale: 2.6 }, ...line('racing', 'flagRed', [-18, 60], [-18, 560], 10, 0, 2.2),
    // the finish: a crowd tent each side of the arch (buildSlopeRun puts the arch 14 m past the last gate, world z ~597)
    { kit: 'racing', model: 'tentRoof', at: [-21, 0, 592], scale: 2.8 }, { kit: 'racing', model: 'tent', at: [21, 0, 604], scale: 2.6 },
    ...line('nature', 'tree_pineTallA', [-40, 30], [-44, 640], 14, 0.3, 7.0, CONIFER), ...line('nature', 'tree_pineTallB', [40, 40], [44, 650], 14, 0.9, 7.0, CONIFER),
    ...line('nature', 'tree_pineTallA', [-60, 668], [60, 668], 13, 0, 8.5, CONIFER),
  ],
  // ARENA-10PHASE P9 (2026-09-08): Big Air's run goes −z (the athlete runs from z 0 into the kicker at z −12 and lands out
  // to z −130); it borrowed 'slope', authored for the slalom's +z run, so every one of its trees stood BEHIND the athlete
  // and the only trees in shot were the box walls' painted cones. Real pines line the run now, on the ground under them.
  'bigair-run': [
    ...line('nature', 'tree_pineTallA', [-26, 20], [-27, -150], 10, 0, 5.0, GREEN), ...line('nature', 'tree_pineTallB', [26, 14], [27, -156], 10, 0, 5.0, GREEN),
    ...line('nature', 'tree_pineSmallA', [-22, 0], [-23, -140], 7, 0, 3.4, GREEN), ...line('nature', 'tree_pineSmallB', [22, -10], [23, -146], 7, 0, 3.4, GREEN),
    { kit: 'nature', model: 'rock_largeB', at: [-24, 0, -60], scale: 2.6 }, { kit: 'nature', model: 'rock_tallA', at: [24, 0, -100], scale: 2.6 },
    { kit: 'racing', model: 'tent', at: [-22, 0, 8], scale: 2.4 }, { kit: 'racing', model: 'flagRed', at: [22, 0, 8], scale: 2.4 },
    ...line('racing', 'flagRed', [-20, -30], [-20, -130], 4, 0, 2.2), ...line('racing', 'flagCheckers', [20, -40], [20, -120], 3, 0, 2.2),
    ...line('nature', 'tree_tall', [-28, -175], [28, -175], 7, 0, 7.5, GREEN),
  ],
  // BOARD VENUES (2026-09-12): THE BEACH IS AT +Z, AND IT WAS IN THE WATER.
  //
  // Every placement in this set used to sit at z −22 … −70: palms, two tents, a lifeguard tent, a shop and the
  // Venice bus, all standing on open sea BEHIND the breaking wave, which is the direction the swell arrives from.
  // The surf world's only sand is the shore at z 123…153 (buildSurfBreak), and the set was authored against older
  // geometry that put the beach on −z. Measured by scripts/probes/_ground-audit.mts: a 48 m tent group at
  // z −52…−40 with nothing under it but water.
  //
  // The whole set is now composed on the sand, ordered NEAR → FAR from the rider's point of view (the rider rides
  // toward +z and the lap never passes z 99, so none of this is ever in the line): rocks in the shallows at the
  // waterline, the beach furniture on the dry sand, the palm line and the lot behind it.
  'surf-break': [
    // the waterline — rock in the shallows where the whitewater runs out
    { kit: 'nature', model: 'rock_largeC', at: [-64, 0, 124], scale: 2.8 }, { kit: 'nature', model: 'rock_smallG', at: [64, 0, 126], scale: 2.8 },
    ...line('nature', 'rock_largeA', [-80, 122], [80, 122], 5, 0, 3.0),
    // the dry sand — a contest flag on the centre line, two tents flanking it, the lifeguard's behind
    { kit: 'racing', model: 'flagGreen', at: [0, 0, 133], scale: 2.4 },
    { kit: 'racing', model: 'tent', at: [-30, 0, 138], scale: 2.4 }, { kit: 'racing', model: 'tentRoof', at: [30, 0, 139], scale: 2.4 },
    { kit: 'racing', model: 'tent', at: [-8, 0, 144], scale: 2.6 },
    // the back of the beach — palms, the shop and the bus at the lot, all facing the water (yaw π looks down −z)
    { kit: 'nature', model: 'tree_palmBend', at: [-52, 0, 140], scale: 4.4 }, { kit: 'nature', model: 'tree_palmDetailedShort', at: [-44, 0, 146], scale: 4.4 }, { kit: 'nature', model: 'tree_palmBend', at: [52, 0, 141], yaw: Math.PI, scale: 4.4 },
    { kit: 'meshy', model: 'store', at: [-46, 0, 150], yaw: Math.PI, scale: 0.9 }, { kit: 'meshy', model: 'hoopbus', at: [46, 0, 150], yaw: Math.PI / 2 },
    ...line('nature', 'tree_palmTall', [-88, 148], [88, 148], 9, 0, 5.5),
  ],
  // ARENA-10PHASE P5 (2026-09-07): the Beach Pro court's own set — authored for an 18 × 9 court with a 3 m free zone (x ±7.5,
  // z ±12), the sea past the far baseline (−z, NetSportMode.buildBeach puts the foam line at z −48) and the boardwalk behind
  // the hero (+z). Volleyball used to borrow 'surf-break', whose shops and bus stood 55–60 m out over the void.
  'beach-court': [
    // NEAR: palms flanking the court, court-end flags, the tents on the hero's side
    { kit: 'nature', model: 'tree_palmBend', at: [-13, 0, -10], scale: 4.4 }, { kit: 'nature', model: 'tree_palmDetailedTall', at: [13, 0, -11], scale: 4.4 },
    { kit: 'nature', model: 'tree_palmTall', at: [-14, 0, 8], scale: 4.0 }, { kit: 'nature', model: 'tree_palm', at: [14, 0, 10], scale: 4.2 },
    { kit: 'nature', model: 'tree_palmShort', at: [-16, 0, -1], scale: 3.4 }, { kit: 'nature', model: 'tree_palmDetailedShort', at: [16, 0, 0], scale: 3.4 },
    { kit: 'racing', model: 'flagRed', at: [-9, 0, -16.5], scale: 2.2 }, { kit: 'racing', model: 'flagGreen', at: [9, 0, -16.5], scale: 2.2 },
    { kit: 'racing', model: 'tent', at: [-12, 0, 18], scale: 2.2 }, { kit: 'racing', model: 'tentRoof', at: [12, 0, 18], scale: 2.2 },
    ...line('nature', 'grass_large', [-10, -14], [10, -14], 5, 0, 2.2), ...line('nature', 'plant_bush', [-11, 15], [11, 15], 5, 0, 2.4),
    // MID: the boardwalk behind the hero — a fence line, lamps, the shop, the bus and the sedan at the lot
    ...line('city-suburban', 'fence-low', [-18, 26], [18, 26], 9, 0, 2.2),
    { kit: 'racing', model: 'lightPostModern', at: [-17, 0, 24], scale: 2.4 }, { kit: 'racing', model: 'lightPostModern', at: [17, 0, 24], scale: 2.4 },
    { kit: 'meshy', model: 'store', at: [-20, 0, 34], yaw: Math.PI, scale: 0.9 }, { kit: 'meshy', model: 'hoopbus', at: [22, 0, 34], yaw: Math.PI / 2 }, { kit: 'meshy', model: 'sedan', at: [6, 0, 36], yaw: Math.PI / 2 },
    ...line('city-suburban', 'planter', [-8, 28], [8, 28], 3, 0, 2.2),
    // MID: rocks at the water's edge
    { kit: 'nature', model: 'rock_largeA', at: [-30, 0, -45], scale: 2.8 }, { kit: 'nature', model: 'rock_smallG', at: [22, 0, -46], scale: 2.4 },
    { kit: 'nature', model: 'rock_largeC', at: [36, 0, -44], scale: 3.0 }, { kit: 'nature', model: 'rock_largeD', at: [-44, 0, -42], scale: 3.2 },
    // FAR: the palm line down the beach both ways, the pier on the water, sail billboards up the sand
    ...line('nature', 'tree_palmTall', [-60, 52], [60, 52], 9, 0, 5.5), ...line('nature', 'tree_palmBend', [-56, -30], [-58, 40], 5, 0.4, 5.0), ...line('nature', 'tree_palm', [56, -30], [58, 40], 5, 0.4, 5.0),
    { kit: 'venice', model: 'pier_far', at: [-50, 0, -125], yaw: 0.2 },
    { kit: 'venice', model: 'sail_billboard_0', at: [36, 0, -8], yaw: -Math.PI / 2 }, { kit: 'venice', model: 'sail_billboard_2', at: [36, 0, 14], yaw: -Math.PI / 2 },
  ],
  'gym': [
    { kit: 'racing', model: 'grandStand', at: [0, 0, 16], yaw: Math.PI, scale: 2.4 }, { kit: 'racing', model: 'overheadLights', at: [0, 0, -14], scale: 2.4 },
    { kit: 'mini-arena', model: 'banner', at: [-12, 0, 14], scale: 2.4 }, { kit: 'mini-arena', model: 'banner', at: [12, 0, 14], scale: 2.4 },
    // props+depth pass 2026-09-05 — NEAR: blocks at the apron corners · FAR: a back wall so the hall has an end
    { kit: 'mini-arena', model: 'block', at: [-11, 0, -12], scale: 2.2 }, { kit: 'mini-arena', model: 'block', at: [11, 0, -12], scale: 2.2 },
    ...line('mini-arena', 'wall', [-16, -22], [16, -22], 5, 0, 2.6),
  ],
};

// ── THE SURROUND ───────────────────────────────────────────────────────────
//
// Ground audit, 2026-09-13 (scripts/probes/_ground-audit.mts): three of the four ball sports stand props
// over the VOID. Tennis was the worst — its `venue_ground` is the court plus a margin (16 × 34 m) and it
// borrows the basketball court's prop set, so eighteen things (palms at x ±16…±28, bushes, and the whole
// crowd TIER at z ±28) hang in the air. Derby floats a grandstand at z 47.5 and trees at ±38…±46.
//
// This is the same defect the surf beach had, and fixing it venue by venue is how it came back: the
// placements are authored by eye against a playing surface, and nobody checks that the world extends far
// enough to hold them. So the SURROUND is derived from the props themselves — whatever a venue stands
// around itself, there is ground under it — and the derivation is a pure function so a test can hold it.

/** How far past the furthest prop the surround reaches, metres. A prop standing on the very edge of a plane
 *  reads as standing on a cliff, and a tree is wider than its origin. */
export const SURROUND_MARGIN = 14;

/**
 * The ground a venue needs under it, given what it stands around itself.
 *
 * Returns [width, depth] centred on the origin — never smaller than the playing surface, because a surround
 * that is smaller than the court it surrounds is not a surround.
 */
export function surroundSize(placements: readonly PropPlacement[], groundSize: readonly [number, number]): [number, number] {
  let maxX = groundSize[0] / 2, maxZ = groundSize[1] / 2;
  for (const p of placements) {
    maxX = Math.max(maxX, Math.abs(p.at[0]));
    maxZ = Math.max(maxZ, Math.abs(p.at[2]));
  }
  return [(maxX + SURROUND_MARGIN) * 2, (maxZ + SURROUND_MARGIN) * 2];
}

/** Does this surround actually hold every prop in the set? The question the audit asked. */
export function surroundCovers(placements: readonly PropPlacement[], size: readonly [number, number]): boolean {
  return placements.every((p) => Math.abs(p.at[0]) <= size[0] / 2 && Math.abs(p.at[2]) <= size[1] / 2);
}

/**
 * What the ground around a venue is made of.
 *
 * The playing surface has a `kind`; the world around it is a different material, and getting this wrong is
 * as visible as the hole it fills — grass around a pitch, concrete around a hardcourt, sand around a beach.
 */
// Values are deliberately DARK. The first cut used mid-greys (#5a6270 for a hardcourt) and the tennis frame
// came back with a blown-out white apron filling the bottom half of the screen: these venues run a hot IBL at
// exposure 1.05–1.15, and the surround is a single unbroken plane with no markings to break it up, so it takes
// the full hit with nothing to read against. Ground the player never stands on should sit UNDER the playing
// surface in value — that is what makes the court read as the lit thing in the frame.
export const SURROUND_KIND: Record<string, { color: string; kind: string }> = {
  pitch:     { color: '#1c4f2c', kind: 'grass' },     // rough grass past the touchline, not the mown pitch
  diamond:   { color: '#204f2a', kind: 'grass' },
  green:     { color: '#245234', kind: 'grass' },
  court:     { color: '#33383f', kind: 'concrete' },
  hardcourt: { color: '#2f343b', kind: 'concrete' },
  street:    { color: '#2a2d34', kind: 'asphalt' },
  sand:      { color: '#9c8360', kind: 'sand' },
  snow:      { color: '#9fb2c4', kind: 'snow' },
  water:     { color: '#083f57', kind: 'water' },
  mat:       { color: '#2e2922', kind: 'floor' },
  stage:     { color: '#0b0718', kind: 'floor' },
};

/** The grain a surround takes, so it is not one flat unbroken plane. */
export function surroundDetail(groundKind: string): string {
  return (SURROUND_KIND[groundKind] ?? SURROUND_KIND.court).kind;
}

export function surroundColor(groundKind: string): string {
  return (SURROUND_KIND[groundKind] ?? SURROUND_KIND.court).color;
}
