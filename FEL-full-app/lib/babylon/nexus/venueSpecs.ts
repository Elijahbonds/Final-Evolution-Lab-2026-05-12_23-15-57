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

const dusk = (top: string, bottom: string, fog: string, sun: string, ambient = 0.55) => ({
  skyTop: top, skyBottom: bottom, fogColor: fog, fogDensity: 0.008,
  ambient, sunDirection: [-0.4, -0.85, 0.35] as [number, number, number], sunColor: sun,
  grade: { exposure: 1.15, contrast: 1.35, vignette: 0.35 },
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
    modeId: 'basketball_h2h', name: '1v1 Hoops', venue: 'Venice Beach Court',
    environment: dusk('#F0637A', '#1B2A6B', '#2A3C7A', '#FFB36B'),
    ground: { kind: 'court', size: [16, 28], color: '#1B7FB5', lineColor: '#F2F6FF', markings: 'basketball' },
    props: [
      { kind: 'hoop', position: [0, 0, -12.5], color: '#FF6B00' },
      { kind: 'hoop', position: [0, 0, 12.5], rotationY: Math.PI, color: '#FF6B00' },
      ...beachDressing,
    ],
    actors: [
      { id: 'you', role: 'player', position: [-1.2, 0, 5], facing: Math.PI, color: '#FF6B00' },
      { id: 'foe', role: 'foe', position: [1.0, 0, 1.5], facing: 0 },
    ],
    camera: { alpha: -Math.PI / 2, beta: 1.12, radius: 17, target: [0, 1.4, 2], fov: 0.86 },
  },

  basketball_dunk: {
    modeId: 'basketball_dunk', name: 'Dunk Contest', venue: 'Venice Beach Court',
    environment: dusk('#FF7A5C', '#1A2560', '#33408A', '#FFC98A', 0.6),
    ground: { kind: 'court', size: [16, 28], color: '#1B7FB5', lineColor: '#F2F6FF', markings: 'halfcourt' },
    props: [
      { kind: 'hoop', position: [0, 0, -11], color: '#FF3B30' },
      { kind: 'banner', position: [0, 0, -14.5], color: '#FF2D55' },
      // Contest crowd on both baselines (same proven placement as 3v3) so the
      // dunk reads as a broadcast event with a stand, not an empty court.
      { kind: 'crowdTier', position: [0, 0, -17] },
      { kind: 'crowdTier', position: [0, 0, 17], rotationY: Math.PI },
      ...beachDressing,
    ],
    actors: [{ id: 'you', role: 'player', position: [0, 0, 6.5], facing: Math.PI, color: '#FF6B00' }],
    camera: { alpha: -Math.PI / 2, beta: 1.05, radius: 14, target: [0, 2.0, -2], fov: 0.9 },
  },

  basketball_3v3: {
    modeId: 'basketball_3v3', name: '3v3', venue: 'Streetball Arena',
    environment: dusk('#C24BE0', '#150E3D', '#2B1D5E', '#FFB0E0', 0.5),
    ground: { kind: 'court', size: [18, 30], color: '#2B4A8F', lineColor: '#FFFFFF', markings: 'basketball' },
    props: [
      { kind: 'hoop', position: [0, 0, -13.5], color: '#BF5AF2' },
      { kind: 'hoop', position: [0, 0, 13.5], rotationY: Math.PI, color: '#BF5AF2' },
      { kind: 'crowdTier', position: [0, 0, -24] },
      { kind: 'crowdTier', position: [0, 0, 24], rotationY: Math.PI },
      { kind: 'lamp', position: [12, 0, -8], color: '#E0B0FF' },
      { kind: 'lamp', position: [-12, 0, 8], color: '#E0B0FF' },
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
    modeId: 'court_carnival', name: 'Court Carnival', venue: 'Carnival Court',
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
    environment: dusk('#3A1220', '#0A0A12', '#1A0E18', '#FF8A6B', 0.45),
    ground: { kind: 'mat', size: [14, 14], color: '#8C2F3A', lineColor: '#F0D9A0', markings: 'none' },
    props: [
      // Walls at ±8 put the dojo shell INSIDE the camera's resting position
      // (radius 11, beta 1.15 resolves to z ≈ -8.6) and the frame filled with
      // flat paint. Moved out to ±12; the framing guard in the loader now
      // catches this class at build time.
      { kind: 'wall', position: [0, 0, -12], color: '#1A1220' },
      { kind: 'wall', position: [0, 0, 12], rotationY: Math.PI, color: '#1A1220' },
      { kind: 'banner', position: [0, 0, -11.6], color: '#FF2D55' },
      { kind: 'lamp', position: [6, 0, -6], color: '#FFCF9A' },
      { kind: 'lamp', position: [-6, 0, -6], color: '#FFCF9A' },
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
    modeId: 'karate_endless', name: 'Karate Endless', venue: 'Shadow Gauntlet',
    environment: dusk('#2A0E3A', '#07070E', '#140A1E', '#C77DFF', 0.38),
    ground: { kind: 'mat', size: [16, 16], color: '#2A1A3A', lineColor: '#BF5AF2', markings: 'none' },
    props: [
      { kind: 'wall', position: [0, 0, -14], color: '#0D0714' },
      { kind: 'lamp', position: [7, 0, -5], color: '#BF5AF2' },
      { kind: 'lamp', position: [-7, 0, -5], color: '#5E5CE6' },
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
    ground: { kind: 'sand', size: [18, 30], color: '#E0C08A', lineColor: '#FFFFFF', markings: 'volleyball' },
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
    environment: dusk('#9FE0FF', '#0F3A22', '#1C5636', '#FFFAD8', 0.9),
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
};

// M75 — Dance venue ("The Cypher"). The one creative discipline where the
// AVATAR is the content, so it needs a stage, a key light on the performer and
// a crowd to perform to. Appended so the rest of VENUE_SPECS is byte-identical.
VENUE_SPECS.dance = {
  modeId: 'dance', name: 'Dance', venue: 'The Cypher',
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
  karate_h2h: 'dojo',        karate_endless: 'dojo',     gymnastics: 'dojo',
  brain_brawl: 'neon',       who_scene_it: 'neon',       court_carnival: 'neon',
  dance: 'neon',
};
for (const [id, bk] of Object.entries(BACKDROPS)) {
  const spec = VENUE_SPECS[id];
  if (spec) spec.environment.backdrop = bk;
}

export const ALL_MODE_IDS = Object.keys(VENUE_SPECS);

export function specFor(modeId: string): NexusWebSpec | null {
  return VENUE_SPECS[modeId] ?? null;
}
