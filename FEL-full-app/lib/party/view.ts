// lib/party/view.ts — the room, as one phone should see it (MULTIPLAYER lane, 2026-10-06). See protocol.ts.

import { playersBadge, type PartyMode } from './catalog';
import type { PartyPhase, PartyView } from './protocol';
import { captainKey, everyoneReady, type SeatTable } from './seats';
import { currentTurn, type TurnState } from './turns';

export interface RoomSnapshot {
  phase: PartyPhase;
  mode: PartyMode;
  table: SeatTable;
  turns: TurnState | null;
  note: string;
}

/** Whether the room may start: at least the game's minimum seated, and every seated phone ready. */
export function roomCanStart(s: Pick<RoomSnapshot, 'mode' | 'table'>): boolean {
  return s.table.seats.length >= s.mode.minPlayers && everyoneReady(s.table);
}

/** The PartyView for the phone with this peer id. Carries no id of anyone — `you` is the only identity it holds. */
export function partyViewFor(peerId: string, s: RoomSnapshot): PartyView {
  const me = `phone:${peerId}`;
  const mine = s.table.seats.find((x) => x.key === me) ?? null;
  const turn = s.turns ? currentTurn(s.turns) : null;
  return {
    phase: s.phase,
    mode: { id: s.mode.id, title: s.mode.title, players: playersBadge(s.mode), style: s.mode.style },
    seat: mine?.label ?? null,
    seats: s.table.seats.map((x) => ({
      label: x.label, name: x.name, color: x.color, ready: x.ready, kind: x.kind, connected: x.connected, you: x.key === me,
    })),
    waiting: s.table.waiting.length,
    captain: captainKey(s.table) === me,
    canStart: roomCanStart(s),
    note: s.note,
    yourGo: s.phase === 'playing' && s.mode.style === 'turns' && !!mine && turn?.seat === mine.index,
  };
}
