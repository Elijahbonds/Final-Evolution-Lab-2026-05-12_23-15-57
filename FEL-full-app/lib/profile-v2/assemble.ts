// PROFILE V2 — the rows the page read, turned into what it shows (owner 2026-10-24). Pure: no Prisma, no DOM.
//
// Layout and data map: docs/PROFILE-V2.md. The reads are lib/profile-v2/load.ts (one batch). Everything here follows
// the brief's one rule — NO FAKE NUMBERS: a number that was not measured is null, and its tile says how to get it.
//
// What is read from where (and why the source shows on screen):
//   · jump — the account's saved jumps (WorkoutScan dunk / prove_it / rescreen / jump), ADULTS WHO OPTED IN only
//     (canSaveScanNumbers; nobody else's are saved on the server). Shown in inches.
//   · form — Mirror squat and lunge sets' clean-rep share (lib/mirror/progressReading valueFromRow), same gate; for
//     everyone else the phone keeps it (lib/mirror/deviceProgress) and the page's client island reads it there.
//   · reaction — not saved anywhere yet (Beach Sprint shows its start reaction on the finish card and keeps nothing).
//   · streak — PlayerProfile.streakDays, and days played this week (GameSession times only: no scores).
//   · bests — the account's per-mode bests for a VERIFIED ADULT (lib/records/account-bests's rule); a teen's stay on
//     the device that set them, and the client island reads those.

import { prqDisplay, type PrqDisplay } from '@/lib/prq-display';
import { latestVectorFrom, traceableFrom, ATTR_LABELS } from '@/lib/prq-entries';
import { PRQ_CAMERA_SOURCE, type PrqAttr } from '@/lib/prq';
import { levelFor, type LevelInfo } from '@/lib/player-level';
import { MODE_INFO, canonicalModeKey } from '@/lib/game-data';
import { masteryLabel } from '@/lib/creator/card-stats';
import { valueFromRow } from '@/lib/mirror/progressReading';
import { weeklySeries, distinctDays, type Point } from './week';
import { jumpTile, formTile, reactionTile, streakTile, MAX_JUMP_CM, type ProgressTile } from './tiles';

export * from './tiles';
import { profileGates, type OptInRow, type ProfileGates } from './gate';
import { effectiveVisibility } from './visibility';

// ── the rows ────────────────────────────────────────────────────────────────────────────────────────────────────
export interface ProfileRows {
  user: { name: string | null; dobYear: number | null; createdAt: Date } | null;
  profile: { xp: number; streakDays: number; avatarKey: string | null; cosmeticAssetId: string | null } | null;
  optIn: OptInRow | null;
  prqEntries: { id: string; attribute: string; value: number; unit: string; source: string; measuredAt: Date }[];
  mastery: { mode: string; tier: number }[];
  /** Gated in the query (scanSaveUserWhere): empty for anyone who may not save. */
  jumpScans: { kind: string; metrics: unknown; createdAt: Date }[];
  /** Gated in the query (scanSaveUserWhere). */
  mirrorSessions: { patternId: string; reps: number | null; faultCounts: unknown; createdAt: Date }[];
  /** Gated in the query (verifiedAdultUserWhere): all-time best and runs per mode. */
  bests: { mode: string; best: number | null; runs: number }[];
  /** Gated in the query (verifiedAdultUserWhere): the last HISTORY_WEEKS of scores, for the charts. */
  recentScores: { mode: string; score: number; createdAt: Date }[];
  /** When the account played in the last two weeks (times only). */
  playedAt: Date[];
  matches: { kind: string; status: string; hostId: string; hostName: string; guestId: string | null; guestName: string | null; winnerId: string | null; mode: string; updatedAt: Date }[];
  links: { count: number; opened: number; attempted: number; beaten: number };
  card: { slug: string; published: boolean; displayName: string; highlights: unknown } | null;
  coaches: { name: string | null }[];
  credentials: { trackKey: string; moduleKey: string; earnedAt: Date }[];
  triumphs: { mode: string; totalBeats: number; longestStreak: number }[];
}

// ── what the page shows ──────────────────────────────────────────────────────────────────────────────────────────
export interface ModeBest { mode: string; name: string; href: string | null; best: number; runs: number; weeks: (number | null)[] }
export interface Skill { key: string; label: string; value: number; unit: string; source: string; estimate: boolean; measuredAt: string }
export interface Opponent { name: string; wins: number; losses: number; draws: number; lastAt: string; mode: string }

export interface ProfileV2Data {
  identity: { name: string; avatarKey: string | null; cosmeticAssetId: string | null; level: LevelInfo | null; memberSince: string | null };
  prq: Pick<PrqDisplay, 'score' | 'label' | 'status' | 'coverage' | 'color' | 'measured' | 'total'>;
  gates: Pick<ProfileGates, 'adult' | 'canSaveScan'>;
  tiles: ProgressTile[];
  stats: {
    jumpWeeks: (number | null)[] | null;
    jumpBestIn: number | null;
    formWeeks: (number | null)[] | null;
    /** 'account' for a verified adult (the server's bests), 'device' for everyone else (the client reads this phone's). */
    bestsScope: 'account' | 'device';
    modes: ModeBest[];
    skills: Skill[];
  };
  badges: {
    streakDays: number;
    nextStreakGoal: number;
    level: LevelInfo | null;
    mastery: { mode: string; name: string; tier: number; label: string }[];
    academyPassed: number;
    ghostBeats: number;
    ghostBestRun: number;
    hasCoach: boolean;
  };
  squad: {
    opponents: Opponent[];
    rival: Opponent | null;
    matchesPlayed: number;
    links: ProfileRows['links'];
  };
  highlights: { pinned: { mode: string; name: string; score: number; label: string | null; at: string }[] };
  privacy: {
    minorOrUnknown: boolean;
    visibility: 'public' | 'friends';
    cardSlug: string | null;
    coaches: string[];
  };
}

/** Streak goals the badge counts toward (assumption: the usual habit ladder; nothing pays on them). */
export const STREAK_GOALS = [3, 7, 14, 30, 60, 100, 365] as const;

const r1 = (n: number) => Math.round(n * 10) / 10;
const cmToIn = (cm: number) => cm / 2.54;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A saved jump's height in cm, or null when the row carries none. */
export function jumpCmOf(kind: string, metrics: unknown): number | null {
  const m = (metrics && typeof metrics === 'object' ? metrics : {}) as Record<string, unknown>;
  let cm: number | null = null;
  if (kind === 'dunk' || kind === 'prove_it') cm = num(m.verticalCm);
  else if (kind === 'rescreen') { const inch = num(m.jumpBestIn); cm = inch === null ? null : inch * 2.54; }
  else if (kind === 'jump') cm = num((m.reads as Record<string, unknown> | undefined)?.heightCm);
  return cm !== null && cm > 0 && cm <= MAX_JUMP_CM ? cm : null;
}

function modeName(mode: string): { name: string; href: string | null } {
  const info = MODE_INFO[canonicalModeKey(mode)];
  return info ? { name: info.name, href: info.href } : { name: mode, href: null };
}

function opponentsOf(userId: string, matches: ProfileRows['matches']): Opponent[] {
  const by = new Map<string, Opponent & { id: string }>();
  for (const m of matches) {
    if (m.kind !== 'online' || m.status !== 'settled' || !m.guestId) continue;
    const host = m.hostId === userId;
    if (!host && m.guestId !== userId) continue;
    const oppId = host ? m.guestId : m.hostId;
    if (oppId === userId) continue;
    const name = (host ? m.guestName : m.hostName) || 'Player';
    const o = by.get(oppId) ?? { id: oppId, name, wins: 0, losses: 0, draws: 0, lastAt: m.updatedAt.toISOString(), mode: m.mode };
    if (m.winnerId === userId) o.wins += 1; else if (m.winnerId === oppId) o.losses += 1; else o.draws += 1;
    if (m.updatedAt.toISOString() > o.lastAt) { o.lastAt = m.updatedAt.toISOString(); o.mode = m.mode; o.name = name; }
    by.set(oppId, o);
  }
  return [...by.values()]
    .map(({ id: _id, ...o }) => ({ ...o, mode: modeName(o.mode).name }))
    .sort((a, b) => (b.wins + b.losses + b.draws) - (a.wins + a.losses + a.draws) || b.lastAt.localeCompare(a.lastAt));
}

/** The rival: the person played most; a tie goes to the closer record (the owner's "closest-level" pairing). */
export function rivalOf(opponents: readonly Opponent[]): Opponent | null {
  if (!opponents.length) return null;
  const games = (o: Opponent) => o.wins + o.losses + o.draws;
  const top = games(opponents[0]);
  const tied = opponents.filter((o) => games(o) === top);
  return [...tied].sort((a, b) => Math.abs(a.wins - a.losses) - Math.abs(b.wins - b.losses))[0];
}

function pinnedOf(raw: unknown): ProfileV2Data['highlights']['pinned'] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileV2Data['highlights']['pinned'] = [];
  for (const h of raw) {
    if (!h || typeof h !== 'object') continue;
    const r = h as Record<string, unknown>;
    const score = num(r.score);
    if (typeof r.mode !== 'string' || score === null) continue;
    out.push({ mode: r.mode, name: modeName(r.mode).name, score, label: typeof r.label === 'string' ? r.label.slice(0, 60) : null, at: typeof r.at === 'string' ? r.at : '' });
    if (out.length >= 3) break;
  }
  return out;
}

export function assembleProfile(userId: string, rows: ProfileRows, nowDate: Date = new Date()): ProfileV2Data {
  const now = nowDate.getTime();
  const gates = profileGates(rows.user?.dobYear, rows.optIn, nowDate);
  // Belt and braces: the query gated these rows; they are used only when the JS gate agrees.
  const jumpScans = gates.canSaveScan ? rows.jumpScans : [];
  const mirror = gates.canSaveScan ? rows.mirrorSessions : [];
  const bests = gates.adult ? rows.bests : [];
  const recent = gates.adult ? rows.recentScores : [];

  const jumpPoints: Point[] = [];
  for (const s of jumpScans) { const cm = jumpCmOf(s.kind, s.metrics); if (cm !== null) jumpPoints.push({ at: s.createdAt.getTime(), value: cm }); }
  const formPoints: Point[] = [];
  for (const s of mirror) {
    if (s.patternId !== 'squat' && s.patternId !== 'lunge') continue;   // clean-rep share; press/row is faults per rep
    const v = valueFromRow(s);
    if (v !== null) formPoints.push({ at: s.createdAt.getTime(), value: v });
  }
  const played = distinctDays(rows.playedAt.map((d) => d.getTime()));

  const vec = latestVectorFrom(rows.prqEntries);
  const disp = prqDisplay(traceableFrom(vec));
  const skills: Skill[] = [...vec.values()].map((v) => ({
    key: v.attribute, label: ATTR_LABELS[v.attribute as PrqAttr] ?? v.attribute, value: r1(v.value), unit: v.unit,
    source: v.source, estimate: v.source === PRQ_CAMERA_SOURCE, measuredAt: v.measuredAt.toISOString(),
  }));

  const scoresByMode = new Map<string, Point[]>();
  for (const s of recent) {
    const k = canonicalModeKey(s.mode);
    const list = scoresByMode.get(k) ?? [];
    list.push({ at: s.createdAt.getTime(), value: s.score });
    scoresByMode.set(k, list);
  }
  const modes: ModeBest[] = bests
    .filter((b) => typeof b.best === 'number' && b.runs > 0)
    .map((b) => {
      const k = canonicalModeKey(b.mode);
      const { name, href } = modeName(k);
      return { mode: k, name, href, best: b.best as number, runs: b.runs, weeks: weeklySeries(scoresByMode.get(k) ?? [], now, 'max') };
    })
    .sort((a, b) => b.runs - a.runs || b.best - a.best)
    .slice(0, 6);

  const xp = rows.profile?.xp;
  const level = typeof xp === 'number' ? levelFor(xp) : null;
  const streakDays = Math.max(0, rows.profile?.streakDays ?? 0);
  const opponents = opponentsOf(userId, rows.matches);

  return {
    identity: {
      name: rows.card?.displayName?.trim() || rows.user?.name?.trim() || 'Athlete',
      avatarKey: rows.profile?.avatarKey ?? null,
      cosmeticAssetId: rows.profile?.cosmeticAssetId ?? null,
      level,
      memberSince: rows.user?.createdAt ? rows.user.createdAt.toISOString() : null,
    },
    prq: { score: disp.score, label: disp.label, status: disp.status, coverage: disp.coverage, color: disp.color, measured: disp.measured, total: disp.total },
    gates: { adult: gates.adult, canSaveScan: gates.canSaveScan },
    tiles: [jumpTile(jumpPoints, now, gates), formTile(formPoints, now, gates), reactionTile(), streakTile(streakDays, played, now)],
    stats: {
      jumpWeeks: gates.canSaveScan && jumpPoints.length ? weeklySeries(jumpPoints.map((p) => ({ at: p.at, value: r1(cmToIn(p.value)) })), now, 'max') : null,
      jumpBestIn: jumpPoints.length ? r1(cmToIn(Math.max(...jumpPoints.map((p) => p.value)))) : null,
      formWeeks: gates.canSaveScan && formPoints.length ? weeklySeries(formPoints.map((p) => ({ at: p.at, value: Math.round(p.value * 100) })), now, 'mean') : null,
      bestsScope: gates.adult ? 'account' : 'device',
      modes,
      skills,
    },
    badges: {
      streakDays,
      nextStreakGoal: STREAK_GOALS.find((g) => g > streakDays) ?? STREAK_GOALS[STREAK_GOALS.length - 1],
      level,
      mastery: rows.mastery.filter((m) => m.tier > 0).sort((a, b) => b.tier - a.tier)
        .map((m) => ({ mode: m.mode, name: modeName(m.mode).name, tier: m.tier, label: masteryLabel(m.tier) })),
      academyPassed: new Set(rows.credentials.map((c) => `${c.trackKey}/${c.moduleKey}`)).size,
      ghostBeats: rows.triumphs.reduce((s, t) => s + Math.max(0, t.totalBeats), 0),
      ghostBestRun: rows.triumphs.reduce((s, t) => Math.max(s, t.longestStreak), 0),
      hasCoach: rows.coaches.length > 0,
    },
    squad: { opponents: opponents.slice(0, 6), rival: rivalOf(opponents), matchesPlayed: opponents.reduce((s, o) => s + o.wins + o.losses + o.draws, 0), links: rows.links },
    highlights: { pinned: pinnedOf(rows.card?.highlights) },
    privacy: {
      minorOrUnknown: gates.minorOrUnknown,
      visibility: effectiveVisibility(rows.user?.dobYear, !!rows.card?.published, nowDate),
      cardSlug: rows.card?.slug ?? null,
      coaches: rows.coaches.map((c) => c.name?.trim() || 'Your coach'),
    },
  };
}
