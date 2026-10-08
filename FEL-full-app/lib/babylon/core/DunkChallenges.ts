// DunkChallenges — set pieces on the practice runway, each with a target card (dunk-next phase 6, 2026-10-06).
//
// Owner, 2026-10-06: "set-piece challenges (original scenarios, generic names: e.g. 'from the stripe', 'over three', '720 off the
// bounce', 'perfect flight with a prop'), each with a target card". Fans asked for scenario challenges (fan list #19) — and the
// practice runway was the one place with nothing to aim at: free dunks, no judges, no goal.
//
// A CHALLENGE is a set piece and a number. On the practice runway L1 picks one (it sets up its prop when it has one); the next
// dunk is checked against the set piece and, if it was done, judged against the target. The card is the contest's card for that
// dunk (DunkCard + JudgePanel, the same inputs) judged as a first dunk of the night in a neutral room — never a repeat, never fresh,
// no hype, no stakes — so a target means the same thing every time you try it. Nothing about a challenge touches the night: not the
// totals, not the staked card, not the night's memory.
//
// The scenarios are original and generically named: no real player's moment, no trademark.
// Pure: no Babylon.
import { dunkCard, type DunkAttemptFacts } from './DunkCard';
import { judgeDunk } from './JudgePanel';

/** What the practice dunk did, as the challenge reads it. */
export interface ChallengeFacts {
  made: boolean;
  /** the air tricks that went off, by id (DunkSystem: 'spin360', 'spin720', 'windmill' …) */
  tricks: readonly string[];
  /** the prop id (DunkMode's PROPS: 'none', 'bounce', 'row3' …) */
  prop: string;
  /** DunkApproach.rangeLabel at the take-off */
  range: string;
  foot: 'one' | 'two';
  /** HEAD-ON / WING / BASELINE */
  side: string;
  /** DunkBeats.flightFlow */
  perfect: boolean;
  onBeat: number;
  /** the panel's total for the dunk (only read when the set piece was done) */
  total: number;
}

export interface DunkChallenge {
  id: string;
  name: string;
  /** how to do it, in one line */
  brief: string;
  /** TUNED (dunk-next phase 6): the card to beat */
  target: number;
  /** the prop the runway sets up when the challenge is picked (absent: keep the player's own) */
  prop?: string;
  /** '' when the set piece was done, else what was missing (shown on the banner) */
  missing(f: ChallengeFacts): string;
}

const OBSTACLE_THREE = 'row3';
const BOUNCE_PROPS = new Set(['bounce', 'oopbounce']);

/** TUNED (dunk-next phase 6): the targets, measured on the card with the contest's own functions (DunkChallenges.test pins that a
 *  clean, well-timed attempt clears each one and a sloppy one does not). */
export const DUNK_CHALLENGES: readonly DunkChallenge[] = [
  {
    id: 'stripe', name: 'FROM THE STRIPE', target: 40,
    brief: 'leave the floor from the free-throw line — any dunk',
    missing: (f) => (f.range === 'FROM THE STRIPE' ? '' : `TAKE OFF FROM THE STRIPE (YOU WENT ${f.range || 'FROM UNDER THE RIM'})`),
  },
  {
    id: 'overthree', name: 'OVER THREE', target: 42, prop: OBSTACLE_THREE,
    brief: 'clear the three in a row and finish it',
    missing: (f) => (f.prop === OBSTACLE_THREE ? '' : 'THE THREE IN A ROW HAS TO BE THE PROP'),
  },
  {
    id: 'bounce720', name: '720 OFF THE BOUNCE', target: 43, prop: 'bounce',
    brief: 'bounce it, catch it, and throw the 360 twice — the 720',
    missing: (f) => (!BOUNCE_PROPS.has(f.prop) ? 'IT HAS TO COME OFF THE BOUNCE' : !f.tricks.includes('spin720') ? 'THROW THE 360 AGAIN IN THE AIR — THE 720' : ''),
  },
  {
    id: 'perfectprop', name: 'PERFECT FLIGHT WITH A PROP', target: 41, prop: 'selflob',
    brief: 'any prop — every trick on its beat and the slam on time',
    missing: (f) => (f.prop === 'none' ? 'BRING A PROP' : !f.perfect ? 'EVERY TRICK ON ITS BEAT AND THE SLAM ON TIME' : ''),
  },
  {
    id: 'baseline', name: 'ONE FOOT OFF THE BASELINE', target: 39,
    brief: 'come in from the baseline and leave off one foot',
    missing: (f) => (f.side !== 'BASELINE' ? 'COME IN FROM THE BASELINE' : f.foot !== 'one' ? 'OFF ONE FOOT — A REAL RUN' : ''),
  },
  {
    id: 'beatchain', name: 'TWO ON THE BEAT', target: 44,
    brief: 'two tricks in one flight, both on their beats',
    missing: (f) => (f.tricks.length < 2 ? 'TWO TRICKS IN ONE FLIGHT' : f.onBeat < 2 ? 'BOTH ON THEIR BEATS' : ''),
  },
] as const;

export function challengeById(id: string | null | undefined): DunkChallenge | null {
  return DUNK_CHALLENGES.find((c) => c.id === id) ?? null;
}

/** L1 on the practice runway: none → each challenge in turn → none. */
export function nextChallenge(id: string | null | undefined): DunkChallenge | null {
  const i = DUNK_CHALLENGES.findIndex((c) => c.id === id);
  return i + 1 < DUNK_CHALLENGES.length ? DUNK_CHALLENGES[i + 1] : null;
}

export type ChallengeVerdict = 'cleared' | 'short' | 'notSetPiece' | 'missed';
export interface ChallengeResult { verdict: ChallengeVerdict; missing: string; total: number; target: number }

/** The practice dunk against the challenge: missed (no make), not the set piece, short of the target, or cleared. */
export function checkChallenge(c: DunkChallenge, f: ChallengeFacts): ChallengeResult {
  if (!f.made) return { verdict: 'missed', missing: '', total: 0, target: c.target };
  const missing = c.missing(f);
  if (missing) return { verdict: 'notSetPiece', missing, total: f.total, target: c.target };
  return { verdict: f.total >= c.target ? 'cleared' : 'short', missing: '', total: f.total, target: c.target };
}

/** The banner's words for a result. */
export function challengeLine(c: DunkChallenge, r: ChallengeResult, best = 0): string {
  const head = `${c.name}`;
  if (r.verdict === 'missed') return `${head} — NO DUNK · GO AGAIN`;
  if (r.verdict === 'notSetPiece') return `${head} — NOT THE SET PIECE: ${r.missing}`;
  const bestBit = best > 0 ? ` · BEST ${Math.max(best, r.total)}` : '';
  return r.verdict === 'cleared' ? `${head} — ${r.total} / ${r.target} · CLEARED!${bestBit}` : `${head} — ${r.total} / ${r.target} · ${r.target - r.total} SHORT${bestBit}`;
}

/** The runway chip for a picked challenge. */
export function challengeChip(c: DunkChallenge | null, best = 0, beaten = false): string {
  if (!c) return '';
  return `${c.name} · TARGET ${c.target}${best > 0 ? ` · BEST ${best}` : ''}${beaten ? ' ✓' : ''}`;
}

/** THE CHALLENGE CARD: the contest's card for this dunk (DunkCard + JudgePanel, the inputs finishAttempt passes), judged as a first dunk
 *  of the night in a neutral room — never a repeat, no freshness, no hype, the crowd at its middle — and no stakes. */
export function challengeCard(f: Omit<DunkAttemptFacts, 'hype' | 'repeat'>): { total: number; difficulty: number; execution: number; style: number } {
  const c = dunkCard({ ...f, hype: 0, repeat: false });
  return { ...c, total: judgeDunk(c.difficulty, c.execution, c.style, 0.5).reduce((a, j) => a + j.score, 0) };
}
