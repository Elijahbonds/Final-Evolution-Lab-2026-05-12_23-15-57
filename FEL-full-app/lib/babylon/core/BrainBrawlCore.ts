// BrainBrawlCore — the pure rules of Brain Brawl (A+ mission #11; owner benchmark: Trivia Crack category wheel × Big Brain
// Academy graded cognitive minigames). Five categories on a wheel; landing on one launches THAT category's challenge — a
// timed interactive minigame graded on speed AND accuracy, never multiple-choice trivia. Winning a challenge claims the
// category; claim all five and the match is won. Content is GENERIC and generated from seeds (owner rule: nothing from the
// Blueprint, no spaced repetition, no feed mechanics, no backend — the personal best is localStorage, kept by the mode).

export const CATEGORIES = ['LOGIC', 'MEMORY', 'COMPUTE', 'ANALYZE', 'IDENTIFY'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_COLOR: Record<Category, string> = { LOGIC: '#F4C542', MEMORY: '#C58BFF', COMPUTE: '#4FD1E8', ANALYZE: '#7CE577', IDENTIFY: '#FF6A5B' };
export type Tier = 1 | 2 | 3;

// ── seeded randomness ─────────────────────────────────────────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(rnd: () => number, arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const shuffle = <T,>(rnd: () => number, arr: readonly T[]): T[] => { const o = [...arr]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
/**
 * The four options: the answer and three distractors, shuffled.
 *
 * BRAINBRAWL-RESIDUAL (2026-09-24): `min` is the smallest value the question can have. "How many ★ flashed?" with an answer
 * of 0 was offered −2 (the eye's run, IDENTIFY round 3): the pool of nearby counts ran dry at 0 and the old top-up walked
 * +1, −2, +6… straight past zero. A count, a quantity or a subtraction of a ≥ b is never negative; the top-up now walks
 * ±1, ±2, ±3… and skips anything under `min`.
 */
const uniqueOptions = (rnd: () => number, answer: string, distractors: () => string, n = 4, min = -Infinity): { options: string[]; answer: number } => {
  const set = new Set<string>([answer]);
  const ok = (s: string) => !Number.isFinite(Number(s)) || Number(s) >= min;
  let guard = 0;
  while (set.size < n && guard++ < 200) { const d = distractors(); if (ok(d)) set.add(d); }
  // small numeric answers can run the distractor pool dry — top up deterministically, never under the floor
  const num = Number(answer);
  for (let k = 1; set.size < n && k < 100 && Number.isFinite(num); k++) {
    const off = Math.ceil(k / 2) * (k % 2 ? 1 : -1);
    if (num + off >= min) set.add(String(num + off));
  }
  if (set.size < n) throw new Error(`no ${n} options for ${answer}`);
  const options = shuffle(rnd, [...set]);
  return { options, answer: options.indexOf(answer) };
};

// ── a challenge ───────────────────────────────────────────────────────
export type ChallengeKind =
  | 'sequence' | 'pattern'                 // LOGIC
  | 'recall_grid' | 'order_repeat'         // MEMORY
  | 'arithmetic' | 'quantity'              // COMPUTE
  | 'rotation' | 'shape_match' | 'count'   // ANALYZE
  | 'odd_one_out' | 'recognition';         // IDENTIFY

export interface Challenge {
  id: string;
  category: Category;
  kind: ChallengeKind;
  tier: Tier;
  /** The instruction line. */
  prompt: string;
  /** What is shown (a sequence, a grid as rows of glyphs, an expression…). */
  display: string[];
  /** Seconds the display stays before the answers appear (memory challenges); 0 = shown with the answers. */
  exposureSec: number;
  /** Four answers on A B C D (the faces; P2 on the d-pad). */
  options: string[];
  answer: number;
  timeLimitSec: number;
}

const TIME_LIMIT: Record<Tier, number> = { 1: 10, 2: 8, 3: 6 };
const GLYPHS = ['▲', '●', '■', '◆', '★', '✚', '◐', '⬟'];
const SHAPES = ['▲', '●', '■', '◆'];

function seqChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const kind = pick(rnd, ['add', 'mul', 'alt', 'fib'] as const);
  const len = 4 + tier;
  let seq: number[] = [];
  if (kind === 'add') { const a = 1 + Math.floor(rnd() * 9), d = (1 + Math.floor(rnd() * (3 * tier))) * (rnd() < 0.3 ? -1 : 1); seq = Array.from({ length: len }, (_, i) => a + d * i); }
  else if (kind === 'mul') { const a = 1 + Math.floor(rnd() * 3), r = 2 + Math.floor(rnd() * (tier)); seq = Array.from({ length: len }, (_, i) => a * r ** i); }
  else if (kind === 'alt') { const a = 2 + Math.floor(rnd() * 9), d1 = 1 + Math.floor(rnd() * 4), d2 = 1 + Math.floor(rnd() * 3 * tier); seq = [a]; for (let i = 1; i < len; i++) seq.push(seq[i - 1] + (i % 2 ? d1 : -d2)); }
  else { const a = 1 + Math.floor(rnd() * 3), b = a + Math.floor(rnd() * 3); seq = [a, b]; for (let i = 2; i < len; i++) seq.push(seq[i - 1] + seq[i - 2]); }
  const answer = seq[seq.length - 1];
  const shown = seq.slice(0, -1);
  const { options, answer: idx } = uniqueOptions(rnd, String(answer), () => String(answer + (Math.floor(rnd() * 7) - 3 || 4) * (1 + Math.floor(rnd() * tier))));
  // ONE line, the gap at its end: the '?' was a second display line, so it sat alone under the numbers (eye, LOGIC r2)
  return { id, category: 'LOGIC', kind: 'sequence', tier, prompt: 'What comes next?', display: [[...shown, '?'].join('   ')], exposureSec: 0, options, answer: idx, timeLimitSec: TIME_LIMIT[tier] };
}

function patternChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const period = 2 + Math.min(tier, 2);
  const unit = shuffle(rnd, SHAPES).slice(0, period);
  const total = period * 2 + tier;
  const seq = Array.from({ length: total }, (_, i) => unit[i % period]);
  const answer = seq[seq.length - 1];
  const { options, answer: idx } = uniqueOptions(rnd, answer, () => pick(rnd, GLYPHS));
  return { id, category: 'LOGIC', kind: 'pattern', tier, prompt: 'Which shape continues the pattern?', display: [[...seq.slice(0, -1), '?'].join(' ')], exposureSec: 0, options, answer: idx, timeLimitSec: TIME_LIMIT[tier] };
}

/**
 * MEMORY: a 3×3 grid flashes 2 + tier lit cells, then asks how many, or which one.
 *
 * BRAINBRAWL-RESIDUAL (2026-09-24) — "which cell was lit?" HAD MORE THAN ONE RIGHT ANSWER. It lit three to five cells, keyed
 * ONE of them, and drew the distractors from all nine, so the other lit cells turned up as options and were marked wrong
 * (the eye's run: A3, B2 and C1 lit, options A3 / A2 / C1 / C2, key C1 — A3 was right and lost the round). The distractors
 * come from the UNLIT cells only: exactly one option was lit. Nine cells less at most five lit leaves four unlit, so three
 * distractors always exist.
 */
function recallGridChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const size = 3, lit = 2 + tier;
  const cells = shuffle(rnd, Array.from({ length: size * size }, (_, i) => i)).slice(0, lit);
  const rows = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => (cells.includes(r * size + c) ? '●' : '·')).join(' '));
  const ask = rnd() < 0.5 ? 'count' : 'which';
  if (ask === 'count') {
    const { options, answer } = uniqueOptions(rnd, String(lit), () => String(1 + Math.floor(rnd() * 7)), 4, 1);
    return { id, category: 'MEMORY', kind: 'recall_grid', tier, prompt: 'How many cells were lit?', display: rows, exposureSec: 2.2 - tier * 0.3, options, answer, timeLimitSec: TIME_LIMIT[tier] };
  }
  const labelOf = (i: number) => `${'ABC'[Math.floor(i / size)]}${(i % size) + 1}`;
  const litCell = pick(rnd, cells);
  const unlit = Array.from({ length: size * size }, (_, i) => i).filter((i) => !cells.includes(i));
  const options = shuffle(rnd, [litCell, ...shuffle(rnd, unlit).slice(0, 3)].map(labelOf));
  return { id, category: 'MEMORY', kind: 'recall_grid', tier, prompt: 'Which cell was lit? (rows A–C, columns 1–3)', display: rows, exposureSec: 2.2 - tier * 0.3, options, answer: options.indexOf(labelOf(litCell)), timeLimitSec: TIME_LIMIT[tier] };
}

function orderRepeatChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const len = 3 + tier;
  const seq = Array.from({ length: len }, () => pick(rnd, SHAPES));
  const answer = seq.join(' ');
  // a wrong order is two shapes swapped, or one shape changed — a run of one shape (▲ ▲ ▲ ▲ ▲) has no swap that differs, and
  // the old top-up then offered "▲ ▲ ▲ ▲ ▲1" (BRAINBRAWL-RESIDUAL: uniqueOptions no longer pads a card with junk)
  const { options, answer: idx } = uniqueOptions(rnd, answer, () => {
    const o = [...seq]; const i = Math.floor(rnd() * len);
    if (rnd() < 0.5) { const j = (i + 1 + Math.floor(rnd() * (len - 1))) % len; [o[i], o[j]] = [o[j], o[i]]; }
    else o[i] = pick(rnd, SHAPES.filter((g) => g !== o[i]));
    return o.join(' ');
  });
  return { id, category: 'MEMORY', kind: 'order_repeat', tier, prompt: 'Which is the order you saw?', display: [seq.join('   ')], exposureSec: 2.4 - tier * 0.3, options, answer: idx, timeLimitSec: TIME_LIMIT[tier] };
}

function arithmeticChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const ops = tier === 1 ? ['+', '-'] : tier === 2 ? ['+', '-', '×'] : ['+', '-', '×', '÷'];
  const op = pick(rnd, ops);
  const hi = 10 * tier + 5;
  let a = 2 + Math.floor(rnd() * hi), b = 2 + Math.floor(rnd() * (tier === 3 ? 12 : hi)), ans = 0;
  if (op === '+') ans = a + b; else if (op === '-') { if (b > a) [a, b] = [b, a]; ans = a - b; }
  else if (op === '×') { a = 2 + Math.floor(rnd() * (4 + tier * 3)); b = 2 + Math.floor(rnd() * (4 + tier * 2)); ans = a * b; }
  else { b = 2 + Math.floor(rnd() * 9); ans = 2 + Math.floor(rnd() * 12); a = ans * b; }
  const { options, answer } = uniqueOptions(rnd, String(ans), () => String(ans + (Math.floor(rnd() * 9) - 4 || 5)), 4, 0);   // a − b is taken with a ≥ b: never negative
  return { id, category: 'COMPUTE', kind: 'arithmetic', tier, prompt: 'Solve it', display: [`${a} ${op} ${b} = ?`], exposureSec: 0, options, answer, timeLimitSec: TIME_LIMIT[tier] - 2 };
}

function quantityChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const base = 6 + tier * 4, diff = Math.max(1, 4 - tier);
  const left = base + Math.floor(rnd() * 4), right = rnd() < 0.5 ? left + diff : left - diff;
  const dots = (n: number) => Array.from({ length: n }, () => '●').join(' ');
  const answerIdx = left > right ? 0 : 1;
  const options = ['LEFT has more', 'RIGHT has more', 'They are equal', 'Cannot tell'];
  return { id, category: 'COMPUTE', kind: 'quantity', tier, prompt: 'Which side has more?', display: [`LEFT  ${dots(left)}`, `RIGHT  ${dots(right)}`], exposureSec: 0, options, answer: answerIdx, timeLimitSec: Math.max(3, TIME_LIMIT[tier] - 3) };
}

/** 3×3 bit shapes as strings; rotation by 90° for the ANALYZE family. */
function rot90(g: string[]): string[] { const n = g.length; return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => g[n - 1 - c][r]).join('')); }
function mirror(g: string[]): string[] { return g.map((row) => row.split('').reverse().join('')); }
function randomShape(rnd: () => number): string[] {
  let g: string[];
  do { g = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => (rnd() < 0.5 ? '#' : '.')).join('')); }
  while (g.join('') === rot90(g).join('') || g.join('') === mirror(g).join(''));   // must not be symmetric, or the answer is ambiguous
  return g;
}
const shapeText = (g: string[]) => g.map((r) => r.split('').map((c) => (c === '#' ? '■' : '·')).join(' '));

// BRAINBRAWL-MAJOR (2026-09-24): the prompt said "turned 90°" with no direction while the other rotations are the distractors —
// so the 90° answer and the 270° distractor were BOTH a 90° turn, and a player who turned it the other way was graded wrong.
// rot90 turns CLOCKWISE (row r of the result is column r of the source read bottom-up); the prompt says so.
function rotationChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const g = randomShape(rnd);
  const turns = 1 + Math.floor(rnd() * 3);
  let r = g; for (let i = 0; i < turns; i++) r = rot90(r);
  const answerTxt = shapeText(r).join(' / ');
  // distractors: the other rotations and the mirrors; the symmetric cases collapse, so top up with fresh shapes
  const cands: string[] = [];
  let q = g; for (let i = 0; i < 4; i++) { cands.push(shapeText(q).join(' / ')); q = rot90(q); }
  cands.push(shapeText(mirror(g)).join(' / '), shapeText(rot90(mirror(g))).join(' / '), shapeText(mirror(rot90(g))).join(' / '));
  const wrong: string[] = [];
  for (const w of cands) if (w !== answerTxt && !wrong.includes(w) && wrong.length < 3) wrong.push(w);
  while (wrong.length < 3) { const w = shapeText(randomShape(rnd)).join(' / '); if (w !== answerTxt && !wrong.includes(w)) wrong.push(w); }
  const options = shuffle(rnd, [answerTxt, ...wrong]);
  return { id, category: 'ANALYZE', kind: 'rotation', tier, prompt: turns === 2 ? 'Which is this shape turned 180°?' : `Which is this shape turned ${turns * 90}° clockwise?`, display: shapeText(g), exposureSec: 0, options, answer: options.indexOf(answerTxt), timeLimitSec: TIME_LIMIT[tier] + 2 };
}

function shapeMatchChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const g = randomShape(rnd);
  const answerTxt = shapeText(g).join(' / ');
  const wrong: string[] = [];
  while (wrong.length < 3) { const w = shapeText(randomShape(rnd)).join(' / '); if (w !== answerTxt && !wrong.includes(w)) wrong.push(w); }
  const options = shuffle(rnd, [answerTxt, ...wrong]);
  return { id, category: 'ANALYZE', kind: 'shape_match', tier, prompt: 'Find the same shape', display: shapeText(g), exposureSec: 0, options, answer: options.indexOf(answerTxt), timeLimitSec: TIME_LIMIT[tier] };
}

function countChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const size = 3 + tier, target = '▲', other = pick(rnd, ['▼', '●', '■']);
  let count = 0;
  const rows = Array.from({ length: size }, () => Array.from({ length: size }, () => { const t = rnd() < 0.35; if (t) count++; return t ? target : other; }).join(' '));
  const { options, answer } = uniqueOptions(rnd, String(count), () => String(Math.max(0, count + Math.floor(rnd() * 5) - 2 || 1)), 4, 0);
  return { id, category: 'ANALYZE', kind: 'count', tier, prompt: `How many ${target}?`, display: rows, exposureSec: 0, options, answer, timeLimitSec: TIME_LIMIT[tier] };
}

function oddOneOutChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const n = 5 + tier * 2;
  const common = pick(rnd, GLYPHS), odd = pick(rnd, GLYPHS.filter((g) => g !== common));
  const idx = Math.floor(rnd() * n);
  const row = Array.from({ length: n }, (_, i) => (i === idx ? odd : common));
  const answerTxt = `position ${idx + 1}`;
  // three OTHER positions on the row (a random draw could run dry and top up with "position 31")
  const others = shuffle(rnd, Array.from({ length: n }, (_, i) => i).filter((i) => i !== idx)).slice(0, 3);
  const options = shuffle(rnd, [answerTxt, ...others.map((i) => `position ${i + 1}`)]);
  const answer = options.indexOf(answerTxt);
  return { id, category: 'IDENTIFY', kind: 'odd_one_out', tier, prompt: 'Which position is the odd one out? (left to right)', display: [row.join(' ')], exposureSec: 0, options, answer, timeLimitSec: Math.max(3, TIME_LIMIT[tier] - 3) };
}

function recognitionChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const n = 4 + tier * 2;
  const glyphs = Array.from({ length: n }, () => pick(rnd, GLYPHS));
  const target = pick(rnd, GLYPHS);
  const count = glyphs.filter((g) => g === target).length;
  const { options, answer } = uniqueOptions(rnd, String(count), () => String(Math.max(0, count + Math.floor(rnd() * 5) - 2 || 1)), 4, 0);   // 0 is a fair answer; −2 is not
  return { id, category: 'IDENTIFY', kind: 'recognition', tier, prompt: `How many ${target} flashed?`, display: [glyphs.join(' ')], exposureSec: 1.6 - tier * 0.25, options, answer, timeLimitSec: TIME_LIMIT[tier] };
}

const GENERATORS: Record<Category, ((rnd: () => number, tier: Tier, id: string) => Challenge)[]> = {
  LOGIC: [seqChallenge, patternChallenge],
  MEMORY: [recallGridChallenge, orderRepeatChallenge],
  COMPUTE: [arithmeticChallenge, quantityChallenge],
  ANALYZE: [rotationChallenge, shapeMatchChallenge, countChallenge],
  IDENTIFY: [oddOneOutChallenge, recognitionChallenge],
};

/** ONE raw draw from the category's generators — no uniqueness or fairness filter (the tests grade the generators with it). */
export function drawChallenge(category: Category, tier: Tier, rnd: () => number): Challenge {
  const gen = pick(rnd, GENERATORS[category]);
  return gen(rnd, tier, `${category}-${tier}-${Math.floor(rnd() * 1e9)}`);
}

/** A fresh challenge for a category at a tier, unique against `seen` (display text) — nothing repeats in a match. */
export function makeChallenge(category: Category, tier: Tier, rnd: () => number, seen: Set<string>): Challenge {
  for (let attempt = 0; attempt < 40; attempt++) {
    const c = drawChallenge(category, tier, rnd);
    const key = `${c.kind}|${c.display.join('|')}`;
    // the card must be FAIR as a player reads it: exactly one option right (solveCard, which knows nothing of the key)
    // and no impossible option — a generator that ever breaks that loses the draw instead of reaching the stage
    if (!seen.has(key) && c.answer >= 0 && new Set(c.options).size === c.options.length && cardFaults(c).length === 0) { seen.add(key); return c; }
  }
  throw new Error('challenge generator exhausted');
}

// ── the card as a player reads it (BRAINBRAWL-RESIDUAL, 2026-09-24) ───────────────────────────────────────────────────
// An answer key only proves the key is right; it cannot show that the OTHER options are wrong, and that was the bug (a
// MEMORY grid keyed one lit cell and offered two more). `solveCard` answers the card from the prompt, the display and the
// options ALONE — no kind, no seed, no key — so it is a second, independent reader: every option it finds right, the
// player could defend. `cardFaults` is what a fair card may not have. The unit test runs them over thousands of seeds, the
// mode's probe runs them on every card that reaches the stage, and makeChallenge refuses any card that fails them.

/** What a player sees: the instruction, the display (as shown, before a memory card hides it) and the four options. */
export interface Card { prompt: string; display: readonly string[]; options: readonly string[] }

const tokens = (line: string): string[] => line.trim().split(/\s+/).filter(Boolean);
const gridOf = (rows: readonly string[]): string[] => rows.map((r) => tokens(r).map((t) => (t === '■' ? '#' : '.')).join(''));
const turnCW = (g: string[]): string[] => { const n = g.length; return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => g[n - 1 - c][r]).join('')); };
const countIn = (rows: readonly string[], glyph: string): number => rows.reduce((n, r) => n + tokens(r).filter((t) => t === glyph).length, 0);

/** The next terms a number sequence supports under each rule the game uses: a constant step, a constant ratio, two
 *  alternating steps, each term the sum of the two before it. */
function nextTerms(xs: number[]): Set<number> {
  const out = new Set<number>(), n = xs.length, d = xs.slice(1).map((x, i) => x - xs[i]);
  if (n >= 3 && d.every((v) => v === d[0])) out.add(xs[n - 1] + d[0]);
  if (n >= 3 && xs.every((x) => x !== 0)) { const r = xs[1] / xs[0]; if (Number.isInteger(r) && xs.slice(1).every((x, i) => x === xs[i] * r)) out.add(xs[n - 1] * r); }
  if (d.length >= 3 && d.every((v, i) => i < 2 || v === d[i - 2])) out.add(xs[n - 1] + d[d.length - 2]);
  if (n >= 4 && xs.every((x, i) => i < 2 || x === xs[i - 1] + xs[i - 2])) out.add(xs[n - 1] + xs[n - 2]);
  return out;
}

/** The indexes of every option a player could defend as right, read off the card alone. */
export function solveCard(card: Card): number[] {
  const { prompt, display, options } = card;
  const right = (ok: (o: string) => boolean): number[] => options.flatMap((o, i) => (ok(o) ? [i] : []));
  if (prompt === 'What comes next?') {
    const xs = tokens(display.join(' ')).filter((t) => t !== '?').map(Number);
    const next = nextTerms(xs);
    return right((o) => next.has(Number(o)));
  }
  if (prompt === 'Which shape continues the pattern?') {
    const ts = tokens(display.join(' ')).filter((t) => t !== '?');
    const next = new Set<string>();
    for (let p = 1; p * 2 <= ts.length; p++) if (ts.every((t, i) => i < p || t === ts[i - p])) next.add(ts[ts.length - p]);
    return right((o) => next.has(o));
  }
  if (prompt === 'How many cells were lit?') return right((o) => Number(o) === countIn(display, '●'));
  if (prompt.startsWith('Which cell was lit?')) {
    const lit = new Set<string>();
    display.forEach((row, r) => tokens(row).forEach((t, c) => { if (t === '●') lit.add(`${'ABC'[r]}${c + 1}`); }));
    return right((o) => lit.has(o));
  }
  if (prompt === 'Which is the order you saw?') { const seen = tokens(display.join(' ')).join(' '); return right((o) => tokens(o).join(' ') === seen); }
  if (prompt === 'Solve it') {
    const m = /^(\d+) (.) (\d+) = \?$/.exec(display[0] ?? '');
    if (!m) return [];
    const a = Number(m[1]), b = Number(m[3]);
    const v = m[2] === '+' ? a + b : m[2] === '-' ? a - b : m[2] === '×' ? a * b : a / b;
    return right((o) => Number(o) === v);
  }
  if (prompt === 'Which side has more?') {
    const l = countIn([display[0] ?? ''], '●'), r = countIn([display[1] ?? ''], '●');
    return right((o) => (o === 'LEFT has more' && l > r) || (o === 'RIGHT has more' && r > l) || (o === 'They are equal' && l === r));
  }
  const turned = /^Which is this shape turned (90|180|270)°/.exec(prompt);
  if (turned) {
    let g = gridOf(display); for (let i = 0; i < Number(turned[1]) / 90; i++) g = turnCW(g);
    const want = g.join('/');
    return right((o) => gridOf(o.split(' / ')).join('/') === want);
  }
  if (prompt === 'Find the same shape') { const want = gridOf(display).join('/'); return right((o) => gridOf(o.split(' / ')).join('/') === want); }
  const many = /^How many (\S+?)( flashed)?\?$/.exec(prompt);
  if (many) return right((o) => Number(o) === countIn(display, many[1]));
  if (prompt.startsWith('Which position is the odd one out?')) {
    const ts = tokens(display.join(' '));
    const once = ts.flatMap((t, i) => (ts.filter((u) => u === t).length === 1 ? [i + 1] : []));
    return right((o) => once.includes(Number(/^position (\d+)$/.exec(o)?.[1] ?? NaN)));
  }
  throw new Error(`solveCard: no reader for "${prompt}"`);
}

/** Everything wrong with a card as a player would see it: not exactly one right option, the key not on that option, an
 *  impossible option (a negative count, a cell off the grid, a position off the row). Empty for a fair card. */
export function cardFaults(c: Card & { answer: number }): string[] {
  const out: string[] = [];
  let right: number[] = [];
  try { right = solveCard(c); } catch (e) { return [(e as Error).message]; }
  if (right.length !== 1) out.push(`${right.length} right options (${right.map((i) => c.options[i]).join(' / ') || 'none'})`);
  else if (right[0] !== c.answer) out.push(`the key is ${c.options[c.answer]} but the card says ${c.options[right[0]]}`);
  if (/^(How many|Solve it)/.test(c.prompt)) for (const o of c.options) if (!/^\d+$/.test(o)) out.push(`impossible option ${o}`);
  if (c.prompt.startsWith('Which cell was lit?')) for (const o of c.options) if (!/^[ABC][123]$/.test(o)) out.push(`no such cell ${o}`);
  if (c.prompt.startsWith('Which position')) {
    const n = tokens(c.display.join(' ')).length;
    for (const o of c.options) { const k = Number(/^position (\d+)$/.exec(o)?.[1] ?? NaN); if (!(k >= 1 && k <= n)) out.push(`no such position ${o}`); }
  }
  return out;
}

// ── scoring ───────────────────────────────────────────────────────────
/** Speed AND accuracy: a wrong answer is nothing; a right one pays the tier's base plus up to as much again for speed. */
export function challengeScore(correct: boolean, secondsLeft: number, timeLimit: number, tier: Tier): number {
  if (!correct) return 0;
  const speed = Math.max(0, Math.min(1, secondsLeft / Math.max(0.01, timeLimit)));
  return Math.round(100 * tier * (0.5 + 0.5 * speed));
}

// ── the wheel and the claims ──────────────────────────────────────────
export interface Claims { [cat: string]: number | null }

export function freshClaims(): Record<Category, number | null> {
  return { LOGIC: null, MEMORY: null, COMPUTE: null, ANALYZE: null, IDENTIFY: null };
}

/** The categories `player`'s spin can land on: every one they do not hold (all five once they hold them all). POLISH-2: the
 *  spinner's lines read this too, so a line never names a category the wheel cannot land on. */
export function wheelPool(claims: Record<Category, number | null>, player: number): Category[] {
  const open = CATEGORIES.filter((c) => claims[c] !== player);
  return open.length ? open : [...CATEGORIES];
}

/** Spin: the wheel prefers categories the spinner has not claimed; with every category claimed by someone it may land
 *  anywhere (a duel then contests the holder's claim). Returns the category, the wheel's landing angle in turns from a
 *  wheel at REST (0), and the whole turns alone — which is what a wheel that is already turned needs (`wheelLanding`). */
export function spinWheel(rnd: () => number, claims: Record<Category, number | null>, player: number): { category: Category; turns: number; fullTurns: number } {
  const pool = wheelPool(claims, player);
  const category = pick(rnd, pool);
  const idx = CATEGORIES.indexOf(category);
  const fullTurns = 3 + Math.floor(rnd() * 3);                         // three to five full spins…
  const turns = fullTurns + (idx + 0.5) / CATEGORIES.length;           // …landing on the segment
  return { category, turns, fullTurns };
}

// ── the wheel's face (BRAINBRAWL-MAJOR, 2026-09-24) ──────────────────────────────────────────────────────────────────
// Wedge i sits on the face at a_i = (i + 0.5) / 5 · 2π (clockwise from the top, as BrainBrawlMode lays them out) and is
// under the pin when the wheel's roll ≡ a_i (mod 2π). `turns` above is right for a wheel at rest — and the wheel is at
// rest exactly once. The mode spun FROM wherever the last spin stopped, so from round two on the pin landed on the
// previous wedge's angle PLUS this one's: measured on the live wheel, 4 of 5 announced categories were not the wedge
// under the pin (base b6d66d5, /dev/brainbrawl). A spin is now aimed at an ABSOLUTE angle.
const TAU = Math.PI * 2;

/** The wheel roll (radians) that puts `category`'s wedge under the pin. */
export function wedgeAngle(category: Category): number {
  return ((CATEGORIES.indexOf(category) + 0.5) / CATEGORIES.length) * TAU;
}

/** Where a spin from `from` must stop: `fullTurns` whole turns forward, then on to the category's wedge. Always forward. */
export function wheelLanding(from: number, category: Category, fullTurns: number): number {
  let rest = (((wedgeAngle(category) - from) % TAU) + TAU) % TAU;   // forward distance to the wedge, [0, 2π)
  if (rest > TAU - 1e-6) rest = 0;                                   // the same wedge again: a float hair short of a whole turn is none
  return from + Math.max(0, Math.floor(fullTurns)) * TAU + rest;
}

/** The category whose wedge is under the pin at a wheel roll — what a watcher reads off the wheel. */
export function wedgeAtPin(roll: number): Category {
  const n = CATEGORIES.length;
  const k = (((roll % TAU) + TAU) % TAU) / TAU * n - 0.5;
  return CATEGORIES[((Math.round(k) % n) + n) % n];
}

// ── the reveal ────────────────────────────────────────────────────────────────────────────────────────────────────────
export type Verdict = 'correct' | 'wrong' | 'timeout';

/** Each player's verdict on a challenge: a pick that is the answer, a pick that is not, or no pick before the clock. */
export function verdicts(answers: readonly (number | null)[], answer: number): Verdict[] {
  return answers.map((a) => (a === null ? 'timeout' : a === answer ? 'correct' : 'wrong'));
}

/** The banner a resolved challenge earns — and it tells the truth about the claim, given who held the category BEFORE the
 *  challenge (`before`). A duel nobody wins does not "unclaim" a category somebody holds: it STAYS with them (resolveClaim
 *  leaves it). A holder who wins it again HOLDS it (measured: "P1 CLAIMS COMPUTE" twice in one duel, for a category P1
 *  already had); a challenger who wins it TAKES it from the holder. */
export function claimLine(before: number | null, category: Category, claimant: number, names: readonly string[]): string {
  const solo = names.length < 2;
  if (claimant >= 0) {
    if (solo) return `${category} CLAIMED`;
    if (before === claimant) return `${names[claimant]} HOLDS ${category}`;
    if (before !== null) return `${names[claimant]} TAKES ${category} FROM ${names[before]}`;
    return `${names[claimant]} CLAIMS ${category}`;
  }
  if (before !== null && !solo) return `${category} STAYS WITH ${names[before]}`;
  return `${category} UNCLAIMED`;
}

/** Resolve a challenge between players: the higher score claims; a tie leaves the claim as it was. Solo: any correct
 *  answer claims. Returns the claimant or -1. */
export function resolveClaim(claims: Record<Category, number | null>, category: Category, scores: readonly number[]): number {
  if (scores.length === 1) { if (scores[0] > 0) { claims[category] = 0; return 0; } return -1; }
  const best = Math.max(...scores);
  if (best <= 0) return -1;
  const winners = scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  if (winners.length !== 1) return -1;
  claims[category] = winners[0];
  return winners[0];
}

export function claimedBy(claims: Record<Category, number | null>, player: number): Category[] {
  return CATEGORIES.filter((c) => claims[c] === player);
}

/** Match over: a player holds all five (duel) — or, solo, every category has been played (the composite is the score). */
export function matchWinner(claims: Record<Category, number | null>, players: number): number {
  for (let p = 0; p < players; p++) if (claimedBy(claims, p).length === CATEGORIES.length) return p;
  return -1;
}

export function boardRows(claims: Record<Category, number | null>, scores: readonly number[], names: readonly string[]): { name: string; score: number | string; line: string }[] {
  return names.map((name, i) => ({ name, score: scores[i] ?? 0, line: claimedBy(claims, i).join(' · ') || '—' }));
}

export const SOLO_BEST_KEY = 'fel.brainbrawl.best';
