// lib/coach/queueServer.ts — PLATFORM PHASE 5 (2026-10-27): the reads behind "Needs you today" (lib/coach/queue.ts).
//
// Each source is read the way it already is read, and decides what it already decides:
//   · the attention board and the drafts inbox are read through THEIR OWN route handlers (the route passes them in as
//     readers), so their batching, consent locks, certified-coach and Coach Pro checks run unchanged;
//   · form review, check-ins and read markers through their lib entry points, each dark until its pending SQL (OWN-01).
// Then ONE gate over every card: the athlete must pass the teen gate (lib/coach/teenGate.ts, the same rule
// readTeenGate runs, read in two batched queries instead of two per athlete), and a health card (pain, running low) needs
// a verified adult. A read that fails closes the gate: no card for anyone it could not read.
import 'server-only';
import type { PrismaClient } from '@/lib/generated/prisma';
import { verifiedAdult } from '@/lib/privacy/verifiedAdult';
import { teenGate } from './teenGate';
import { coachQueue, type FormReviewDb, type QueueItem as ReviewItem } from './formReview/server';
import { replyPresets } from './formReview/reply';
import { parityReady } from './parity/probe';
import { answersForCoach, formsForCoach } from './checkins/store';
import { unreadCounts } from './messageReads';
import { buildQueue, gateQueue, type AlertSource, type DraftSource, type PainSource, type QueueCard, type QueueSourceKey, type QueueSources, type RedFlagSource } from './queue';

const DAY = 86_400_000;
/** "New joins" and "check-ins": the last seven days. (new) */
export const QUEUE_WINDOW_DAYS = 7;

export type QueueDb = FormReviewDb & Pick<PrismaClient, 'clientSession'>;

export interface QueueReaders {
  /** GET /api/coach/attention's body, or null when it did not answer. */
  attention: () => Promise<{ painFlags?: PainSource[]; readiness?: RedFlagSource[]; alerts?: AlertSource[] } | null>;
  /** GET /api/coach/drafts's body, or null (not certified, Coach Pro off, rate limited, failed). */
  drafts: () => Promise<{ approvals?: boolean; drafts?: DraftSource[] } | null>;
}

export interface RosterStripRow {
  id: string;
  name: string;
  /** The last seven days, oldest first: 1 = a coached session completed that day. */
  days: number[];
  programId: string | null;
}

export interface CoachQueueBody {
  items: QueueCard[];
  /** Sources waiting on the owner's SQL: one line on the screen, "turns on when the owner finishes setup". */
  dark: QueueSourceKey[];
  roster: RosterStripRow[];
}

const soft = <T,>(p: Promise<T>, empty: T): Promise<T> => p.catch(() => empty);

/** Who is on this coach's roster, their names, and each one's thread (the newest active program with this coach). */
async function people(db: QueueDb, coachId: string) {
  const [programs, links] = await Promise.all([
    soft(db.coachingProgram.findMany({ where: { coachId }, select: { id: true, clientId: true, isActive: true, createdAt: true }, orderBy: { createdAt: 'desc' } }), []),
    soft(db.coachClient.findMany({ where: { coachId, endedAt: null }, select: { clientId: true, createdAt: true } }), []),
  ]);
  const ids = [...new Set([...links.map((l) => l.clientId), ...programs.map((p) => p.clientId)])];
  const users = ids.length ? await soft(db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, dobYear: true } }), []) : [];
  const nameOf = (id: string) => { const u = users.find((x) => x.id === id); return u?.name?.trim() || u?.email?.split('@')[0] || 'Athlete'; };
  const programOf = (id: string) => (programs.find((p) => p.clientId === id && p.isActive) ?? programs.find((p) => p.clientId === id))?.id ?? null;
  return { programs, links, ids, users, nameOf, programOf };
}

/** The teen gate for many athletes at once: 'adult', 'teen' (consented), or null (closed). Fails closed on a bad read. */
async function gateFor(db: QueueDb, users: { id: string; dobYear: number | null }[], ids: readonly string[], now: Date): Promise<Map<string, 'adult' | 'teen' | null>> {
  const out = new Map<string, 'adult' | 'teen' | null>();
  const notAdult = ids.filter((id) => !verifiedAdult(users.find((u) => u.id === id)?.dobYear ?? null, now));
  for (const id of ids) if (!notAdult.includes(id)) out.set(id, 'adult');
  if (!notAdult.length) return out;
  try {
    const consents = await db.guardianConsent.findMany({
      where: { menteeId: { in: notAdult } },
      select: { menteeId: true, requestedAt: true, acceptedAt: true, revokedAt: true, menteeBirthYear: true },
    });
    for (const id of notAdult) {
      const g = teenGate({ dobYear: users.find((u) => u.id === id)?.dobYear ?? null, consents: consents.filter((c) => c.menteeId === id) }, now);
      out.set(id, g.ok ? g.band : null);
    }
  } catch {
    for (const id of notAdult) out.set(id, null);
  }
  return out;
}

export async function coachQueueFor(db: QueueDb, coachId: string, readers: QueueReaders, now: Date = new Date()): Promise<CoachQueueBody> {
  const nowMs = now.getTime();
  const who = await people(db, coachId);
  if (!who.ids.length) return { items: [], dark: [], roster: [] };
  const since = new Date(nowMs - QUEUE_WINDOW_DAYS * DAY);
  const mine = new Set(who.ids);

  const [attention, drafts, reviews, parityOn, unread, sessions, gate] = await Promise.all([
    soft(readers.attention(), null),
    soft(readers.drafts(), null),
    soft(coachQueue(db, coachId, nowMs), { status: 500, body: {} }),
    soft(parityReady(db, nowMs), false),
    soft(unreadCounts(db, coachId, nowMs), { available: false as const }),
    soft(db.clientSession.findMany({ where: { program: { coachId }, completedAt: { gte: since } }, select: { clientId: true, completedAt: true } }), [] as { clientId: string; completedAt: Date | null }[]),
    gateFor(db, who.users.map((u) => ({ id: u.id, dobYear: u.dobYear ?? null })), who.ids, now),
  ]);

  const dark: QueueSourceKey[] = [];
  const src: QueueSources = {
    pain: (attention?.painFlags ?? []).filter((p) => mine.has(p.clientId)),
    redFlags: (attention?.readiness ?? []).filter((r) => mine.has(r.clientId)),
    alerts: (attention?.alerts ?? []).filter((a) => mine.has(a.clientId)),
  };

  if (drafts?.approvals) src.drafts = (drafts.drafts ?? []).filter((d) => mine.has(d.clientId));
  else dark.push('drafts');

  const reviewBody = reviews.body as { available?: boolean; items?: ReviewItem[] };
  if (reviewBody.available) {
    src.reviews = (reviewBody.items ?? []).map((r) => ({ ...r, presets: replyPresets(r.movement, r.flags).map((p) => ({ id: p.id, text: p.text })) }));
  } else dark.push('reviews');

  if (parityOn) {
    const [forms, answers] = await Promise.all([formsForCoach(db, coachId, nowMs), answersForCoach(db, coachId, since, nowMs)]);
    // "answered" only — never the answers: health answers stay on the form's own page behind its own rule
    src.checkins = (answers ?? []).filter((a) => mine.has(a.athleteId)).map((a) => ({
      athleteId: a.athleteId, name: who.nameOf(a.athleteId), formTitle: forms?.find((f) => f.id === a.formId)?.title ?? 'your check-in', createdAt: a.createdAt,
    }));
  } else dark.push('checkins');

  if (unread.available) {
    const coached = who.programs.filter((p) => unread.byProgram[p.id]);
    const latest = coached.length ? await soft(db.programMessage.findMany({
      where: { programId: { in: coached.map((p) => p.id) }, authorId: { not: coachId } }, orderBy: { createdAt: 'desc' }, take: 200, select: { programId: true, createdAt: true },
    }), []) : [];
    src.messages = coached.map((p) => ({
      programId: p.id, athleteId: p.clientId, name: who.nameOf(p.clientId), unread: unread.byProgram[p.id] ?? 0,
      at: latest.find((m) => m.programId === p.id)?.createdAt.getTime() ?? nowMs,
    }));
  } else dark.push('messages');

  src.joins = who.links.filter((l) => l.createdAt.getTime() >= since.getTime()).map((l) => ({
    athleteId: l.clientId, name: who.nameOf(l.clientId), joinedAt: l.createdAt.getTime(), hasProgram: who.programs.some((p) => p.clientId === l.clientId),
  }));

  // names come from one place (the users read above), so every card names the athlete the same way
  for (const list of [src.pain, src.redFlags, src.alerts, src.drafts] as ({ clientId: string; name: string }[] | undefined)[]) {
    for (const row of list ?? []) row.name = who.nameOf(row.clientId);
  }

  const band = (id: string) => gate.get(id) ?? null;
  const items = gateQueue(buildQueue(src, { now: nowMs, programOf: who.programOf, adult: (id) => band(id) === 'adult' }), band);

  const today0 = Math.floor(nowMs / DAY) * DAY;
  // the strip passes the same gate: an athlete it closes is not on this screen at all (teens fail closed until OWN-03)
  const roster: RosterStripRow[] = who.ids.filter((id) => !!band(id)).map((id) => {
    const done = sessions.filter((s) => s.clientId === id && s.completedAt).map((s) => Math.floor((s.completedAt!.getTime() - today0) / DAY));
    return { id, name: who.nameOf(id), days: Array.from({ length: 7 }, (_, i) => (done.includes(i - 6) ? 1 : 0)), programId: who.programOf(id) };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return { items, dark, roster };
}
