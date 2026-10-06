// lib/party/route.ts — a phone's press, as the game should hear it from that seat (MULTIPLAYER lane, 2026-10-06).
//
// Every phone's input used to reach a game through ONE merged stream (controller-link modeBridge toInputBus → bus.emit),
// whatever seat the phone held. In a two-player quiz that made the second phone a second copy of P1: its A answered
// for P1 (measured: the map in the lane report). The games already define how two people share one stream —
// localPads.answerOwner: faces are P1, the d-pad is P2 — so the room translates by seat instead of changing any game:
//
//   BUZZ   seat 0 → its face buttons (its d-pad would answer for P2, so it is dropped);
//          seat 1 → its face buttons become the d-pad, in the card's order (A▲ B▶ X▼ Y◀ — BrainBrawlMode / WhoSceneItMode
//                   DPAD), so both phones show the same four answer buttons; its own d-pad passes as it is;
//          seat 2+ → nothing (a two-seat game).
//   TURNS  only the seat whose turn it is reaches the game; everyone else's phone is quiet until their go.
//
// START always passes from a seated player, so whoever is holding a phone can get the game off its splash.
// Pure: FelInput in, FelInput[] out.

import type { FelInput } from '@/lib/babylon/core/InputBus';
import type { PartyStyle } from './catalog';

/** A phone P2's face buttons in a buzz game, as the d-pad answer each one means: A B X Y are cards A B C D, and the
 *  modes read cards A B C D off ▲ ▶ ◀ ▼ (WhoSceneItMode / BrainBrawlMode `DPAD`, since their IMPROVE #14 2×2 grid).
 *  It said X → ▼, Y → ◀ (the old ▲ ▶ ▼ ◀ order), so a phone pressing C answered D (integration-2, 2026-10-06). */
export const FACE_TO_DPAD = { A: 'up', B: 'right', X: 'left', Y: 'down' } as const;

export interface RouteCtx {
  style: PartyStyle;
  /** The seat this input came from (0 = P1), or null for a phone that is waiting for a seat. */
  seat: number | null;
  /** Seats this game uses (a buzz game: 2). */
  seatsInGame: number;
  /** TURNS: whose go it is. */
  turnSeat?: number | null;
}

export function routeSeatInput(e: FelInput, ctx: RouteCtx): FelInput[] {
  const { seat } = ctx;
  if (seat === null || seat < 0 || seat >= ctx.seatsInGame) return [];
  if (ctx.style === 'turns') return seat === (ctx.turnSeat ?? 0) ? [e] : [];
  // BUZZ
  if (e.t === 'button' && e.btn === 'START') return [e];
  if (seat === 0) return e.t === 'dpad' ? [] : [e];
  if (seat === 1) {
    if (e.t === 'dpad') return [e];
    if (e.t === 'button' && e.btn in FACE_TO_DPAD) {
      return [{ t: 'dpad', dir: FACE_TO_DPAD[e.btn as keyof typeof FACE_TO_DPAD], pressed: e.pressed }];
    }
    return [];
  }
  return [];
}
