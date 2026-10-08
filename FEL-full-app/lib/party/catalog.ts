// lib/party/catalog.ts — the games a living room can play together, and how (MULTIPLAYER lane, 2026-10-06).
//
// Owner, 2026-10-06: "Let's make joining and playing multiplayer way easier and encouraged" — on a TV, couch-first.
// This is the honest list: a game is here only when more than one PERSON really plays it on one screen today.
//
//   BUZZ  — both players are in the same match at once. Brain Brawl and Who Scene It seat two: P1 answers on the face
//           buttons, P2 on the d-pad (lib/babylon/core/localPads.ts answerOwner). The party room turns P2's phone face
//           buttons into that d-pad (route.ts), so both phones show the same four answer buttons.
//   TURNS — one player at a time, scores side by side (a shootout, a dunk contest). Any solo game with a score works
//           this way; the room runs one attempt per player and keeps the board.
//
// NOT here, and why (the map in the lane report has the detail): the registry's maxPlayers 2/4 on karate, karate_vs and
// carnival describe a phone LAYOUT, not a second human — those modes fight an AI rival. 1v1 / 3v3 / The Hundred's
// `?net=` co-op needs the netd server (NEXT_PUBLIC_NETD_URL), which is not deployed. The Babylon pass-and-play dunk duel
// was replaced on /play/dunkduel by the camera Prove It, by owner decision, so it is not resurfaced here.

export type PartyStyle = 'buzz' | 'turns';

export interface PartyMode {
  /** The party room's key, and the Babylon / controller-link mode id. */
  id: string;
  /** MODE_INFO's key (lib/game-data.ts) — what the shelf, the shell and the results card call this mode. */
  infoKey: string;
  title: string;
  /** One line under the title on the TV. */
  blurb: string;
  style: PartyStyle;
  minPlayers: number;
  maxPlayers: number;
  /** The mode's own page, for a solo run. */
  href: string;
  /** Accent colour on the TV card. */
  color: string;
}

export const PARTY_MODES: readonly PartyMode[] = [
  {
    id: 'brainbrawl', infoKey: 'brainBrawl', title: 'Brain Brawl', style: 'buzz', minPlayers: 1, maxPlayers: 2,
    blurb: 'Quiz show. Spin the wheel, buzz first, steal their categories.', href: '/play/brain-brawl', color: '#a855f7',
  },
  {
    id: 'who_scene_it', infoKey: 'whoSceneIt', title: 'Who Scene It', style: 'buzz', minPlayers: 1, maxPlayers: 2,
    blurb: 'Name the scene before your friend does. A wrong buzz hands them the steal.', href: '/play/who-scene-it', color: '#f43f5e',
  },
  {
    id: 'threepoint', infoKey: 'threePoint', title: 'Downtown', style: 'turns', minPlayers: 1, maxPlayers: 4,
    blurb: 'Three-point shootout. Everyone shoots the same racks — best score takes it.', href: '/play/threepoint', color: '#22d3ee',
  },
  {
    id: 'dunk', infoKey: 'dunkContest', title: 'Flight Night', style: 'turns', minPlayers: 1, maxPlayers: 4,
    blurb: 'Dunk contest. One run each, the judges score it, the board decides.', href: '/play/dunk', color: '#facc15',
  },
];

export function partyModeById(id: string | null | undefined): PartyMode | null {
  return PARTY_MODES.find((m) => m.id === id) ?? null;
}

/** By MODE_INFO key (the shelf and the shell speak that), or by mode id. */
export function partyModeFor(key: string | null | undefined): PartyMode | null {
  if (!key) return null;
  return PARTY_MODES.find((m) => m.infoKey === key || m.id === key) ?? null;
}

/** The badge a tile wears: "2 PLAYERS", "1–4 PLAYERS". */
export function playersBadge(m: Pick<PartyMode, 'minPlayers' | 'maxPlayers'>): string {
  return m.minPlayers === m.maxPlayers ? `${m.maxPlayers} PLAYERS` : `${m.minPlayers}–${m.maxPlayers} PLAYERS`;
}

/** How the players share it, in two words. */
export function styleLine(m: Pick<PartyMode, 'style'>): string {
  return m.style === 'buzz' ? 'SAME TIME' : 'TAKE TURNS';
}

/** Where "play this with friends" goes: the party room with this game already picked. */
export function partyHref(key?: string | null): string {
  const m = partyModeFor(key ?? null);
  return m ? `/play/party?mode=${encodeURIComponent(m.id)}` : '/play/party';
}
