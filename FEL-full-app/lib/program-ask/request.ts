// lib/program-ask/request.ts — PROGRAM-ASK (2026-11-02): plain words → a ProgramRequest, shown back as chips.
//
// Deterministic and always on (the AI is never needed to read an ask). Built on the library Ask's own reading
// (lib/library/ask/parse.ts): its injury words (INJURY_WORDS — a pain or injury question stops the build and shows
// FEL's existing "see a professional" lines, never a program around it), its joint-friendly preferences, its sport and
// equipment vocabulary (lib/library/vocab.ts EQUIPMENT). What this adds for a PROGRAM:
//   · equipment: "all I have is a band" = a band plus the body (and a wall, a floor). Light / medium / heavy when said.
//     Not said: ONE medium long band — not a mini band too, not a set (assumption, said so);
//   · goal (full body, strength, muscle, fat loss / conditioning, athletic / vertical, mobility, a sport), days a week,
//     minutes a session, level (beginner if unsaid), weeks (4 if unsaid), and an age band (under 13 / under 18 / adult).
// Every value that was not said is filled with a default AND listed as an assumption; every value is a chip the person
// changes in one tap (− / + for a number, the option itself for a choice).
//
// AGE: the account's own age rules (lib/coach/taxonomy.ts youthRules, decided on the server) are the floor. Words can
// make the rules stricter ("for my 12-year-old") but never looser: a youth account that types "I'm 25" stays youth.
//
// Pure. Client-safe.
import { INJURY_WORDS, parseAsk } from '@/lib/library/ask/parse';
import { fold } from '@/lib/library/search/text';
import { EQUIPMENT, type EquipmentId, type Joint, type LevelId, type SportTag } from '@/lib/library/vocab';
import { AGE_LABEL, GOAL_LABEL, LEVEL_LABEL, TENSION_LABEL, kitWords } from './copy';
import { BLOCK_WEEKS, DAYS, MINUTES, WEEKS } from './rules';
import type { AgeBand, BandTension, ProgramAskRead, ProgramChip, ProgramGoal, ProgramRequest, RequestField } from './types';

export const MAX_ASK_CHARS = 400;

const NUM_WORDS: Record<string, number> = { one: 1, once: 1, two: 2, twice: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const num = (s: string): number => (/^\d+$/.test(s) ? Number(s) : NUM_WORDS[s] ?? NaN);
const NUMBER = '(\\d{1,3}|one|once|two|twice|three|four|five|six|seven|eight|nine|ten|twelve)';

const PROGRAM_WORDS = /\b(program|programme|plan|routine|split|schedule|workouts? (?:for|plan)|full body|days? a week|times? a week|x ?\/ ?week|per week|a week|weeks? of|block)\b/;

/** Does a library question ask for a whole program? (The library Ask points to Build my program when it does.) */
export function wantsProgram(question: string): boolean {
  const f = ` ${fold(question ?? '')} `;
  return PROGRAM_WORDS.test(f) && /\b(program|programme|plan|routine|split|schedule|days? a week|times? a week|per week|weeks)\b/.test(f);
}

const GOALS: readonly [ProgramGoal, RegExp][] = [
  ['sport', /\b(basketball|hoops?|soccer|football|volleyball|tennis|pickleball|track|sprinter|baseball|softball|rugby|hockey|lacrosse)\b/],
  ['athletic', /\b(athletic|athlete|vertical|jump higher|dunk\w*|speed|faster|quicker|explosiv\w*|power|agility)\b/],
  ['muscle', /\b(muscle|hypertrophy|bigger|size|bulk\w*|gain\w*|build muscle|toned?|tone up)\b/],
  ['strength', /\b(strength|stronger|strong)\b/],
  ['conditioning', /\b(fat loss|lose (?:weight|fat)|weight loss|lean(?:er)?|cardio|conditioning|endurance|stamina|in shape|burn\w*|fitness|get fit)\b/],
  ['mobility', /\b(mobility|flexib\w*|stretch\w*|range of motion|stiff\w*|loosen up)\b/],
];
const FULL_BODY = /\bfull[- ]?body\b|\btotal body\b|\bwhole body\b/;

const SPORT_OF: readonly [SportTag, RegExp][] = [
  ['basketball', /\bbasketball\b|\bhoops?\b/], ['volleyball', /\bvolleyball\b/], ['soccer', /\bsoccer\b/], ['football', /\bfootball\b|\brugby\b/],
  ['track', /\btrack\b|\bsprinter\b/], ['tennis', /\btennis\b|\bpickleball\b/],
];

/** Every equipment name, singular and plural, longest first (a "trap bar" is not a "bar"). */
const KIT_NAMES: readonly [EquipmentId, RegExp][] = EQUIPMENT.filter((e) => !['other', 'wall', 'mat', 'towel', 'hoop', 'basketball', 'cone', 'strongman'].includes(e.id))
  .flatMap((e) => [e.label, ...e.aliases].map((n) => [e.id, fold(n).replace(/\s+/g, ' ').replace(/s$/, '')] as [EquipmentId, string]))
  .filter(([, n]) => n.length >= 3 && !['bag', 'bar', 'bell', 'ball', 'rope', 'stick', 'step', 'roller', 'vest', 'plate'].includes(n))
  .sort((a, b) => b[1].length - a[1].length)
  .map(([id, n]) => [id, new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:e?s)?\\b`)] as [EquipmentId, RegExp]);

const BAND = /\b(?:resistance |loop |long |exercise |workout |power |pull[- ]?up |super ?)?bands?\b|\btheraband\b|\btubing\b/;
const MINI_BAND = /\bmini ?bands?\b|\bhip bands?\b|\bbooty bands?\b|\bglute bands?\b/;
const NO_KIT = /\bno (?:equipment|gear|weights?)\b|\bwithout (?:any )?(?:equipment|weights?|gear)\b|\bbody ?weight\b|\bequipment[- ]free\b|\bnothing but (?:my )?body\b|\bjust my body\b|\bhotel room\b/;

export interface ReadOptions {
  /** The account's age rules (server): true = under 18 or no birth year on file. */
  youth?: boolean;
}

/** Read the ask. Never throws. */
export function readProgramAsk(question: string, opts: ReadOptions = {}): ProgramAskRead {
  const q = (question ?? '').slice(0, MAX_ASK_CHARS);
  const f = ` ${fold(q)} `;
  const said: Partial<Record<RequestField, boolean>> = {};
  const assumptions: string[] = [];
  const lib = parseAsk(q);

  // injury: the library Ask's own words, and nothing is built
  const words = [...new Set((f.match(new RegExp(INJURY_WORDS.source, 'g')) ?? []).map((w) => w.trim()))];

  // equipment
  let equipment: EquipmentId[] = [];
  let tension: BandTension | null = null;
  if (NO_KIT.test(f) && !BAND.test(f.replace(NO_KIT, ' '))) { equipment = []; said.equipment = true; }
  else {
    let rest = f;
    if (MINI_BAND.test(rest)) { equipment.push('mini-band'); rest = rest.replace(new RegExp(MINI_BAND.source, 'g'), ' '); }
    if (BAND.test(rest)) { equipment.push('band'); rest = rest.replace(new RegExp(BAND.source, 'g'), ' '); }
    for (const [id, re] of KIT_NAMES) if (id !== 'band' && id !== 'mini-band' && re.test(rest)) { if (!equipment.includes(id)) equipment.push(id); rest = rest.replace(new RegExp(re.source, 'g'), ' '); }
    // "without a bench": the library parser's own reading of a negation wins
    const not = lib.filters.notEquipment ?? [];
    equipment = equipment.filter((e) => !not.includes(e));
    if (equipment.length) said.equipment = true;
  }
  if (equipment.includes('band')) {
    const t = /\b(light|thin|easy|yellow)\b/.test(f) ? 'light' : /\b(heavy|thick|strong(?:est)?|black|blue)\b(?= ?(?:resistance |loop )?band)/.test(f) || /\bheavy\b/.test(f) ? 'heavy' : /\b(medium|red|green)\b/.test(f) ? 'medium' : null;
    tension = t;
    if (t) said.tension = true;
    else assumptions.push('assumption: one medium long loop band — not a mini band as well, and not a set of bands.');
    assumptions.push('assumption: the band can be fixed at chest or head height (a door anchor or a post) for rows, pulldowns and the Pallof press.');
  }
  if (!said.equipment) assumptions.push('assumption: no equipment was named, so the plan uses bodyweight only. Add what you have.');

  // goal
  const at = (re: RegExp) => { const m = re.exec(f); return m ? m.index : Infinity; };
  const hits = GOALS.filter(([, re]) => re.test(f)).sort((a, b) => at(a[1]) - at(b[1]));
  let goal: ProgramGoal = 'full-body';
  if (hits.some(([g]) => g === 'sport')) goal = 'sport';
  else if (hits.length) goal = hits[0][0];
  if (hits.length || FULL_BODY.test(f)) said.goal = true;
  else assumptions.push('assumption: no goal was named, so the plan is full body.');
  const sport = goal === 'sport' ? (SPORT_OF.find(([, re]) => re.test(f))?.[0] ?? null) : null;

  // days a week
  let days: number = DAYS.fallback;
  const dm = new RegExp(`\\b${NUMBER}\\s*(?:x|times|days?|sessions?|workouts?)\\s*(?:a|per|each|\\/|every)?\\s*(?:week|wk)\\b`).exec(f)
    ?? new RegExp(`\\b${NUMBER}\\s*(?:x|times|days?)\\b(?!\\s*(?:min|minutes?|hours?|weeks?))`).exec(f)
    ?? new RegExp(`\\b${NUMBER}\\s*x\\s*\\/?\\s*(?:week|wk)\\b`).exec(f);
  if (dm) { days = num(dm[1]); said.days = true; }
  else if (/\bevery ?day\b|\bdaily\b/.test(f)) { days = 6; said.days = true; assumptions.push('assumption: "every day" is read as 6 days, with one day off.'); }
  else if (/\bweekdays?\b/.test(f)) { days = 5; said.days = true; }
  else assumptions.push(`assumption: ${DAYS.fallback} days a week (not said).`);
  if (days > DAYS.max) { assumptions.push(`assumption: ${days} days is read as ${DAYS.max}: one day a week stays off.`); days = DAYS.max; }
  if (days < DAYS.min) { assumptions.push(`assumption: ${days} day is read as ${DAYS.min}: a program needs two days a week to move.`); days = DAYS.min; }

  // minutes a session
  let minutes: number = MINUTES.fallback;
  const mm = /\b(\d{2,3})\s*(?:-|\s)?\s*(?:min|mins|minutes?)\b/.exec(f);
  if (mm) { minutes = Number(mm[1]); said.minutes = true; }
  else if (/\b(?:half an hour|30 ?min)\b/.test(f)) { minutes = 30; said.minutes = true; }
  else if (/\b(?:an|one|1) ?(?:hour|hr)\b/.test(f)) { minutes = 60; said.minutes = true; }
  else if (/\bhour and a half\b|\b90\b/.test(f)) { minutes = 90; said.minutes = true; }
  else assumptions.push(`assumption: ${MINUTES.fallback} minutes a session (not said).`);
  minutes = Math.min(MINUTES.max, Math.max(MINUTES.min, Math.round(minutes / MINUTES.step) * MINUTES.step));

  // level
  let level: LevelId = 'beginner';
  if (/\b(advanced|experienced|years? of (?:training|lifting)|been (?:training|lifting) for years)\b/.test(f)) { level = 'advanced'; said.level = true; }
  else if (/\b(intermediate|some experience|been training|a year|trained before|not a beginner)\b/.test(f)) { level = 'intermediate'; said.level = true; }
  else if (/\b(beginners?|new to|never (?:trained|lifted|worked out)|first time|novice|just starting|starting out|haven'?t trained)\b/.test(f)) { level = 'beginner'; said.level = true; }
  else assumptions.push('assumption: beginner (level not said). One tap changes it.');

  // weeks
  let weeks = 0;
  const wm = new RegExp(`\\b${NUMBER}\\s*[- ]?\\s*(?:weeks?|wks?)\\b(?!\\s*(?:a|per)\\b)`).exec(f.replace(/\b(?:a|per|each)\s+week\b/g, ' '));
  if (wm && !/\b(?:days?|times?|x)\s*(?:a|per)?\s*$/.test(f.slice(0, wm.index))) { weeks = num(wm[1]); said.weeks = true; }
  else if (/\b(?:a|one) month\b/.test(f)) { weeks = 4; said.weeks = true; }
  else if (/\b(?:two|2) months\b/.test(f)) { weeks = 8; said.weeks = true; }
  else if (/\b(?:three|3) months\b/.test(f)) { weeks = 12; said.weeks = true; }
  if (!weeks) {
    weeks = Math.max(WEEKS.fallback, BLOCK_WEEKS[level]);
    assumptions.push(weeks === WEEKS.fallback
      ? `assumption: ${WEEKS.fallback} weeks (not said), then a checkpoint decides the next block.`
      : `assumption: ${weeks} weeks (not said): a beginner's first block builds for 4 weeks and eases in week 5, then a checkpoint decides the next block.`);
  }
  if (weeks < WEEKS.min) { assumptions.push(`assumption: ${weeks} weeks is read as ${WEEKS.min}: the shortest plan that builds and then eases.`); weeks = WEEKS.min; }
  if (weeks > WEEKS.max) { assumptions.push(`assumption: ${weeks} weeks is read as ${WEEKS.max}; after that, ask again from where you are.`); weeks = WEEKS.max; }

  // age band: the words, then the account's floor
  let age: AgeBand = 'adult';
  const am = /\b(\d{1,2})\s*(?:yo|y\/o|y o|years? old|year-old|yr old|yrs old)\b/.exec(f) ?? /\b(?:i'?m|im|i am|age|aged)\s*(\d{1,2})\b/.exec(f) ?? /\b(\d{1,2})\s*-?\s*year\b/.exec(f);
  if (am) { const n = Number(am[1]); age = n < 13 ? 'child' : n < 18 ? 'teen' : 'adult'; said.age = true; }
  else if (/\b(kid|kids|child|children|my son|my daughter|middle school|elementary)\b/.test(f)) { age = 'teen'; said.age = true; assumptions.push('assumption: no age given for a young athlete, so under-18 rules apply. Say the age if they are under 13.'); }
  else if (/\b(teen|teenager|high school|youth)\b/.test(f)) { age = 'teen'; said.age = true; }
  if (opts.youth && age === 'adult') {
    age = 'teen';
    assumptions.push("assumption: this account's age rules are under-18 rules, so the plan follows them.");
  }

  const lowLoad: Joint[] = (lib.filters.lowLoad ?? []) as Joint[];
  const request: ProgramRequest = { equipment, tension, goal, sport, days, minutes, level, weeks, age, lowLoad };
  return {
    question: q, request, said, chips: chipsFor(request, said, !!opts.youth), assumptions,
    injury: { flagged: words.length > 0, words }, wantsProgram: wantsProgram(q) || said.days === true,
  };
}

// ── chips: the read-back, one tap to change ────────────────────────────────────────────────────────────────────────

export function chipsFor(r: ProgramRequest, said: Partial<Record<RequestField, boolean>>, youthAccount: boolean): ProgramChip[] {
  const chips: ProgramChip[] = [
    {
      field: 'equipment', value: r.equipment.join(',') || 'none', label: r.equipment.length ? `Only ${kitWords(r.equipment, null)}` : 'No equipment', assumed: !said.equipment,
      options: [{ value: 'band', label: 'A band' }, { value: 'none', label: 'No equipment' }, { value: 'band,mini-band', label: 'Band and mini band' }, { value: 'dumbbell', label: 'Dumbbells' }, { value: 'band,dumbbell', label: 'Band and dumbbells' }],
    },
  ];
  if (r.equipment.includes('band')) chips.push({
    field: 'tension', value: r.tension ?? 'medium', label: TENSION_LABEL[r.tension ?? 'medium'], assumed: !said.tension,
    options: (['light', 'medium', 'heavy'] as const).map((t) => ({ value: t, label: TENSION_LABEL[t] })),
  });
  chips.push(
    {
      field: 'goal', value: r.goal, label: r.goal === 'sport' && r.sport ? `${GOAL_LABEL.sport}: ${r.sport}` : GOAL_LABEL[r.goal], assumed: !said.goal,
      options: (Object.keys(GOAL_LABEL) as ProgramGoal[]).filter((g) => g !== 'sport').map((g) => ({ value: g, label: GOAL_LABEL[g] })),
    },
    { field: 'days', value: String(r.days), label: `${r.days} days a week`, assumed: !said.days, step: { value: r.days, min: DAYS.min, max: DAYS.max, by: 1 } },
    { field: 'minutes', value: String(r.minutes), label: `${r.minutes} min`, assumed: !said.minutes, step: { value: r.minutes, min: MINUTES.min, max: MINUTES.max, by: MINUTES.step } },
    {
      field: 'level', value: r.level, label: LEVEL_LABEL[r.level], assumed: !said.level,
      options: (['beginner', 'intermediate', 'advanced'] as const).map((l) => ({ value: l, label: LEVEL_LABEL[l] })),
    },
    { field: 'weeks', value: String(r.weeks), label: `${r.weeks} weeks`, assumed: !said.weeks, step: { value: r.weeks, min: WEEKS.min, max: WEEKS.max, by: 1 } },
    {
      field: 'age', value: r.age, label: AGE_LABEL[r.age], assumed: !said.age, locked: youthAccount,
      options: (youthAccount ? (['teen', 'child'] as const) : (['adult', 'teen', 'child'] as const)).map((a) => ({ value: a, label: AGE_LABEL[a] })),
    },
  );
  return chips;
}

export type RequestEdits = Partial<Record<RequestField, string | number>>;

/**
 * The chips' edits laid over the read. Every value is checked and clamped here (the server runs this; a client cannot
 * send a value the chips do not offer). An edit to `age` can never make a youth account an adult.
 */
export function applyEdits(read: ProgramAskRead, edits: RequestEdits | null | undefined, opts: ReadOptions = {}): ProgramAskRead {
  if (!edits || typeof edits !== 'object') return read;
  const r: ProgramRequest = { ...read.request };
  const said = { ...read.said };
  const int = (v: unknown, lo: number, hi: number): number | null => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
  for (const [k, v] of Object.entries(edits)) {
    switch (k as RequestField) {
      case 'days': { const n = int(v, DAYS.min, DAYS.max); if (n !== null) { r.days = n; said.days = true; } break; }
      case 'minutes': { const n = int(v, MINUTES.min, MINUTES.max); if (n !== null) { r.minutes = Math.round(n / MINUTES.step) * MINUTES.step; said.minutes = true; } break; }
      case 'weeks': { const n = int(v, WEEKS.min, WEEKS.max); if (n !== null) { r.weeks = n; said.weeks = true; } break; }
      case 'level': if (v === 'beginner' || v === 'intermediate' || v === 'advanced') { r.level = v; said.level = true; } break;
      case 'goal': if (typeof v === 'string' && v in GOAL_LABEL) { r.goal = v as ProgramGoal; r.sport = v === 'sport' ? r.sport : null; said.goal = true; } break;
      case 'tension': if (v === 'light' || v === 'medium' || v === 'heavy') { r.tension = v; said.tension = true; } break;
      case 'age': if (v === 'adult' || v === 'teen' || v === 'child') { r.age = opts.youth && v === 'adult' ? 'teen' : v; said.age = true; } break;
      case 'equipment': {
        if (typeof v !== 'string') break;
        const ids = v === 'none' ? [] : v.split(',').map((x) => x.trim()).filter((x): x is EquipmentId => EQUIPMENT.some((e) => e.id === x));
        r.equipment = [...new Set(ids)].slice(0, 8);
        if (!r.equipment.includes('band')) r.tension = null;
        said.equipment = true;
        break;
      }
    }
  }
  const assumptions = read.assumptions.filter((a) => !Object.entries(said).some(([k, s]) => s && !read.said[k as RequestField] && assumptionField(a) === k));
  return { ...read, request: r, said, chips: chipsFor(r, said, !!opts.youth), assumptions };
}

/** Which field an assumption line is about (so an edit clears its line). */
function assumptionField(a: string): RequestField | null {
  if (/days? a week|every day|day is read/.test(a)) return 'days';
  if (/minutes a session/.test(a)) return 'minutes';
  if (/\bweeks?\b/.test(a) && !/days/.test(a)) return 'weeks';
  if (/beginner \(level/.test(a)) return 'level';
  if (/no goal/.test(a)) return 'goal';
  if (/no equipment was named/.test(a)) return 'equipment';
  if (/medium long loop band/.test(a)) return 'tension';
  return null;
}
