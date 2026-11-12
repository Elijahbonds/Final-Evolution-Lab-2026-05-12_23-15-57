/**
 * THE VENICE HUB — the layout as data (lane/venice-hub, 2026-11-12; docs/VENICE-HUB-PLAN.md).
 *
 * Owner, 2026-11-12: "It's really Venice beach, look at all the locations we have for the game modes, figure out how to wire
 * it in and put it together." Later the same day: big open ZONES joined by a hub town; Venice Beach is the hub town; each
 * zone is large and seamless inside, a short load between zones, zones ship one at a time.
 *
 * NOT SHIPPED. Nothing in the app imports this file except the dev-only prototype (app/dev/venice-hub) and the probes in
 * scripts/probes/venice-hub. It is the plan's layout in a form a test can hold and a renderer can draw: typed values, not
 * JSON, for the reason venueSpecs.ts gives (a typo is a compile error, there is no serialised copy to drift).
 *
 * GEOGRAPHY: real-world-INSPIRED, public geography only — the beach and the water to the west, the bike path and the
 * boardwalk running north-south, the courts beside the skate park and the outdoor gym, the pier to the south, the canals and
 * the marina inland to the south-east. Nothing is copied from any game's map, names or UI. Every in-game name is
 * [PLACEHOLDER] until the owner names it (ADVENTURE-PLAN.md "IP line").
 *
 * FRAME: metres, the Adventure's 64 m world piece (ADVENTURE-PLAN.md "The open world"). x runs west (−) to east (+): the sea
 * is −x, as in the shipped Venice dressing (nexus/veniceBoardwalk.ts: "to the WEST the grass gives way to sand and the
 * Pacific"). NORTH IS −z (the shipped dressing's `northSand: -57`, the pier at z −110 behind the dunk's hoop). Cell (i, j):
 * column i from the west, row j from the north.
 * Every number is [TUNE].
 */

export const PIECE_M = 64;
export const HUB_COLS = 5;
export const HUB_ROWS = 8;
/** The hub's west and north edges: the grid is centred on x and on z. */
export const HUB_MIN_X = -(HUB_COLS * PIECE_M) / 2;
export const HUB_MIN_Z = -(HUB_ROWS * PIECE_M) / 2;

export type Cell = readonly [i: number, j: number];
export type Phase = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7';

/** What kind of place a spot or a venue is (the inventory's column). */
export type PlaceKind =
  | 'court' | 'skatepark' | 'beach' | 'water' | 'track' | 'field' | 'ring' | 'stage' | 'screen' | 'arcade'
  | 'road' | 'sky' | 'snow' | 'gym' | 'pier' | 'plaza' | 'transit' | 'town' | 'canal' | 'diamond' | 'wilds';

export interface District {
  id: string;
  name: string;
  kind: PlaceKind;
  /** The phase that builds it walkable. Earlier phases may show it as a low-detail silhouette. */
  phase: Phase;
  cells: readonly Cell[];
  /** The map colour. */
  color: string;
  /** The public-geography idea it is drawn from, in a few plain words. */
  inspiredBy: string;
}

export type Fit = 'natural' | 'stretch' | 'zone';

/** A place you walk up to. Walking into `radius` offers the mode (one tap: Play / Run / Watch). */
export interface Spot {
  id: string;
  label: string;
  district: string;
  /** Hub metres. */
  at: readonly [x: number, z: number];
  radius: number;
  /** The shelf keys (lib/nav/families.ts FAMILIES[].modes) this spot launches. Empty = a door that is not a game. */
  modes: readonly string[];
  /** The route the spot opens (the mode's own /play route, unchanged). */
  route: string;
  kind: PlaceKind;
  /** A spot with a queue, next-up and a sideline to watch from (the run, V2). */
  run?: { courtHalfW: number; courtHalfL: number; benchSeats: number };
  /** A door to an open zone (zoneId). */
  zone?: string;
}

export interface Zone {
  id: string;
  name: string;
  theme: string;
  /** The shipped venues, circuits and looks it is drawn from (the inventory's place ids). */
  from: readonly string[];
  /** Shelf keys whose HOME is this zone (a spot in the zone launches them). */
  homes: readonly string[];
  /** Shelf keys that ALSO get a spot here (their home is elsewhere). */
  extraSpots: readonly string[];
  /** First cut and full size, in 64 m pieces [x, z]. */
  firstPieces: readonly [number, number];
  fullPieces: readonly [number, number];
  /** The Venice district whose door leads here. */
  door: string;
  phase: Phase;
  color: string;
}

const c = (i: number, j: number): Cell => [i, j];
const cellsRect = (i0: number, i1: number, j0: number, j1: number): Cell[] => {
  const out: Cell[] = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push(c(i, j));
  return out;
};

/**
 * The districts. Every hub cell belongs to exactly one (layout.test.ts holds it).
 *
 *            i=0 water    i=1 sand      i=2 park strip     i=3 boardwalk      i=4 town
 *   j=0  N   water        sand          art walls          stalls (north)     rooftops
 *   j=1      water        beach bowl    skate park         stalls             town
 *   j=2      water        COURTS ────── COURTS             the stage          town
 *   j=3      water        COURTS ────── COURTS             the screen         town
 *   j=4      water        volleyball    outdoor gym        the arcade         sandlot
 *   j=5      water        beach pitch   paddle courts      THE PLAZA          canals
 *   j=6      pier         pier          bike path          stalls (south)     canals
 *   j=7  S   surf break   sand          bike path          boardwalk end      marina
 */
export const DISTRICTS: readonly District[] = [
  { id: 'courts', name: '[PLACEHOLDER] The Courts', kind: 'court', phase: 'V1', cells: cellsRect(1, 2, 2, 3), color: '#2a6ca6',
    inspiredBy: 'the outdoor courts between the sand and the boardwalk' },
  { id: 'water', name: '[PLACEHOLDER] The Water', kind: 'water', phase: 'V4', cells: [0, 1, 2, 3, 4, 5].map((j) => c(0, j)), color: '#1d4f7a',
    inspiredBy: 'the open Pacific west of the beach' },
  { id: 'surf', name: '[PLACEHOLDER] The Break', kind: 'water', phase: 'V4', cells: [c(0, 7)], color: '#2f6f99',
    inspiredBy: 'the surf beside the pier' },
  { id: 'pier', name: '[PLACEHOLDER] The Pier', kind: 'pier', phase: 'V5', cells: [c(0, 6), c(1, 6)], color: '#8a6a4a',
    inspiredBy: 'the long fishing pier at the south end' },
  { id: 'sand', name: '[PLACEHOLDER] The Sand', kind: 'beach', phase: 'V4', cells: [c(1, 0), c(1, 7)], color: '#d9c08a',
    inspiredBy: 'the wide beach' },
  { id: 'beachbowl', name: '[PLACEHOLDER] Beach Bowl', kind: 'field', phase: 'V4', cells: [c(1, 1)], color: '#cdb27a',
    inspiredBy: 'a pick-up gridiron chalked on the sand' },
  { id: 'volley', name: '[PLACEHOLDER] The Nets', kind: 'beach', phase: 'V4', cells: [c(1, 4)], color: '#e0c88f',
    inspiredBy: 'the beach volleyball nets' },
  { id: 'beachpitch', name: '[PLACEHOLDER] Beach Pitch', kind: 'field', phase: 'V4', cells: [c(1, 5)], color: '#c9b77a',
    inspiredBy: 'a goal and a penalty spot on the sand' },
  { id: 'artwalls', name: '[PLACEHOLDER] The Art Walls', kind: 'town', phase: 'V4', cells: [c(2, 0)], color: '#b0567a',
    inspiredBy: 'the painted walls beside the skate park' },
  { id: 'skatepark', name: '[PLACEHOLDER] The Skate Park', kind: 'skatepark', phase: 'V4', cells: [c(2, 1)], color: '#8e8a94',
    inspiredBy: 'the beachfront concrete skate park and its bowl' },
  { id: 'gym', name: '[PLACEHOLDER] The Outdoor Gym', kind: 'gym', phase: 'V4', cells: [c(2, 4)], color: '#a34a3a',
    inspiredBy: 'the open-air weight pen and its ring' },
  { id: 'paddle', name: '[PLACEHOLDER] The Paddle Courts', kind: 'court', phase: 'V4', cells: [c(2, 5)], color: '#3f8f5a',
    inspiredBy: 'the small paddle-tennis courts beside the courts' },
  { id: 'bikepath', name: '[PLACEHOLDER] The Bike Path', kind: 'track', phase: 'V4', cells: [c(2, 6), c(2, 7)], color: '#3a3f46',
    inspiredBy: 'the beach bike path between the sand and the walk' },
  { id: 'boardwalk', name: '[PLACEHOLDER] The Boardwalk', kind: 'road', phase: 'V3', cells: [c(3, 0), c(3, 1), c(3, 6), c(3, 7)], color: '#c7bba6',
    inspiredBy: 'the promenade of stalls, shop fronts and street performers' },
  { id: 'stage', name: '[PLACEHOLDER] The Stage', kind: 'stage', phase: 'V3', cells: [c(3, 2)], color: '#7a3fa0',
    inspiredBy: 'the street performers and the drum circle on the walk' },
  { id: 'screen', name: '[PLACEHOLDER] The Screen', kind: 'screen', phase: 'V3', cells: [c(3, 3)], color: '#4a3f8a',
    inspiredBy: 'an outdoor movie screen on the walk' },
  { id: 'arcade', name: '[PLACEHOLDER] The Arcade', kind: 'arcade', phase: 'V3', cells: [c(3, 4)], color: '#d0478f',
    inspiredBy: 'the arcade and the colonnade off the walk' },
  { id: 'plaza', name: '[PLACEHOLDER] The Plaza', kind: 'plaza', phase: 'V3', cells: [c(3, 5)], color: '#e0a040',
    inspiredBy: 'the square under the sign where the avenue meets the walk' },
  { id: 'town', name: '[PLACEHOLDER] The Town', kind: 'town', phase: 'V5', cells: [c(4, 1), c(4, 2), c(4, 3)], color: '#6a5a72',
    inspiredBy: 'the streets behind the walk' },
  { id: 'rooftops', name: '[PLACEHOLDER] The Rooftops', kind: 'town', phase: 'V5', cells: [c(4, 0)], color: '#3a2a5e',
    inspiredBy: 'flat roofs over the town (the rooftop court)' },
  { id: 'sandlot', name: '[PLACEHOLDER] The Sandlot', kind: 'diamond', phase: 'V4', cells: [c(4, 4)], color: '#9a8a4a',
    inspiredBy: 'a neighbourhood ball field' },
  { id: 'canals', name: '[PLACEHOLDER] The Canals', kind: 'canal', phase: 'V5', cells: [c(4, 5), c(4, 6)], color: '#3f7f8f',
    inspiredBy: 'the residential canals and their footbridges' },
  { id: 'marina', name: '[PLACEHOLDER] The Marina', kind: 'canal', phase: 'V5', cells: [c(4, 7)], color: '#2f6f7f',
    inspiredBy: 'the harbour south of the canals' },
];

/**
 * The spots: every shelf mode's Venice home, plus the doors. Coordinates are hub metres (x west→east, z north→south as −z).
 * The courts district is x −96..32, z −128..0 (cells (1..2, 2..3)).
 */
export const SPOTS: readonly Spot[] = [
  // ── V1: THE COURTS (the hoops park; the owner's PARK decision, 2026-11-12) ─────────────────────────────────────────────
  { id: 'court.ones', label: '[PLACEHOLDER] Court 1 — Ones', district: 'courts', at: [-64, -100], radius: 9, modes: ['hoops1v1'], route: '/play/onevone', kind: 'court',
    run: { courtHalfW: 8, courtHalfL: 9.5, benchSeats: 4 } },
  { id: 'court.run', label: '[PLACEHOLDER] Court 2 — The Run', district: 'courts', at: [-24, -100], radius: 10, modes: ['hoops3v3'], route: '/play/threevthree', kind: 'court',
    run: { courtHalfW: 9, courtHalfL: 10, benchSeats: 6 } },
  { id: 'court.flight', label: '[PLACEHOLDER] Court 3 — Flight', district: 'courts', at: [-64, -38], radius: 9, modes: ['dunkContest', 'dunkduel'], route: '/play/dunk', kind: 'court' },
  { id: 'court.arc', label: '[PLACEHOLDER] Court 4 — The Arc', district: 'courts', at: [-24, -38], radius: 9, modes: ['threePoint', 'carnival'], route: '/play/threepoint', kind: 'court' },
  { id: 'court.camera', label: '[PLACEHOLDER] The Camera Hoop', district: 'courts', at: [14, -70], radius: 4, modes: ['irl'], route: '/play/irl', kind: 'court' },
  // V1's home spawn: the courts' gate off the bike path (the hub loads the court and you first). From V3 the plaza is home.
  { id: 'courts.entry', label: '[PLACEHOLDER] The Court Gate', district: 'courts', at: [12, -20], radius: 3, modes: [], route: '', kind: 'court' },
  { id: 'plaza.home', label: '[PLACEHOLDER] Home', district: 'plaza', at: [64, 80], radius: 3, modes: [], route: '', kind: 'plaza' },
  // ── V4: the other Venice places ──────────────────────────────────────────────────────────────────────────────────────
  { id: 'skate.bowl', label: '[PLACEHOLDER] The Bowl', district: 'skatepark', at: [0, -160], radius: 12, modes: ['skateboarding'], route: '/play/skateboard', kind: 'skatepark' },
  { id: 'surf.lineup', label: '[PLACEHOLDER] The Lineup', district: 'surf', at: [-128, 224], radius: 14, modes: ['surfing'], route: '/play/surf', kind: 'water' },
  { id: 'volley.nets', label: '[PLACEHOLDER] The Nets', district: 'volley', at: [-64, 32], radius: 10, modes: ['volleyball'], route: '/play/volleyball', kind: 'beach' },
  { id: 'paddle.courts', label: '[PLACEHOLDER] Paddle Courts', district: 'paddle', at: [0, 96], radius: 10, modes: ['tennis', 'tiebreak'], route: '/play/tennis', kind: 'court' },
  { id: 'bike.start', label: '[PLACEHOLDER] The Start Line', district: 'bikepath', at: [12, 140], radius: 6, modes: ['sprint'], route: '/play/sprint', kind: 'track' },
  { id: 'gym.ring', label: '[PLACEHOLDER] The Ring', district: 'gym', at: [-8, 32], radius: 8, modes: ['karateVersus', 'mixedcombat', 'duel', 'showdown'], route: '/play/karate-vs', kind: 'ring' },
  { id: 'gym.weights', label: '[PLACEHOLDER] The Weight Pen', district: 'gym', at: [14, 22], radius: 6, modes: [], route: '/train', kind: 'gym' },
  { id: 'bowl.field', label: '[PLACEHOLDER] Beach Bowl', district: 'beachbowl', at: [-64, -160], radius: 14, modes: ['football'], route: '/play/football', kind: 'field' },
  { id: 'pitch.spot', label: '[PLACEHOLDER] The Spot', district: 'beachpitch', at: [-64, 96], radius: 10, modes: ['soccer'], route: '/play/soccer', kind: 'field' },
  { id: 'sandlot.plate', label: '[PLACEHOLDER] Home Plate', district: 'sandlot', at: [128, 32], radius: 10, modes: ['baseball', 'derby'], route: '/play/baseball', kind: 'diamond' },
  // ── V3: the boardwalk spine ──────────────────────────────────────────────────────────────────────────────────────────
  { id: 'stage.cypher', label: '[PLACEHOLDER] The Stage', district: 'stage', at: [64, -96], radius: 9, modes: ['dance', 'music', 'acting'], route: '/play/dance', kind: 'stage' },
  { id: 'screen.night', label: '[PLACEHOLDER] The Screen', district: 'screen', at: [64, -32], radius: 9, modes: ['whoSceneIt'], route: '/play/who-scene-it', kind: 'screen' },
  { id: 'arcade.cabinets', label: '[PLACEHOLDER] The Arcade', district: 'arcade', at: [64, 32], radius: 8, modes: ['brainBrawl'], route: '/play/brain-brawl', kind: 'arcade' },
  // ── the doors to the zones (replace the gates where a zone fits better; coordinator 2026-11-12) ─────────────────────
  { id: 'plaza.shuttle', label: '[PLACEHOLDER] The Shuttle Stop', district: 'plaza', at: [80, 100], radius: 6, modes: [], route: '', kind: 'transit', zone: '*' },
  { id: 'pier.end', label: '[PLACEHOLDER] The Pier End (boat)', district: 'pier', at: [-150, 160], radius: 6, modes: [], route: '', kind: 'pier', zone: 'coast' },
  { id: 'rooftops.lift', label: '[PLACEHOLDER] The Rooftop Lift', district: 'rooftops', at: [128, -224], radius: 6, modes: [], route: '', kind: 'transit', zone: 'city' },
  { id: 'artwalls.gap', label: '[PLACEHOLDER] The Gap in the Wall', district: 'artwalls', at: [0, -232], radius: 6, modes: [], route: '', kind: 'town', zone: 'wilds' },
  { id: 'marina.dock', label: '[PLACEHOLDER] The Marina Lot', district: 'marina', at: [128, 224], radius: 8, modes: [], route: '', kind: 'canal', zone: 'city' },
];

/**
 * The open zones (owner 2026-11-12: "BIG OPEN ZONES joined by a hub town"). Themes are drawn from the venues the modes
 * already ship (the inventory). Sizes are in 64 m pieces: the first cut is what a phone holds at budget today (plan §
 * "What scale is realistic"); the full size is where the zone grows once streaming is proven.
 */
export const ZONES: readonly Zone[] = [
  { id: 'coast', name: '[PLACEHOLDER] The Coast & Islands', theme: 'Islands, reefs and a harbour town: sea between every island.',
    from: ['coastal-links (golf)', 'golf_loop', 'surf: sunset-point, reef', 'aero: coconut-cove', 'kart: harbor-run', 'volleyball: night-beach'],
    homes: ['golf'], extraSpots: ['surfing', 'aeroAces', 'velocityKart', 'volleyball'],
    firstPieces: [6, 6], fullPieces: [12, 12], door: 'pier', phase: 'V5', color: '#2f8fa8' },
  { id: 'wilds', name: '[PLACEHOLDER] The Temple Wilds', theme: 'Forest, a shrine on a cliff, a sunken temple and a dam: the story\'s first chapter.',
    from: ['dojo (karate)', 'karate_endless: Shadow Gauntlet', 'combat: cliff, dojo', 'freerun: sunken-temple, hydro-dam', 'courts: canopy, blossom', 'adventure w1'],
    homes: ['karateEndless', 'storyMode'], extraSpots: ['freerun', 'karateVersus', 'hoops1v1'],
    firstPieces: [6, 6], fullPieces: [10, 12], door: 'artwalls', phase: 'V6', color: '#4f8a3f' },
  { id: 'city', name: '[PLACEHOLDER] The Neon City', theme: 'Rooftops, a stadium district, a freight yard and a race circuit at night.',
    from: ['kart: rooftop-circuit, stadium-oval', 'freerun: neon-rooftop, freight-terminal', 'stadiums: gridiron, soccer-stadium, baseball-park', 'combat: cage, rooftop, foundry', 'courts: rooftop', 'aero: neon-skyline', 'dance: neon-club'],
    homes: ['velocityKart', 'freerun'], extraSpots: ['football', 'soccer', 'baseball', 'derby', 'duel', 'hoops3v3', 'dance'],
    firstPieces: [6, 6], fullPieces: [12, 12], door: 'rooftops', phase: 'V7', color: '#7a4fc0' },
  { id: 'alpine', name: '[PLACEHOLDER] The Mountain', theme: 'One mountain: a long run down the east face, a kicker park, a glacier and a summit road.',
    from: ['snowboard: alpine-run, night-park, glacier (mountain-slope)', 'big air: bigair-run', 'kart: alpine-descent, summit-climb'],
    homes: ['snowboarding', 'bigAir'], extraSpots: ['velocityKart'],
    firstPieces: [4, 11], fullPieces: [10, 14], door: 'plaza', phase: 'V7', color: '#a8c8e8' },
  { id: 'canyon', name: '[PLACEHOLDER] The Canyon & Sky', theme: 'A red-rock gorge, mesas, a caldera: room to fly.',
    from: ['aero: redrock-canyon, ember-caldera, frostbite-caverns', 'adventure br: mesa, tower tiles'],
    homes: ['aeroAces'], extraSpots: [],
    firstPieces: [8, 8], fullPieces: [16, 16], door: 'plaza', phase: 'V7', color: '#c0603a' },
];

// ── pure lookups ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

/** A hub cell's footprint in metres. */
export function cellRect(i: number, j: number): Rect {
  const minX = HUB_MIN_X + i * PIECE_M, minZ = HUB_MIN_Z + j * PIECE_M;
  return { minX, maxX: minX + PIECE_M, minZ, maxZ: minZ + PIECE_M };
}

/** The cell under a hub point, or null outside the hub. */
export function cellAt(x: number, z: number): Cell | null {
  const i = Math.floor((x - HUB_MIN_X) / PIECE_M), j = Math.floor((z - HUB_MIN_Z) / PIECE_M);
  return i >= 0 && i < HUB_COLS && j >= 0 && j < HUB_ROWS ? c(i, j) : null;
}

const districtByCell = new Map<string, District>();
for (const d of DISTRICTS) for (const [i, j] of d.cells) districtByCell.set(`${i},${j}`, d);

export function districtAt(x: number, z: number): District | null {
  const cell = cellAt(x, z);
  return cell ? districtByCell.get(`${cell[0]},${cell[1]}`) ?? null : null;
}

export function districtById(id: string): District | undefined {
  return DISTRICTS.find((d) => d.id === id);
}

/** The spot whose radius holds (x, z), nearest first; null when none. The walk-up trigger. */
export function spotAt(x: number, z: number): Spot | null {
  let best: Spot | null = null, bestD = Infinity;
  for (const s of SPOTS) {
    const d = Math.hypot(x - s.at[0], z - s.at[1]);
    if (d <= s.radius && d < bestD) { best = s; bestD = d; }
  }
  return best;
}

/**
 * The streaming tiers of every hub cell for a player at (x, z) — the phone plan (VENICE-HUB-PLAN.md "Loading"):
 * 'full' = the player's cell and its 8 neighbours (Chebyshev distance ≤ 1), 'lod' = the next ring (≤ 2), 'far' = the rest
 * (one merged silhouette for the whole hub).
 */
export type Tier = 'full' | 'lod' | 'far';
export function tiersAround(x: number, z: number, full = 1, lod = 2): Map<string, Tier> {
  const here = cellAt(x, z) ?? c(Math.max(0, Math.min(HUB_COLS - 1, Math.floor((x - HUB_MIN_X) / PIECE_M))), Math.max(0, Math.min(HUB_ROWS - 1, Math.floor((z - HUB_MIN_Z) / PIECE_M))));
  const out = new Map<string, Tier>();
  for (let j = 0; j < HUB_ROWS; j++) for (let i = 0; i < HUB_COLS; i++) {
    const d = Math.max(Math.abs(i - here[0]), Math.abs(j - here[1]));
    out.set(`${i},${j}`, d <= full ? 'full' : d <= lod ? 'lod' : 'far');
  }
  return out;
}

/** The hub's home spawn: where a new arrival and a cold start stand. V1 and V2: the court gate; from V3: the plaza. */
export function hubHome(phase: Phase): Spot {
  return SPOTS.find((s) => s.id === (phase === 'V1' || phase === 'V2' ? 'courts.entry' : 'plaza.home'))!;
}
