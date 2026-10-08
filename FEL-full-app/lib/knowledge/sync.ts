// Account sync — the merge rules, pure. KNOWLEDGE-FEED v2 (owner decision 2, 2026-10-06: "Account sync: YES").
//
// WHO SYNCS. A signed-in, VERIFIED-ADULT account (User.dobYear, decided on the server: lib/knowledge/server/learnRoutes).
// Under-18 and unknown age stay device-only — the server refuses them and the client never asks again that session.
//
// THE TWO MERGES. The same function serves both; `mode` says which.
//  · 'first-link' — this device has never synced with this account (lib/knowledge/syncClient: no device mark for the
//    user). The device's progress joins the account's: sets are unioned, counters take the larger side, learning XP
//    is ADDED (two separate histories), and nothing either side knew is lost. The server records the device id, so a
//    retried first-link (the response was lost) is treated as 'linked' and never adds that XP twice.
//  · 'linked' — the device already mirrors this account and is pushing its latest. Its lists and topic choices win
//    (that is how an unsave or an unlike reaches the account), XP takes the larger side (both count the same events).
// RULES THAT HOLD IN BOTH:
//  · A card the two sides both know merges per field: views and lastSeen take the larger, firstDay the earlier, and the
//    quiz record the side with the LATER answer; on a tie, the LOWER box — a merge never fakes mastery.
//  · "Less of this" (hidden) is a union, always: a card someone asked never to see again stays gone.
//  · The streak takes the side that met its goal more recently (a tie, the longer run); `best` is the larger.
//  · Today's tally: the later day; on the same day, the union of the cards counted.
//  · `recent` (the near-repeat window) is device-only: it is never uploaded, and the device keeps its own.
// A 'linked' merge is idempotent — merging the result with the same device state again changes nothing — which the tests
// check, because a push that is retried must not drift. A 'first-link' merge ADDS the device's XP, so it is not; the
// server runs it at most once per device id (LearnProfile.devices) and turns any repeat into a 'linked' merge.

import { reviveState, RECENT_KEEP, type CardRecord, type LearnState } from './state';
import type { QuizRecord } from './leitner';
import type { TopicId } from './types';

export type MergeMode = 'first-link' | 'linked';

/** Which quiz record wins: the later answer; a same-day tie goes to the lower box, then to more answers seen. */
export function mergeQuiz(a: QuizRecord | undefined, b: QuizRecord | undefined): QuizRecord | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.lastAnswered !== b.lastAnswered) return a.lastAnswered > b.lastAnswered ? a : b;
  if (a.box !== b.box) return a.box < b.box ? a : b;
  const na = a.right + a.wrong, nb = b.right + b.wrong;
  if (na !== nb) return na > nb ? a : b;
  return a.due <= b.due ? a : b;
}

export function mergeCard(a: CardRecord | undefined, b: CardRecord | undefined): CardRecord | undefined {
  if (!a) return b;
  if (!b) return a;
  const quiz = mergeQuiz(a.quiz, b.quiz);
  return {
    views: Math.max(a.views, b.views),
    firstDay: Math.min(a.firstDay, b.firstDay),
    lastSeenMs: Math.max(a.lastSeenMs, b.lastSeenMs),
    ...(quiz ? { quiz } : {}),
  };
}

const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])];

function maxPerKey(a: Partial<Record<TopicId, number>>, b: Partial<Record<TopicId, number>>): Partial<Record<TopicId, number>> {
  const out: Partial<Record<TopicId, number>> = { ...a };
  for (const [k, v] of Object.entries(b) as [TopicId, number][]) out[k] = Math.max(out[k] ?? 0, v ?? 0);
  return out;
}

export function mergeStates(account: LearnState, device: LearnState, mode: MergeMode): LearnState {
  const cards: LearnState['cards'] = {};
  for (const id of union(Object.keys(account.cards), Object.keys(device.cards))) {
    const m = mergeCard(account.cards[id], device.cards[id]);
    if (m) cards[id] = m;
  }
  const dwell: LearnState['dwell'] = { ...account.dwell };
  for (const [k, v] of Object.entries(device.dwell) as [TopicId, { ms: number; n: number }][]) {
    const cur = dwell[k];
    if (!cur || v.n > cur.n || (v.n === cur.n && v.ms > cur.ms)) dwell[k] = v;
  }

  const a = account.streak, d = device.streak;
  const later = (a.lastDay ?? -Infinity) === (d.lastDay ?? -Infinity)
    ? (a.count >= d.count ? a : d)
    : (a.lastDay ?? -Infinity) > (d.lastDay ?? -Infinity) ? a : d;
  const streak = { count: later.count, lastDay: later.lastDay, best: Math.max(a.best, d.best, later.count) };

  const today = account.today.day === device.today.day
    ? { day: account.today.day, done: union(account.today.done, device.today.done) }
    : account.today.day > device.today.day ? account.today : device.today;

  const first = mode === 'first-link';
  const topics = first ? union(account.topics, device.topics) as TopicId[] : (device.onboarded ? device.topics : account.topics);
  return {
    v: account.v,
    onboarded: account.onboarded || device.onboarded,
    topics,
    cards,
    recent: device.recent.slice(-RECENT_KEEP),
    likes: first ? maxPerKey(account.likes, device.likes) : device.likes,
    less: first ? maxPerKey(account.less, device.less) : device.less,
    dwell,
    liked: first ? union(account.liked, device.liked) : device.liked,
    saved: first ? union(account.saved, device.saved) : device.saved,
    hidden: union(account.hidden, device.hidden),
    xp: first ? account.xp + device.xp : Math.max(account.xp, device.xp),
    streak,
    today,
  };
}

/**
 * A state as it arrives from a client: revived defensively (reviveState), then trimmed to cards the catalogue knows,
 * with every number made finite and non-negative — so a crafted body can't plant junk ids or a NaN box in the account.
 */
export function sanitizeIncoming(raw: unknown, knownCard: (id: string) => boolean): LearnState {
  const s = reviveState(raw);
  const int = (n: unknown, lo = 0): number => (Number.isFinite(n) ? Math.max(lo, Math.floor(Number(n))) : lo);
  const cards: LearnState['cards'] = {};
  for (const [id, rec] of Object.entries(s.cards)) {
    if (!knownCard(id) || !rec || typeof rec !== 'object') continue;
    const q = (rec as CardRecord).quiz;
    const box = q ? Math.min(5, Math.max(1, int(q.box, 1))) : 0;
    cards[id] = {
      views: Math.max(1, int(rec.views)),
      firstDay: int(rec.firstDay),
      lastSeenMs: int(rec.lastSeenMs),
      ...(q ? { quiz: { box: box as QuizRecord['box'], due: int(q.due), right: int(q.right), wrong: int(q.wrong), lastAnswered: int(q.lastAnswered) } } : {}),
    };
  }
  const known = (ids: string[]) => ids.filter(knownCard);
  return {
    ...s,
    cards,
    liked: known(s.liked),
    saved: known(s.saved),
    hidden: known(s.hidden),
    today: { day: s.today.day, done: known(s.today.done) },
    xp: int(s.xp),
  };
}
