// PLACE LOOKS — three places for every mode that had one (2026-09-18).
//
// Owner: "3 map/arena/environment per mode minimum." The hoops modes pick a court location, the board sports a venue,
// the racers a circuit, the combat modes an arena. Ten modes still had exactly one room — the one their venue spec
// authored. A LOOK is the cheap, honest version of a place for a spec-mounted mode: the same playing surface (the
// court's size and lines are the game and never change), a different sky, floor colour, horizon and dressing. It is
// applied over the spec at mount (NexusVenue.applyLook), picked on the boot splash like the others (`?place=`).
//
// The FIRST look of every list is `home`: no overrides at all, so the default is exactly what shipped before this file.

import type { BackdropKind, GroundKind, PropKind } from './NexusWebScene';
import type { VenueMood } from '../scene/moods';
import type { BackdropFamily } from '../visual/Backdrops';
import { FREERUN_TRACKS } from './freeRunTracks';

export interface PlaceLook {
  id: string; name: string; sub: string; tint: string;
  /** The sky and the light. Omitted = the spec's own. */
  sky?: { top: string; bottom: string; fog: string; sun: string; ambient?: number; fogDensity?: number };
  backdrop?: BackdropKind;
  /** Floor colour / line colour / surface kind. The size and the markings are the spec's — they are the game. */
  ground?: { color?: string; line?: string; kind?: GroundKind };
  /** The CC0 prop dressing set (visual/venuePropSets): a name, or null for none. Omitted = the spec's default. */
  propSet?: string | null;
  /** Dressing ADDED to the spec's props (its goals, nets and crowd stay). */
  props?: Array<{ kind: PropKind; position: [number, number, number]; color?: string; scale?: number; rotationY?: number }>;
  /**
   * HAND-BUILT WORLDS (sprint, free run) have no venue spec to lay a look over: the mode reads this instead — the light
   * rig's mood and the painted backdrop (the harness reads both through the mode's getters at mount) and the colours of
   * the things it builds, keyed the way the mode names them (sprint: turf, track; free run: ground, vault, wall, ledge…).
   */
  world?: { mood: VenueMood; backdrop: BackdropFamily; colors: Record<string, string> };
}

const home = (name: string, sub: string, tint: string): PlaceLook => ({ id: 'home', name, sub, tint });
const lamp = (x: number, z: number, color: string) => ({ kind: 'lamp' as PropKind, position: [x, 0, z] as [number, number, number], color });
const palm = (x: number, z: number) => ({ kind: 'palm' as PropKind, position: [x, 0, z] as [number, number, number] });

const NIGHT = { top: '#0b0f1e', bottom: '#1e1035', fog: '#140c24', sun: '#9ad7ff', ambient: 0.42 };
const NEON = { top: '#12062a', bottom: '#3a0a4a', fog: '#24083a', sun: '#ff7ad9', ambient: 0.5 };
const DAWN = { top: '#ffb7d5', bottom: '#ffd9a0', fog: '#f3c9b8', sun: '#fff1d6', ambient: 0.8 };
const EMBER = { top: '#2a1810', bottom: '#5a2a14', fog: '#3a1e12', sun: '#ffb070', ambient: 0.45 };
const DESERT = { top: '#8fd3ff', bottom: '#f7c77f', fog: '#e9c9a0', sun: '#fff4d6', ambient: 0.95, fogDensity: 0.002 };
const OVERCAST = { top: '#C9D3DC', bottom: '#8E9AA6', fog: '#B9C2CA', sun: '#FFF4E6', ambient: 0.7, fogDensity: 0.003 };
const BEACH = { top: '#ffc48a', bottom: '#12406b', fog: '#1e5c8c', sun: '#fff0cc', ambient: 0.85 };

/** Keyed by the game component's splash mode id (BootSplash `modeId`). */
export const PLACE_LOOKS: Record<string, PlaceLook[]> = {
  football: [
    home('Gridiron Sovereign', 'THE STADIUM AT DUSK', '#9fb7ff'),
    { id: 'beach-bowl', name: 'Beach Bowl', sub: 'A GRIDIRON ON THE SAND · PALMS ON THE SIDELINE', tint: '#ffd166', sky: BEACH, backdrop: 'beach', propSet: 'beach-court', props: [palm(-26, -30), palm(26, -30), palm(-28, 30), palm(28, 30)] },
    { id: 'dome-night', name: 'The Dome', sub: 'UNDER THE LIGHTS · NEON RAFTERS', tint: '#7dd3fc', sky: NEON, backdrop: 'neon', ground: { color: '#1f5a30', line: '#bfe9ff' }, propSet: null, props: [lamp(-24, -28, '#7dd3fc'), lamp(24, -28, '#f472b6'), lamp(-24, 28, '#f472b6'), lamp(24, 28, '#7dd3fc')] },
  ],
  carnival: [
    home('Carnival Court', 'GAME NIGHT ON THE PURPLE COURT', '#FFE66D'),
    { id: 'boardwalk', name: 'Boardwalk', sub: 'VENICE AT SUNSET · THE PIER BEHIND THE HOOP', tint: '#ffb36b', sky: BEACH, backdrop: 'beach', ground: { color: '#3b6bb5', line: '#ffe66d' }, propSet: 'venice-court', props: [palm(-13, -18), palm(13, -18)] },
    { id: 'neon-block', name: 'Neon Block', sub: 'A ROOFTOP AT NIGHT · THE CITY BELOW', tint: '#f472b6', sky: NEON, backdrop: 'neon', ground: { color: '#2a1140', line: '#22d3ee' }, propSet: 'night-rooftop', props: [lamp(-11, -16, '#22d3ee'), lamp(11, -16, '#f472b6')] },
  ],
  tennis: [
    home('Center Court', 'HARDCOURT UNDER A DUSK SKY', '#2B6CB0'),
    { id: 'clay', name: 'Red Clay', sub: 'THE SLOW COURT · LONG RALLIES', tint: '#C2542D', sky: DESERT, backdrop: 'stadium', ground: { color: '#B5502A', line: '#FFFFFF', kind: 'clay' } },
    { id: 'grass', name: 'The Lawn', sub: 'GRASS · A FAST, LOW BOUNCE', tint: '#3E8A47', sky: OVERCAST, backdrop: 'links', ground: { color: '#3E8A47', line: '#FFFFFF', kind: 'pitch' }, propSet: 'links' },
  ],
  volleyball: [
    home('Beach Pro', 'THE SAND AT GOLDEN HOUR', '#E0C08A'),
    { id: 'night-beach', name: 'Night Beach', sub: 'FLOODLIT SAND · THE SURF IN THE DARK', tint: '#9ad7ff', sky: NIGHT, backdrop: 'ocean', ground: { color: '#c8ac7a', line: '#bfe9ff' }, props: [lamp(-11, -16, '#9ad7ff'), lamp(11, -16, '#9ad7ff'), lamp(-11, 16, '#9ad7ff'), lamp(11, 16, '#9ad7ff')] },
    { id: 'gym', name: 'The Gym', sub: 'A WOODEN FLOOR · INDOOR RULES', tint: '#C98A4B', sky: { top: '#3a3f4a', bottom: '#5a5f6a', fog: '#4a4f5a', sun: '#fff4e6', ambient: 0.8, fogDensity: 0.002 }, backdrop: 'city', ground: { color: '#C98A4B', line: '#FFFFFF', kind: 'court' }, propSet: 'gym' },
  ],
  derby: [
    home('Pro Diamond', 'THE BALLPARK IN DAYLIGHT', '#E8D5A8'),
    { id: 'sandlot', name: 'Sandlot', sub: 'DRY TURF · A CITY BLOCK BEHIND THE PLATE', tint: '#c9a56b', sky: DESERT, backdrop: 'city', ground: { color: '#7a8a3a', line: '#d9c39a' }, propSet: null },
    { id: 'night-dome', name: 'Night Game', sub: 'UNDER THE LIGHTS', tint: '#9ad7ff', sky: NIGHT, backdrop: 'stadium', ground: { color: '#2a6b3a', line: '#e8d5a8' }, props: [lamp(-30, -40, '#e8f0ff'), lamp(30, -40, '#e8f0ff'), lamp(-30, 40, '#e8f0ff'), lamp(30, 40, '#e8f0ff')] },
  ],
  golf: [
    home('Coastal Links', 'THE LOOP BY THE SEA', '#3B8A4E'),
    { id: 'desert', name: 'Desert Course', sub: 'DRY AIR · THE BALL FLIES', tint: '#f7c77f', sky: DESERT, backdrop: 'mountains', ground: { color: '#6f9a45', line: '#FFFFFF' }, propSet: null },
    { id: 'alpine-dawn', name: 'Alpine Dawn', sub: 'A HIGH COURSE AT FIRST LIGHT', tint: '#ffb7d5', sky: DAWN, backdrop: 'mountains', ground: { color: '#3f8f5a', line: '#FFFFFF' }, propSet: 'links' },
  ],
  penalty: [
    home('Global Pitch', 'THE STADIUM AT NIGHT', '#2E7D46'),
    { id: 'street-cage', name: 'Street Cage', sub: 'A CAGED PITCH UNDER THE STREETLIGHTS', tint: '#22d3ee', sky: NEON, backdrop: 'city', ground: { color: '#2f6a3a', line: '#bfe9ff' }, propSet: null, props: [lamp(-14, -24, '#22d3ee'), lamp(14, -24, '#22d3ee'), lamp(-14, 24, '#f472b6'), lamp(14, 24, '#f472b6')] },
    { id: 'beach-pitch', name: 'Beach Pitch', sub: 'GRASS BY THE WATER · A DAWN SHOOTOUT', tint: '#ffd166', sky: DAWN, backdrop: 'beach', propSet: 'beach-court', props: [palm(-30, -36), palm(30, -36)] },
  ],
  dance: [
    home('The Studio', 'MIRRORS AND A WOODEN FLOOR', '#ff9d5c'),
    { id: 'neon-club', name: 'Neon Club', sub: 'THE FLOOR AT MIDNIGHT', tint: '#f472b6', sky: NEON, backdrop: 'neon', ground: { color: '#1a0a2a', line: '#22d3ee' }, propSet: null, props: [lamp(-7, -7, '#22d3ee'), lamp(7, -7, '#f472b6'), lamp(-7, 7, '#f472b6'), lamp(7, 7, '#22d3ee')] },
    { id: 'rooftop-dusk', name: 'Rooftop Dusk', sub: 'THE CITY BEHIND YOU · THE SUN GOING DOWN', tint: '#ffb36b', sky: EMBER, backdrop: 'city', ground: { color: '#3a3541', line: '#ffb36b' }, propSet: 'night-rooftop' },
  ],
  brainbrawl: [
    home('Neuro Arena', 'THE QUIZ IN THE DARK', '#5E5CE6'),
    { id: 'studio-day', name: 'Daytime Studio', sub: 'A BRIGHT SET · THE AUDIENCE CAN SEE YOU', tint: '#ffd166', sky: { top: '#dfe7f0', bottom: '#f7f3ea', fog: '#eef0f2', sun: '#ffffff', ambient: 0.95, fogDensity: 0.002 }, backdrop: 'city', ground: { color: '#e8e4dc', line: '#333a4a' }, propSet: null },
    { id: 'arcade-night', name: 'Arcade Night', sub: 'PINK AND CYAN · THE CABINETS HUMMING', tint: '#f472b6', sky: NEON, backdrop: 'neon', ground: { color: '#12082a', line: '#f472b6' }, props: [lamp(-8, -8, '#22d3ee'), lamp(8, -8, '#f472b6'), lamp(-8, 8, '#f472b6'), lamp(8, 8, '#22d3ee')] },
  ],
  sprint: [
    home('Stadium Straight', 'THE TARTAN UNDER A CLEAR SKY', '#a8432f'),
    { id: 'beach-dash', name: 'Beach Dash', sub: 'A BLUE TRACK ON THE SAND · THE SEA BESIDE LANE ONE', tint: '#3b6bb5', world: { mood: 'goldenHour', backdrop: 'ocean', colors: { turf: '#cdb47c', track: '#3b6bb5' } } },
    { id: 'night-meet', name: 'Night Meet', sub: 'FLOODLIGHTS · THE STANDS FULL', tint: '#9ad7ff', world: { mood: 'nightGame', backdrop: 'stadium', colors: { turf: '#2f5a30', track: '#7a2e3a' } } },
  ],
  // FREE RUN: the four tracks (nexus/freeRunTracks.ts) ARE its places — the pick is the course.
  freerun: FREERUN_TRACKS.map((t) => ({ id: t.id, name: t.name, sub: t.sub, tint: t.tint, world: t.world })),
  showdown: [
    home('Sovereign Dojo', 'THE SHRINE COURTYARD', '#FF2D55'),
    { id: 'night-dojo', name: 'Night Dojo', sub: 'LANTERNS ON THE GRAVEL · THE SHRINE DARK', tint: '#9ad7ff', sky: NIGHT, backdrop: 'dojo', ground: { color: '#8f8a80', line: '#4a4038' }, props: [lamp(-7, 7, '#FFD79A'), lamp(7, 7, '#FFD79A')] },
    { id: 'ember-forge', name: 'Ember Forge', sub: 'A FOUNDRY FLOOR · THE FURNACE BEHIND', tint: '#ff7b3d', sky: EMBER, backdrop: 'city', ground: { color: '#2a2622', line: '#ff7b3d', kind: 'street' }, propSet: null, props: [lamp(-8, -8, '#ff7b3d'), lamp(8, -8, '#ff7b3d'), lamp(-8, 8, '#ff7b3d'), lamp(8, 8, '#ff7b3d')] },
  ],
};

export const PLACE_MODE_IDS = new Set(Object.keys(PLACE_LOOKS));

export function looksFor(modeId: string): PlaceLook[] {
  return PLACE_LOOKS[modeId] ?? [];
}

export const PLACE_KEY_PREFIX = 'fel-place-';

/** The player's pick for a mode: `?place=` wins, then the remembered pick, then home. Undefined for a mode with no looks. */
export function readPlaceLook(modeId: string): PlaceLook | undefined {
  const list = looksFor(modeId);
  if (!list.length) return undefined;
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('place');
      const byQuery = list.find((l) => l.id === q);
      if (byQuery) return byQuery;
      const s = window.localStorage.getItem(PLACE_KEY_PREFIX + modeId);
      const byStore = list.find((l) => l.id === s);
      if (byStore) return byStore;
    }
  } catch { /* private mode: home */ }
  return list[0];
}

export function writePlaceLook(modeId: string, id: string): void {
  try { window.localStorage.setItem(PLACE_KEY_PREFIX + modeId, id); } catch { /* convenience only */ }
}

/** Does this look change anything? `home` does not. */
export function isHomeLook(look: PlaceLook | undefined): boolean {
  return !look || (!look.sky && !look.backdrop && !look.ground && look.propSet === undefined && !look.props?.length && !look.world);
}
