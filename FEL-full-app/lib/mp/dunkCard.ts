// THE DUNK CARD — what the other player actually did, not just what they scored (2026-09-13).
//
// Owner: "in multiplayer we should see other peoples dunk and score."
//
// Today a challenge carries ONE NUMBER. `CompetitionMatch` stores `player1Score` and `player2Score` and
// nothing else, so when you stake a run against somebody the only thing you can ever learn about them is
// that they got 214. You cannot see what they threw, whether they blew one, or which round they won it in —
// which makes an async duel a leaderboard entry rather than a thing that happened.
//
// A card fixes that at the cheapest possible price. It is NOT a recording: recording an opponent's body is
// megabytes of transforms per attempt and there is nowhere to put it. It is the DESCRIPTION of each attempt
// — the style, the prop, the finish, the three judges' scores — which is small enough to ride in the JSON
// payload MatchEvent already has, so no schema change is needed. And because Dunk Contest picks a body's
// finish deterministically from those same values (pickAerialFinish / pickLanding), the card is enough to
// re-perform the attempt later if a replay is ever built. That is the whole reason it stores the finish clip
// key rather than just a label.
//
// VERSIONED from the first line. A card read back six months from now must never crash a results screen
// because a field moved, so unknown versions degrade to the score rather than throwing.
//
// Pure: no Babylon, no DOM, no Prisma.

export const DUNK_CARD_VERSION = 1;

/** One attempt. Small on purpose — this rides in a JSON column. */
export interface DunkAttempt {
  /** Round number, 1-based. */
  round: number;
  /** POWER | FLASHY | SIGNATURE — the style the player was in when it resolved. */
  style: string;
  /** The setup they used (standing, off the glass, off the bounce…). */
  prop: string;
  /** The finish clip key — what the body actually did. Empty when it was blown. */
  finish: string;
  /** Human label for the finish: 'WINDMILL', 'TOMAHAWK', 'BLOWN'… */
  label: string;
  /** The three judges, in panel order. */
  judges: number[];
  /** Sum of the judges. */
  total: number;
  /** Did the slam connect at all? */
  made: boolean;
  /** The three numbers the panel actually used, 0..10 (P9, 2026-09-16). Optional: a card written before this
   *  existed has none, and `nightReport` says so rather than inventing them. */
  diff?: number;
  exec?: number;
  look?: number;
}

export interface DunkCard {
  v: number;
  /** Contest total — must equal the sum of the attempts, and a test holds that. */
  total: number;
  attempts: DunkAttempt[];
  /** Best single attempt, for the headline. */
  best: number;
  makes: number;
  misses: number;
}

export const MAX_ATTEMPTS = 12;

export function emptyCard(): DunkCard {
  return { v: DUNK_CARD_VERSION, total: 0, attempts: [], best: 0, makes: 0, misses: 0 };
}

/** Fold one attempt into a card. Returns a new card — never mutates, so a mode can hold one safely. */
export function addAttempt(card: DunkCard, a: DunkAttempt): DunkCard {
  const attempts = [...card.attempts, a].slice(-MAX_ATTEMPTS);
  return {
    v: DUNK_CARD_VERSION,
    attempts,
    total: attempts.reduce((s, x) => s + x.total, 0),
    best: attempts.reduce((m, x) => Math.max(m, x.total), 0),
    makes: attempts.filter((x) => x.made).length,
    misses: attempts.filter((x) => !x.made).length,
  };
}

/**
 * Read a card back off the wire.
 *
 * Everything here is defensive, because the input is a JSON column written by an older build. A results
 * screen must never white-screen on a card it does not recognise — it falls back to the score, which is
 * exactly what players got before cards existed.
 */
export function parseCard(raw: unknown): DunkCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.v !== 'number' || o.v > DUNK_CARD_VERSION) return null;   // a future card is not ours to read
  if (!Array.isArray(o.attempts)) return null;
  const attempts: DunkAttempt[] = [];
  for (const item of o.attempts.slice(0, MAX_ATTEMPTS)) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    const judges = Array.isArray(a.judges) ? a.judges.map((n) => num(n)).slice(0, 3) : [];
    attempts.push({
      round: num(a.round, 1),
      style: str(a.style),
      prop: str(a.prop),
      finish: str(a.finish),
      label: str(a.label),
      judges,
      total: num(a.total),
      made: a.made === true,
      ...(a.diff !== undefined ? { diff: num(a.diff) } : {}),
      ...(a.exec !== undefined ? { exec: num(a.exec) } : {}),
      ...(a.look !== undefined ? { look: num(a.look) } : {}),
    });
  }
  if (!attempts.length) return null;
  return {
    v: DUNK_CARD_VERSION,
    attempts,
    total: attempts.reduce((s, x) => s + x.total, 0),
    best: attempts.reduce((m, x) => Math.max(m, x.total), 0),
    makes: attempts.filter((x) => x.made).length,
    misses: attempts.filter((x) => !x.made).length,
  };
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v.slice(0, 32) : '';
}

/** One line per attempt, for a results screen: "R2 · WINDMILL · 9 9 10 = 28". */
export function attemptLine(a: DunkAttempt): string {
  const judges = a.judges.length ? `${a.judges.join(' ')} = ` : '';
  return `R${a.round} · ${a.label || a.style || 'DUNK'} · ${judges}${a.total}`;
}

/** The headline a challenge screen shows above the breakdown. */
export function cardHeadline(card: DunkCard, who: string): string {
  return `${who} — ${card.total} · best ${card.best} · ${card.makes}/${card.attempts.length} made`;
}

/**
 * Why one card beat the other, in a sentence.
 *
 * A duel that just says "you lost" is the version players already had. This names the thing that decided it,
 * which is the only part anybody actually wants from a result screen.
 */
export function duelSummary(mine: DunkCard, theirs: DunkCard): string {
  if (mine.total === theirs.total) return `Dead level on ${mine.total}.`;
  const won = mine.total > theirs.total;
  const margin = Math.abs(mine.total - theirs.total);
  const bestGap = mine.best - theirs.best;
  const missGap = theirs.misses - mine.misses;
  // What a blown dunk actually COSTS is one average made attempt, not a magic 20 — the first version used 20
  // and reported "you were steadier" for a duel decided entirely by the other player blowing one, which is
  // the opposite of naming the reason.
  const avgMade = averageMade(mine) || averageMade(theirs) || 25;
  let because: string;
  if (missGap !== 0 && Math.abs(missGap) * avgMade >= margin * 0.8) {
    because = won ? `they blew ${theirs.misses}` : `you blew ${mine.misses}`;
  } else if (bestGap !== 0 && (bestGap > 0) === won) {
    because = won ? `your best went ${mine.best}` : `their best went ${theirs.best}`;
  } else {
    because = won ? 'you were steadier' : 'they were steadier';
  }
  return `${won ? 'Won' : 'Lost'} by ${margin} — ${because}.`;
}

function averageMade(card: DunkCard): number {
  const made = card.attempts.filter((a) => a.made);
  return made.length ? made.reduce((s, a) => s + a.total, 0) / made.length : 0;
}

/** Trim to what is safe to send: no names, no ids, no timestamps — just the performance. */
export function forWire(card: DunkCard): DunkCard {
  return {
    v: DUNK_CARD_VERSION,
    total: card.total,
    best: card.best,
    makes: card.makes,
    misses: card.misses,
    attempts: card.attempts.map((a) => ({ ...a, judges: a.judges.slice(0, 3) })),
  };
}

// ── WHAT THE NIGHT WAS (P9, 2026-09-16) ───────────────────────────────────────────────────────────────
//
// The contest ends on a number and a WON / OVER. A player who just lost by four has no way to know whether
// they lost it on the beat, on ambition, or on the two they threw at the iron early — and that is the one
// thing that decides whether the next night goes better. The panel already publishes the three numbers per
// attempt; the card now carries them, and this reads the night back in a sentence.
//
// Pure, and deliberately opinionated: it names ONE thing to change, because a list of five is a list nobody
// reads at 1 a.m. with the pad still in their hands.

export interface NightReport {
  /** The one-line summary the mode prints on the end card. */
  headline: string;
  /** The supporting numbers, longest-lever first. */
  lines: string[];
  /** The single thing to change next night. */
  advice: string;
}

const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function nightReport(card: DunkCard): NightReport {
  const made = card.attempts.filter((a) => a.made);
  const best = card.attempts.reduce<DunkAttempt | null>((m, a) => (!m || a.total > m.total ? a : m), null);
  const scored = card.attempts.filter((a) => a.exec !== undefined);
  const exec = avg(scored.map((a) => a.exec ?? 0));
  const diff = avg(scored.map((a) => a.diff ?? 0));
  const look = avg(scored.map((a) => a.look ?? 0));
  const lines: string[] = [];
  if (best) lines.push(`BEST ${best.total} — ${best.label || best.style}${best.prop && best.prop !== 'NO PROP' ? ` · ${best.prop}` : ''}`);
  lines.push(`${card.makes} down, ${card.misses} off the iron`);
  if (scored.length) lines.push(`DIFFICULTY ${diff.toFixed(1)} · EXECUTION ${exec.toFixed(1)} · STYLE ${look.toFixed(1)}`);

  // The advice is whichever number is furthest from where it could be — the longest lever, not the lowest score:
  // a night of plain dunks landed perfectly has nothing wrong with its execution, and saying so would be noise.
  let advice = 'Nothing to fix — that was the night.';
  if (!scored.length) advice = card.misses > card.makes ? 'Wait for the beat; you are throwing it early.' : 'Go again.';
  else if (card.misses >= Math.max(2, card.attempts.length / 2)) advice = 'You are throwing it at the iron before you get there — wait for the beat.';
  else if (exec < 6) advice = `The beat is costing you: ${exec.toFixed(1)} of 10 on execution. Let the cue go by and slam on NOW!`;
  else if (diff < 5) advice = 'Clean night, easy dunks. Call a harder one — the panel pays for what you try.';
  else if (look < 5) advice = 'Big dunks, quiet ones. Call your style on the runway and hang on the rim.';
  const headline = best ? `YOUR NIGHT: ${card.total} · BEST ${best.total}` : `YOUR NIGHT: ${card.total}`;
  return { headline, lines, advice };
}
