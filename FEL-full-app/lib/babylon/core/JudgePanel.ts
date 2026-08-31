// JudgePanel — FEL's shared Judge/Scoring system (Mode 1 Phase 7).
//
// Extracted from DunkMode/DunkDuelMode, which previously copy-pasted the
// same persona trio. One module now owns:
//   1. THE JUDGES — five personas with weighted lenses + voice lines.
//   2. THE REVEAL — ScoreReveal sequences the verdict like a televised
//      contest, beating NBA Live 07/08's instant number flash:
//        beat 1  judges confer (drum bed starts, crowd hushes)
//        beats   the cards flip one at a time, fast
//        beat n  LONG beat     (Prime makes you wait — the tension peak)
//        beat n+1 Prime's card + total + eruption/hush by score band
//      The mode drives the plan frame-by-frame; all timings here are pure
//      data so the drama is testable headlessly.
//   3. CrowdEnergy — the building's voice as a 0..1 level driven by hype,
//      momentum tier, and chain length; big scores spike it, blown dunks
//      hush it. Modes map the level to ambient volume + crowd VFX.
//
// ── D1: FIVE judges, so a perfect dunk is 50 ───────────────────────────────
// This panel shipped with THREE judges, so the ceiling was 30. The real Slam
// Dunk Contest — and NBA Live 08, the locked benchmark — uses five judges
// scoring 6–10 for a ceiling of 50, and "50!" is the single most recognisable
// call in the event. That is not a cosmetic difference: it is the number the
// entire broadcast is built around, and every player already knows what a
// perfect dunk is supposed to read as.
//
// The fix is not just "add two judges". Every downstream threshold was written
// against the 30 ceiling as a bare literal, so adding judges without touching
// them would have silently made an eruption trivial to reach. So thresholds are
// now expressed as a PER-JUDGE AVERAGE and multiplied by the panel size. The
// hardcoded ceiling was the bug; deriving it means it cannot drift again. The
// derivation is faithful — feeding it a 3-judge panel reproduces the original
// 27/24/20 bands exactly, which is the proof that nothing was rebalanced by
// accident while the ceiling moved.

// ── Judges ─────────────────────────────────────────────────────────────────
export interface JudgeScore { name: string; score: number; line: string }

/**
 * Five lenses, deliberately not five clones. Difficulty / execution / style are
 * each owned by a specialist, and the two added for the 50 ceiling are the two
 * archetypes a real panel always has: an all-arounder whose card is the
 * consensus, and a hard marker who never gives it away. `bias` is that
 * personality in points — it is what makes a spread of cards read as five
 * PEOPLE rather than one formula sampled five times.
 */
export const JUDGES = [
  { id: 'silk',  name: 'Silk',  w: { difficulty: 0.2,  execution: 0.3,  style: 0.5  }, bias: 0    },
  { id: 'doc',   name: 'Doc',   w: { difficulty: 0.3,  execution: 0.5,  style: 0.2  }, bias: 0    },
  { id: 'mac',   name: 'Mac',   w: { difficulty: 0.34, execution: 0.33, style: 0.33 }, bias: 0.3  },
  { id: 'reign', name: 'Reign', w: { difficulty: 0.4,  execution: 0.4,  style: 0.2  }, bias: -0.4 },
  { id: 'prime', name: 'Prime', w: { difficulty: 0.5,  execution: 0.3,  style: 0.2  }, bias: 0    },
] as const;

/** Panel size. Everything below derives from this — never hardcode 5. */
export const JUDGE_COUNT = JUDGES.length;
/** The number the broadcast is built around. 50. */
export const PERFECT_TOTAL = JUDGE_COUNT * 10;
/** Floor: every judge's minimum card. A made dunk can never score below this. */
export const MIN_TOTAL = JUDGE_COUNT * 6;

/** Convert a panel total back to the per-judge average the bands are written in. */
export function perJudgeAvg(total: number): number {
  return total / JUDGE_COUNT;
}

/**
 * Per-judge voices. Five judges reading the SAME canned line would have made
 * the panel feel like one judge with five cards — which would quietly weaken
 * the "each judge has a personality" criterion the trio already satisfied.
 */
const VOICES: Record<string, (score: number) => string> = {
  Silk: (s) => s >= 10 ? 'that was ART. Ten, and I want it framed.'
    : s >= 9 ? 'so smooth it looked easy. It was not.'
    : s >= 7 ? 'nice flair on the finish.'
    : 'clean, but you did not make me feel anything.',
  Doc: (s) => s >= 10 ? 'textbook. Nothing to correct. Ten.'
    : s >= 9 ? 'controlled all the way through the rim.'
    : s >= 7 ? 'solid mechanics, small wobble on the landing.'
    : 'it went in. That is the kindest thing I can say.',
  Mac: (s) => s >= 10 ? "that is the whole package. TEN."
    : s >= 9 ? 'everything you want in one dunk.'
    : s >= 7 ? 'good dunk, no argument here.'
    : 'somewhere in the middle for me.',
  Reign: (s) => s >= 10 ? 'you dragged a ten out of me. Enjoy it.'
    : s >= 9 ? 'close to perfect. Close.'
    : s >= 7 ? "I have seen that dunk before, done harder."
    : 'not enough. Bring me something real.',
  Prime: (s) => s >= 10 ? "THAT'S A TEN. Hand me the mic."
    : s >= 9 ? 'about as good as it gets.'
    : s >= 7 ? 'real difficulty, clean finish.'
    : "gets it done — I've seen bigger.",
};

export function cannedLine(name: string, score: number): string {
  const voice = VOICES[name];
  if (voice) return `${name}: ${voice(score)}`;
  // Unknown judge: fall back to the original neutral register rather than
  // throwing. A missing voice must never cost a mode its reveal.
  if (score >= 10) return `${name}: THAT'S A TEN. Hand me the mic.`;
  if (score >= 9) return `${name}: about as good as it gets.`;
  if (score >= 7) return `${name}: real difficulty, clean finish.`;
  return `${name}: gets it done — I've seen bigger.`;
}

export function judgeDunk(difficulty: number, execution: number, style: number): JudgeScore[] {
  return JUDGES.map((j) => {
    const raw = difficulty * j.w.difficulty + execution * j.w.execution + style * j.w.style;
    // Bias is small enough that a genuinely perfect dunk still reads 10 on
    // every card — a 50 must remain reachable, or the ceiling is decorative.
    const score = Math.max(6, Math.min(10, Math.round(6 + raw * 0.4 + j.bias)));
    return { name: j.name, score, line: cannedLine(j.name, score) };
  });
}

// ── Staged reveal ──────────────────────────────────────────────────────────
export interface RevealBeat {
  at: number;                    // seconds into the reveal
  kind: 'confer' | 'card' | 'drum' | 'total';
  judge?: JudgeScore;            // for 'card'
  total?: number;                // for 'total'
  band?: 'eruption' | 'approval' | 'tepid' | 'hush';
}

/** Card order. Prime is deliberately LAST — the drum beat belongs to him. */
export const REVEAL_ORDER = JUDGES.map((j) => j.name) as readonly string[];

// Reveal cadence. Two extra cards must not turn every dunk's aftermath into a
// slog: this fires after EVERY attempt, on top of a replay that already ran.
// So the cards flip faster than the trio's did (0.6s apart, not 1.0s) and the
// whole reveal lands at ~5.1s versus the old 4.6s — five cards for half a
// second more. The long drum hold before the final card is untouched, because
// that pause is the tension peak and the only slow beat worth paying for.
const FIRST_CARD = 0.7;
const CARD_GAP = 0.6;
const DRUM_HOLD = 0.8;          // Prime makes you wait
const TOTAL_HOLD = 0.6;         // beat between the last card and the total
const TAIL = 0.6;               // let the total land before the mode advances

/** Beat times for a panel of `n`, derived so timings cannot drift from JUDGES. */
export function revealTimeline(n: number = JUDGE_COUNT): {
  cards: number[]; drum: number; total: number; duration: number;
} {
  const r = (v: number): number => Math.round(v * 100) / 100;   // no float dust in beat times
  const cards: number[] = [];
  for (let i = 0; i < n - 1; i++) cards.push(r(FIRST_CARD + i * CARD_GAP));
  const drum = r(FIRST_CARD + (n - 1) * CARD_GAP);
  const last = r(drum + DRUM_HOLD);
  cards.push(last);
  const total = r(last + TOTAL_HOLD);
  return { cards, drum, total, duration: r(total + TAIL) };
}

/**
 * Score bands, written as the per-judge average each one represents. A 3-judge
 * panel run through this reproduces the original 27 / 24 / 20 thresholds
 * exactly — the ceiling moved, the standards did not.
 */
export const BAND_PER_JUDGE = { eruption: 9.0, approval: 8.0, tepid: 6.6 } as const;
export const BAND_TOTAL = {
  eruption: Math.round(JUDGE_COUNT * BAND_PER_JUDGE.eruption),   // 45
  approval: Math.round(JUDGE_COUNT * BAND_PER_JUDGE.approval),   // 40
  tepid: Math.round(JUDGE_COUNT * BAND_PER_JUDGE.tepid),         // 33
} as const;

export function totalBand(total: number): 'eruption' | 'approval' | 'tepid' | 'hush' {
  if (total >= BAND_TOTAL.eruption) return 'eruption';
  if (total >= BAND_TOTAL.approval) return 'approval';
  if (total >= BAND_TOTAL.tepid) return 'tepid';
  return 'hush';
}

/** Build the timed beat plan for a judged dunk. */
export function planReveal(scores: JudgeScore[]): RevealBeat[] {
  const byName = new Map(scores.map((s) => [s.name, s]));
  const total = scores.reduce((s, j) => s + j.score, 0);
  const t = revealTimeline(REVEAL_ORDER.length);

  const beats: RevealBeat[] = [{ at: 0, kind: 'confer' }];
  REVEAL_ORDER.forEach((name, i) => {
    // The drum lands immediately before the final card.
    if (i === REVEAL_ORDER.length - 1) beats.push({ at: t.drum, kind: 'drum' });
    beats.push({ at: t.cards[i], kind: 'card', judge: byName.get(name) });
  });
  beats.push({ at: t.total, kind: 'total', total, band: totalBand(total) });
  return beats;
}

/** How long the reveal runs before the mode may advance. */
export const REVEAL_DURATION_SEC = revealTimeline().duration;

/** Frame driver: returns beats that fired since the last call. */
export class ScoreReveal {
  private plan: RevealBeat[] = [];
  private t = 0;
  private fired = 0;
  active = false;

  start(scores: JudgeScore[]): void {
    this.plan = planReveal(scores);
    this.t = 0; this.fired = 0; this.active = true;
  }

  update(dt: number): RevealBeat[] {
    if (!this.active) return [];
    this.t += dt;
    const out: RevealBeat[] = [];
    while (this.fired < this.plan.length && this.plan[this.fired].at <= this.t) {
      out.push(this.plan[this.fired++]);
    }
    if (this.t >= REVEAL_DURATION_SEC) this.active = false;
    return out;
  }
}

// ── Crowd energy ───────────────────────────────────────────────────────────
export class CrowdEnergy {
  level = 0.25;                 // ambient bed never fully silent

  /** React to a revealed score. */
  onScore(total: number): void {
    const band = totalBand(total);
    if (band === 'eruption') this.level = 1;
    else if (band === 'approval') this.level = Math.max(this.level, 0.75);
    else if (band === 'tepid') this.level = Math.max(0.4, this.level * 0.8);
    else this.level = 0.18;                                    // the hush
  }

  /** Live drift toward what the moment deserves (hype + chain + tier). */
  update(dt: number, hype01: number, chain: number, onFire: boolean): void {
    const want = Math.min(1, 0.3 + hype01 * 0.45 + Math.min(0.2, chain * 0.06) + (onFire ? 0.2 : 0));
    const rate = want > this.level ? 0.8 : 0.35;               // rises fast, settles slow
    this.level += (want - this.level) * Math.min(1, rate * dt * 4);
  }
}
