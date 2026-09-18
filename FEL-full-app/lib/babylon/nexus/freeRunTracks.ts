// FREE RUN TRACKS — the four courses of the parkour racer (owner brief, 2026-09-18).
//
// A track is a THEME the course builder reads (modes/freeRunCourse.ts): which sections it strings together, how many of
// each, and the look the world gets (a place look's `world` block: mood, backdrop family, the colours of the pieces).
// Pure data; the builder turns it into pieces, the mode into Havok boxes.

import type { VenueMood } from '../scene/moods';
import type { BackdropFamily } from '../visual/Backdrops';

export type SectionKind =
  | 'alley'        // LOW: vault boxes, a bar to slide under, loose hazards; MID: a rail; HIGH: a wall to run then ledges
  | 'shaft'        // HIGH: two facing walls to vector-rebound between; MID: a springboard; LOW: a bar
  | 'straight'     // MID: a long rail + a speed gate; LOW: hazards; HIGH: a roof
  | 'gaps'         // LOW/MID: gaps to jump (tier-wide); HIGH: ledges over them; an anchor above the widest
  | 'spillway'     // MID: a slope down then up (surf); LOW: hazards; HIGH: a roof over it
  | 'stacks'       // HIGH: container roofs with gaps, a tier-3 gate; MID: springboards; LOW: crates (vaults)
  | 'canyon'       // HIGH: a long shaft corridor; MID: springs (the tide); LOW: vaults
  | 'chokepoint';  // walls close in on the MID lane (all lanes merge), a bar and a vault inside

export interface FreeRunTrack {
  id: string; name: string; sub: string; tint: string;
  sections: SectionKind[];
  world: { mood: VenueMood; backdrop: BackdropFamily; colors: Record<string, string> };
}

export const FREERUN_TRACKS: readonly FreeRunTrack[] = [
  {
    id: 'neon-rooftop', name: 'Neon Rooftop Run', sub: 'BILLBOARD WALL-RUNS · ELEVATOR-SHAFT REBOUNDS · POWER-LINE RAILS', tint: '#22d3ee',
    sections: ['alley', 'shaft', 'straight', 'gaps', 'shaft', 'chokepoint', 'straight'],
    world: { mood: 'nightGame', backdrop: 'venice', colors: { ground: '#2a2440', vault: '#f472b6', wall: '#22d3ee', ledge: '#a78bfa', roof: '#a78bfa', rail: '#22d3ee', hazard: '#fbbf24', spring: '#34d399', gate: '#f87171', anchor: '#fde68a', slope: '#3b3552' } },
  },
  {
    id: 'hydro-dam', name: 'Overgrown Hydro-Dam', sub: 'THE SPILLWAY SURF · THE PIPE RAILS · THE TURBINE CHOKEPOINT', tint: '#34d399',
    sections: ['alley', 'spillway', 'gaps', 'straight', 'chokepoint', 'spillway', 'gaps'],
    world: { mood: 'overcast', backdrop: 'alpine', colors: { ground: '#5a6a5e', vault: '#8a7a4a', wall: '#6b7a6e', ledge: '#3fb8b0', roof: '#3fb8b0', rail: '#9aa3ad', hazard: '#c98a4b', spring: '#7dd3fc', gate: '#f87171', anchor: '#fde68a', slope: '#4f6b66' } },
  },
  {
    id: 'freight-terminal', name: 'Freight Terminal Grid', sub: 'CONTAINER STACKS · DRAFTING LANES · GATES UNDER THE CRANES', tint: '#f59e0b',
    sections: ['straight', 'stacks', 'alley', 'straight', 'stacks', 'gaps', 'chokepoint'],
    world: { mood: 'daylight', backdrop: 'ocean', colors: { ground: '#6b6f78', vault: '#c2410c', wall: '#7c2d12', ledge: '#f59e0b', roof: '#f59e0b', rail: '#e5e7eb', hazard: '#b45309', spring: '#34d399', gate: '#f87171', anchor: '#fde68a', slope: '#565a63' } },
  },
  {
    id: 'sunken-temple', name: 'Sunken Temple Highway', sub: 'THE WAVE-RIDER RUN · THE WALL-BOUND CANYON · THE AQUEDUCT GATE', tint: '#fbbf24',
    sections: ['canyon', 'gaps', 'alley', 'canyon', 'spillway', 'stacks', 'straight'],
    world: { mood: 'goldenHour', backdrop: 'ocean', colors: { ground: '#b8a888', vault: '#8a7a5a', wall: '#a08a6a', ledge: '#d9c39a', roof: '#d9c39a', rail: '#7a6a4a', hazard: '#9a8a6a', spring: '#7dd3fc', gate: '#f87171', anchor: '#fde68a', slope: '#a89878' } },
  },
];

export function trackById(id: string | null | undefined): FreeRunTrack {
  return FREERUN_TRACKS.find((t) => t.id === id) ?? FREERUN_TRACKS[0];
}
