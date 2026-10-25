// lib/coach-business/market.ts — COACH-BUSINESS: find a coach (owner, 2026-10-25). Coaches who opt in are listed and
// can be filtered by sport and goal; a visitor then opens the coach's page to apply or book.
//
// Pure. A card carries the coach's own public profile and package prices — never a client, never a count of clients.
// The vocabulary is fixed (a coach ticks from these lists), so a filter is an exact match and a URL cannot inject text.

export const SPORTS = [
  ['basketball', 'Basketball'],
  ['volleyball', 'Volleyball'],
  ['football', 'Football'],
  ['soccer', 'Soccer'],
  ['track', 'Track & field'],
  ['baseball', 'Baseball & softball'],
  ['tennis', 'Tennis'],
  ['strength', 'Strength'],
  ['general', 'General fitness'],
] as const;
export type Sport = (typeof SPORTS)[number][0];

export const MARKET_GOALS = [
  ['vertical', 'Jump higher'],
  ['speed', 'Speed & agility'],
  ['strength', 'Get stronger'],
  ['mobility', 'Mobility & posture'],
  ['skills', 'Sport skills'],
  ['comeback', 'Coming back from injury'],
  ['conditioning', 'Conditioning'],
] as const;
export type MarketGoal = (typeof MARKET_GOALS)[number][0];

const SPORT_KEYS: ReadonlySet<string> = new Set(SPORTS.map(([k]) => k));
const GOAL_KEYS: ReadonlySet<string> = new Set(MARKET_GOALS.map(([k]) => k));

export const sportLabel = (k: string): string => SPORTS.find(([s]) => s === k)?.[1] ?? k;
export const goalLabel = (k: string): string => MARKET_GOALS.find(([g]) => g === k)?.[1] ?? k;

/** Keep only known keys, each once, in list order. */
export function cleanSports(v: unknown): Sport[] {
  const set = new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return SPORTS.map(([k]) => k).filter((k) => set.has(k));
}
export function cleanGoals(v: unknown): MarketGoal[] {
  const set = new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return MARKET_GOALS.map(([k]) => k).filter((k) => set.has(k));
}

export interface MarketQuery { sport: Sport | null; goal: MarketGoal | null }

/** `?sport=&goal=` → a query. Anything not on the lists is "any". */
export function parseMarketQuery(params: Record<string, string | string[] | undefined>): MarketQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const sport = one(params.sport).trim().toLowerCase();
  const goal = one(params.goal).trim().toLowerCase();
  return { sport: SPORT_KEYS.has(sport) ? (sport as Sport) : null, goal: GOAL_KEYS.has(goal) ? (goal as MarketGoal) : null };
}

export interface MarketCard {
  slug: string;
  displayName: string;
  headline: string | null;
  specialties: string[];
  sports: Sport[];
  goals: MarketGoal[];
  /** The lowest active package price, in cents, and whether that package bills monthly. Null: no priced package yet. */
  fromPriceCents: number | null;
  fromMonthly: boolean;
  acceptingClients: boolean;
}

/** The listed coaches matching a query. A coach not accepting clients is still listed (their page says so), after the rest. */
export function filterCoaches(cards: readonly MarketCard[], q: MarketQuery): MarketCard[] {
  return cards
    .filter((c) => (q.sport ? c.sports.includes(q.sport) : true) && (q.goal ? c.goals.includes(q.goal) : true))
    .slice()
    .sort((a, b) => Number(b.acceptingClients) - Number(a.acceptingClients) || a.displayName.localeCompare(b.displayName));
}

/** A filter link that keeps the other filter. `null` clears that one. */
export function marketHref(q: MarketQuery, change: Partial<MarketQuery>): string {
  const next = { ...q, ...change };
  const p = new URLSearchParams();
  if (next.sport) p.set('sport', next.sport);
  if (next.goal) p.set('goal', next.goal);
  const s = p.toString();
  return s ? `/coaches?${s}` : '/coaches';
}
