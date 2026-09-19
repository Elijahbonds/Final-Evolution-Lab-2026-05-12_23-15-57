// SEASON SPECIALS (owner, 2026-09-18: "those will be specials that are gate kept for season pass subscribers").
//
// The dunk contest's specials — the HOPPING KANGAROO on the prop ring (the giraffe was cut: owner, "take the giraffe out"), the tap off the sky tier, the flip
// off the top of the backboard, the backboard run — are the PRO lane's. The lane comes from the season API (`hasPro` on
// /api/season); a guest or a free-lane player sees the specials named and locked, never silently missing.
// Dev only: `?pass=1` / `?pass=0` on the url overrides the read (the lab measures the specials without a login).

export type SeasonLane = 'guest' | 'free' | 'pro';
export type DunkSpecial = 'kangaroo' | 'skyTap' | 'boardTopFlip' | 'boardRun';
export const DUNK_SPECIALS: Record<DunkSpecial, { name: string }> = {
  kangaroo: { name: 'THE HOPPING KANGAROO' },
  skyTap: { name: 'THE SKY TAP' }, boardTopFlip: { name: 'THE BOARD-TOP BACKFLIP' }, boardRun: { name: 'THE BACKBOARD RUN' },
};
export const SPECIAL_PROPS: ReadonlySet<string> = new Set(['kangaroo']);

/** Is this special open on this lane? Only the PRO lane. */
export function specialOpen(lane: SeasonLane): boolean { return lane === 'pro'; }
/** The refusal a locked special answers with. */
export function specialLockLine(special: DunkSpecial): string { return `SEASON PASS SPECIAL — ${DUNK_SPECIALS[special].name}`; }

/** The dev override on the url, or null. */
export function devPassOverride(search: string): SeasonLane | null {
  try { const v = new URLSearchParams(search).get('pass'); if (v === '1' || v === 'pro') return 'pro'; if (v === '0' || v === 'free') return 'free'; } catch { /* no url */ }
  return null;
}
/** Decode the season API's answer into a lane. */
export function laneFromSeason(res: { active?: boolean; hasPro?: boolean } | null, status: number): SeasonLane {
  if (status === 401 || !res) return 'guest';
  return res.hasPro ? 'pro' : 'free';
}

let laneCache: SeasonLane | null = null;
/** The player's lane, read once a page (the dev override wins; a guest reads 'guest'). */
export async function readSeasonLane(): Promise<SeasonLane> {
  if (laneCache) return laneCache;
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') { const o = devPassOverride(window.location.search); if (o) return (laneCache = o); }
  try {
    const r = await fetch('/api/season');
    const body = r.ok ? await r.json().catch(() => null) : null;
    return (laneCache = laneFromSeason(body, r.status));
  } catch { return (laneCache = 'guest'); }
}
