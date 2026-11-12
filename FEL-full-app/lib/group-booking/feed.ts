// lib/group-booking/feed.ts — GROUP-BOOKING: what the coaching calendar feed (lib/coach/schedule/server.ts feedIcs,
// GET /api/coach/schedule/feed/<token>.ics) adds for one person: the group sessions they run (as the owner or the trainer),
// the group seats they booked, and their in-person 1:1s (either side). The feed's own gates still decide who has a feed
// (a verified adult with a live signed link); this only reads that person's own rows. Before the pending SQL every read is
// null, so the feed is unchanged. Never throws.
import { groupSessions } from './calendar';
import { gymById, groupConfig } from './config';
import * as store from './store';
import type { FeedEvent } from '@/lib/coach-store/ics';

const place = (gymId: string) => gymById(gymId)?.name ?? null;

export async function groupFeedEvents(db: store.RawDb, userId: string, from: Date, to: Date, now: number = Date.now()): Promise<FeedEvent[]> {
  try {
    if (!(await store.groupBookingReady(db, now))) return [];
    const cfg = groupConfig();
    const minutes = cfg.sessionMinutes * 60_000;
    const [owned, trained, seats, asTrainer, asClient] = await Promise.all([
      store.groupsForOwner(db, userId, now), store.groupsForTrainer(db, userId, now), store.seatsForUser(db, userId, from, now),
      store.inPersonForTrainers(db, [userId], from, to, now), store.inPersonForClient(db, userId, from, now),
    ]);
    const runs = new Map([...(owned ?? []), ...(trained ?? [])].map((g) => [g.id, g]));
    const out: FeedEvent[] = [];
    for (const g of runs.values()) {
      for (const s of groupSessions(g)) {
        if (s.startsAt < from || s.startsAt >= to) continue;
        out.push({ uid: `grp-${g.id}-${s.date}`, startsAt: s.startsAt, endsAt: new Date(s.startsAt.getTime() + minutes), title: `${g.name} (group)`, place: place(g.gymId), cancelled: g.status === 'cancelled' });
      }
    }
    const names = new Map<string, string>();
    for (const s of seats ?? []) {
      if (s.startsAt >= to || runs.has(s.groupId)) continue;
      if (!names.has(s.groupId)) names.set(s.groupId, (await store.groupById(db, s.groupId, now))?.name ?? 'Group');
      out.push({ uid: `seat-${s.id}`, startsAt: s.startsAt, endsAt: new Date(s.startsAt.getTime() + minutes), title: s.kind === 'makeup' ? `${names.get(s.groupId)} (make-up)` : names.get(s.groupId)!, place: place(s.gymId), cancelled: s.status === 'cancelled' });
    }
    const seen = new Set<string>();
    for (const s of [...(asTrainer ?? []), ...(asClient ?? []).filter((x) => x.startsAt < to)]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({ uid: `1on1-${s.id}`, startsAt: s.startsAt, endsAt: new Date(s.startsAt.getTime() + s.minutes * 60_000), title: '1:1 session (in person)', place: place(s.gymId), cancelled: s.status === 'cancelled' });
    }
    return out;
  } catch {
    return [];
  }
}

