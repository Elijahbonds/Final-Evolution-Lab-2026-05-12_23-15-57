// lib/party/controls.ts — the phone layout for the game the room picked (MULTIPLAYER lane, 2026-10-06).
//
// A party room is ONE Controller Link room that lives across games: the TV swaps the layout on every phone when the
// game changes (HostSession.setConfig), instead of every game opening its own room and making everyone scan again.
//
//   BUZZ games get four answer buttons in the card's own colours and letters (brainbrawl-babylon.tsx OPTS), the same
//   on every phone — route.ts turns the second phone's into the d-pad the game reads as P2.
//   TURNS games get the game's own registry layout (schemas/registry.ts), unchanged.
//
// The room's capacity (maxPlayers) is PARTY_CAPACITY whatever the game seats, so a fourth friend can still get in and
// wait for the next game.

import type { ModeControllerConfig } from '@/lib/controller-link/types';
import { controllerConfigFor } from '@/lib/controller-link/schemas/registry';
import type { PartyMode } from './catalog';
import { PARTY_CAPACITY } from './seats';

/** The answer buttons: the card's order and colours (A B C D on the TV = A B X Y on a pad). */
export const ANSWER_BUTTONS = [
  { action: 'A', label: 'A', color: '#22d3ee' },
  { action: 'B', label: 'B', color: '#f43f5e' },
  { action: 'X', label: 'C', color: '#a855f7' },
  { action: 'Y', label: 'D', color: '#facc15' },
] as const;

export function partyControllerConfig(mode: PartyMode): ModeControllerConfig {
  if (mode.style === 'buzz') {
    return {
      modeId: mode.id,
      title: mode.title,
      maxPlayers: PARTY_CAPACITY,
      askName: true,
      schemas: [{ kind: 'button', columns: 2, buttons: ANSWER_BUTTONS.map((b) => ({ ...b })) }],
    };
  }
  const base = controllerConfigFor(mode.id);
  return {
    modeId: mode.id,
    title: mode.title,
    maxPlayers: PARTY_CAPACITY,
    askName: true,
    // a turns game with no registry layout still gets a usable pad: GO on A, the d-pad as the stick
    schemas: base?.schemas ?? [
      { kind: 'dpad', dpad: { action: 'move' } },
      { kind: 'button', buttons: [{ action: 'A', label: 'GO' }, { action: 'B', label: 'B' }] },
    ],
  };
}
