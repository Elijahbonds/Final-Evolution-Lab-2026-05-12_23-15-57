// lib/library/search/text.ts — EXERCISE-LIBRARY (2026-10-25): how the library reads words.
//
// One normaliser for everything that compares exercise words — the seed importer's dedupe, the validator's
// near-duplicate check, the search index and the query — so "DB Bulgarian split squats", "Dumbbell bulgarian split
// squat" and "dumbbell rear-foot-elevated split squat" land on the same terms everywhere. No dependency: a light suffix
// stemmer (the same function on both sides of the index, so consistency matters more than linguistics), a token
// canon for abbreviations, and a bounded edit distance for typos.
//
// Pure. Client-safe.

/** Lowercase, strip accents, '&' → 'and', apostrophes dropped ("farmer's" → "farmers"), every other non-alphanumeric → space. */
export function fold(s: string): string {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Single-token canon: abbreviations and run-together spellings → the words the library is written in. */
export const TOKEN_CANON: Readonly<Record<string, string>> = {
  db: 'dumbbell', dbs: 'dumbbell', dumbell: 'dumbbell', dumbells: 'dumbbell',
  kb: 'kettlebell', kbs: 'kettlebell', kettle: 'kettlebell',
  bb: 'barbell',
  mb: 'medicine ball', medball: 'medicine ball',
  pushup: 'push up', pushups: 'push up', pressup: 'push up', pressups: 'push up',
  pullup: 'pull up', pullups: 'pull up', chinup: 'chin up', chinups: 'chin up',
  situp: 'sit up', situps: 'sit up', stepup: 'step up', stepups: 'step up',
  pulldown: 'pulldown', pulldowns: 'pulldown', pushdown: 'pushdown',
  skullcrusher: 'skull crusher', skullcrushers: 'skull crusher',
  flye: 'fly', flyes: 'fly', flies: 'fly',
  hammy: 'hamstring', hammies: 'hamstring', hams: 'hamstring', quads: 'quad',
  glute: 'glute', glutes: 'glute', bum: 'glute', butt: 'glute', booty: 'glute',
  tris: 'tricep', triceps: 'tricep', bis: 'bicep', biceps: 'bicep', pecs: 'chest', pec: 'chest',
  delts: 'shoulder', delt: 'shoulder', lats: 'lat', traps: 'trap', calfs: 'calf', calves: 'calf',
  abs: 'ab', abdominals: 'ab', core: 'trunk',
  plyo: 'plyometric', plyos: 'plyometric', plyometrics: 'plyometric',
  vert: 'vertical', verts: 'vertical',
  bw: 'bodyweight', bodyweight: 'bodyweight',
  trx: 'suspension', sl: 'single leg', sa: 'single arm', ohp: 'overhead press',
  rdl: 'romanian deadlift', rdls: 'romanian deadlift', sldl: 'stiff leg deadlift', ghr: 'glute ham raise',
  tke: 'terminal knee extension', cmj: 'countermovement jump', rfess: 'rear foot elevated split squat',
  bss: 'bulgarian split squat', hspu: 'handstand push up',
  warmup: 'warm up', warmups: 'warm up', cooldown: 'cool down', layups: 'layup',
  crossovers: 'crossover', xover: 'crossover',
  jumprope: 'jump rope', skiprope: 'jump rope',
};

/** Multi-word phrases folded to one form before tokenising (both index and query). */
const PHRASES: readonly [RegExp, string][] = [
  [/\bone (arm|leg|hand)(ed)?\b/g, 'single $1'],
  [/\b1 (arm|leg|hand)\b/g, 'single $1'],
  [/\bsingle (arm|leg|hand)ed\b/g, 'single $1'],
  [/\bbody weight\b/g, 'bodyweight'],
  [/\bno equipment\b/g, 'bodyweight'],
  [/\bmed(icine)? ball\b/g, 'medicine ball'],
  [/\bpull down\b/g, 'pulldown'],
  [/\bpush down\b/g, 'pushdown'],
  [/\bwarm(ing)? up\b/g, 'warm up'],
  [/\bcool(ing)? down\b/g, 'cool down'],
  [/\bjump(ing)? rope\b/g, 'jump rope'],
  [/\blay ups?\b/g, 'layup'],
  [/\bwarm ups\b/g, 'warm up'],
  [/\bstiff legged\b/g, 'stiff leg'],
  [/\brear foot elevated\b/g, 'rear foot elevated'],
  // batches 2–4: "trap bar" is one implement; split, its "trap" matched every entry that trains the traps (a "trap bar
  // deadlift" search ranked the snatch and clean deadlifts above the trap-bar carry and jump)
  [/\b(?:trap|hex) bar\b/g, 'trapbar'],
];

/** Words that carry no meaning in an exercise name or a search. */
export const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'on', 'in', 'with', 'for', 'from', 'at', 'by', 'into', 'off', 'your', 'my',
  'me', 'i', 'some', 'any', 'that', 'this', 'it', 'is', 'are', 'be', 'do', 'can', 'what', 'which', 'show', 'give', 'find',
  'want', 'need', 'looking', 'good', 'best', 'exercise', 'exercises', 'drill', 'drills', 'movement', 'movements', 'workout',
  'workouts', 'please', 'something', 'like', 'ideas', 'idea', 'list', 'version', 'versions', 'variation', 'variations',
]);

const DOUBLE_END = /([bdfgklmnprtz])\1$/;

/**
 * A light stemmer: plurals, -ing, -ed, a final 'e'. Over-stems on purpose ("raise" and "raising" both become "rais")
 * because the same function runs on the index and the query; it never maps two everyday exercise words onto each
 * other in a way the tests have found.
 */
export function stem(w: string): string {
  if (w.length <= 3 || /^\d/.test(w)) return w;
  let s = w;
  if (s.endsWith('ies') && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (/(ss|sh|ch|x|z)es$/.test(s)) s = s.slice(0, -2);
  else if (s.endsWith('s') && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ing')) { s = s.slice(0, -3); if (DOUBLE_END.test(s)) s = s.slice(0, -1); }
  else if (s.length > 4 && s.endsWith('ed')) { s = s.slice(0, -2); if (DOUBLE_END.test(s)) s = s.slice(0, -1); }
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}

/** Folded words in order, phrases joined, abbreviations expanded (no stemming, stop words kept). */
export function words(s: string): string[] {
  let f = fold(s);
  for (const [re, to] of PHRASES) f = f.replace(re, to);
  const out: string[] = [];
  for (const w of f.split(' ')) {
    if (!w) continue;
    const canon = TOKEN_CANON[w];
    if (canon) out.push(...canon.split(' '));
    else out.push(w);
  }
  return out;
}

/** The search terms of a piece of text: words(), stop words out, stemmed. */
export function terms(s: string): string[] {
  return words(s).filter((w) => !STOP.has(w)).map(stem);
}

/**
 * The near-duplicate key of a NAME: its terms, deduplicated and sorted, so word order, case, punctuation, plurals and
 * abbreviations do not make two names different ("Squat, Goblet" = "goblet squats" = "Goblet Squat").
 */
export function nameKey(name: string): string {
  return [...new Set(terms(name))].sort().join(' ');
}

/** A URL-safe slug. */
export function slugify(s: string): string {
  return fold(s).replace(/\s+/g, '-').slice(0, 80).replace(/-+$/, '');
}

/**
 * Damerau-Levenshtein (adjacent transposition) distance, giving up once it exceeds `max` (returns max + 1). Typo
 * tolerance needs only 1–2 edits, so the band keeps it cheap.
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length, m = b.length;
  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** How many edits a typo in a word of this length may have: none under 4 letters, 1 up to 6, then 2. */
export const typoBudget = (len: number): number => (len < 4 ? 0 : len <= 6 ? 1 : 2);
