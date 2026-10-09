// brainBrawlPlay — the pure rules behind Brain Brawl's IMPROVE pass (2026-10-06). No Babylon, no DOM: BrainBrawlMode wires
// them to input, the wheel and the podiums; this file is what the tests pin. (Spot the Scene's whoScenePlay is the pattern,
// and its comparedRun / tickSecond are reused rather than copied.)
import type { ChallengeKind, Category } from '../core/BrainBrawlCore';
import { comparedRun } from './whoScenePlay';

export { tickSecond } from './whoScenePlay';

// ── #2 the spinner spins ─────────────────────────────────────────────────────────────────────────────────────────────

/** NEW TUNED NUMBERS: the wheel waits this long for the spinner's press before it spins itself, and a press held this long is
 *  a full-strength spin (a pad's or the keyboard's release spins it sooner; a touch tap with no release spins at the cap). */
export const SPIN_WAIT_S = 4, CHARGE_FULL_S = 0.8;

/** Whole turns for a spin of `charge` (0..1): a tap is three, a full hold five — the range the wheel always drew from. */
export function spinTurns(charge: number): number {
  const k = Math.max(0, Math.min(1, Number.isFinite(charge) ? charge : 0));
  return 3 + Math.round(k * 2);
}

// ── #12 the wheel's final crawl ──────────────────────────────────────────────────────────────────────────────────────

/** NEW TUNED NUMBERS: after the fast part (BrainBrawlMode.SPIN_S, unchanged at 1.5 s) the wheel crawls this far (in pegs — a
 *  wedge's width) over this long, so the pin creeps the last peg and the landing has a beat of suspense. */
export const WHEEL_CRAWL = { sec: 0.55, pegs: 0.9 } as const;
const PEG = (Math.PI * 2) / 5;

/**
 * The wheel's roll `t` seconds into a spin from `from` to `to`: a fast part of `fastS` that slows to the crawl's speed, then the
 * crawl, decelerating evenly to rest on `to` at fastS + crawlS. The speed never jumps between the two (the crawl starts at the
 * speed the fast part ends on) and never goes backwards. A spin too short to hold the crawl is one plain ease-out.
 */
export function wheelRoll(t: number, from: number, to: number, fastS: number, crawlS = WHEEL_CRAWL.sec, crawlPegs = WHEEL_CRAWL.pegs): number {
  const D = to - from, total = fastS + crawlS;
  if (t <= 0) return from;
  if (t >= total || D <= 0) return to;
  const C = Math.min(crawlPegs * PEG, D * 0.25);
  const v0 = (2 * C) / crawlS;                       // the crawl's opening speed: C covered while easing evenly to zero
  if (D - C < v0 * fastS) { const k = t / total; return from + D * (1 - Math.pow(1 - k, 3)); }
  if (t <= fastS) {
    const vs = v0 + (3 * (D - C - v0 * fastS)) / fastS;   // v(t) = v0 + (vs − v0)(1 − t/fastS)², integrating to D − C
    const u = 1 - t / fastS;
    return from + v0 * t + ((vs - v0) * fastS / 3) * (1 - u * u * u);
  }
  const s = t - fastS;
  return from + D - C + v0 * s - (v0 * s * s) / (2 * crawlS);
}

// ── #3 the CPU contestant ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Who gets the CPU: a one-player night, except where the score is compared with another player's (an Arena run, an async
 * challenge, a friend's link — whoScenePlay.comparedRun: two players under one comparison must have the same luck) and the
 * knowledge feed's REVIEW round (`?round=review`, lane/knowledge-feed: the player's own cards, solo by design).
 */
export function cpuAllowed(search: string | null | undefined): boolean {
  if (comparedRun(search)) return false;
  try { return new URLSearchParams(search ?? '').get('round') !== 'review'; } catch { return true; }
}

/** NEW TUNED NUMBERS: the CPU contestant. QuizRound's foe defaults are 0.65 / 0.5; a Brain Brawl card is decoded, not
 *  recalled, and a CPU that claims two in three cards off a new player reads as a wall — so it is a little less sure and a
 *  little slower (Spot the Scene's rival is 0.55 / 0.35). */
export const BB_CPU = { skill: 0.55, speed: 0.4 } as const;

export interface CpuPlan { at: number; right: boolean }

/** The CPU commits to WHEN (seconds into the answer clock) and WHETHER it is right as the card opens — QuizRound.armFoe's
 *  window: no earlier than 15 % of the clock, no later than 1 − 0.7 × speed of it. */
export function armCpu(timeLimit: number, rnd: () => number, cpu: { skill: number; speed: number } = BB_CPU): CpuPlan {
  const earliest = timeLimit * 0.15;
  const latest = timeLimit * (1 - cpu.speed * 0.7);
  return { at: earliest + rnd() * Math.max(0.1, latest - earliest), right: rnd() < cpu.skill };
}

/** The option the CPU presses: the answer, or one of the others at random. */
export function cpuChoice(answer: number, options: number, right: boolean, rnd: () => number): number {
  if (right || options < 2) return answer;
  const wrong = Array.from({ length: options }, (_, i) => i).filter((i) => i !== answer);
  return wrong[Math.min(wrong.length - 1, Math.floor(rnd() * wrong.length))];
}

// ── #4 solo strikes ──────────────────────────────────────────────────────────────────────────────────────────────────

/** NEW TUNED NUMBER: a solo night ends on this many misses (a wrong answer or the clock running out). */
export const SOLO_STRIKES = 3;

/** The strike row as the HUD draws it: ✗ for each miss, · for each one left. */
export function strikeRow(strikes: number, max = SOLO_STRIKES): string {
  const n = Math.max(0, Math.min(max, strikes));
  return '✗'.repeat(n) + '·'.repeat(max - n);
}

// ── #10 the duel handicap ────────────────────────────────────────────────────────────────────────────────────────────

/** NEW TUNED NUMBERS: the handicap steps, in seconds. Negative gives P1 the extra time, positive gives it to P2. */
export const HANDICAP_STEPS = [-4, -2, 0, 2, 4] as const;

/** The next handicap one step along (`dir` +1 toward P2, −1 toward P1), held at the ends. */
export function stepHandicap(h: number, dir: 1 | -1): number {
  const i = HANDICAP_STEPS.indexOf(h as (typeof HANDICAP_STEPS)[number]);
  const at = i < 0 ? HANDICAP_STEPS.indexOf(0) : i;
  return HANDICAP_STEPS[Math.max(0, Math.min(HANDICAP_STEPS.length - 1, at + dir))];
}

/** Seat `seat`'s extra seconds under handicap `h` (only a duel's two seats ever get any). */
export function extraFor(h: number, seat: number): number {
  if (seat === 0) return h < 0 ? -h : 0;
  if (seat === 1) return h > 0 ? h : 0;
  return 0;
}

/** The pick screen's line for a handicap. */
export function handicapLabel(h: number): string {
  return h === 0 ? 'HANDICAP · EVEN' : `HANDICAP · ${h < 0 ? 'P1' : 'P2'} +${Math.abs(h)} s`;
}

// ── #8 the fastest right answers, per category and per kind (device only) ─────────────────────────────────────────────

export const FASTEST_KEY = 'fel.brainbrawl.fastest';
export type Fastest = Record<string, number>;

/** Read the stored table; anything that is not a table of positive numbers reads as empty. */
export function parseFastest(raw: string | null | undefined): Fastest {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Fastest = {};
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[k] = n;
    return out;
  } catch { return {}; }
}

/**
 * A right answer in `sec` seconds: the table with it recorded (the category and `category/kind` keep their fastest), and the
 * line to show when it BEATS a time already on the table ("NEW BEST COMPUTE 2.1 s"). A first time is recorded silently — a
 * new device would otherwise call every first answer a best. The category's best wins the line over the kind's.
 */
export function recordFastest(table: Fastest, category: Category, kind: ChallengeKind, sec: number): { table: Fastest; note: string } {
  if (!(sec > 0) || !Number.isFinite(sec)) return { table, note: '' };
  const t = Math.round(sec * 10) / 10 || 0.1;
  const next = { ...table };
  let note = '';
  const kk = `${category}/${kind}`;
  for (const [key, label] of [[kk, `${category} ${KIND_NAME[kind]}`], [category, category]] as const) {
    const prev = table[key];
    if (prev === undefined || t < prev) next[key] = t;
    if (prev !== undefined && t < prev) note = `NEW BEST ${label} ${t.toFixed(1)} s`;
  }
  return { table: next, note };
}

// ── #9 first-time how-to, per challenge kind (device only) ────────────────────────────────────────────────────────────

export const HOWTO_KEY = 'fel.brainbrawl.howto';
/** NEW TUNED NUMBERS: the how-to card holds this long, and a press may move on once it has been up HOWTO_SKIP_S. */
export const HOWTO_S = 3.2, HOWTO_SKIP_S = 0.5;

export const KIND_NAME: Record<ChallengeKind, string> = {
  sequence: 'SEQUENCE', pattern: 'PATTERN', recall_grid: 'GRID', order_repeat: 'ORDER', arithmetic: 'SUMS', quantity: 'MORE OR LESS',
  rotation: 'ROTATION', shape_match: 'SAME SHAPE', count: 'COUNT', odd_one_out: 'ODD ONE OUT', recognition: 'FLASH COUNT',
};

/** What each kind asks, with a worked example where one fits on a line. Every example is checked by the test. */
export const HOW_TO: Record<ChallengeKind, string> = {
  sequence: 'The numbers follow one rule. Find it and pick the next number.  2 4 6 8 ? → 10',
  pattern: 'The shapes repeat. Pick the shape that comes next.  ▲ ● ▲ ● ▲ ? → ●',
  recall_grid: 'Some cells light up for a moment, then hide. You are asked how many were lit, or which one.',
  order_repeat: 'A row of shapes shows for a moment, then hides. Pick the same row in the same order.',
  arithmetic: 'Work it out and pick the answer.  7 + 5 = ? → 12',
  quantity: 'Two rows of dots. Pick the side with more.',
  rotation: 'Turn the shape in your head by the angle asked (90° and 270° turn clockwise). Pick how it looks.',
  shape_match: 'Pick the option that is exactly the same shape, not turned and not flipped.',
  count: 'Count the ▲ in the grid.',
  odd_one_out: 'One symbol in the row is different. Pick its position, counting from the left.',
  recognition: 'Symbols flash for a moment, then hide. Count how many of the one asked for you saw.',
};

/** The kinds this device has been shown; anything unreadable reads as none. */
export function parseSeenKinds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw) as unknown; return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []; } catch { return []; }
}

// ── #11 end the memorise on a press ──────────────────────────────────────────────────────────────────────────────────

/** NEW TUNED NUMBER: the display is always up at least this long before a press may end the memorise early. */
export const EXPOSE_SKIP_MIN_S = 0.5;

/** The memorise ends early when every human seat has pressed (a duel waits for both: one player must not cut the other's). */
export function exposeDone(ready: readonly boolean[], humans: number): boolean {
  for (let i = 0; i < humans; i++) if (!ready[i]) return false;
  return humans > 0;
}
