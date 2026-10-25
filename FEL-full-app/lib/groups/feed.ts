// TEAMS-SQUADS: the teen-safe group feed (owner, 2026-10-22: "reps, PRs, clips; reactions only, no DMs for minors").
//
// Every line is built HERE from a template and a member's first name; no member ever typed a word of it. What it shows:
//   · drill  — "<name> did today's drill" (everyone: done/not done is what training buddies share)
//   · pr     — "<name> set a new best in <mode>: <score>" — verified adults only (a teen's scores stay on the device)
//   · reps   — "<name> logged <n> <squat|lunge> reps" — adults who save numbers AND share them with this group
//   · jump   — "<name> verified a <x> in jump" — same gate, and only a VERIFIED JumpRecord (lib/jump/seam.ts)
//   · trophy — "<name> won the week"
//   · challenge — "<name> posted a challenge in <mode>" (+ ": beat <score>" for an adult); opens /c/<code>
// Clips are not here: FEL keeps no clip of a user's own yet (lib/progress-card/summary.ts `clips: null`).
// Reactions are the preset keys in types.ts REACTIONS, counted per item; nobody can reply.
// Pure.

import { allowedActivity, inchesOf, type Activity } from './activity';
import { dayOf, prevWeekKey, weekBounds } from './week';
import { REACTIONS, type GroupAct, type MemberFacts, type ReactionKey } from './types';
import { showsScores } from './rules';

export type FeedKind = 'drill' | 'pr' | 'reps' | 'jump' | 'trophy' | 'challenge';

export interface FeedReaction { key: ReactionKey; glyph: string; count: number; mine: boolean }

export interface FeedItem {
  /** The reaction target: a stable key for this event. */
  key: string;
  kind: FeedKind;
  userId: string | null;
  line: string;
  at: number;
  href: string | null;
  reactions: FeedReaction[];
}

/** (new) Items shown at most. */
export const FEED_MAX = 40;

const PATTERN_WORD: Record<string, string> = { squat: 'squat', lunge: 'lunge' };

export const isReactionKey = (v: unknown): v is ReactionKey => typeof v === 'string' && Object.prototype.hasOwnProperty.call(REACTIONS, v);
export const reactionDedupe = (itemKey: string, fromUserId: string, reaction: ReactionKey) => `reaction:${itemKey}:${fromUserId}:${reaction}`;

/**
 * The feed for one viewer: this week and last, newest first. `a` is filtered again by each member's facts
 * (allowedActivity), so a minor's score or an unshared number cannot appear even if a reader fetched it.
 */
export function buildFeed(members: readonly MemberFacts[], raw: Activity, acts: readonly GroupAct[], viewerId: string, weekKey: string): FeedItem[] {
  const a = allowedActivity(members, raw);
  const from = weekBounds(prevWeekKey(weekKey)).start.getTime();
  const by = new Map(members.map((m) => [m.userId, m]));
  const name = (id: string | null) => (id ? by.get(id)?.name ?? null : null);
  const items: Omit<FeedItem, 'reactions'>[] = [];

  for (const m of members) {
    for (const day of a.drillDays[m.userId] ?? []) {
      const at = Date.parse(`${day}T20:00:00Z`); // midday PT: a day, not an instant
      if (at < from) continue;
      items.push({ key: `drill:${m.userId}:${day}`, kind: 'drill', userId: m.userId, line: `${m.name} did the daily drill`, at, href: null });
    }
  }
  for (const p of a.prs) {
    const n = name(p.userId); const m = by.get(p.userId);
    if (!n || !m || !showsScores(m) || p.at < from) continue;
    items.push({ key: `pr:${p.userId}:${p.mode}:${dayOf(p.at)}`, kind: 'pr', userId: p.userId, line: `${n} set a new best in ${p.modeName}: ${p.score}`, at: p.at, href: null });
  }
  for (const r of a.reps) {
    const n = name(r.userId);
    if (!n || r.at < from || !(r.reps > 0)) continue;
    items.push({ key: `reps:${r.id}`, kind: 'reps', userId: r.userId, line: `${n} logged ${Math.round(r.reps)} ${PATTERN_WORD[r.patternId] ?? 'Mirror'} reps`, at: r.at, href: null });
  }
  for (const j of a.jumps) {
    const n = name(j.userId);
    if (!n || j.at < from || j.record.verified !== true || j.record.blocks.length) continue;
    items.push({ key: `jump:${j.id}`, kind: 'jump', userId: j.userId, line: `${n} verified a ${inchesOf(j.record.heightCm)} in jump`, at: j.at, href: null });
  }
  for (const x of acts) {
    if (x.kind === 'trophy' && x.preset === 'league_winner' && x.createdAt >= from) {
      const n = name(x.toUserId);
      if (n) items.push({ key: `trophy:${x.ref}`, kind: 'trophy', userId: x.toUserId, line: `${n} won the week (${x.points ?? 0} pts)`, at: x.createdAt, href: null });
    }
    if (x.kind === 'challenge' && x.ref && x.createdAt >= from) {
      const c = a.challenges.find((y) => y.code === x.ref);
      const m = x.fromUserId ? by.get(x.fromUserId) : undefined;
      if (!c || !m) continue;
      const beat = showsScores(m) ? `: beat ${c.score}` : '';
      items.push({ key: `challenge:${c.code}`, kind: 'challenge', userId: m.userId, line: `${m.name} posted a challenge in ${c.modeName}${beat}`, at: x.createdAt, href: `/c/${encodeURIComponent(c.code)}` });
    }
  }

  const reactions = acts.filter((x) => x.kind === 'reaction' && x.ref && isReactionKey(x.preset) && x.fromUserId && by.has(x.fromUserId));
  return items
    .sort((x, y) => y.at - x.at || x.key.localeCompare(y.key))
    .slice(0, FEED_MAX)
    .map((it) => ({
      ...it,
      reactions: (Object.keys(REACTIONS) as ReactionKey[]).map((key) => {
        const on = reactions.filter((r) => r.ref === it.key && r.preset === key);
        return { key, glyph: REACTIONS[key].glyph, count: on.length, mine: on.some((r) => r.fromUserId === viewerId) };
      }),
    }));
}
