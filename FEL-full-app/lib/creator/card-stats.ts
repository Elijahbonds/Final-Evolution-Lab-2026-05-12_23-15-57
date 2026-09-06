// Creator Card stats + highlights — pure (lane 5 S1/S2, SPEC-PASSION-PIPELINES). The card becomes a scouting profile:
// the eight PRQ attributes, mode mastery tiers, records per mode, resiliency, the movement-signature delta and up to six
// pinned highlights — each block behind an owner-chosen visibility mask. Babylon-free, Prisma-free, tested.

export const STAT_BLOCKS = ['prq', 'mastery', 'records', 'resiliency', 'movement', 'highlights'] as const;
export type StatBlock = (typeof STAT_BLOCKS)[number];
export type Visibility = Record<StatBlock, boolean>;
export const DEFAULT_VISIBILITY: Visibility = { prq: true, mastery: true, records: true, resiliency: true, movement: false, highlights: true };

/** Unknown keys dropped, missing keys default; anything non-object → defaults. */
export function normalizeVisibility(input: unknown): Visibility {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return Object.fromEntries(STAT_BLOCKS.map((k) => [k, typeof src[k] === 'boolean' ? src[k] : DEFAULT_VISIBILITY[k]])) as Visibility;
}

export const MASTERY_TIERS = ['Unranked', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Venice Legend'] as const;
export function masteryLabel(tier: number): string { return MASTERY_TIERS[Math.max(0, Math.min(5, Math.round(tier)))] ?? 'Unranked'; }

export type HighlightKind = 'session' | 'signature';
export interface HighlightCandidate { id: string; kind: HighlightKind; mode: string; score: number; won: boolean | null; at: string }
export interface Highlight extends HighlightCandidate { label: string | null }
export const MAX_HIGHLIGHTS = 6;

/** Personal bests per mode, wins, and signature attempts — what the owner can pin. Highest score first, one PB per mode first. */
export function candidateHighlights(
  sessions: { id: string; mode: string; score: number; won: boolean; createdAt: string | Date }[],
  signatures: { id: string; mode: string; score: number; createdAt: string | Date }[],
): HighlightCandidate[] {
  const iso = (d: string | Date) => (typeof d === 'string' ? d : d.toISOString());
  const pbs = new Map<string, HighlightCandidate>();
  for (const s of sessions) {
    const c: HighlightCandidate = { id: s.id, kind: 'session', mode: s.mode, score: s.score, won: s.won, at: iso(s.createdAt) };
    const cur = pbs.get(s.mode);
    if (!cur || c.score > cur.score) pbs.set(s.mode, c);
  }
  const rest = sessions.filter((s) => s.won && !pbs.has(s.mode) ? true : s.won && pbs.get(s.mode)?.id !== s.id)
    .map((s): HighlightCandidate => ({ id: s.id, kind: 'session', mode: s.mode, score: s.score, won: s.won, at: iso(s.createdAt) }));
  const sigs = signatures.map((s): HighlightCandidate => ({ id: s.id, kind: 'signature', mode: s.mode, score: s.score, won: null, at: iso(s.createdAt) }));
  const byScore = (a: HighlightCandidate, b: HighlightCandidate) => b.score - a.score || b.at.localeCompare(a.at);
  return [...[...pbs.values()].sort(byScore), ...rest.sort(byScore), ...sigs.sort(byScore)].slice(0, 40);
}

/** Owner's pins: only candidates they own, max six, labels clamped, order kept. */
export function normalizeHighlights(input: unknown, candidates: HighlightCandidate[]): Highlight[] {
  if (!Array.isArray(input)) return [];
  const byId = new Map(candidates.map((c) => [`${c.kind}:${c.id}`, c]));
  const out: Highlight[] = []; const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const key = `${String(r.kind)}:${String(r.id)}`;
    const c = byId.get(key);
    if (!c || seen.has(key)) continue;
    seen.add(key);
    const label = typeof r.label === 'string' && r.label.trim() ? r.label.trim().slice(0, 40) : null;
    out.push({ ...c, label });
    if (out.length >= MAX_HIGHLIGHTS) break;
  }
  return out;
}

export interface PublicStats {
  prq: Record<string, number> | null;                                  // eight attributes, measured over card
  mastery: { mode: string; tier: number; label: string; best: number | null }[];
  records: { mode: string; best: number; sessions: number; wins: number }[];
  resiliency: { attempts: number; retryRate: number; returnedAfterLoss: boolean | null } | null;
  movement: { latestAt: string | null; delta: Record<string, number> | null } | null;
  ladder: { mode: string; bestScore: number; weekStart: string } | null;
  verified: boolean;                                                   // every number above came from recorded sessions
}

/** Apply the owner's mask: hidden blocks come back null/empty so the wire shape stays stable. */
export function maskStats(stats: PublicStats, vis: Visibility): PublicStats {
  return {
    prq: vis.prq ? stats.prq : null,
    mastery: vis.mastery ? stats.mastery : [],
    records: vis.records ? stats.records : [],
    resiliency: vis.resiliency ? stats.resiliency : null,
    movement: vis.movement ? stats.movement : null,
    ladder: vis.records ? stats.ladder : null,
    verified: stats.verified,
  };
}

/** Records per mode from raw sessions (best score, count, wins), best first. */
export function recordsByMode(sessions: { mode: string; score: number; won: boolean }[]): PublicStats['records'] {
  const m = new Map<string, { mode: string; best: number; sessions: number; wins: number }>();
  for (const s of sessions) {
    const r = m.get(s.mode) ?? { mode: s.mode, best: 0, sessions: 0, wins: 0 };
    r.best = Math.max(r.best, s.score); r.sessions++; if (s.won) r.wins++; m.set(s.mode, r);
  }
  return [...m.values()].sort((a, b) => b.best - a.best);
}

/** Best of a mastery sample window (number[] or anything else → null). */
export function bestSample(samples: unknown): number | null {
  if (!Array.isArray(samples)) return null;
  const nums = samples.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return nums.length ? Math.max(...nums) : null;
}
