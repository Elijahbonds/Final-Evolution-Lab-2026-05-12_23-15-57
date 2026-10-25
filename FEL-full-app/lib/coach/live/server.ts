// lib/coach/live/server.ts — COACH-LIVE (2026-10-25): the server's three jobs for a live session, and nothing more.
//
//   1. THE DOOR. readLiveGate reads the rows lib/coach/live/gate.ts decides on: the program and its roster link (or
//      the booking), the coach's and the client's birth years, the client's guardian consents (the coach loop's teen
//      gate, lib/coach/teenGateServer.ts, as it is). A read that fails CLOSES the door. A decision is cached for
//      GATE_CACHE_MS per person per room, because the signal routes ask on every poll.
//   2. THE SIGNALS. The handshake (offer, answer, ICE, bye) — and, only when the direct path cannot connect, the RELAY
//      (control messages and batched pose frames) — pass through Controller Link's signal store
//      (lib/controller-link/signalStore.ts: in-memory on one instance, the KV store when CONTROLLER_LINK_KV_URL is set),
//      under a room code of our own: "live:<kind>:<id>". It has lower-case letters, and Controller Link's own routes
//      upper-case every code they are given, so they can never read or write a live room. The server sets who a
//      message is from (the caller's role) and who it is to (the other role); the body cannot.
//      What the store holds is bounded: Controller Link's MAX_MESSAGES per room (200), and its room TTL (2 h).
//   3. THE SUMMARY. The coach's End posts the structured summary; it is re-validated (session.ts parseSummary), worded
//      here (summaryText), and written as ONE ProgramMessage in the program's thread, authored by the coach. It is the
//      only row a live session writes.
//
// Never ranked or paid: nothing here touches sessions, scores, ladders, wallets or payments.

import type { PrismaClient } from '@/lib/generated/prisma';
import type { SignalStore } from '@/lib/controller-link/signalStore';
import { readTeenGate, type TeenGateDb } from '@/lib/coach/teenGateServer';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { decideLiveRoom, roomIdOf, type LiveGate, type LiveRole, type LiveRoomRef } from './gate';
import { parseSummary, summaryText } from './session';

/** The switch. Ships OFF: NEXT_PUBLIC_COACH_LIVE_ENABLED=1 (read on the server and in the browser bundle) opens it. */
export function coachLiveEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const v = (env.NEXT_PUBLIC_COACH_LIVE_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

export type LiveDb = Pick<PrismaClient, 'coachingProgram' | 'coachClient' | 'booking' | 'user' | 'programMessage'> & TeenGateDb;

export type LiveDoor = LiveGate | { ok: false; status: 503; error: 'unavailable' };

export const GATE_CACHE_MS = 60_000;
const cache = new Map<string, { at: number; door: LiveDoor }>();
export function clearGateCache(): void { cache.clear(); }

async function dob(db: LiveDb, id: string): Promise<number | null> {
  const u = await db.user.findUnique({ where: { id }, select: { dobYear: true } });
  return u?.dobYear ?? null;
}

/** The door for this person and room (cached GATE_CACHE_MS). */
export async function readLiveGate(db: LiveDb, userId: string, ref: LiveRoomRef, now: Date = new Date()): Promise<LiveDoor> {
  const key = `${userId}|${roomIdOf(ref)}`;
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < GATE_CACHE_MS) return hit.door;
  const door = await readDoor(db, userId, ref, now);
  if (door.ok || door.status !== 503) cache.set(key, { at: now.getTime(), door });
  if (cache.size > 5000) cache.clear();
  return door;
}

async function readDoor(db: LiveDb, userId: string, ref: LiveRoomRef, now: Date): Promise<LiveDoor> {
  try {
    let coachId: string, clientId: string;
    let room: Parameters<typeof decideLiveRoom>[0]['room'];
    if (ref.kind === 'program') {
      const program = await db.coachingProgram.findUnique({ where: { id: ref.id }, select: { coachId: true, clientId: true } });
      if (!program || (userId !== program.coachId && userId !== program.clientId)) return { ok: false, status: 404, error: 'not_found' };
      const link = await db.coachClient.findFirst({ where: { coachId: program.coachId, clientId: program.clientId, endedAt: null }, select: { id: true } });
      room = { kind: 'program', program, rosterLive: !!link };
      ({ coachId, clientId } = program);
    } else {
      const booking = await db.booking.findUnique({
        where: { id: ref.id }, select: { coachUserId: true, clientUserId: true, status: true, kind: true, startsAt: true, endsAt: true },
      });
      if (!booking || (userId !== booking.coachUserId && userId !== booking.clientUserId)) return { ok: false, status: 404, error: 'not_found' };
      room = { kind: 'booking', booking, askerAdult: verifiedAdult(await dob(db, userId), now) };
      coachId = booking.coachUserId; clientId = booking.clientUserId;
    }
    const [coachYear, clientYear, client] = await Promise.all([dob(db, coachId), dob(db, clientId), readTeenGate(db, clientId, now)]);
    return decideLiveRoom({
      userId, room, now, client,
      coachAdult: verifiedAdult(coachYear, now),
      clientVerifiedAdult: verifiedAdult(clientYear, now),
    });
  } catch (e) {
    console.error('[coach/live] the door could not be read; closed', e instanceof Error ? e.name : typeof e);
    return { ok: false, status: 503, error: 'unavailable' };
  }
}

// ── the signals ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** The store's room code: lower-case, so Controller Link's upper-casing routes cannot reach it. */
export const signalCode = (ref: LiveRoomRef): string => `live:${ref.kind}:${ref.id}`;
export const otherRole = (r: LiveRole): LiveRole => (r === 'coach' ? 'client' : 'coach');

/** An SDP offer is a few KB; a relay batch of pose frames ~2 KB. Generous, finite. */
export const SIGNAL_MAX_CHARS = 64_000;
export const SIGNAL_KINDS = ['offer', 'answer', 'ice', 'bye', 'ctl', 'pose'] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export function checkSignal(data: unknown): { ok: true } | { ok: false; error: 'bad_signal' | 'too_big' } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'bad_signal' };
  const kind = (data as { kind?: unknown }).kind;
  if (typeof kind !== 'string' || !(SIGNAL_KINDS as readonly string[]).includes(kind)) return { ok: false, error: 'bad_signal' };
  let size: number;
  try { size = JSON.stringify(data).length; } catch { return { ok: false, error: 'bad_signal' }; }
  return size > SIGNAL_MAX_CHARS ? { ok: false, error: 'too_big' } : { ok: true };
}

export async function pushSignal(store: SignalStore, ref: LiveRoomRef, from: LiveRole, data: unknown): Promise<number | null> {
  const code = signalCode(ref);
  if (!(await store.getRoom(code))) await store.createRoom(code, 'coach-live', 'coach');
  return store.push(code, { from, to: otherRole(from), data });
}

export async function pollSignals(store: SignalStore, ref: LiveRoomRef, to: LiveRole, after: number) {
  const code = signalCode(ref);
  if (!(await store.getRoom(code))) await store.createRoom(code, 'coach-live', 'coach');
  return (await store.poll(code, to, after)).map((m) => ({ seq: m.seq, data: m.data }));
}

// ── the summary ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** One summary per coach page session (its random id), so a double tap on End posts once. Per instance. */
const posted = new Map<string, number>();
const POSTED_TTL_MS = 6 * 60 * 60 * 1000;

export type SummaryResult =
  | { ok: true; posted: boolean; text: string; programId: string | null }
  | { ok: false; status: number; error: string };

export async function postSummary(
  db: LiveDb, door: Extract<LiveGate, { ok: true }>, ref: LiveRoomRef, body: unknown, now: Date = new Date(),
): Promise<SummaryResult> {
  if (door.role !== 'coach') return { ok: false, status: 403, error: 'coach_only' };
  const b = (body ?? {}) as { summary?: unknown; minutes?: unknown; sessionId?: unknown };
  const sum = parseSummary(b.summary);
  if (!sum) return { ok: false, status: 400, error: 'bad_summary' };
  const sessionId = typeof b.sessionId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(b.sessionId) ? b.sessionId : null;
  if (!sessionId) return { ok: false, status: 400, error: 'session_id_required' };
  const minutes = typeof b.minutes === 'number' && Number.isInteger(b.minutes) && b.minutes > 0 && b.minutes <= 600 ? b.minutes : null;
  const text = summaryText(sum, minutes);
  for (const [k, at] of posted) if (now.getTime() - at > POSTED_TTL_MS) posted.delete(k);
  const once = `${roomIdOf(ref)}|${sessionId}`;
  if (!sum.sets.length) return { ok: true, posted: false, text, programId: null };
  let programId: string | null = ref.kind === 'program' ? ref.id : null;
  if (!programId) {
    const p = await db.coachingProgram.findFirst({
      where: { coachId: door.coachId, clientId: door.clientId, isActive: true }, orderBy: { createdAt: 'desc' }, select: { id: true },
    });
    programId = p?.id ?? null;
  }
  if (!programId) return { ok: true, posted: false, text, programId: null };
  if (posted.has(once)) return { ok: true, posted: true, text, programId };
  posted.set(once, now.getTime());
  try {
    await db.programMessage.create({ data: { programId, authorId: door.coachId, body: text } });
  } catch (e) {
    posted.delete(once);
    throw e;
  }
  return { ok: true, posted: true, text, programId };
}
