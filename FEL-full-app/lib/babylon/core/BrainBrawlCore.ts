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
const uniqueOptions = (rnd: () => number, answer: string, distractors: () => string, n = 4): { options: string[]; answer: number } => {
  const set = new Set<string>([answer]);
  let guard = 0;
  while (set.size < n && guard++ < 200) set.add(distractors());
  // small numeric answers can run the distractor pool dry — top up deterministically
  let k = 1;
  while (set.size < n && k < 50) { const num = Number(answer); set.add(Number.isFinite(num) ? String(num + k * (k % 2 ? 1 : -1) * Math.ceil(k / 2)) : `${answer}${k}`); k++; }
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
  return { id, category: 'LOGIC', kind: 'sequence', tier, prompt: 'What comes next?', display: [shown.join('   '), '?'], exposureSec: 0, options, answer: idx, timeLimitSec: TIME_LIMIT[tier] };
}

function patternChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const period = 2 + Math.min(tier, 2);
  const unit = shuffle(rnd, SHAPES).slice(0, period);
  const total = period * 2 + tier;
  const seq = Array.from({ length: total }, (_, i) => unit[i % period]);
  const answer = seq[seq.length - 1];
  const { options, answer: idx } = uniqueOptions(rnd, answer, () => pick(rnd, GLYPHS));
  return { id, category: 'LOGIC', kind: 'pattern', tier, prompt: 'Which shape continues the pattern?', display: [seq.slice(0, -1).join(' '), '?'], exposureSec: 0, options, answer: idx, timeLimitSec: TIME_LIMIT[tier] };
}

function recallGridChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const size = 3, lit = 2 + tier;
  const cells = shuffle(rnd, Array.from({ length: size * size }, (_, i) => i)).slice(0, lit);
  const rows = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => (cells.includes(r * size + c) ? '●' : '·')).join(' '));
  const ask = rnd() < 0.5 ? 'count' : 'which';
  if (ask === 'count') {
    const { options, answer } = uniqueOptions(rnd, String(lit), () => String(1 + Math.floor(rnd() * 7)));
    return { id, category: 'MEMORY', kind: 'recall_grid', tier, prompt: 'How many cells were lit?', display: rows, exposureSec: 2.2 - tier * 0.3, options, answer, timeLimitSec: TIME_LIMIT[tier] };
  }
  const labelOf = (i: number) => `${'ABC'[Math.floor(i / size)]}${(i % size) + 1}`;
  const litCell = pick(rnd, cells);
  const { options, answer } = uniqueOptions(rnd, labelOf(litCell), () => labelOf(Math.floor(rnd() * size * size)));
  return { id, category: 'MEMORY', kind: 'recall_grid', tier, prompt: 'Which cell was lit? (rows A–C, columns 1–3)', display: rows, exposureSec: 2.2 - tier * 0.3, options, answer, timeLimitSec: TIME_LIMIT[tier] };
}

function orderRepeatChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const len = 3 + tier;
  const seq = Array.from({ length: len }, () => pick(rnd, SHAPES));
  const answer = seq.join(' ');
  const { options, answer: idx } = uniqueOptions(rnd, answer, () => { const o = [...seq]; const i = Math.floor(rnd() * len), j = (i + 1 + Math.floor(rnd() * (len - 1))) % len; [o[i], o[j]] = [o[j], o[i]]; return o.join(' '); });
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
  const { options, answer } = uniqueOptions(rnd, String(ans), () => String(ans + (Math.floor(rnd() * 9) - 4 || 5)));
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
  return { id, category: 'ANALYZE', kind: 'rotation', tier, prompt: `Which is this shape turned ${turns * 90}°? (rows shown left to right)`, display: shapeText(g), exposureSec: 0, options, answer: options.indexOf(answerTxt), timeLimitSec: TIME_LIMIT[tier] + 2 };
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
  const { options, answer } = uniqueOptions(rnd, String(count), () => String(Math.max(0, count + Math.floor(rnd() * 5) - 2 || 1)));
  return { id, category: 'ANALYZE', kind: 'count', tier, prompt: `How many ${target}?`, display: rows, exposureSec: 0, options, answer, timeLimitSec: TIME_LIMIT[tier] };
}

function oddOneOutChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const n = 5 + tier * 2;
  const common = pick(rnd, GLYPHS), odd = pick(rnd, GLYPHS.filter((g) => g !== common));
  const idx = Math.floor(rnd() * n);
  const row = Array.from({ length: n }, (_, i) => (i === idx ? odd : common));
  const answerTxt = `position ${idx + 1}`;
  const { options, answer } = uniqueOptions(rnd, answerTxt, () => `position ${1 + Math.floor(rnd() * n)}`);
  return { id, category: 'IDENTIFY', kind: 'odd_one_out', tier, prompt: 'Which position is the odd one out? (left to right)', display: [row.join(' ')], exposureSec: 0, options, answer, timeLimitSec: Math.max(3, TIME_LIMIT[tier] - 3) };
}

function recognitionChallenge(rnd: () => number, tier: Tier, id: string): Challenge {
  const n = 4 + tier * 2;
  const glyphs = Array.from({ length: n }, () => pick(rnd, GLYPHS));
  const target = pick(rnd, GLYPHS);
  const count = glyphs.filter((g) => g === target).length;
  const { options, answer } = uniqueOptions(rnd, String(count), () => String(Math.max(0, count + Math.floor(rnd() * 5) - 2 || 1)));
  return { id, category: 'IDENTIFY', kind: 'recognition', tier, prompt: `How many ${target} flashed?`, display: [glyphs.join(' ')], exposureSec: 1.6 - tier * 0.25, options, answer, timeLimitSec: TIME_LIMIT[tier] };
}

const GENERATORS: Record<Category, ((rnd: () => number, tier: Tier, id: string) => Challenge)[]> = {
  LOGIC: [seqChallenge, patternChallenge],
  MEMORY: [recallGridChallenge, orderRepeatChallenge],
  COMPUTE: [arithmeticChallenge, quantityChallenge],
  ANALYZE: [rotationChallenge, shapeMatchChallenge, countChallenge],
  IDENTIFY: [oddOneOutChallenge, recognitionChallenge],
};

/** A fresh challenge for a category at a tier, unique against `seen` (display text) — nothing repeats in a match. */
export function makeChallenge(category: Category, tier: Tier, rnd: () => number, seen: Set<string>): Challenge {
  for (let attempt = 0; attempt < 40; attempt++) {
    const gen = pick(rnd, GENERATORS[category]);
    const c = gen(rnd, tier, `${category}-${tier}-${Math.floor(rnd() * 1e9)}`);
    const key = `${c.kind}|${c.display.join('|')}`;
    if (!seen.has(key) && c.answer >= 0 && new Set(c.options).size === c.options.length) { seen.add(key); return c; }
  }
  throw new Error('challenge generator exhausted');
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

/** Spin: the wheel prefers categories the spinner has not claimed; with every category claimed by someone it may land
 *  anywhere (a duel then contests the holder's claim). Returns the category and the wheel's landing angle in turns. */
export function spinWheel(rnd: () => number, claims: Record<Category, number | null>, player: number): { category: Category; turns: number } {
  const open = CATEGORIES.filter((c) => claims[c] !== player);
  const pool = open.length ? open : [...CATEGORIES];
  const category = pick(rnd, pool);
  const idx = CATEGORIES.indexOf(category);
  const turns = 3 + Math.floor(rnd() * 3) + (idx + 0.5) / CATEGORIES.length;   // three to five full spins landing on the segment
  return { category, turns };
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
