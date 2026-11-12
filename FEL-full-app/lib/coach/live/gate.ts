// lib/coach/live/gate.ts — COACH-LIVE (2026-10-25): who may open a live room, and what the client may send in it.
//
// A ROOM OPENS FOR ONE OF TWO THINGS, and nothing else:
//   p_<programId>  a program between a coach and a client who are on each other's LIVE roster (a CoachClient row for
//                  this coach and client, not ended — lib/coach/rosterLookup.ts's meaning of "live roster").
//   b_<bookingId>  a booked live session (coach-store Booking, kind live_1on1, PAID, inside its join window): the
//                  coach-store call's own rule, lib/coach-store/policy.ts decideJoin, reused as it is (adults only).
// Only the two people it names are let in; anyone else gets the same 404 whether or not the room exists.
//
// AGE (the rules this app already has; nothing new):
//   · the client goes through the coach loop's teen gate (lib/coach/teenGate.ts): under 13 never; a blank year is asked
//     for first; a teen needs a guardian consent that covers coach training. A refusal closes the room for BOTH sides.
//   · the coach must be a verified adult (lib/privacy/verifiedAdult.ts). assumption: no product surface lets a minor
//     coach; a 1-on-1 call with a client is held to the adult line.
//   · LIVE VIDEO from the client is for verified adults only. A teen who passes the gate gets POSE + VOICE: the coach
//     sees a stick figure, the reps and the flags, and they talk — no picture leaves the teen's phone. Whether a guardian
//     consent can ever cover live video is an OWNER CALL (docs/COACH-LIVE.md): no consent wording today says it does, so
//     none is read as covering it.
//
// NEVER RANKED OR PAID: a live room writes nothing to sessions, scores, ladders or wallets, and takes no payment (a
// booking was paid for in the coach store, before; this gate only reads that it was).
//
// Pure: rows in, a decision out. lib/coach/live/server.ts reads the rows.

import { decideJoin } from '@/lib/coach-store/policy';
import type { TeenGateResult } from '@/lib/coach/teenGate';

export type LiveRole = 'coach' | 'client';

export type LiveRoomRef = { kind: 'program'; id: string } | { kind: 'booking'; id: string };

const ID = /^[A-Za-z0-9_-]{6,64}$/;

/** "p_<id>" | "b_<id>" → the room it names, or null. */
export function parseRoomId(raw: unknown): LiveRoomRef | null {
  if (typeof raw !== 'string') return null;
  const m = /^([pb])_(.+)$/.exec(raw);
  if (!m || !ID.test(m[2])) return null;
  return { kind: m[1] === 'p' ? 'program' : 'booking', id: m[2] };
}

export const roomIdOf = (r: LiveRoomRef): string => `${r.kind === 'program' ? 'p' : 'b'}_${r.id}`;

export interface ProgramRoomFacts {
  kind: 'program';
  /** null when no such program. */
  program: { coachId: string; clientId: string } | null;
  /** A CoachClient row for this coach and client with endedAt null. */
  rosterLive: boolean;
}

export interface BookingRoomFacts {
  kind: 'booking';
  booking: { coachUserId: string; clientUserId: string; status: string; kind: string; startsAt: Date | null; endsAt: Date | null } | null;
  /** decideJoin's adult check, for the user asking. */
  askerAdult: boolean;
}

export interface LiveGateInput {
  userId: string;
  room: ProgramRoomFacts | BookingRoomFacts;
  coachAdult: boolean;
  /** The CLIENT's teen gate (lib/coach/teenGateServer.ts readTeenGate). */
  client: TeenGateResult;
  /** The client is a VERIFIED adult (the strict line: a year gap of more than 18). Live video needs it. */
  clientVerifiedAdult: boolean;
  now: Date;
}

export type LiveGateRefusal = 'not_found' | 'roster_ended' | 'coach_not_adult' | 'not_open_yet' | 'session_ended' | 'not_adult'
  | 'under_13' | 'age_required' | 'guardian_consent_required';

export type LiveGate =
  | { ok: true; role: LiveRole; coachId: string; clientId: string; clientBand: 'adult' | 'teen'; clientVideo: boolean }
  | { ok: false; status: number; error: LiveGateRefusal };

export function decideLiveRoom(input: LiveGateInput): LiveGate {
  const { userId, room } = input;
  let coachId: string, clientId: string;
  if (room.kind === 'program') {
    const p = room.program;
    if (!p || (userId !== p.coachId && userId !== p.clientId)) return { ok: false, status: 404, error: 'not_found' };
    if (!room.rosterLive) return { ok: false, status: 403, error: 'roster_ended' };
    coachId = p.coachId; clientId = p.clientId;
  } else {
    const b = room.booking;
    if (!b) return { ok: false, status: 404, error: 'not_found' };
    const d = decideJoin({
      isParty: userId === b.clientUserId || userId === b.coachUserId, isAdult: room.askerAdult,
      status: b.status, kind: b.kind, startsAt: b.startsAt, endsAt: b.endsAt, now: input.now,
    });
    if (!d.ok) return { ok: false, status: d.status, error: d.error as LiveGateRefusal };
    coachId = b.coachUserId; clientId = b.clientUserId;
  }
  if (coachId === clientId) return { ok: false, status: 404, error: 'not_found' };
  if (!input.coachAdult) return { ok: false, status: 403, error: 'coach_not_adult' };
  if (!input.client.ok) return { ok: false, status: 403, error: input.client.error };
  const band = input.client.band;
  return { ok: true, role: userId === coachId ? 'coach' : 'client', coachId, clientId, clientBand: band, clientVideo: band === 'adult' && input.clientVerifiedAdult };
}

/** Plain words for a refusal, for the room's page. */
export const REFUSAL_WORDS: Readonly<Record<LiveGateRefusal, string>> = {
  not_found: 'This live session is not available.',
  roster_ended: 'This coaching relationship has ended, so a live session cannot open.',
  coach_not_adult: 'Live sessions are hosted by adult coaches only.',
  not_open_yet: 'This session is not open yet. It opens 10 minutes before the start.',
  session_ended: 'This session has ended.',
  not_adult: 'Booked live sessions are for adults only.',
  under_13: 'Live sessions are not available for this account.',
  age_required: 'Add the athlete\'s birth year before a live session can open.',
  guardian_consent_required: 'A parent or guardian needs to approve coaching for this athlete before a live session can open.',
};
