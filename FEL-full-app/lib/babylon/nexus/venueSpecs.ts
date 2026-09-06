// venueSpecs — all 20 venues, as TYPED VALUES.
//
// These are TypeScript, not JSON, on purpose. M72 shipped Swift scene
// descriptors that were valid JSON and completely undecodable, because
// hand-written JSON drifted from what the type actually expected and nothing
// checked the two against each other. The fix there was to generate JSON from
// the types. Here there is a stronger option: remove the boundary. A typo is
// a compile error, a renamed field breaks the build, and `tsc` is the
// validator — there is no serialised copy to drift.
//
// ART DIRECTION (continuous with M59/M61): saturated dusk skies, a warm key
// against a cool fill, exposure just over 1 and real contrast. Each venue owns
// a palette so the 20 modes do not blur into one another.

import type { NexusWebSpec, BackdropKind } from './NexusWebScene';

const dusk = (
  top: string, bottom: string, fog: string, sun: string, ambient = 0.55,
  backdrop?: NexusWebSpec['environment']['backdrop'], fogDensity = 0.008,
) => ({
  skyTop: top, skyBottom: bottom, fogColor: fog, fogDensity,
  ambient, sunDirection: [-0.4, -0.85, 0.35] as [number, number, number], sunColor: sun,
  grade: { exposure: 1.15, contrast: 1.35, vignette: 0.35 },
  backdrop,
});

/** Five bodies for a 3v3 court, arranged as an actual possession rather than
 *  a line-up: three defenders spread, two allies off-ball. */
const threeVthree = (): NexusWebSpec['actors'] => [
  { id: 'you', role: 'player', position: [0, 0, 6], facing: Math.PI, color: '#FF6B00' },
  { id: 'ally1', role: 'ally', position: [-3.4, 0, 4.2], facing: Math.PI },
  { id: 'ally2', role: 'ally', position: [3.1, 0, 4.6], facing: Math.PI },
  { id: 'foe1', role: 'foe', position: [-2.2, 0, 1.4], facing: 0 },
  { id: 'foe2', role: 'foe', position: [1.8, 0, 0.9], facing: 0 },
  { id: 'foe3', role: 'foe', position: [0.2, 0, -1.6], facing: 0 },
];

const beachDressing: NexusWebSpec['props'] = [
  { kind: 'palm', position: [-9.5, 0, -6] },
  { kind: 'palm', position: [9.5, 0, -6], scale: 0.9 },
  { kind: 'palm', position: [-10.5, 0, 5], scale: 1.1 },
  { kind: 'lamp', position: [11, 0, 0], color: '#FFD79A' },
  { kind: 'lamp', position: [-11, 0, 0], color: '#FFD79A' },
];

export const VENUE_SPECS: Record<string, NexusWebSpec> = {
  // ── basketball family ───────────────────────────────────────────────────
  basketball_h2h: {
    modeId: 'basketball_h2h', name: 'Ones', venue: 'Venice Beach Court',
    environment: dusk('#F0637A', '#1B2A6B', '#2A3C7A', '#FFB36B'),
    // A HALF court, like the game played on it. It was a full 16x28 centred on
    // the origin with FULL-court markings — two keys, a halfway line, a centre
    // circle — for a one-basket game that never crosses z 0, so the painted key
    // sat at the opposite end from the hoop. Offset 7.6 puts the baseline 1.575m
    // behind the rim; 19m of depth covers the play area (z 0.5..14.5).
    ground: {
      kind: 'court', size: [16, 19], offset: [0, 7.6],
      color: '#1B7FB5', lineColor: '#F2F6FF', markings: 'halfcourt',
    },
    props: [
      // Same half-court correction as 3v3: OneVOneMode clamps play to
      // z 0.5..14.5 and shoots at RIM (0, 3.05, -0.6), but this venue put
      // baskets at both ends of a full court, so the nearest hoop stood behind
      // the players at z +13.22. -1.32 puts the rim on the mode's RIM.
      { kind: 'hoop', position: [0, 0, -1.32], color: '#FF6B00' },
      // L4 was EMPTY — this venue had no crowd at all, so a 1v1 on the most
      // famous blacktop in the world was played in front of nobody. One stand
      // behind the basket, one behind the play, matching 3v3's placement.
      ...beachDressing,
    ],
    actors: [
      { id: 'you', role: 'player', position: [-1.2, 0, 5], facing: Math.PI, color: '#FF6B00' },
      { id: 'foe', role: 'foe', position: [1.0, 0, 1.5], facing: 0 },
    ],
    camera: { alpha: -Math.PI / 2, beta: 1.12, radius: 17, target: [0, 1.4, 2], fov: 0.86 },
  },

  basketball_dunk: {
    modeId: 'basketball_dunk', name: 'Flight Night', venue: 'Venice Beach Court',
    // M110's procedural horizon backdrops were built and then wired to NOTHING —
    // not one venue in this file set `backdrop`, so every sky in the game was the
    // cheap 4px two-stop gradient the system exists to replace. That flat wall
    // behind the hoop is the whole reason this venue read as a colour field
    // rather than as Venice at dusk. 'beach' paints a sun, its glow, an ocean
    // with light on the water, and a palm line along the horizon.
    environment: dusk('#F2B48C', '#2B3A78', '#C9A184', '#FFD2A0', 0.6, 'beach', 0.0006),   // soft peach fill, deep-blue ground bounce: the red cast is gone   // golden-hour haze, thin: the boardwalk scenery reads to the horizon
    ground: { kind: 'court', size: [16, 28], color: '#1B7FB5', lineColor: '#F2F6FF', markings: 'halfcourt' },
    props: [
      // Owner call 2026-09-05: the red hoop banner is gone from every basketball court — the backboard and rim stand alone.
      { kind: 'hoop', position: [0, 0, -11], color: '#FF3B30' },
      // Owner call 2026-09-05: the baseline crowd tiers are gone from every basketball court — the dark stepped
      // stand read as a black bar behind the hoop in every frame. The horizon (backdrop, trees, skyline) carries the depth.
      ...beachDressing,
    ],
    actors: [{ id: 'you', role: 'player', position: [0, 0, 6.5], facing: Math.PI, color: '#FF6B00' }],
    camera: { alpha: -Math.PI / 2, beta: 1.05, radius: 14, target: [0, 2.0, -2], fov: 0.9 },
  },

  basketball_3v3: {
    modeId: 'basketball_3v3', name: '3v3', venue: 'Streetball Arena',
    environment: dusk('#C24BE0', '#150E3D', '#2B1D5E', '#FFB0E0', 0.5),
    // A HALF court, positioned around the half the mode actually plays.
    // It was a full 18x30 centred on the origin with FULL-court markings — two
    // keys, a halfway line and a centre circle — on a game that uses one basket
    // and never crosses z 0. The painted key sat at the far end from the hoop.
    // Offset 7.8 puts the baseline 1.575m behind the rim, where a baseline goes,
    // and the 20m depth covers the play area (z 0.5..15) with room behind it.
    ground: {
      kind: 'court', size: [18, 20], offset: [0, 7.8],
      color: '#2B4A8F', lineColor: '#FFFFFF', markings: 'halfcourt',
    },
    props: [
      // ONE basket, at the end the mode actually plays to.
      // 3v3 streetball is a HALF-COURT game — first to 21, one hoop — and
      // ThreeVThreeMode enforces that: clampToHalfCourt keeps every player in
      // z 0.5..15 and RIM is (0, 3.05, -0.6). This venue gave it a FULL court
      // with baskets at both ends, z -13.5 and +13.5, so the nearest real hoop
      // stood at z +14.22 — BEHIND the players — while they shot at empty air
      // just past their own baseline. A hoop prop sits 0.72 behind its rim, so
      // -1.32 puts the rim exactly on the mode's RIM.
      { kind: 'hoop', position: [0, 0, -1.32], color: '#BF5AF2' },
      // Stands behind the basket and behind the play, not 24m out past the
      // ends of a court that no longer extends that far.
      { kind: 'lamp', position: [11, 0, 2], color: '#E0B0FF' },
      { kind: 'lamp', position: [-11, 0, 12], color: '#E0B0FF' },
    ],
    actors: threeVthree(),
    camera: { alpha: -Math.PI / 2, beta: 1.0, radius: 24, target: [0, 1.6, 2], fov: 0.88 },
  },

  basketball_irl: {
    modeId: 'basketball_irl', name: 'IRL Dunk', venue: 'Your Court',
    environment: dusk('#7FD4FF', '#0F3A5F', '#1E5680', '#FFF2C2', 0.75),
    ground: { kind: 'court', size: [16, 24], color: '#37744A', lineColor: '#F5F5F5', markings: 'halfcourt' },
    props: [{ kind: 'hoop', position: [0, 0, -10], color: '#FF9500' }, { kind: 'lamp', position: [9, 0, -4] }],
    actors: [{ id: 'you', role: 'player', position: [0, 0, 4], facing: Math.PI, color: '#34C759' }],
    camera: { alpha: -Math.PI / 2, beta: 1.15, radius: 13, target: [0, 1.5, -2], fov: 0.88 },
  },

  court_carnival: {
    modeId: 'court_carnival', name: 'Game Night', venue: 'Carnival Court',
    environment: dusk('#FF9F45', '#3A1150', '#5E2170', '#FFE0A0', 0.65),
    ground: { kind: 'court', size: [18, 26], color: '#8E3BB5', lineColor: '#FFE66D', markings: 'halfcourt' },
    props: [
      { kind: 'hoop', position: [0, 0, -11], color: '#FFD60A' },
      { kind: 'banner', position: [-7, 0, -12], color: '#FF2D55' },
      { kind: 'banner', position: [7, 0, -12], color: '#0A84FF' },
      { kind: 'lamp', position: [10, 0, 0], color: '#FFE66D' },
      { kind: 'lamp', position: [-10, 0, 0], color: '#FF6FD8' },
      { kind: 'podium', position: [0, 0, 9], color: '#FFD60A' },
    ],
    actors: [
      { id: 'you', role: 'player', position: [-1.5, 0, 5], facing: Math.PI, color: '#FFD60A' },
      { id: 'foe', role: 'foe', position: [1.5, 0, 2], facing: 0 },
    ],
    camera: { alpha: -Math.PI / 2, beta: 1.05, radius: 18, target: [0, 1.5, 0], fov: 0.9 },
  },

  // ── combat ──────────────────────────────────────────────────────────────
  karate_h2h: {
    modeId: 'karate_h2h', name: 'Karate', venue: 'Sovereign Dojo',
    environment: dusk('#C9D3DC', '#8E9AA6', '#B9C2CA', '#FFF4E6', 0.7, undefined, 0.002),   // owner's Luma reference 2026-09-06 (Shimogamo Jinja): soft overcast daylight over gravel
    ground: { kind: 'mat', size: [14, 14], color: '#C6BFB2', lineColor: '#6B5B4A', markings: 'none' },   // shrine gravel (same reference)
    props: [
      // Walls at ±8 put the dojo shell INSIDE the camera's resting position
      // (radius 11, beta 1.15 resolves to z ≈ -8.6) and the frame filled with
      // flat paint. Moved out to ±12; the framing guard in the loader now
      // catches this class at build time.
      { kind: 'wall', position: [0, 0, -12], color: '#1A1220' },
      { kind: 'wall', position: [0, 0, 12], rotationY: Math.PI, color: '#1A1220' },
      { kind: 'banner', position: [0, 0, -11.6], color: '#FF2D55' },
      { kind: 'lamp', position: [6, 0, -6], color: '#FFD79A' },
      { kind: 'lamp', position: [-6, 0, -6], color: '#FFD79A' },
    ],
    actors: [
      { id: 'you', role: 'player', position: [-2, 0, 1.5], facing: Math.PI / 2, color: '#FFFFFF' },
      { id: 'foe', role: 'foe', position: [2, 0, 1.5], facing: -Math.PI / 2, color: '#E5484D' },
    ],
    // Higher beta and a wider radius than the iOS `fight` preset: the M69
    // standoff work showed a tight dojo is exactly where a low camera fails.
    camera: { alpha: -Math.PI / 2, beta: 1.18, radius: 10, target: [0, 1.3, 1.0], fov: 0.85 },
  },

  karate_endless: {
    modeId: 'karate_endless', name: 'The Hundred', venue: 'Shadow Gauntlet',
    environment: dusk('#C9D3DC', '#8E9AA6', '#B9C2CA', '#FFF4E6', 0.7, undefined, 0.002),   // shrine daylight (same reference)
    // 24x24, not 16x16. The camera's box is derived from the ground, so a mat
    // exactly as big as the play area leaves the camera nowhere to stand: the
    // player clamps to ±8, the bounds clamp the camera to ±6.8, and a player at
    // the edge ends up with the camera 1.2m behind them and themselves out of
    // frame. Every [FEL-FRAME] line this mode produced was a hero at ±8.
    // A wave brawler with five enemies wants the space anyway.
    // markings 'ring', not 'none': the mode clamps the fighter to a radius and
    // that boundary has to be visible. It is also now a DISC rather than a
    // square, because a square clamp has CORNERS, and every remaining
    // [FEL-FRAME] this mode produced was a fighter pinned at (+-7.5, +-7.5) --
    // the one place a facing-derived camera at a 3.1m radius has no room to
    // swing. Karate VS uses a disc for the same reason.
    ground: { kind: 'mat', size: [24, 24], color: '#C6BFB2', lineColor: '#6B5B4A', markings: 'ring' },   // owner's Luma reference 2026-09-06 (Shimogamo Jinja): pale raked gravel, dark lines
    props: [
      { kind: 'wall', position: [0, 0, -14], color: '#B9AFA0' },   // shrine courtyard: a low stone wall, not a black void
      { kind: 'lamp', position: [7, 0, -5], color: '#FFD79A' },
      { kind: 'lamp', position: [-7, 0, -5], color: '#FFD79A' },
      { kind: 'banner', position: [0, 0, -13.6], color: '#BF5AF2' },
    ],
    actors: [
      { id: 'you', role: 'player', position: [0, 0, 3], facing: Math.PI, color: '#FFFFFF' },
      { id: 'foe1', role: 'foe', position: [-2.5, 0, -1], facing: 0 },
      { id: 'foe2', role: 'foe', position: [2.5, 0, -1.5], facing: 0 },
      { id: 'foe3', role: 'foe', position: [0, 0, -3.5], facing: 0 },
    ],
    camera: { alpha: -Math.PI / 2, beta: 1.1, radius: 13, target: [0, 1.3, 0], fov: 0.88 },
  },

  // ── field & court sports ────────────────────────────────────────────────
  soccer: {
    modeId: 'soccer', name: 'Soccer', venue: 'Global Pitch',
    environment: dusk('#5BC0EB', '#0B3D2E', '#12513C', '#FFF6C8', 0.8),
    ground: { kind: 'pitch', size: [34, 50], color: '#2E7D46', lineColor: '#FFFFFF', markings: 'soccer' },
    props: [
      { kind: 'goal', position: [0, 0, -24], color: '#FFFFFF' },
      { kind: 'goal', position: [0, 0, 24], rotationY: Math.PI, color: '#FFFFFF' },
      { kind: 'crowdTier', position: [0, 0, -38] },
      { kind: 'crowdTier', position: [0, 0, 38], rotationY: Math.PI },
    ],
    actors: [
      { id: 'you', role: 'player', position: [-2, 0, 8], facing: Math.PI, color: '#34C759' },
      { id: 'foe', role: 'foe', position: [0, 0, -20], facing: 0, color: '#FFD60A' },
    ],
    camera: { alpha: -Math.PI / 2, beta: 1.0, radius: 34, target: [0, 1.5, 0], fov: 0.9 },
  },

  football: {
    modeId: 'football', name: 'Football', venue: 'Gridiron Sovereign',
    environment: dusk('#FF8C42', '#0D2818', '#173D26', '#FFE0A8', 0.7),
    ground: { kind: 'pitch', size: [30, 54], color: '#256B38', lineColor: '#FFFFFF', markings: 'none' },
    props: [
      { kind: 'goal', position: [0, 0, -26], color: '#FFD60A' },
      { kind: 'goal', position: [0, 0, 26], rotationY: Math.PI, color: '#FFD60A' },
      { kind: 'crowdTier', position: [0, 0, -40] },
      { kind: 'crowdTier', position: [0, 0, 40], rotationY: Math.PI },
    ],
    actors: [
      { id: 'you', role: 'player', position: [-1, 0, 10], facing: Math.PI, color: '#34C759' },
      { id: 'foe', role: 'foe', position: [1.5, 0, 4], facing: 0 },
    ],
    camera: { alpha: -Math.PI / 2, beta: 1.02, radius: 32, target: [0, 1.5, 2], fov: 0.9 },
  },

  baseball: {
    modeId: 'baseball', name: 'Baseball', venue: 'Pro Diamond',
    environment: dusk('#8ED0F0', '#123A1E', '#1E5230', '#FFF0B8', 0.85),
    ground: { kind: 'diamond', size: [46, 46], color: '#2F7A42', lineColor: '#E8D5A8', markings: 'none' },
    props: [
      { kind: 'tee', position: [0, 0, 8], color: '#C8A15A' },
      { kind: 'flag', position: [-16, 0, -16], color: '#FF3B30' },
      { kind: 'flag', position: [16, 0, -16], color: '#0A84FF' },
      { kind: 'crowdTier', position: [0, 0, 27], rotationY: Math.PI },
    ],
    actors: [
      { id: 'you', role: 'player', position: [0, 0, 8], facing: Math.PI, color: '#FF9F0A' },
      { id: 'foe', role: 'foe', position: [0, 0, -4], facing: 0 },
    ],
    camera: { alpha: -Math.PI / 2, beta: 1.05, radius: 26, target: [0, 1.5, 2], fov: 0.9 },
  },

  tennis: {
    modeId: 'tennis', name: 'Tennis', venue: 'Center Court',
    environment: dusk('#FFB37A', '#2A0F12', '#4A1E22', '#FFE7B0', 0.7),
    ground: { kind: 'hardcourt', size: [16, 34], color: '#2B6CB0', lineColor: '#FFFFFF', markings: 'tennis' },
    props: [
      { kind: 'net', position: [0, 0, 0], color: '#F0F0F0' },
      { kind: 'crowdTier', position: [0, 0, -28] },
      { kind: 'crowdTier', position: [0, 0, 28], rotationY: Math.PI },
    ],
    actors: [
      { id: 'you', role: 'player', position: [0, 0, 12], facing: Math.PI, color: '#FFD60A' },
      { id: 'foe', role: 'foe', position: [0.5, 0, -12], facing: 0 },
    ],
    camera: { alpha: -Math.PI / 2, beta: 0.95, radius: 26, target: [0, 1.4, 2], fov: 0.88 },
  },

  volleyball: {
    modeId: 'volleyball', name: 'Volleyball', venue: 'Beach Pro',
    environment: dusk('#FFC48A', '#12406B', '#1E5C8C', '#FFF0CC', 0.85),
    // 15 x 24: an 18m x 9m court with a 3m free zone on every side, which is
    // the regulation surround. It was 18 x 30 — wider than the court is long in
    // one axis and 12m of dead sand in the other — and the painted lines were
    // placed off the texture edge rather than off the court, so the sideline a
    // player could see sat at x = ±8.5 while the rules called ±4.5 out.
    ground: { kind: 'sand', size: [15, 24], color: '#E0C08A', lineColor: '#FFFFFF', markings: 'volleyball' },
    props: [
      { kind: 'net', position: [0, 0, 0], scale: 1.1, color: '#FFFFFF' },
      { kind: 'palm', position: [-11, 0, -8] },
      { kind: 'palm', position: [11, 0, 8], scale: 0.9 },
    ],
    actors: [
      { id: 'you', role: 'player', position: [-1, 0, 8], facing: Math.PI, color: '#64D2FF' },
      { id: 'foe', role: 'foe', position: [1, 0, -8], facing: 0 },
    ],
    camera: { alpha: -Math.PI / 2, beta: 1.0, radius: 22, target: [0, 1.5, 0], fov: 0.9 },
  },

  golf: {
    modeId: 'golf', name: 'Golf', venue: 'Sovereign Links',
    environment: { ...dusk('#5FA3E0', '#C9DDF0', '#BFD3C6', '#FFF4D6', 0.45), fogDensity: 0.003 },   // links daylight: a blue sky feeds the IBL; thin haze so the green stays green
    ground: { kind: 'green', size: [50, 60], color: '#3B8A4E', lineColor: '#FFFFFF', markings: 'none' },
    props: [
      { kind: 'tee', position: [0, 0, 20], color: '#4FA45B' },
      { kind: 'flag', position: [2, 0, -18], color: '#FF3B30' },
      { kind: 'palm', position: [-14, 0, -6], scale: 1.2 },
      { kind: 'palm', position: [15, 0, 2] },
    ],
    actors: [{ id: 'you', role: 'player', position: [0, 0, 20], facing: Math.PI, color: '#30D158' }],
    camera: { alpha: -Math.PI / 2, beta: 1.05, radius: 24, target: [0, 1.4, 10], fov: 0.9 },
  },

  // ── board & board-adjacent ──────────────────────────────────────────────
  skateboarding: {
    modeId: 'skateboarding', name: 'Skateboarding', venue: 'Sovereign Skatepark',
    environment: dusk('#FFA45C', '#171720', '#2A2A38', '#FFD9A0', 0.6),
    ground: { kind: 'street', size: [30, 30], color: '#4A4F5C', lineColor: '#FF9F0A', markings: 'none' },
    props: [
      { kind: 'ramp', position: [-6, 0, -4], rotationY: 0.2, color: '#5C6270' },
      { kind: 'ramp', position: [7, 0, 3], rotationY: Math.PI - 0.2, color: '#5C6270' },
      { kind: 'wall', position: [0, 0, -14], color: '#22242E' },
      { kind: 'banner', position: [0, 0, -13.6], color: '#FF9F0A' },
      { kind: 'lamp', position: [12, 0, -8] },
    ],
    actors: [{ id: 'you', role: 'player', position: [0, 0, 6], facing: Math.PI, color: '#FF9F0A' }],
    camera: { alpha: -Math.PI / 2, beta: 1.1, radius: 20, target: [0, 1.4, 0], fov: 0.92 },
  },

  snowboarding: {
    modeId: 'snowboarding', name: 'Snowboarding', venue: 'Alpine Pro',
    environment: dusk('#BEE3FF', '#4A6E92', '#9EC4E0', '#FFFFFF', 1.0),
    ground: { kind: 'snow', size: [36, 60], color: '#E8F2FA', lineColor: '#BFD8EA', markings: 'none' },
    props: [
      { kind: 'ramp', position: [-5, 0, -8], color: '#DCE9F5' },
      { kind: 'flag', position: [6, 0, -4], color: '#0A84FF' },
      { kind: 'flag', position: [-7, 0, 4], color: '#FF3B30' },
    ],
    actors: [{ id: 'you', role: 'player', position: [0, 0, 14], facing: Math.PI, color: '#0A84FF' }],
    camera: { alpha: -Math.PI / 2, beta: 1.0, radius: 26, target: [0, 1.5, 2], fov: 0.92 },
  },

  surfing: {
    modeId: 'surfing', name: 'Surfing', venue: 'Pipeline Peak',
    environment: { ...dusk('#FF9A6B', '#00243D', '#0A4A6B', '#FFD1A0', 0.7), fogDensity: 0.014 },
    ground: { kind: 'water', size: [60, 60], color: '#0E6E96', lineColor: '#FFFFFF', markings: 'none' },
    props: [
      { kind: 'palm', position: [-20, 0, 18], scale: 1.3 },
      { kind: 'palm', position: [-24, 0, 12] },
    ],
    actors: [{ id: 'you', role: 'player', position: [0, 0, 6], facing: Math.PI, color: '#00B4D8' }],
    camera: { alpha: -Math.PI / 2, beta: 1.08, radius: 20, target: [0, 1.2, 0], fov: 0.95 },
  },

  gymnastics: {
    modeId: 'gymnastics', name: 'Gymnastics', venue: 'Evolution Gym',
    environment: dusk('#C99BFF', '#12081F', '#241338', '#FFE0FF', 0.6),
    ground: { kind: 'mat', size: [22, 22], color: '#5B2A8C', lineColor: '#E8D0FF', markings: 'none' },
    props: [
      { kind: 'beam', position: [0, 0, -3], color: '#C8A15A' },
      { kind: 'podium', position: [-7, 0, 4], color: '#BF5AF2' },
      { kind: 'wall', position: [0, 0, -12], color: '#180C28' },
      { kind: 'lamp', position: [9, 0, -6], color: '#E0B0FF' },
      { kind: 'lamp', position: [-9, 0, -6], color: '#E0B0FF' },
    ],
    actors: [{ id: 'you', role: 'player', position: [0, 0, 4], facing: Math.PI, color: '#BF5AF2' }],
    camera: { alpha: -Math.PI / 2, beta: 1.08, radius: 16, target: [0, 1.4, -1], fov: 0.9 },
  },

  // ── mind & meta ─────────────────────────────────────────────────────────
  brain_brawl: {
    modeId: 'brain_brawl', name: 'Brain Brawl', venue: 'Neuro Arena',
    environment: dusk('#6E5CFF', '#05000F', '#140A2E', '#A0C0FF', 0.45),
    ground: { kind: 'stage', size: [20, 20], color: '#171034', lineColor: '#5E5CE6', markings: 'none' },
    props: [
      { kind: 'podium', position: [-3, 0, 2], color: '#5E5CE6' },
      { kind: 'podium', position: [3, 0, 2], color: '#FF2D55' },
      { kind: 'wall', position: [0, 0, -10], color: '#0A0620' },
      { kind: 'banner', position: [0, 0, -9.6], color: '#5E5CE6' },
      { kind: 'lamp', position: [8, 0, -4], color: '#5E5CE6' },
      { kind: 'lamp', position: [-8, 0, -4], color: '#FF2D55' },
    ],
    actors: [
      { id: 'you', role: 'player', position: [-3, 0.5, 2], facing: Math.PI, color: '#5E5CE6' },
      { id: 'foe', role: 'foe', position: [3, 0.5, 2], facing: Math.PI },
    ],
    camera: { alpha: -Math.PI / 2, beta: 1.12, radius: 14, target: [0, 1.5, 0], fov: 0.88 },
  },

  who_scene_it: {
    modeId: 'who_scene_it', name: 'Who Scene It', venue: 'Scene Vault',
    environment: dusk('#FFB35C', '#140A05', '#2E1A0E', '#FFD9A0', 0.5),
    ground: { kind: 'stage', size: [20, 20], color: '#241408', lineColor: '#FFB35C', markings: 'none' },
    props: [
      { kind: 'podium', position: [-3, 0, 2], color: '#FF9F0A' },
      { kind: 'podium', position: [3, 0, 2], color: '#0A84FF' },
      { kind: 'wall', position: [0, 0, -10], color: '#160C06' },
      { kind: 'banner', position: [0, 0, -9.6], color: '#FF9F0A' },
      { kind: 'lamp', position: [7, 0, -5], color: '#FFD9A0' },
      { kind: 'lamp', position: [-7, 0, -5], color: '#FFD9A0' },
    ],
    actors: [
      { id: 'you', role: 'player', position: [-3, 0.5, 2], facing: Math.PI, color: '#FF9F0A' },
      { id: 'foe', role: 'foe', position: [3, 0.5, 2], facing: Math.PI, color: '#0A84FF' },
    ],
    camera: { alpha: -Math.PI / 2, beta: 1.12, radius: 14, target: [0, 1.5, 0], fov: 0.88 },
  },

  market_browse: {
    modeId: 'market_browse', name: 'Creator Market', venue: 'Market Hall',
    environment: dusk('#7FE0FF', '#0A1626', '#14283F', '#DDF2FF', 0.8),
    ground: { kind: 'stage', size: [24, 24], color: '#16283D', lineColor: '#4FC3F7', markings: 'none' },
    props: [
      // A browsing surface: display plinths, no competitors, no goal.
      { kind: 'podium', position: [-5, 0, 0], color: '#0A84FF' },
      { kind: 'podium', position: [0, 0, -2], color: '#BF5AF2' },
      { kind: 'podium', position: [5, 0, 0], color: '#FF9F0A' },
      { kind: 'banner', position: [0, 0, -11], color: '#0A84FF' },
      { kind: 'wall', position: [0, 0, -12], color: '#0C1828' },
      { kind: 'lamp', position: [9, 0, -5] },
      { kind: 'lamp', position: [-9, 0, -5] },
    ],
    actors: [],
    camera: { alpha: -Math.PI / 2, beta: 1.05, radius: 17, target: [0, 1.6, -1], fov: 0.9 },
  },

  // ── ship pass 4 (2026-09-04): specs sized to the modes' real play, with the baked maps ──
  // The kit fields these replace were 60×90 (golf), 70×90 (ballpark), 50×70 (pitch) and a
  // 44 m gridiron; the holes, mound, penalty spot and field lines below match the modes' code.
  golf_loop: {
    modeId: 'golf_loop', name: 'The Loop', venue: 'Coastal Links',
    environment: dusk('#9FE0FF', '#0F3A22', '#1C5636', '#FFFAD8', 0.9),
    ground: { kind: 'green', size: [60, 90], color: '#3B8A4E', lineColor: '#FFFFFF', markings: 'none' },
    props: [
      // the mode places its own tee, ball and flag (holes at z 26–39, x −10..10); scenery only here
      { kind: 'palm', position: [-24, 0, 12], scale: 1.2 }, { kind: 'palm', position: [26, 0, 30] }, { kind: 'palm', position: [-22, 0, 40], scale: 1.1 },
      { kind: 'lamp', position: [-20, 0, -8] }, { kind: 'lamp', position: [20, 0, -8] },
      { kind: 'crowdTier', position: [0, 0, -44] },
    ],
    actors: [],
    camera: { alpha: -Math.PI / 2, beta: 1.05, radius: 24, target: [0, 1.4, 10], fov: 0.9 },
  },
  derby: {
    modeId: 'derby', name: 'Derby', venue: 'Pro Diamond',
    environment: dusk('#8ED0F0', '#123A1E', '#1E5230', '#FFF0B8', 0.85),
    ground: { kind: 'diamond', size: [70, 90], color: '#2F7A42', lineColor: '#E8D5A8', markings: 'none' },
    props: [
      { kind: 'crowdTier', position: [0, 0, 44], rotationY: Math.PI }, { kind: 'crowdTier', position: [-30, 0, 30], rotationY: Math.PI * 0.75 }, { kind: 'crowdTier', position: [30, 0, 30], rotationY: -Math.PI * 0.75 },
      { kind: 'lamp', position: [-28, 0, -20] }, { kind: 'lamp', position: [28, 0, -20] },
      { kind: 'banner', position: [0, 0, -42], color: '#E8D5A8' },
    ],
    actors: [],
    camera: { alpha: -Math.PI / 2, beta: 1.05, radius: 26, target: [0, 1.5, 2], fov: 0.9 },
  },
  penalty: {
    modeId: 'penalty', name: 'Penalty', venue: 'Global Pitch',
    environment: dusk('#5BC0EB', '#0B3D2E', '#12513C', '#FFF6C8', 0.8),
    // the spot is the origin and the goal line sits at z 10.4 (the mode builds the goal)
    ground: { kind: 'pitch', size: [50, 70], color: '#2E7D46', lineColor: '#FFFFFF', markings: 'none' },
    props: [
      { kind: 'crowdTier', position: [0, 0, 24] }, { kind: 'crowdTier', position: [-26, 0, 6], rotationY: Math.PI / 2 }, { kind: 'crowdTier', position: [26, 0, 6], rotationY: -Math.PI / 2 },
      { kind: 'lamp', position: [-22, 0, 16] }, { kind: 'lamp', position: [22, 0, 16] },
    ],
    actors: [],
    camera: { alpha: -Math.PI / 2, beta: 1.0, radius: 34, target: [0, 1.5, 0], fov: 0.9 },
  },
  football_rush: {
    modeId: 'football_rush', name: 'Football Rush', venue: 'Gridiron Sovereign',
    environment: dusk('#FF8C42', '#0D2818', '#173D26', '#FFE0A8', 0.7),
    // the mode plays x −20..20 over 40 m of length; the kit gridiron was widened to 44 m
    ground: { kind: 'pitch', size: [44, 52], color: '#256B38', lineColor: '#FFFFFF', markings: 'none' },
    props: [
      { kind: 'crowdTier', position: [-30, 0, 20], rotationY: Math.PI / 2 }, { kind: 'crowdTier', position: [30, 0, 20], rotationY: -Math.PI / 2 },
      { kind: 'lamp', position: [-26, 0, 0] }, { kind: 'lamp', position: [26, 0, 0] }, { kind: 'lamp', position: [-26, 0, 40] }, { kind: 'lamp', position: [26, 0, 40] },
    ],
    actors: [],
    camera: { alpha: -Math.PI / 2, beta: 1.02, radius: 32, target: [0, 1.5, 20], fov: 0.9 },
  },
};

// M75 — Dance venue ("The Cypher"). The one creative discipline where the
// AVATAR is the content, so it needs a stage, a key light on the performer and
// a crowd to perform to. Appended so the rest of VENUE_SPECS is byte-identical.
VENUE_SPECS.dance = {
  modeId: 'dance', name: 'The Cypher', venue: 'The Cypher',
  environment: {
    skyTop: '#FF2D95', skyBottom: '#0A0018', fogColor: '#1A0033', fogDensity: 0.02,
    ambient: 0.40, sunDirection: [-0.25, -0.9, 0.3], sunColor: '#FFD1F0',
    grade: { exposure: 1.22, contrast: 1.45, vignette: 0.5 },
  },
  ground: { kind: 'stage', size: [20, 20], color: '#1C1030', lineColor: '#FF2D95', markings: 'none' },
  props: [
    { kind: 'podium', position: [0, 0, 0], scale: 1.4, color: '#FF2D95' },
    { kind: 'wall', position: [0, 0, -12], color: '#0B0418' },
    { kind: 'banner', position: [0, 0, -11.6], color: '#00E5FF' },
    { kind: 'crowdTier', position: [0, 0, 11], rotationY: Math.PI },
    { kind: 'lamp', position: [7, 0, -6], color: '#FF2D95' },
    { kind: 'lamp', position: [-7, 0, -6], color: '#00E5FF' },
    { kind: 'lamp', position: [9, 0, 5], color: '#FFD60A' },
    { kind: 'lamp', position: [-9, 0, 5], color: '#7B5CFF' },
  ],
  actors: [
    // y = 0.5 * podium scale = the deck surface. Stand ON the stage.
    { id: 'you', role: 'player', position: [0, 0.7, 0], facing: Math.PI, color: '#FF2D95' },
    { id: 'crowd1', role: 'foe', position: [-3.2, 0, 5.5], facing: Math.PI, color: '#00E5FF' },
    { id: 'crowd2', role: 'foe', position: [3.4, 0, 5.8], facing: Math.PI, color: '#FFD60A' },
  ],
  // Closer and lower than a sports preset: in a dance mode the body IS the
  // gameplay, so the avatar has to be legible, not surveyed from a stand.
  camera: { alpha: -Math.PI / 2, beta: 1.20, radius: 7.5, target: [0, 1.5, 0], fov: 0.86 },
};

// M110 — location-representative horizon backdrops. One map assigns each venue
// the procedural sky that matches WHERE it is (see NexusWebScene.paintBackdrop).
// Kept as a post-hoc assignment so the VENUE_SPECS literals above stay untouched
// and any venue omitted here simply keeps the plain gradient.
const BACKDROPS: Record<string, BackdropKind> = {
  basketball_h2h: 'beach',   basketball_dunk: 'beach',   volleyball: 'beach',
  basketball_3v3: 'city',    skateboarding: 'city',      basketball_irl: 'city',
  market_browse: 'city',
  soccer: 'stadium',         football: 'stadium',        baseball: 'stadium',
  tennis: 'stadium',
  snowboarding: 'mountains', surfing: 'ocean',           golf: 'links',
  golf_loop: 'links',        derby: 'stadium',           penalty: 'stadium',
  football_rush: 'stadium',
  karate_h2h: 'dojo',        karate_endless: 'dojo',     gymnastics: 'dojo',
  brain_brawl: 'neon',       who_scene_it: 'neon',       court_carnival: 'neon',
  dance: 'neon',
};
for (const [id, bk] of Object.entries(BACKDROPS)) {
  const spec = VENUE_SPECS[id];
  if (spec) spec.environment.backdrop = bk;
}

// Venue maps — the baked Meshy environment GLBs (scripts/map/pipeline.mts)
// mounted as the actual court/world around the play (visual/VenueMaps.ts).
// Only maps that SURVIVED the pipeline are listed: gridiron, neuro-arena and
// sand-court have no textures at all (single grey material, no vertex color)
// and stay procedural until the art exists.
const VENUE_MAP_KEYS: Record<string, string> = {
  // venice-blacktop is intentionally NOT mounted: the scan's painted court
  // sits off the play area with no clean offset candidate (see map-data.ts).
  // ship pass 4 (2026-09-04): every basketball venue stands on the scanned Venice court —
  // the rim sits at world origin in all four specs, where the map's painted baseline hoop was tuned to land
  basketball_3v3: 'venice-blue-court', basketball_dunk: 'venice-blue-court', basketball_h2h: 'venice-blue-court', court_carnival: 'venice-blue-court',
  skateboarding: 'venice-skatepark',
  tennis: 'tennis-court',
  soccer: 'soccer-stadium',
  baseball: 'baseball-park',
  golf: 'coastal-links', derby: 'baseball-park', penalty: 'soccer-stadium',   // golf_loop: no map — coastal-links is a ±15 m island, the course runs to z 39
  // karate: NO map (owner's Luma reference 2026-09-06, Shimogamo Jinja) — the baked dojo pavilion sat over the mat and roofed the
  // fight; the mat is open gravel now with the Meshy shrine standing behind it (prop set 'dojo').
  gymnastics: 'dojo',
  snowboarding: 'mountain-slope',
  surfing: 'surf-break',
  market_browse: 'shop',
};
for (const [id, key] of Object.entries(VENUE_MAP_KEYS)) {
  const spec = VENUE_SPECS[id];
  if (spec) spec.mapKey = key;
}

export const ALL_MODE_IDS = Object.keys(VENUE_SPECS);

export function specFor(modeId: string): NexusWebSpec | null {
  return VENUE_SPECS[modeId] ?? null;
}
