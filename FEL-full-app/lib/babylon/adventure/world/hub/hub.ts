/**
 * The hub (Phase B; plan pillar 8, "KH1 structure": "A hub; worlds reached through gates"). A home space the party
 * returns to between chapters: a round plaza with a home dais (the save beacon and the partner's nest, dressing for
 * now), the WORLD GATES on its rim, and an UPPER LEVEL eight metres up that only flight reaches (plan decision 10: "the
 * hub's upper level opens with it").
 *
 *   gate.w1   World 1 (Chapter 1): open.
 *   gate.w2   on the upper level, StoryHub's `requires: 'flight'` rule: sealed until flight, and with no chapter behind
 *             it yet (Chapter 2 is the owner's next chapter).
 *   gate.w3   on the plaza: sealed, no chapter yet.
 * Only World 1 opens (owner's Phase B scope). The south rim is low and open to the void: Chapter 1 ends with the party's
 * first flight home across it, onto the landing (`hub.landing`).
 *
 * THE LAYOUT (metres; the hub sits at the map's origin): the plaza x −36..36, z −36..36 at y 0; a 1 m rim (above A1's
 * 0.45 m step, so it holds the party in without a wall's look); the upper level x −36..36, z 22..36 at y 8; a short
 * rail along the east side, a toy to grind between chapters.
 * Every name [PLACEHOLDER]; every number [TUNE].
 */

import { flat, block } from '../pieces';
import { v3, type StoryWorldSpec } from '../story/spec';

export const HUB_ID = 'hub';
export const HUB_UPPER_Y = 8;

export function buildHub(): StoryWorldSpec {
  return {
    id: HUB_ID,
    title: '[PLACEHOLDER] The Hub',
    area: { minX: -36, maxX: 36, minZ: -36, maxZ: 36 },
    killY: -30,
    pieces: [
      flat('hub.floor', -36, 36, -36, 36, 0),
      // the rim: west, east, and the south lip over the void
      block('hub.rim.w', -36, -35, -36, 22, 1), block('hub.rim.e', 35, 36, -36, 22, 1), block('hub.rim.s', -36, 36, -36, -35, 1),
      // the upper level (flight only) and the home dais
      block('hub.upper', -36, 36, 22, 36, HUB_UPPER_Y),
      block('hub.dais', -4, 4, -12, -6, 0.3),
    ],
    rails: [
      { id: 'hub.rail', points: [v3(26, 1.2, -28), v3(26, 1.2, 16)], speedBias: 1, switches: [] },
    ],
    walls: [],
    spawns: {
      'hub.home': { pos: v3(0, 0.3, -8), yaw: 0 },
      'hub.landing': { pos: v3(0, 0, -22), yaw: 0 },
      'hub.gate.w1': { pos: v3(-22, 0, 4), yaw: -Math.PI / 2 },
      'hub.upper': { pos: v3(0, HUB_UPPER_Y, 28), yaw: Math.PI },
    },
    encounters: [],
    gates: [
      { id: 'gate.w1', label: '[PLACEHOLDER] World 1', pos: v3(-22, 0, 4), radius: 2.6, to: { worldId: 'w1', spawnId: 'w1.start' } },
      { id: 'gate.w2', label: '[PLACEHOLDER] World 2', pos: v3(0, HUB_UPPER_Y, 30), radius: 2.6, to: null, requires: 'flight' },
      { id: 'gate.w3', label: '[PLACEHOLDER] World 3', pos: v3(22, 0, 4), radius: 2.6, to: null },
    ],
    decor: [
      { x: 0, z: -11.2, w: 1.2, d: 1.2, h: 2.4, y: 0.3, color: '#38bdf8' },  // the save beacon
      { x: -3, z: -14, w: 3, d: 2, h: 0.5, color: '#a16207' },             // the partner's nest
    ],
  };
}
