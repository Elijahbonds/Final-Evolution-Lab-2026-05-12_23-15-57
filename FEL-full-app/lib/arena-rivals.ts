/**
 * lib/arena-rivals.ts — Triumph-style instant opponents for the LC Arena.
 *
 * Triumph's core loop is not the open lobby — it's that a duel fires
 * IMMEDIATELY against an opponent at your level. FEL's population can't
 * guarantee a human is waiting, so Quick Match fills the seat with a House
 * Rival: a roster of named simulated athletes whose duel score is drawn
 * server-side, deterministically from the match seed, banded to the human's
 * own measured skill in that mode.
 *
 * Honesty rules baked in here (this touches the LC book):
 *   1. The rival's score NEVER reads the human's submitted score. The draw
 *      inputs are the match seed + the human's recent score history in the
 *      mode + the mode's global median. Same inputs, same score — auditable.
 *   2. The band centers on the player's own median (Triumph matches on YOUR
 *      rating), so house duels are competitive, not farmable and not
 *      hopeless. The factor range is symmetric (±18%).
 *   3. House rivals stake real LC from a house treasury through the SAME
 *      arenaLockEntry funnel as humans. When the house wins, the pot returns
 *      to the treasury. Nothing is minted into a player's wallet that the
 *      house didn't stake; the rake still burns. The book balances.
 *   4. House rivals are labelled in the UI (the list route flags ghost
 *      duels) — a simulated opponent is never dressed up as a human when
 *      credits ride on the result.
 */

import type { DbClient } from '@/lib/ledger';
import { applyLc, getOrCreateWallet } from '@/lib/wallet/wallet-service';
import { canonicalModeKey, LEGACY_MODE_KEYS } from '@/lib/game-data';
import { MUSIC_ATTEMPT_FINISH, DANCE_ATTEMPT_FINISH } from '@/lib/arena-music';

// ---------------------------------------------------------------------------
// House rival roster
// ---------------------------------------------------------------------------

export interface HouseRival {
  key: string;
  name: string;
  tagline: string;
}

/** The house roster. Names are deliberately FEL-flavored, not human-real. */
export const HOUSE_RIVALS: readonly HouseRival[] = [
  { key: 'venice-ghost', name: 'Venice Ghost', tagline: 'Runs the boardwalk at dawn.' },
  { key: 'night-market', name: 'Night Market', tagline: 'Only plays under lights.' },
  { key: 'the-alum', name: 'The Alum', tagline: 'Won it all in a season nobody recorded.' },
  { key: 'static', name: 'Static', tagline: 'You can hear the interference coming.' },
  { key: 'coachs-shadow', name: "Coach's Shadow", tagline: 'Runs every drill one more time.' },
  { key: 'boardwalk-phantom', name: 'Boardwalk Phantom', tagline: 'Seen on every court, never in the lobby.' },
  { key: 'kicksatron', name: 'Kicksatron', tagline: 'Calibrated, not born.' },
  { key: 'dream-teamer', name: 'Dream Teamer', tagline: 'Plays like the highlight already happened.' },
];

export const HOUSE_EMAIL_DOMAIN = '@fel.house';

export function houseEmail(key: string): string {
  return `${key}${HOUSE_EMAIL_DOMAIN}`;
}

export function isHouseEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.endsWith(HOUSE_EMAIL_DOMAIN);
}

/** Treasury seeded per house rival; topped up whenever it could not cover a
 *  max-fee lock, so the atomic funds check in arenaLockEntry never fails on
 *  the house side. The treasury is where house winnings return — a buffer,
 *  not a faucet: every credit a player wins from the house was staked by the
 *  house first. */
export const HOUSE_TREASURY_LC = 1_000_000; // TUNE(elijah)
export const HOUSE_MIN_COVER_LC = 10_000;   // top-up floor (>> max fee tier)

/**
 * Find-or-create the house roster as real User+PlayerProfile rows (they sit
 * in the same CompetitionMatch relations as humans). Password is a marker
 * string, not a hash — credential login against it always fails, so house
 * accounts can never authenticate.
 */
export async function ensureHouseRivals(db: DbClient): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const rival of HOUSE_RIVALS) {
    const email = houseEmail(rival.key);
    let user = await (db as any).user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      user = await (db as any).user.create({
        data: {
          email,
          name: rival.name,
          password: '!house-rival-no-login',
          role: 'house',
          profile: {
            create: {
              strength: 50, speed: 50, endurance: 50, agility: 50,
              power: 50, flexibility: 50, recovery: 50, mental: 50,
              labCredits: HOUSE_TREASURY_LC,
            },
          },
        },
        select: { id: true },
      });
    } else {
    }
    // The treasury is a wallet balance now (2026-09-04): top it up to HOUSE_TREASURY_LC whenever it cannot cover a
    // max-tier lock. A fresh house user's profile default (500) is overwritten by the same move.
    const w = await getOrCreateWallet(db as any, user.id);
    const have = Number(w.lc ?? 0);
    if (have < HOUSE_MIN_COVER_LC) {
      await applyLc(db as any, { playerId: user.id, delta: HOUSE_TREASURY_LC - have, reasonCode: 'HOUSE_TREASURY', source: 'admin_adjust', idempotencyKey: `house-topup:${user.id}:${Date.now()}`, metadata: { rival: rival.key } });
    }
    ids.set(rival.key, user.id);
  }
  return ids;
}

/** Deterministic rival pick from the match seed — the seed decides who shows up. */
export function pickHouseRival(seed: string): HouseRival {
  return HOUSE_RIVALS[Math.floor(seedU(seed, 'rival') * HOUSE_RIVALS.length)];
}

// ---------------------------------------------------------------------------
// Seeded deterministic randomness (pure)
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit over seed:salt — stable across runs, no Math.random. */
function seedHash(seed: string, salt: string): number {
  let h = 0x811c9dc5;
  const s = `${seed}:${salt}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A uniform [0,1) draw from the seed, namespaced by salt. */
export function seedU(seed: string, salt: string): number {
  return seedHash(seed, salt) / 0x100000000;
}

// ---------------------------------------------------------------------------
// Skill-banded score draw (pure)
// ---------------------------------------------------------------------------

export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Cold-start baselines (TUNE(elijah)) — used ONLY when neither the player
 * nor the population has any recorded session in the mode. Each is a rough
 * mid-band score on the mode's own scale (e.g. a 3PT rack run, a derby
 * night, a 1v1 game to its target). The moment real sessions exist, the
 * global median replaces these — they are scaffolding, not gospel.
 */
export const ARENA_SCORE_BASELINES: Record<string, number> = {
  dunkContest: 95,
  threePoint: 14,
  hoops1v1: 8,
  hoops3v3: 10,
  skateboarding: 500,
  bigAir: 400,
  golf: 200,
  baseball: 300,
  soccer: 3,
  tiebreak: 7,
  freerun: 300,
  brainBrawl: 600,
  whoSceneIt: 400,
  surfing: 300,
  snowboarding: 300,
  karateEndless: 400,
  karateVersus: 3,
  tennis: 21,
  football: 150,
  carnival: 300,
  mixedcombat: 100,
  dunkduel: 90,
  // MUSIC-SUITE P6 (2026-09-26, owner decision #12): every Arena set is now on the one house-beat scale
  // (lib/babylon/music/houseBeat.ts, ceiling 378,300), and the pre-P6 scores that set the rival before are no longer read
  // (RIVAL_SCORE_EVENT).
  // MUSIC-SUITE P6 FIX PASS (2026-09-26): 5,000 → 12,000. #12 said "5,000 baseline kept until real scores exist", but
  // 5,000 was a number on the OLD scale, and on the house beat it is a set nobody has to play: measured over 200 house
  // beats (outbox musicsuite/p6/arena-music-proof.json and this pass's re-measure), four keys pressed together on every
  // 8th — grade D, 9 % accuracy — scored 9,350–9,600, and kick-on-quarters (grade D) 6,000–6,800, against a cold-start
  // band of 4,100–5,900: every account's first music Quick Match was won by mashing, at up to 500 LC. 12,000 puts the
  // band at 9,840–14,160 — above every mash measured and where a grade-C set lands (right lanes on the quarter notes:
  // 12,400–13,200; a beginner at ±90 ms: median 14,950) — so the house plays a grade-C set, the line owner decision #13
  // already draws for a music win. TUNE(elijah).
  music: 12_000,
  // MUSIC-SUITE P9 (2026-09-29), owner decision #10 ("5,000 baseline kept"): the number is kept, and the SCALE under it
  // changed — an Arena dance set now scores its accuracy on the duel's house song, 0..10,000 (lib/babylon/dance/
  // houseSong.ts danceArenaScore), so 5,000 is a 50 % set: a grade C, the line decision #13 draws for a win. Measured on
  // the six authored house charts as they stood at the end of this phase's run (scripts/probes/_music-p9-fair-duels.ts →
  // outbox musicsuite/p9/fair-duels-proof.json; the charts were still being authored, so re-run it for today's numbers):
  // a masher at ~8 presses a second scores 295–1,016 and one press on every 16th 403–958 — far under the cold-start band
  // of 4,100–5,900 — while a beginner at ±90 ms who skips 1 step in 10 has a median of 6,345–6,689 (21 runs a song) and a
  // steady ±30 ms dancer scores 9,423–9,604. FLAGGED FOR THE OWNER: one press on EVERY BEAT, never reading the cue,
  // scores 3,562–4,691 on the four easier songs but 5,542 on CANALS and 6,067 on EVOLUTION (their charts sit mostly on
  // the beat), so on those two songs it usually beats this cold-start house — only in a player's FIRST dance Quick Matches
  // (after one, the band is theirs). The P6 music precedent raised its baseline (owner #40); here the owner's 5,000 is
  // kept as decided — a baseline above every beat-tapper (~7,400) would also sit above most ±90 ms beginners. TUNE(elijah).
  // On the OLD points scale a flawless BATTLE run topped out at 4,355 against this same 5,000.
  dance: 5000,
  training: 50,
};

/** Symmetric skill-band half-width: the rival scores within ±18% of the
 *  band center. TUNE(elijah). */
export const RIVAL_BAND = 0.18;

/**
 * MUSIC-SUITE P6 FIX PASS (2026-09-26): modes whose band never centres BELOW the cold-start baseline. Music: the band
 * centres on the player's own median, and a finished attempt with no taps is a real (rejudged) 0 — so one empty finish
 * drew a ghost of 0, a history of [9600 ×4, 0 ×6] drew 0 too, and 0-vs-0 ties (refunded, free) could fill the history
 * with zeros: then every 500 LC Quick Match had a ghost of 0 and any tap won 900 LC. With the floor, a player's own
 * history can only RAISE the house above the grade-C baseline, never lower it: the least a music win takes is a grade-C
 * set (decision #13's line), whatever the history holds.
 */
// MUSIC-SUITE P9 (2026-09-29): and dance, for the same reason — a finished dance attempt with no presses is a real,
// rejudged 0 (every step a MISS), so a history of zeros would draw a house of 0 that any press beats; with the floor the
// least a dance win takes is a grade-C set.
export const RIVAL_BASELINE_FLOOR: ReadonlySet<string> = new Set(['music', 'dance']);

/**
 * Modes whose sessions are not on the scale of a staked run, so the rival is banded on the player's own past Arena
 * scores in the mode instead of their sessions, and on the cold-start baseline until they have one.
 *
 * Music (owner, 2026-09-24: "Cap only Arena sets"): an Arena set ends after 32 bars, free play runs until END SET, and
 * both save a session under 'music'. The combo multiplier grows with the set, so a 4-minute free set scores two to three
 * times a 32-bar set played as well, and a rival centred on free sets would outscore the player on every staked set.
 */
// MUSIC-SUITE P9 (2026-09-29): and dance. A dance SESSION is free play's points total (a flawless set pays 9,555 on MORNING
// BOARDWALK and 19,740 on EVOLUTION, and an own song up to 79,680), while a staked dance set is its accuracy on the house
// song, 0..10,000 — so a rival centred on sessions would sit off the staked scale (above 10,000 on every good session).
// A dance rival is banded on the player's own rejudged Arena dance sets only (RIVAL_SCORE_EVENT), and the baseline until then.
export const RIVAL_FROM_DUEL_SCORES: ReadonlySet<string> = new Set(['music', 'dance']);

/**
 * MUSIC-SUITE P6 (2026-09-26, owner decision #12: "old music duel scores stop counting; 5,000 baseline kept until real
 * scores exist"). A past duel score in one of these modes bands the rival only when that duel carries this event BY THE
 * PLAYER: for music, a FINISHED house-beat attempt (lib/arena-music.ts), so the score is one the server rejudged from
 * the taps. Every music score from before phase 6 was the player's own grid on an open scale (up to 2,647,100) and has
 * no such event, so it no longer counts; nor does a forfeit (started, never finished: it submits 0 and is no measure of
 * the player). With none left, the draw falls to the 5,000 baseline.
 */
// MUSIC-SUITE P9 (2026-09-29), owner decision #10 ("old dance duel scores stop counting; 5,000 baseline kept"): for dance,
// a FINISHED house-song attempt (lib/arena-music.ts DANCE_ATTEMPT_FINISH) — every dance duel score from before phase 9 was
// a points total on the player's own pick (up to 79,680) with no such event, so it no longer counts; nor does a forfeit.
// With none left, the draw falls to the 5,000 baseline (a grade-C set on the new scale).
export const RIVAL_SCORE_EVENT: Readonly<Record<string, string>> = { music: MUSIC_ATTEMPT_FINISH, dance: DANCE_ATTEMPT_FINISH };

/** Every key a duel of this mode may be stored under: the current one and its old spellings (LEGACY_MODE_KEYS). */
export function storedModeKeys(mode: string): string[] {
  return [mode, ...Object.keys(LEGACY_MODE_KEYS).filter((k) => LEGACY_MODE_KEYS[k] === mode)];
}

/**
 * The player's own scores from their past duels, in the order given (newest first from the query), from CompetitionMatch
 * rows on either side. A score above `max` is dropped: it came from before the mode's ceiling, and no staked run can
 * reach it now. MUSIC-SUITE P6: with `requireEvent` (RIVAL_SCORE_EVENT), a row counts only if its `events` hold that
 * event by this player — a row that does not carry its events at all counts for nothing.
 */
export function ownDuelScores(
  rows: readonly { player1Id: string; player1Score: number | null; player2Score: number | null; events?: readonly { eventType: string; userId: string | null }[] }[],
  userId: string, max = Infinity, requireEvent?: string,
): number[] {
  return rows
    .filter((r) => !requireEvent || (r.events ?? []).some((e) => e.eventType === requireEvent && e.userId === userId))
    .map((r) => (r.player1Id === userId ? r.player1Score : r.player2Score))
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= max);
}

export interface RivalDraw {
  score: number;
  /** Where the band centered — the player's median, the population's, or a baseline. */
  center: number;
  source: 'player-history' | 'population' | 'baseline';
}

/**
 * Draw the house rival's duel score. Pure and deterministic: same seed +
 * same history in, same score out. The human's submitted score is NOT an
 * input — the rival cannot be drawn to just-beat or just-lose to it.
 *
 * Banding order (Triumph matches on your rating):
 *   1. the human's own recent scores in this mode (their level, right now);
 *   2. the population's recent median in this mode (a fresh player's stand-in);
 *   3. the cold-start baseline table.
 */
export function drawRivalScore(opts: {
  seed: string;
  mode: string;
  playerHistory: readonly number[];
  populationMedian?: number | null;
}): RivalDraw {
  let center: number;
  let source: RivalDraw['source'];
  if (opts.playerHistory.length > 0) {
    center = median(opts.playerHistory);
    source = 'player-history';
  } else if (typeof opts.populationMedian === 'number' && opts.populationMedian > 0) {
    center = opts.populationMedian;
    source = 'population';
  } else {
    // HOTFIX (2026-09-24): a duel stored as 'musicAcademy' has to find the music baseline, not the default of 100.
    center = ARENA_SCORE_BASELINES[canonicalModeKey(opts.mode)] ?? 100;
    source = 'baseline';
  }
  // MUSIC-SUITE P6 FIX PASS: never below the baseline in a floored mode (RIVAL_BASELINE_FLOOR)
  const key = canonicalModeKey(opts.mode);
  const floor = ARENA_SCORE_BASELINES[key];
  if (RIVAL_BASELINE_FLOOR.has(key) && typeof floor === 'number' && !(center >= floor)) {
    center = floor;
    source = 'baseline';
  }
  const u = seedU(opts.seed, 'rival-score');
  const factor = 1 - RIVAL_BAND + u * RIVAL_BAND * 2;
  const score = Math.max(0, Math.round(center * factor));
  return { score, center, source };
}
